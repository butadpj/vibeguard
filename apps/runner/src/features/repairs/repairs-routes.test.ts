import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CheckResult, Project } from '@vibeguard/contracts';
import { createApp } from '../../app.js';
import { createJobBoard } from '../../lib/job-board.js';
import { createFileWorkspace } from '../../lib/release-workspace.js';
import { createTestClient } from '../../testing/request.js';
import { ReleaseError } from '../../lib/release-error.js';
import type { RepairHarness } from './repairs-run.js';
import type { PhaseEvidence, RepairAgent } from './repair-trial.js';
import { createAiderSandbox, defaultAiderProfile } from './aider-sandbox.js';

const draft = {
  description: 'Customer edits disappear.',
  expectedBehavior: 'Edits survive refreshing.',
  performance: null,
};
const plan = {
  cause: 'The update action only returns changed fields without saving.',
  evidence: [
    'customers.js update returns a merged object; baseline refresh lost the edit.',
  ],
  affectedFiles: ['customers.js', 'customers.test.mjs'],
  plan: 'Await a Supabase update, then return the saved row.',
  risks: 'Persistence errors must reject; preserve other CRUD.',
  tests: 'Create, edit, fresh read, delete; update failure rejects.',
};
const phase = (response = ''): PhaseEvidence => ({
  exitCode: 0,
  durationMs: 123,
  output: 'Synthetic process seam.',
  response,
  tooling: { aiderVersion: '0.86.2', modelDigest: 'fake-only' },
});
let home: string;
let project: Project;
let jobs: ReturnType<typeof createJobBoard>;
let client: ReturnType<typeof createTestClient>;
let checksDirectory: string;
let behavior:
  'normal' | 'inconclusive' | 'changed-checks' | 'changed-candidate';
let invocations: string[];
let previewCount: number;

