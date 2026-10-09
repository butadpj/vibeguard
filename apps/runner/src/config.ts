import { resolve } from 'node:path';

export function readConfig(environment: NodeJS.ProcessEnv = process.env) {
  const goalProvider = environment.VIBEGUARD_GOAL_PROVIDER ?? 'ollama';
  if (!['ollama', 'openrouter'].includes(goalProvider))
    throw new Error('VIBEGUARD_GOAL_PROVIDER must be ollama or openrouter.');
  return {
    goalProvider: goalProvider as 'ollama' | 'openrouter',
    // Compose binds within the container; published access stays host-loopback only.
    host: environment.VIBEGUARD_HOST ?? '127.0.0.1',
    port: 4310,
    ollamaUrl: environment.VIBEGUARD_OLLAMA_URL ?? 'http://127.0.0.1:11434',
    goalModel:
      goalProvider === 'openrouter'
        ? environment.VIBEGUARD_GOAL_CLOUD_MODEL ||
          environment.VIBEGUARD_CLOUD_MODEL ||
          'anthropic/claude-sonnet-5.5'
        : (environment.VIBEGUARD_GOAL_MODEL ?? 'qwen2.5-coder:7b'),
    workspaceDirectory: resolve(
      environment.VIBEGUARD_WORKSPACE ?? '.vibeguard',
    ),
  };
}
