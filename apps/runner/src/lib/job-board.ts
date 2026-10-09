import { randomUUID } from 'node:crypto';
import { ReleaseError } from './release-error.js';
import type {
  GoalRevisionId,
  Job,
  JobId,
  JobOperation,
  JobProgress,
  JobResultMap,
  ProjectId,
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
    work: (report: (progress: JobProgress) => void) => Promise<JobResultMap[O]>,
  ): JobId;
  get(jobId: JobId): Job | null;
  getActive(): Job | null;
  /** Resolves when the job has finished. Used by tests. */
  whenDone(jobId: JobId): Promise<Job | null>;
}

/** One active operation in this process; restart loses all job state. */
export function createJobBoard(): JobBoard {
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
        (async () => {
          try {
            const result = await work((progress) => update(id, { progress }));
            update(id, {
              status: 'succeeded',
              result,
              error: null,
              progress: { step: 'finished', message: 'Done.' },
            });
          } catch (error) {
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
            activeJobId = null;
          }
        })(),
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
