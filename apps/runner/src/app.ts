import express from 'express';
import { readConfig } from './config.js';
import { protectRequests } from './lib/request-protection.js';
import { existsSync } from 'node:fs';
import type { HealthResponse } from '@vibeguard/contracts';
import { apiNotFound, apiErrorHandler } from './lib/api-errors.js';
import { createProjectsRoutes } from './features/projects/projects-routes.js';
import { createGoalsRoutes } from './features/goals/goals-routes.js';
import { createChecksRoutes } from './features/checks/checks-routes.js';
import { createRepairsRoutes } from './features/repairs/repairs-routes.js';
import { createApprovalsRoutes } from './features/approvals/approvals-routes.js';
import { createExportsRoutes } from './features/exports/exports-routes.js';
import { createJobsRoutes } from './features/jobs/jobs-routes.js';

/** Assemble routes without starting a server or launching local tools. */
export function createApp(
  options: { dashboardDirectory?: string; workspaceDirectory?: string } = {},
) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'vibeguard-runner',
    } satisfies HealthResponse);
  });
  app.use('/api', protectRequests);
  app.use(
    '/api',
    createProjectsRoutes(
      options.workspaceDirectory ?? readConfig().workspaceDirectory,
    ),
  );
  app.use('/api', createGoalsRoutes());
  app.use('/api', createChecksRoutes());
  app.use('/api', createRepairsRoutes());
  app.use('/api', createApprovalsRoutes());
  app.use('/api', createExportsRoutes());
  app.use('/api', createJobsRoutes());
  app.use('/api', apiNotFound);
  app.use('/api', apiErrorHandler);

  const dashboard = options.dashboardDirectory;
  if (dashboard && existsSync(dashboard)) {
    app.use(express.static(dashboard));
    app.get('/{*path}', (_request, response) => {
      response.sendFile('index.html', { root: dashboard });
    });
  }
  return app;
}
