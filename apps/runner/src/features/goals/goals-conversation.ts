import { randomUUID } from 'node:crypto';
import type {
  ConversationMessage,
  Goal,
  GoalDraft,
  JobResultMap,
  Project,
} from '@vibeguard/contracts';
import { ReleaseError } from '../../lib/release-error.js';
import type { ProjectsStore } from '../projects/projects-store.js';

/** Local model adapter. Return structured data; only the founder can confirm a goal. */
export type GoalConversation = (input: {
  projectId: Project['id'];
  name: Project['name'];
  messages: ConversationMessage[];
  goal: Goal | null;
}) => Promise<{ reply: string; proposedGoal: GoalDraft | null }>;

function text(value: unknown, limit: number) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > limit ||
    /\x00/.test(value)
  )
    throw new ReleaseError(
      'invalid_request',
      'Provide nonempty text within the supported length.',
    );
  return value.trim();
}
export function parseMessage(value: unknown): string {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => key !== 'text')
  )
    throw new ReleaseError(
      'invalid_request',
      'Send a message with a text field.',
    );
  return text((value as { text?: unknown }).text, 4000);
}
export function parseGoalDraft(value: unknown): GoalDraft {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) =>
        !['description', 'expectedBehavior', 'performance'].includes(key),
    )
  )
    throw new ReleaseError(
      'invalid_request',
      'Provide a goal description and expected behavior.',
    );
  const input = value as Record<string, unknown>;
  let performance: GoalDraft['performance'] = null;
  if (input.performance !== null) {
    const item = input.performance;
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      Object.keys(item).some(
        (key) => !['action', 'maxDurationMs'].includes(key),
      )
    )
      throw new ReleaseError(
        'invalid_request',
        'Provide a performance action and duration, or null.',
      );
    const fields = item as Record<string, unknown>;
    if (
      typeof fields.maxDurationMs !== 'number' ||
      !Number.isFinite(fields.maxDurationMs) ||
      fields.maxDurationMs <= 0
    )
      throw new ReleaseError(
        'invalid_request',
        'The performance duration must be a positive number.',
      );
    performance = {
      action: text(fields.action, 500),
      maxDurationMs: fields.maxDurationMs,
    };
  }
  return {
    description: text(input.description, 4000),
    expectedBehavior: text(input.expectedBehavior, 4000),
    performance,
  };
}

export async function sendMessage(
  store: ProjectsStore,
  project: Project,
  message: string,
  converse: GoalConversation | undefined,
): Promise<JobResultMap['message']> {
  const updated = await store.update(project.id, (current) => ({
    ...current,
    messages: [
      ...current.messages,
      { id: randomUUID(), role: 'user', text: message },
    ],
  }));
  if (!converse)
    throw new ReleaseError(
      'model_unavailable',
      'Local goal conversation is not configured yet.',
      'Connect the local model conversation adapter, then send a message.',
    );
  const output = await converse({
    projectId: project.id,
    name: updated.name,
    messages: structuredClone(updated.messages.slice(-20)),
    goal: structuredClone(updated.goal),
  });
  let reply: ConversationMessage;
  let proposedGoal: Extract<Goal, { status: 'proposed' }> | null;
  try {
    reply = {
      id: randomUUID(),
      role: 'assistant',
      text: text(output.reply, 6000),
    };
    proposedGoal =
      output.proposedGoal === null
        ? null
        : {
            ...parseGoalDraft(output.proposedGoal),
            status: 'proposed',
            revisionId: randomUUID(),
          };
  } catch {
    throw new ReleaseError(
      'model_unavailable',
      'The local model returned an invalid goal response.',
      'Retry the conversation after checking the local model adapter.',
    );
  }
  await store.update(project.id, (current) => ({
    ...current,
    messages: [...current.messages, reply],
    goal: proposedGoal ?? current.goal,
  }));
  return { reply, proposedGoal };
}
