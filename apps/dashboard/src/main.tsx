import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { HealthResponse, Project } from '@vibeguard/contracts';
import '@vibeguard/design-tokens/tokens.css';
import './styles.css';
import { ApprovalPanel } from './components/ApprovalPanel';
import { CheckRepairPanel } from './components/CheckRepairPanel';
import { DemoProject } from './components/DemoProject';
import { OpenProject, setupLabel } from './components/OpenProject';
import { StepRail, type RailStep } from './components/StepRail';
import { demoClient, liveClient } from './projectClient';

const PROJECT_KEY = 'vibeguard:projectId';
const DEMO_KEY = 'vibeguard:demoData';

// Browser storage only remembers conveniences; it may be unavailable.
const remember = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
};
const recall = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const STEPS: {
  label: string;
  title: string;
  intro: string;
  upcoming?: string[];
}[] = [
  {
    label: 'Open project',
    title: 'Open your project',
    intro:
      'VibeGuard makes a separate test copy with its own test data. Your original never changes.',
  },
  {
    label: 'Set the goal',
    title: 'Say what should happen',
    intro:
      'Explain the problem in plain words. VibeGuard turns it into a goal you confirm.',
    upcoming: [
      'Chat with the local AI about what goes wrong.',
      'Edit the goal it writes until it matches what you expect.',
      'Confirm it. Confirming a goal never approves a fix.',
    ],
  },
  {
    label: 'Catch the bug',
    title: 'Prove it’s broken',
    intro:
      'Before changing any code, VibeGuard checks the original copy with real saved data.',
    upcoming: [
      'Each check shows Passed, Failed, or Could not check.',
      'Every result comes with evidence you can open.',
      'Create, view, edit, and delete are always checked.',
    ],
  },
  {
    label: 'Try the fix',
    title: 'Fix it, then prove it',
    intro:
      'The local AI edits a copy, at most twice. The same protected checks then run on a fresh copy.',
    upcoming: [
      'See the change and the before/after results.',
      'Try the fixed test app yourself.',
      'If no attempt passes every check, you’ll see “No verified fix is ready”.',
    ],
  },
  {
    label: 'Approve & save',
    title: 'Keep the fix, keep the check',
    intro:
      'Approve the exact checked copy, save it, and rerun its checks after later changes.',
  },
];

