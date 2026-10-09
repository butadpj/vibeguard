import { useEffect, useRef, useState } from 'react';
import type {
  Job,
  Project,
  RepairDiffResponse,
  RepairEvidenceResponse,
  RepairResult,
  VerificationResult,
} from '@vibeguard/contracts';
import { baselineFailedProjectExample } from '@vibeguard/contracts/examples';
import {
  candidatePreview,
  checkBlocker,
  repairBlocker,
  runCheckRepair,
  getRepairDiff,
  getRepairEvidence,
} from '../checkRepairClient';
import { call } from '../runner';
import { CheckEvidence, checkExplanation } from './CheckEvidence';
import './CheckRepairPanel.css';

const labels = {
  passed: 'Passed',
  failed: 'Failed',
  could_not_check: 'Could not check',
};
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Could not finish. Try again.';

export function CheckReport({
  result,
  title,
}: {
  result: VerificationResult;
  title: string;
}) {
  return (
    <section className="panel check-report" aria-label={title}>
      <div className="panel-head">
        <h2>{title}</h2>
        <span
          className="badge"
          data-tone={
            result.verdict === 'passed'
              ? 'pass'
              : result.verdict === 'failed'
                ? 'fail'
                : 'neutral'
          }
        >
          {labels[result.verdict]}
        </span>
      </div>
      <ul>
        {result.checks.map((check) => (
          <li key={check.id}>
            <div className="check-heading">
              <h3>{check.name}</h3>
              <strong>{labels[check.verdict]}</strong>
            </div>
            <p>{checkExplanation(check)}</p>
            <details className="details">
              <summary>Evidence and timings</summary>
              {check.evidence.length ? (
                <ul>
                  {check.evidence.map((item) => (
                    <li key={item.id}>
                      <CheckEvidence item={item} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="note">No evidence was recorded.</p>
              )}
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RepairSummary({ summary }: { summary?: string }) {
  return (
    <>
      <p role="status">
        <strong>The candidate passed the required checks.</strong> Try the fixed
        test app to confirm it behaves as expected before approving it.
      </p>
      {summary && (
        <details className="details repair-diagnosis">
          <summary>Technical diagnosis and repair plan</summary>
          <p className="note">{summary}</p>
        </details>
      )}
    </>
  );
}

export function CheckRepairPanel({
  project,
  demo,
  operation,
  onProject,
  onContinue,
}: {
  project: Project;
  demo: boolean;
  operation: 'check' | 'repair';
  onProject: (project: Project) => void;
  onContinue: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repair, setRepair] = useState<RepairResult | null>(null);
  const [evidence, setEvidence] = useState<RepairEvidenceResponse | null>(null);
  const [diff, setDiff] = useState<RepairDiffResponse | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const mounted = useRef(false);
  const running = useRef(false);
  const readGeneration = useRef(0);
  const followed = useRef<string | null>(null);
  const onProjectRef = useRef(onProject);
  onProjectRef.current = onProject;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function readEvidence(artifactId?: string | null) {
    const generation = ++readGeneration.current;
    setReading(true);
    setReadError(null);
    try {
      const saved = await getRepairEvidence(project.id, demo);
      if (!mounted.current || generation !== readGeneration.current) return;
      setEvidence(saved);
      if (artifactId) {
        const checked = await getRepairDiff(project.id, artifactId, demo);
        if (mounted.current && generation === readGeneration.current)
          setDiff(checked);
      }
    } catch (caught) {
      if (mounted.current && generation === readGeneration.current)
        setReadError(errorText(caught));
    } finally {
      if (mounted.current && generation === readGeneration.current)
        setReading(false);
    }
  }

  async function start(jobId?: string, unsuccessful = false) {
    if (running.current) return;
    readGeneration.current++;
    setReading(false);
    running.current = true;
    setJob(null);
    setBusy(true);
    setError(null);
    setRepair(null);
    setDiff(null);
    setEvidence(null);
    try {
      const finished = await runCheckRepair({
        project,
        operation,
        demo,
        jobId,
        unsuccessful,
        alive: () => mounted.current,
        onJob: (next) => {
          if (mounted.current) {
            setJob(next);
            if (next.status === 'running')
              onProjectRef.current({ ...project, activeJobId: next.id });
          }
        },
      });
      if (!mounted.current) return;
      onProjectRef.current(finished.project);
      setRepair(finished.repair);
      if (operation === 'repair')
        await readEvidence(finished.repair?.diffArtifactId);
    } catch (caught) {
      if (!mounted.current) return;
      setError(errorText(caught));
      if (!demo) {
        try {
          const saved = await call<Project>(
            `/api/projects/${encodeURIComponent(project.id)}`,
          );
          if (mounted.current) onProjectRef.current(saved);
        } catch {
          /* Keep the last snapshot and the actionable job error. */
        }
      }
      if (operation === 'repair') await readEvidence();
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  // Recover active checks/repairs after a reload, without starting another job.
  useEffect(() => {
    const id = project.activeJobId;
    if (!id || demo || followed.current === id || running.current) return;
    let alive = true;
    call<Job>(`/api/jobs/${encodeURIComponent(id)}`)
      .then((active) => {
        if (!alive || active.operation !== operation) return;
        followed.current = id;
        void start(id);
      })
      .catch((caught) => {
        if (alive) setError(errorText(caught));
      });
    return () => {
      alive = false;
    };
  }, [project.activeJobId, demo, operation]);

  useEffect(() => {
    if (
      operation === 'repair' &&
      project.goal?.status === 'confirmed' &&
      !demo &&
      !running.current
    )
      void readEvidence();
  }, [project.id, project.goal?.revisionId, operation]);

  const baseline =
    project.baseline?.goalRevisionId === project.goal?.revisionId &&
    project.baseline?.versionId === project.originalVersion.id
      ? project.baseline
      : null;
  const blocker =
    operation === 'check' ? checkBlocker(project) : repairBlocker(project);
  const preview = candidatePreview(project);
  const noFix =
    repair?.outcome === 'no_verified_fix' ||
    (operation === 'repair' &&
      job !== null &&
      (job.status === 'failed' || job.status === 'cancelled'));
  const attempts =
    repair?.attempts ??
    job?.repairAttempts ??
    evidence?.attempts.map((entry) => entry.attempt) ??
    [];
  const verified =
    project.latestVerification?.versionId === project.candidateVersion?.id &&
    project.latestVerification?.goalRevisionId === project.goal?.revisionId
      ? project.latestVerification
      : null;

  return (
    <div className="stack">
      <section
        className="panel"
        aria-label={
          operation === 'check' ? 'Run baseline checks' : 'Repair progress'
        }
      >
        <h2>
          {operation === 'check'
            ? 'Check the original copy'
            : 'Try a focused repair'}
        </h2>
        {project.goal?.status === 'confirmed' && (
          <p>Goal: {project.goal.expectedBehavior}</p>
        )}
        {demo && (
          <p className="note">
            Sample results only. No app is checked or repaired.
          </p>
        )}
        {blocker && <p className="note">{blocker}</p>}
        {busy && <p role="status">{job?.progress.message ?? 'Starting…'}</p>}
        {attempts.length > 0 && (
          <ol className="repair-attempts" aria-label="Repair attempts">
            {attempts.map((attempt) => (
              <li key={attempt.number}>
                Attempt {attempt.number} of 2
                {attempt.issue
                  ? `: ${attempt.issue.message} ${attempt.issue.nextStep ?? ''}`
                  : attempt.verificationId
                    ? ': checks recorded'
                    : ': in progress'}
              </li>
            ))}
          </ol>
        )}
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        {noFix && (
          <p role="status">
            <strong>No verified fix ready.</strong>{' '}
            {repair?.summary ??
              'The repair did not produce a checked candidate for testing.'}
          </p>
        )}
        {operation === 'repair' && !noFix && verified?.verdict === 'passed' && (
          <RepairSummary
            summary={repair?.outcome === 'checked' ? repair.summary : undefined}
          />
        )}
        <div className="actions">
          {!demo && (
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={async () => {
                try {
                  const saved = await call<Project>(
                    `/api/projects/${encodeURIComponent(project.id)}`,
                  );
                  if (mounted.current) {
                    setError(null);
                    onProjectRef.current(saved);
                  }
                } catch (caught) {
                  if (mounted.current) setError(errorText(caught));
                }
              }}
            >
              Refresh project
            </button>
          )}
          <button
            type="button"
            disabled={busy || blocker !== null}
            onClick={() => void start()}
          >
            {busy
              ? 'Working…'
              : operation === 'check'
                ? 'Run baseline checks'
                : 'Try repair'}
          </button>
          {demo &&
            operation === 'check' &&
            project.goal?.status !== 'confirmed' && (
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  onProject({
                    ...project,
                    goal: structuredClone(baselineFailedProjectExample.goal),
                  })
                }
              >
                Use sample confirmed goal
              </button>
            )}
          {demo && operation === 'repair' && (
            <button
              type="button"
              className="secondary"
              disabled={busy || blocker !== null}
              onClick={() => void start(undefined, true)}
            >
              Show unsuccessful sample
            </button>
          )}
          {operation === 'check' && baseline?.verdict === 'failed' && (
            <button type="button" className="secondary" onClick={onContinue}>
              Continue to repair
            </button>
          )}
          {operation === 'repair' && preview && !noFix && !busy && (
            <>
              {!demo && (
                <a
                  className="button secondary"
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Try the fixed test app
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              )}
              {demo ? (
                <p className="note">
                  No real candidate app is running in Demo data.
                </p>
              ) : (
                <button
                  type="button"
                  className="secondary"
                  onClick={onContinue}
                >
                  Continue to approval
                </button>
              )}
            </>
          )}
        </div>
        {verified?.verdict === 'passed' && !preview && (
          <p className="note">
            Checks passed, but a candidate preview is unavailable. Human testing
            is still required.
          </p>
        )}
      </section>
      {baseline && (
        <CheckReport result={baseline} title="Before: original copy" />
      )}
      {operation === 'repair' && verified && (
        <CheckReport result={verified} title="After: candidate copy" />
      )}
      {operation === 'repair' && (
        <section
          className="panel repair-evidence"
          aria-label="Repair evidence and changes"
        >
          <div className="panel-head">
            <h2>Evidence and code changes</h2>
            <button
              type="button"
              className="quiet"
              disabled={reading || busy}
              onClick={() => void readEvidence(repair?.diffArtifactId)}
            >
              Refresh evidence
            </button>
          </div>
          {reading && <p role="status">Reading saved evidence…</p>}
          {readError && (
            <p className="alert" role="alert">
              {readError}
            </p>
          )}
          {!reading && !readError && !evidence?.attempts.length && (
            <p className="note">
              No repair evidence has been recorded for this goal yet.
            </p>
          )}
          {evidence?.attempts.map((entry) => (
            <div key={entry.attempt.number}>
              <h3>
                Attempt {entry.attempt.number} ·{' '}
                {entry.durationMs.toLocaleString()} ms
              </h3>
              {entry.attempt.issue && (
                <p className="note">
                  {entry.attempt.issue.message} {entry.attempt.issue.nextStep}
                </p>
              )}
              {entry.verification && (
                <p>{labels[entry.verification.verdict]}</p>
              )}
              {entry.verification?.checks.map((check) => (
                <details className="details" key={check.id}>
                  <summary>
                    {check.name}: {labels[check.verdict]}
                  </summary>
                  <p>{checkExplanation(check)}</p>
                  {check.evidence.map((item) => (
                    <p className="note" key={item.id}>
                      <CheckEvidence item={item} />
                    </p>
                  ))}
                </details>
              ))}
              {entry.changes.map((change) => (
                <details className="details" key={change.file}>
                  <summary>{change.file} — recorded change</summary>
                  <div className="source-comparison">
                    <div>
                      <h4>Before</h4>
                      <pre>{change.before ?? '(New file)'}</pre>
                    </div>
                    <div>
                      <h4>After</h4>
                      <pre>{change.after ?? '(File removed)'}</pre>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          ))}
          {diff && (
            <div>
              <h3>Checked candidate changes</h3>
              <p className="note">
                These changes belong to the checked candidate.
              </p>
              {diff.changes.map((change) => (
                <details className="details" key={change.file}>
                  <summary>{change.file}</summary>
                  <div className="source-comparison">
                    <div>
                      <h4>Before</h4>
                      <pre>{change.before ?? '(New file)'}</pre>
                    </div>
                    <div>
                      <h4>After</h4>
                      <pre>{change.after ?? '(File removed)'}</pre>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
