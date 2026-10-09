import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CheckResult, Project } from '@vibeguard/contracts';
import { createApp } from '../../app.js';
import { createJobBoard } from '../../lib/job-board.js';
import { createFileWorkspace } from '../../lib/release-workspace.js';
import { createTestClient } from '../../testing/request.js';
import type { BaselineChecks } from './checks-baseline.js';

const headers = {
  'X-VibeGuard-Request': '1',
  'Content-Type': 'application/json',
};
const draft = {
  description: 'Customer edits disappear.',
  expectedBehavior: 'The edited name survives refreshing.',
  performance: null,
};
let directory: string;
let project: Project;
let jobs: ReturnType<typeof createJobBoard>;
let client: ReturnType<typeof createTestClient>;
let checksDirectory: string;
function compose(suite?: BaselineChecks) {
  client = createTestClient(
    createApp({
      workspaceDirectory: directory,
      jobs,
      baselineChecks: suite,
      prepareEnvironment: async (input) => ({
        setup: {
          status: 'ready',
          message: 'Fake external startup.',
          issue: null,
        },
        previews: [
          {
            environmentId: input.environmentId,
            versionId: input.versionId,
            url: 'http://127.0.0.1:4400',
          },
        ],
      }),
      goalConversation: async () => ({
        reply: 'Keep changes after refresh.',
        proposedGoal: draft,
      }),
    }),
  );
}
async function post(path: string, body?: unknown) {
  return client.request(`/api/projects/${project.id}${path}`, {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function completed(response: Response) {
  expect(response.status).toBe(202);
  const { jobId } = await response.json();
  await jobs.whenDone(jobId);
  return (await client.request(`/api/jobs/${jobId}`)).json();
}
async function snapshot(): Promise<Project> {
  return (await client.request(`/api/projects/${project.id}`)).json();
}
function request() {
  return {
    versionId: project.originalVersion.id,
    goalRevisionId: project.goal!.revisionId,
  };
}
function observations(
  verdict: CheckResult['verdict'] = 'failed',
): CheckResult[] {
  return (['goal', 'create', 'read', 'update', 'delete'] as const).map(
    (scope) => ({
      id: scope,
      name: `${scope} integration`,
      scope,
      verdict: scope === 'goal' || scope === 'update' ? verdict : 'passed',
      explanation:
        scope === 'update'
          ? 'Edit was acknowledged; rereading returned the old name.'
          : 'Synthetic verifier observation.',
      evidence: [
        {
          id: `${scope}_observation`,
          kind: 'observation',
          summary: 'Synthetic app/process seam output.',
          artifactId: null,
          durationMs: null,
        },
      ],
    }),
  );
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'vibeguard-baseline-test-'));
  jobs = createJobBoard();
  compose();
  const fixture = JSON.parse(
    await readFile(
      new URL('../../testing/zip-fixtures.json', import.meta.url),
      'utf8',
    ),
  );
  const body = new FormData();
  body.append(
    'file',
    new Blob([new Uint8Array(Buffer.from(fixture.valid, 'base64'))]),
    'demo.zip',
  );
  const imported = await client.request('/api/projects', {
    method: 'POST',
    headers: { 'X-VibeGuard-Request': '1' },
    body,
  });
  expect(imported.status).toBe(201);
  project = await imported.json();
  await completed(await post('/prepare'));
  const message = await completed(
    await post('/messages', {
      text: 'Customer edits disappear after refresh.',
    }),
  );
  const confirmed = await post('/goal/confirm', {
    expectedRevisionId: message.result.proposedGoal.revisionId,
    goal: draft,
  });
  expect(confirmed.status).toBe(200);
  project = await snapshot();
  checksDirectory = join(
    directory,
    'projects',
    project.id,
    'check-sets',
    'crud_v1',
  );
  await mkdir(checksDirectory, { recursive: true });
  await writeFile(
    join(checksDirectory, 'protected.mjs'),
    '// synthetic runner-owned suite',
  );
});
afterEach(async () => {
  async function unlock(path: string) {
    await chmod(path, 0o700);
    for (const entry of await readdir(path, { withFileTypes: true }))
      if (entry.isDirectory()) await unlock(join(path, entry.name));
  }
  await unlock(directory);
  await rm(directory, { recursive: true, force: true });
});

