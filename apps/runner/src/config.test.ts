import { expect, it } from 'vitest';
import { readConfig } from './config.js';
import { createGoalConversation } from './features/goals/ollama-conversation.js';

it('configures local goal conversation without requiring environment variables', () => {
  const config = readConfig({});
  expect(config).toMatchObject({
    ollamaUrl: 'http://127.0.0.1:11434',
    goalModel: 'qwen2.5-coder:7b',
  });
  expect(
    createGoalConversation({
      url: config.ollamaUrl,
      model: config.goalModel,
    }),
  ).toBeTypeOf('function');
});

it('accepts the Docker host origin and an explicitly prepared model', () => {
  const config = readConfig({
    VIBEGUARD_OLLAMA_URL: 'http://host.docker.internal:11434',
    VIBEGUARD_GOAL_MODEL: 'prepared-model',
  });
  expect(config.goalModel).toBe('prepared-model');
  expect(
    createGoalConversation({
      url: config.ollamaUrl,
      model: config.goalModel,
    }),
  ).toBeTypeOf('function');
});

it('selects cloud goal settings independently from repair', () => {
  expect(
    readConfig({
      VIBEGUARD_GOAL_PROVIDER: 'openrouter',
      VIBEGUARD_CLOUD_MODEL: 'shared-cloud',
      VIBEGUARD_REPAIR_PROVIDER: 'ollama',
    }),
  ).toMatchObject({ goalProvider: 'openrouter', goalModel: 'shared-cloud' });
  expect(
    readConfig({
      VIBEGUARD_GOAL_PROVIDER: 'openrouter',
      VIBEGUARD_GOAL_CLOUD_MODEL: 'goal-cloud',
      VIBEGUARD_CLOUD_MODEL: 'shared-cloud',
    }).goalModel,
  ).toBe('goal-cloud');
  expect(() => readConfig({ VIBEGUARD_GOAL_PROVIDER: 'invalid' })).toThrow(
    'VIBEGUARD_GOAL_PROVIDER',
  );
});
