import { Router } from 'express';
import { notImplemented } from '../../lib/api-errors.js';

export function createApprovalsRoutes() {
  const routes = Router();
  routes.post(
    '/projects/:id/approvals',
    notImplemented('POST /projects/:id/approvals'),
  );
  return routes;
}
