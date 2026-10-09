import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { HealthResponse } from '@vibeguard/contracts';
import '@vibeguard/design-tokens/tokens.css';
import './styles.css';
import { DemoProject } from './components/DemoProject';
import { ProjectPicker } from './components/ProjectPicker';

type StoryTab = 'US1' | 'US2' | 'US3' | 'US4' | 'US5';

function App() {
  const [activeTab, setActiveTab] = useState<StoryTab>('US1');
  const [status, setStatus] = useState('Connection has not been checked.');
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function checkRunner() {
    setBusy(true);
    setStatus('Connecting to local runner…');
    try {
      const response = await fetch('/api/health', {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('Runner unavailable');
      const health: HealthResponse = await response.json();
      if (health.status !== 'ok' || health.service !== 'vibeguard-runner')
        throw new Error('Unexpected response');
      setStatus('Local runner connected.');
    } catch {
      setStatus('Could not connect. Start the local runner and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem', background: '#0a0f1d', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>VibeGuard</h1>
          <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: '#1e293b', borderRadius: '4px', color: '#94a3b8' }}>Founder Mode</span>
        </div>
        <button onClick={checkRunner} disabled={busy} style={{ background: '#059669', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}>
          {busy ? 'Connecting…' : 'Test App Connection'}
        </button>
      </header>

      {/* Story Navigation Tabs for Teammates */}
      <nav style={{ display: 'flex', background: '#0f172a', borderBottom: '1px solid #1e293b', padding: '0 2rem' }}>
        <button
          onClick={() => setActiveTab('US1')}
          style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: 'none', borderBottom: activeTab === 'US1' ? '2px solid #10b981' : 'none', color: activeTab === 'US1' ? '#10b981' : '#94a3b8', cursor: 'pointer' }}
        >
          1. Open Your App (Arcadio)
        </button>
        <button
          onClick={() => setActiveTab('US2')}
          style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: 'none', borderBottom: activeTab === 'US2' ? '2px solid #10b981' : 'none', color: activeTab === 'US2' ? '#10b981' : '#94a3b8', cursor: 'pointer' }}
        >
          2. Describe Problem (Eric)
        </button>
        <button
          onClick={() => setActiveTab('US3')}
          style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: 'none', borderBottom: activeTab === 'US3' ? '2px solid #10b981' : 'none', color: activeTab === 'US3' ? '#10b981' : '#94a3b8', cursor: 'pointer' }}
        >
          3. See What's Wrong (Paul)
        </button>
        <button
          onClick={() => setActiveTab('US4')}
          style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: 'none', borderBottom: activeTab === 'US4' ? '2px solid #10b981' : 'none', color: activeTab === 'US4' ? '#10b981' : '#94a3b8', cursor: 'pointer' }}
        >
          4. Try AI Fix (Paul)
        </button>
        <button
          onClick={() => setActiveTab('US5')}
          style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: 'none', borderBottom: activeTab === 'US5' ? '2px solid #10b981' : 'none', color: activeTab === 'US5' ? '#10b981' : '#94a3b8', cursor: 'pointer' }}
        >
          5. Save & Protect (JP)
        </button>
      </nav>

      <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <p role="status" className="note" style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
          Runner Status: <strong>{status}</strong>
        </p>

        {/* Tab 1: US1 (Arcadio) */}
        {activeTab === 'US1' && (
          <section aria-labelledby="project-setup-title">
            <ProjectPicker onProjectReady={(url) => setPreviewUrl(url)} />
            {previewUrl && (
              <div style={{ marginTop: '1.5rem' }}>
                <h3>Sandbox App Preview</h3>
                <iframe
                  src={previewUrl}
                  title="Local Test App Preview"
                  style={{ width: '100%', height: '450px', border: '1px solid #334155', borderRadius: '8px' }}
                />
              </div>
            )}
            <DemoProject />
          </section>
        )}

        {/* Tab 2: US2 (Eric) */}
        {activeTab === 'US2' && (
          <section aria-labelledby="us2-title">
            <h2>US2: Describe Problem & Goal Agreement</h2>
            <p style={{ color: '#94a3b8' }}>Owned by Eric. Place local AI chat interface & agreed speed goal cards here.</p>
          </section>
        )}

        {/* Tab 3: US3 (Paul) */}
        {activeTab === 'US3' && (
          <section aria-labelledby="us3-title">
            <h2>US3: App Health & Evidence Report</h2>
            <p style={{ color: '#94a3b8' }}>Owned by Paul. Place CRUD status cards, latency timers, and evidence logs here.</p>
          </section>
        )}

        {/* Tab 4: US4 (Paul) */}
        {activeTab === 'US4' && (
          <section aria-labelledby="us4-title">
            <h2>US4: Local AI Repair Engine</h2>
            <p style={{ color: '#94a3b8' }}>Owned by Paul. Place repair progress bar, before/after evidence comparison, & diff link here.</p>
          </section>
        )}

        {/* Tab 5: US5 (JP) */}
        {activeTab === 'US5' && (
          <section aria-labelledby="us5-title">
            <h2>US5: Save Fixed App & Saved Checks</h2>
            <p style={{ color: '#94a3b8' }}>Owned by JP. Place export ZIP downloader and persistent check suite here.</p>
          </section>
        )}
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);