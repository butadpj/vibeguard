import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { DEMO_ANON_KEY } from '../config.js';

// Load the unchanged browser SDK with a script URL for its bundle loader.
const bundle = new URL('../vendor/supabase.js', import.meta.url);
const sandbox = {
  fetch, Headers, Request, Response, URL, AbortController, AbortSignal,
  setTimeout, clearTimeout, setInterval, clearInterval, TextEncoder, TextDecoder,
  console, WebSocket,
  document: { currentScript: { tagName: 'SCRIPT', src: bundle.href } },
};
sandbox.self = sandbox;
runInNewContext(await readFile(bundle, 'utf8'), sandbox, { filename: 'supabase.js', timeout: 5000 });
export function createLocalClient(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))
    throw new Error('Use a local HTTP demo URL.');
  return sandbox.supabase.createClient(url, DEMO_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, options) => fetch(input, { ...options, signal: AbortSignal.timeout(8000) }) },
  });
}
