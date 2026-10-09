import { randomUUID } from 'node:crypto';
import { join, isAbsolute, relative } from 'node:path';
import { isInside, isSafeId } from '../../lib/confined-path.js';
import { runProcess } from './repair-process.js';
import type { PhaseEvidence, RepairAgent } from './repair-trial.js';
import { editScope } from './repair-trial.js';
import { ReleaseError } from '../../lib/release-error.js';

export interface AiderProfile {
  /** Cloud mode is an explicit debug opt-in; omitted means offline Ollama. */
  provider?: 'openrouter';
  aiderImage: string;
  ollamaImage: string;
  nodeImage: string;
  aiderVersion: string;
  ollamaVersion: string;
  model: string;
  /** Pin a qualified digest; otherwise discover once and keep it for this adapter. */
  modelDigest?: string;
  contextTokens: number;
  outputTokens: number;
  editFormat: 'diff' | 'whole';
  phaseTimeoutMs: number;
  startupTimeoutMs: number;
  testTimeoutMs: number;
  memory: string;
  /** Maximum per container; capped at the Docker daemon's available CPU count. */
  cpus: number;
}
export const defaultAiderProfile: AiderProfile = {
  aiderImage: 'vibeguard-aider:0.86.2',
  ollamaImage: 'ollama/ollama:0.40.2',
  nodeImage: 'node:22.14.0-bookworm-slim',
  aiderVersion: '0.86.2',
  ollamaVersion: '0.40.2',
  model: 'qwen2.5-coder:7b',
  contextTokens: 8192,
  outputTokens: 2048,
  editFormat: 'diff',
  phaseTimeoutMs: 30 * 60_000,
  startupTimeoutMs: 180_000,
  testTimeoutMs: 60_000,
  memory: '8g',
  cpus: 4,
};
export const defaultOpenRouterProfile: AiderProfile = {
  ...defaultAiderProfile,
  provider: 'openrouter',
  model: 'anthropic/claude-sonnet-5.5',
  contextTokens: 32768,
  outputTokens: 4096,
  phaseTimeoutMs: 5 * 60_000,
};
export function validateProfile(profile: AiderProfile) {
  if (
    !profile ||
    (profile.provider !== undefined && profile.provider !== 'openrouter') ||
    (profile.provider === 'openrouter' && profile.modelDigest !== undefined) ||
    [
      'aiderImage',
      'ollamaImage',
      'nodeImage',
      'aiderVersion',
      'ollamaVersion',
      'model',
      'memory',
    ].some(
      (key) =>
        typeof profile[key as keyof AiderProfile] !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_.:/@-]*$/.test(
          profile[key as keyof AiderProfile] as string,
        ),
    ) ||
    !['diff', 'whole'].includes(profile.editFormat) ||
    !Number.isInteger(profile.contextTokens) ||
    profile.contextTokens < 1024 ||
    profile.contextTokens > 32768 ||
    !Number.isInteger(profile.outputTokens) ||
    profile.outputTokens < 256 ||
    profile.outputTokens >= profile.contextTokens ||
    ['phaseTimeoutMs', 'startupTimeoutMs', 'testTimeoutMs'].some(
      (key) =>
        !Number.isInteger(profile[key as keyof AiderProfile]) ||
        Number(profile[key as keyof AiderProfile]) < 1000 ||
        Number(profile[key as keyof AiderProfile]) > 3600000,
    ) ||
    !Number.isFinite(profile.cpus) ||
    profile.cpus < 1 ||
    profile.cpus > 32 ||
    (profile.modelDigest !== undefined &&
      !/^(?:sha256:)?[a-f0-9]{64}$/.test(profile.modelDigest))
  )
    throw new ReleaseError(
      'invalid_request',
      'The runner-owned model profile is invalid.',
    );
}

