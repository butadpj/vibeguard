import { Router } from 'express';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  RepairEvidenceResponse,
  RepairFileChange,
  RepairDiffResponse,
  VerificationResult,
  RepairAttempt,
} from '@vibeguard/contracts';
import { isSafeId } from '../../lib/confined-path.js';
import { directoryDigest } from '../../lib/directory-digest.js';
import { handleRelease, ReleaseError } from '../../lib/release-error.js';
import type { ProjectsStore } from '../projects/projects-store.js';
import { validateChecks } from '../checks/checks-baseline.js';

const MAX_BYTES = 1024 * 1024;
async function readManaged(home: string, file: string) {
  const expected = resolve(
    await realpath(home),
    file.slice(resolve(home).length + 1),
  );
  if ((await realpath(file)) !== expected)
    throw new ReleaseError('not_found', 'Repair evidence is unavailable.');
  const stat = await lstat(file);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_BYTES)
    throw new ReleaseError('not_found', 'Repair evidence is unavailable.');
  return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
}
function changes(value: unknown): RepairFileChange[] {
  if (!Array.isArray(value) || value.length > 2) return [];
  if (
    value.some(
      (item) =>
        !item ||
        !['customers.js', 'customers.test.mjs'].includes(item.file) ||
        ![item.before, item.after].every(
          (text) => text === null || typeof text === 'string',
        ),
    )
  )
    return [];
  return value.map((item) => ({
    file: item.file,
    before: item.before,
    after: item.after,
  }));
}

