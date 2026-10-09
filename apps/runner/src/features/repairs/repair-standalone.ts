import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Goal, VerificationResult } from '@vibeguard/contracts';
import { directoryDigest } from '../../lib/directory-digest.js';
import { copyEditableDirectory } from '../../lib/editable-copy.js';
import {
  createAiderSandbox,
  defaultAiderProfile,
  defaultOpenRouterProfile,
  validateProfile,
} from './aider-sandbox.js';
import { runRepairTrial, checkVerdict } from './repair-trial.js';
import { startDemoTrialEnvironment } from './demo-trial-environment.js';

const root = resolve(process.argv[2] ?? '.');
const models = process.env.VIBEGUARD_MODELS_DIRECTORY;
const profile = process.env.VIBEGUARD_REPAIR_PROFILE
  ? JSON.parse(await readFile(process.env.VIBEGUARD_REPAIR_PROFILE, 'utf8'))
  : process.argv.includes('--openrouter')
    ? {
        ...defaultOpenRouterProfile,
        model:
          process.env.VIBEGUARD_CLOUD_MODEL ?? defaultOpenRouterProfile.model,
      }
    : defaultAiderProfile;
validateProfile(profile);
if (process.argv.includes('--openrouter') && profile.provider !== 'openrouter')
  throw new Error(
    'The selected profile is local. Unset VIBEGUARD_REPAIR_PROFILE to use --openrouter defaults.',
  );
const agent = createAiderSandbox(
  profile,
  models ? resolve(models) : null,
  undefined,
  profile.provider === 'openrouter'
    ? process.env.OPENROUTER_API_KEY
    : undefined,
);
const port = Number(process.env.VIBEGUARD_TRIAL_PORT ?? 4410);
const trialDirectory = await mkdtemp(join(tmpdir(), 'vibeguard-repair-proof-'));
console.log(`Trial evidence: ${trialDirectory}`);
console.log(
  profile.provider === 'openrouter'
    ? `Cloud debug trial: OpenRouter / ${profile.model}. This run requires internet access.`
    : 'Offline trial: CPU Ollama.',
);
const fixture = join(root, 'fixtures/demo-crud/customer-tracker');
const source = join(trialDirectory, 'source');
const checksDirectory = join(root, 'verification/demo-crud');
await copyEditableDirectory(fixture, source);
const sourceDigest = await directoryDigest(source, true);
const fixtureDigest = await directoryDigest(fixture, true);
const goal: Extract<Goal, { status: 'confirmed' }> = {
  revisionId: 'trial_goal',
  status: 'confirmed',
  description: 'Customer edits disappear after refreshing.',
  expectedBehavior: 'Saved customer edits survive refreshing.',
  performance: null,
};
const environment = (
  targetDirectory: string,
  stateDirectory: string,
  preview = false,
) =>
  startDemoTrialEnvironment({
    trustedFixtureDirectory: fixture,
    targetDirectory,
    stateDirectory,
    profile,
    port,
    preview,
  });
let sequence = 0;
async function verify(targetDirectory: string) {
  const instance = await environment(
    targetDirectory,
    join(trialDirectory, `database-${++sequence}`),
  );
  try {
    return await instance.check(checksDirectory);
  } finally {
    await instance.stop();
  }
}
try {
  // This gate runs before any Aider invocation. Setup failure is not reproduction.
  const baselineChecks = await verify(source);
  const baseline: VerificationResult = {
    id: 'trial_baseline',
    projectId: 'trial_project',
    versionId: 'trial_original',
    goalRevisionId: goal.revisionId,
    checkSetId: 'demo_crud_v1',
    checkSetDigest: await directoryDigest(checksDirectory, true),
    verdict: checkVerdict(baselineChecks),
    checks: baselineChecks,
  };
  await writeFile(
    join(trialDirectory, 'baseline.json'),
    JSON.stringify(baseline, null, 2),
  );
  if (
    baseline.verdict !== 'failed' ||
    baselineChecks.some((check) => check.verdict === 'could_not_check') ||
    !['goal', 'update'].every((scope) =>
      baselineChecks.some(
        (check) => check.scope === scope && check.verdict === 'failed',
      ),
    ) ||
    !['create', 'read', 'delete'].every((scope) =>
      baselineChecks.some(
        (check) => check.scope === scope && check.verdict === 'passed',
      ),
    )
  )
    throw new Error(
      'Baseline did not reproduce the lost-edit bug with working neighboring CRUD. No repair started.',
    );
  const principles = await readFile(
    join(root, 'harness/principles.md'),
    'utf8',
  );
  const result = await runRepairTrial({
    projectId: baseline.projectId,
    sourceVersionId: baseline.versionId,
    sourceDirectory: source,
    checksDirectory,
    goal,
    baseline,
    trialDirectory: join(trialDirectory, 'attempts'),
    principles,
    agent,
    verify,
    report: (progress) => console.log(progress.message),
  });
  await writeFile(
    join(trialDirectory, 'result.json'),
    JSON.stringify(result, null, 2),
  );
  if (!result.directory) {
    for (const attempt of result.attempts) {
      if (!attempt.issue) continue;
      console.error(`Attempt ${attempt.number}: ${attempt.issue.message}`);
      const evidencePath = join(
        trialDirectory,
        'attempts',
        `attempt-${attempt.number}`,
        'evidence.json',
      );
      const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
      const startup = evidence.failureEvidence;
      if (
        ['model_start', 'network_start', 'provider_request'].includes(
          startup?.stage,
        ) &&
        typeof startup?.process?.output === 'string'
      )
        console.error(startup.process.output.trim().slice(-2000));
      console.error(`Details: ${evidencePath}`);
    }
    console.log(result.summary);
    process.exitCode = 1;
  } else {
    const preview = await environment(
      result.directory,
      join(trialDirectory, 'preview'),
      true,
    );
    console.log(
      `Protected integration checks passed. Founder preview: ${preview.url}`,
    );
    console.log(
      `Checked digest: ${result.digest}. Try edit/refresh, create, and delete. Human QA is still required.`,
    );
    console.log(
      `Cleanup: docker compose --project-directory ${fixture} -p ${preview.name} -f ${join(fixture, 'compose.yaml')} -f ${join(trialDirectory, 'preview/compose.override.json')} down -v`,
    );
  }
} catch (error) {
  await writeFile(
    join(trialDirectory, 'blocker.json'),
    JSON.stringify({ message: (error as Error).message, profile }, null, 2),
  );
  console.error((error as Error).message);
  process.exitCode = 2;
} finally {
  if (
    (await directoryDigest(fixture, true)) !== fixtureDigest ||
    (await directoryDigest(source, true)) !== sourceDigest
  )
    throw new Error(
      'The trusted fixture or baseline source changed. Discard this proof.',
    );
}
