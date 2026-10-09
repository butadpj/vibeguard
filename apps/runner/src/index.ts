import { fileURLToPath } from 'node:url';
import { writeEvent } from './lib/logging.js';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { mkdir, readFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { createDemoRuntime } from './features/environments/demo-runtime.js';
import { createGoalConversation } from './features/goals/ollama-conversation.js';
import { createJevosConversation } from './features/goals/jevos-conversation.js';
import {
  createRepairHarness,
  selectRepairProfile,
} from './features/repairs/repair-harness.js';

try {
  loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

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
const repairProfile = selectRepairProfile(
  process.env,
  process.env.VIBEGUARD_REPAIR_PROFILE
    ? JSON.parse(await readFile(process.env.VIBEGUARD_REPAIR_PROFILE, 'utf8'))
    : undefined,
);
const repairHarness =
  demo && process.env.VIBEGUARD_REPAIR_ENABLED === '1'
    ? createRepairHarness({
        profile: repairProfile,
        modelsDirectory: process.env.VIBEGUARD_MODELS_DIRECTORY,
        cloudApiKey:
          repairProfile.provider === 'openrouter'
            ? process.env.OPENROUTER_API_KEY
            : undefined,
        workspaceVolume: process.env.VIBEGUARD_WORKSPACE_VOLUME,
        workspaceDirectory: config.workspaceDirectory,
        principles: await readFile(
          fileURLToPath(
            new URL('../../../harness/principles.md', import.meta.url),
          ),
          'utf8',
        ),
        preview: demo.candidatePreview,
      })
    : undefined;
const goalConversation = createGoalConversation({
  provider: config.goalProvider,
  apiKey: process.env.OPENROUTER_API_KEY,
  url: config.ollamaUrl,
  model: config.goalModel,
});
const app = createApp({
  dashboardDirectory,
  workspaceDirectory: config.workspaceDirectory,
  prepareEnvironment: demo?.prepareEnvironment,
  baselineChecks: demo?.baselineChecks,
  repairHarness,
  goalConversation:
    config.jevosUrl && config.goalProvider === 'ollama'
      ? createJevosConversation({
          url: config.jevosUrl,
          fallback: goalConversation,
        })
      : goalConversation,
});
const server = app.listen(config.port, config.host, () => {
  writeEvent({
    event: 'startup',
    level: 'info',
    port: config.port,
    goal_provider: config.goalProvider,
    goal_model: config.goalModel,
    decision_model:
      config.jevosUrl && config.goalProvider === 'ollama'
        ? 'jevos-v4'
        : undefined,
    repair_enabled: Boolean(repairHarness),
    repair_provider: repairProfile.provider ?? 'ollama',
    repair_model: repairProfile.model,
  });
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void (async () => {
        try {
          await demo?.close();
          process.exit(0);
        } catch {
          writeEvent({
            event: 'shutdown',
            level: 'error',
            error_code: 'cleanup_failed',
          });
          process.exit(1);
        }
      })();
    });
  });
}
