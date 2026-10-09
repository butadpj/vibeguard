import type {
  ApprovalId,
  ArtifactId,
  GoalRevisionId,
  ProjectId,
  VerificationId,
  VersionId,
} from './common.js';

export interface Approval {
  id: ApprovalId;
  projectId: ProjectId;
  versionId: VersionId;
  goalRevisionId: GoalRevisionId;
  verificationId: VerificationId;
}
export interface ExportArtifact {
  id: ArtifactId;
  approvalId: ApprovalId;
  versionId: VersionId;
  format: 'zip' | 'folder';
  displayName: string;
  /** Runner-provided download URL for ZIP; null for a saved folder. */
  downloadUrl: string | null;
  /** Display-only destination, never accepted back as an input path. */
  savedLocation: string;
}
