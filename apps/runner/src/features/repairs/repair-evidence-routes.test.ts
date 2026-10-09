import { afterEach, expect, it } from 'vitest';
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  Project,
  RepairAttempt,
  VerificationResult,
} from '@vibeguard/contracts';
import { createApp } from '../../app.js';
import { createTestClient } from '../../testing/request.js';
import { directoryDigest } from '../../lib/directory-digest.js';

const headers = { 'X-VibeGuard-Request': '1' };
const homes: string[] = [];
afterEach(async () => {
  for (const home of homes.splice(0)) {
    async function unlock(path: string) {
      await chmod(path, 0o700);
      for (const entry of await readdir(path, { withFileTypes: true }))
        if (entry.isDirectory()) await unlock(join(path, entry.name));
    }
    await unlock(home);
    await rm(home, { recursive: true, force: true });
  }
});
async function scenario() {
  const home = await mkdtemp(join(tmpdir(), 'vg-repair-evidence-test-'));
  homes.push(home);
  const client = createTestClient(createApp({ workspaceDirectory: home }));
  const form = new FormData();
  form.append(
    'file',
    new Blob([
      new Uint8Array(
        await readFile(
          new URL(
            '../../../../../fixtures/demo-crud/customer-tracker.zip',
            import.meta.url,
          ),
        ),
      ),
    ]),
    'demo.zip',
  );
  const imported = await client.request('/api/projects', {
    method: 'POST',
    headers,
    body: form,
  });
  expect(imported.status).toBe(201);
  const project: Project = await imported.json();
  const root = join(home, 'projects', project.id);
  const candidate = join(root, 'versions', 'candidate_checked');
  await mkdir(join(root, 'versions'));
  await cp(join(root, 'original'), candidate, { recursive: true });
  await chmod(candidate, 0o700);
  await chmod(join(candidate, 'customers.js'), 0o600);
  await writeFile(join(candidate, 'customers.js'), '// synthetic checked fix');
  const verification: VerificationResult = {
    id: 'verification_checked',
    projectId: project.id,
    versionId: 'candidate_checked',
    goalRevisionId: 'goal_current',
    checkSetId: 'crud_v1',
    checkSetDigest: 'sha256:synthetic',
    verdict: 'passed',
    checks: (['goal', 'create', 'read', 'update', 'delete'] as const).map(
      (scope) =>
        ({
          id: scope,
          name: scope,
          scope,
          verdict: 'passed',
          explanation: 'Synthetic recorded verification.',
          evidence: [
            {
              id: `evidence_${scope}`,
              kind: 'observation',
              summary: 'Synthetic saved-state observation.',
              artifactId: null,
              durationMs: null,
              privateTooling: 'PRIVATE_INTERNAL_FIELD',
            } as any,
          ],
          privateLog: 'PRIVATE_INTERNAL_FIELD',
        }) as any,
    ),
  };
  const changes = [
    {
      file: 'customers.js',
      before: await readFile(join(root, 'original', 'customers.js'), 'utf8'),
      after: '// synthetic checked fix',
    },
  ];
  const attempt: RepairAttempt = {
    number: 2,
    sourceVersionId: project.originalVersion.id,
    candidateVersionId: 'candidate_checked',
    verificationId: verification.id,
    issue: null,
  };
  const trial = join(root, 'repairs', 'trial_recorded');
  const folder = join(trial, 'attempt-2');
  await mkdir(folder, { recursive: true });
  const record = {
    goalRevisionId: 'goal_current',
    durationMs: 123,
    attempt,
    verification,
    diff: changes,
    diagnosis: { output: 'PRIVATE_MODEL_LOG' },
    tooling: { path: '/PRIVATE_HOST_PATH' },
  };
  const evidenceFile = join(folder, 'evidence.json');
  await writeFile(evidenceFile, JSON.stringify(record));
  const snapshot: Project = {
    ...project,
    goal: {
      revisionId: 'goal_current',
      status: 'confirmed',
      description: 'Saved edits',
      expectedBehavior: 'Saved customer edits survive refreshing.',
      performance: null,
    },
    candidateVersion: {
      id: 'candidate_checked',
      parentVersionId: project.originalVersion.id,
      kind: 'candidate',
      contentDigest: await directoryDigest(candidate),
    },
    latestVerification: verification,
  };
  await writeFile(join(root, 'project.json'), JSON.stringify(snapshot));
  const get = (
    path: string,
    suppliedHeaders: Record<string, string> = headers,
  ) =>
    client.request(`/api/projects/${project.id}${path}`, {
      headers: suppliedHeaders,
    });
  return {
    home,
    root,
    candidate,
    trial,
    snapshot,
    record,
    evidenceFile,
    changes,
    client,
    get,
  };
}
it('reads persisted attempts and the exact checked diff after restart without exposing model logs or extra fields', async () => {
  const s = await scenario();
  const restarted = createTestClient(createApp({ workspaceDirectory: s.home }));
  const response = await restarted.request(
    `/api/projects/${s.snapshot.id}/repair-evidence`,
    { headers },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const body = await response.json();
  expect(body).toMatchObject({
    projectId: s.snapshot.id,
    sourceVersionId: s.snapshot.originalVersion.id,
    goalRevisionId: 'goal_current',
    attempts: [
      {
        durationMs: 123,
        attempt: { number: 2 },
        changes: s.changes,
        verification: { id: 'verification_checked', verdict: 'passed' },
      },
    ],
  });
  expect(JSON.stringify(body)).not.toContain('PRIVATE_');
  const diff = await s.get('/diffs/diff_candidate_checked');
  expect(diff.status).toBe(200);
  expect(await diff.json()).toEqual({
    artifactId: 'diff_candidate_checked',
    projectId: s.snapshot.id,
    versionId: 'candidate_checked',
    verificationId: 'verification_checked',
    changes: s.changes,
  });
  for (const path of ['/repair-evidence', '/diffs/diff_candidate_checked']) {
    expect((await s.get(path, {})).status).toBe(403);
    expect(
      (
        await s.get(path, {
          ...headers,
          Origin: 'https://external.example',
        } as any)
      ).status,
    ).toBe(403);
    expect(
      (await s.get(path, { ...headers, 'Sec-Fetch-Site': 'cross-site' } as any))
        .status,
    ).toBe(403);
  }
  expect((await s.get('/diffs/unknown')).status).toBe(404);
  expect(
    (
      await s.client.request(
        '/api/projects/other_project/diffs/diff_candidate_checked',
        { headers },
      )
    ).status,
  ).toBe(404);
});
it('shows an unsuccessful attempt as failed evidence without offering a checked diff and hides old goals', async () => {
  const s = await scenario();
  await writeFile(
    s.evidenceFile,
    JSON.stringify({
      ...s.record,
      verification: { ...s.record.verification, verdict: 'failed' },
      attempt: {
        ...s.record.attempt,
        issue: {
          code: 'repair_exhausted',
          message: 'Protected checks still fail.',
          nextStep: null,
        },
      },
    }),
  );
  await writeFile(
    join(s.root, 'project.json'),
    JSON.stringify({
      ...s.snapshot,
      candidateVersion: null,
      latestVerification: null,
    }),
  );
  const response = await s.get('/repair-evidence');
  expect(await response.json()).toMatchObject({
    attempts: [
      {
        attempt: { issue: { code: 'repair_exhausted' } },
        verification: { verdict: 'failed' },
      },
    ],
  });
  expect((await s.get('/diffs/diff_candidate_checked')).status).toBe(404);
  await writeFile(
    join(s.root, 'project.json'),
    JSON.stringify({
      ...s.snapshot,
      goal: { ...s.snapshot.goal, revisionId: 'goal_new' },
    }),
  );
  expect(await (await s.get('/repair-evidence')).json()).toMatchObject({
    goalRevisionId: 'goal_new',
    attempts: [],
  });
});
it('rejects changed candidates, corrupt evidence and symbolic-link escapes', async () => {
  const s = await scenario();
  await writeFile(
    join(s.candidate, 'customers.js'),
    '// modified after verification',
  );
  expect((await s.get('/diffs/diff_candidate_checked')).status).toBe(409);
  await writeFile(s.evidenceFile, 'broken JSON');
  expect((await s.get('/repair-evidence')).status).toBe(409);
  await rm(s.evidenceFile);
  const outside = join(s.home, 'private-evidence.json');
  await writeFile(outside, JSON.stringify(s.record));
  await symlink(outside, s.evidenceFile);
  const escaped = await s.get('/repair-evidence');
  expect(escaped.status).toBe(404);
  expect(await escaped.text()).not.toContain('PRIVATE_');
});
