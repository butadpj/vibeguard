import { randomUUID } from 'node:crypto';
import {
  enrichEvent,
  logContext,
  writeEvent,
  type LogSink,
} from './logging.js';
import { ReleaseError } from './release-error.js';
import type {
  GoalRevisionId,
  Job,
  JobId,
  JobOperation,
  JobProgress,
  JobResultMap,
  ProjectId,
  RepairAttempt,
  VersionId,
} from '@vibeguard/contracts';

export interface JobBoard {
  /** Start work and return at once. Poll get() for progress and the result. */
  start<O extends JobOperation>(
    init: {
      projectId: ProjectId;
      operation: O;
      goalRevisionId: GoalRevisionId | null;
      versionId: VersionId | null;
      message: string;
    },
    work: (
      report: (progress: JobProgress) => void,
      recordAttempt: (attempt: RepairAttempt) => void,
    ) => Promise<JobResultMap[O]>,
  ): JobId;
  get(jobId: JobId): Job | null;
  getActive(): Job | null;
  /** Resolves when the job has finished. Used by tests. */
  whenDone(jobId: JobId): Promise<Job | null>;
}

/** One active operation in this process; restart loses all job state. */
export function createJobBoard(sink: LogSink = writeEvent): JobBoard {
  let activeJobId: JobId | null = null;
  const jobs = new Map<JobId, Job>();
  const running = new Map<JobId, Promise<void>>();
  const update = (id: JobId, patch: Record<string, unknown>) => {
    const current = jobs.get(id);
    if (current) jobs.set(id, { ...current, ...patch } as unknown as Job);
  };

  return {
    start(init, work) {
      if (activeJobId)
        throw new ReleaseError(
          'conflict',
          'The runner is already working on another task.',
          'Wait for the current task to finish and retry.',
        );
      const id = `job_${randomUUID()}`;
      enrichEvent({
        job_id: id,
        project_id: init.projectId,
        operation: init.operation,
      });
      const event = {
        ...logContext.getStore(),
        event: 'job',
        job_id: id,
        project_id: init.projectId,
        operation: init.operation,
        goal_revision_id: init.goalRevisionId,
        version_id: init.versionId,
      };
      const started = performance.now();
      activeJobId = id;
      jobs.set(id, {
        id,
        projectId: init.projectId,
        operation: init.operation,
        goalRevisionId: init.goalRevisionId,
        versionId: init.versionId,
        progress: {
          step: (
            {
              prepare: 'preparing',
              message: 'investigating',
              check: 'checking',
              repair: 'editing',
              export: 'exporting',
            } as const
          )[init.operation],
          message: init.message,
        },
        repairAttempts: [],
        status: 'running',
        result: null,
        error: null,
      } as unknown as Job);
      running.set(
        id,
        logContext.run(event, async () => {
          try {
            const result = await work(
              (progress) => {
                enrichEvent({ job_stage: progress.step });
                update(id, { progress });
              },
              (attempt) => {
                const current = jobs.get(id)!;
                const attempts = current.repairAttempts.filter(
                  (item) => item.number !== attempt.number,
                );
                update(id, {
                  repairAttempts: [...attempts, attempt].sort(
                    (a, b) => a.number - b.number,
                  ),
                });
              },
            );
            update(id, {
              status: 'succeeded',
              result,
              error: null,
              progress: { step: 'finished', message: 'Done.' },
            });
          } catch (error) {
            enrichEvent({
              error_code:
                error instanceof ReleaseError ? error.code : 'internal_error',
              error_type: error instanceof Error ? error.name : 'UnknownError',
            });
            const known = error as {
              code?: string;
              message?: string;
              nextStep?: string | null;
            };
            update(id, {
              status: 'failed',
              result: null,
              error: {
                code: known.code ?? 'internal_error',
                message: known.message ?? 'The job could not finish.',
                nextStep: known.nextStep ?? 'Try again.',
              },
              progress: {
                step: 'finished',
                message: 'The job did not finish.',
              },
            });
          } finally {
            const current = jobs.get(id)!;
            if (current.status === 'succeeded') {
              const verification =
                current.operation === 'check'
                  ? current.result
                  : current.operation === 'repair'
                    ? current.result.verification
                    : null;
              if (verification)
                enrichEvent({
                  verification_id: verification.id,
                  check_verdict: verification.verdict,
                  checks_total: verification.checks.length,
                  checks_failed: verification.checks.filter(
                    (check) => check.verdict === 'failed',
                  ).length,
                  checks_unavailable: verification.checks.filter(
                    (check) => check.verdict === 'could_not_check',
                  ).length,
                });
              if (current.operation === 'repair')
                enrichEvent({
                  repair_outcome: current.result.outcome,
                  repair_issue_code:
                    current.result.attempts.at(-1)?.issue?.code,
                });
              if (current.operation === 'prepare')
                enrichEvent({ setup_status: current.result.setup.status });
            }
            activeJobId = null;
            sink({
              ...event,
              level: current.status === 'failed' ? 'error' : 'info',
              outcome: current.status,
              repair_attempts: current.repairAttempts.length,
              duration_ms: Math.round(performance.now() - started),
            });
          }
        }),
      );
      return id;
    },
    get: (jobId) => jobs.get(jobId) ?? null,
    getActive: () => (activeJobId ? (jobs.get(activeJobId) ?? null) : null),
    async whenDone(jobId) {
      await running.get(jobId);
      return jobs.get(jobId) ?? null;
    },
  };
}
