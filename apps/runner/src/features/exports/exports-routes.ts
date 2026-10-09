import { Router } from 'express';
import { notImplemented } from '../../lib/api-errors.js';

export function createExportsRoutes() {
  const routes = Router();
  routes.post(
    '/projects/:id/exports',
    notImplemented('POST /projects/:id/exports'),
  );
  return routes;
}