/** Serve only selected evidence fields. Never serve arbitrary workspace files or raw model logs. */
export function createRepairEvidenceRoutes(deps: { projects: ProjectsStore }) {
  const routes = Router();
  routes.use(
    ['/projects/:id/repair-evidence', '/projects/:id/diffs/:artifactId'],
    (request, response, next) => {
      const origin = request.get('origin');
      if (
        request.get('x-vibeguard-request') !== '1' ||
        request.get('sec-fetch-site') === 'cross-site' ||
        (origin &&
          ![
            'http://localhost:4310',
            'http://127.0.0.1:4310',
            'http://localhost:5173',
            'http://127.0.0.1:5173',
          ].includes(origin))
      ) {
        response.status(403).json({
          error: {
            code: 'invalid_request',
            message:
              'Read repair evidence from the local dashboard with X-VibeGuard-Request: 1.',
            nextStep: null,
          },
        });
        return;
      }
      response.set('Cache-Control', 'no-store');
      response.set('X-Content-Type-Options', 'nosniff');
      next();
    },
  );
  async function records(projectId: string) {
    const project = await deps.projects.require(projectId);
    if (project.goal?.status !== 'confirmed')
      throw new ReleaseError(
        'conflict',
        'Confirm the current goal before reading repair evidence.',
      );
    const root = join(
      deps.projects.directory,
      'projects',
      project.id,
      'repairs',
    );
    let entries;
    try {
      if (
        (await realpath(root)) !==
        resolve(
          await realpath(deps.projects.directory),
          'projects',
          project.id,
          'repairs',
        )
      )
        throw new ReleaseError('not_found', 'Repair evidence is unavailable.');
      entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { project, trials: [] };
      throw error;
    }
    if (entries.length > 100)
      throw new ReleaseError(
        'conflict',
        'There are too many repair records to read.',
      );
    const trials: {
      modified: number;
      attempts: RepairEvidenceResponse['attempts'];
    }[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !isSafeId(entry.name)) continue;
      const folder = join(root, entry.name);
      const attempts: RepairEvidenceResponse['attempts'] = [];
      for (const number of [1, 2] as const) {
        let record;
        try {
          record = await readManaged(
            deps.projects.directory,
            join(folder, `attempt-${number}`, 'evidence.json'),
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
          if (error instanceof ReleaseError) throw error;
          throw new ReleaseError(
            'check_unavailable',
            'The saved repair evidence could not be read.',
          );
        }
        const attempt = record.attempt as RepairAttempt;
        if (
          record.goalRevisionId !== project.goal.revisionId ||
          attempt?.sourceVersionId !== project.originalVersion.id
        )
          continue;
        if (
          attempt.number !== number ||
          !Number.isFinite(record.durationMs) ||
          (record.durationMs as number) < 0 ||
          !(
            attempt.candidateVersionId === null ||
            isSafeId(attempt.candidateVersionId)
          ) ||
          !(attempt.verificationId === null || isSafeId(attempt.verificationId))
        )
          throw new ReleaseError(
            'check_unavailable',
            'The saved repair evidence is invalid.',
          );
        let verification: VerificationResult | null = null;
        const saved = record.verification as VerificationResult | undefined;
        if (saved) {
          if (
            saved.projectId !== project.id ||
            saved.versionId !== attempt.candidateVersionId ||
            saved.goalRevisionId !== project.goal.revisionId ||
            saved.id !== attempt.verificationId ||
            !['passed', 'failed', 'could_not_check'].includes(saved.verdict)
          )
            throw new ReleaseError(
              'version_mismatch',
              'Repair evidence belongs to a different version or goal.',
            );
          verification = {
            id: saved.id,
            projectId: saved.projectId,
            versionId: saved.versionId,
            goalRevisionId: saved.goalRevisionId,
            checkSetId: saved.checkSetId,
            checkSetDigest: saved.checkSetDigest,
            verdict: saved.verdict,
            checks: validateChecks(saved.checks).map((check) => ({
              id: check.id,
              name: check.name,
              scope: check.scope,
              verdict: check.verdict,
              explanation: check.explanation,
              evidence: check.evidence.map((item) => ({
                id: item.id,
                kind: item.kind,
                summary: item.summary,
                artifactId: item.artifactId,
                durationMs: item.durationMs,
              })),
            })),
          };
        }
        attempts.push({
          attempt: {
            number,
            sourceVersionId: attempt.sourceVersionId,
            candidateVersionId: attempt.candidateVersionId,
            verificationId: attempt.verificationId,
            issue: attempt.issue
              ? {
                  code: attempt.issue.code,
                  message: attempt.issue.message,
                  nextStep: attempt.issue.nextStep,
                }
              : null,
          },
          durationMs: record.durationMs as number,
          changes: changes(record.diff),
          verification,
        });
      }
      if (attempts.length)
        trials.push({ modified: (await lstat(folder)).mtimeMs, attempts });
    }
    trials.sort((a, b) => b.modified - a.modified);
    return { project, trials };
  }
  routes.get(
    '/projects/:id/repair-evidence',
    handleRelease(async (request, response) => {
      const { project, trials } = await records(String(request.params.id));
      response.json({
        projectId: project.id,
        sourceVersionId: project.originalVersion.id,
        goalRevisionId: project.goal!.revisionId,
        attempts: trials[0]?.attempts ?? [],
      } satisfies RepairEvidenceResponse);
    }),
  );
  routes.get(
    '/projects/:id/diffs/:artifactId',
    handleRelease(async (request, response) => {
      const id = String(request.params.artifactId);
      if (!isSafeId(id)) throw new ReleaseError('not_found', 'Diff not found.');
      const { project, trials } = await records(String(request.params.id));
      const candidate = project.candidateVersion;
      const verification = project.latestVerification;
      if (
        !candidate ||
        !isSafeId(candidate.id) ||
        id !== `diff_${candidate.id}` ||
        verification?.versionId !== candidate.id ||
        verification.verdict !== 'passed'
      )
        throw new ReleaseError('not_found', 'Checked diff not found.');
      const item = trials
        .flatMap((trial) => trial.attempts)
        .find(
          (item) =>
            item.verification?.id === verification.id &&
            item.attempt.candidateVersionId === candidate.id,
        );
      if (
        !item ||
        !item.changes.length ||
        item.verification?.verdict !== 'passed'
      )
        throw new ReleaseError('not_found', 'Checked diff not found.');
      const path = join(
        deps.projects.directory,
        'projects',
        project.id,
        'versions',
        candidate.id,
      );
      if (
        (await realpath(path)) !==
          resolve(
            await realpath(deps.projects.directory),
            'projects',
            project.id,
            'versions',
            candidate.id,
          ) ||
        (await directoryDigest(path)) !== candidate.contentDigest
      )
        throw new ReleaseError(
          'version_mismatch',
          'The candidate changed after verification.',
        );
      const original = join(
        deps.projects.directory,
        'projects',
        project.id,
        'original',
      );
      if (
        (await realpath(original)) !==
          resolve(
            await realpath(deps.projects.directory),
            'projects',
            project.id,
            'original',
          ) ||
        (await directoryDigest(original, true)) !==
          project.originalVersion.contentDigest
      )
        throw new ReleaseError(
          'version_mismatch',
          'The original changed after import.',
        );
      for (const change of item.changes) {
        async function content(root: string) {
          try {
            return await readFile(join(root, change.file), 'utf8');
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
          }
        }
        if (
          (await content(original)) !== change.before ||
          (await content(path)) !== change.after
        )
          throw new ReleaseError(
            'version_mismatch',
            'The saved diff does not match the checked version.',
          );
      }
      response.json({
        artifactId: id,
        projectId: project.id,
        versionId: candidate.id,
        verificationId: verification.id,
        changes: item.changes,
      } satisfies RepairDiffResponse);
    }),
  );
  return routes;
}
