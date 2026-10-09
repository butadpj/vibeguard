import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { defaultAiderProfile } from './aider-sandbox.js';
import { startDemoTrialEnvironment } from './demo-trial-environment.js';
import type { runProcess } from './repair-process.js';

// Docker is the external seam; files and the startup/cleanup flow remain real.
it.each([false, true])(
  'preserves startup failure and cleans up after capturing diagnostics (diagnostics unavailable: %s)',
  async (diagnosticsUnavailable) => {
    const stateDirectory = await mkdtemp(join(tmpdir(), 'vg-startup-test-'));
    const calls: string[][] = [];
    const restId = 'a'.repeat(64);
    const execute: typeof runProcess = async (_command, args) => {
      calls.push(args);
      if (
        diagnosticsUnavailable &&
        (args.includes('logs') || args.includes('ps'))
      )
        throw new Error('Docker diagnostics unavailable');
      const output = args.includes('up')
        ? 'rest is unhealthy'
        : args.includes('logs')
          ? 'PostgREST service log'
          : args.includes('ps')
            ? restId
            : args[0] === 'inspect'
              ? JSON.stringify({
                  Status: 'unhealthy',
                  Log: [{ Output: 'Readiness probe failed' }],
                })
              : '';
      return { exitCode: args.includes('up') ? 1 : 0, durationMs: 1, output };
    };
    try {
      await expect(
        startDemoTrialEnvironment(
          {
            trustedFixtureDirectory: '/trusted/fixture',
            targetDirectory: '/disposable/candidate',
            stateDirectory,
            profile: defaultAiderProfile,
            port: 4410,
          },
          execute,
        ),
      ).rejects.toThrow(join(stateDirectory, 'startup-diagnostics.json'));
      const override = JSON.parse(
        await readFile(join(stateDirectory, 'compose.override.json'), 'utf8'),
      );
      expect(override.services.rest.environment.PGRST_ADMIN_SERVER_HOST).toBe(
        '127.0.0.1',
      );
      expect(override.networks.default.internal).toBe(true);
      const [uid, gid] = override.services.web.user.split(':');
      expect(override.services.web.tmpfs).toEqual([
        `/var/cache/nginx:rw,nosuid,nodev,noexec,size=16m,uid=${uid},gid=${gid},mode=0700`,
      ]);
      expect(override.services.web.volumes).toEqual([
        '/disposable/candidate:/usr/share/nginx/html:ro',
      ]);
      const startup = JSON.parse(
        await readFile(join(stateDirectory, 'startup.json'), 'utf8'),
      );
      expect(startup.output).toBe('rest is unhealthy');
      const diagnostics = JSON.parse(
        await readFile(
          join(stateDirectory, 'startup-diagnostics.json'),
          'utf8',
        ),
      );
      if (diagnosticsUnavailable) {
        expect(diagnostics.logs.error).toBe('Docker diagnostics unavailable');
      } else {
        expect(diagnostics.logs.output).toContain('PostgREST service log');
        expect(JSON.parse(diagnostics.health.output).Log[0].Output).toBe(
          'Readiness probe failed',
        );
        expect(calls.findIndex((args) => args[0] === 'inspect')).toBeLessThan(
          calls.findIndex((args) => args.includes('down')),
        );
      }
      expect(calls.at(-1)).toEqual(
        expect.arrayContaining(['down', '-v', '--remove-orphans']),
      );
    } finally {
      await rm(stateDirectory, { recursive: true, force: true });
    }
  },
);

it.each(['reachable', 'refused', 'wrong-service'])(
  'opens a checked preview through a trusted proxy, or fails without publishing a link (%s)',
  async (status) => {
    const stateDirectory = await mkdtemp(join(tmpdir(), 'vg-preview-test-'));
    const calls: string[][] = [];
    const execute: typeof runProcess = async (_command, args) => {
      calls.push(args);
      return {
        exitCode: 0,
        durationMs: 1,
        output: args.includes('ps') ? 'a'.repeat(64) : '',
      };
    };
    const request: typeof fetch = async (url, options) => {
      expect(url).toBe('http://127.0.0.1:4410/health');
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      expect(options?.redirect).toBe('error');
      if (status === 'refused') throw new TypeError('fetch failed');
      return new Response(
        status === 'reachable' ? 'web alive\n' : 'unrelated service',
      );
    };
    try {
      const started = startDemoTrialEnvironment(
        {
          trustedFixtureDirectory: '/trusted/fixture',
          targetDirectory: '/disposable/checked',
          stateDirectory,
          profile: defaultAiderProfile,
          port: 4410,
          preview: true,
        },
        execute,
        request,
      );
      if (status === 'reachable') {
        const instance = await started;
        expect(instance.url).toBe('http://127.0.0.1:4410');
        expect(calls.some((args) => args.includes('down'))).toBe(false);
        await instance.stop();
      } else {
        await expect(started).rejects.toThrow('preview is unreachable');
      }
      const config = JSON.parse(
        await readFile(join(stateDirectory, 'compose.override.json'), 'utf8'),
      );
      expect(config.networks.default.internal).toBe(true);
      expect(config.services.web.networks).toBeUndefined();
      expect(config.services.rest.networks).toBeUndefined();
      expect(config.services.preview.networks).toEqual(['default', 'preview']);
      expect(config.services.preview.ports).toEqual(['127.0.0.1:4410:8080']);
      expect(config.services.preview.volumes).toEqual([
        `${stateDirectory}/preview.nginx.conf:/preview.conf:ro`,
      ]);
      expect(config.services.preview.read_only).toBe(true);
      const proxy = await readFile(
        join(stateDirectory, 'preview.nginx.conf'),
        'utf8',
      );
      expect(proxy).toContain('proxy_pass http://web:8080;');
      expect(proxy).not.toContain('$');
      const reachability = JSON.parse(
        await readFile(
          join(stateDirectory, 'preview-reachability.json'),
          'utf8',
        ),
      );
      expect(reachability.reachable).toBe(status === 'reachable');
      expect(calls.at(-1)).toEqual(
        expect.arrayContaining(['down', '-v', '--remove-orphans']),
      );
    } finally {
      await rm(stateDirectory, { recursive: true, force: true });
    }
  },
);
