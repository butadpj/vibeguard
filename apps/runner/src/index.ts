import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { mkdir } from 'node:fs/promises';

const dashboardDirectory = fileURLToPath(
  new URL('../../dashboard/dist/', import.meta.url),
);
const config = readConfig();
await mkdir(config.workspaceDirectory, { recursive: true });
const app = createApp({
  dashboardDirectory,
  workspaceDirectory: config.workspaceDirectory,
});
const server = app.listen(config.port, config.host, () => {
  console.log('VibeGuard: http://127.0.0.1:4310');
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