function App() {
  const [demo, setDemo] = useState(() => recall(DEMO_KEY) === '1');
  const client = demo ? demoClient : liveClient;
  const [project, setProject] = useState<Project | null>(null);
  const [restoring, setRestoring] = useState(
    () => !demo && recall(PROJECT_KEY) !== null,
  );
  const [step, setStep] = useState(0);
  const [runner, setRunner] = useState<'checking' | 'connected' | 'offline'>(
    'checking',
  );

  const checkRunner = useCallback(async () => {
    setRunner('checking');
    try {
      const response = await fetch('/api/health', {
        signal: AbortSignal.timeout(5000),
      });
      const health: HealthResponse = await response.json();
      setRunner(
        response.ok &&
          health.status === 'ok' &&
          health.service === 'vibeguard-runner'
          ? 'connected'
          : 'offline',
      );
    } catch {
      setRunner('offline');
    }
  }, []);
  useEffect(() => {
    void checkRunner();
  }, [checkRunner]);

  // Reopen the last live project after a reload.
  useEffect(() => {
    const id = recall(PROJECT_KEY);
    if (demo || !id) return;
    liveClient
      .getProject(id)
      .then(setProject)
      .catch(() => remember(PROJECT_KEY, null))
      .finally(() => setRestoring(false));
    // Only on first load: later demo toggles start from an empty project.
  }, []);

  const onProject = useCallback(
    (next: Project | null) => {
      setProject(next);
      if (!demo) remember(PROJECT_KEY, next?.id ?? null);
      if (!next) setStep(0);
    },
    [demo],
  );

  // Steps 2–4 change the project on the runner; reload it before saving so
  // approval and export use its latest checked version.
  const projectId = project?.id;
  useEffect(() => {
    if (step !== 4 || demo || !projectId) return;
    let alive = true;
    liveClient
      .getProject(projectId)
      .then((next) => alive && setProject(next))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [step, demo, projectId]);

  function toggleDemo() {
    const next = !demo;
    setDemo(next);
    remember(DEMO_KEY, next ? '1' : null);
    setProject(null);
    setStep(0);
  }

  const ready = project?.setup.status === 'ready';
  // Demo-data projects are not saved in the runner, so they can't be exported.
  const live = demo ? null : project;
  const gate = 'Available when your test app is Ready.';
  const rail: RailStep[] = [
    {
      label: STEPS[0].label,
      status: restoring ? 'Loading…' : setupLabel(project),
      done: ready,
      disabled: false,
    },
    ...[1, 2, 3].map((index) => ({
      label: STEPS[index].label,
      status: !ready
        ? 'Needs a ready test app'
        : index === 1
          ? project?.goal?.status === 'confirmed'
            ? 'Confirmed'
            : 'Needs a confirmed goal'
          : index === 2
            ? project?.baseline
              ? 'Results available'
              : 'Not checked'
            : project?.candidateVersion
              ? 'Candidate available'
              : 'Not repaired',
      done: false,
      disabled: !ready,
      disabledReason: gate,
    })),
    {
      label: STEPS[4].label,
      status: live
        ? live.approval
          ? 'Approved'
          : 'Needs a checked fix'
        : 'Try with a demo',
      done: false,
      disabled: false,
    },
  ];
  const go = (index: number) => {
    setStep(index);
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <header className="topbar">
        <span className="brand">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          VibeGuard
        </span>
        <button
          type="button"
          className="pill"
          data-state={runner}
          onClick={checkRunner}
          title="Local runner status. Click to check again."
          aria-label={
            runner === 'checking'
              ? 'Checking the local runner'
              : runner === 'connected'
                ? 'Local runner connected. Check again.'
                : 'Local runner offline. Check again.'
          }
        >
          <span className="pill-dot" aria-hidden="true" />
          <span className="pill-label">
            {runner === 'checking'
              ? 'Checking…'
              : runner === 'connected'
                ? 'Connected'
                : 'Offline · retry'}
          </span>
        </button>
        <button
          type="button"
          className="pill switch"
          aria-pressed={demo}
          onClick={toggleDemo}
        >
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
          Demo data
        </button>
      </header>
      {demo && (
        <p className="banner" role="status">
          <strong>Demo data is on.</strong> Projects replay sample results from
          the shared examples. Nothing is checked on your app.
        </p>
      )}
      {!demo && runner === 'offline' && (
        <p className="banner" data-tone="fail" role="alert">
          <strong>Can’t reach the local runner.</strong> Start it with{' '}
          <code>docker compose up --build</code>, then click the status above.
          Or turn on Demo data to try the flow.
        </p>
      )}
      <div className="workspace">
        <StepRail steps={rail} current={step} onSelect={go} />
        <main className="main">
          {STEPS.map((item, index) => (
            <section
              key={item.label}
              className="step"
              hidden={index !== step}
              aria-labelledby={`step-${index}`}
            >
              <header className="step-head">
                <span className="eyebrow">Step {index + 1} of 5</span>
                <h1 id={`step-${index}`}>{item.title}</h1>
                <p className="intro">{item.intro}</p>
              </header>
              {index === 0 &&
                (restoring ? (
                  <p className="note" role="status">
                    Reopening your last project…
                  </p>
                ) : (
                  <OpenProject
                    key={demo ? 'demo' : 'live'}
                    client={client}
                    project={project}
                    onProject={onProject}
                    onContinue={() => go(1)}
                  />
                ))}
              {(index === 2 || index === 3) && project && (
                <CheckRepairPanel
                  key={`${demo}:${project.id}:${index}:${project.goal?.revisionId ?? ''}`}
                  project={project}
                  demo={demo}
                  operation={index === 2 ? 'check' : 'repair'}
                  onProject={onProject}
                  onContinue={() => go(index + 1)}
                />
              )}
              {index === 1 && item.upcoming && (
                <section className="panel" aria-label="Coming soon">
                  <div className="panel-head">
                    <h2>What you’ll do here</h2>
                    <span className="badge" data-tone="neutral">
                      Coming soon
                    </span>
                  </div>
                  <ul className="checklist">
                    {item.upcoming.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <p className="note">
                    This step isn’t connected to the runner yet.
                  </p>
                  <div className="actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => go(index - 1)}
                    >
                      Back
                    </button>
                  </div>
                </section>
              )}
              {index === 4 &&
                (live ? (
                  <div className="panel">
                    <ApprovalPanel
                      key={`${live.id}:${live.candidateVersion?.id ?? ''}`}
                      project={live}
                      onApproved={(approval) =>
                        setProject(
                          (current) => current && { ...current, approval },
                        )
                      }
                    />
                  </div>
                ) : (
                  <DemoProject />
                ))}
            </section>
          ))}
        </main>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
