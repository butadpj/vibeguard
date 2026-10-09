import { enrichEvent } from '../../lib/logging.js';
import { ReleaseError } from '../../lib/release-error.js';
import { parseGoalDraft, type GoalConversation } from './goals-conversation.js';

/** Structured output proposes a goal; only the founder can confirm it. */
export function createGoalConversation(options: {
  provider?: 'ollama' | 'openrouter';
  apiKey?: string;
  url: string;
  model: string;
  fetch?: typeof fetch;
}): GoalConversation {
  const cloud = options.provider === 'openrouter';
  const url = new URL(cloud ? 'https://openrouter.ai' : options.url);
  if (
    !cloud &&
    (url.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost', '[::1]', 'host.docker.internal'].includes(
        url.hostname,
      ) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/')
  )
    throw new Error('Configure a local Ollama HTTP origin.');
  return async (input) => {
    const started = performance.now();
    enrichEvent({
      model_provider: cloud ? 'openrouter' : 'ollama',
      model: options.model,
      model_stage: 'request',
      message_count: input.messages.length,
    });
    try {
      if (cloud && !options.apiKey?.trim())
        throw new ReleaseError(
          'model_unavailable',
          'The OpenRouter API key is missing.',
          'Set OPENROUTER_API_KEY in .env and restart the runner.',
        );
      const body = {
        model: options.model,
        stream: false,
        format: {
          type: 'object',
          required: ['reply', 'proposedGoal'],
          properties: {
            reply: { type: 'string' },
            proposedGoal: {
              anyOf: [
                { type: 'null' },
                {
                  type: 'object',
                  required: ['description', 'expectedBehavior', 'performance'],
                  properties: {
                    description: { type: 'string' },
                    expectedBehavior: { type: 'string' },
                    performance: { type: 'null' },
                  },
                  additionalProperties: false,
                },
              ],
            },
          },
          additionalProperties: false,
        },
        keep_alive: '5m',
        options: { num_ctx: 8192, num_predict: 768, temperature: 0 },
        messages: [
          {
            role: 'system',
            content:
              'You are a senior software engineer helping a founder define one testable bug goal. Read the entire conversation, including earlier answers. Use plain language and reply in at most two sentences. ' +
              'Ask only ONE concrete question about the most important missing fact: the action, what actually happens, or what should happen instead. Never ask again for a fact already given. Do not ask for code, logs, technical causes, or implementation details to define the goal. ' +
              'As soon as the action, observed failure, and expected result are clear, propose the goal now instead of asking for confirmation or more details. The founder confirms it using the UI. Infer ordinary expectations (saved edits should remain saved), but never invent observations. ' +
              'Example: user "The app is broken" => ask "What were you doing when it went wrong?", proposedGoal:null. User "I save a customer edit, but after refreshing the old value comes back" => propose the lost-edit goal immediately. ' +
              'Return JSON with reply and proposedGoal (null while a key fact is missing, otherwise {description, expectedBehavior, performance:null}). Never claim checks ran or approve a fix. The supported customer tracker check covers edits lost after saving and refreshing; use expectedBehavior exactly "Saved customer edits survive refreshing." for that goal. Do not redirect unrelated bugs into that goal. Current goal: ' +
              JSON.stringify(input.goal),
          },
          ...input.messages.map((message) => ({
            role: message.role,
            content: message.text,
          })),
        ],
      };
      const response = await (options.fetch ?? fetch)(
        new URL(cloud ? '/api/v1/chat/completions' : '/api/chat', url),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(cloud ? { Authorization: `Bearer ${options.apiKey}` } : {}),
          },
          signal: AbortSignal.timeout(cloud ? 5 * 60_000 : 30 * 60_000),
          body: JSON.stringify(
            cloud
              ? {
                  model: body.model,
                  messages: body.messages,
                  stream: false,
                  max_tokens: 2048,
                  response_format: {
                    type: 'json_schema',
                    json_schema: {
                      name: 'goal_conversation',
                      strict: true,
                      schema: body.format,
                    },
                  },
                  provider: { require_parameters: true },
                }
              : body,
          ),
        },
      );
      enrichEvent({
        model_http_status: response.status,
        model_stage: 'response',
        provider_request_id: response.headers.get('x-request-id') ?? undefined,
      });
      if (!response.ok) {
        if (cloud) {
          const nextStep =
            response.status === 401 || response.status === 403
              ? 'Check OPENROUTER_API_KEY and its permissions, then restart the runner.'
              : response.status === 402
                ? 'Add OpenRouter credits or increase the key spending limit.'
                : response.status === 429
                  ? 'Wait briefly and retry; OpenRouter rate limited the request.'
                  : 'Check the selected model and structured-output support, then retry.';
          throw new ReleaseError(
            'model_unavailable',
            `OpenRouter rejected the goal request (HTTP ${response.status}).`,
            nextStep,
          );
        }
        throw new Error('Model request failed.');
      }
      const data = await response.json();
      enrichEvent({
        model_stage: 'validation',
        model_finish_reason: cloud
          ? data.choices?.[0]?.finish_reason
          : data.done
            ? 'stop'
            : 'incomplete',
        input_tokens: cloud
          ? data.usage?.prompt_tokens
          : data.prompt_eval_count,
        output_tokens: cloud ? data.usage?.completion_tokens : data.eval_count,
      });
      const content = cloud
        ? data.choices?.[0]?.message?.content
        : data.message?.content;
      const complete = cloud
        ? data.choices?.[0]?.finish_reason === 'stop'
        : data.done === true;
      if (cloud && data.choices?.[0]?.finish_reason === 'length')
        throw new ReleaseError(
          'model_unavailable',
          'The cloud model reached the response limit before finishing.',
          'Try a shorter message or choose another goal model in VIBEGUARD_GOAL_CLOUD_MODEL.',
        );
      if (!complete || typeof content !== 'string')
        throw new Error('Incomplete model response.');
      const output = JSON.parse(content);
      if (
        !output ||
        typeof output !== 'object' ||
        Array.isArray(output) ||
        Object.keys(output).some(
          (key) => !['reply', 'proposedGoal'].includes(key),
        ) ||
        !Object.hasOwn(output, 'proposedGoal') ||
        (output.proposedGoal !== null &&
          output.proposedGoal?.performance !== null) ||
        typeof output.reply !== 'string' ||
        !output.reply.trim() ||
        output.reply.length > 6000
      )
        throw new Error('Invalid reply.');
      enrichEvent({ model_stage: 'complete' });
      return {
        reply: output.reply.trim(),
        proposedGoal:
          output.proposedGoal === null
            ? null
            : parseGoalDraft(output.proposedGoal),
      };
    } catch (error) {
      const networkCode = (
        error instanceof Error
          ? (error.cause as { code?: string } | undefined)
          : undefined
      )?.code;
      enrichEvent({
        model_error_type: error instanceof Error ? error.name : 'UnknownError',
        network_error_code: networkCode,
      });
      if (error instanceof ReleaseError && error.code === 'model_unavailable')
        throw error;
      if (cloud && error instanceof Error) {
        const code = (error.cause as { code?: string } | undefined)?.code;
        if (
          [
            'EAI_AGAIN',
            'ENOTFOUND',
            'ECONNREFUSED',
            'ETIMEDOUT',
            'ENETUNREACH',
          ].includes(code ?? '')
        )
          throw new ReleaseError(
            'model_unavailable',
            'The runner could not reach OpenRouter.',
            'Check internet access and DNS inside the runner container, then retry.',
          );
        if (error.name === 'TimeoutError' || error.name === 'AbortError')
          throw new ReleaseError(
            'model_unavailable',
            'OpenRouter did not finish within five minutes.',
            'Retry or select a faster goal model.',
          );
      }
      throw new ReleaseError(
        'model_unavailable',
        cloud
          ? 'The cloud model could not finish the goal conversation.'
          : 'The local model could not finish the goal conversation.',
        cloud
          ? 'Check your OpenRouter API key, credits, internet connection, and model structured-output support, then retry.'
          : 'Check Ollama is running with the downloaded model, then retry.',
      );
    } finally {
      enrichEvent({
        model_duration_ms: Math.round(performance.now() - started),
      });
    }
  };
}
