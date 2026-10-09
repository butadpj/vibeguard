/** Shared application actions used by the browser and integration checks. */
export function createCustomerStore(client) {
  function unwrap({ data, error }) {
    if (error) throw new Error(error.message);
    return data;
  }
  return {
    async list() {
      return unwrap(await client.from('customers').select('*').order('created_at'));
    },
    async create(name, email) {
      return unwrap(await client.from('customers').insert({ name, email }).select().single());
    },
    async update(id, name, email) {
      const current = unwrap(await client.from('customers').select('*').eq('id', id).single());
      return { ...current, name, email };
    },
    async remove(id) {
      unwrap(await client.from('customers').delete().eq('id', id));
    },
  };
}
