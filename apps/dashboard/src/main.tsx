import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { HealthResponse, Project } from '@vibeguard/contracts';
import '@vibeguard/design-tokens/tokens.css';
import './styles.css';
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

const STEPS = [
  {
    label: 'Open project',
    title: 'Open your project.',
    intro:
      'VibeGuard makes a separate test copy with its own test data. Your original never changes.',
  },
  {
    label: 'Set the goal',
    title: 'Say what should happen.',
    intro:
      'Explain the problem in plain words. VibeGuard turns it into a goal you confirm.',
    upcoming:
      'This step isn’t connected yet. Next, you’ll chat with the local AI about what goes wrong, then edit and confirm a goal. Confirming a goal never approves a fix.',
  },
  {
    label: 'Catch the bug',
    title: 'Prove it’s broken.',
    intro:
      'Before changing any code, VibeGuard checks the original copy with real saved data.',
    upcoming:
      'This step isn’t connected yet. It will show Passed, Failed, or Could not check for each check, with evidence.',
  },
  {
    label: 'Try the fix',
    title: 'Fix it. Then prove it.',
    intro:
      'The local AI edits a copy, at most twice. The same protected checks then run on a fresh copy.',
    upcoming:
      'This step isn’t connected yet. When no attempt passes every check, it will say “No verified fix is ready”.',
  },
  {
    label: 'Approve & keep checking',
    title: 'Keep the fix. Keep the check.',
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

  function toggleDemo() {
    const next = !demo;
    setDemo(next);
    remember(DEMO_KEY, next ? '1' : null);
    setProject(null);
    setStep(0);
  }

  const ready = project?.setup.status === 'ready';
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
      status: ready ? 'Not connected yet' : 'After setup',
      done: false,
      disabled: !ready,
      disabledReason: gate,
    })),
    {
      label: STEPS[4].label,
      status: 'Demo project',
      done: false,
      disabled: false,
    },
  ];

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
          title="Check the runner connection again"
        >
          <span className="pill-dot" aria-hidden="true" />
          {runner === 'checking'
            ? 'Checking runner…'
            : runner === 'connected'
              ? 'Runner connected'
              : 'Runner offline · retry'}
        </button>
        <button
          type="button"
          className="pill"
          aria-pressed={demo}
          onClick={toggleDemo}
        >
          Demo data: {demo ? 'On' : 'Off'}
        </button>
      </header>
      {demo && (
        <p className="demo-banner" role="status">
          <strong>Demo data is on.</strong> Opening and preparing a project
          replays sample results from the shared examples. Nothing is checked on
          your app.
        </p>
      )}
      {!demo && runner === 'offline' && (
        <p className="demo-banner" data-tone="fail" role="alert">
          <strong>Can’t reach the local runner.</strong> Start it with{' '}
          <code>docker compose up --build</code>, then retry. You can also turn
          on demo data to try the flow.
        </p>
      )}
      <div className="workspace">
        <StepRail steps={rail} current={step} onSelect={setStep} />
        <main className="main">
          {STEPS.map((item, index) => (
            <section
              key={item.label}
              className="step"
              hidden={index !== step}
              aria-labelledby={`step-${index}`}
            >
              <div className="step-head">
                <span className="eyebrow">
                  Step 0{index + 1} / 05 · {item.label}
                </span>
                <h1 id={`step-${index}`}>{item.title}</h1>
                <p className="intro">{item.intro}</p>
              </div>
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
                    onContinue={() => setStep(1)}
                  />
                ))}
              {item.upcoming && (
                <div className="panel">
                  <div className="panel-head">
                    <h2>Coming next</h2>
                    <span className="badge" data-tone="neutral">
                      Not connected yet
                    </span>
                  </div>
                  <p>{item.upcoming}</p>
                </div>
              )}
              {index === 4 && <DemoProject />}
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
