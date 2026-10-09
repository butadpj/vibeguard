import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  CheckResult,
  CheckVerdict,
  RecheckRequest,
  VerificationResult,
} from '@vibeguard/contracts';
import { isSafeId } from '../../lib/confined-path.js';
import { copyDirectory } from '../../lib/directory-digest.js';
import { ReleaseError } from '../../lib/release-error.js';
import type { ReleaseWorkspace } from '../../lib/release-workspace.js';
import type { ApprovalStore } from '../approvals/approvals-store.js';
import {
  loadCheckDefinitions,
  runCommandCheck,
  type CheckExecutor,
} from './check-executor.js';

export interface RecheckDeps {
  workspace: ReleaseWorkspace;
  store: ApprovalStore;
  executor?: CheckExecutor;
}

export function parseRecheckRequest(body: unknown): RecheckRequest {
  const value = (body ?? {}) as Partial<RecheckRequest>;
  if (!isSafeId(value.approvalId) || !isSafeId(value.versionId)) {
    throw new ReleaseError(
      'invalid_request',
      'Choose an approved fix and a version to check.',
    );
  }
  return { approvalId: value.approvalId, versionId: value.versionId };
}

/** Check that the request points at real saved things. Runs before the job
 * starts, so mistakes come back as errors instead of failed jobs. */
export async function prepareRecheck(
  deps: RecheckDeps,
  projectId: string,
  request: RecheckRequest,
) {
  const record = await deps.store.find(projectId, request.approvalId);
  if (!record) {
    throw new ReleaseError(
      'not_found',
      'That approved fix could not be found.',
    );
  }
  const versionDirectory = await deps.workspace.versionDirectory(
    projectId,
    request.versionId,
  );
  if (!versionDirectory) {
    throw new ReleaseError(
      'not_found',
      'That version could not be found.',
      'Choose a version from this project.',
    );
  }
  return { record, versionDirectory };
}

function overall(checks: CheckResult[]): CheckVerdict {
  if (checks.some((check) => check.verdict === 'failed')) return 'failed';
  if (
    checks.length === 0 ||
    checks.some((check) => check.verdict === 'could_not_check')
  ) {
    return 'could_not_check';
  }
  return 'passed';
}

/** Run an approval's retained checks on a later local version. Checks run on
 * a fresh copy, so they cannot change the version being tested. */
export async function runRecheck(
  deps: RecheckDeps,
  projectId: string,
  request: RecheckRequest,
): Promise<VerificationResult> {
  const { record, versionDirectory } = await prepareRecheck(
    deps,
    projectId,
    request,
  );
  const checksDirectory = deps.store.checksDirectory(
    projectId,
    request.approvalId,
  );
  let definitions;
  try {
    definitions = await loadCheckDefinitions(checksDirectory);
  } catch {
    throw new ReleaseError(
      'check_unavailable',
      'The saved checks could not be read.',
      'Approve the fix again to save its checks.',
    );
  }
  const execute = deps.executor ?? runCommandCheck;
  const passedAtApproval = new Set(
    record.verification.checks
      .filter((check) => check.verdict === 'passed')
      .map((check) => check.id),
  );

  const scratch = await mkdtemp(path.join(os.tmpdir(), 'vibeguard-recheck-'));
  const freshCopy = path.join(scratch, 'app');
  const checks: CheckResult[] = [];
  try {
    await copyDirectory(versionDirectory, freshCopy);
    for (const definition of definitions) {
      const outcome = await execute(definition, {
        checksDirectory,
        targetDirectory: freshCopy,
      });
      const returned =
        outcome.verdict === 'failed' && passedAtApproval.has(definition.id);
      checks.push({
        id: definition.id,
        name: definition.name,
        scope: definition.scope,
        verdict: outcome.verdict,
        explanation: returned
          ? 'This passed when you approved the fix and fails now. The problem came back.'
          : outcome.explanation,
        evidence: outcome.evidence,
      });
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }

  const verification: VerificationResult = {
    id: `verification_${randomUUID().slice(0, 8)}`,
    projectId,
    versionId: request.versionId,
    goalRevisionId: record.goal.revisionId,
    checkSetId: record.checkSetId,
    verdict: overall(checks),
    checks,
  };
  await deps.store.saveRecheck(projectId, request.approvalId, {
    ranAt: new Date().toISOString(),
    versionId: request.versionId,
    verification,
    regressions: checks.filter(
      (check) => check.verdict === 'failed' && passedAtApproval.has(check.id),
    ),
  });
  return verification;
}
