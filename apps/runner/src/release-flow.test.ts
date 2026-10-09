import assert from 'node:assert/strict';
import {
  mkdir,
  rm,
  chmod,
  cp,
  mkdtemp,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, test, expect } from 'vitest';
import { createTestClient } from './testing/request.js';
import { createJobBoard } from './lib/job-board.js';
import type { Job, Project, VerificationResult } from '@vibeguard/contracts';
import { checkedProjectExample } from '@vibeguard/contracts/examples';
import { createApp } from './app.js';
import { directoryDigest } from './lib/directory-digest.js';

// A tiny "app": its check passes only when app.js says FIXED.
const CHECK_SCRIPT = `
import { readFileSync } from 'node:fs';
const code = readFileSync(process.env.VIBEGUARD_TARGET_DIR + '/app.js', 'utf8');
const ok = code.includes('FIXED');
console.log(ok ? 'edit saved' : 'edit did not save');
process.exit(ok ? 0 : 1);
`;
const SCOPES = ['goal', 'create', 'read', 'update', 'delete'] as const;

let home: string;
let client: ReturnType<typeof createTestClient>;
let project: Project;

async function seed(): Promise<Project> {
  home = await mkdtemp(path.join(os.tmpdir(), 'vibeguard-test-'));
  const root = path.join(
    home,
    'projects',
    '00000000-0000-4000-8000-000000000001',
  );
  const original = path.join(root, 'versions', 'version_original');
  const candidate = path.join(root, 'versions', 'version_candidate');
  const checks = path.join(root, 'check-sets', 'checks_crud_v1');
  for (const folder of [original, candidate, checks]) {
    await mkdir(folder, { recursive: true });
  }
  await writeFile(path.join(original, 'app.js'), '// BUGGY\n');
  await writeFile(path.join(candidate, 'app.js'), '// FIXED\n');
  await writeFile(
    path.join(candidate, 'docker-compose.yml'),
    'services:\n  web:\n    ports:\n      - "3000:3000"\n',
  );
  await mkdir(path.join(candidate, 'node_modules'));
  await writeFile(path.join(candidate, 'node_modules', 'junk.js'), 'x');
  await writeFile(path.join(candidate, 'data.sqlite'), 'test data');
  await writeFile(path.join(checks, 'crud.mjs'), CHECK_SCRIPT);
  await writeFile(
    path.join(checks, 'checks.json'),
    JSON.stringify(
      SCOPES.map((scope) => ({
        id: `check_${scope}`,
        name: `${scope} check`,
        scope,
        command: 'node',
        args: ['crud.mjs'],
        timeoutMs: 10_000,
      })),
    ),
  );
  const seeded: Project = {
    ...structuredClone(checkedProjectExample),
    id: '00000000-0000-4000-8000-000000000001',
    originalVersion: {
      ...checkedProjectExample.originalVersion,
      contentDigest: await directoryDigest(original),
    },
    candidateVersion: {
      ...checkedProjectExample.candidateVersion,
      contentDigest: await directoryDigest(candidate),
    },
  };
  await writeFile(path.join(root, 'project.json'), JSON.stringify(seeded));
  return seeded;
}

async function api(method: string, url: string, body?: unknown, headers = {}) {
  const response = await client.request(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'X-VibeGuard-Request': '1',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = response.headers.get('content-type') ?? '';
  return {
    status: response.status,
    json: type.includes('json') ? await response.json() : null,
    bytes: type.includes('json')
      ? null
      : Buffer.from(await response.arrayBuffer()),
  };
}

async function finished(jobId: string): Promise<Job> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { json } = await api('GET', `/api/jobs/${jobId}`);
    if (json.status === 'succeeded' || json.status === 'failed') return json;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Job never finished.');
}

const approveBody = () => ({
  versionId: project.candidateVersion!.id,
  goalRevisionId: project.goal!.revisionId,
  verificationId: project.latestVerification!.id,
});

let approvalId = '';
async function ensureApproval() {
  const response = await api(
    'POST',
    `/api/projects/${project.id}/approvals`,
    approveBody(),
  );
  expect(response.status).toBe(200);
  approvalId = response.json.id;
}

