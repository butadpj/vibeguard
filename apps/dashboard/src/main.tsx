import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { HealthResponse } from '@vibeguard/contracts';

import '@vibeguard/design-tokens/tokens.css';
import './styles.css';

import { DemoProject } from './components/DemoProject';
import { ProjectPicker } from './components/ProjectPicker';

type StoryTab = 'US1' | 'US2' | 'US3' | 'US4' | 'US5';
type RunnerState = 'unchecked' | 'checking' | 'connected' | 'error';

const stories: {
  id: StoryTab;
  number: string;
  label: string;
  title: string;
  description: string;
}[] = [
  {
    id: 'US1',
    number: '01',
    label: 'Open project',
    title: 'Open your app',
    description: 'Choose a project and prepare a separate test copy.',
  },
  {
    id: 'US2',
    number: '02',
    label: 'Set goal',
    title: 'Describe the problem',
    description: 'Explain what should happen and agree on a goal.',
  },
  {
    id: 'US3',
    number: '03',
    label: 'Check',
    title: 'See what is wrong',
    description: 'Review test results and the evidence behind them.',
  },
  {
    id: 'US4',
    number: '04',
    label: 'Try the fix',
    title: 'Investigate and repair',
    description: 'Review a proposed change and compare the results.',
  },
  {
    id: 'US5',
    number: '05',
    label: 'Save & check',
    title: 'Save and protect',
    description: 'Approve a checked version and retain its checks.',
  },
];

const storyHeadings: Record<StoryTab, string> = {
  US1: 'Open your project',
  US2: 'Agree on the goal',
  US3: 'Check before changing',
  US4: 'Try a checked fix',
  US5: 'Approve and keep checking',
};

