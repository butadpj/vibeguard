/** Opaque runner-issued IDs. Consumers must not interpret IDs as paths. */
export type ProjectId = string;
export type JobId = string;
export type VersionId = string;
export type GoalRevisionId = string;
export type VerificationId = string;
export type ApprovalId = string;
export type EnvironmentId = string;
export type ArtifactId = string;

export const errorCodes = [
  'invalid_request',
  'not_found',
  'not_implemented',
  'conflict',
  'unsupported_setup',
  'setup_incomplete',
  'model_unavailable',
  'harness_unavailable',
  'check_unavailable',
  'repair_exhausted',
  'version_mismatch',
  'interrupted',
  'timeout',
  'internal_error',
] as const;
export type ErrorCode = (typeof errorCodes)[number];
export interface ApiError {
  code: ErrorCode;
  message: string;
  nextStep: string | null;
}
export interface ErrorResponse {
  error: ApiError;
}
export type HealthResponse = { status: 'ok'; service: 'vibeguard-runner' };
