import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ImportProjectResponse } from '@vibeguard/contracts';
import { createApp } from '../../app.js';
import { createTestClient } from '../../testing/request.js';

// Synthetic ZIPs: app/package.json and app/src/main.ts, encoded independently using Python zipfile.
const fixtures: Record<string, string> = JSON.parse(
  await readFile(
    new URL('../../testing/zip-fixtures.json', import.meta.url),
    'utf8',
  ),
);
const zip = (name = 'valid') => Buffer.from(fixtures[name], 'base64');
const writeHeaders = {
  'X-VibeGuard-Request': '1',
  Origin: 'http://localhost:5173',
};

function upload(bytes = zip(), name: string | null = 'Demo app'): RequestInit {
  const body = new FormData();
  body.append(
    'file',
    new Blob([new Uint8Array(bytes)], { type: 'application/zip' }),
    'demo.zip',
  );
  if (name !== null) body.append('name', name);
  return { method: 'POST', headers: writeHeaders, body };
}

let workspace: string;
let client: ReturnType<typeof createTestClient>;
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'vibeguard-routes-'));
  client = createTestClient(createApp({ workspaceDirectory: workspace }));
});
afterEach(async () => {
  // Production originals are read-only. Restore directory modes solely for fixture cleanup.
  async function unlock(directory: string) {
    await chmod(directory, 0o700);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) await unlock(join(directory, entry.name));
    }
  }
  await unlock(workspace);
  await rm(workspace, { recursive: true, force: true });
});

async function expectNoProjects() {
  const entries = await readdir(join(workspace, 'projects')).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  expect(entries).toEqual([]);
}
async function expectFailure(
  response: Response,
  status: number,
  code = 'invalid_request',
) {
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toMatchObject({
    error: { code, message: expect.any(String), nextStep: null },
  });
}

