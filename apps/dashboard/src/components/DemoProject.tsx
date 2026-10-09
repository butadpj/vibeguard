import { useState } from 'react';
import type { GetProjectResponse, Project } from '@vibeguard/contracts';
import { seededDemoProjectId } from '@vibeguard/contracts/examples';
import { call, RunnerError } from '../runner';
import { ApprovalPanel } from './ApprovalPanel';

const SEED_COMMAND =
  'docker compose exec runner pnpm --filter @vibeguard/runner seed:demo';

/** Temporary entry to US5 until import, preparation, and repair produce a
 * checked project: loads the project written by the runner's seed:demo script. */
export function DemoProject() {
  const [project, setProject] = useState<Project | null>(null);
  const [loads, setLoads] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  async function load() {
    setBusy(true);
    setError(null);
    setMissing(false);
    try {
      setProject(
        await call<GetProjectResponse>(
          `/api/projects/${encodeURIComponent(seededDemoProjectId)}`,
        ),
      );
      setLoads((count) => count + 1);
    } catch (caught) {
      setProject(null);
      if (caught instanceof RunnerError && caught.status === 404) {
        setMissing(true);
      } else {
        setError(
          caught instanceof RunnerError
            ? caught.message
            : 'Something went wrong. Try again.',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="notice">
        <strong>Demo project.</strong> Earlier steps don’t produce a checked fix
        yet, so this step uses a seeded sample project with a fix that already
        passed its checks.
      </div>
      <div className="actions">
        <button type="button" onClick={load} disabled={busy}>
          {busy
            ? 'Opening…'
            : project
              ? 'Reload demo project'
              : 'Open demo project'}
        </button>
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {missing && (
        <div className="notice" role="alert">
          <p>The demo project is not in the runner yet. Add it with:</p>
          <code>{SEED_COMMAND}</code>
          <p className="note">
            Running the command again resets the demo, including its approval.
          </p>
        </div>
      )}
      {project && (
        <>
          <p className="notice">
            <strong>Demo data.</strong> {project.name}'s earlier check results
            were seeded for development, not produced by a real repair. Saved
            checks run a stand-in script.
          </p>
          <div className="panel">
            <ApprovalPanel key={loads} project={project} />
          </div>
        </>
      )}
    </div>
  );
}