describe('baseline HTTP and evidence lifecycle', () => {
  it('checks an editable fresh copy, exposes busy progress, saves failed evidence and reloads it', async () => {
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let target = '';
    compose({
      checkSetId: 'crud_v1',
      run: async (input) => {
        target = input.targetDirectory;
        expect(input.checksDirectory).toBe(checksDirectory);
        expect(input.goal).toMatchObject({ status: 'confirmed', ...draft });
        expect(await readFile(join(target, 'app/src/main.ts'), 'utf8')).toBe(
          'export const value = 1;',
        );
        await writeFile(
          join(target, 'app/src/main.ts'),
          '// changes in test copy only',
        );
        entered();
        await gate;
        return observations();
      },
    });
    const accepted = await post('/checks', request());
    expect(accepted.status).toBe(202);
    const { jobId } = await accepted.json();
    try {
      await started;
      expect(await snapshot()).toMatchObject({
        activeJobId: jobId,
        baseline: null,
      });
      expect((await post('/checks', request())).status).toBe(409);
      expect(
        (
          await post('/goal/confirm', {
            expectedRevisionId: project.goal!.revisionId,
            goal: draft,
          })
        ).status,
      ).toBe(409);
    } finally {
      release();
      await jobs.whenDone(jobId);
    }
    const poll = await client.request(`/api/jobs/${jobId}`);
    const job = await poll.json();
    expect(job).toMatchObject({
      status: 'succeeded',
      operation: 'check',
      result: {
        ...request(),
        projectId: project.id,
        checkSetId: 'crud_v1',
        verdict: 'failed',
        checks: observations(),
      },
    });
    expect(
      await createFileWorkspace(directory).versionDigest(
        project.id,
        project.originalVersion.id,
      ),
    ).toBe(project.originalVersion.contentDigest);
    await expect(access(target)).rejects.toMatchObject({ code: 'ENOENT' });
    jobs = createJobBoard();
    compose();
    expect(await snapshot()).toMatchObject({
      activeJobId: null,
      baseline: job.result,
      candidateVersion: null,
      approval: null,
    });
  });

  it('rejects stale goals, wrong versions, unprepared apps and extra input before jobs start', async () => {
    for (const body of [
      null,
      {},
      { ...request(), versionId: '../escape' },
      { ...request(), command: 'node' },
    ])
      expect((await post('/checks', body)).status).toBe(400);
    for (const body of [
      { ...request(), versionId: 'other' },
      { ...request(), goalRevisionId: 'old' },
    ])
      expect((await post('/checks', body)).status).toBe(409);
    await writeFile(
      join(directory, 'projects', project.id, 'project.json'),
      JSON.stringify({
        ...project,
        setup: { status: 'incomplete', message: 'Not ready', issue: null },
      }),
    );
    expect((await post('/checks', request())).status).toBe(409);
    expect(jobs.getActive()).toBeNull();
    expect((await snapshot()).baseline).toBeNull();
  });

  it('fails honestly when no verifier or protected suite is installed', async () => {
    expect(await completed(await post('/checks', request()))).toMatchObject({
      status: 'failed',
      error: { code: 'check_unavailable' },
    });
    compose({
      checkSetId: 'missing',
      run: async () => {
        throw new Error('Must not launch');
      },
    });
    expect(await completed(await post('/checks', request()))).toMatchObject({
      status: 'failed',
      error: { code: 'check_unavailable' },
    });
    expect((await snapshot()).baseline).toBeNull();
  });

  it.each(['passed', 'could_not_check'] as const)(
    'persists the %s verdict separately from job completion',
    async (verdict) => {
      compose({
        checkSetId: 'crud_v1',
        run: async () => observations(verdict),
      });
      const job = await completed(await post('/checks', request()));
      expect(job).toMatchObject({ status: 'succeeded', result: { verdict } });
      expect((await snapshot()).baseline).toEqual(job.result);
    },
  );

  it('reports missing CRUD coverage as inconclusive rather than passing', async () => {
    compose({
      checkSetId: 'crud_v1',
      run: async () => observations('passed').slice(0, 1),
    });
    const job = await completed(await post('/checks', request()));
    expect(job).toMatchObject({
      status: 'succeeded',
      result: { verdict: 'could_not_check' },
    });
    expect(job.result.checks.at(-1)).toMatchObject({
      evidence: [{ summary: 'Missing checks: create, read, update, delete.' }],
    });
  });

  it.each(['malformed', 'crash', 'changed-checks', 'changed-goal'] as const)(
    'does not publish evidence after %s and cleans the test copy',
    async (failure) => {
      let target = '';
      compose({
        checkSetId: 'crud_v1',
        run: async (input) => {
          target = input.targetDirectory;
          if (failure === 'crash')
            throw new Error('Private implementation failure');
          if (failure === 'malformed')
            return [
              { ...observations()[0], verdict: 'invented' },
            ] as unknown as CheckResult[];
          if (failure === 'changed-checks')
            await writeFile(
              join(checksDirectory, 'protected.mjs'),
              '// changed',
            );
          if (failure === 'changed-goal')
            await writeFile(
              join(directory, 'projects', project.id, 'project.json'),
              JSON.stringify({
                ...project,
                goal: { ...project.goal, revisionId: 'changed' },
              }),
            );
          return observations();
        },
      });
      const job = await completed(await post('/checks', request()));
      expect(job).toMatchObject({
        status: 'failed',
        result: null,
        error: {
          code: failure.startsWith('changed')
            ? 'version_mismatch'
            : 'check_unavailable',
        },
      });
      expect(JSON.stringify(job)).not.toContain(
        'Private implementation failure',
      );
      expect((await snapshot()).baseline).toBeNull();
      await expect(access(target)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );
});
