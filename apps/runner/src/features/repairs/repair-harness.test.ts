import { expect, it } from 'vitest';
import {
  defaultAiderProfile,
  defaultOpenRouterProfile,
} from './aider-sandbox.js';
import { createRepairHarness, selectRepairProfile } from './repair-harness.js';

const options = {
  principles: 'Protect acceptance checks and original files.',
  modelsDirectory: '/offline/models',
  preview: async () => ({
    versionId: 'checked_candidate',
    environmentId: 'preview',
    url: 'http://127.0.0.1:4410',
  }),
};

it('switches cloud debugging back to local Qwen without changing defaults', () => {
  const cloud = selectRepairProfile({
    VIBEGUARD_REPAIR_PROVIDER: 'openrouter',
    VIBEGUARD_CLOUD_MODEL: 'provider/test-model',
  });
  expect(cloud).toMatchObject({
    provider: 'openrouter',
    model: 'provider/test-model',
  });
  expect(
    createRepairHarness({
      ...options,
      modelsDirectory: null,
      profile: cloud,
      cloudApiKey: 'synthetic-key',
    }).agent,
  ).toBeDefined();
  const local = selectRepairProfile({
    VIBEGUARD_REPAIR_PROVIDER: 'ollama',
    VIBEGUARD_CLOUD_MODEL: 'provider/test-model',
    OPENROUTER_API_KEY: 'synthetic-key',
  });
  expect(local).toEqual(defaultAiderProfile);
  expect(local.provider).toBeUndefined();
  expect(selectRepairProfile({})).toEqual(defaultAiderProfile);
  expect(defaultOpenRouterProfile.model).not.toBe('provider/test-model');
});

it('preserves custom profiles and rejects ambiguous or invalid provider choices', () => {
  expect(selectRepairProfile({}, defaultOpenRouterProfile)).toEqual(
    defaultOpenRouterProfile,
  );
  expect(() =>
    selectRepairProfile({ VIBEGUARD_REPAIR_PROVIDER: 'automatic' }),
  ).toThrow('Choose ollama or openrouter');
  expect(() =>
    selectRepairProfile(
      { VIBEGUARD_REPAIR_PROVIDER: 'ollama' },
      defaultOpenRouterProfile,
    ),
  ).toThrow('disagree');
});

it('uses the selected local model and ignores cloud model settings in local mode', () => {
  const local = selectRepairProfile({
    VIBEGUARD_REPAIR_PROVIDER: 'ollama',
    VIBEGUARD_LOCAL_MODEL: 'qwen2.5-coder:14b',
    VIBEGUARD_CLOUD_MODEL: 'provider/cloud-model',
  });
  expect(local.model).toBe('qwen2.5-coder:14b');
  expect(local.provider).toBeUndefined();
  expect(defaultAiderProfile.model).toBe('qwen2.5-coder:7b');
});

it('rejects missing configuration before executing Docker', () => {
  const execute = async () => {
    throw new Error('No Docker calls may run during configuration.');
  };
  expect(() =>
    createRepairHarness({ ...options, execute, principles: ' ' }),
  ).toThrow('principles are missing');
  expect(() =>
    createRepairHarness({ ...options, execute, modelsDirectory: null }),
  ).toThrow('absolute, model-only directory');
  expect(() =>
    createRepairHarness({ ...options, execute, workspaceVolume: 'workspace' }),
  ).toThrow('managed workspace directory');
  expect(() =>
    createRepairHarness({
      ...options,
      execute,
      profile: defaultOpenRouterProfile,
    }),
  ).toThrow('Set OPENROUTER_API_KEY');
});

it('accepts a cloud key only through an explicitly selected cloud profile', () => {
  const harness = createRepairHarness({
    ...options,
    modelsDirectory: null,
    profile: defaultOpenRouterProfile,
    cloudApiKey: 'synthetic-debug-key',
  });
  expect(harness.preview).toBe(options.preview);
  expect(harness.principles).toBe(options.principles);
});
