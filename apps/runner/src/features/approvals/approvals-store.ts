import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  Approval,
  CheckResult,
  Goal,
  ProjectId,
  VerificationResult,
  VersionId,
} from '@vibeguard/contracts';
import { isSafeId, resolveInside } from '../../lib/confined-path.js';
import { copyTree } from '../../lib/directory-digest.js';
import { ReleaseError } from '../../lib/release-error.js';

/** Runner-private record behind an Approval. Not an API payload.
 * Keeps the goal, checks, and results so later versions can be rechecked. */
export interface ApprovalRecord {
  approval: Approval;
  projectName: string;
  approvedAt: string;
  goal: Extract<Goal, { status: 'confirmed' }>;
  baseline: VerificationResult;
  verification: VerificationResult;
  checkSetId: string;
  /** Digest of the exact checked code at approval time. */
  contentDigest: string;
  originalVersionId: VersionId;
  originalDigest: string;
}

export interface RecheckRecord {
  ranAt: string;
  versionId: VersionId;
  verification: VerificationResult;
  /** Passed when the fix was approved; failed now. */
  regressions: CheckResult[];
}

function safe(id: string): string {
  if (!isSafeId(id)) {
    throw new ReleaseError('invalid_request', 'That ID is not valid.');
  }
  return id;
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2), 'utf8');
  await rename(temporary, file);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** Layout: <home>/projects/<projectId>/approvals/<approvalId>/
 *   approval.json   written last, so half-saved approvals never show up
 *   checks/         retained protected checks
 *   rechecks/       results of retained checks on later versions */
export function createApprovalStore(home: string) {
  const root = (projectId: ProjectId) =>
    resolveInside(home, 'projects', safe(projectId), 'approvals');
  const folder = (projectId: ProjectId, approvalId: string) =>
    resolveInside(root(projectId), safe(approvalId));

  return {
    async save(record: ApprovalRecord, checkSetDirectory: string) {
      const target = folder(record.approval.projectId, record.approval.id);
      await copyTree(checkSetDirectory, path.join(target, 'checks'));
      await writeJson(path.join(target, 'approval.json'), record);
    },
    find(projectId: ProjectId, approvalId: string) {
      return readJson<ApprovalRecord>(
        path.join(folder(projectId, approvalId), 'approval.json'),
      );
    },
    async list(projectId: ProjectId): Promise<ApprovalRecord[]> {
      let names: string[];
      try {
        names = await readdir(root(projectId));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
      }
      const records = await Promise.all(
        names.map((name) =>
          readJson<ApprovalRecord>(
            path.join(root(projectId), name, 'approval.json'),
          ),
        ),
      );
      return records
        .filter((record): record is ApprovalRecord => record !== null)
        .sort((a, b) => b.approvedAt.localeCompare(a.approvedAt));
    },
    checksDirectory(projectId: ProjectId, approvalId: string): string {
      return path.join(folder(projectId, approvalId), 'checks');
    },
    saveRecheck(
      projectId: ProjectId,
      approvalId: string,
      record: RecheckRecord,
    ) {
      return writeJson(
        path.join(
          folder(projectId, approvalId),
          'rechecks',
          `${safe(record.verification.id)}.json`,
        ),
        record,
      );
    },
  };
}
export type ApprovalStore = ReturnType<typeof createApprovalStore>;
