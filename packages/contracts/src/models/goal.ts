import type { GoalRevisionId } from './common.js';

export interface GoalDraft {
  description: string;
  expectedBehavior: string;
  /** Performance goals specify the action and threshold; bug goals use null. */
  performance: { action: string; maxDurationMs: number } | null;
}
export type Goal = GoalDraft &
  (
    | { status: 'proposed'; revisionId: GoalRevisionId }
    | { status: 'confirmed'; revisionId: GoalRevisionId }
  );
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}
