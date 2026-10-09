import type {
  ArtifactId,
  GoalRevisionId,
  ProjectId,
  VerificationId,
  VersionId,
} from './common.js';

export const checkVerdicts = ['passed', 'failed', 'could_not_check'] as const;
export type CheckVerdict = (typeof checkVerdicts)[number];
export interface Evidence {
  id: string;
  kind: 'observation' | 'timing' | 'artifact';
  summary: string;
  artifactId: ArtifactId | null;
  durationMs: number | null;
}
export interface CheckResult {
  id: string;
  name: string;
  scope: 'goal' | 'create' | 'read' | 'update' | 'delete';
  verdict: CheckVerdict;
  explanation: string;
  evidence: Evidence[];
}
export interface VerificationResult {
  id: VerificationId;
  projectId: ProjectId;
  versionId: VersionId;
  goalRevisionId: GoalRevisionId;
  /** Same protected check set must be used before and after repair. */
  checkSetId: string;
  /** Protected suite identity; absent on older synthetic examples. New baseline/repair checks bind it. */
  checkSetDigest?: string;
  verdict: CheckVerdict;
  checks: CheckResult[];
}
