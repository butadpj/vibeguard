import os from 'node:os';
import path from 'node:path';

/** Where VibeGuard keeps its local data. Override with VIBEGUARD_HOME. */
export function defaultHome(): string {
  return process.env.VIBEGUARD_HOME ?? path.join(os.homedir(), '.vibeguard');
}
