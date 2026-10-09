import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import type { CheckResult } from '@vibeguard/contracts';
import { directoryDigest } from '../../lib/directory-digest.js';
import { runRepairTrial } from './repair-trial.js';

it('reports a rejected diagnosis and elapsed time before retrying, while preserving its evidence and source', async () => {
  const trialDirectory = await mkdtemp(join(tmpdir(), 'vg-retry-progress-'));
  const sourceDirectory = fileURLToPath(
    new URL(
      '../../../../../fixtures/demo-crud/customer-tracker',
      import.meta.url,
    ),
  );
  const checksDirectory = fileURLToPath(
    new URL('../../../../../verification/demo-crud', import.meta.url),
  );
  const sourceDigest = await directoryDigest(sourceDirectory, true);
  const messages: string[] = [];
  const prompts: string[] = [];
  // Observed model-format failure: the cause is present but the value types differ.
  const response = JSON.stringify({
    cause: 'Update does not persist.',
    evidence: [{ summary: 'The update function returns merged fields.' }],
    affectedFiles: ['customers.js'],
    plan: { description: 'Persist the edit.' },
    risks: ['Persistence failure.'],
    tests: { description: 'Edit then refresh.' },
  });
  const checks: CheckResult[] = (
    ['goal', 'create', 'read', 'update', 'delete'] as const
  ).map((scope) => ({
    id: scope,
    name: scope,
    scope,
    verdict: scope === 'goal' || scope === 'update' ? 'failed' : 'passed',
    explanation: 'Synthetic baseline from the external verifier seam.',
    evidence: [
      {
        id: scope,
        kind: 'observation',
        summary: 'Synthetic database observation.',
        artifactId: null,
        durationMs: null,
      },
    ],
  }));
  try {
    const result = await runRepairTrial({
      projectId: 'trial_project',
      sourceVersionId: 'trial_original',
      sourceDirectory,
      checksDirectory,
      trialDirectory,
      goal: {
        revisionId: 'trial_goal',
        status: 'confirmed',
        description: 'Edits disappear.',
        expectedBehavior: 'Edits survive refresh.',
        performance: null,
      },
      baseline: {
        id: 'trial_baseline',
        projectId: 'trial_project',
        versionId: 'trial_original',
        goalRevisionId: 'trial_goal',
        checkSetId: 'crud_v1',
        checkSetDigest: await directoryDigest(checksDirectory, true),
        verdict: 'failed',
        checks,
      },
      principles: 'Design code and behavioral tests together.',
      agent: {
        async run(input) {
          expect(input.phase).toBe('diagnosis');
          prompts.push(input.prompt);
          return {
            exitCode: 0,
            durationMs: 123,
            output: response,
            response,
            tooling: {},
          };
        },
        async test() {
          throw new Error('No candidate tests should run before a valid plan.');
        },
      },
      async verify() {
        throw new Error(
          'No candidate verification should run before a valid plan.',
        );
      },
      report: (progress) => messages.push(progress.message),
    });
    expect(result.directory).toBeNull();
    expect(result.attempts).toHaveLength(2);
    const failureIndex = messages.findIndex((message) =>
      /^Attempt 1 failed after \d+m \d+s: Diagnosis format invalid:/.test(
        message,
      ),
    );
    const retryIndex = messages.findIndex((message) =>
      message.startsWith('Attempt 2: diagnosing'),
    );
    expect(failureIndex).toBeGreaterThan(-1);
    expect(failureIndex).toBeLessThan(retryIndex);
    expect(prompts[1]).toContain('Diagnosis format invalid');
    for (const number of [1, 2]) {
      const evidence = JSON.parse(
        await readFile(
          join(trialDirectory, `attempt-${number}`, 'evidence.json'),
          'utf8',
        ),
      );
      expect(evidence.diagnosis.response).toBe(response);
      expect(evidence.attempt.issue.message).toContain(
        'must be nonempty strings',
      );
      expect(evidence.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(await directoryDigest(sourceDirectory, true)).toBe(sourceDigest);
  } finally {
    await rm(trialDirectory, { recursive: true, force: true });
  }
});
