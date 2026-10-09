import { randomUUID } from 'node:crypto';
import { cp, chmod, lstat, mkdir, realpath, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  JobResultMap,
  JobProgress,
  Project,
  Preview,
} from '@vibeguard/contracts';
import { directoryDigest } from '../../lib/directory-digest.js';
import { ReleaseError } from '../../lib/release-error.js';
import { createFileWorkspace } from '../../lib/release-workspace.js';
import type { ProjectsStore } from './projects-store.js';

/** The environment owner implements startup and readiness checks for the supported demo app. */
export type PrepareEnvironment = (input: {
  projectId: Project['id'];
  versionId: Project['originalVersion']['id'];
  environmentId: Preview['environmentId'];
  workingDirectory: string;
  report: (progress: JobProgress) => void;
}) => Promise<JobResultMap['prepare']>;

function validPreview(
  preview: Preview,
  project: Project,
  environmentId: string,
) {
  try {
    const url = new URL(preview.url);
    return (
      preview.environmentId === environmentId &&
      preview.versionId === project.originalVersion.id &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

async function makeWritable(directory: string) {
  await chmod(directory, 0o700);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await makeWritable(path);
    else await chmod(path, 0o600);
  }
}

export async function prepareProject(
  store: ProjectsStore,
  project: Project,
  environment: PrepareEnvironment | undefined,
  report: (progress: JobProgress) => void,
): Promise<JobResultMap['prepare']> {
  await store.update(project.id, (current) => ({
    ...current,
    setup: {
      status: 'preparing',
      message: 'Preparing a separate test copy.',
      issue: null,
    },
    previews: [],
  }));
  try {
    if (!environment)
      throw new ReleaseError(
        'setup_incomplete',
        'The supported app environment is not configured yet.',
        'Connect the demo app startup adapter, then retry preparation.',
      );
    const workspace = createFileWorkspace(store.directory);
    const original = await workspace.versionDirectory(
      project.id,
      project.originalVersion.id,
    );
    if (
      !original ||
      (await directoryDigest(original, true)) !==
        project.originalVersion.contentDigest
    )
      throw new ReleaseError(
        'version_mismatch',
        'The original project no longer matches the imported version.',
        'Import the unchanged ZIP again.',
      );
    const environmentId = randomUUID();
    const environments = join(
      store.directory,
      'projects',
      project.id,
      'environments',
    );
    await mkdir(environments, { recursive: true });
    if (
      (await realpath(environments)) !==
      resolve(
        await realpath(store.directory),
        'projects',
        project.id,
        'environments',
      )
    )
      throw new ReleaseError(
        'invalid_request',
        'The environment directory is not a managed project path.',
      );
    const copy = join(environments, environmentId);
    await cp(original, copy, {
      recursive: true,
      force: false,
      errorOnExist: true,
      filter: async (source) => {
        if ((await lstat(source)).isSymbolicLink())
          throw new ReleaseError(
            'invalid_request',
            'Project files must not contain symbolic links.',
          );
        return true;
      },
    });
    await makeWritable(copy);
    report({
      step: 'preparing',
      message: 'Starting the app and its database.',
    });
    const result = await environment({
      projectId: project.id,
      versionId: project.originalVersion.id,
      environmentId,
      workingDirectory: copy,
      report,
    });
    if (
      !result ||
      !['ready', 'incomplete', 'unsupported'].includes(result.setup?.status) ||
      typeof result.setup.message !== 'string' ||
      !Array.isArray(result.previews) ||
      result.previews.some(
        (preview) => !validPreview(preview, project, environmentId),
      ) ||
      (result.setup.status === 'ready' &&
        (!result.previews.length || result.setup.issue !== null)) ||
      (result.setup.status !== 'ready' && result.previews.length)
    )
      throw new ReleaseError(
        'setup_incomplete',
        'The environment did not return a valid readiness result.',
        'Check the app startup adapter and retry.',
      );
    await store.update(project.id, (current) => ({
      ...current,
      setup: result.setup,
      previews: result.previews,
    }));
    return result;
  } catch (error) {
    const failure =
      error instanceof ReleaseError
        ? error
        : new ReleaseError(
            'setup_incomplete',
            'The app environment could not be prepared.',
            'Check the supported app setup and retry.',
          );
    await store.update(project.id, (current) => ({
      ...current,
      setup: {
        status: 'incomplete',
        message: failure.message,
        issue: {
          code: failure.code,
          message: failure.message,
          nextStep: failure.nextStep,
        },
      },
      previews: [],
    }));
    // Keep an adapter-owned copy when startup may have launched a process; cleanup belongs to that adapter.
    throw failure;
  }
}
