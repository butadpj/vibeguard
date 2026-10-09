import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  Approval,
  Project,
  ProjectId,
  VersionId,
} from '@vibeguard/contracts';
import { isSafeId, resolveInside } from './confined-path.js';
import { directoryDigest } from './directory-digest.js';

/** What approval, export, and retained checks need from project storage.
 * TEMPORARY file-backed version below. The workspace owner replaces it by
 * implementing this interface on top of real project storage. */
export interface ReleaseWorkspace {
  getProject(projectId: ProjectId): Promise<Project | null>;
  /** Frozen files of one code version, or null when unknown. Read-only. */
  versionDirectory(
    projectId: ProjectId,
    versionId: VersionId,
  ): Promise<string | null>;
  /** Current digest of those files. Must match CodeVersion.contentDigest. */
  versionDigest(
    projectId: ProjectId,
    versionId: VersionId,
  ): Promise<string | null>;
  /** Protected check files of a check set, or null when unknown. */
  checkSetDirectory(
    projectId: ProjectId,
    checkSetId: string,
  ): Promise<string | null>;
  /** Make Project.approval show this approval on later reads. */
  recordApproval(projectId: ProjectId, approval: Approval): Promise<void>;
}

async function isDirectory(target: string): Promise<boolean> {
  return (await stat(target).catch(() => null))?.isDirectory() ?? false;
}

/** Layout under <home>/projects/<projectId>/:
 *   project.json            a Project snapshot
 *   versions/<versionId>/   frozen files of each code version
 *   check-sets/<id>/        protected check files */
export function createFileWorkspace(home: string): ReleaseWorkspace {
  const projectDirectory = (projectId: string) =>
    isSafeId(projectId) ? resolveInside(home, 'projects', projectId) : null;
  const child = async (
    projectId: string,
    folder: string,
    id: string,
  ): Promise<string | null> => {
    const base = projectDirectory(projectId);
    if (!base || !isSafeId(id)) return null;
    const target = resolveInside(base, folder, id);
    return (await isDirectory(target)) ? target : null;
  };
  const projectFile = (projectId: string) => {
    const base = projectDirectory(projectId);
    return base ? path.join(base, 'project.json') : null;
  };
  const getProject = async (projectId: string): Promise<Project | null> => {
    const file = projectFile(projectId);
    if (!file) return null;
    try {
      return JSON.parse(await readFile(file, 'utf8')) as Project;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  };

  return {
    getProject,
    versionDirectory: (projectId, versionId) =>
      child(projectId, 'versions', versionId),
    async versionDigest(projectId, versionId) {
      const directory = await child(projectId, 'versions', versionId);
      return directory ? directoryDigest(directory) : null;
    },
    checkSetDirectory: (projectId, checkSetId) =>
      child(projectId, 'check-sets', checkSetId),
    async recordApproval(projectId, approval) {
      const file = projectFile(projectId);
      const project = await getProject(projectId);
      if (!file || !project) return;
      await mkdir(path.dirname(file), { recursive: true });
      const temporary = `${file}.tmp`;
      await writeFile(
        temporary,
        JSON.stringify({ ...project, approval }, null, 2),
      );
      await rename(temporary, file);
    },
  };
}