describe('project import and lookup', () => {
  it('imports a separate original, reloads it in a fresh app, and isolates a repeated import', async () => {
    const health = await client.request('/api/health');
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({
      status: 'ok',
      service: 'vibeguard-runner',
    });
    const response = await client.request(
      '/api/projects',
      upload(zip(), '  Demo app  '),
    );
    expect(response.status).toBe(201);
    const project: ImportProjectResponse = await response.json();
    expect(project).toMatchObject({
      id: expect.any(String),
      name: 'Demo app',
      setup: { status: 'not_prepared', issue: null },
      originalVersion: {
        id: expect.any(String),
        kind: 'original',
        parentVersionId: null,
        contentDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      candidateVersion: null,
      goal: null,
      messages: [],
      previews: [],
      baseline: null,
      latestVerification: null,
      approval: null,
      activeJobId: null,
    });
    const directory = join(workspace, 'projects', project.id);
    expect(await readFile(join(directory, 'upload.zip'))).toEqual(zip());
    expect(
      await readFile(join(directory, 'original/app/src/main.ts'), 'utf8'),
    ).toBe('export const value = 1;');
    expect(
      await readFile(join(directory, 'original/app/package.json'), 'utf8'),
    ).toBe('{"name":"demo"}');
    expect(
      (await stat(join(directory, 'original/app/src/main.ts'))).mode & 0o222,
    ).toBe(0);
    expect((await stat(join(directory, 'original/app/src'))).mode & 0o222).toBe(
      0,
    );
    expect(
      JSON.parse(await readFile(join(directory, 'project.json'), 'utf8')),
    ).toEqual(project);
    // Fresh composition has no memory of the import; lookup must use persisted metadata.
    client = createTestClient(createApp({ workspaceDirectory: workspace }));
    const lookup = await client.request(`/api/projects/${project.id}`);
    expect(lookup.status).toBe(200);
    await expect(lookup.json()).resolves.toEqual(project);
    const secondResponse = await client.request(
      '/api/projects',
      upload(zip('stored'), null),
    );
    expect(secondResponse.status).toBe(201);
    const second: ImportProjectResponse = await secondResponse.json();
    expect(second.name).toBe('Imported project');
    expect(second.id).not.toBe(project.id);
    expect(second.originalVersion.id).not.toBe(project.originalVersion.id);
    expect(second.originalVersion.contentDigest).toBe(
      project.originalVersion.contentDigest,
    );
    await expect(
      (await client.request(`/api/projects/${project.id}`)).json(),
    ).resolves.toEqual(project);
    expect(await readdir(join(workspace, 'projects'))).toEqual(
      expect.arrayContaining([project.id, second.id]),
    );
  });

  it.each([
    ['missing request header', { Origin: 'http://localhost:5173' }],
    ['foreign origin', { ...writeHeaders, Origin: 'https://evil.example' }],
    ['opaque origin', { ...writeHeaders, Origin: 'null' }],
    ['DNS rebinding host', { ...writeHeaders, Host: 'evil.example:4310' }],
    ['cross-site fetch', { ...writeHeaders, 'Sec-Fetch-Site': 'cross-site' }],
  ])('rejects %s before storing uploads', async (_name, headers) => {
    await expectFailure(
      await client.request('/api/projects', { ...upload(), headers }),
      403,
    );
    await expectNoProjects();
  });

  it('accepts a marked local CLI request without Origin', async () => {
    const response = await client.request('/api/projects', {
      ...upload(),
      headers: { 'X-VibeGuard-Request': '1' },
    });
    expect(response.status).toBe(201);
  });

  it.each(['escape', 'absolute', 'duplicate', 'collision', 'symlink'])(
    'rejects %s archives without leaving files behind',
    async (name) => {
      await expectFailure(
        await client.request('/api/projects', upload(zip(name))),
        400,
      );
      await expectNoProjects();
      expect(await readdir(workspace)).not.toContain('escape');
    },
  );

  it('rejects corrupt, encrypted, and oversized expanded content, then accepts a valid retry', async () => {
    const corrupted = zip();
    const central = corrupted.indexOf(Buffer.from('504b0102', 'hex'));
    corrupted.writeUInt32LE(0, central + 16);
    const oversized = zip();
    oversized.writeUInt32LE(101 * 1024 * 1024, central + 24);
    const encrypted = zip();
    encrypted.writeUInt16LE(1, central + 8);
    for (const bytes of [
      Buffer.from('not a zip'),
      corrupted,
      oversized,
      encrypted,
    ]) {
      await expectFailure(
        await client.request('/api/projects', upload(bytes)),
        400,
      );
      await expectNoProjects();
    }
    expect((await client.request('/api/projects', upload())).status).toBe(201);
  });

  it('validates multipart fields and upload size before publishing', async () => {
    for (const name of ['', ' ', 'x'.repeat(101), 'bad\u0000name']) {
      await expectFailure(
        await client.request('/api/projects', upload(zip(), name)),
        400,
      );
    }
    for (const field of ['file', 'name', 'unknown']) {
      const options = upload();
      (options.body as FormData).append(
        field,
        field === 'file' ? new Blob([new Uint8Array(zip())]) : 'extra',
      );
      await expectFailure(await client.request('/api/projects', options), 400);
    }
    await expectFailure(
      await client.request('/api/projects', {
        method: 'POST',
        headers: writeHeaders,
        body: new FormData(),
      }),
      400,
    );
    await expectFailure(
      await client.request('/api/projects', {
        method: 'POST',
        headers: {
          ...writeHeaders,
          'Content-Type': 'multipart/form-data; boundary=missing',
        },
        body: 'broken multipart',
      }),
      400,
    );
    await expectFailure(
      await client.request('/api/projects', {
        method: 'POST',
        headers: { ...writeHeaders, 'Content-Type': 'application/json' },
        body: '{}',
      }),
      400,
    );
    await expectFailure(
      await client.request(
        '/api/projects',
        upload(Buffer.alloc(21 * 1024 * 1024)),
      ),
      413,
    );
    await expectNoProjects();
  });

  it('returns structured not-found responses for unknown and escaped IDs', async () => {
    for (const id of [
      'not-an-id',
      '00000000-0000-4000-8000-000000000000',
      '..%2F..%2Foutside',
    ]) {
      await expectFailure(
        await client.request(`/api/projects/${id}`),
        404,
        'not_found',
      );
    }
    await expectFailure(await client.request('/api/unknown'), 404, 'not_found');
  });

  it('does not follow symlinked projects or metadata outside its managed project', async () => {
    const response = await client.request('/api/projects', upload());
    const project: ImportProjectResponse = await response.json();
    const id = '00000000-0000-4000-8000-000000000000';
    await symlink(
      join(workspace, 'projects', project.id),
      join(workspace, 'projects', id),
    );
    await expectFailure(
      await client.request(`/api/projects/${id}`),
      404,
      'not_found',
    );
    const metadata = join(workspace, 'projects', project.id, 'project.json');
    const external = join(workspace, 'outside.json');
    await writeFile(external, JSON.stringify(project));
    await rm(metadata);
    await symlink(external, metadata);
    expect((await lstat(metadata)).isSymbolicLink()).toBe(true);
    await expectFailure(
      await client.request(`/api/projects/${project.id}`),
      404,
      'not_found',
    );
  });
});
