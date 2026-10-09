import { randomUUID } from 'node:crypto';
import { mkdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  JobProgress,
  Preview,
  Project,
  RepairAttempt,
  RepairRequest,
  RepairResult,
} from '@vibeguard/contracts';
import { isSafeId } from '../../lib/confined-path.js';
import { directoryDigest } from '../../lib/directory-digest.js';
import { copyEditableDirectory } from '../../lib/editable-copy.js';
import { ReleaseError } from '../../lib/release-error.js';
import type { ReleaseWorkspace } from '../../lib/release-workspace.js';
import type { BaselineChecks } from '../checks/checks-baseline.js';
import type { ProjectsStore } from '../projects/projects-store.js';
import { runRepairTrial, type RepairAgent } from './repair-trial.js';

export interface RepairHarness {
  agent: RepairAgent;
  principles: string;
  /** Environment owner starts a preview of checked bytes, with separate data. */
  preview(input: {
    projectId: string;
    versionId: string;
    workingDirectory: string;
    report: (progress: JobProgress) => void;
  }): Promise<Preview>;
}
export interface RepairDeps {
  projects: ProjectsStore;
  workspace: ReleaseWorkspace;
  baselineChecks?: BaselineChecks;
  repairHarness?: RepairHarness;
}
export function parseRepairRequest(body: unknown): RepairRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new ReleaseError(
      'invalid_request',
      'Choose the checked source and confirmed goal.',
    );
  const value = body as Record<string, unknown>;
  if (
    !isSafeId(value.sourceVersionId) ||
    !isSafeId(value.goalRevisionId) ||
    !isSafeId(value.baselineVerificationId) ||
    Object.keys(value).some(
      (key) =>
        ![
          'sourceVersionId',
          'goalRevisionId',
          'baselineVerificationId',
        ].includes(key),
    )
  )
    throw new ReleaseError(
      'invalid_request',
      'Choose the checked source, confirmed goal, and baseline.',
    );
  return {
    sourceVersionId: value.sourceVersionId,
    goalRevisionId: value.goalRevisionId,
    baselineVerificationId: value.baselineVerificationId,
  };
}
export function requireRepair(project: Project, request: RepairRequest) {
  if (
    project.goal?.status !== 'confirmed' ||
    project.goal.revisionId !== request.goalRevisionId ||
    project.originalVersion.id !== request.sourceVersionId ||
    project.baseline?.id !== request.baselineVerificationId ||
    project.baseline.versionId !== request.sourceVersionId ||
    project.baseline.goalRevisionId !== request.goalRevisionId
  )
    throw new ReleaseError(
      'version_mismatch',
      'The goal, original version, or baseline changed. Run the baseline again.',
    );
  if (project.setup.status !== 'ready' || project.baseline.verdict !== 'failed')
    throw new ReleaseError(
      'conflict',
      'Prepare the app and reproduce the problem before repair.',
    );
  return { goal: project.goal, baseline: project.baseline };
}

export async function repairProject(
  deps: RepairDeps,
  projectId: string,
  request: RepairRequest,
  report: (progress: JobProgress) => void,
  recordAttempt: (attempt: RepairAttempt) => void,
): Promise<RepairResult> {
  const project = await deps.projects.require(projectId);
  const { goal, baseline } = requireRepair(project, request);
  const harness = deps.repairHarness;
  const suite = deps.baselineChecks;
  if (!harness)
    throw new ReleaseError(
      'harness_unavailable',
      'The isolated local repair harness is not configured.',
      'Qualify the standalone laptop trial, then connect the harness.',
    );
  if (!suite || suite.checkSetId !== baseline.checkSetId)
    throw new ReleaseError(
      'check_unavailable',
      'The original protected integration suite is unavailable.',
    );
  const source = await deps.workspace.versionDirectory(
    projectId,
    request.sourceVersionId,
  );
  const checksDirectory = await deps.workspace.checkSetDirectory(
    projectId,
    baseline.checkSetId,
  );
  if (
    !source ||
    !checksDirectory ||
    (await deps.workspace.versionDigest(projectId, request.sourceVersionId)) !==
      project.originalVersion.contentDigest
  )
    throw new ReleaseError(
      'version_mismatch',
      'Original files or protected checks are unavailable or changed.',
    );
  const root = join(deps.projects.directory, 'projects', projectId);
  for (const name of ['repairs', 'versions', 'environments']) {
    const folder = join(root, name);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    if (
      (await realpath(folder)) !==
      resolve(
        await realpath(deps.projects.directory),
        'projects',
        projectId,
        name,
      )
    )
      throw new ReleaseError(
        'invalid_request',
        'Repair storage is not confined to this project.',
      );
  }
  await deps.projects.update(projectId, (current) => {
    requireRepair(current, request);
    return {
      ...current,
      candidateVersion: null,
      latestVerification: null,
      approval: null,
      previews: current.previews.filter(
        (preview) => preview.versionId === current.originalVersion.id,
      ),
    };
  });
  const trial = await runRepairTrial({
    projectId,
    sourceVersionId: request.sourceVersionId,
    sourceDirectory: source,
    checksDirectory,
    goal,
    baseline,
    trialDirectory: join(root, 'repairs', randomUUID()),
    principles: harness.principles,
    agent: harness.agent,
    report,
    recordAttempt,
    verify: (targetDirectory, versionId) =>
      suite.run({
        projectId,
        versionId,
        goal,
        targetDirectory,
        checksDirectory,
        report,
      }),
  });
  const common = {
    baselineVerificationId: baseline.id,
    attempts: trial.attempts,
    summary: trial.summary,
    diffArtifactId: trial.diffArtifactId,
  };
  if (!trial.directory || !trial.verification || !trial.digest)
    return {
      ...common,
      outcome: 'no_verified_fix',
      candidateVersion: null,
      verification: null,
    };
  const candidateVersion = {
    id: trial.verification.versionId,
    parentVersionId: request.sourceVersionId,
    kind: 'candidate' as const,
    contentDigest: trial.digest,
  };
  const destination = join(root, 'versions', candidateVersion.id);
  await copyEditableDirectory(trial.directory, destination);
  const previewDirectory = join(root, 'environments', randomUUID());
  await copyEditableDirectory(destination, previewDirectory);
  const preview = await harness.preview({
    projectId,
    versionId: candidateVersion.id,
    workingDirectory: previewDirectory,
    report,
  });
  let valid = false;
  try {
    const url = new URL(preview.url);
    valid =
      isSafeId(preview.environmentId) &&
      preview.versionId === candidateVersion.id &&
      url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
      !url.username &&
      !url.password;
  } catch {
    /* Invalid adapter output cannot publish a checked fix. */
  }
  if (
    !valid ||
    (await directoryDigest(destination)) !== trial.digest ||
    (await directoryDigest(previewDirectory)) !== trial.digest ||
    (await deps.workspace.versionDigest(projectId, request.sourceVersionId)) !==
      project.originalVersion.contentDigest ||
    (await directoryDigest(checksDirectory, true)) !== baseline.checkSetDigest
  )
    throw new ReleaseError(
      'version_mismatch',
      'Preview does not match the exact checked candidate.',
    );
  await deps.projects.update(projectId, (current) => {
    requireRepair(current, request);
    return {
      ...current,
      candidateVersion,
      latestVerification: trial.verification,
      approval: null,
      previews: [
        ...current.previews.filter(
          (item) => item.versionId === current.originalVersion.id,
        ),
        preview,
      ],
    };
  });
  return {
    ...common,
    outcome: 'checked',
    candidateVersion,
    verification: trial.verification,
  };
}
