import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { Project, SetupStatus } from '@vibeguard/contracts';
import type { ProjectClient } from '../projectClient';
import { RunnerError } from '../runner';

const MAX_UPLOAD = 20 * 1024 * 1024;

const SETUP_BADGE: Record<SetupStatus, { text: string; tone: string }> = {
  not_prepared: { text: 'Not prepared', tone: 'neutral' },
  preparing: { text: 'Preparing', tone: 'neutral' },
  ready: { text: 'Ready', tone: 'pass' },
  incomplete: { text: 'Setup incomplete', tone: 'fail' },
  unsupported: { text: 'Unsupported setup', tone: 'fail' },
};

export function setupLabel(project: Project | null) {
  return project ? SETUP_BADGE[project.setup.status].text : 'Not started';
}

const message = (caught: unknown) =>
  caught instanceof RunnerError
    ? caught.message
    : 'Something went wrong. Try again.';

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
        'That ZIP is larger than 20 MB. Remove build folders and try again.',
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
    setBusy('import');
    setError(null);
    try {
      const imported = await client.importProject(file, name);
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
        <label
          className="dropzone"
          data-dragging={dragging}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
        >
          <svg className="dropzone-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
          <span className="dropzone-title">
            {file ? file.name : 'Drop your project ZIP here'}
          </span>
          <span className="note">
            {file
              ? `${(file.size / 1024 / 1024).toFixed(1)} MB · click to choose a different file`
              : 'or click to choose a file · up to 20 MB'}
          </span>
          <input
            className="visually-hidden"
            type="file"
            accept=".zip,application/zip"
            onChange={(event) => choose(event.target.files?.[0])}
          />
        </label>
        <label className="field">
          Project name <span className="note">(optional)</span>
          <input
            type="text"
            value={name}
            maxLength={100}
            placeholder="Task app"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button
            type="button"
            onClick={importIt}
            disabled={busy !== null || (!file && !client.demo)}
          >
            {busy === 'import'
              ? 'Opening…'
              : client.demo && !file
                ? 'Use the sample project'
                : 'Open project'}
          </button>
        </div>
        {!file && !client.demo && (
          <p className="note">
            Choose a ZIP to continue. Nothing is uploaded to the internet.
          </p>
        )}
      </div>
    );
  }

  const status = project.setup.status;
  const badge = SETUP_BADGE[status];
  const preparing = busy === 'prepare';
  const stalled = status === 'preparing' && !preparing && !project.activeJobId;
  const preview = project.previews[0];

  return (
    <div className="stack">
      <div className="project-card">
        <span className="app-mark" aria-hidden="true">
          {project.name.trim().charAt(0).toUpperCase() || 'P'}
        </span>
        <span className="project-card-text">
          <strong>{project.name}</strong>
          <span className="note">
            Original locked · VibeGuard works on a copy
          </span>
        </span>
        <span className="badge" data-tone={badge.tone}>
          {badge.text}
        </span>
      </div>

      <section className="panel" aria-labelledby="setup-title">
        <div className="panel-head">
          <h2 id="setup-title">Test copy</h2>
          <span className="badge" data-tone={badge.tone}>
            {preparing ? 'Preparing…' : badge.text}
          </span>
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
                  <span aria-hidden="true">
                    {mark === 'current' ? '●' : mark === 'failed' ? '✗' : '✓'}
                  </span>{' '}
                  {line}
                </li>
              );
            })}
          </ol>
        )}
        {(stalled ||
          project.setup.message !== project.setup.issue?.message) && (
          <p role="status" className="setup-message">
            {stalled
              ? 'Preparation stopped before it finished. Try again.'
              : project.setup.message}
          </p>
        )}
        {project.setup.issue && (
          <div className="alert" role="alert">
            <strong>{project.setup.issue.message}</strong>
            {project.setup.issue.nextStep && (
              <span> {project.setup.issue.nextStep}</span>
            )}
          </div>
        )}
        {status === 'ready' && (
          <p className="note">
            Ready means the app and its own test database run on this computer
            without your hosting platform.
          </p>
        )}
      </section>

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
                <svg viewBox="0 0 24 24" aria-hidden="true">
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
          Demo data: no real test app is running, so there is no link to open.
        </p>
      )}
    </div>
  );
}