/** Aider always stays on an internal network; cloud credentials belong only to its trusted gateway. */
export function createAiderSandbox(
  profile: AiderProfile,
  modelsDirectory: string | null,
  execute: typeof runProcess = runProcess,
  cloudApiKey?: string,
  storage?: { workspaceDirectory: string; workspaceVolume: string },
): RepairAgent {
  validateProfile(profile);
  if (
    storage &&
    (!isAbsolute(storage.workspaceDirectory) ||
      !isSafeId(storage.workspaceVolume))
  )
    throw new ReleaseError(
      'invalid_request',
      'Invalid repair workspace volume configuration.',
    );
  const cloud = profile.provider === 'openrouter';
  if (cloud && !cloudApiKey?.trim())
    throw new ReleaseError(
      'model_unavailable',
      'Set OPENROUTER_API_KEY for the cloud debug trial.',
    );
  if (
    !cloud &&
    (!modelsDirectory ||
      !isAbsolute(modelsDirectory) ||
      /[,\n]/.test(modelsDirectory))
  )
    throw new ReleaseError(
      'invalid_request',
      'Choose an absolute, model-only directory for Ollama.',
    );
  let busy = false;
  let modelDigest = profile.modelDigest;
  let availableCpus: number | undefined;
  let containerCpus: number | undefined;
  const docker = (
    args: string[],
    timeout = profile.startupTimeoutMs,
    input?: string,
  ) => execute('docker', args, timeout, { input });
  const user = `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`;
  const hardened = async () => {
    if (containerCpus === undefined) {
      // Ask the daemon: the runner's host CPU count can differ from Docker's VM.
      const info = await docker(['info', '--format', '{{.NCPU}}'], 30_000);
      const count = Number(info.output.trim());
      if (info.exitCode !== 0 || !Number.isInteger(count) || count < 1)
        throw Object.assign(
          new ReleaseError(
            'model_unavailable',
            'Docker could not report the available CPU count.',
          ),
          { evidence: { stage: 'model_start', profile, process: info } },
        );
      availableCpus = count;
      containerCpus = Math.min(profile.cpus, count);
    }
    return [
      '--pull',
      'never',
      '--user',
      user,
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--pids-limit',
      '128',
      '--memory',
      profile.memory,
      '--cpus',
      String(containerCpus),
      '--tmpfs',
      '/tmp:rw,nosuid,nodev,mode=1777',
      '--env',
      'HOME=/tmp',
    ];
  };
  const mount = (
    source: string,
    destination: string,
    readonly: boolean,
    workspaceFile = false,
  ) => {
    if (!isAbsolute(source) || /[,\n]/.test(source))
      throw new ReleaseError(
        'invalid_request',
        'Sandbox mount paths must be absolute.',
      );
    if (storage && workspaceFile) {
      if (
        !isInside(storage.workspaceDirectory, source) ||
        source === storage.workspaceDirectory
      )
        throw new ReleaseError(
          'invalid_request',
          'Repair files must stay inside the managed workspace volume.',
        );
      return [
        '--mount',
        `type=volume,source=${storage.workspaceVolume},target=${destination},volume-nocopy,volume-subpath=${relative(storage.workspaceDirectory, source)}${readonly ? ',readonly' : ''}`,
      ];
    }
    return [
      '--mount',
      `type=bind,source=${source},target=${destination}${readonly ? ',readonly' : ''}`,
    ];
  };
  const clean = async (name: string) => {
    const result = await docker(['rm', '-f', name], 30_000);
    if (result.exitCode !== 0 && !result.output.includes('No such container'))
      throw new ReleaseError(
        'interrupted',
        'Sandbox cleanup failed. Stop the trial containers before retrying.',
      );
  };
  return {
    async run(input) {
      if (busy)
        throw new ReleaseError(
          'conflict',
          'Only one local inference phase may run at a time.',
        );
      busy = true;
      const id = `vg-${randomUUID()}`;
      const daemon = `${id}-${cloud ? 'gateway' : 'model'}`;
      const agent = `${id}-agent`;
      const egress = `${id}-egress`;
      let networkCreated = false;
      let egressCreated = false;
      try {
        const permissions = await hardened();
        const network = await docker(['network', 'create', '--internal', id]);
        if (network.exitCode !== 0)
          throw Object.assign(
            new ReleaseError(
              'harness_unavailable',
              'Docker could not create the isolated inference network.',
            ),
            { evidence: { stage: 'network_start', profile, process: network } },
          );
        networkCreated = true;
        if (cloud) {
          const external = await docker(['network', 'create', egress]);
          if (external.exitCode !== 0)
            throw Object.assign(
              new ReleaseError(
                'model_unavailable',
                'The cloud gateway network could not start.',
              ),
              {
                evidence: {
                  stage: 'network_start',
                  profile,
                  process: external,
                },
              },
            );
          egressCreated = true;
        }
        const server = cloud
          ? await execute(
              'docker',
              [
                'run',
                '-d',
                '--name',
                daemon,
                ...permissions,
                '--network',
                id,
                '--network-alias',
                'provider',
                '--env',
                'OPENROUTER_API_KEY',
                '--env',
                `VIBEGUARD_CLOUD_MODEL=${profile.model}`,
                '--env',
                `VIBEGUARD_OUTPUT_TOKENS=${profile.outputTokens}`,
                '--env',
                `VIBEGUARD_PHASE_TIMEOUT=${profile.phaseTimeoutMs / 1000}`,
                profile.aiderImage,
                'python',
                '/harness/cloud_proxy.py',
              ],
              profile.startupTimeoutMs,
              { env: { OPENROUTER_API_KEY: cloudApiKey! } },
            )
          : await docker([
              'run',
              '-d',
              '--name',
              daemon,
              ...permissions,
              '--network',
              id,
              '--network-alias',
              'ollama',
              '--env',
              'OLLAMA_HOST=0.0.0.0:11434',
              '--env',
              'OLLAMA_MODELS=/models',
              '--env',
              'OLLAMA_NUM_PARALLEL=1',
              '--env',
              'OLLAMA_MAX_LOADED_MODELS=1',
              '--env',
              `OLLAMA_CONTEXT_LENGTH=${profile.contextTokens}`,
              '--env',
              'OLLAMA_NO_CLOUD=1',
              '--env',
              'CUDA_VISIBLE_DEVICES=',
              '--env',
              'ROCR_VISIBLE_DEVICES=',
              ...mount(modelsDirectory!, '/models', true),
              profile.ollamaImage,
              'serve',
            ]);
        if (server.exitCode !== 0)
          throw Object.assign(
            new ReleaseError(
              'model_unavailable',
              cloud
                ? 'The trusted cloud gateway could not start.'
                : 'The offline CPU model container could not start.',
              'Read the recorded Docker startup error before retrying.',
            ),
            {
              evidence: {
                stage: 'model_start',
                profile,
                availableCpus,
                containerCpus,
                process: server,
              },
            },
          );
        if (cloud) {
          const connected = await docker([
            'network',
            'connect',
            egress,
            daemon,
          ]);
          if (connected.exitCode !== 0)
            throw Object.assign(
              new ReleaseError(
                'model_unavailable',
                'The cloud gateway could not reach its outbound network.',
              ),
              {
                evidence: {
                  stage: 'network_start',
                  profile,
                  process: connected,
                },
              },
            );
        }
        const args = [
          'run',
          '--name',
          agent,
          '-i',
          ...permissions,
          '--network',
          id,
          '--workdir',
          '/app',
          '--env',
          cloud
            ? 'OPENROUTER_API_KEY=gateway-only'
            : 'OLLAMA_API_BASE=http://ollama:11434',
        ];
        // File mounts expose only supplied source: imported .env/config/hooks never enter Aider.
        for (const file of ['app.js', 'client.js', ...editScope])
          args.push(
            ...mount(
              join(input.targetDirectory, file),
              `/app/${file}`,
              !(
                input.phase === 'edit' &&
                editScope.includes(file as (typeof editScope)[number])
              ),
              true,
            ),
          );
        args.push(profile.aiderImage, 'python', '/harness/invoke.py');
        const result = await docker(
          args,
          profile.phaseTimeoutMs,
          JSON.stringify({
            ...input,
            profile,
            expectedModelDigest: modelDigest,
          }),
        );
        const line = result.output
          .split('\n')
          .filter((item) => item.startsWith('VIBEGUARD_RESPONSE='))
          .at(-1);
        const envelope = line
          ? JSON.parse(line.slice('VIBEGUARD_RESPONSE='.length))
          : { response: '', tooling: {} };
        if (
          cloud &&
          result.exitCode !== 0 &&
          typeof envelope.tooling.providerError === 'string'
        )
          throw Object.assign(
            new ReleaseError(
              'model_unavailable',
              envelope.tooling.providerError,
              'Check your OpenRouter key, credits, model access, and connection before retrying.',
            ),
            {
              evidence: {
                stage: 'provider_request',
                profile,
                process: result,
                tooling: envelope.tooling,
              },
            },
          );
        if (result.exitCode === 0 && !cloud) {
          if (
            !envelope.tooling.modelDigest ||
            (modelDigest && envelope.tooling.modelDigest !== modelDigest)
          )
            throw new ReleaseError(
              'model_unavailable',
              'The model digest changed during the qualified repair profile.',
            );
          modelDigest = envelope.tooling.modelDigest;
        }
        const images = await docker([
          'inspect',
          '--format',
          '{{.Image}}',
          agent,
          daemon,
        ]);
        return {
          ...result,
          response: envelope.response,
          tooling: {
            ...envelope.tooling,
            profile,
            availableCpus,
            containerCpus,
            imageIds: images.output.trim().split('\n'),
          },
        };
      } finally {
        try {
          if (networkCreated) {
            let cleanupFailure: unknown;
            for (const name of [agent, daemon]) {
              try {
                await clean(name);
              } catch (error) {
                cleanupFailure = error;
              }
            }
            for (const network of [id, ...(egressCreated ? [egress] : [])]) {
              const result = await docker(['network', 'rm', network], 30_000);
              if (result.exitCode !== 0)
                cleanupFailure = new ReleaseError(
                  'interrupted',
                  'Inference network cleanup failed. Stop the trial containers before retrying.',
                );
            }
            if (cleanupFailure) throw cleanupFailure;
          }
        } finally {
          busy = false;
        }
      }
    },
    async test(targetDirectory): Promise<PhaseEvidence> {
      const name = `vg-tests-${randomUUID()}`;
      try {
        const mounts = editScope.flatMap((file) =>
          mount(join(targetDirectory, file), `/app/${file}`, true, true),
        );
        const result = await docker(
          [
            'run',
            '--name',
            name,
            ...(await hardened()),
            '--network',
            'none',
            '--workdir',
            '/app',
            ...mounts,
            profile.nodeImage,
            'node',
            '--test',
            'customers.test.mjs',
          ],
          profile.testTimeoutMs,
        );
        return {
          ...result,
          response: '',
          tooling: {
            nodeImage: profile.nodeImage,
            network: 'none',
            availableCpus,
            containerCpus,
          },
        };
      } finally {
        await clean(name);
      }
    },
  };
}
