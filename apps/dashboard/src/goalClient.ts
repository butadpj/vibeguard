import type {
  ConfirmGoalRequest,
  ConfirmGoalResponse,
  GoalDraft,
  JobAccepted,
  Project,
  SendMessageRequest,
} from '@vibeguard/contracts';
import {
  conversationJobExample,
  confirmedGoalExample,
} from '@vibeguard/contracts/examples';
import { call, RunnerError, waitForJob } from './runner';

const url = (project: Project) =>
  `/api/projects/${encodeURIComponent(project.id)}`;

export async function discussGoal(
  project: Project,
  text: string,
  demo: boolean,
  alive: () => boolean,
  onProgress: (message: string) => void,
  jobId?: string,
): Promise<Project> {
  if (!jobId && (project.activeJobId || project.setup.status !== 'ready'))
    throw new RunnerError(
      'Wait until your test app is ready and no other task is running.',
    );
  if (demo) {
    const { reply, proposedGoal } = structuredClone(
      conversationJobExample.result,
    );
    return {
      ...project,
      messages: [
        ...project.messages,
        { id: `sample_${project.messages.length}`, role: 'user', text },
        reply,
      ],
      goal: proposedGoal,
    };
  }
  if (!jobId) {
    const request: SendMessageRequest = { text };
    const accepted = await call<JobAccepted>(
      `${url(project)}/messages`,
      request,
    );
    jobId = accepted.jobId;
  }
  await waitForJob(jobId, 'message', alive, (job) =>
    onProgress(job.progress.message),
  );
  return call<Project>(url(project));
}

export async function confirmGoal(
  project: Project,
  goal: GoalDraft,
  demo: boolean,
): Promise<Project> {
  if (!project.goal || project.activeJobId || project.setup.status !== 'ready')
    throw new RunnerError(
      'Discuss your goal first and wait for the current task to finish.',
    );
  const request: ConfirmGoalRequest = {
    expectedRevisionId: project.goal.revisionId,
    goal: {
      description: goal.description,
      expectedBehavior: goal.expectedBehavior,
      performance: goal.performance,
    },
  };
  if (demo)
    return {
      ...project,
      goal: { ...confirmedGoalExample, ...request.goal },
      baseline: null,
      latestVerification: null,
      approval: null,
    };
  await call<ConfirmGoalResponse>(`${url(project)}/goal/confirm`, request);
  return call<Project>(url(project));
}
