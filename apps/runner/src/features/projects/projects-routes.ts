import { Router, raw } from 'express';
import { readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import type { GetProjectResponse } from '@vibeguard/contracts';
import { ApiFailure, notImplemented } from '../../lib/api-errors.js';
import { importProject, uploadLimit } from './projects-import.js';

export function createProjectsRoutes(workspace: string) {
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
            workspace,
            Buffer.from(await file.arrayBuffer()),
            typeof name === 'string' ? name.trim() : 'Imported project',
          ),
        );
    },
  );
  routes.get('/projects/:id', async (request, response) => {
    const id = request.params.id;
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        id,
      )
    )
      throw new ApiFailure(404, 'not_found', 'Project not found.');
    const directory = join(workspace, 'projects', id);
    try {
      if (
        !(await lstat(directory)).isDirectory() ||
        !(await lstat(join(directory, 'project.json'))).isFile()
      )
        throw new ApiFailure(404, 'not_found', 'Project not found.');
      const project: GetProjectResponse = JSON.parse(
        await readFile(join(directory, 'project.json'), 'utf8'),
      );
      response.json(project);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new ApiFailure(404, 'not_found', 'Project not found.');
      throw error;
    }
  });
  routes.post(
    '/projects/:id/prepare',
    notImplemented('POST /projects/:id/prepare'),
  );
  return routes;
}
