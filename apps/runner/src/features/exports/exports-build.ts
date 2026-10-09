import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ExportArtifact,
  ExportProjectRequest,
} from '@vibeguard/contracts';
import { isSafeId, resolveInside } from '../../lib/confined-path.js';
import {
  copyDirectory,
  copyTree,
  directoryDigest,
  listFiles,
} from '../../lib/directory-digest.js';
import { ReleaseError } from '../../lib/release-error.js';
import type { ReleaseWorkspace } from '../../lib/release-workspace.js';
import { writeZip } from '../../lib/zip.js';
import type {
  ApprovalRecord,
  ApprovalStore,
} from '../approvals/approvals-store.js';

export interface ExportDeps {
  home: string;
  workspace: ReleaseWorkspace;
  store: ApprovalStore;
}

export function parseExportRequest(body: unknown): ExportProjectRequest {
  const value = (body ?? {}) as Partial<ExportProjectRequest>;
  if (
    !isSafeId(value.approvalId) ||
    (value.format !== 'zip' && value.format !== 'folder')
  ) {
    throw new ReleaseError(
      'invalid_request',
      'Choose an approved fix and whether to save a ZIP or a folder.',
    );
  }
  return { approvalId: value.approvalId, format: value.format };
}

const exportsRoot = (home: string) => path.join(home, 'exports');

function safeName(name: string): string {
  return (
    name
      .replace(/[^A-Za-z0-9._ -]+/g, '-')
      .replace(/^[ .-]+|[ .-]+$/g, '')
      .slice(0, 60) || 'Project'
  );
}

/** Look up the approval and confirm the saved version is still the one that
 * was checked. Runs before the job starts and again inside it. */
export async function prepareExport(
  deps: ExportDeps,
  projectId: string,
  request: ExportProjectRequest,
) {
  const record = await deps.store.find(projectId, request.approvalId);
  if (!record) {
    throw new ReleaseError(
      'not_found',
      'That approved fix could not be found.',
    );
  }
  const versionDirectory = await deps.workspace.versionDirectory(
    projectId,
    record.approval.versionId,
  );
  if (!versionDirectory) {
    throw new ReleaseError('not_found', 'The approved version is missing.');
  }
  if ((await directoryDigest(versionDirectory)) !== record.contentDigest) {
    throw new ReleaseError(
      'version_mismatch',
      'The approved code changed after it was approved.',
      'Run the checks and approve the fix again.',
    );
  }
  return { record, versionDirectory };
}

