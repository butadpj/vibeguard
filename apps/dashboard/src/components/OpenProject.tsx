import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { Project, SetupStatus } from '@vibeguard/contracts';
import type { ProjectClient } from '../projectClient';
import { RunnerError } from '../runner';

const MAX_UPLOAD = 20 * 1024 * 1024;

const SETUP: Record<
  SetupStatus,
  { badge: string; tone: 'neutral' | 'pass' | 'fail'; title: string }
> = {
  not_prepared: {
    badge: 'Not prepared',
    tone: 'neutral',
    title: 'Ready to prepare',
  },
  preparing: {
    badge: 'Preparing',
    tone: 'neutral',
    title: 'Preparing your test app…',
  },
  ready: { badge: 'Ready', tone: 'pass', title: 'Your test app is ready' },
  incomplete: {
    badge: 'Setup incomplete',
    tone: 'fail',
    title: 'VibeGuard couldn’t start this app yet',
  },
  unsupported: {
    badge: 'Unsupported setup',
    tone: 'fail',
    title: 'This app isn’t supported yet',
  },
};

export function setupLabel(project: Project | null) {
  return project ? SETUP[project.setup.status].badge : 'Not started';
}

const message = (caught: unknown) =>
  caught instanceof RunnerError
    ? caught.message
    : 'Something went wrong. Try again.';

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** US1. Import a ZIP, prepare a separate test copy, and show whether it runs. */
export function OpenProject({
  client,
  project,
  onProject,
  onContinue,
}: {
  client: ProjectClient;
  project: Project | null;
  onProject: (project: Project | null) => void;
  onContinue: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<'import' | 'prepare' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const followed = useRef<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const addLog = (line: string) =>
    setLog((lines) =>
      lines[lines.length - 1] === line ? lines : [...lines, line],
    );

  // Resume a preparation that was already running, e.g. after a page reload.
  useEffect(() => {
    if (
      !project?.activeJobId ||
      project.setup.status !== 'preparing' ||
      followed.current === project.activeJobId
    )
      return;
    followed.current = project.activeJobId;
    setBusy('prepare');
    client
      .follow(project, project.activeJobId, () => mounted.current, addLog)
      .then((next) => mounted.current && onProject(next))
      .catch((caught) => mounted.current && setError(message(caught)))
      .finally(() => mounted.current && setBusy(null));
  }, [client, project, onProject]);

  function choose(chosen: File | undefined) {
    setError(null);
    if (!chosen) return;
    if (!/\.zip$/i.test(chosen.name)) {
      setError('Choose a .zip file of your project.');
      return;
    }
    if (chosen.size > MAX_UPLOAD) {
      setError(
        `That ZIP is ${megabytes(chosen.size)}. The limit is 20 MB, so remove build folders like node_modules and try again.`,
      );
      return;
    }
    setFile(chosen);
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  }

  async function importIt() {
    if (!file && !client.demo) {
      picker.current?.click();
      return;
    }
    setBusy('import');
    setError(null);
    try {
      const fallback = file?.name.replace(/\.zip$/i, '') ?? '';
      const imported = await client.importProject(
        file,
        name.trim() || fallback,
      );
      if (!mounted.current) return;
      setLog([]);
      onProject(imported);
    } catch (caught) {
      if (mounted.current) setError(message(caught));
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  async function prepare() {
    if (!project) return;
    setBusy('prepare');
    setError(null);
    setLog([]);
    onProject({
      ...project,
      setup: {
        status: 'preparing',
        message: 'Preparing a separate test copy.',
        issue: null,
      },
      previews: [],
    });
    try {
      const next = await client.prepare(project, () => mounted.current, addLog);
      if (mounted.current) onProject(next);
    } catch (caught) {
      if (!mounted.current) return;
      setError(message(caught));
      // The runner may already have recorded a result; show its saved state.
      onProject(await client.getProject(project.id).catch(() => project));
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  function startOver() {
    setFile(null);
    setName('');
    setLog([]);
    setError(null);
    onProject(null);
  }

  if (!project) {
    return (
      <div className="stack">
        <div className="panel">
          <label
            className="dropzone"
            data-dragging={dragging}
            data-filled={file !== null}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
          >
            <svg className="icon-lg" viewBox="0 0 24 24" aria-hidden="true">
              {file ? (
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 14l2 2 4-4" />
              ) : (
                <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
              )}
            </svg>
            <span className="dropzone-title">
              {file ? file.name : 'Drop your project ZIP here'}
            </span>
            <span className="note">
              {file
                ? `${megabytes(file.size)} · Click to choose a different file`
                : 'or click to choose a file · up to 20 MB'}
            </span>
            <input
              ref={picker}
              className="visually-hidden"
              type="file"
              accept=".zip,application/zip"
              onChange={(event) => choose(event.target.files?.[0])}
            />
          </label>

          <label className="field">
            <span className="field-label">
              Project name <span className="field-hint">Optional</span>
            </span>
            <input
              type="text"
              value={name}
              maxLength={100}
              placeholder={
                file ? file.name.replace(/\.zip$/i, '') : 'Customer tracker'
              }
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}

          <div className="actions">
            <button type="button" onClick={importIt} disabled={busy !== null}>
              {busy === 'import'
                ? 'Opening…'
                : client.demo && !file
                  ? 'Use the sample project'
                  : file
                    ? 'Open project'
                    : 'Choose a ZIP'}
            </button>
            <span className="note">
              Stays on this computer. Nothing is uploaded to the internet.
            </span>
          </div>
        </div>

        <ol className="how" aria-label="What happens next">
          <li>
            <span className="how-number">1</span>
            <span>
              <strong>Choose your app</strong>A ZIP of your project folder.
            </span>
          </li>
          <li>
            <span className="how-number">2</span>
            <span>
              <strong>We make a safe copy</strong>Your original is never
              changed.
            </span>
          </li>
          <li>
            <span className="how-number">3</span>
            <span>
              <strong>Your test app starts</strong>With its own test database
              and a link to try it.
            </span>
          </li>
        </ol>
      </div>
    );
  }

  const status = project.setup.status;
  const info = SETUP[status];
  const preparing = busy === 'prepare';
  const stalled = status === 'preparing' && !preparing && !project.activeJobId;
  const preview = project.previews[0];
  const issue = project.setup.issue;
  const failed = status === 'incomplete' || status === 'unsupported';

  const explanation = stalled
    ? 'Preparation stopped before it finished. Try again.'
    : status === 'not_prepared'
      ? 'Next, VibeGuard copies your project and starts the app with its own test database. This can take a few minutes.'
      : status === 'ready'
        ? 'The app and its own test database are running on this computer, without your hosting platform.'
        : status === 'incomplete'
          ? 'Your project was imported safely, but its test app didn’t start, so nothing can be checked yet.'
          : project.setup.message;

  return (
    <div className="stack">
      <section className="panel" aria-labelledby="setup-title">
        <div className="project-head">
          <span className="app-mark" aria-hidden="true">
            {project.name.trim().charAt(0).toUpperCase() || 'P'}
          </span>
          <span className="project-head-text">
            <strong>{project.name}</strong>
            <span className="note">Original locked · we work on a copy</span>
          </span>
          <span className="badge" data-tone={info.tone}>
            {preparing ? 'Preparing' : info.badge}
          </span>
        </div>

        <div className="divider" />

        <div className="setup">
          <h2 id="setup-title">
            {stalled ? 'Preparation stopped' : info.title}
          </h2>
          <p role="status">{explanation}</p>
        </div>

        {log.length > 0 && (
          <ol className="log" aria-label="Preparation progress">
            {log.map((line, index) => {
              const last = index === log.length - 1;
              const mark =
                last && preparing
                  ? 'current'
                  : last && status !== 'ready'
                    ? 'failed'
                    : 'done';
              return (
                <li key={`${index}-${line}`} data-mark={mark}>
                  <span className="log-mark" aria-hidden="true" />
                  {line}
                  {mark === 'failed' && (
                    <span className="visually-hidden"> (did not finish)</span>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {failed && issue && (
          <details className="details">
            <summary>What went wrong</summary>
            <p>
              {issue.message}
              {issue.nextStep && ` ${issue.nextStep}`}
            </p>
          </details>
        )}

        {status === 'ready' && preview && !client.demo && (
          <div className="preview">
            <span className="note">Test app</span>
            <code>{preview.url}</code>
          </div>
        )}

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        <div className="actions">
          {(status === 'not_prepared' ||
            status === 'incomplete' ||
            stalled ||
            preparing) && (
            <button type="button" onClick={prepare} disabled={busy !== null}>
              {preparing
                ? 'Preparing…'
                : status === 'not_prepared'
                  ? 'Prepare test app'
                  : 'Try again'}
            </button>
          )}
          {status === 'ready' && (
            <>
              <button type="button" onClick={onContinue}>
                Continue to goal
              </button>
              {preview && !client.demo && (
                <a
                  className="button secondary"
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open test app
                  <span className="visually-hidden"> (opens in a new tab)</span>
                  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                  </svg>
                </a>
              )}
            </>
          )}
          <button
            type="button"
            className="quiet"
            onClick={startOver}
            disabled={busy !== null}
          >
            Open a different project
          </button>
        </div>
        {status === 'ready' && client.demo && (
          <p className="note">
            Demo data: no real test app is running, so there’s no link to open.
          </p>
        )}
      </section>
    </div>
  );
}
