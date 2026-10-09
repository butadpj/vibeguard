import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CheckResult } from '@vibeguard/contracts';

/** One retained check, listed in <check set>/checks.json.
 * Exit code 0 passes, 1 fails (the problem is present), anything else, a
 * crash, or a timeout means the check could not run. The check reads the
 * folder to test from VIBEGUARD_TARGET_DIR. */
export interface CheckDefinition {
  id: string;
  name: string;
  scope: CheckResult['scope'];
  command: 'node' | 'python' | 'python3';
  args: string[];
  timeoutMs: number;
}

const SCOPES = ['goal', 'create', 'read', 'update', 'delete'];
const COMMANDS = ['node', 'python', 'python3'];
const MAX_OUTPUT = 4_000;

export async function loadCheckDefinitions(
  checksDirectory: string,
): Promise<CheckDefinition[]> {
  const raw = JSON.parse(
    await readFile(path.join(checksDirectory, 'checks.json'), 'utf8'),
  ) as unknown;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('checks.json must list at least one check.');
  }
  return raw.map((entry: Partial<CheckDefinition>) => {
    if (
      typeof entry.id !== 'string' ||
      typeof entry.name !== 'string' ||
      !SCOPES.includes(entry.scope as string) ||
      !COMMANDS.includes(entry.command as string) ||
      !Array.isArray(entry.args) ||
      !entry.args.every((arg) => typeof arg === 'string')
    ) {
      throw new Error('A check in checks.json is missing required fields.');
    }
    return {
      id: entry.id,
      name: entry.name,
      scope: entry.scope!,
      command: entry.command!,
      args: entry.args,
      timeoutMs: Math.min(entry.timeoutMs ?? 30_000, 300_000),
    };
  });
}

export type CheckExecutor = (
  check: CheckDefinition,
  context: { checksDirectory: string; targetDirectory: string },
) => Promise<Pick<CheckResult, 'verdict' | 'explanation' | 'evidence'>>;

const INHERITED_ENV = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'SystemRoot',
  'TEMP',
  'TMP',
];

/** Default executor: runs the check command without a shell. */
export const runCommandCheck: CheckExecutor = (check, context) =>
  new Promise((resolve) => {
    const started = Date.now();
    let output = '';
    let timedOut = false;
    const finish = (verdict: CheckResult['verdict'], explanation: string) => {
      const durationMs = Date.now() - started;
      resolve({
        verdict,
        explanation,
        evidence: [
          {
            id: `${check.id}_output`,
            kind: 'observation',
            summary:
              output.trim().slice(-MAX_OUTPUT) || 'The check printed nothing.',
            artifactId: null,
            durationMs: null,
          },
          {
            id: `${check.id}_timing`,
            kind: 'timing',
            summary: `The check took ${durationMs} ms.`,
            artifactId: null,
            durationMs,
          },
        ],
      });
    };

    const env: NodeJS.ProcessEnv = {
      VIBEGUARD_TARGET_DIR: context.targetDirectory,
      VIBEGUARD_CHECK_ID: check.id,
    };
    for (const key of INHERITED_ENV) {
      if (process.env[key]) env[key] = process.env[key];
    }
    const child = spawn(check.command, check.args, {
      cwd: context.checksDirectory,
      shell: false,
      env,
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, check.timeoutMs);
    const collect = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-MAX_OUTPUT * 2);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (error) => {
      clearTimeout(timer);
      output += `\n${error.message}`;
      finish(
        'could_not_check',
        'The check could not start. A tool it needs may be missing.',
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        finish('could_not_check', 'The check took too long and was stopped.');
      } else if (code === 0) {
        finish('passed', 'This check passed.');
      } else if (code === 1) {
        finish('failed', 'This check failed. The problem is present.');
      } else {
        finish('could_not_check', 'The check stopped before it could finish.');
      }
    });
  });
