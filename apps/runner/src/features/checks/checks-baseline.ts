import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  CheckResult,
  Goal,
  JobProgress,
  Project,
  RunChecksRequest,
  VerificationResult,
} from '@vibeguard/contracts';
import { isSafeId } from '../../lib/confined-path.js';
import { directoryDigest } from '../../lib/directory-digest.js';
import { copyEditableDirectory } from '../../lib/editable-copy.js';
import { ReleaseError } from '../../lib/release-error.js';
import type { ReleaseWorkspace } from '../../lib/release-workspace.js';
import type { ProjectsStore } from '../projects/projects-store.js';

/** Trusted verifier installed by the runner, never supplied in an upload or HTTP request.
 * It owns fresh app/database startup and cleanup, including failure paths.
 * Exercise application actions and persisted data; SQL health alone is not a baseline.
 */
export interface BaselineChecks {
  checkSetId: string;
  run(input: {
    projectId: string;
    versionId: string;
    goal: Extract<Goal, { status: 'confirmed' }>;
    targetDirectory: string;
    checksDirectory: string;
    report: (progress: JobProgress) => void;
  }): Promise<CheckResult[]>;
}

export function parseChecksRequest(body: unknown): RunChecksRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new ReleaseError(
      'invalid_request',
      'Choose a version and confirmed goal to check.',
    );
  const value = body as Record<string, unknown>;
  if (
    !isSafeId(value.versionId) ||
    !isSafeId(value.goalRevisionId) ||
    Object.keys(value).some(
      (key) => !['versionId', 'goalRevisionId'].includes(key),
    )
  )
    throw new ReleaseError(
      'invalid_request',
      'Choose a version and confirmed goal to check.',
    );
  return { versionId: value.versionId, goalRevisionId: value.goalRevisionId };
}

export function requireBaseline(project: Project, request: RunChecksRequest) {
  if (
    project.goal?.status !== 'confirmed' ||
    project.goal.revisionId !== request.goalRevisionId
  )
    throw new ReleaseError(
      'version_mismatch',
      'Confirm the current goal before running checks.',
    );
  if (project.originalVersion.id !== request.versionId)
    throw new ReleaseError(
      'version_mismatch',
      'Baseline checks must use the imported original version.',
    );
  if (project.setup.status !== 'ready')
    throw new ReleaseError(
      'check_unavailable',
      'Prepare the app and database before running checks.',
      'Retry preparation, then run checks.',
    );
  return project.goal;
}

function validateChecks(value: unknown): CheckResult[] {
  const fail = () => {
    throw new ReleaseError(
      'check_unavailable',
      'The verifier returned invalid evidence.',
      'Check the protected integration suite and retry.',
    );
  };
  if (!Array.isArray(value) || !value.length || value.length > 100)
    return fail();
  const ids = new Set<string>();
  const text = (input: unknown, max: number) =>
    typeof input === 'string' && input.trim().length > 0 && input.length <= max;
  for (const check of value) {
    if (
      !check ||
      !isSafeId(check.id) ||
      ids.has(check.id) ||
      !text(check.name, 500) ||
      !['goal', 'create', 'read', 'update', 'delete'].includes(check.scope) ||
      !['passed', 'failed', 'could_not_check'].includes(check.verdict) ||
      !text(check.explanation, 4000) ||
      !Array.isArray(check.evidence) ||
      !check.evidence.length ||
      check.evidence.length > 20
    )
      return fail();
    ids.add(check.id);
    for (const evidence of check.evidence) {
      if (
        !evidence ||
        !isSafeId(evidence.id) ||
        !['observation', 'timing', 'artifact'].includes(evidence.kind) ||
        !text(evidence.summary, 6000) ||
        !(evidence.artifactId === null || isSafeId(evidence.artifactId)) ||
        !(
          evidence.durationMs === null ||
          (typeof evidence.durationMs === 'number' &&
            Number.isFinite(evidence.durationMs) &&
            evidence.durationMs >= 0)
        )
      )
        return fail();
    }
  }
  return structuredClone(value);
}

