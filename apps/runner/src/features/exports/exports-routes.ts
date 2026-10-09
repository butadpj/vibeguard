import express, { Router } from 'express';
import { protectMutations } from '../../lib/request-protection.js';
import { sendApiError } from '../../lib/api-errors.js';
import type { JobBoard } from '../../lib/job-board.js';
import { handleRelease } from '../../lib/release-error.js';
import {
  buildExport,
  findZip,
  parseExportRequest,
  prepareExport,
  type ExportDeps,
} from './exports-build.js';

export function createExportsRoutes(deps: ExportDeps & { jobs: JobBoard }) {
  const routes = Router();
  routes.post(
    '/projects/:id/exports',
    protectMutations,
    express.json({ limit: '16kb' }),
    handleRelease(async (request, response) => {
      const projectId = String(request.params.id);
      const body = parseExportRequest(request.body);
      const { record } = await prepareExport(deps, projectId, body);
      const jobId = deps.jobs.start(
        {
          projectId,
          operation: 'export',
          goalRevisionId: record.goal.revisionId,
          versionId: record.approval.versionId,
          message: 'Saving your checked project.',
        },
        (report) => {
          report({
            step: 'exporting',
            message: 'Saving your checked project.',
          });
          return buildExport(deps, projectId, body);
        },
      );
      response.status(202).json({ jobId });
    }),
  );
  routes.get('/artifacts/:id/download', async (request, response) => {
    const found = await findZip(deps.home, String(request.params.id));
    if (!found) {
      sendApiError(response, 404, {
        code: 'not_found',
        message: 'That download could not be found.',
        nextStep: 'Save the project again.',
      });
      return;
    }
    response.download(found.zipPath, found.displayName);
  });
  return routes;
}