async function runInstructions(
  record: ApprovalRecord,
  appDirectory: string,
): Promise<string> {
  const files = await listFiles(appDirectory);
  const compose = [
    'docker-compose.yml',
    'docker-compose.yaml',
    'compose.yml',
    'compose.yaml',
  ].find((name) => files.includes(name));
  let port: string | null = null;
  if (compose) {
    const text = await readFile(path.join(appDirectory, compose), 'utf8');
    port = text.match(/["']?(\d{2,5}):\d{2,5}["']?/)?.[1] ?? null;
  }
  const start = compose
    ? [
        '1. Install Docker Desktop and start it.',
        '2. Open a terminal in the `app` folder.',
        `3. Run \`docker compose -f ${compose} up --build\`.`,
        port
          ? `4. Open http://localhost:${port} in your browser.`
          : '4. Open the address the terminal shows.',
      ]
    : [
        'No Docker setup file was found in `app`.',
        'Open the `app` folder and follow its own instructions to start it.',
      ];
  return [
    `# ${record.projectName}, checked by VibeGuard`,
    '',
    'This folder holds a version of your app that passed its checks. It does not need the platform you built it on.',
    '',
    '## What is inside',
    '- `app/`: the exact code that was checked, with its service setup',
    '- `checks/`: the checks that proved the fix',
    '- `vibeguard.manifest.json`: the goal, the check results, and the code fingerprint',
    '',
    '## Goal',
    record.goal.description,
    '',
    `Expected: ${record.goal.expectedBehavior}`,
    '',
    '## Start the app',
    ...start,
    '',
    '## Check it again later',
    'Open VibeGuard and run the saved checks on any later version of this app.',
    '',
  ].join('\n');
}

async function buildBundle(
  record: ApprovalRecord,
  versionDirectory: string,
  checksDirectory: string,
  destination: string,
): Promise<void> {
  await mkdir(destination, { recursive: true });
  const appDirectory = path.join(destination, 'app');
  await copyDirectory(versionDirectory, appDirectory);
  await copyTree(checksDirectory, path.join(destination, 'checks'));
  // The saved copy must match the code that was checked.
  if ((await directoryDigest(appDirectory)) !== record.contentDigest) {
    throw new ReleaseError(
      'internal_error',
      'The saved copy does not match the checked code.',
      'Try saving again.',
    );
  }
  await writeFile(
    path.join(destination, 'RUN.md'),
    await runInstructions(record, appDirectory),
    'utf8',
  );
  await writeFile(
    path.join(destination, 'vibeguard.manifest.json'),
    JSON.stringify(
      {
        vibeguardExportVersion: 1,
        approvalId: record.approval.id,
        approvedAt: record.approvedAt,
        projectName: record.projectName,
        goal: record.goal,
        originalVersionId: record.originalVersionId,
        originalDigest: record.originalDigest,
        approvedVersionId: record.approval.versionId,
        approvedDigest: record.contentDigest,
        checkSetId: record.checkSetId,
        baseline: record.baseline,
        verification: record.verification,
      },
      null,
      2,
    ),
    'utf8',
  );
}

/** Save an approved version as a separate folder or ZIP under
 * <home>/exports/<artifactId>/. Only reads the approved version. */
export async function buildExport(
  deps: ExportDeps,
  projectId: string,
  request: ExportProjectRequest,
): Promise<ExportArtifact> {
  const { record, versionDirectory } = await prepareExport(
    deps,
    projectId,
    request,
  );
  const artifactId = `artifact_${randomUUID().slice(0, 8)}`;
  const base = resolveInside(exportsRoot(deps.home), artifactId);
  const displayName = `${safeName(record.projectName)} checked`;
  const checksDirectory = deps.store.checksDirectory(
    projectId,
    request.approvalId,
  );
  const folder = path.join(base, displayName);
  let zipPath: string | null = null;
  try {
    await buildBundle(record, versionDirectory, checksDirectory, folder);
    if (request.format === 'zip') {
      zipPath = path.join(base, `${displayName}.zip`);
      await writeZip(folder, zipPath, displayName);
      await rm(folder, { recursive: true, force: true });
    }
  } catch (error) {
    await rm(base, { recursive: true, force: true }); // no half-finished exports
    throw error;
  }

  const artifact: ExportArtifact = {
    id: artifactId,
    approvalId: record.approval.id,
    versionId: record.approval.versionId,
    format: request.format,
    displayName: request.format === 'zip' ? `${displayName}.zip` : displayName,
    downloadUrl:
      request.format === 'zip' ? `/api/artifacts/${artifactId}/download` : null,
    savedLocation: zipPath ?? folder,
  };
  // Written last: an export only exists once this file does.
  await writeFile(
    path.join(base, 'export.json'),
    JSON.stringify({ artifact, zipPath }, null, 2),
    'utf8',
  );
  return artifact;
}

/** Find the ZIP of a finished export for download. */
export async function findZip(
  home: string,
  artifactId: string,
): Promise<{ zipPath: string; displayName: string } | null> {
  if (!isSafeId(artifactId)) return null;
  try {
    const saved = JSON.parse(
      await readFile(
        path.join(resolveInside(exportsRoot(home), artifactId), 'export.json'),
        'utf8',
      ),
    ) as { artifact: ExportArtifact; zipPath: string | null };
    return saved.zipPath
      ? { zipPath: saved.zipPath, displayName: saved.artifact.displayName }
      : null;
  } catch {
    return null;
  }
}