export async function runBaseline(
  deps: {
    projects: ProjectsStore;
    workspace: ReleaseWorkspace;
    baselineChecks?: BaselineChecks;
  },
  projectId: string,
  request: RunChecksRequest,
  report: (progress: JobProgress) => void,
): Promise<VerificationResult> {
  const project = await deps.projects.require(projectId);
  const goal = requireBaseline(project, request);
  const suite = deps.baselineChecks;
  if (!suite)
    throw new ReleaseError(
      'check_unavailable',
      'The protected baseline integration checks are not configured yet.',
      'Connect the verification owner’s suite and retry.',
    );
  const checksDirectory = await deps.workspace.checkSetDirectory(
    projectId,
    suite.checkSetId,
  );
  const source = await deps.workspace.versionDirectory(
    projectId,
    request.versionId,
  );
  if (!checksDirectory || !source)
    throw new ReleaseError(
      'check_unavailable',
      'The imported version or protected check set is unavailable.',
    );
  if (
    (await deps.workspace.versionDigest(projectId, request.versionId)) !==
    project.originalVersion.contentDigest
  )
    throw new ReleaseError(
      'version_mismatch',
      'The original files no longer match the imported version.',
    );
  const checksDigest = await directoryDigest(checksDirectory, true);
  const scratch = await mkdtemp(join(tmpdir(), 'vibeguard-baseline-'));
  const targetDirectory = join(scratch, 'app');
  try {
    await copyEditableDirectory(source, targetDirectory);
    await deps.projects.update(projectId, (current) => ({
      ...current,
      baseline: null,
    }));
    report({
      step: 'checking',
      message:
        'Running protected integration checks on a fresh app and database.',
    });
    let checks: CheckResult[];
    try {
      checks = validateChecks(
        await suite.run({
          projectId,
          versionId: request.versionId,
          goal,
          targetDirectory,
          checksDirectory,
          report,
        }),
      );
    } catch (error) {
      if (error instanceof ReleaseError) throw error;
      throw new ReleaseError(
        'check_unavailable',
        'The baseline integration checks could not finish.',
        'Check the test app/database setup and retry.',
      );
    }
    if (
      (await deps.workspace.versionDigest(projectId, request.versionId)) !==
        project.originalVersion.contentDigest ||
      (await directoryDigest(checksDirectory, true)) !== checksDigest
    )
      throw new ReleaseError(
        'version_mismatch',
        'The original version or protected checks changed during verification.',
      );
    const scopes = new Set(checks.map((check) => check.scope));
    const missingScopes = ['goal', 'create', 'read', 'update', 'delete'].filter(
      (scope) => !scopes.has(scope as CheckResult['scope']),
    );
    if (missingScopes.length)
      checks.push({
        id: `coverage_${randomUUID()}`,
        name: 'Required integration coverage',
        scope: 'goal',
        verdict: 'could_not_check',
        explanation:
          'The protected suite did not check all required application behavior.',
        evidence: [
          {
            id: 'missing_scopes',
            kind: 'observation',
            summary: `Missing checks: ${missingScopes.join(', ')}.`,
            artifactId: null,
            durationMs: null,
          },
        ],
      });
    const verification: VerificationResult = {
      id: `verification_${randomUUID()}`,
      projectId,
      versionId: request.versionId,
      goalRevisionId: request.goalRevisionId,
      checkSetId: suite.checkSetId,
      verdict: checks.some((check) => check.verdict === 'failed')
        ? 'failed'
        : checks.some((check) => check.verdict === 'could_not_check')
          ? 'could_not_check'
          : 'passed',
      checks,
    };
    await deps.projects.update(projectId, (current) => {
      requireBaseline(current, request);
      if (
        current.originalVersion.contentDigest !==
        project.originalVersion.contentDigest
      )
        throw new ReleaseError(
          'version_mismatch',
          'The imported version changed during verification.',
        );
      return { ...current, baseline: verification };
    });
    return verification;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
