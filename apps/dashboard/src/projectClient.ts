import type {
  GetProjectResponse,
  ImportProjectResponse,
  Job,
  PrepareProjectResponse,
  Project,
} from '@vibeguard/contracts';
import {
  importedProjectExample,
  preparedJobExample,
  preparingJobExample,
} from '@vibeguard/contracts/examples';
import { call, RunnerError, sleep, upload, waitForJob } from './runner';

/** US1 operations the dashboard needs. The live client talks to the runner;
 * the demo client replays shared contract examples for the happy path while
 * the app-startup adapter is being built (see context/us1-us2-backend-handoff.md). */
export interface ProjectClient {
  demo: boolean;
  importProject(file: File | null, name: string): Promise<Project>;
  getProject(id: string): Promise<Project>;
  /** Start preparation and follow it to the end. Resolves with the refreshed
   * project; a failed preparation is reported through project.setup. */
  prepare(
    project: Project,
    alive: () => boolean,
    onProgress: (message: string) => void,
  ): Promise<Project>;
  /** Follow a preparation that was already running (for example after reload). */
  follow(
    project: Project,
    jobId: string,
    alive: () => boolean,
    onProgress: (message: string) => void,
  ): Promise<Project>;
}

const projectUrl = (id: string) => `/api/projects/${encodeURIComponent(id)}`;

async function followLive(
  project: Project,
  jobId: string,
  alive: () => boolean,
  onProgress: (message: string) => void,
): Promise<Project> {
  try {
    // Only running jobs describe a real step; a finished job's progress is a
    // generic "Done." / "The job did not finish." and project.setup explains the outcome.
    await waitForJob(jobId, 'prepare', alive, (job: Job) => {
      if (job.status === 'running') onProgress(job.progress.message);
    });
  } catch (caught) {
    // A failed job or a job lost to a runner restart: the project record is
    // the source of truth for setup state, so fall through and refresh it.
    if (!(caught instanceof RunnerError)) throw caught;
    if (caught.status !== null && caught.status !== 404) throw caught;
  }
  return call<GetProjectResponse>(projectUrl(project.id));
}

export const liveClient: ProjectClient = {
  demo: false,
  importProject(file, name) {
    const form = new FormData();
    form.append('file', file!);
    if (name.trim()) form.append('name', name.trim());
    return upload<ImportProjectResponse>('/api/projects', form);
  },
  getProject: (id) => call<GetProjectResponse>(projectUrl(id)),
  async prepare(project, alive, onProgress) {
    const { jobId } = await call<PrepareProjectResponse>(
      `${projectUrl(project.id)}/prepare`,
      undefined,
      'POST',
    );
    return followLive(project, jobId, alive, onProgress);
  },
  follow: followLive,
};

export const demoClient: ProjectClient = {
  demo: true,
  async importProject(file, name) {
    await sleep(500);
    const project: Project = structuredClone(importedProjectExample);
    project.name =
      name.trim() || file?.name.replace(/\.zip$/i, '') || project.name;
    return project;
  },
  async getProject() {
    throw new RunnerError('Demo projects are not saved.', 404);
  },
  async prepare(project, alive, onProgress) {
    const steps = [
      'Making a separate test copy. Your original stays unchanged.',
      preparingJobExample.progress.message,
      preparedJobExample.progress.message,
    ];
    for (const message of steps) {
      if (!alive()) break;
      onProgress(message);
      await sleep(900);
    }
    return {
      ...project,
      setup: structuredClone(preparedJobExample.result.setup),
      previews: structuredClone(preparedJobExample.result.previews),
    };
  },
  async follow(project) {
    return project;
  },
};
