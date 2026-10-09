import { expect, it, vi } from 'vitest';
import { createGoalConversation } from './ollama-conversation.js';

const input = {
  projectId: 'p',
  name: 'Demo',
  messages: [{ id: 'm', role: 'user' as const, text: 'Edits disappear.' }],
  goal: null,
};
it('uses local structured conversation and leaves confirmation to the founder', async () => {
  const output = {
    reply: 'Confirm this goal.',
    proposedGoal: {
      description: 'Lost edits',
      expectedBehavior: 'Saved customer edits survive refreshing.',
      performance: null,
    },
  };
  const request = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      done: true,
      message: { content: JSON.stringify(output) },
    }),
  );
  await expect(
    createGoalConversation({
      url: 'http://127.0.0.1:11434',
      model: 'qwen2.5-coder:7b',
      fetch: request,
    })(input),
  ).resolves.toEqual(output);
  const body = JSON.parse(String(request.mock.calls[0][1]?.body));
  expect(body).toMatchObject({
    stream: false,
    format: expect.objectContaining({
      type: 'object',
      required: ['reply', 'proposedGoal'],
    }),
    keep_alive: '5m',
    messages: [
      expect.objectContaining({ role: 'system' }),
      { role: 'user', content: 'Edits disappear.' },
    ],
  });
});
it.each([
  {},
  {
    done: true,
    message: {
      content: '{"reply":"Okay","proposedGoal":{"description":"Invented"}}',
    },
  },
])('rejects incomplete or invalid model output', async (output) => {
  await expect(
    createGoalConversation({
      url: 'http://localhost:11434',
      model: 'local',
      fetch: vi.fn<typeof fetch>().mockResolvedValue(Response.json(output)),
    })(input),
  ).rejects.toMatchObject({ code: 'model_unavailable' });
});
it('refuses remote inference configuration', () => {
  expect(() =>
    createGoalConversation({ url: 'https://example.com', model: 'remote' }),
  ).toThrow('local Ollama');
});

it('sends cloud conversation through the runner and validates structured output', async () => {
  const output = { reply: 'What should happen?', proposedGoal: null };
  const request = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      choices: [
        { finish_reason: 'stop', message: { content: JSON.stringify(output) } },
      ],
    }),
  );
  const conversation = createGoalConversation({
    provider: 'openrouter',
    url: '',
    model: 'cloud-model',
    apiKey: 'test-key',
    fetch: request,
  });
  await expect(conversation(input)).resolves.toEqual(output);
  expect(String(request.mock.calls[0][0])).toBe(
    'https://openrouter.ai/api/v1/chat/completions',
  );
  expect(request.mock.calls[0][1]?.headers).toMatchObject({
    Authorization: 'Bearer test-key',
  });
  const body = JSON.parse(String(request.mock.calls[0][1]?.body));
  expect(body).toMatchObject({
    model: 'cloud-model',
    response_format: { type: 'json_schema' },
    messages: [
      expect.objectContaining({ role: 'system' }),
      { role: 'user', content: 'Edits disappear.' },
    ],
  });
  expect(body).not.toHaveProperty('keep_alive');
  expect(body).not.toHaveProperty('temperature');
  request.mockResolvedValue(
    Response.json({
      choices: [
        {
          finish_reason: 'length',
          message: { content: JSON.stringify(output) },
        },
      ],
    }),
  );
  await expect(conversation(input)).rejects.toMatchObject({
    code: 'model_unavailable',
  });
});

it('does not send a cloud request without a key or expose provider errors', async () => {
  const request = vi.fn<typeof fetch>();
  await expect(
    createGoalConversation({
      provider: 'openrouter',
      url: '',
      model: 'cloud-model',
      fetch: request,
    })(input),
  ).rejects.toMatchObject({ code: 'model_unavailable' });
  expect(request).not.toHaveBeenCalled();
  request.mockRejectedValue(new Error('private provider error test-key'));
  await expect(
    createGoalConversation({
      provider: 'openrouter',
      url: '',
      model: 'cloud-model',
      apiKey: 'test-key',
      fetch: request,
    })(input),
  ).rejects.not.toThrow('test-key');
});

it.each([401, 402, 429, 400, 503])(
  'reports cloud HTTP %s without exposing response bodies',
  async (status) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('private provider error test-key', { status }),
      );
    await expect(
      createGoalConversation({
        provider: 'openrouter',
        url: '',
        model: 'cloud-model',
        apiKey: 'test-key',
        fetch: request,
      })(input),
    ).rejects.toMatchObject({
      code: 'model_unavailable',
      message: `OpenRouter rejected the goal request (HTTP ${status}).`,
    });
  },
);

it('reports DNS failure separately from credentials and output failures', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockRejectedValue(
      new TypeError('fetch failed', { cause: { code: 'EAI_AGAIN' } }),
    );
  await expect(
    createGoalConversation({
      provider: 'openrouter',
      url: '',
      model: 'cloud-model',
      apiKey: 'test-key',
      fetch: request,
    })(input),
  ).rejects.toMatchObject({
    message: 'The runner could not reach OpenRouter.',
  });
});

it('preserves earlier questions and answers when the founder adds the final goal detail', async () => {
  const messages = [
    { id: '1', role: 'user' as const, text: 'Customer edits disappear.' },
    { id: '2', role: 'assistant' as const, text: 'When do they disappear?' },
    { id: '3', role: 'user' as const, text: 'After saving and refreshing.' },
  ];
  const output = {
    reply: 'Let’s check that saved customer edits survive refreshing.',
    proposedGoal: {
      description: 'Customer edits disappear after refresh.',
      expectedBehavior: 'Saved customer edits survive refreshing.',
      performance: null,
    },
  };
  const request = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      done: true,
      message: { content: JSON.stringify(output) },
    }),
  );
  await expect(
    createGoalConversation({
      url: 'http://localhost:11434',
      model: 'local',
      fetch: request,
    })({ ...input, messages }),
  ).resolves.toEqual(output);
  const body = JSON.parse(String(request.mock.calls[0][1]?.body));
  expect(body.messages.slice(1)).toEqual(
    messages.map((message) => ({ role: message.role, content: message.text })),
  );
  expect(body.messages[0].content).toContain(
    'Never ask again for a fact already given',
  );
});

it.each([
  { reply: 'Hello', proposedGoal: null, extra: 'unexpected' },
  { reply: 'Hello' },
  {
    reply: 'Hello',
    proposedGoal: {
      description: 'Goal',
      expectedBehavior: 'Behavior',
      performance: { action: 'Read', maxDurationMs: 100 },
    },
  },
])(
  'rejects goal output that does not match the requested model schema',
  async (output) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: JSON.stringify(output) },
          },
        ],
      }),
    );
    await expect(
      createGoalConversation({
        provider: 'openrouter',
        url: '',
        model: 'test',
        apiKey: 'test',
        fetch: request,
      })(input),
    ).rejects.toMatchObject({ code: 'model_unavailable' });
  },
);
