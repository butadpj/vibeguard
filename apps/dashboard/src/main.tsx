import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { HealthResponse } from '@vibeguard/contracts';
import '@vibeguard/design-tokens/tokens.css';
import './styles.css';

function App() {
  const [status, setStatus] = useState('Connection has not been checked.');
  const [busy, setBusy] = useState(false);
  async function checkRunner() {
    setBusy(true);
    setStatus('Connecting to the local runner…');
    try {
      const response = await fetch('/api/health', {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('Runner unavailable');
      const health: HealthResponse = await response.json();
      if (health.status !== 'ok' || health.service !== 'vibeguard-runner')
        throw new Error('Unexpected response');
      setStatus(
        'Local runner connected. Project preparation is not implemented yet.',
      );
    } catch {
      setStatus('Could not connect. Start the local runner and try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header>VibeGuard</header>
      <main>
        <h1>Your app, protected.</h1>
        <p>
          Investigate a local copy, see the evidence, and decide which fixes to
          keep.
        </p>
        <section aria-labelledby="connection-title">
          <h2 id="connection-title">Connect your local runner</h2>
          <p>
            This starter checks the dashboard connection. Project setup, checks,
            and repair are still being built.
          </p>
          <button onClick={checkRunner} disabled={busy}>
            {busy ? 'Connecting…' : 'Check connection'}
          </button>
          <p role="status" className="note">
            {status}
          </p>
        </section>
      </main>
    </>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
