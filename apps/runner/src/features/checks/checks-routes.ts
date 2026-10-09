import express, { Router } from 'express';
import { protectMutations } from '../../lib/request-protection.js';
import { notImplemented } from '../../lib/api-errors.js';
import type { JobBoard } from '../../lib/job-board.js';
import { handleRelease } from '../../lib/release-error.js';
import {
  parseRecheckRequest,
  prepareRecheck,
  runRecheck,
  type RecheckDeps,
} from './checks-recheck.js';

export function createChecksRoutes(deps: RecheckDeps & { jobs: JobBoard }) {
  const routes = Router();
  routes.post(
    '/projects/:id/checks',
    notImplemented('POST /projects/:id/checks'),
  );
  // US5: run an approved fix's retained checks on a later version.
  routes.post(
    '/projects/:id/rechecks',
    protectMutations,
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
