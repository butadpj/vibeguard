import { expect, it } from 'vitest';
import {
  createAiderSandbox,
  defaultAiderProfile,
  defaultOpenRouterProfile,
} from './aider-sandbox.js';
import type { runProcess } from './repair-process.js';
import { ReleaseError } from '../../lib/release-error.js';

// Docker is the external seam. These prove requested permissions, not live enforcement.
function fakeDocker(availableCpus = 4) {
  const calls: string[][] = [];
  let digest = 'a'.repeat(64),
    timeout = false,
    failCleanup = false;
  const execute: typeof runProcess = async (command, args) => {
    expect(command).toBe('docker');
    calls.push(args);
    if (args[0] === 'info')
      return { exitCode: 0, durationMs: 1, output: String(availableCpus) };
    if (
      args[0] === 'run' &&
      Number(args[args.indexOf('--cpus') + 1]) > availableCpus
    )
      return {
        exitCode: 125,
        durationMs: 1,
        output: 'CPU request exceeds daemon capacity',
      };
    if (timeout && args.includes('/harness/invoke.py'))
      throw new ReleaseError('timeout', 'CPU deadline');
    if (failCleanup && args[0] === 'rm')
      return { exitCode: 1, durationMs: 1, output: 'daemon unavailable' };
    const output = args.includes('/harness/invoke.py')
      ? 'VIBEGUARD_RESPONSE=' +
        JSON.stringify({
          response: 'Model answer',
          tooling: { modelDigest: digest },
        })
      : args[0] === 'inspect'
        ? 'sha256:image\n'
        : 'ok';
    return { exitCode: 0, durationMs: 1, output };
  };
  return {
    calls,
    execute,
    changeModel() {
      digest = 'b'.repeat(64);
    },
    timeOut() {
      timeout = true;
    },
    failCleanup() {
      failCleanup = true;
    },
  };
}

it('exposes only source files, enables edits only for the fix/test, and runs supplemental tests without network', async () => {
  const docker = fakeDocker();
  const agent = createAiderSandbox(
    defaultAiderProfile,
    '/offline/models',
    docker.execute,
  );
  await agent.run({
    phase: 'diagnosis',
    targetDirectory: '/disposable/app',
    prompt: 'Diagnose only.',
  });
  await agent.run({
    phase: 'edit',
    targetDirectory: '/disposable/app',
    prompt: 'Apply the plan.',
  });
  expect(
    docker.calls.find((args) => args[0] === 'network' && args[1] === 'create'),
  ).toContain('--internal');
  const daemon = docker.calls.find((args) => args.includes('serve'))!;
  for (const setting of [
    'OLLAMA_NUM_PARALLEL=1',
    'OLLAMA_CONTEXT_LENGTH=8192',
    'OLLAMA_MAX_LOADED_MODELS=1',
  ])
    expect(daemon).toContain(setting);
  expect(daemon).not.toContain('--gpus');
  expect(daemon).not.toContain('--publish');
  const invocations = docker.calls.filter((args) =>
    args.includes('/harness/invoke.py'),
  );
  for (const args of invocations) {
    expect(args).toContain('--read-only');
    expect(args).toContain('no-new-privileges');
    expect(args).toContain('never');
    expect(args.join(' ')).not.toContain('docker.sock');
    const mounts = args.filter((arg) => arg.startsWith('type=bind'));
    expect(mounts).toHaveLength(4);
    expect(
      mounts.every((mount) =>
        /source=\/disposable\/app\/(app.js|client.js|customers.js|customers.test.mjs),target=\/app\//.test(
          mount,
        ),
      ),
    ).toBe(true);
  }
  expect(
    invocations[0]
      .filter((arg) => arg.startsWith('type=bind'))
      .every((mount) => mount.endsWith(',readonly')),
  ).toBe(true);
  expect(
    invocations[1].filter(
      (arg) => arg.startsWith('type=bind') && !arg.endsWith(',readonly'),
    ),
  ).toEqual([
    'type=bind,source=/disposable/app/customers.js,target=/app/customers.js',
    'type=bind,source=/disposable/app/customers.test.mjs,target=/app/customers.test.mjs',
  ]);
  await agent.test('/disposable/app');
  const tests = docker.calls.find(
    (args) => args.includes('customers.test.mjs') && args.includes('--test'),
  )!;
  expect(tests[tests.indexOf('--network') + 1]).toBe('none');
  expect(tests.filter((arg) => arg.startsWith('type=bind'))).toHaveLength(2);
});

