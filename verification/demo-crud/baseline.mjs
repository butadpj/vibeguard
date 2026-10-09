// Protected integration entry point. Keep outside the candidate's writable mount.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLocalClient } from '../../fixtures/demo-crud/customer-tracker/scripts/client.mjs';

const target = process.env.VIBEGUARD_TARGET_DIR;
if (!target) throw new Error('Set VIBEGUARD_TARGET_DIR to the test app root.');
const url = process.env.VIBEGUARD_DEMO_URL ?? 'http://127.0.0.1:4400';
const client = createLocalClient(url);
const { createCustomerStore } = await import(pathToFileURL(resolve(target, 'customers.js')).href);
const store = createCustomerStore(client);
const checks = [];
let created;
const name = `Integration ${randomUUID()}`;
const editedName = `${name} edited`;
const email = `integration-${randomUUID()}@example.test`;
const timeout = setTimeout(() => { console.error('Integration suite exceeded 60 seconds.'); process.exit(2); }, 60000);

async function observe(scope, action) {
  const started = Date.now();
  try {
    const summary = await action();
    checks.push(result(scope, 'passed', summary, Date.now() - started));
  } catch (error) {
    const verdict = error instanceof assert.AssertionError ? 'failed' : 'could_not_check';
    checks.push(result(scope, verdict, error.message, Date.now() - started));
  }
}
function result(scope, verdict, summary, durationMs) {
  return { id: `customer_${scope}`, name: `Customer ${scope}`, scope, verdict,
    explanation: verdict === 'passed' ? 'The application action and saved data agree.' : summary,
    evidence: [
      { id: `${scope}_observation`, kind: 'observation', summary, artifactId: null, durationMs: null },
      { id: `${scope}_timing`, kind: 'timing', summary: `${durationMs} ms`, artifactId: null, durationMs },
    ],
  };
}
async function savedRows() {
  if (!created) throw new Error('Create did not complete; this behavior could not be checked.');
  const { data, error } = await client.from('customers').select('*').eq('id', created.id);
  if (error) throw new Error(error.message);
  return data;
}
try {
  await observe('create', async () => {
    created = await store.create(name, email);
    assert.equal((await savedRows())[0]?.name, name, 'Created name must be saved in PostgreSQL.');
    return `Created ${created.id}; independently reread its saved name.`;
  });
  await observe('read', async () => {
    if (!created) throw new Error('No created record is available.');
    const refreshedStore = createCustomerStore(client);
    const row = (await refreshedStore.list()).find(item => item.id === created.id);
    assert.equal(row?.email, email, 'A fresh application read must recover the saved customer.');
    return 'A new store instance listed the previously saved customer.';
  });
  await observe('update', async () => {
    if (!created) throw new Error('No created record is available.');
    const acknowledged = await store.update(created.id, editedName, email);
    assert.equal(acknowledged.name, editedName, 'Edit must acknowledge the new name.');
    const persisted = (await savedRows())[0];
    assert.equal(persisted?.name, editedName,
      `Edit acknowledged "${acknowledged.name}"; refreshing PostgreSQL returned "${persisted?.name}".`);
    const refreshed = (await createCustomerStore(client).list()).find(item => item.id === created.id);
    assert.equal(refreshed?.name, editedName, 'The application must display the saved edit after refresh.');
    return 'Edit acknowledgement, independent saved-state read, and refreshed app read agree.';
  });
  await observe('delete', async () => {
    if (!created) throw new Error('No created record is available.');
    await store.remove(created.id);
    assert.equal((await savedRows()).length, 0, 'Deleted customer must be absent from PostgreSQL.');
    assert(!(await store.list()).some(item => item.id === created.id), 'App read must omit the deleted customer.');
    return 'The application deleted the record; saved-state and app reads confirmed absence.';
  });
  const edit = checks.find(check => check.scope === 'update');
  checks.push({ ...edit, id: 'customer_goal', name: 'Edits survive refresh', scope: 'goal' });
} finally {
  try { if (created) await store.remove(created.id); }
  finally { clearTimeout(timeout); }
}
console.log(JSON.stringify(checks, null, 2));
process.exitCode = checks.some(check => check.verdict === 'could_not_check') ? 2 : checks.some(check => check.verdict === 'failed') ? 1 : 0;
