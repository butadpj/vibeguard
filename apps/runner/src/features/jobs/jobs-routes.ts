import { Router } from 'express';
import { notImplemented } from '../../lib/api-errors.js';

export function createJobsRoutes() {
  const routes = Router();
  routes.get('/jobs/:id', notImplemented('GET /jobs/:id'));
  routes.post('/jobs/:id/cancel', notImplemented('POST /jobs/:id/cancel'));
  return routes;
}
