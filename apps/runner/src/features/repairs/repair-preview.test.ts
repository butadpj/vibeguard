import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { directoryDigest } from '../../lib/directory-digest.js';
import { runProcess } from './repair-process.js';

it.each(['candidate', 'protected checks'])(
  'refuses to reopen saved proof after %s change, before starting Docker or requesting inference',
  async (changed) => {
    const root = await mkdtemp(join(tmpdir(), 'vg-preview-proof-test-'));
    const trial = join(root, 'trial');
    const candidate = join(trial, 'attempts/attempt-1/frozen');
    const suite = join(root, 'verification/demo-crud');
    await mkdir(candidate, { recursive: true });
    await mkdir(suite, { recursive: true });
    await writeFile(join(candidate, 'customers.js'), 'checked candidate');
    await writeFile(join(suite, 'baseline.mjs'), 'protected checks');
    try {
      await writeFile(
        join(trial, 'result.json'),
        JSON.stringify({
          directory: candidate,
          digest: await directoryDigest(candidate),
          verification: {
            verdict: 'passed',
            checkSetDigest: await directoryDigest(suite, true),
            checks: ['goal', 'create', 'read', 'update', 'delete'].map(
              (scope) => ({
                id: scope,
                name: scope,
                scope,
                verdict: 'passed',
                explanation: 'Saved application behavior agrees.',
                evidence: [
                  {
                    id: `${scope}_evidence`,
                    kind: 'observation',
                    summary: 'Independently read persisted state.',
                    artifactId: null,
                    durationMs: null,
                  },
                ],
              }),
            ),
          },
        }),
      );
      await writeFile(
        changed === 'candidate'
          ? join(candidate, 'customers.js')
          : join(suite, 'baseline.mjs'),
        'changed after verification',
      );
      const result = await runProcess(
        process.execPath,
        [
          '--import',
          resolve('node_modules/tsx/dist/loader.mjs'),
          resolve('src/features/repairs/repair-preview.ts'),
          root,
          trial,
        ],
        10_000,
        // No Docker executable and no provider credentials are available to this CLI.
        { env: { PATH: root } },
      );
      expect(result.exitCode).not.toBe(0);
      expect(result.output).toContain('no longer match passing trial evidence');
      expect(result.output).not.toContain('Founder preview:');
      expect(result.output).not.toContain('docker could not start');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
