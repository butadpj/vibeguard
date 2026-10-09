import express from 'express';
import { logRequests } from './lib/logging.js';
import { createProjectsStore } from './features/projects/projects-store.js';
import type { PrepareEnvironment } from './features/projects/projects-prepare.js';
import type { GoalConversation } from './features/goals/goals-conversation.js';
import { readConfig } from './config.js';
import { protectRequests } from './lib/request-protection.js';
import { existsSync } from 'node:fs';
import type { HealthResponse } from '@vibeguard/contracts';
import { apiNotFound, apiErrorHandler } from './lib/api-errors.js';
import { createProjectsRoutes } from './features/projects/projects-routes.js';
import { createGoalsRoutes } from './features/goals/goals-routes.js';
import { createChecksRoutes } from './features/checks/checks-routes.js';
import { createRepairsRoutes } from './features/repairs/repairs-routes.js';
import { createRepairEvidenceRoutes } from './features/repairs/repair-evidence-routes.js';
import type { RepairHarness } from './features/repairs/repairs-run.js';
import { createApprovalsRoutes } from './features/approvals/approvals-routes.js';
import { createExportsRoutes } from './features/exports/exports-routes.js';
import { createJobsRoutes } from './features/jobs/jobs-routes.js';
import { createApprovalStore } from './features/approvals/approvals-store.js';
import type { CheckExecutor } from './features/checks/check-executor.js';
import type { BaselineChecks } from './features/checks/checks-baseline.js';
import { createJobBoard, type JobBoard } from './lib/job-board.js';
import {
  createFileWorkspace,
  type ReleaseWorkspace,
} from './lib/release-workspace.js';

/** Assemble routes without starting a server or launching local tools. */
export function createApp(
  options: {
    dashboardDirectory?: string;
    workspaceDirectory?: string;
    workspace?: ReleaseWorkspace;
    jobs?: JobBoard;
    checkExecutor?: CheckExecutor;
    baselineChecks?: BaselineChecks;
    prepareEnvironment?: PrepareEnvironment;
    goalConversation?: GoalConversation;
    repairHarness?: RepairHarness;
  } = {},
) {
  const home = options.workspaceDirectory ?? readConfig().workspaceDirectory;
  const workspace = options.workspace ?? createFileWorkspace(home);
  const jobs = options.jobs ?? createJobBoard();
  const store = createApprovalStore(home);
  const projects = createProjectsStore(home);
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'vibeguard-runner',
    } satisfies HealthResponse);
  });
  app.use('/api', logRequests());
  app.use('/api', protectRequests);
  app.use(
    '/api',
    createProjectsRoutes({
      store: projects,
      jobs,
      environment: options.prepareEnvironment,
    }),
  );
  app.use(
    '/api',
    createGoalsRoutes({
      store: projects,
      jobs,
      converse: options.goalConversation,
    }),
  );
  app.use(
    '/api',
    createChecksRoutes({
      workspace,
      store,
      jobs,
      executor: options.checkExecutor,
      projects,
      baselineChecks: options.baselineChecks,
    }),
  );
  app.use(
    '/api',
    createRepairsRoutes({
      projects,
      workspace,
      jobs,
      baselineChecks: options.baselineChecks,
      repairHarness: options.repairHarness,
    }),
  );
  app.use('/api', createApprovalsRoutes({ workspace, store }));
  app.use('/api', createRepairEvidenceRoutes({ projects }));
  app.use('/api', createExportsRoutes({ home, workspace, store, jobs }));
  app.use('/api', createJobsRoutes({ jobs }));
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