// Coherent fake of the external Supabase client, not the application or trial orchestration.
function databaseClient() {
  const rows = new Map<string, { id: string; name: string; email: string }>();
  let sequence = 0;
  return {
    from() {
      let operation = 'read';
      let fields: Record<string, string> = {};
      let id: string | null = null;
      let single = false;
      const query = {
        select() {
          return query;
        },
        order() {
          return query;
        },
        eq(_key: string, value: string) {
          id = value;
          return query;
        },
        single() {
          single = true;
          return query;
        },
        insert(value: Record<string, string>) {
          operation = 'create';
          fields = value;
          return query;
        },
        update(value: Record<string, string>) {
          operation = 'update';
          fields = value;
          return query;
        },
        delete() {
          operation = 'delete';
          return query;
        },
        then(resolve: (value: unknown) => unknown) {
          if (operation === 'create') {
            const row = {
              id: String(++sequence),
              name: fields.name,
              email: fields.email,
            };
            rows.set(row.id, row);
          }
          if (operation === 'update' && id && rows.has(id))
            rows.set(id, { ...rows.get(id)!, ...fields });
          if (operation === 'delete' && id) rows.delete(id);
          const data = [...rows.values()]
            .filter((row) => !id || row.id === id)
            .map((row) => ({ ...row }));
          return Promise.resolve({
            data: single ? data[0] : data,
            error: null,
          }).then(resolve);
        },
      };
      return query;
    },
  };
}
async function appJourney(target: string): Promise<CheckResult[]> {
  const { createCustomerStore } = await import(
    pathToFileURL(join(target, 'customers.js')).href
  );
  const external = databaseClient();
  const store = createCustomerStore(external);
  const created = await store.create('Before', 'synthetic@example.test');
  expect((await store.list())[0]).toMatchObject(created);
  const edited = await store.update(created.id, 'After', created.email);
  expect(edited.name).toBe('After');
  const persisted = (await createCustomerStore(external).list())[0];
  await store.remove(created.id);
  expect(await createCustomerStore(external).list()).toEqual([]);
  return (['goal', 'create', 'read', 'update', 'delete'] as const).map(
    (scope) => ({
      id: scope,
      name: `${scope} journey`,
      scope,
      verdict:
        (scope === 'goal' || scope === 'update') && persisted.name !== 'After'
          ? 'failed'
          : 'passed',
      explanation:
        scope === 'update'
          ? `Fresh application read returned ${persisted.name}.`
          : 'Synthetic database seam; real application action.',
      evidence: [
        {
          id: `${scope}_evidence`,
          kind: 'observation',
          summary: `Saved name ${persisted.name}.`,
          artifactId: null,
          durationMs: null,
        },
      ],
    }),
  );
}
function fakeAgent(fixOnEdit = 1): RepairAgent {
  let edits = 0;
  return {
    async run(input) {
      invocations.push(input.phase);
      expect(input.prompt).toContain('behavioral regression');
      if (input.phase === 'diagnosis') return phase(JSON.stringify(plan));
      edits++;
      const file = join(input.targetDirectory, 'customers.js');
      let source = await readFile(file, 'utf8');
      if (edits >= fixOnEdit)
        source = source.replace(
          "const current = unwrap(await client.from('customers').select('*').eq('id', id).single());\n      return { ...current, name, email };",
          "return unwrap(await client.from('customers').update({ name, email }).eq('id', id).select().single());",
        );
      else
        source +=
          '\n// A wrong candidate; the protected journey must catch it.\n';
      await writeFile(file, source);
      await writeFile(
        join(input.targetDirectory, 'customers.test.mjs'),
        '// Synthetic agent test artifact; process execution is faked in this HTTP journey.\n',
      );
      return phase('Diff reviewed against the plan.');
    },
    async test() {
      return phase();
    },
  };
}
function compose(agent?: RepairAgent) {
  const repairHarness: RepairHarness | undefined = agent
    ? {
        agent,
        principles:
          'Design code and behavioral regression tests together; fake external seams only.',
        preview: async (input) => {
          previewCount++;
          expect(
            (await appJourney(input.workingDirectory)).every(
              (check) => check.verdict === 'passed',
            ),
          ).toBe(true);
          return {
            versionId: input.versionId,
            environmentId: 'fake_preview',
            url: 'http://127.0.0.1:4410',
          };
        },
      }
    : undefined;
  client = createTestClient(
    createApp({
      workspaceDirectory: home,
      jobs,
      repairHarness,
      prepareEnvironment: async (input) => ({
        setup: {
          status: 'ready',
          message: 'Synthetic external environment.',
          issue: null,
        },
        previews: [
          {
            versionId: input.versionId,
            environmentId: input.environmentId,
            url: 'http://127.0.0.1:4400',
          },
        ],
      }),
      goalConversation: async () => ({
        reply: 'Keep customer edits after refreshing.',
        proposedGoal: draft,
      }),
      baselineChecks: {
        checkSetId: 'crud_v1',
        run: async (input) => {
          const checks = await appJourney(input.targetDirectory);
          if (input.versionId !== project.originalVersion.id) {
            if (behavior === 'inconclusive')
              checks[0].verdict = 'could_not_check';
            if (behavior === 'changed-checks')
              await writeFile(
                join(checksDirectory, 'protected.mjs'),
                '// tampered',
              );
            if (behavior === 'changed-candidate')
              await writeFile(
                join(input.targetDirectory, 'customers.js'),
                '// tampered',
              );
          }
          return checks;
        },
      },
    }),
  );
}
async function post(path: string, body?: unknown) {
  return client.request(`/api/projects/${project.id}${path}`, {
    method: 'POST',
    headers: { 'X-VibeGuard-Request': '1', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function finish(response: Response) {
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
    sourceVersionId: project.originalVersion.id,
    goalRevisionId: project.goal!.revisionId,
    baselineVerificationId: project.baseline!.id,
  };
}
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'vibeguard-repair-http-'));
  jobs = createJobBoard();
  behavior = 'normal';
  invocations = [];
  previewCount = 0;
  compose();
  const body = new FormData();
  const zip = await readFile(
    new URL(
      '../../../../../fixtures/demo-crud/customer-tracker.zip',
      import.meta.url,
    ),
  );
  body.append('file', new Blob([new Uint8Array(zip)]), 'customer-tracker.zip');
  const response = await client.request('/api/projects', {
    method: 'POST',
    headers: { 'X-VibeGuard-Request': '1' },
    body,
  });
  expect(response.status).toBe(201);
  project = await response.json();
  await finish(await post('/prepare'));
  const conversation = await finish(
    await post('/messages', { text: 'Edits disappear after refresh.' }),
  );
  expect(
    (
      await post('/goal/confirm', {
        expectedRevisionId: conversation.result.proposedGoal.revisionId,
        goal: draft,
      })
    ).status,
  ).toBe(200);
  project = await snapshot();
  checksDirectory = join(home, 'projects', project.id, 'check-sets', 'crud_v1');
  await mkdir(checksDirectory, { recursive: true });
  await writeFile(
    join(checksDirectory, 'protected.mjs'),
    '// trusted synthetic verifier',
  );
  const baseline = await finish(
    await post('/checks', {
      versionId: project.originalVersion.id,
      goalRevisionId: project.goal!.revisionId,
    }),
  );
  expect(baseline.result.verdict).toBe('failed');
  project = await snapshot();
});
afterEach(async () => {
  async function unlock(path: string) {
    await chmod(path, 0o700);
    for (const entry of await readdir(path, { withFileTypes: true }))
      if (entry.isDirectory()) await unlock(join(path, entry.name));
  }
  await unlock(home);
  await rm(home, { recursive: true, force: true });
});

