import { Router } from 'express';
import { notImplemented } from '../../lib/api-errors.js';

export function createGoalsRoutes() {
  const routes = Router();
  routes.post(
    '/projects/:id/messages',
    notImplemented('POST /projects/:id/messages'),
  );
  routes.post(
    '/projects/:id/goal/confirm',
    notImplemented('POST /projects/:id/goal/confirm'),
  );
  return routes;
}
