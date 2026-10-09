import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { directoryDigest } from '../../lib/directory-digest.js';
import { validateChecks } from '../checks/checks-baseline.js';
import { defaultAiderProfile } from './aider-sandbox.js';
import { startDemoTrialEnvironment } from './demo-trial-environment.js';
import { checkVerdict, type TrialResult } from './repair-trial.js';

// Reopen saved proof without another model request or another repair attempt.
const root = resolve(process.argv[2] ?? '.');
if (!process.argv[3])
  throw new Error('Supply the printed trial evidence directory.');
const trialDirectory = resolve(process.argv[3]);
const result: TrialResult = JSON.parse(
  await readFile(join(trialDirectory, 'result.json'), 'utf8'),
);
if (
  !result.directory ||
  !/^attempts\/attempt-[12]\/frozen$/.test(
    relative(trialDirectory, result.directory),
  ) ||
  !result.verification ||
  result.verification.verdict !== 'passed' ||
  checkVerdict(validateChecks(result.verification.checks)) !== 'passed' ||
  result.verification.checkSetDigest !==
    (await directoryDigest(join(root, 'verification/demo-crud'), true)) ||
  result.digest !== (await directoryDigest(result.directory))
)
  throw new Error(
    'The saved candidate or protected checks no longer match passing trial evidence. Run a new trial.',
  );
const fixture = join(root, 'fixtures/demo-crud/customer-tracker');
const stateDirectory = join(trialDirectory, `preview-${randomUUID()}`);
const preview = await startDemoTrialEnvironment({
  trustedFixtureDirectory: fixture,
  targetDirectory: result.directory,
  stateDirectory,
  profile: defaultAiderProfile,
  port: Number(process.env.VIBEGUARD_TRIAL_PORT ?? 4410),
  preview: true,
});
if (result.digest !== (await directoryDigest(result.directory))) {
  await preview.stop();
  throw new Error(
    'The candidate changed while starting its preview. Run a new trial.',
  );
}
console.log(`Founder preview: ${preview.url}`);
console.log(
  `Checked digest: ${result.digest}. Try edit/refresh, create, and delete. Human QA is still required.`,
);
console.log(
  `Cleanup: docker compose --project-directory ${fixture} -p ${preview.name} -f ${join(fixture, 'compose.yaml')} -f ${join(stateDirectory, 'compose.override.json')} down -v`,
);
