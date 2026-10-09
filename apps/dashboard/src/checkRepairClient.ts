import type {
  GetRepairDiffResponse,
  GetRepairEvidenceResponse,
  Job,
  JobAccepted,
  Project,
  RepairRequest,
  RepairResult,
  RunChecksRequest,
} from '@vibeguard/contracts';
import {
  baselineFailedProjectExample,
  baselineJobExample,
  checkedProjectExample,
  repairJobExample,
  repairDiffExample,
  repairEvidenceExample,
  unsuccessfulRepairJobExample,
} from '@vibeguard/contracts/examples';
import { call, RunnerError, sleep, waitForJob } from './runner';

const url = (id: string) => `/api/projects/${encodeURIComponent(id)}`;

export function checkBlocker(project: Project): string | null {
  if (project.activeJobId)
    return 'Another task is running. Wait for it to finish.';
  if (project.setup.status !== 'ready') return 'Prepare your test app first.';
  if (project.goal?.status !== 'confirmed')
    return 'Confirm your goal in Set the goal first.';
  return null;
}

export function repairBlocker(project: Project): string | null {
  const blocker = checkBlocker(project);
  if (blocker) return blocker;
  const baseline = project.baseline;
  if (
    !baseline ||
    baseline.goalRevisionId !== project.goal?.revisionId ||
    baseline.versionId !== project.originalVersion.id
  )
    return 'Run checks on the original copy for your current goal first.';
  if (baseline.verdict !== 'failed')
    return 'Repair needs a failed baseline. Review the check results first.';
  if (
    ['goal', 'create', 'read', 'update', 'delete'].some(
      (scope) =>
        !baseline.checks.some(
          (check) =>
            check.scope === scope && check.verdict !== 'could_not_check',
        ),
    )
  )
    return 'Some required checks could not run. Resolve those blockers before repair.';
  return null;
}

/** Only offer human QA on the exact candidate with passing, current-goal checks. */
export function candidatePreview(project: Project) {
  const candidate = project.candidateVersion;
  const verified = project.latestVerification;
  if (
    !candidate ||
    project.goal?.status !== 'confirmed' ||
    verified?.verdict !== 'passed' ||
    verified.versionId !== candidate.id ||
    verified.goalRevisionId !== project.goal.revisionId
  )
    return null;
  return (
    project.previews.find(
      (preview) =>
        preview.versionId === candidate.id &&
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(`${preview.url}/`),
    ) ?? null
  );
}

export async function runCheckRepair({
  project,
  operation,
  demo,
  alive,
  onJob,
  jobId,
  unsuccessful = false,
}: {
  project: Project;
  operation: 'check' | 'repair';
  demo: boolean;
  alive: () => boolean;
  onJob: (job: Job) => void;
  jobId?: string;
  unsuccessful?: boolean;
}): Promise<{ project: Project; repair: RepairResult | null }> {
  if (demo) {
    const sample =
      operation === 'check'
        ? baselineJobExample
        : unsuccessful
          ? unsuccessfulRepairJobExample
          : repairJobExample;
    onJob({
      ...structuredClone(sample),
      status: 'running',
      result: null,
      error: null,
      progress: {
        step: operation === 'check' ? 'checking' : 'editing',
        message: 'Replaying sample results…',
      },
    } as Job);
    await sleep(800);
    if (!alive()) throw new RunnerError('Stopped waiting.');
    onJob(structuredClone(sample));
    const next: Project = structuredClone(
      operation === 'check' || unsuccessful
        ? baselineFailedProjectExample
        : checkedProjectExample,
    );
    next.name = project.name;
    return {
      project: next,
      repair:
        operation === 'repair'
          ? (structuredClone(sample.result) as RepairResult)
          : null,
    };
  }
  if (!jobId) {
    const blocker =
      operation === 'check' ? checkBlocker(project) : repairBlocker(project);
    if (blocker) throw new RunnerError(blocker);
    const goalRevisionId = project.goal!.revisionId;
    const body: RunChecksRequest | RepairRequest =
      operation === 'check'
        ? { versionId: project.originalVersion.id, goalRevisionId }
        : {
            sourceVersionId: project.originalVersion.id,
            goalRevisionId,
            baselineVerificationId: project.baseline!.id,
          };
    const accepted = await call<JobAccepted>(
      `${url(project.id)}/${operation === 'check' ? 'checks' : 'repairs'}`,
      body,
    );
    jobId = accepted.jobId;
  }
  const result = await waitForJob(jobId, operation, alive, onJob);
  if (!alive()) throw new RunnerError('Stopped waiting.');
  const next = await call<Project>(url(project.id));
  return {
    project: next,
    repair: operation === 'repair' ? (result as RepairResult) : null,
  };
}

export const getRepairEvidence = (projectId: string, demo: boolean) =>
  demo
    ? Promise.resolve(structuredClone(repairEvidenceExample))
    : call<GetRepairEvidenceResponse>(`${url(projectId)}/repair-evidence`);

export const getRepairDiff = (
  projectId: string,
  artifactId: string,
  demo: boolean,
) =>
  demo
    ? Promise.resolve(structuredClone(repairDiffExample))
    : call<GetRepairDiffResponse>(
        `${url(projectId)}/diffs/${encodeURIComponent(artifactId)}`,
      );
