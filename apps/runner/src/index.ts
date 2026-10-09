import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { mkdir } from 'node:fs/promises';
import { createDemoRuntime } from './features/environments/demo-runtime.js';

const dashboardDirectory = fileURLToPath(
  new URL('../../dashboard/dist/', import.meta.url),
);
const config = readConfig();
await mkdir(config.workspaceDirectory, { recursive: true });
const demo =
  process.env.VIBEGUARD_DEMO_RUNTIME === '1'
    ? createDemoRuntime({
        workspaceDirectory: config.workspaceDirectory,
        workspaceVolume: process.env.VIBEGUARD_WORKSPACE_VOLUME,
      })
    : undefined;
await demo?.initialize();
const app = createApp({
  dashboardDirectory,
  workspaceDirectory: config.workspaceDirectory,
  prepareEnvironment: demo?.prepareEnvironment,
  baselineChecks: demo?.baselineChecks,
});
const server = app.listen(config.port, config.host, () => {
  console.log('VibeGuard: http://127.0.0.1:4310');
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void (async () => {
        try {
          await demo?.close();
          process.exit(0);
        } catch {
          console.error(
            'Demo cleanup failed; see context/us3-us4-backend-handoff.md.',
          );
          process.exit(1);
        }
      })();
    });
  });
}
