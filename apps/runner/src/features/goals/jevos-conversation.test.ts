import { expect, it, vi } from 'vitest';
import type { GoalConversation } from './goals-conversation.js';
import { createJevosConversation } from './jevos-conversation.js';

const input: Parameters<GoalConversation>[0] = {
  projectId: 'p',
  name: 'Demo',
  messages: [
    { id: '1', role: 'user', text: 'Customer edits disappear.' },
    { id: '2', role: 'assistant', text: 'When do they disappear?' },
    { id: '3', role: 'user', text: 'After saving and refreshing.' },
  ],
  goal: null,
};
const fallbackOutput = {
  reply: 'Let’s check that saved customer edits survive refreshing.',
  proposedGoal: {
    description: 'Customer edits disappear after refresh.',
    expectedBehavior: 'Saved customer edits survive refreshing.',
    performance: null,
  },
};
function decision(choice: string, confidence = 0.95) {
  return {
    model: 'jevos-v4',
    answers: {
      next_action: {
        type: 'choice',
        choice,
        confidence,
        probabilities: {
          missing_action: choice === 'missing_action' ? 0.97 : 0.01,
          missing_actual: choice === 'missing_actual' ? 0.97 : 0.01,
          missing_expected: choice === 'missing_expected' ? 0.97 : 0.01,
          ready: choice === 'ready' ? 0.97 : 0.01,
        },
      },
    },
  };
}

it.each([
  ['missing_action', 'What were you doing when it went wrong?'],
  ['missing_actual', 'What happens when you do that?'],
  ['missing_expected', 'What should happen instead?'],
])(
  'asks a confident %s clarification without invoking Qwen',
  async (choice, reply) => {
    const fallback = vi
      .fn<GoalConversation>()
      .mockResolvedValue(fallbackOutput);
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(decision(choice)));
    const converse = createJevosConversation({
      url: 'http://127.0.0.1:8017',
      fallback,
      fetch: request,
    });
    await expect(converse(input)).resolves.toEqual({
      reply,
      proposedGoal: null,
    });
    expect(fallback).not.toHaveBeenCalled();
    expect(String(request.mock.calls[0][0])).toBe(
      'http://127.0.0.1:8017/v1/systemone',
    );
    expect(request.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      redirect: 'error',
      signal: expect.any(AbortSignal),
    });
    const body = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      model: 'jevos-v4',
      state: {
        messages: input.messages.map(({ role, text }) => ({ role, text })),
        goal: null,
      },
      questions: {
        next_action: {
          type: 'choice',
          criteria: {
            missing_action: expect.any(String),
            missing_actual: expect.any(String),
            missing_expected: expect.any(String),
            ready: expect.any(String),
          },
        },
      },
    });
  },
);

it.each([
  {
    missing_action: 0.01,
    missing_actual: '0.97',
    missing_expected: 0.01,
    ready: 0.01,
  },
  {
    missing_action: 0.01,
    missing_actual: 2,
    missing_expected: 0.01,
    ready: 0.01,
  },
  {
    missing_action: 0.97,
    missing_actual: 0.01,
    missing_expected: 0.01,
    ready: 0.01,
  },
  { missing_actual: 0.97 },
])(
  'falls back when decision probabilities are invalid or disagree with the chosen action',
  async (probabilities) => {
    const response = decision('missing_actual');
    const fallback = vi
      .fn<GoalConversation>()
      .mockResolvedValue(fallbackOutput);
    const converse = createJevosConversation({
      url: 'http://localhost:8017',
      fallback,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          model: 'jevos-v4',
          answers: {
            next_action: { ...response.answers.next_action, probabilities },
          },
        }),
      ),
    });
    await expect(converse(input)).resolves.toEqual(fallbackOutput);
    expect(fallback).toHaveBeenCalledExactlyOnceWith(input);
  },
);

it('sends oversized history directly to Qwen instead of truncating context for Jevos', async () => {
  const fallback = vi.fn<GoalConversation>().mockResolvedValue(fallbackOutput);
  const request = vi.fn<typeof fetch>();
  const largeInput = {
    ...input,
    messages: [
      ...input.messages,
      { id: '4', role: 'user' as const, text: '🧠'.repeat(2000) },
    ],
  };
  await expect(
    createJevosConversation({
      url: 'http://localhost:8017',
      fallback,
      fetch: request,
    })(largeInput),
  ).resolves.toEqual(fallbackOutput);
  expect(fallback).toHaveBeenCalledExactlyOnceWith(largeInput);
  expect(request).not.toHaveBeenCalled();
});

it.each([
  decision('ready'),
  { ...decision('missing_actual'), model: 'unexpected-model' },
  decision('missing_actual', 0.79),
  decision('unrecognized'),
  decision('missing_actual', 2),
  { answers: { next_action: { type: 'choice', choice: 'missing_actual' } } },
  {},
])(
  'uses the original conversation when a decision cannot safely ask a question',
  async (response) => {
    const fallback = vi
      .fn<GoalConversation>()
      .mockResolvedValue(fallbackOutput);
    const converse = createJevosConversation({
      url: 'http://localhost:8017',
      fallback,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(Response.json(response)),
    });
    await expect(converse(input)).resolves.toEqual(fallbackOutput);
    expect(fallback).toHaveBeenCalledExactlyOnceWith(input);
  },
);

it.each([
  ['missing_action', 'What were you doing when it went wrong?'],
  ['missing_actual', 'What happens when you do that?'],
  ['missing_expected', 'What should happen instead?'],
])('does not repeat its earlier %s question', async (choice, text) => {
  const fallback = vi.fn<GoalConversation>().mockResolvedValue(fallbackOutput);
  const withPreviousQuestion = {
    ...input,
    messages: [
      ...input.messages,
      { id: '4', role: 'assistant' as const, text },
    ],
  };
  const converse = createJevosConversation({
    url: 'http://jevos:8017',
    fallback,
    fetch: vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(decision(choice))),
  });
  await expect(converse(withPreviousQuestion)).resolves.toEqual(fallbackOutput);
  expect(fallback).toHaveBeenCalledExactlyOnceWith(withPreviousQuestion);
});

it.each([
  () => Promise.resolve(new Response('private service error', { status: 503 })),
  () => Promise.resolve(new Response('invalid JSON')),
  () => Promise.reject(new TypeError('fetch failed')),
  () => Promise.reject(new DOMException('Request timed out', 'TimeoutError')),
])(
  'keeps goal chat available when the decision service fails',
  async (respond) => {
    const fallback = vi
      .fn<GoalConversation>()
      .mockResolvedValue(fallbackOutput);
    const converse = createJevosConversation({
      url: 'http://host.docker.internal:8017',
      fallback,
      fetch: vi.fn<typeof fetch>().mockImplementation(respond),
    });
    await expect(converse(input)).resolves.toEqual(fallbackOutput);
    expect(fallback).toHaveBeenCalledExactlyOnceWith(input);
  },
);

it.each([
  'https://example.com',
  'http://example.com:8017',
  'http://user:secret@localhost:8017',
  'http://localhost:8017/private',
  'http://localhost:8017?private=1',
  'http://localhost:8017#private',
])(
  'rejects unsafe decision service address %s before sending messages',
  (url) => {
    const request = vi.fn<typeof fetch>();
    expect(() =>
      createJevosConversation({
        url,
        fallback: vi.fn<GoalConversation>(),
        fetch: request,
      }),
    ).toThrow();
    expect(request).not.toHaveBeenCalled();
  },
);