it('uses individual volume files with phase permissions, host model files, and offline tests', async () => {
  const docker = fakeDocker();
  const agent = createAiderSandbox(
    defaultAiderProfile,
    '/offline/models',
    docker.execute,
    undefined,
    { workspaceDirectory: '/managed', workspaceVolume: 'runner-data' },
  );
  for (const phase of ['diagnosis', 'edit'] as const)
    await agent.run({
      phase,
      targetDirectory: '/managed/projects/project/repairs/attempt/editable',
      prompt: 'Follow the plan.',
    });
  const invocations = docker.calls.filter((args) =>
    args.includes('/harness/invoke.py'),
  );
  const mounts = invocations.map((args) =>
    args.filter((arg) => arg.startsWith('type=volume')),
  );
  expect(mounts[0]).toHaveLength(4);
  expect(mounts[0].every((mount) => mount.endsWith(',readonly'))).toBe(true);
  expect(mounts[1].filter((mount) => !mount.endsWith(',readonly'))).toEqual([
    'type=volume,source=runner-data,target=/app/customers.js,volume-nocopy,volume-subpath=projects/project/repairs/attempt/editable/customers.js',
    'type=volume,source=runner-data,target=/app/customers.test.mjs,volume-nocopy,volume-subpath=projects/project/repairs/attempt/editable/customers.test.mjs',
  ]);
  expect(docker.calls.find((args) => args.includes('serve'))).toContain(
    'type=bind,source=/offline/models,target=/models,readonly',
  );
  await agent.test('/managed/projects/project/repairs/attempt/editable');
  const tests = docker.calls.find((args) => args.includes('--test'))!;
  expect(tests[tests.indexOf('--network') + 1]).toBe('none');
  expect(tests.filter((arg) => arg.startsWith('type=volume'))).toHaveLength(2);
  const callsBefore = docker.calls.length;
  await expect(agent.test('/managed/../private')).rejects.toMatchObject({
    code: 'invalid_request',
  });
  expect(
    docker.calls.slice(callsBefore).some((args) => args[0] === 'run'),
  ).toBe(false);
});

it('rejects changed model bytes between phases and cleans up after a CPU timeout', async () => {
  const docker = fakeDocker();
  const agent = createAiderSandbox(
    defaultAiderProfile,
    '/offline/models',
    docker.execute,
  );
  const input = {
    phase: 'diagnosis' as const,
    targetDirectory: '/disposable/app',
    prompt: 'Diagnose.',
  };
  await agent.run(input);
  docker.changeModel();
  await expect(agent.run(input)).rejects.toMatchObject({
    code: 'model_unavailable',
  });
  docker.timeOut();
  await expect(agent.run(input)).rejects.toMatchObject({ code: 'timeout' });
  const cleanup = docker.calls.slice(-3);
  expect(cleanup[0].slice(0, 2)).toEqual(['rm', '-f']);
  expect(cleanup[1].slice(0, 2)).toEqual(['rm', '-f']);
  expect(cleanup[2].slice(0, 2)).toEqual(['network', 'rm']);
});

it.each([
  [2, 4, 2],
  [8, 4, 4],
  [2, 1.5, 1.5],
])(
  'runs diagnosis, edit, and tests with Docker capacity %s and profile limit %s',
  async (capacity, limit, expected) => {
    const docker = fakeDocker(capacity);
    const agent = createAiderSandbox(
      { ...defaultAiderProfile, cpus: limit },
      '/offline/models',
      docker.execute,
    );
    for (const phase of ['diagnosis', 'edit'] as const) {
      const result = await agent.run({
        phase,
        targetDirectory: '/disposable/app',
        prompt: 'Follow the plan.',
      });
      expect(result.exitCode).toBe(0);
      expect(result.tooling).toMatchObject({
        availableCpus: capacity,
        containerCpus: expected,
      });
    }
    expect((await agent.test('/disposable/app')).exitCode).toBe(0);
    for (const args of docker.calls.filter((args) => args[0] === 'run'))
      expect(args[args.indexOf('--cpus') + 1]).toBe(String(expected));
  },
);

it('starts no containers when Docker cannot report valid CPU capacity', async () => {
  const docker = fakeDocker(0);
  const agent = createAiderSandbox(
    defaultAiderProfile,
    '/offline/models',
    docker.execute,
  );
  await expect(
    agent.run({
      phase: 'diagnosis',
      targetDirectory: '/disposable/app',
      prompt: 'Diagnose.',
    }),
  ).rejects.toMatchObject({
    code: 'model_unavailable',
    evidence: { process: { output: '0' } },
  });
  expect(
    docker.calls.some((args) => ['run', 'network'].includes(args[0])),
  ).toBe(false);
});