it('repairs after one failed candidate, persists checked bytes/evidence, previews and approves the exact version', async () => {
  compose(fakeAgent(2));
  const job = await finish(await post('/repairs', request()));
  expect(job).toMatchObject({
    status: 'succeeded',
    operation: 'repair',
    result: {
      outcome: 'checked',
      verification: {
        verdict: 'passed',
        checkSetId: project.baseline!.checkSetId,
      },
    },
  });
  expect(invocations).toEqual(['diagnosis', 'edit', 'diagnosis', 'edit']);
  expect(job.repairAttempts).toEqual(job.result.attempts);
  expect(job.result.attempts[0].issue.code).toBe('repair_exhausted');
  expect(job.result.attempts[1].issue).toBeNull();
  expect(previewCount).toBe(1);
  const current = await snapshot();
  const workspace = createFileWorkspace(home);
  expect(
    await workspace.versionDigest(project.id, project.originalVersion.id),
  ).toBe(project.originalVersion.contentDigest);
  expect(
    await workspace.versionDigest(project.id, current.candidateVersion!.id),
  ).toBe(current.candidateVersion!.contentDigest);
  const approval = {
    versionId: current.candidateVersion!.id,
    goalRevisionId: current.goal!.revisionId,
    verificationId: current.latestVerification!.id,
  };
  expect(
    (
      await post('/approvals', {
        ...approval,
        versionId: project.originalVersion.id,
      })
    ).status,
  ).toBe(409);
  expect((await post('/approvals', approval)).status).toBe(200);
  const repairsRoot = join(home, 'projects', project.id, 'repairs');
  const [trialId] = await readdir(repairsRoot);
  const evidence = JSON.parse(
    await readFile(
      join(repairsRoot, trialId, 'attempt-2/evidence.json'),
      'utf8',
    ),
  );
  expect(evidence).toMatchObject({
    candidateDigest: current.candidateVersion!.contentDigest,
    durationMs: expect.any(Number),
    diagnosis: { durationMs: 123 },
    verification: current.latestVerification,
  });
  compose(); // Fresh composition reads persisted state, not the old job result.
  expect(await snapshot()).toMatchObject({
    candidateVersion: current.candidateVersion,
    latestVerification: current.latestVerification,
    approval: { versionId: approval.versionId },
  });
  await writeFile(
    join(
      (await workspace.versionDirectory(project.id, approval.versionId))!,
      'customers.js',
    ),
    '// changed after checks',
  );
  expect((await post('/approvals', approval)).status).toBe(409);
});

it('reports exhausted attempts without a preview or approvable candidate', async () => {
  compose(fakeAgent(99));
  const job = await finish(await post('/repairs', request()));
  expect(job).toMatchObject({
    status: 'succeeded',
    result: {
      outcome: 'no_verified_fix',
      candidateVersion: null,
      verification: null,
    },
  });
  expect(job.repairAttempts).toHaveLength(2);
  expect(invocations).toEqual(['diagnosis', 'edit', 'diagnosis', 'edit']);
  expect(previewCount).toBe(0);
  expect(await snapshot()).toMatchObject({
    candidateVersion: null,
    latestVerification: null,
    approval: null,
  });
});

it.each([
  'malformed-diagnosis',
  'diagnosis-writes',
  'out-of-scope',
  'timeout',
] as const)(
  'records %s failures and never publishes a candidate',
  async (failure) => {
    const agent = fakeAgent();
    compose({
      ...agent,
      run: async (input) => {
        invocations.push(input.phase);
        if (failure === 'timeout')
          throw new ReleaseError(
            'timeout',
            'CPU phase exceeded the finite limit.',
          );
        if (failure === 'malformed-diagnosis')
          return phase('Unstructured speculation');
        if (failure === 'diagnosis-writes') {
          await writeFile(
            join(input.targetDirectory, 'customers.js'),
            '// forbidden diagnosis edit',
          );
          return phase(JSON.stringify(plan));
        }
        if (input.phase === 'diagnosis') return phase(JSON.stringify(plan));
        await writeFile(
          join(input.targetDirectory, 'compose.yaml'),
          'services: {}',
        );
        return phase();
      },
    });
    const job = await finish(await post('/repairs', request()));
    expect(job.result.outcome).toBe('no_verified_fix');
    expect(job.repairAttempts).toHaveLength(2);
    expect(
      job.repairAttempts.every((attempt: { issue: unknown }) => attempt.issue),
    ).toBe(true);
    expect(invocations.filter((phase) => phase === 'edit')).toHaveLength(
      failure === 'out-of-scope' ? 2 : 0,
    );
    expect(previewCount).toBe(0);
  },
);

