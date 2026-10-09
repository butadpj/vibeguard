import { Router } from 'express';
import { notImplemented } from '../../lib/api-errors.js';

export function createProjectsRoutes() {
  const routes = Router();
  routes.post('/projects', notImplemented('POST /projects'));
  routes.get('/projects/:id', notImplemented('GET /projects/:id'));
  routes.post(
    '/projects/:id/prepare',
    notImplemented('POST /projects/:id/prepare'),
  );
  return routes;
}