it('fails closed when process cleanup cannot be established', async () => {
  const docker = fakeDocker();
  docker.failCleanup();
  const agent = createAiderSandbox(
    defaultAiderProfile,
    '/offline/models',
    docker.execute,
  );
  await expect(
    agent.run({
      phase: 'diagnosis',
      targetDirectory: '/disposable/app',
      prompt: 'Diagnose.',
    }),
  ).rejects.toMatchObject({ code: 'interrupted' });
  expect(docker.calls.filter((args) => args[0] === 'rm')).toHaveLength(2);
});

it('keeps cloud credentials and outbound access in the trusted gateway while sharing the protected fix/test flow', async () => {
  const docker = fakeDocker(2);
  const calls: { args: string[]; options: Parameters<typeof runProcess>[3] }[] =
    [];
  const execute: typeof runProcess = async (
    command,
    args,
    timeout,
    options,
  ) => {
    calls.push({ args, options });
    return docker.execute(command, args, timeout, options);
  };
  const secret = 'synthetic-openrouter-secret';
  const agent = createAiderSandbox(
    defaultOpenRouterProfile,
    null,
    execute,
    secret,
  );
  await agent.run({
    phase: 'diagnosis',
    targetDirectory: '/disposable/app',
    prompt: 'Diagnose.',
  });
  await agent.run({
    phase: 'edit',
    targetDirectory: '/disposable/app',
    prompt: 'Apply the plan.',
  });
  await agent.test('/disposable/app');
  const gateways = calls.filter(({ args }) =>
    args.includes('/harness/cloud_proxy.py'),
  );
  expect(gateways).toHaveLength(2);
  for (const { args, options } of gateways) {
    expect(options?.env).toEqual({ OPENROUTER_API_KEY: secret });
    expect(args).toContain('OPENROUTER_API_KEY');
    expect(args.join(' ')).not.toContain(secret);
    expect(args).not.toContain('--mount');
    expect(args).not.toContain('--publish');
  }
  for (const { args, options } of calls.filter(
    ({ args }) => !args.includes('/harness/cloud_proxy.py'),
  )) {
    expect(JSON.stringify({ args, options })).not.toContain(secret);
    expect(args.join(' ')).not.toContain('docker.sock');
  }
  for (const { args } of calls.filter(({ args }) =>
    args.includes('/harness/invoke.py'),
  )) {
    expect(args).toContain('OPENROUTER_API_KEY=gateway-only');
    const network = args[args.indexOf('--network') + 1];
    expect(
      calls.some(
        ({ args }) =>
          args[0] === 'network' &&
          args[1] === 'create' &&
          args.includes('--internal') &&
          args.includes(network),
      ),
    ).toBe(true);
    expect(
      calls.filter(
        ({ args }) =>
          args[0] === 'network' &&
          args[1] === 'connect' &&
          args.includes(network),
      ),
    ).toHaveLength(0);
  }
  expect(calls.some(({ args }) => args.includes('serve'))).toBe(false);
  const tests = calls.find(({ args }) => args.includes('--test'))!.args;
  expect(tests[tests.indexOf('--network') + 1]).toBe('none');
  expect(
    calls.filter(({ args }) => args[0] === 'network' && args[1] === 'rm'),
  ).toHaveLength(4);
});

it('requires a cloud key without starting any processes', () => {
  const docker = fakeDocker();
  expect(() =>
    createAiderSandbox(defaultOpenRouterProfile, null, docker.execute),
  ).toThrow('Set OPENROUTER_API_KEY');
  expect(docker.calls).toEqual([]);
});

it('preserves the cloud provider blocker and cleans up both networks', async () => {
  const docker = fakeDocker();
  const execute: typeof runProcess = async (command, args, timeout, options) =>
    args.includes('/harness/invoke.py')
      ? {
          exitCode: 1,
          durationMs: 12,
          output:
            'VIBEGUARD_RESPONSE=' +
            JSON.stringify({
              response: '',
              tooling: { providerError: 'OpenRouter returned HTTP 402.' },
            }),
        }
      : docker.execute(command, args, timeout, options);
  const agent = createAiderSandbox(
    defaultOpenRouterProfile,
    null,
    execute,
    'synthetic-key',
  );
  await expect(
    agent.run({
      phase: 'diagnosis',
      targetDirectory: '/disposable/app',
      prompt: 'Diagnose.',
    }),
  ).rejects.toMatchObject({
    code: 'model_unavailable',
    message: 'OpenRouter returned HTTP 402.',
    evidence: {
      stage: 'provider_request',
      process: { exitCode: 1, durationMs: 12 },
    },
  });
  expect(docker.calls.filter((args) => args[0] === 'rm')).toHaveLength(2);
  expect(
    docker.calls.filter((args) => args[0] === 'network' && args[1] === 'rm'),
  ).toHaveLength(2);
});
