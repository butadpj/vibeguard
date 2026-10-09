import { Router } from 'express';
import { notImplemented } from '../../lib/api-errors.js';

export function createRepairsRoutes() {
  const routes = Router();
  routes.post(
    '/projects/:id/repairs',
    notImplemented('POST /projects/:id/repairs'),
  );
  return routes;
}
