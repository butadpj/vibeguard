import express, { Router } from 'express';
import { handleRelease } from '../../lib/release-error.js';
import type { JobBoard } from '../../lib/job-board.js';
import {
  parseRepairRequest,
  requireRepair,
  repairProject,
  type RepairDeps,
} from './repairs-run.js';

export function createRepairsRoutes(deps: RepairDeps & { jobs: JobBoard }) {
  const routes = Router();
  routes.post(
    '/projects/:id/repairs',
    express.json({ limit: '16kb' }),
    handleRelease(async (request, response) => {
      const projectId = String(request.params.id);
      const body = parseRepairRequest(request.body);
      requireRepair(await deps.projects.require(projectId), body);
      const jobId = deps.jobs.start(
        {
          projectId,
          operation: 'repair',
          goalRevisionId: body.goalRevisionId,
          versionId: body.sourceVersionId,
          message: 'Investigating a fix on an isolated copy.',
        },
        (report, recordAttempt) =>
          repairProject(deps, projectId, body, report, recordAttempt),
      );
      response.status(202).json({ jobId });
    }),
  );
  return routes;
}
