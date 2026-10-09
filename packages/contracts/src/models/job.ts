import type {
  ApiError,
  ArtifactId,
  GoalRevisionId,
  JobId,
  ProjectId,
  VerificationId,
  VersionId,
} from './common.js';
import type { ConversationMessage, Goal } from './goal.js';
import type { CodeVersion, Preview, SetupState } from './project.js';
import type { ExportArtifact } from './release.js';
import type { VerificationResult } from './verification.js';

export const jobOperations = [
  'prepare',
  'message',
  'check',
  'repair',
  'export',
] as const;
export type JobOperation = (typeof jobOperations)[number];
export const jobStatuses = [
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export type JobStatus = (typeof jobStatuses)[number];
export const jobSteps = [
  'preparing',
  'preparing_model',
  'investigating',
  'editing',
  'checking',
  'exporting',
  'finished',
] as const;
export interface JobProgress {
  step: (typeof jobSteps)[number];
  message: string;
}
export const repairOutcomes = ['checked', 'no_verified_fix'] as const;
export interface RepairAttempt {
  number: 1 | 2;
  sourceVersionId: VersionId;
  candidateVersionId: VersionId | null;
  verificationId: VerificationId | null;
  issue: ApiError | null;
}
export type RepairResult = {
  baselineVerificationId: VerificationId;
  attempts: RepairAttempt[];
  summary: string;
  diffArtifactId: ArtifactId | null;
} & (
  | {
      outcome: 'checked';
      candidateVersion: CodeVersion;
      verification: VerificationResult;
    }
  | {
      outcome: 'no_verified_fix';
      candidateVersion: CodeVersion | null;
      verification: VerificationResult | null;
    }
);
export interface JobResultMap {
  prepare: { setup: SetupState; previews: Preview[] };
  message: {
    reply: ConversationMessage;
    proposedGoal: Extract<Goal, { status: 'proposed' }> | null;
  };
  check: VerificationResult;
  repair: RepairResult;
  export: ExportArtifact;
}
type JobLifecycle<R> =
  | { status: 'running'; result: null; error: null }
  | { status: 'succeeded'; result: R; error: null }
  | { status: 'failed'; result: null; error: ApiError }
  | { status: 'cancelled'; result: null; error: null };
/** Narrow operation first, then status, to access the typed result. */
export type Job<O extends JobOperation = JobOperation> = {
  [K in O]: {
    id: JobId;
    projectId: ProjectId;
    operation: K;
    goalRevisionId: GoalRevisionId | null;
    versionId: VersionId | null;
    progress: JobProgress;
    /** Persist attempts even when cancellation or failure ends the job. */
    repairAttempts: RepairAttempt[];
  } & JobLifecycle<JobResultMap[K]>;
}[O];
export interface JobAccepted {
  jobId: JobId;
}
