import type {
  ApprovalId,
  GoalRevisionId,
  VerificationId,
  VersionId,
} from '../models/common.js';
import type { Goal, GoalDraft } from '../models/goal.js';
import type { Job, JobAccepted } from '../models/job.js';
import type { Project } from '../models/project.js';
import type { Approval } from '../models/release.js';
import type {
  RepairEvidenceResponse,
  RepairDiffResponse,
} from '../models/repair-evidence.js';

/** Multipart/form-data: file is a ZIP; name is an optional display label.
 * Browser clients supply File/Blob; server adapters validate incoming bytes. */
export interface ImportProjectRequest {
  file: Blob;
  name?: string;
}
export type ImportProjectResponse = Project;
export type GetProjectResponse = Project;
export type PrepareProjectResponse = JobAccepted;
export interface SendMessageRequest {
  text: string;
}
export type SendMessageResponse = JobAccepted;
/** Editing a draft creates a new confirmed revision. expectedRevisionId guards stale UI. */
export interface ConfirmGoalRequest {
  expectedRevisionId: GoalRevisionId;
  goal: GoalDraft;
}
export type ConfirmGoalResponse = Extract<Goal, { status: 'confirmed' }>;
export interface RunChecksRequest {
  versionId: VersionId;
  goalRevisionId: GoalRevisionId;
}
export type RunChecksResponse = JobAccepted;
export interface RepairRequest {
  sourceVersionId: VersionId;
  goalRevisionId: GoalRevisionId;
  baselineVerificationId: VerificationId;
}
export type RepairResponse = JobAccepted;
export type GetRepairEvidenceResponse = RepairEvidenceResponse;
export type GetRepairDiffResponse = RepairDiffResponse;
export type GetJobResponse = Job;
/** Cancellation response is the current job; completion can win the race. */
export type CancelJobResponse = Job;
export interface ApproveFixRequest {
  versionId: VersionId;
  goalRevisionId: GoalRevisionId;
  verificationId: VerificationId;
}
export type ApproveFixResponse = Approval;
/** Runner chooses a managed destination; clients never supply filesystem paths. */
export interface ExportProjectRequest {
  approvalId: ApprovalId;
  format: 'zip' | 'folder';
}
export type ExportProjectResponse = JobAccepted;
/** Run an approval's retained checks on a later version. The job is a
 * `check` job; its result lists any check that passed at approval and fails now. */
export interface RecheckRequest {
  approvalId: ApprovalId;
  versionId: VersionId;
}
export type RecheckResponse = JobAccepted;
