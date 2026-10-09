import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

describe('customer tracker fixture behavior', () => {
  it('uses the real Supabase SDK and app actions, including the intentional refresh bug', async () => {
    // Fake the external PostgREST transport only. This is not live PostgreSQL proof.
    const records = new Map<
      string,
      { id: string; name: string; email: string }
    >();
    vi.stubGlobal(
      'fetch',
      async (input: string | URL, options: RequestInit = {}) => {
        const url = new URL(String(input));
        expect(url.origin).toBe('http://127.0.0.1:4400');
        expect(url.pathname).toBe('/rest/v1/customers');
        const id = url.searchParams.get('id')?.replace('eq.', '');
        if (options.method === 'DELETE') {
          if (id) records.delete(id);
          return new Response(null, { status: 204 });
        }
        if (options.method === 'POST') {
          const row = {
            ...JSON.parse(String(options.body)),
            id: '10000000-0000-4000-8000-000000000099',
          };
          records.set(row.id, row);
        }
        const rows = [...records.values()].filter(
          (row) => !id || row.id === id,
        );
        const headers = new Headers(options.headers);
        expect(headers.get('Authorization')).toMatch(/^Bearer ey/);
        const data = headers.get('Accept')?.includes('vnd.pgrst.object')
          ? rows[0]
          : rows;
        return Response.json(data);
      },
    );
    const root = new URL(
      '../../../../../fixtures/demo-crud/customer-tracker/',
      import.meta.url,
    );
    const { createLocalClient } = await import(
      new URL('scripts/client.mjs', root).href
    );
    const { createCustomerStore } = await import(
      new URL('customers.js', root).href
    );
    const store = createCustomerStore(
      createLocalClient('http://127.0.0.1:4400'),
    );
    const created = await store.create('Before edit', 'customer@example.test');
    expect(created).toMatchObject({ name: 'Before edit' });
    expect(await store.list()).toMatchObject([
      { id: created.id, name: 'Before edit' },
    ]);
    expect(
      await store.update(created.id, 'After edit', created.email),
    ).toMatchObject({ name: 'After edit' });
    const refreshed = createCustomerStore(
      createLocalClient('http://127.0.0.1:4400'),
    );
    expect(await refreshed.list()).toMatchObject([
      { id: created.id, name: 'Before edit' },
    ]);
    await store.remove(created.id);
    expect(await refreshed.list()).toEqual([]);
    expect(() => createLocalClient('https://production.example.com')).toThrow(
      'local HTTP',
    );
  });
});
