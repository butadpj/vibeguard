import { afterEach, expect, it, vi } from 'vitest';
import {
  access,
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CheckResult, Project } from '@vibeguard/contracts';
import { createApp } from '../../app.js';
import { createTestClient } from '../../testing/request.js';
import { createJobBoard } from '../../lib/job-board.js';
import { createFileWorkspace } from '../../lib/release-workspace.js';
import { createDemoRuntime, type DockerCommand } from './demo-runtime.js';

const repo = fileURLToPath(new URL('../../../../..', import.meta.url));
const headers = {
  'X-VibeGuard-Request': '1',
  'Content-Type': 'application/json',
};
const draft = {
  description: 'Customer edits disappear after refreshing.',
  expectedBehavior: 'Saved customer edits survive refreshing.',
  performance: null,
};
const observations: CheckResult[] = (
  ['create', 'read', 'update', 'delete', 'goal'] as const
).map((scope) => ({
  id: scope,
  name: scope,
  scope,
  verdict: scope === 'update' || scope === 'goal' ? 'failed' : 'passed',
  explanation:
    'Synthetic Docker process output; no live database in this test.',
  evidence: [
    {
      id: `${scope}_observation`,
      kind: 'observation',
      summary:
        'Edit acknowledged but the independent saved-state read returned the old name.',
      artifactId: null,
      durationMs: null,
    },
  ],
}));
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
async function scenario(namedVolume = true) {
  const home = await mkdtemp(join(tmpdir(), 'vg-demo-runtime-test-'));
  homes.push(home);
  const calls: string[][] = [];
  const configurations: Record<string, any>[] = [];
  let baselineOutput = JSON.stringify(observations);
  let startupFails = false;
  let imagesCached = false;
  const docker: DockerCommand = async (args) => {
    calls.push(args);
    if (args[0] === 'image')
      return { exitCode: imagesCached ? 0 : 1, output: '' };
    if (args[0] === 'volume')
      return { exitCode: 0, output: '/docker-host/runner-volume' };
    if (args[0] === 'compose' && args.includes('up')) {
      configurations.push(
        JSON.parse(await readFile(args[args.indexOf('-f') + 1], 'utf8')),
      );
      return {
        exitCode: startupFails ? 1 : 0,
        output: startupFails ? 'private Docker failure' : '',
      };
    }
    if (args[0] === 'compose' && args.includes('ps'))
      return { exitCode: 0, output: 'a'.repeat(64) };
    if (args[0] === 'compose' && args.includes('port'))
      return {
        exitCode: 0,
        output: `127.0.0.1:${4400 + configurations.length}`,
      };
    if (args[0] === 'run' && args.at(-1)?.endsWith('baseline.mjs'))
      return { exitCode: 1, output: baselineOutput };
    return { exitCode: 0, output: '' };
  };
  const runtime = createDemoRuntime({
    workspaceDirectory: home,
    workspaceVolume: namedVolume ? 'test_runner-data' : undefined,
    repositoryDirectory: repo,
    docker,
  });
  await runtime.initialize();
  const jobs = createJobBoard();
  const client = createTestClient(
    createApp({
      workspaceDirectory: home,
      jobs,
      ...runtime,
      goalConversation: async () => ({
        reply: 'Synthetic model boundary.',
        proposedGoal: draft,
      }),
    }),
  );
  const form = new FormData();
  form.append(
    'file',
    new Blob([
      new Uint8Array(
        await readFile(join(repo, 'fixtures/demo-crud/customer-tracker.zip')),
      ),
    ]),
    'demo.zip',
  );
  const imported = await client.request('/api/projects', {
    method: 'POST',
    headers: { 'X-VibeGuard-Request': '1' },
    body: form,
  });
  expect(imported.status).toBe(201);
  const project: Project = await imported.json();
  async function post(path: string, body?: unknown) {
    return client.request(`/api/projects/${project.id}${path}`, {
      method: 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async function done(response: Response) {
    expect(response.status).toBe(202);
    const { jobId } = await response.json();
    await jobs.whenDone(jobId);
    return (await client.request(`/api/jobs/${jobId}`)).json();
  }
  const snapshot = async (): Promise<Project> =>
    (await client.request(`/api/projects/${project.id}`)).json();
  async function confirm(goal = draft) {
    const message = await done(
      await post('/messages', { text: 'Edits disappear.' }),
    );
    expect(
      (
        await post('/goal/confirm', {
          expectedRevisionId: message.result.proposedGoal.revisionId,
          goal,
        })
      ).status,
    ).toBe(200);
    return (await snapshot()).goal!.revisionId;
  }
  return {
    home,
    calls,
    configurations,
    runtime,
    project,
    post,
    done,
    snapshot,
    confirm,
    malformed: () => {
      baselineOutput = 'private process logs';
    },
    failStartup: () => {
      startupFails = true;
    },
    cached: () => {
      imagesCached = true;
    },
    reboot: async () => {
      const next = createDemoRuntime({
        workspaceDirectory: home,
        workspaceVolume: namedVolume ? 'test_runner-data' : undefined,
        repositoryDirectory: repo,
        docker,
      });
      await next.initialize();
      return next;
    },
  };
}
it('imports, prepares a preview, checks a separate database, persists baseline and cleans only the check environment', async () => {
  const s = await scenario();
  try {
    const prepared = await s.done(await s.post('/prepare'));
    expect(prepared).toMatchObject({
      status: 'succeeded',
      result: {
        setup: { status: 'ready' },
        previews: [
          {
            url: 'http://127.0.0.1:4401',
            versionId: s.project.originalVersion.id,
          },
        ],
      },
    });
    const goalRevisionId = await s.confirm();
    const baseline = await s.done(
      await s.post('/checks', {
        versionId: s.project.originalVersion.id,
        goalRevisionId,
      }),
    );
    expect(baseline).toMatchObject({
      status: 'succeeded',
      result: {
        verdict: 'failed',
        checks: observations,
        checkSetDigest: expect.stringMatching(/^sha256:/),
      },
    });
    expect((await s.snapshot()).baseline).toEqual(baseline.result);
    expect(
      (await createFileWorkspace(s.home).getProject(s.project.id))?.baseline,
    ).toEqual(baseline.result);
    expect(
      await createFileWorkspace(s.home).versionDigest(
        s.project.id,
        s.project.originalVersion.id,
      ),
    ).toBe(s.project.originalVersion.contentDigest);
    expect(s.configurations).toHaveLength(2);
    for (const config of s.configurations) {
      expect(config.networks.default.internal).toBe(true);
      expect(config.networks.preview).toEqual({});
      expect(config.services.web.networks).toEqual(['default', 'preview']);
      expect(config.services.web.ports).toEqual(['127.0.0.1::8080']);
      expect(config.services.db.networks).toBeUndefined();
      expect(config.services.rest.networks).toBeUndefined();
      expect(config.services.db.ports).toBeUndefined();
      expect(config.services.rest.ports).toBeUndefined();
      expect(config.services.rest.environment.PGRST_ADMIN_SERVER_HOST).toBe(
        '127.0.0.1',
      );
      const [uid, gid] = config.services.web.user.split(':');
      expect(config.services.web.read_only).toBe(true);
      expect(config.services.web.cap_drop).toEqual(['ALL']);
      expect(config.services.web.cap_add).toBeUndefined();
      expect(config.services.web.entrypoint.at(-1)).toBe(
        uid === '0'
          ? 'user root; master_process off; daemon off;'
          : 'daemon off;',
      );
      expect(config.services.web.tmpfs).toContain(
        `/var/cache/nginx:rw,nosuid,nodev,noexec,size=16m,uid=${uid},gid=${gid},mode=0700`,
      );
      expect(config.volumes.workspace).toEqual({
        external: true,
        name: 'test_runner-data',
      });
      expect(config.services.web.volumes).toEqual([
        {
          type: 'volume',
          source: 'workspace',
          target: '/usr/share/nginx/html',
          read_only: true,
          volume: {
            nocopy: true,
            subpath: expect.stringMatching(/^demo-runtime\/vg-demo-.*\/app$/),
          },
        },
      ]);
      expect(config.services.schema.volumes).toEqual([
        {
          type: 'volume',
          source: 'workspace',
          target: '/schema',
          read_only: true,
          volume: {
            nocopy: true,
            subpath: expect.stringMatching(
              /^demo-runtime\/vg-demo-.*\/trusted\/database$/,
            ),
          },
        },
      ]);
      expect(config.services.schema.command.at(-1)).toBe('/schema/schema.sql');
      expect(JSON.stringify(config)).not.toContain('docker.sock');
    }
    const ups = s.calls.filter(
      (args) => args[0] === 'compose' && args.includes('up'),
    );
    expect(ups[0][2]).not.toBe(ups[1][2]);
    expect(ups.every((args) => args.includes('never'))).toBe(true);
    expect(s.calls.filter((args) => args.includes('pull'))).toHaveLength(4); // preparation only
    const verifier = s.calls.find(
      (args) => args[0] === 'run' && args.at(-1)?.endsWith('baseline.mjs'),
    )!;
    expect(verifier).toContain('container:' + 'a'.repeat(64));
    expect(verifier.join(' ')).not.toContain('docker.sock');
    expect(verifier.join(' ')).not.toContain('/original');
    expect(verifier.join(' ')).toContain('trusted-fixture');
    expect(verifier.join(' ')).toContain('type=volume,source=test_runner-data');
    expect(verifier.join(' ')).toContain('volume-subpath=demo-runtime/');
    expect(s.calls.some((args) => args[0] === 'volume')).toBe(false);
    expect(s.calls.filter((args) => args.includes('down'))).toHaveLength(1);
    const remaining = await readdir(join(s.home, 'demo-runtime'));
    expect(remaining).toHaveLength(1);
    await expect(
      access(join(s.home, 'demo-runtime', ups[1][2])),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await s.runtime.close();
  }
  expect(await readdir(join(s.home, 'demo-runtime'))).toEqual([]);
});
it('prepares from cached images without pulling and cleans the previous preview on retry', async () => {
  const s = await scenario();
  s.cached();
  try {
    const first = await s.done(await s.post('/prepare'));
    const second = await s.done(await s.post('/prepare'));
    expect(first.status).toBe('succeeded');
    expect(second.status).toBe('succeeded');
    expect(first.result.previews[0].environmentId).not.toBe(
      second.result.previews[0].environmentId,
    );
    expect(s.calls.filter((args) => args[0] === 'pull')).toEqual([]);
    expect(s.calls.filter((args) => args.includes('down'))).toHaveLength(1);
    expect(await readdir(join(s.home, 'demo-runtime'))).toHaveLength(1);
  } finally {
    await s.runtime.close();
  }
});
it('keeps checked candidate previews separate from the original and cleans replaced candidates', async () => {
  const s = await scenario(false);
  s.cached();
  try {
    await s.done(await s.post('/prepare'));
    const workingDirectory = (await createFileWorkspace(
      s.home,
    ).versionDirectory(s.project.id, s.project.originalVersion.id))!;
    const preview = await s.runtime.candidatePreview({
      projectId: s.project.id,
      versionId: 'candidate_one',
      workingDirectory,
      report: () => {},
    });
    expect(preview).toMatchObject({
      versionId: 'candidate_one',
      url: 'http://127.0.0.1:4402',
    });
    expect(await readdir(join(s.home, 'demo-runtime'))).toHaveLength(2);
    const next = await s.runtime.candidatePreview({
      projectId: s.project.id,
      versionId: 'candidate_two',
      workingDirectory,
      report: () => {},
    });
    expect(next.environmentId).not.toBe(preview.environmentId);
    expect(s.calls.filter((args) => args.includes('down'))).toHaveLength(1);
    expect(await readdir(join(s.home, 'demo-runtime'))).toHaveLength(2);
    expect(s.calls.filter((args) => args[0] === 'pull')).toEqual([]);
  } finally {
    await s.runtime.close();
  }
  expect(await readdir(join(s.home, 'demo-runtime'))).toEqual([]);
});
it('cleans recorded environments on a new runner instance and retains imported files while invalidating old previews', async () => {
  const s = await scenario();
  await s.done(await s.post('/prepare'));
  const goalRevisionId = await s.confirm();
  await s.done(
    await s.post('/checks', {
      versionId: s.project.originalVersion.id,
      goalRevisionId,
    }),
  );
  const next = await s.reboot();
  try {
    expect(await s.snapshot()).toMatchObject({
      setup: { status: 'incomplete', issue: { code: 'setup_incomplete' } },
      previews: [],
      goal: { revisionId: goalRevisionId },
      baseline: { verdict: 'failed' },
    });
    expect(await readdir(join(s.home, 'demo-runtime'))).toEqual([]);
    expect(
      await createFileWorkspace(s.home).versionDigest(
        s.project.id,
        s.project.originalVersion.id,
      ),
    ).toBe(s.project.originalVersion.contentDigest);
  } finally {
    await next.close();
  }
});
it.each(['malformed', 'startup'] as const)(
  'does not publish a baseline after %s failure and removes partial containers',
  async (failure) => {
    const s = await scenario();
    try {
      await s.done(await s.post('/prepare'));
      const goalRevisionId = await s.confirm();
      if (failure === 'malformed') s.malformed();
      else s.failStartup();
      const job = await s.done(
        await s.post('/checks', {
          versionId: s.project.originalVersion.id,
          goalRevisionId,
        }),
      );
      expect(job).toMatchObject({ status: 'failed', result: null });
      expect(JSON.stringify(job)).not.toContain('private');
      if (failure === 'startup') {
        expect(job.error.message).toBe(
          'Docker failed during app and database startup.',
        );
        const files = await readdir(join(s.home, 'demo-diagnostics'));
        expect(files).toHaveLength(1);
        const path = join(s.home, 'demo-diagnostics', files[0]);
        expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
          exitCode: 1,
          output: 'private Docker failure',
        });
        expect((await stat(path)).mode & 0o777).toBe(0o600);
        expect(job.error.nextStep).toContain(files[0]);
      }

      expect((await s.snapshot()).baseline).toBeNull();
      expect(s.calls.filter((args) => args.includes('down'))).toHaveLength(1);
      expect(await readdir(join(s.home, 'demo-runtime'))).toHaveLength(1);
    } finally {
      await s.runtime.close();
    }
  },
);
it('reports an unrelated confirmed goal as inconclusive and refuses changed uploaded setup without launching it', async () => {
  const s = await scenario();
  try {
    await s.done(await s.post('/prepare'));
    const goalRevisionId = await s.confirm({
      ...draft,
      expectedBehavior: 'Send a payment receipt.',
    });
    const job = await s.done(
      await s.post('/checks', {
        versionId: s.project.originalVersion.id,
        goalRevisionId,
      }),
    );
    expect(
      job.result.checks.find((check: CheckResult) => check.scope === 'goal')
        .verdict,
    ).toBe('could_not_check');
    const workingDirectory = join(
      s.home,
      'demo-runtime',
      (await readdir(join(s.home, 'demo-runtime')))[0],
      'app',
    );
    await writeFile(
      join(workingDirectory, 'compose.yaml'),
      'services: { stolen: {} }',
    );
    const result = await s.runtime.prepareEnvironment({
      projectId: s.project.id,
      versionId: s.project.originalVersion.id,
      environmentId: 'test',
      workingDirectory,
      report: () => {},
    });
    expect(result.setup.status).toBe('unsupported');
    expect(s.configurations).toHaveLength(2);
  } finally {
    await s.runtime.close();
  }
});

it('keeps direct-runner bind mounts explicit and refuses Docker auto-creation of missing sources', async () => {
  const s = await scenario(false);
  s.cached();
  try {
    expect((await s.done(await s.post('/prepare'))).status).toBe('succeeded');
    const config = s.configurations[0];
    expect(config.volumes.workspace).toBeUndefined();
    expect(config.services.schema.volumes[0]).toMatchObject({
      type: 'bind',
      target: '/schema',
      read_only: true,
      bind: { create_host_path: false },
    });
    expect(config.services.web.volumes[0]).toMatchObject({
      type: 'bind',
      target: '/usr/share/nginx/html',
      read_only: true,
      bind: { create_host_path: false },
    });
    expect(config.services.schema.volumes[0].source).toMatch(
      /trusted\/database$/,
    );
    expect(s.calls.find((args) => args[0] === 'run')!.join(' ')).toContain(
      `type=bind,source=${s.home}/demo-runtime/`,
    );
  } finally {
    await s.runtime.close();
  }
});

it('starts the Dockerized root-owned preview without requesting ownership or user-switch capabilities', async () => {
  const uid = vi.spyOn(process, 'getuid').mockReturnValue(0);
  const gid = vi.spyOn(process, 'getgid').mockReturnValue(0);
  try {
    const s = await scenario();
    s.cached();
    try {
      expect((await s.done(await s.post('/prepare'))).status).toBe('succeeded');
      const web = s.configurations[0].services.web;
      expect(web.user).toBe('0:0');
      expect(web.entrypoint.at(-1)).toBe(
        'user root; master_process off; daemon off;',
      );
      expect(web.cap_drop).toEqual(['ALL']);
      expect(web.cap_add).toBeUndefined();
      expect(web.read_only).toBe(true);
    } finally {
      await s.runtime.close();
    }
  } finally {
    uid.mockRestore();
    gid.mockRestore();
  }
});
