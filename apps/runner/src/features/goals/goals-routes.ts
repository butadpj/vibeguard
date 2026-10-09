import express, { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type {
  ConfirmGoalResponse,
  SendMessageResponse,
} from '@vibeguard/contracts';
import { isSafeId } from '../../lib/confined-path.js';
import { handleRelease, ReleaseError } from '../../lib/release-error.js';
import type { JobBoard } from '../../lib/job-board.js';
import type { ProjectsStore } from '../projects/projects-store.js';
import {
  parseGoalDraft,
  parseMessage,
  sendMessage,
  type GoalConversation,
} from './goals-conversation.js';

export function createGoalsRoutes(deps: {
  store: ProjectsStore;
  jobs: JobBoard;
  converse?: GoalConversation;
}) {
  const routes = Router();
  routes.post(
    '/projects/:id/messages',
    express.json({ limit: '16kb' }),
    handleRelease(async (request, response) => {
      const message = parseMessage(request.body);
      const project = await deps.store.require(String(request.params.id));
      const jobId = deps.jobs.start(
        {
          projectId: project.id,
          operation: 'message',
          goalRevisionId: project.goal?.revisionId ?? null,
          versionId: project.originalVersion.id,
          message: 'Discussing your goal.',
        },
        () => sendMessage(deps.store, project, message, deps.converse),
      );
      response.status(202).json({ jobId } satisfies SendMessageResponse);
    }),
  );
  routes.post(
    '/projects/:id/goal/confirm',
    express.json({ limit: '16kb' }),
    handleRelease(async (request, response) => {
      const body = request.body;
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        !isSafeId(body.expectedRevisionId) ||
        Object.keys(body).some(
          (key) => !['expectedRevisionId', 'goal'].includes(key),
        )
      )
        throw new ReleaseError(
          'invalid_request',
          'Provide the proposed goal revision and edited goal.',
        );
      const draft = parseGoalDraft(body.goal);
      const project = await deps.store.update(
        String(request.params.id),
        (current) => {
          if (deps.jobs.getActive())
            throw new ReleaseError(
              'conflict',
              'Wait for the running task before confirming the goal.',
            );
          if (
            !current.goal ||
            current.goal.revisionId !== body.expectedRevisionId
          )
            throw new ReleaseError(
              'version_mismatch',
              'The goal changed. Reload it before confirming.',
            );
          const goal: ConfirmGoalResponse = {
            ...draft,
            status: 'confirmed',
            revisionId: randomUUID(),
          };
          return {
            ...current,
            goal,
            baseline: null,
            latestVerification: null,
            approval: null,
          };
        },
      );
      response.json(project.goal);
    }),
  );
  return routes;
}
