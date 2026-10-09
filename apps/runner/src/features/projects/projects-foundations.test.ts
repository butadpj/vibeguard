import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Project } from '@vibeguard/contracts';
import {
  checkedProjectExample,
  approvalExample,
} from '@vibeguard/contracts/examples';
import { createApp } from '../../app.js';
import { createJobBoard } from '../../lib/job-board.js';
import { createTestClient } from '../../testing/request.js';
import { createFileWorkspace } from '../../lib/release-workspace.js';
import type { PrepareEnvironment } from './projects-prepare.js';
import type { GoalConversation } from '../goals/goals-conversation.js';

const draft = {
  description: 'Task edits disappear',
  expectedBehavior: 'A renamed task keeps its name after reload.',
  performance: null,
};
const headers = {
  'X-VibeGuard-Request': '1',
  'Content-Type': 'application/json',
};
let directory: string;
let project: Project;
let jobs: ReturnType<typeof createJobBoard>;
let client: ReturnType<typeof createTestClient>;
function compose(
  prepareEnvironment?: PrepareEnvironment,
  goalConversation?: GoalConversation,
) {
  client = createTestClient(
    createApp({
      workspaceDirectory: directory,
      jobs,
      prepareEnvironment,
      goalConversation,
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
async function snapshot() {
  const response = await client.request(`/api/projects/${project.id}`);
  expect(response.status).toBe(200);
  return response.json() as Promise<Project>;
}
async function completed(response: Response) {
  expect(response.status).toBe(202);
  const { jobId } = await response.json();
  await jobs.whenDone(jobId);
  const poll = await client.request(`/api/jobs/${jobId}`);
  expect(poll.status).toBe(200);
  return poll.json();
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'vibeguard-foundations-'));
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
  const response = await client.request('/api/projects', {
    method: 'POST',
    headers: { 'X-VibeGuard-Request': '1' },
    body,
  });
  expect(response.status).toBe(201);
  project = await response.json();
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

describe('US1/US2 backend foundations', () => {
  it('imports the checked-in customer tracker ZIP and preserves every reviewed source file', async () => {
    const fixtureRoot = new URL(
      '../../../../../fixtures/demo-crud/',
      import.meta.url,
    );
    const archive = await readFile(
      new URL('customer-tracker.zip', fixtureRoot),
    );
    const body = new FormData();
    body.append(
      'file',
      new Blob([new Uint8Array(archive)]),
      'customer-tracker.zip',
    );
    body.append('name', 'Customer tracker');
    const imported = await client.request('/api/projects', {
      method: 'POST',
      headers: { 'X-VibeGuard-Request': '1' },
      body,
    });
    expect(imported.status).toBe(201);
    const demo: Project = await imported.json();
    expect(demo).toMatchObject({
      name: 'Customer tracker',
      setup: { status: 'not_prepared' },
      previews: [],
    });
    const original = join(directory, 'projects', demo.id, 'original');
    const source = new URL('customer-tracker/', fixtureRoot);
    async function compare(relative = '') {
      for (const entry of await readdir(new URL(relative, source), {
        withFileTypes: true,
      })) {
        const child = `${relative}${entry.name}`;
        if (entry.isDirectory()) await compare(`${child}/`);
        else
          expect(await readFile(join(original, child))).toEqual(
            await readFile(new URL(child, source)),
          );
      }
    }
    await compare();
    expect(
      await readFile(join(directory, 'projects', demo.id, 'upload.zip')),
    ).toEqual(archive);
    expect(
      await createFileWorkspace(directory).versionDigest(
        demo.id,
        demo.originalVersion.id,
      ),
    ).toBe(demo.originalVersion.contentDigest);
    const snapshot = await client.request(`/api/projects/${demo.id}`);
    expect(await snapshot.json()).toMatchObject({
      id: demo.id,
      setup: { status: 'not_prepared' },
    });
  });

  it('reports missing app/model adapters through jobs without inventing readiness or replies', async () => {
    const prepared = await completed(await post('/prepare'));
    expect(prepared).toMatchObject({
      operation: 'prepare',
      status: 'failed',
      error: { code: 'setup_incomplete' },
    });
    expect(await snapshot()).toMatchObject({
      setup: { status: 'incomplete', issue: { code: 'setup_incomplete' } },
      previews: [],
      activeJobId: null,
    });
    const messaged = await completed(
      await post('/messages', { text: 'My task edit disappears.' }),
    );
    expect(messaged).toMatchObject({
      operation: 'message',
      status: 'failed',
      error: { code: 'model_unavailable' },
    });
    jobs = createJobBoard();
    compose();
    expect(await snapshot()).toMatchObject({
      goal: null,
      messages: [{ role: 'user', text: 'My task edit disappears.' }],
      setup: { status: 'incomplete' },
    });
  });

  it('prepares a writable copy, exposes active work, and persists only adapter-reported readiness', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    // Fake only app startup/readiness; the project copy and metadata stay real.
    compose(async (input) => {
      expect(
        await readFile(join(input.workingDirectory, 'app/src/main.ts'), 'utf8'),
      ).toBe('export const value = 1;');
      await writeFile(
        join(input.workingDirectory, 'app/src/main.ts'),
        'changed test copy',
      );
      entered();
      await gate;
      return {
        setup: {
          status: 'ready',
          message: 'Synthetic adapter reports app/database running.',
          issue: null,
        },
        previews: [
          {
            environmentId: input.environmentId,
            versionId: input.versionId,
            url: 'http://127.0.0.1:4400',
          },
        ],
      };
    });
    const response = await post('/prepare');
    expect(response.status).toBe(202);
    const { jobId } = await response.json();
    try {
      await started;
      expect(await snapshot()).toMatchObject({
        activeJobId: jobId,
        setup: { status: 'preparing' },
      });
      const busy = await post('/messages', { text: 'Another task' });
      expect(busy.status).toBe(409);
    } finally {
      release();
      await jobs.whenDone(jobId);
    }
    expect(jobs.get(jobId)).toMatchObject({
      status: 'succeeded',
      operation: 'prepare',
    });
    expect(await snapshot()).toMatchObject({
      activeJobId: null,
      setup: { status: 'ready' },
      previews: [{ versionId: project.originalVersion.id }],
    });
    expect(
      await readFile(
        join(directory, 'projects', project.id, 'original/app/src/main.ts'),
        'utf8',
      ),
    ).toBe('export const value = 1;');
    expect(
      await createFileWorkspace(directory).versionDigest(
        project.id,
        project.originalVersion.id,
      ),
    ).toBe(project.originalVersion.contentDigest);
  });

  it('proposes, edits and confirms a goal, rejects stale confirmation, and reloads persisted conversation', async () => {
    compose(undefined, async (input) => {
      expect(input.messages.at(-1)).toMatchObject({
        role: 'user',
        text: 'Editing tasks loses the change.',
      });
      return {
        reply: 'Should the name stay after reload?',
        proposedGoal: draft,
      };
    });
    const job = await completed(
      await post('/messages', { text: 'Editing tasks loses the change.' }),
    );
    expect(job).toMatchObject({
      status: 'succeeded',
      operation: 'message',
      result: {
        reply: { role: 'assistant' },
        proposedGoal: { status: 'proposed' },
      },
    });
    const proposed = await snapshot();
    expect(proposed.goal).toMatchObject({ status: 'proposed', ...draft });
    await writeFile(
      join(directory, 'projects', project.id, 'project.json'),
      JSON.stringify({
        ...proposed,
        baseline: checkedProjectExample.baseline,
        latestVerification: checkedProjectExample.latestVerification,
        approval: approvalExample,
      }),
    );
    const request = {
      expectedRevisionId: proposed.goal!.revisionId,
      goal: {
        ...draft,
        expectedBehavior:
          'Renaming persists after closing and reopening the app.',
      },
    };
    const response = await post('/goal/confirm', request);
    expect(response.status).toBe(200);
    const confirmed = await response.json();
    expect(confirmed).toMatchObject({
      status: 'confirmed',
      expectedBehavior: request.goal.expectedBehavior,
    });
    expect(confirmed.revisionId).not.toBe(proposed.goal!.revisionId);
    const stale = await post('/goal/confirm', request);
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: { code: 'version_mismatch' },
    });
    jobs = createJobBoard();
    compose();
    expect(await snapshot()).toMatchObject({
      goal: confirmed,
      messages: [{ role: 'user' }, { role: 'assistant' }],
      approval: null,
      latestVerification: null,
    });
  });

  it('rejects invalid inputs before starting jobs or changing history', async () => {
    for (const body of [
      { text: '' },
      { text: 'x'.repeat(4001) },
      { text: 'ok', path: '/tmp' },
    ])
      expect((await post('/messages', body)).status).toBe(400);
    expect((await post('/prepare', {})).status).toBe(400);
    expect(
      (
        await post('/goal/confirm', {
          expectedRevisionId: 'old',
          goal: {
            ...draft,
            performance: { action: 'Load tasks', maxDurationMs: -1 },
          },
        })
      ).status,
    ).toBe(400);
    const malformed = await client.request(
      `/api/projects/${project.id}/messages`,
      { method: 'POST', headers, body: '{broken' },
    );
    expect(malformed.status).toBe(400);
    expect((await snapshot()).messages).toEqual([]);
    expect(jobs.getActive()).toBeNull();
  });

  it('rejects malformed model output without persisting a proposed or confirmed goal', async () => {
    compose(undefined, async () => ({
      reply: 'Proposal',
      proposedGoal: { ...draft, performance: { action: '', maxDurationMs: 1 } },
    }));
    const job = await completed(
      await post('/messages', { text: 'Make editing work.' }),
    );
    expect(job).toMatchObject({
      status: 'failed',
      error: { code: 'model_unavailable' },
    });
    expect(await snapshot()).toMatchObject({
      goal: null,
      messages: [{ role: 'user' }],
    });
  });

  it('rejects readiness without a valid local preview', async () => {
    compose(async () => ({
      setup: { status: 'ready', message: 'Ready', issue: null },
      previews: [],
    }));
    const job = await completed(await post('/prepare'));
    expect(job).toMatchObject({
      status: 'failed',
      error: { code: 'setup_incomplete' },
    });
    expect(await snapshot()).toMatchObject({
      setup: { status: 'incomplete' },
      previews: [],
    });
  });
});
