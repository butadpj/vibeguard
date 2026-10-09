import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createLocalClient } from './client.mjs';
import { createCustomerStore } from '../customers.js';

const url = process.env.VIBEGUARD_DEMO_URL ?? 'http://127.0.0.1:4400';
const response = await fetch(`${url}/`, { signal: AbortSignal.timeout(8000) });
assert.equal(response.status, 200, 'The preview must serve the app.');
assert.match(await response.text(), /Customer tracker/);
const store = createCustomerStore(createLocalClient(url));
let created;
try {
  created = await store.create(`Readiness ${randomUUID()}`, 'health@example.test');
  assert((await store.list()).some(item => item.id === created.id), 'Created data must be readable.');
} finally {
  if (created) await store.remove(created.id);
}
console.log('App preview and real database create/read/delete are reachable. Run baseline separately to check edits.');
