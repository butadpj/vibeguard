import express, { Router } from 'express';
import {
  parseChecksRequest,
  requireBaseline,
  runBaseline,
  type BaselineChecks,
} from './checks-baseline.js';
import type { ProjectsStore } from '../projects/projects-store.js';
import type { JobBoard } from '../../lib/job-board.js';
import { handleRelease } from '../../lib/release-error.js';
import {
  parseRecheckRequest,
  prepareRecheck,
  runRecheck,
  type RecheckDeps,
} from './checks-recheck.js';

export function createChecksRoutes(
  deps: RecheckDeps & {
    jobs: JobBoard;
    projects: ProjectsStore;
    baselineChecks?: BaselineChecks;
  },
) {
  const routes = Router();
  routes.post(
    '/projects/:id/checks',
    express.json({ limit: '16kb' }),
    handleRelease(async (request, response) => {
      const projectId = String(request.params.id);
      const body = parseChecksRequest(request.body);
      requireBaseline(await deps.projects.require(projectId), body);
      const jobId = deps.jobs.start(
        {
          projectId,
          operation: 'check',
          goalRevisionId: body.goalRevisionId,
          versionId: body.versionId,
          message: 'Running baseline integration checks.',
        },
        (report) => runBaseline(deps, projectId, body, report),
      );
      response.status(202).json({ jobId });
    }),
  );
  // US5: run an approved fix's retained checks on a later version.
  routes.post(
    '/projects/:id/rechecks',
    express.json({ limit: '16kb' }),
    handleRelease(async (request, response) => {
      const projectId = String(request.params.id);
      const body = parseRecheckRequest(request.body);
      const { record } = await prepareRecheck(deps, projectId, body);
      const jobId = deps.jobs.start(
        {
          projectId,
          operation: 'check',
          goalRevisionId: record.goal.revisionId,
          versionId: body.versionId,
          message: 'Running your saved checks.',
        },
        (report) => {
          report({ step: 'checking', message: 'Running your saved checks.' });
          return runRecheck(deps, projectId, body);
        },
      );
      response.status(202).json({ jobId });
    }),
  );
  return routes;
}
