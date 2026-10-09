import './vendor/supabase.js';
import { DEMO_ANON_KEY } from './config.js';

export function createLocalClient(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
    throw new Error('This synthetic demo only connects to a local HTTP database API.');
  }
  return globalThis.supabase.createClient(url, DEMO_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(8000) }) },
  });
}
