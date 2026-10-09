import express, { Router } from 'express';
import { handleRelease } from '../../lib/release-error.js';
import type { ReleaseWorkspace } from '../../lib/release-workspace.js';
import { approveFix, parseApproveRequest } from './approvals-approve.js';
import type { ApprovalStore } from './approvals-store.js';

export function createApprovalsRoutes(deps: {
  workspace: ReleaseWorkspace;
  store: ApprovalStore;
}) {
  const routes = Router();
  routes.post(
    '/projects/:id/approvals',
    express.json({ limit: '16kb' }),
    handleRelease(async (request, response) => {
      const approval = await approveFix(
        deps,
        String(request.params.id),
        parseApproveRequest(request.body),
      );
      response.json(approval);
    }),
  );
  return routes;
}