describe('US5: approve a checked fix and keep its checks', () => {
  beforeEach(async () => {
    approvalId = '';
    project = await seed();
    client = createTestClient(createApp({ workspaceDirectory: home }));
  });
  afterEach(async () => {
    async function unlock(directory: string) {
      await chmod(directory, 0o700);
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.isDirectory()) await unlock(path.join(directory, entry.name));
      }
    }
    await unlock(home);
    await rm(home, { recursive: true, force: true });
  });

  test('rejects requests that do not come from the local dashboard', async () => {
    const result = await api(
      'POST',
      '/api/projects/00000000-0000-4000-8000-000000000001/approvals',
      approveBody(),
      {
        origin: 'https://evil.example',
      },
    );
    assert.equal(result.status, 403);
    assert.equal(result.json.error.code, 'invalid_request');
  });

  test('rejects malformed and unsafe input', async () => {
    const bad = await api(
      'POST',
      '/api/projects/00000000-0000-4000-8000-000000000001/approvals',
      {
        versionId: '../x',
      },
    );
    assert.equal(bad.status, 400);
    const unknown = await api(
      'POST',
      '/api/projects/nope/approvals',
      approveBody(),
    );
    assert.equal(unknown.status, 404);
  });

  test('refuses when the verification is not the one that was checked', async () => {
    const result = await api(
      'POST',
      '/api/projects/00000000-0000-4000-8000-000000000001/approvals',
      {
        ...approveBody(),
        verificationId: 'verification_baseline',
      },
    );
    assert.equal(result.status, 409);
    assert.equal(result.json.error.code, 'version_mismatch');
  });

  test('refuses when a required check did not pass', async () => {
    const file = path.join(
      home,
      'projects',
      '00000000-0000-4000-8000-000000000001',
      'project.json',
    );
    const original = await readFile(file, 'utf8');
    const failing: VerificationResult = {
      ...project.latestVerification!,
      checks: project.latestVerification!.checks.map((check) =>
        check.scope === 'update'
          ? { ...check, verdict: 'failed' as const }
          : check,
      ),
    };
    await writeFile(
      file,
      JSON.stringify({ ...project, latestVerification: failing }),
    );
    const result = await api(
      'POST',
      '/api/projects/00000000-0000-4000-8000-000000000001/approvals',
      approveBody(),
    );
    await writeFile(file, original);
    assert.equal(result.status, 409);
    assert.equal(result.json.error.code, 'conflict');
  });

  test('refuses when the code changed after the checks ran', async () => {
    const file = path.join(
      home,
      'projects',
      '00000000-0000-4000-8000-000000000001',
      'versions',
      'version_candidate',
      'app.js',
    );
    await writeFile(file, '// FIXED\n// edited later\n');
    const result = await api(
      'POST',
      '/api/projects/00000000-0000-4000-8000-000000000001/approvals',
      approveBody(),
    );
    await writeFile(file, '// FIXED\n');
    assert.equal(result.status, 409);
    assert.equal(result.json.error.code, 'version_mismatch');
  });

  test('approves the exact checked version, once', async () => {
    const result = await api(
      'POST',
      '/api/projects/00000000-0000-4000-8000-000000000001/approvals',
      approveBody(),
    );
    assert.equal(result.status, 200);
    approvalId = result.json.id;
    assert.deepEqual(
      { ...result.json, id: undefined },
      {
        id: undefined,
        projectId: '00000000-0000-4000-8000-000000000001',
        versionId: 'version_candidate',
        goalRevisionId: 'goal_confirmed',
        verificationId: 'verification_fixed',
      },
    );
    const again = await api(
      'POST',
      '/api/projects/00000000-0000-4000-8000-000000000001/approvals',
      approveBody(),
    );
    assert.equal(again.json.id, approvalId);
    const saved = JSON.parse(
      await readFile(
        path.join(
          home,
          'projects',
          '00000000-0000-4000-8000-000000000001',
          'project.json',
        ),
        'utf8',
      ),
    );
    assert.equal(saved.approval.id, approvalId);
    const kept = path.join(
      home,
      'projects',
      '00000000-0000-4000-8000-000000000001',
      'approvals',
      approvalId,
    );
    assert.ok((await stat(path.join(kept, 'approval.json'))).isFile());
    assert.ok((await stat(path.join(kept, 'checks', 'checks.json'))).isFile());
  });

  test('saves a runnable ZIP and leaves every version unchanged', async () => {
    await ensureApproval();
    const versions = path.join(
      home,
      'projects',
      '00000000-0000-4000-8000-000000000001',
      'versions',
    );
    const before = await Promise.all(
      ['version_original', 'version_candidate'].map((name) =>
        directoryDigest(path.join(versions, name)),
      ),
    );
    const start = await api(
      'POST',
      '/api/projects/00000000-0000-4000-8000-000000000001/exports',
      {
        approvalId,
        format: 'zip',
      },
    );
    assert.equal(start.status, 202);
    const job = await finished(start.json.jobId);
    assert.equal(job.status, 'succeeded');
    assert.equal(job.operation, 'export');
    const artifact = (
      job as Extract<Job, { operation: 'export'; status: 'succeeded' }>
    ).result;
    assert.equal(artifact.format, 'zip');
    assert.equal(artifact.versionId, 'version_candidate');

    const download = await api('GET', artifact.downloadUrl!);
    assert.equal(download.status, 200);
    const zip = download.bytes!;
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
    const entries = zip.readUInt16LE(zip.length - 22 + 10);
    // app.js, docker-compose.yml, 2 check files, RUN.md, manifest
    assert.equal(entries, 6);

    const after = await Promise.all(
      ['version_original', 'version_candidate'].map((name) =>
        directoryDigest(path.join(versions, name)),
      ),
    );
    assert.deepEqual(after, before);
  });

  test('saves a folder with run instructions, checks, and no test data', async () => {
    await ensureApproval();
    const start = await api(
      'POST',
      '/api/projects/00000000-0000-4000-8000-000000000001/exports',
      {
        approvalId,
        format: 'folder',
      },
    );
    const job = await finished(start.json.jobId);
    assert.equal(job.status, 'succeeded');
    const artifact = (
      job as Extract<Job, { operation: 'export'; status: 'succeeded' }>
    ).result;
    assert.equal(artifact.downloadUrl, null);
    const folder = artifact.savedLocation;
    assert.deepEqual((await readdir(folder)).sort(), [
      'RUN.md',
      'app',
      'checks',
      'vibeguard.manifest.json',
    ]);
    assert.deepEqual((await readdir(path.join(folder, 'app'))).sort(), [
      'app.js',
      'docker-compose.yml',
    ]);
    assert.match(
      await readFile(path.join(folder, 'RUN.md'), 'utf8'),
      /localhost:3000/,
    );
    const manifest = JSON.parse(
      await readFile(path.join(folder, 'vibeguard.manifest.json'), 'utf8'),
    );
    assert.equal(
      manifest.approvedDigest,
      project.candidateVersion!.contentDigest,
    );
  });

  test('export refuses an unknown approval', async () => {
    const result = await api(
      'POST',
      '/api/projects/00000000-0000-4000-8000-000000000001/exports',
      {
        approvalId: 'approval_nope',
        format: 'zip',
      },
    );
    assert.equal(result.status, 404);
  });

  test('retained checks pass on the approved version', async () => {
    await ensureApproval();
    const start = await api(
      'POST',
      '/api/projects/00000000-0000-4000-8000-000000000001/rechecks',
      {
        approvalId,
        versionId: 'version_candidate',
      },
    );
    assert.equal(start.status, 202);
    const job = await finished(start.json.jobId);
    assert.equal(job.status, 'succeeded');
    const result = (
      job as Extract<Job, { operation: 'check'; status: 'succeeded' }>
    ).result;
    assert.equal(result.verdict, 'passed');
    assert.equal(result.checks.length, 5);
  });

  test('retained checks catch the problem coming back', async () => {
    await ensureApproval();
    const start = await api(
      'POST',
      '/api/projects/00000000-0000-4000-8000-000000000001/rechecks',
      {
        approvalId,
        versionId: 'version_original',
      },
    );
    const job = await finished(start.json.jobId);
    assert.equal(job.status, 'succeeded'); // the job ran; the checks failed
    const result = (
      job as Extract<Job, { operation: 'check'; status: 'succeeded' }>
    ).result;
    assert.equal(result.verdict, 'failed');
    assert.ok(result.checks.every((check) => check.verdict === 'failed'));
    assert.match(result.checks[0].explanation, /problem came back/);
    assert.ok(result.checks[0].evidence.some((item) => item.kind === 'timing'));
  });

  test('a check that cannot run is reported, not hidden', async () => {
    await ensureApproval();
    const checks = path.join(
      home,
      'projects',
      '00000000-0000-4000-8000-000000000001',
      'approvals',
      approvalId,
      'checks',
    );
    await writeFile(path.join(checks, 'crud.mjs'), 'process.exit(2);');
    const start = await api(
      'POST',
      '/api/projects/00000000-0000-4000-8000-000000000001/rechecks',
      {
        approvalId,
        versionId: 'version_candidate',
      },
    );
    const job = await finished(start.json.jobId);
    const result = (
      job as Extract<Job, { operation: 'check'; status: 'succeeded' }>
    ).result;
    assert.equal(result.verdict, 'could_not_check');
  });

  test('recheck validates the version', async () => {
    await ensureApproval();
    const result = await api(
      'POST',
      '/api/projects/00000000-0000-4000-8000-000000000001/rechecks',
      {
        approvalId,
        versionId: 'version_missing',
      },
    );
    assert.equal(result.status, 404);
  });
  test('an imported project uses the same storage and version identity through approval and lookup', async () => {
    const fixtures = JSON.parse(
      await readFile(
        new URL('./testing/zip-fixtures.json', import.meta.url),
        'utf8',
      ),
    );
    const bytes = Buffer.from(fixtures.valid, 'base64');
    const body = new FormData();
    body.append('file', new Blob([new Uint8Array(bytes)]), 'demo.zip');
    const response = await client.request('/api/projects', {
      method: 'POST',
      headers: { 'X-VibeGuard-Request': '1' },
      body,
    });
    expect(response.status).toBe(201);
    const imported: Project = await response.json();
    const source = path.join(home, 'projects', project.id);
    const target = path.join(home, 'projects', imported.id);
    // Preparation and repair are not implemented. Seed their checked output at that external boundary.
    await cp(path.join(source, 'versions'), path.join(target, 'versions'), {
      recursive: true,
    });
    await cp(path.join(source, 'check-sets'), path.join(target, 'check-sets'), {
      recursive: true,
    });
    project = {
      ...project,
      id: imported.id,
      name: imported.name,
      originalVersion: imported.originalVersion,
      baseline: {
        ...project.baseline!,
        projectId: imported.id,
        versionId: imported.originalVersion.id,
      },
      latestVerification: {
        ...project.latestVerification!,
        projectId: imported.id,
      },
    };
    await writeFile(path.join(target, 'project.json'), JSON.stringify(project));
    await ensureApproval();
    client = createTestClient(createApp({ workspaceDirectory: home }));
    const lookup = await client.request(`/api/projects/${imported.id}`);
    expect(lookup.status).toBe(200);
    await expect(lookup.json()).resolves.toMatchObject({
      id: imported.id,
      originalVersion: imported.originalVersion,
      approval: { id: approvalId },
    });
    expect(await readFile(path.join(target, 'upload.zip'))).toEqual(bytes);
    expect(
      await readFile(path.join(target, 'original/app/src/main.ts'), 'utf8'),
    ).toBe('export const value = 1;');
    const start = await api('POST', `/api/projects/${imported.id}/exports`, {
      approvalId,
      format: 'zip',
    });
    expect(start.status).toBe(202);
    const job = await finished(start.json.jobId);
    expect(job.status).toBe('succeeded');
  });

  test('rejects overlapping jobs, frees the slot after failure, and loses jobs on fresh composition', async () => {
    await ensureApproval();
    const jobs = createJobBoard();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    client = createTestClient(
      createApp({
        workspaceDirectory: home,
        jobs,
        checkExecutor: async () => {
          await gate;
          throw new Error('Synthetic check executor failure');
        },
      }),
    );
    let jobId = '';
    try {
      const start = await api('POST', `/api/projects/${project.id}/rechecks`, {
        approvalId,
        versionId: 'version_candidate',
      });
      expect(start.status).toBe(202);
      jobId = start.json.jobId;
      const running = await api('GET', `/api/jobs/${jobId}`);
      expect(running.json).toMatchObject({
        status: 'running',
        operation: 'check',
        progress: { step: 'checking' },
      });
      const busy = await api('POST', `/api/projects/${project.id}/exports`, {
        approvalId,
        format: 'folder',
      });
      expect(busy.status).toBe(409);
      expect(busy.json).toMatchObject({ error: { code: 'conflict' } });
    } finally {
      release();
      if (jobId) await jobs.whenDone(jobId);
    }
    const failed = await api('GET', `/api/jobs/${jobId}`);
    expect(failed.json.status).toBe('failed');
    const next = await api('POST', `/api/projects/${project.id}/exports`, {
      approvalId,
      format: 'folder',
    });
    expect(next.status).toBe(202);
    expect((await jobs.whenDone(next.json.jobId))?.status).toBe('succeeded');
    client = createTestClient(createApp({ workspaceDirectory: home }));
    const lost = await api('GET', `/api/jobs/${jobId}`);
    expect(lost.status).toBe(404);
    const persisted = await api('GET', `/api/projects/${project.id}`);
    expect(persisted.status).toBe(200);
    expect(persisted.json.approval.id).toBe(approvalId);
  });
});
