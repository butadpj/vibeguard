import { useEffect, useRef, useState } from 'react';
import type {
  Approval,
  ApproveFixRequest,
  CheckVerdict,
  ExportArtifact,
  ExportProjectRequest,
  JobAccepted,
  Project,
  RecheckRequest,
  VerificationResult,
} from '@vibeguard/contracts';
import { call, RunnerError, waitForJob } from '../runner';
import { CheckEvidence, checkExplanation } from './CheckEvidence';
import './ApprovalPanel.css';

const VERDICT_LABEL: Record<CheckVerdict, string> = {
  passed: 'Passed',
  failed: 'Failed',
  could_not_check: 'Could not check',
};

function Results({ result }: { result: VerificationResult }) {
  const headline =
    result.verdict === 'passed'
      ? 'Every saved check passed.'
      : result.verdict === 'failed'
        ? 'A saved check failed.'
        : 'Some saved checks could not run.';
  return (
    <div className="approval-results" data-verdict={result.verdict}>
      <h3>{headline}</h3>
      <ul>
        {result.checks.map((check) => (
          <li key={check.id}>
            <div className="approval-check-head">
              <strong>{check.name}</strong>
              <span className="approval-badge" data-verdict={check.verdict}>
                {VERDICT_LABEL[check.verdict]}
              </span>
            </div>
            <p className="note">{checkExplanation(check)}</p>
            <details>
              <summary>See evidence</summary>
              <ul className="approval-evidence">
                {check.evidence.map((item) => (
                  <li key={item.id}>
                    <CheckEvidence item={item} />
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Status({
  label,
  done,
  doneText,
  todoText,
}: {
  label: string;
  done: boolean;
  doneText: string;
  todoText: string;
}) {
  return (
    <li data-done={done}>
      <span>{label}</span>
      <span
        className="approval-badge"
        data-verdict={done ? 'passed' : 'pending'}
      >
        {done ? doneText : todoText}
      </span>
    </li>
  );
}

/** US5. Approve a checked fix, save it, and rerun its checks on later versions.
 * Shows a fix as approvable only when the runner reports passing checks. */
export function ApprovalPanel({
  project,
  onApproved,
}: {
  project: Project;
  onApproved?: (approval: Approval) => void;
}) {
  const [approval, setApproval] = useState<Approval | null>(project.approval);
  const [saved, setSaved] = useState<ExportArtifact | null>(null);
  const [recheck, setRecheck] = useState<VerificationResult | null>(null);
  const [busy, setBusy] = useState<
    'approve' | 'zip' | 'folder' | 'recheck' | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [versionId, setVersionId] = useState(
    project.candidateVersion?.id ?? project.originalVersion.id,
  );
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const candidate = project.candidateVersion;
  const verification = project.latestVerification;
  const fixChecked =
    candidate !== null &&
    project.goal?.status === 'confirmed' &&
    verification !== null &&
    verification.verdict === 'passed' &&
    verification.versionId === candidate.id &&
    verification.goalRevisionId === project.goal.revisionId &&
    project.activeJobId === null;
  const projectUrl = `/api/projects/${encodeURIComponent(project.id)}`;

  async function run(
    kind: NonNullable<typeof busy>,
    work: () => Promise<void>,
  ) {
    setBusy(kind);
    setError(null);
    try {
      await work();
    } catch (caught) {
      if (mounted.current) {
        setError(
          caught instanceof RunnerError
            ? caught.message
            : 'Something went wrong. Try again.',
        );
      }
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  const approve = () =>
    run('approve', async () => {
      const request: ApproveFixRequest = {
        versionId: candidate!.id,
        goalRevisionId: project.goal!.revisionId,
        verificationId: verification!.id,
      };
      const created = await call<Approval>(`${projectUrl}/approvals`, request);
      setApproval(created);
      onApproved?.(created);
    });

  const save = (format: ExportProjectRequest['format']) =>
    run(format, async () => {
      const request: ExportProjectRequest = {
        approvalId: approval!.id,
        format,
      };
      const { jobId } = await call<JobAccepted>(
        `${projectUrl}/exports`,
        request,
      );
      setSaved(await waitForJob(jobId, 'export', () => mounted.current));
    });

  const runChecks = () =>
    run('recheck', async () => {
      setRecheck(null);
      const request: RecheckRequest = { approvalId: approval!.id, versionId };
      const { jobId } = await call<JobAccepted>(
        `${projectUrl}/rechecks`,
        request,
      );
      setRecheck(await waitForJob(jobId, 'check', () => mounted.current));
    });

  return (
    <section className="approval" aria-labelledby="approval-title">
      <h2 id="approval-title">Save and keep checking</h2>
      {error && (
        <p className="approval-error" role="alert">
          {error}
        </p>
      )}

      {!approval && (
        <>
          <p>
            Approving saves the exact test copy that passed its checks, with its
            setup, run instructions, and the checks themselves. Your original
            project stays unchanged.
          </p>
          <div className="approval-actions">
            <button onClick={approve} disabled={!fixChecked || busy !== null}>
              {busy === 'approve' ? 'Approving…' : 'Approve & save locally'}
            </button>
          </div>
          {!fixChecked && (
            <p className="note">
              No verified fix is ready. Check a fix first, then approve it here.
            </p>
          )}
        </>
      )}

      {approval && (
        <>
          <p>
            Fix approved. VibeGuard will keep its checks for later versions.
          </p>
          <ul className="approval-statuses" aria-label="Status">
            <Status label="Fix checked" done doneText="Yes" todoText="No" />
            <Status
              label="Saved locally"
              done={saved !== null}
              doneText="Yes"
              todoText="Not saved yet"
            />
            <Status
              label="Shared to GitHub"
              done={false}
              doneText="Yes"
              todoText="Not shared"
            />
            <Status
              label="Live app checked"
              done={false}
              doneText="Yes"
              todoText="Not checked"
            />
          </ul>

          <h3>Save a separate copy</h3>
          <div className="approval-actions">
            <button onClick={() => save('zip')} disabled={busy !== null}>
              {busy === 'zip' ? 'Saving…' : 'Save as ZIP'}
            </button>
            <button
              className="secondary"
              onClick={() => save('folder')}
              disabled={busy !== null}
            >
              {busy === 'folder' ? 'Saving…' : 'Save as folder'}
            </button>
          </div>
          {saved && (
            <p role="status">
              Saved {saved.displayName}. Location: {saved.savedLocation}.{' '}
              {saved.downloadUrl && (
                <a href={saved.downloadUrl}>Download the ZIP</a>
              )}
            </p>
          )}

          <h3>Run the saved checks on a later version</h3>
          <label className="approval-field">
            Version to check
            <select
              value={versionId}
              onChange={(event) => setVersionId(event.target.value)}
            >
              {candidate && (
                <option value={candidate.id}>Latest test copy</option>
              )}
              <option value={project.originalVersion.id}>
                Original project
              </option>
            </select>
          </label>
          <div className="approval-actions">
            <button onClick={runChecks} disabled={busy !== null}>
              {busy === 'recheck' ? 'Checking…' : 'Run saved checks'}
            </button>
          </div>
          {busy === 'recheck' && (
            <p role="status" className="note">
              Running your saved checks…
            </p>
          )}
          {recheck && <Results result={recheck} />}
        </>
      )}
    </section>
  );
}
