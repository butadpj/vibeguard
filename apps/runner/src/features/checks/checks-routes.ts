import { Router } from 'express';
import { notImplemented } from '../../lib/api-errors.js';

export function createChecksRoutes() {
  const routes = Router();
  routes.post(
    '/projects/:id/checks',
    notImplemented('POST /projects/:id/checks'),
  );
  return routes;
}
