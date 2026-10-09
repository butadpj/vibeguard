import type { Approval } from './release.js';
import type {
  ApiError,
  EnvironmentId,
  JobId,
  ProjectId,
  VersionId,
} from './common.js';
import type { ConversationMessage, Goal } from './goal.js';
import type { VerificationResult } from './verification.js';

export const setupStatuses = [
  'not_prepared',
  'preparing',
  'ready',
  'incomplete',
  'unsupported',
] as const;
export type SetupStatus = (typeof setupStatuses)[number];
/** US1: readiness of the supported demo app and its local database.
 * ready requires a running app/database independent of founder-platform services.
 * unsupported means the import does not fit the supported demo setup.
 * incomplete means preparation could not finish; issue explains the blocker.
 * Model and harness diagnostics stay internal to the runner. */
export interface SetupState {
  status: SetupStatus;
  message: string;
  issue: ApiError | null;
}
export interface CodeVersion {
  id: VersionId;
  parentVersionId: VersionId | null;
  kind: 'original' | 'candidate';
  /** Digest of frozen project content, assigned by the runner. */
  contentDigest: string;
}
export interface Preview {
  environmentId: EnvironmentId;
  versionId: VersionId;
  url: string;
}
export interface Project {
  id: ProjectId;
  name: string;
  setup: SetupState;
  originalVersion: CodeVersion;
  candidateVersion: CodeVersion | null;
  goal: Goal | null;
  messages: ConversationMessage[];
  previews: Preview[];
  baseline: VerificationResult | null;
  latestVerification: VerificationResult | null;
  approval: Approval | null;
  activeJobId: JobId | null;
}
