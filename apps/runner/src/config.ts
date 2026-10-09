import { resolve } from 'node:path';

export function readConfig(environment: NodeJS.ProcessEnv = process.env) {
  return {
    // Compose binds within the container; published access stays host-loopback only.
    host: environment.VIBEGUARD_HOST ?? '127.0.0.1',
    port: 4310,
    workspaceDirectory: resolve(
      environment.VIBEGUARD_WORKSPACE ?? '.vibeguard',
    ),
  };
}
