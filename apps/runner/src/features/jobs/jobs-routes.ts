import { Router } from 'express';
import { notImplemented, sendApiError } from '../../lib/api-errors.js';
import type { JobBoard } from '../../lib/job-board.js';

export function createJobsRoutes(deps: { jobs: JobBoard }) {
  const routes = Router();
  routes.get('/jobs/:id', (request, response) => {
    const job = deps.jobs.get(String(request.params.id));
    if (!job) {
      sendApiError(response, 404, {
        code: 'not_found',
        message: 'That job could not be found.',
        nextStep: null,
      });
      return;
    }
    response.json(job);
  });
  routes.post('/jobs/:id/cancel', notImplemented('POST /jobs/:id/cancel'));
  return routes;
}
