import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
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
let base: string;
let close: () => void;
let project: Project;

async function seed(): Promise<Project> {
  home = await mkdtemp(path.join(os.tmpdir(), 'vibeguard-test-'));
  const root = path.join(home, 'projects', 'project_demo');
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
    ...checkedProjectExample,
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
  const response = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
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

describe('US5: approve a checked fix and keep its checks', () => {
  before(async () => {
    project = await seed();
    const server = createApp({ home }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });
  after(() => close());

  test('rejects requests that do not come from the local dashboard', async () => {
    const result = await api(
      'POST',
      '/api/projects/project_demo/approvals',
      approveBody(),
      {
        origin: 'https://evil.example',
      },
    );
    assert.equal(result.status, 403);
    assert.equal(result.json.error.code, 'invalid_request');
  });

  test('rejects malformed and unsafe input', async () => {
    const bad = await api('POST', '/api/projects/project_demo/approvals', {
      versionId: '../x',
    });
    assert.equal(bad.status, 400);
    const unknown = await api(
      'POST',
      '/api/projects/nope/approvals',
      approveBody(),
    );
    assert.equal(unknown.status, 404);
  });

  test('refuses when the verification is not the one that was checked', async () => {
    const result = await api('POST', '/api/projects/project_demo/approvals', {
      ...approveBody(),
      verificationId: 'verification_baseline',
    });
    assert.equal(result.status, 409);
    assert.equal(result.json.error.code, 'version_mismatch');
  });

  test('refuses when a required check did not pass', async () => {
    const file = path.join(home, 'projects', 'project_demo', 'project.json');
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
      '/api/projects/project_demo/approvals',
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
      'project_demo',
      'versions',
      'version_candidate',
      'app.js',
    );
    await writeFile(file, '// FIXED\n// edited later\n');
    const result = await api(
      'POST',
      '/api/projects/project_demo/approvals',
      approveBody(),
    );
    await writeFile(file, '// FIXED\n');
    assert.equal(result.status, 409);
    assert.equal(result.json.error.code, 'version_mismatch');
  });

  let approvalId = '';
  test('approves the exact checked version, once', async () => {
    const result = await api(
      'POST',
      '/api/projects/project_demo/approvals',
      approveBody(),
    );
    assert.equal(result.status, 200);
    approvalId = result.json.id;
    assert.deepEqual(
      { ...result.json, id: undefined },
      {
        id: undefined,
        projectId: 'project_demo',
        versionId: 'version_candidate',
        goalRevisionId: 'goal_confirmed',
        verificationId: 'verification_fixed',
      },
    );
    const again = await api(
      'POST',
      '/api/projects/project_demo/approvals',
      approveBody(),
    );
    assert.equal(again.json.id, approvalId);
    const saved = JSON.parse(
      await readFile(
        path.join(home, 'projects', 'project_demo', 'project.json'),
        'utf8',
      ),
    );
    assert.equal(saved.approval.id, approvalId);
    const kept = path.join(
      home,
      'projects',
      'project_demo',
      'approvals',
      approvalId,
    );
    assert.ok((await stat(path.join(kept, 'approval.json'))).isFile());
    assert.ok((await stat(path.join(kept, 'checks', 'checks.json'))).isFile());
  });

  test('saves a runnable ZIP and leaves every version unchanged', async () => {
    const versions = path.join(home, 'projects', 'project_demo', 'versions');
    const before = await Promise.all(
      ['version_original', 'version_candidate'].map((name) =>
        directoryDigest(path.join(versions, name)),
      ),
    );
    const start = await api('POST', '/api/projects/project_demo/exports', {
      approvalId,
      format: 'zip',
    });
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
    const start = await api('POST', '/api/projects/project_demo/exports', {
      approvalId,
      format: 'folder',
    });
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
    const result = await api('POST', '/api/projects/project_demo/exports', {
      approvalId: 'approval_nope',
      format: 'zip',
    });
    assert.equal(result.status, 404);
  });

  test('retained checks pass on the approved version', async () => {
    const start = await api('POST', '/api/projects/project_demo/rechecks', {
      approvalId,
      versionId: 'version_candidate',
    });
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
    const start = await api('POST', '/api/projects/project_demo/rechecks', {
      approvalId,
      versionId: 'version_original',
    });
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
    const checks = path.join(
      home,
      'projects',
      'project_demo',
      'approvals',
      approvalId,
      'checks',
    );
    await writeFile(path.join(checks, 'crud.mjs'), 'process.exit(2);');
    const start = await api('POST', '/api/projects/project_demo/rechecks', {
      approvalId,
      versionId: 'version_candidate',
    });
    const job = await finished(start.json.jobId);
    const result = (
      job as Extract<Job, { operation: 'check'; status: 'succeeded' }>
    ).result;
    assert.equal(result.verdict, 'could_not_check');
  });

  test('recheck validates the version', async () => {
    const result = await api('POST', '/api/projects/project_demo/rechecks', {
      approvalId,
      versionId: 'version_missing',
    });
    assert.equal(result.status, 404);
  });
});
