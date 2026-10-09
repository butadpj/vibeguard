import { expect, it } from 'vitest';
import { runProcess } from './repair-process.js';
import { defaultAiderProfile, validateProfile } from './aider-sandbox.js';

it('captures a process failure as evidence and enforces a finite timeout', async () => {
  const result = await runProcess(
    process.execPath,
    [
      '-e',
      'require("node:fs").writeSync(2, "failure evidence\\n"); process.exit(7)',
    ],
    1000,
  );
  expect(result).toMatchObject({
    exitCode: 7,
    output: 'failure evidence\n',
    durationMs: expect.any(Number),
  });
  await expect(
    runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], 50),
  ).rejects.toMatchObject({ code: 'timeout' });
});

it('does not pass host secrets to a child process', async () => {
  process.env.VIBEGUARD_TEST_SECRET = 'private';
  try {
    const result = await runProcess(
      process.execPath,
      [
        '-e',
        'require("node:fs").writeSync(1, (process.env.VIBEGUARD_TEST_SECRET ?? "absent") + "\\n")',
      ],
      1000,
    );
    expect(result.output).toBe('absent\n');
  } finally {
    delete process.env.VIBEGUARD_TEST_SECRET;
  }
});

it.each([
  { phaseTimeoutMs: Infinity },
  { contextTokens: 8192, outputTokens: 8192 },
  { cpus: 0 },
  { aiderImage: '--privileged' },
])('rejects unsafe/non-finite profiles %j', (overrides) => {
  expect(() =>
    validateProfile({ ...defaultAiderProfile, ...overrides }),
  ).toThrow();
});
