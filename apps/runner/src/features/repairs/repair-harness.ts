import { enrichEvent } from '../../lib/logging.js';
import { ReleaseError } from '../../lib/release-error.js';
import {
  createAiderSandbox,
  defaultAiderProfile,
  defaultOpenRouterProfile,
  validateProfile,
  type AiderProfile,
} from './aider-sandbox.js';
import type { runProcess } from './repair-process.js';
import type { RepairHarness } from './repairs-run.js';

export function selectRepairProfile(
  environment: NodeJS.ProcessEnv,
  configured?: AiderProfile,
): AiderProfile {
  if (configured !== undefined) validateProfile(configured);
  const provider =
    environment.VIBEGUARD_REPAIR_PROVIDER ?? configured?.provider ?? 'ollama';
  if (!['ollama', 'openrouter'].includes(provider))
    throw new ReleaseError(
      'invalid_request',
      'Choose ollama or openrouter for VIBEGUARD_REPAIR_PROVIDER.',
    );
  if (configured && (configured.provider ?? 'ollama') !== provider)
    throw new ReleaseError(
      'invalid_request',
      'The repair profile and selected provider disagree.',
    );
  const profile = {
    ...(configured ??
      (provider === 'openrouter'
        ? defaultOpenRouterProfile
        : defaultAiderProfile)),
  };
  const model =
    provider === 'openrouter'
      ? environment.VIBEGUARD_CLOUD_MODEL
      : environment.VIBEGUARD_LOCAL_MODEL;
  if (model) profile.model = model;
  validateProfile(profile);
  return profile;
}

/** Share the qualified standalone adapter with runner repair jobs. */
export function createRepairHarness(options: {
  principles: string;
  preview: RepairHarness['preview'];
  modelsDirectory?: string | null;
  profile?: AiderProfile;
  execute?: typeof runProcess;
  cloudApiKey?: string;
  workspaceVolume?: string;
  workspaceDirectory?: string;
}): RepairHarness {
  if (options.workspaceVolume && !options.workspaceDirectory)
    throw new ReleaseError(
      'setup_incomplete',
      'The repair harness needs its managed workspace directory.',
      'Configure the runner workspace alongside its Docker volume.',
    );
  if (!options.principles.trim())
    throw new ReleaseError(
      'harness_unavailable',
      'The runner repair principles are missing.',
    );
  const profile = options.profile ?? defaultAiderProfile;
  const agent = createAiderSandbox(
    options.profile ?? defaultAiderProfile,
    options.modelsDirectory ?? null,
    options.execute,
    options.cloudApiKey,
    options.workspaceVolume
      ? {
          workspaceVolume: options.workspaceVolume,
          workspaceDirectory: options.workspaceDirectory!,
        }
      : undefined,
  );
  return {
    principles: options.principles,
    preview: options.preview,
    agent: {
      async run(input) {
        enrichEvent({
          repair_provider: profile.provider ?? 'ollama',
          repair_model: profile.model,
          repair_phase: input.phase,
        });
        const result = await agent.run(input);
        enrichEvent({
          repair_exit_code: result.exitCode,
          repair_phase_duration_ms: result.durationMs,
        });
        return result;
      },
      async test(directory) {
        enrichEvent({ repair_phase: 'supplemental_test' });
        const result = await agent.test(directory);
        enrichEvent({
          repair_exit_code: result.exitCode,
          repair_phase_duration_ms: result.durationMs,
        });
        return result;
      },
    },
  };
}