it.each(['inconclusive', 'changed-checks', 'changed-candidate'] as const)(
  'stops after %s independent checks without a preview',
  async (failure) => {
    behavior = failure;
    compose(fakeAgent());
    const job = await finish(await post('/repairs', request()));
    expect(job.repairAttempts).toHaveLength(1);
    if (failure === 'changed-checks')
      expect(job).toMatchObject({
        status: 'failed',
        error: { code: 'version_mismatch' },
      });
    else expect(job.result.outcome).toBe('no_verified_fix');
    expect(previewCount).toBe(0);
    expect((await snapshot()).candidateVersion).toBeNull();
  },
);

it('does not launch another attempt when sandbox cleanup fails', async () => {
  compose({
    run: async () => {
      throw new ReleaseError(
        'interrupted',
        'Container cleanup could not finish.',
      );
    },
    test: async () => phase(),
  });
  const job = await finish(await post('/repairs', request()));
  expect(job.result.outcome).toBe('no_verified_fix');
  expect(job.repairAttempts).toHaveLength(1);
  expect(job.repairAttempts[0].issue.code).toBe('interrupted');
  expect(previewCount).toBe(0);
});

it('records the Docker model-start error, cleans up, and stops without another inference attempt', async () => {
  const calls: string[][] = [];
  compose(
    createAiderSandbox(
      defaultAiderProfile,
      '/offline/models',
      async (_command, args) => {
        calls.push(args);
        return {
          exitCode: args.includes('serve') ? 125 : 0,
          durationMs: 7,
          output:
            args[0] === 'info'
              ? '4'
              : args.includes('serve')
                ? 'Synthetic Docker model startup rejection'
                : 'ok',
        };
      },
    ),
  );
  const job = await finish(await post('/repairs', request()));
  expect(job.result.outcome).toBe('no_verified_fix');
  expect(job.repairAttempts).toHaveLength(1);
  expect(job.repairAttempts[0].issue.code).toBe('model_unavailable');
  const repairRoot = join(home, 'projects', project.id, 'repairs');
  const [trial] = await readdir(repairRoot);
  const evidence = JSON.parse(
    await readFile(join(repairRoot, trial, 'attempt-1/evidence.json'), 'utf8'),
  );
  expect(evidence.failureEvidence).toMatchObject({
    stage: 'model_start',
    profile: defaultAiderProfile,
    process: {
      exitCode: 125,
      durationMs: 7,
      output: 'Synthetic Docker model startup rejection',
    },
  });
  expect(calls.filter((args) => args.includes('serve'))).toHaveLength(1);
  expect(calls.some((args) => args.includes('/harness/invoke.py'))).toBe(false);
  expect(calls.slice(-3).map((args) => args.slice(0, 2))).toEqual([
    ['rm', '-f'],
    ['rm', '-f'],
    ['network', 'rm'],
  ]);
  expect(previewCount).toBe(0);
  expect(await snapshot()).toMatchObject({
    candidateVersion: null,
    latestVerification: null,
    approval: null,
  });
});

it('rejects malformed/stale requests and missing runtime configuration honestly', async () => {
  for (const body of [
    null,
    {},
    { ...request(), sourceVersionId: '../escape' },
    { ...request(), command: 'aider' },
  ])
    expect((await post('/repairs', body)).status).toBe(400);
  for (const body of [
    { ...request(), goalRevisionId: 'old' },
    { ...request(), baselineVerificationId: 'old' },
  ])
    expect((await post('/repairs', body)).status).toBe(409);
  expect(await finish(await post('/repairs', request()))).toMatchObject({
    status: 'failed',
    error: { code: 'harness_unavailable' },
  });
  expect(previewCount).toBe(0);
});

it('keeps the runner single-job while diagnosis is in progress', async () => {
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const agent = fakeAgent();
  compose({
    ...agent,
    run: async (input) => {
      if (input.phase === 'diagnosis') {
        entered();
        await gate;
      }
      return agent.run(input);
    },
  });
  const response = await post('/repairs', request());
  const { jobId } = await response.json();
  try {
    await started;
    expect((await snapshot()).activeJobId).toBe(jobId);
    expect((await post('/repairs', request())).status).toBe(409);
    expect(
      (
        await post('/checks', {
          versionId: project.originalVersion.id,
          goalRevisionId: project.goal!.revisionId,
        })
      ).status,
    ).toBe(409);
  } finally {
    release();
    await jobs.whenDone(jobId);
  }
  expect(jobs.get(jobId)?.status).toBe('succeeded');
});
