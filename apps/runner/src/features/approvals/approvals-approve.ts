import { randomUUID } from 'node:crypto';
import type {
  Approval,
  ApproveFixRequest,
  Project,
  VerificationResult,
} from '@vibeguard/contracts';
import { isSafeId } from '../../lib/confined-path.js';
import { ReleaseError } from '../../lib/release-error.js';
import type { ReleaseWorkspace } from '../../lib/release-workspace.js';
import type { ApprovalStore } from './approvals-store.js';
import { directoryDigest } from '../../lib/directory-digest.js';

const CRUD_SCOPES = ['create', 'read', 'update', 'delete'] as const;

export function parseApproveRequest(body: unknown): ApproveFixRequest {
  const value = (body ?? {}) as Partial<ApproveFixRequest>;
  if (
    !isSafeId(value.versionId) ||
    !isSafeId(value.goalRevisionId) ||
    !isSafeId(value.verificationId)
  ) {
    throw new ReleaseError(
      'invalid_request',
      'The approval request is missing the version, goal, or check result.',
      'Reload the project and try again.',
    );
  }
  return {
    versionId: value.versionId,
    goalRevisionId: value.goalRevisionId,
    verificationId: value.verificationId,
  };
}

function stale(message: string): ReleaseError {
  return new ReleaseError(
    'version_mismatch',
    message,
    'Run checks on the current version before approving.',
  );
}

/** Every rule the spec puts on Approve fix, checked against runner state.
 * Returns the pieces approval needs. Throws a ReleaseError otherwise. */
function requireCheckedFix(project: Project, request: ApproveFixRequest) {
  const goal = project.goal;
  if (!goal || goal.status !== 'confirmed') {
    throw new ReleaseError(
      'conflict',
      'The goal has not been confirmed.',
      'Confirm the goal, then check the fix.',
    );
  }
  if (goal.revisionId !== request.goalRevisionId) {
    throw stale('The goal changed after this fix was checked.');
  }
  const candidate = project.candidateVersion;
  if (!candidate || candidate.id !== request.versionId) {
    throw stale('This is not the version that was checked.');
  }
  const verification = project.latestVerification;
  if (!verification || verification.id !== request.verificationId) {
    throw stale('These are not the latest check results.');
  }
  if (
    verification.versionId !== candidate.id ||
    verification.goalRevisionId !== goal.revisionId
  ) {
    throw stale('The check results belong to a different version or goal.');
  }
  const baseline = project.baseline;
  if (
    !baseline ||
    baseline.versionId !== project.originalVersion.id ||
    baseline.verdict !== 'failed'
  ) {
    throw new ReleaseError(
      'conflict',
      'The problem was never reproduced on the original project.',
      'Run the baseline checks first. A fix cannot be verified without them.',
    );
  }
  if (baseline.checkSetId !== verification.checkSetId) {
    throw stale('The checks changed between the baseline and the fix.');
  }
  const notPassed = (result: VerificationResult) =>
    result.verdict !== 'passed' ||
    result.checks.some((check) => check.verdict !== 'passed') ||
    CRUD_SCOPES.some(
      (scope) =>
        !result.checks.some(
          (check) => check.scope === scope && check.verdict === 'passed',
        ),
    );
  if (notPassed(verification)) {
    throw new ReleaseError(
      'conflict',
      'Not every required check passed, so this fix cannot be approved.',
      'Run the repair again or review the failed checks.',
    );
  }
  return { goal, candidate, verification, baseline };
}

/** Approve fix (US5). Records approval of the exact checked version and keeps
 * its checks. Approving again changes nothing. Never writes to any version. */
export async function approveFix(
  deps: { workspace: ReleaseWorkspace; store: ApprovalStore },
  projectId: string,
  request: ApproveFixRequest,
): Promise<Approval> {
  const project = await deps.workspace.getProject(projectId);
  if (!project) {
    throw new ReleaseError('not_found', 'That project could not be found.');
  }
  const { goal, candidate, verification, baseline } = requireCheckedFix(
    project,
    request,
  );

  // "Exact checked code": files on disk must still match the checked digest.
  const digest = await deps.workspace.versionDigest(projectId, candidate.id);
  if (digest === null) {
    throw new ReleaseError(
      'not_found',
      'The checked version could not be found.',
      'Run the repair again.',
    );
  }
  if (digest !== candidate.contentDigest) {
    throw stale('The code changed after the checks ran.');
  }
  // Prove the original is still the one that was imported.
  const originalDigest = await deps.workspace.versionDigest(
    projectId,
    project.originalVersion.id,
  );
  if (originalDigest !== project.originalVersion.contentDigest) {
    throw stale('The original project no longer matches what was imported.');
  }
  const checkSet = await deps.workspace.checkSetDirectory(
    projectId,
    verification.checkSetId,
  );
  if (!checkSet) {
    throw new ReleaseError(
      'check_unavailable',
      'The checks that proved this fix could not be found.',
      'Run the checks again before approving.',
    );
  }

  if (
    verification.checkSetDigest &&
    (verification.checkSetDigest !== baseline.checkSetDigest ||
      (await directoryDigest(checkSet, true)) !== verification.checkSetDigest)
  )
    throw stale('The protected checks changed after verification.');

  const existing = (await deps.store.list(projectId)).find(
    ({ approval }) =>
      approval.versionId === candidate.id &&
      approval.goalRevisionId === goal.revisionId &&
      approval.verificationId === verification.id,
  );
  if (existing) {
    await deps.workspace.recordApproval(projectId, existing.approval);
    return existing.approval;
  }

  const approval: Approval = {
    id: `approval_${randomUUID().slice(0, 8)}`,
    projectId,
    versionId: candidate.id,
    goalRevisionId: goal.revisionId,
    verificationId: verification.id,
  };
  await deps.store.save(
    {
      approval,
      projectName: project.name,
      approvedAt: new Date().toISOString(),
      goal,
      baseline,
      verification,
      checkSetId: verification.checkSetId,
      contentDigest: digest,
      originalVersionId: project.originalVersion.id,
      originalDigest,
    },
    checkSet,
  );
  await deps.workspace.recordApproval(projectId, approval);
  return approval;
}
