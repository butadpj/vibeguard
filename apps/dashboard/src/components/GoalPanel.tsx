import { useEffect, useRef, useState } from 'react';
import type { GoalDraft, Job, Project } from '@vibeguard/contracts';
import { confirmGoal, discussGoal } from '../goalClient';
import { call, RunnerError } from '../runner';

export function GoalPanel({
  project,
  demo,
  onProject,
  onContinue,
}: {
  project: Project;
  demo: boolean;
  onProject: (project: Project) => void;
  onContinue: () => void;
}) {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<GoalDraft | null>(project.goal);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const running = useRef(false);
  const followed = useRef<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setDraft(project.goal);
  }, [project.goal]);
  const blocked =
    busy || project.activeJobId !== null || project.setup.status !== 'ready';
  const unchanged =
    project.goal?.status === 'confirmed' &&
    JSON.stringify(
      draft && {
        description: draft.description,
        expectedBehavior: draft.expectedBehavior,
        performance: draft.performance,
      },
    ) ===
      JSON.stringify({
        description: project.goal.description,
        expectedBehavior: project.goal.expectedBehavior,
        performance: project.goal.performance,
      });

  async function run(work: () => Promise<Project>, confirmed = false) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    setProgress('Working with your local runner…');
    try {
      const next = await work();
      if (!mounted.current) return;
      onProject(next);
      if (confirmed) onContinue();
      else setText('');
    } catch (caught) {
      if (mounted.current)
        setError(
          caught instanceof RunnerError
            ? caught.message
            : 'Could not update your goal. Try again.',
        );
      if (!demo && mounted.current) {
        try {
          const next = await call<Project>(
            `/api/projects/${encodeURIComponent(project.id)}`,
          );
          if (mounted.current) onProject(next);
        } catch {
          /* Keep the actionable error when refresh is unavailable. */
        }
      }
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  useEffect(() => {
    const id = project.activeJobId;
    if (!id || demo || running.current || followed.current === id) return;
    let alive = true;
    call<Job>(`/api/jobs/${encodeURIComponent(id)}`)
      .then((job) => {
        if (!alive || job.operation !== 'message') return;
        followed.current = id;
        void run(() =>
          discussGoal(
            project,
            '',
            false,
            () => mounted.current,
            setProgress,
            id,
          ),
        );
      })
      .catch((caught) => {
        if (alive)
          setError(
            caught instanceof RunnerError
              ? caught.message
              : 'Could not reopen the conversation.',
          );
      });
    return () => {
      alive = false;
    };
  }, [project.activeJobId, demo]);

  return (
    <div className="stack">
      {demo && (
        <p className="notice">
          Sample conversation only. The local AI is not running.
        </p>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {project.activeJobId && (
        <p className="notice" role="status">
          Another task is running. Wait for it to finish before changing your
          goal.
        </p>
      )}
      <section className="panel" aria-labelledby="conversation-title">
        <h2 id="conversation-title">Explain the problem</h2>
        {project.messages.length === 0 && (
          <p className="note">
            What goes wrong, and what should happen instead?
          </p>
        )}
        <ol className="goal-messages" aria-label="Conversation">
          {project.messages.map((message, index) => (
            <li key={`${message.id}:${index}`}>
              <strong>
                {message.role === 'user'
                  ? 'You'
                  : demo
                    ? 'Sample assistant'
                    : 'Local AI'}
              </strong>
              <p>{message.text}</p>
            </li>
          ))}
        </ol>
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() =>
              discussGoal(
                project,
                text.trim(),
                demo,
                () => mounted.current,
                setProgress,
              ),
            );
          }}
        >
          <label className="field">
            <span className="field-label">Your message</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={4000}
              required
              disabled={blocked}
            />
          </label>
          <div className="actions">
            <button disabled={blocked || !text.trim()}>
              {busy ? 'Working…' : 'Send message'}
            </button>
          </div>
        </form>
        {busy && (
          <p className="note" role="status">
            {progress}
          </p>
        )}
      </section>
      <section className="panel" aria-labelledby="goal-title">
        <div className="panel-head">
          <h2 id="goal-title">Your agreed goal</h2>
          <span className="badge" data-tone={unchanged ? 'pass' : 'neutral'}>
            {unchanged ? 'Confirmed' : 'Needs confirmation'}
          </span>
        </div>
        {!draft ? (
          <p className="note">
            Send a message to get a proposed goal you can edit.
          </p>
        ) : (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (unchanged) onContinue();
              else void run(() => confirmGoal(project, draft, demo), true);
            }}
          >
            <label className="field">
              <span className="field-label">Problem to investigate</span>
              <textarea
                value={draft.description}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
                maxLength={4000}
                required
                disabled={blocked}
              />
            </label>
            <label className="field">
              <span className="field-label">What should happen</span>
              <textarea
                value={draft.expectedBehavior}
                onChange={(event) =>
                  setDraft({ ...draft, expectedBehavior: event.target.value })
                }
                maxLength={4000}
                required
                disabled={blocked}
              />
            </label>
            {draft.performance && (
              <>
                <label className="field">
                  <span className="field-label">Action to time</span>
                  <input
                    value={draft.performance.action}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        performance: {
                          ...draft.performance!,
                          action: event.target.value,
                        },
                      })
                    }
                    maxLength={500}
                    required
                    disabled={blocked}
                  />
                </label>
                <label className="field">
                  <span className="field-label">
                    Maximum time in milliseconds
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={draft.performance.maxDurationMs}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        performance: {
                          ...draft.performance!,
                          maxDurationMs: event.target.valueAsNumber,
                        },
                      })
                    }
                    required
                    disabled={blocked}
                  />
                </label>
              </>
            )}
            <p className="note">
              Confirming a goal does not approve a fix. Changing it requires
              fresh checks.
            </p>
            <div className="actions">
              <button
                disabled={
                  blocked ||
                  !draft.description.trim() ||
                  !draft.expectedBehavior.trim()
                }
              >
                {unchanged ? 'Continue to checks' : 'Confirm goal & continue'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
