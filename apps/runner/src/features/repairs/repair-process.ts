import { spawn } from 'node:child_process';
import { ReleaseError } from '../../lib/release-error.js';

/** No shell and no inherited credential/model environment. Docker cleanup is owned by callers. */
export function runProcess(
  command: string,
  args: string[],
  timeoutMs: number,
  options: { cwd?: string; env?: Record<string, string>; input?: string } = {},
) {
  return new Promise<{
    exitCode: number | null;
    durationMs: number;
    output: string;
  }>((resolve, reject) => {
    const started = Date.now();
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { PATH: process.env.PATH, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    let timedOut = false;
    let overflow = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    const collect = (chunk: Buffer) => {
      if (overflow) return;
      if (Buffer.byteLength(output) + chunk.length > 2 * 1024 * 1024) {
        overflow = true;
        child.kill('SIGKILL');
        return;
      }
      output += chunk.toString();
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.stdin.on('error', () => {});
    child.on('error', () => {
      clearTimeout(timer);
      reject(
        new ReleaseError('harness_unavailable', `${command} could not start.`),
      );
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      const evidence = { exitCode, durationMs: Date.now() - started, output };
      if (timedOut)
        reject(
          Object.assign(
            new ReleaseError(
              'timeout',
              `${command} exceeded its finite time budget.`,
            ),
            { evidence },
          ),
        );
      else if (overflow)
        reject(
          Object.assign(
            new ReleaseError(
              'harness_unavailable',
              'Process output exceeded the evidence limit.',
            ),
            { evidence },
          ),
        );
      else resolve({ exitCode, durationMs: Date.now() - started, output });
    });
    child.stdin.end(options.input);
  });
}
