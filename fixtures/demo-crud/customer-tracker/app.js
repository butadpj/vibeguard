import { createLocalClient } from './client.js';
import { createCustomerStore } from './customers.js';

const store = createCustomerStore(createLocalClient(window.location.origin));
const form = document.querySelector('#customer-form');
const rows = document.querySelector('#customers');
const status = document.querySelector('#status');
let customers = [];
let editingId = null;

function render() {
  rows.replaceChildren();
  for (const customer of customers) {
    const row = document.createElement('tr');
    for (const value of [customer.name, customer.email]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    const actions = document.createElement('td');
    const edit = document.createElement('button');
    edit.textContent = 'Edit';
    edit.onclick = () => {
      editingId = customer.id;
      form.elements.name.value = customer.name;
      form.elements.email.value = customer.email;
      form.elements.name.focus();
    };
    const remove = document.createElement('button');
    remove.textContent = 'Delete';
    remove.onclick = async () => {
      try {
        await store.remove(customer.id);
        customers = customers.filter(item => item.id !== customer.id);
        render();
        status.textContent = 'Customer deleted.';
      } catch (error) { status.textContent = error.message; }
    };
    actions.append(edit, remove);
    row.append(actions);
    rows.append(row);
  }
}
async function load() {
  try {
    customers = await store.list();
    render();
    status.textContent = 'Customers loaded from the local database.';
  } catch (error) { status.textContent = `Could not load customers: ${error.message}`; }
}
form.onsubmit = async event => {
  event.preventDefault();
  const submit = form.querySelector('[type=submit]');
  submit.disabled = true;
  try {
    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim();
    if (!name || !email) throw new Error('Enter a name and email.');
    if (editingId) {
      const saved = await store.update(editingId, name, email);
      customers = customers.map(item => item.id === editingId ? saved : item);
    } else {
      customers.push(await store.create(name, email));
    }
    render();
    editingId = null;
    form.reset();
    status.textContent = 'Customer saved.';
  } catch (error) { status.textContent = error.message; }
  finally { submit.disabled = false; }
};
document.querySelector('#cancel').onclick = () => { editingId = null; form.reset(); };
document.querySelector('#refresh').onclick = load;
await load();
