import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Project } from '@vibeguard/contracts';
import { createFileWorkspace } from '../../lib/release-workspace.js';
import { ReleaseError } from '../../lib/release-error.js';

/** Serialize metadata updates in this process; persist only project state, never jobs. */
export function createProjectsStore(directory: string) {
  const workspace = createFileWorkspace(directory);
  let pending: Promise<unknown> = Promise.resolve();
  return {
    directory,
    async require(projectId: string): Promise<Project> {
      const project = await workspace.getProject(projectId);
      if (!project) throw new ReleaseError('not_found', 'Project not found.');
      return project;
    },
    update(
      projectId: string,
      change: (project: Project) => Project,
    ): Promise<Project> {
      const update = pending.then(async () => {
        const project = await workspace.getProject(projectId);
        if (!project) throw new ReleaseError('not_found', 'Project not found.');
        const next = change(project);
        const file = join(directory, 'projects', projectId, 'project.json');
        const temporary = `${file}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, JSON.stringify(next), {
            flag: 'wx',
            mode: 0o600,
          });
          await rename(temporary, file);
        } finally {
          await rm(temporary, { force: true });
        }
        return next;
      });
      pending = update.catch(() => {});
      return update;
    },
  };
}
export type ProjectsStore = ReturnType<typeof createProjectsStore>;