function App() {
  const [activeTab, setActiveTab] = useState<StoryTab>('US1');
  const [runnerState, setRunnerState] = useState<RunnerState>('unchecked');
  const [runnerMessage, setRunnerMessage] = useState(
    'Connection has not been checked.',
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const activeStory = stories.find((story) => story.id === activeTab)!;

  async function checkRunner() {
    setRunnerState('checking');
    setRunnerMessage('Connecting to the local runner…');

    try {
      const response = await fetch('/api/health', {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error('Runner unavailable');
      }

      const health: HealthResponse = await response.json();

      if (health.status !== 'ok' || health.service !== 'vibeguard-runner') {
        throw new Error('Unexpected response');
      }

      setRunnerState('connected');
      setRunnerMessage('Local runner connected.');
    } catch {
      setRunnerState('error');
      setRunnerMessage(
        'Could not connect. Check that the local runner is running, then try again.',
      );
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#workspace"
          aria-label="VibeGuard home"
          onClick={() => setActiveTab('US1')}
        >
          <span className="brand-mark" aria-hidden="true">
            V
          </span>
          <span className="brand-copy">
            <span className="brand-name">VibeGuard</span>
            <span className="brand-caption">Your app, protected.</span>
          </span>
        </a>

        <div className="header-actions">
          <span className="mode-badge">Founder workspace</span>

          <button
            className="button button-primary connection-button"
            type="button"
            onClick={checkRunner}
            disabled={runnerState === 'checking'}
          >
            {runnerState === 'checking' ? (
              <>
                <span className="loading-indicator" aria-hidden="true" />
                Connecting…
              </>
            ) : (
              'Check connection'
            )}
          </button>
        </div>
      </header>

      <nav className="workflow-nav" aria-label="App workflow">
        <div className="workflow-nav-inner">
          {stories.map((story) => {
            const isActive = activeTab === story.id;

            return (
              <button
                key={story.id}
                className={`workflow-step${isActive ? ' is-active' : ''}`}
                type="button"
                aria-current={isActive ? 'step' : undefined}
                onClick={() => setActiveTab(story.id)}
              >
                <span className="step-number">{story.number}</span>
                <span className="step-label">{story.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <main className="workspace" id="workspace">
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">YOUR WORKSPACE</p>
            <h1>{activeStory.title}</h1>
            <p className="workspace-description">{activeStory.description}</p>
          </div>

          <div
            className={`connection-status status-${runnerState}`}
            role="status"
            aria-live="polite"
          >
            <span className="status-dot" aria-hidden="true" />
            <span className="status-copy">
              <strong>
                {runnerState === 'connected'
                  ? 'Runner connected'
                  : runnerState === 'checking'
                    ? 'Connecting'
                    : runnerState === 'error'
                      ? 'Connection failed'
                      : 'Not checked'}
              </strong>
              <span>{runnerMessage}</span>
            </span>
          </div>
        </div>

        <div className="workflow-progress" aria-label="Workflow progress">
          {stories.map((story) => (
            <span
              key={story.id}
              className={
                stories.findIndex((item) => item.id === story.id) <=
                stories.findIndex((item) => item.id === activeTab)
                  ? 'progress-segment is-current'
                  : 'progress-segment'
              }
            />
          ))}
        </div>

        <section className="workspace-content" aria-labelledby="story-heading">
          {activeTab === 'US1' && (
            <>
              <div className="content-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">STEP 01 / PROJECT SETUP</p>
                    <h2 id="story-heading">{storyHeadings.US1}</h2>
                    <p className="panel-description">
                      Start with your project. VibeGuard should investigate a
                      separate copy so your original files stay unchanged.
                    </p>
                  </div>
                </div>

                <ProjectPicker onProjectReady={(url) => setPreviewUrl(url)} />
              </div>

              {previewUrl && (
                <div className="content-panel preview-panel">
                  <div className="panel-heading preview-heading">
                    <div>
                      <p className="eyebrow">TEST WORKSPACE</p>
                      <h2>Test app preview</h2>
                      <p className="panel-description">
                        Review the test app in its own preview.
                      </p>
                    </div>
                    <a
                      className="button button-secondary preview-open-link"
                      href={previewUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in new tab
                    </a>
                  </div>

                  <div className="preview-frame">
                    <iframe
                      src={previewUrl}
                      title="Local test app preview"
                      loading="lazy"
                    />
                  </div>
                </div>
              )}

              <div className="content-panel demo-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">TRY THE WORKFLOW</p>
                    <h2>Sample task app</h2>
                    <p className="panel-description">
                      Use the provided demo to explore the workflow. Sample
                      results are not proof of a real repair.
                    </p>
                  </div>
                </div>
                <DemoProject />
              </div>
            </>
          )}

          {activeTab === 'US2' && (
            <div className="content-panel">
              <p className="eyebrow">STEP 02 / GOAL AGREEMENT</p>
              <h2 id="story-heading">{storyHeadings.US2}</h2>
              <p className="panel-description">
                Describe the bug or slow feature in your own words. Agree on the
                expected behavior before investigating.
              </p>
              <div className="feature-placeholder">
                <span className="placeholder-icon" aria-hidden="true">
                  02
                </span>
                <div>
                  <h3>Problem description and goal</h3>
                  <p>
                    The local AI conversation and editable goal confirmation are
                    not connected in this screen yet.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'US3' && (
            <div className="content-panel">
              <p className="eyebrow">STEP 03 / EVIDENCE</p>
              <h2 id="story-heading">{storyHeadings.US3}</h2>
              <p className="panel-description">
                Check the app before making changes. Review evidence, timings,
                and failures rather than relying on guesses.
              </p>
              <div className="feature-placeholder">
                <span className="placeholder-icon" aria-hidden="true">
                  03
                </span>
                <div>
                  <h3>App health and evidence report</h3>
                  <p>
                    Real CRUD checks, timing measurements, and evidence
                    reporting still need to be integrated here.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'US4' && (
            <div className="content-panel">
              <p className="eyebrow">STEP 04 / REPAIR</p>
              <h2 id="story-heading">{storyHeadings.US4}</h2>
              <p className="panel-description">
                Try a repair on the test copy, then run the same checks again to
                compare the evidence.
              </p>
              <div className="feature-placeholder">
                <span className="placeholder-icon" aria-hidden="true">
                  04
                </span>
                <div>
                  <h3>Local AI repair engine</h3>
                  <p>
                    The complete repair and before-and-after verification flow
                    is not connected yet.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'US5' && (
            <div className="content-panel">
              <p className="eyebrow">STEP 05 / APPROVAL</p>
              <h2 id="story-heading">{storyHeadings.US5}</h2>
              <p className="panel-description">
                Save only the version you have reviewed and checked. Keep its
                instructions and checks for future changes.
              </p>
              <div className="feature-placeholder">
                <span className="placeholder-icon" aria-hidden="true">
                  05
                </span>
                <div>
                  <h3>Save and keep checking</h3>
                  <p>
                    Export and retained checks have partial support in the
                    runner, but the complete end-to-end flow still needs
                    integration.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        <footer className="workspace-footer">
          <span>VibeGuard</span>
          <span>Local-first app investigation</span>
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
