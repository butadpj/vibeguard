import { Router, raw } from 'express';
import type {
  GetProjectResponse,
  PrepareProjectResponse,
} from '@vibeguard/contracts';
import { ApiFailure } from '../../lib/api-errors.js';
import type { ProjectsStore } from './projects-store.js';
import type { JobBoard } from '../../lib/job-board.js';
import { handleRelease } from '../../lib/release-error.js';
import { prepareProject, type PrepareEnvironment } from './projects-prepare.js';
import { importProject, uploadLimit } from './projects-import.js';

export function createProjectsRoutes(deps: {
  store: ProjectsStore;
  jobs: JobBoard;
  environment?: PrepareEnvironment;
}) {
  const routes = Router();
  routes.post(
    '/projects',
    raw({ type: 'multipart/form-data', limit: uploadLimit, inflate: false }),
    async (request, response) => {
      if (!Buffer.isBuffer(request.body))
        throw new ApiFailure(
          400,
          'invalid_request',
          'Send a multipart ZIP upload.',
        );
      let form: FormData;
      try {
        form = await new Response(new Uint8Array(request.body), {
          headers: { 'content-type': request.get('content-type')! },
        }).formData();
      } catch {
        throw new ApiFailure(
          400,
          'invalid_request',
          'Invalid multipart upload.',
        );
      }
      const file = form.get('file');
      const name = form.get('name');
      if (
        !(file instanceof Blob) ||
        form.getAll('file').length !== 1 ||
        form.getAll('name').length > 1 ||
        [...form.keys()].some((key) => key !== 'file' && key !== 'name') ||
        (name !== null &&
          (typeof name !== 'string' ||
            !name.trim() ||
            name.length > 100 ||
            /[\x00-\x1f\x7f]/.test(name)))
      )
        throw new ApiFailure(
          400,
          'invalid_request',
          'Provide one ZIP file and an optional name of 1–100 characters.',
        );
      response
        .status(201)
        .json(
          await importProject(
            deps.store.directory,
            Buffer.from(await file.arrayBuffer()),
            typeof name === 'string' ? name.trim() : 'Imported project',
          ),
        );
    },
  );
  routes.get(
    '/projects/:id',
    handleRelease(async (request, response) => {
      const project = await deps.store.require(String(request.params.id));
      const active = deps.jobs.getActive();
      response.json({
        ...project,
        activeJobId: active?.projectId === project.id ? active.id : null,
      } satisfies GetProjectResponse);
    }),
  );
  routes.post(
    '/projects/:id/prepare',
    handleRelease(async (request, response) => {
      if (
        request.headers['transfer-encoding'] ||
        Number(request.headers['content-length'] ?? 0) > 0
      )
        throw new ApiFailure(
          400,
          'invalid_request',
          'Preparation has no request body.',
        );
      const project = await deps.store.require(String(request.params.id));
      const jobId = deps.jobs.start(
        {
          projectId: project.id,
          operation: 'prepare',
          goalRevisionId: null,
          versionId: project.originalVersion.id,
          message: 'Preparing your app.',
        },
        (report) =>
          prepareProject(deps.store, project, deps.environment, report),
      );
      response.status(202).json({ jobId } satisfies PrepareProjectResponse);
    }),
  );
  return routes;
}
