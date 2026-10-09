import type { RepairAttempt } from './job.js';
import type { VerificationResult } from './verification.js';

/** Reviewed text changes only. Process logs, prompts and tooling stay private. */
export interface RepairFileChange {
  file: string;
  before: string | null;
  after: string | null;
}
export interface RepairEvidenceResponse {
  projectId: string;
  sourceVersionId: string;
  goalRevisionId: string;
  attempts: {
    attempt: RepairAttempt;
    durationMs: number;
    changes: RepairFileChange[];
    verification: VerificationResult | null;
  }[];
}
export interface RepairDiffResponse {
  artifactId: string;
  projectId: string;
  versionId: string;
  verificationId: string;
  changes: RepairFileChange[];
}
