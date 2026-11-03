// Admin item pages follow each list's update access: read-only when the server would refuse Save.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load() {
  const filename = path.join(root, 'features/keystone/ui-create-access.ts');
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, require, WeakMap, Map, Promise, String, Boolean });
  return module.exports;
}
const { withItemViewAwareUi } = load();
const manager = { itemId: 'u1', data: { role: { canManageContracts: true } } };
const reader = { itemId: 'u2', data: { role: { canManageContracts: false } } };

// Fake context: the "db" holds item ids per list; a filter { project: { id: { equals } } } matches items in that project.
function contextWith(rows, calls = []) {
  const db = new Proxy({}, {
    get: (_, listKey) => ({
      count: async ({ where }) => {
        calls.push(listKey);
        const [idClause, filter] = where.AND;
        const row = (rows[listKey] || []).find(r => r.id === idClause.id.equals);
        if (!row) return 0;
        return filter.project && row.project !== filter.project.id.equals ? 0 : 1;
      },
    }),
  });
  const ctx = { sudo: () => ({ db }) };
  return ctx;
}

const lists = withItemViewAwareUi({
  ChangeQuote: { access: { operation: { query: () => true, update: () => false } }, ui: { listView: { initialColumns: ['quoteNumber'] } } },
  Lead: { access: { operation: { update: ({ session }) => session?.data?.role?.canManageContracts === true } } },
  Scoped: {
    access: {
      operation: { update: ({ session }) => session?.data?.role?.canManageContracts === true },
      filter: { update: () => ({ project: { id: { equals: 'p1' } } }) },
    },
  },
  Explicit: { access: { operation: { update: () => false } }, ui: { itemView: { defaultFieldMode: 'edit' } } },
  NoAccess: { fields: {} },
  Throws: { access: { operation: { update: () => { throw new Error('boom'); } } } },
  FilterThrows: { access: { filter: { update: () => { throw new Error('boom'); } } } },
});
const mode = (listKey, session, item = { id: 'i1' }, context = contextWith({})) => lists[listKey].ui.itemView.defaultFieldMode({ session, context, item });

test('workflow-owned lists (update denied) render read-only for everyone', async () => {
  assert.equal(await mode('ChangeQuote', manager), 'read');
  assert.equal(await mode('ChangeQuote', undefined), 'read');
  assert.deepEqual(lists.ChangeQuote.ui.listView, { initialColumns: ['quoteNumber'] }, 'other ui settings kept');
});

test('role-based lists stay editable for holders and are read-only for others', async () => {
  assert.equal(await mode('Lead', manager), 'edit');
  assert.equal(await mode('Lead', reader), 'read');
});

test('an update filter that excludes the item makes it read-only; an included item stays editable', async () => {
  const ctx = contextWith({ Scoped: [{ id: 'in', project: 'p1' }, { id: 'out', project: 'p2' }] });
  assert.equal(await mode('Scoped', manager, { id: 'in' }, ctx), 'edit');
  assert.equal(await mode('Scoped', manager, { id: 'out' }, ctx), 'read');
  assert.equal(await mode('Scoped', reader, { id: 'in' }, ctx), 'read', 'operation refusal wins before any lookup');
});

test('the decision is computed once per request and item, not once per field', async () => {
  const calls = [];
  const ctx = contextWith({ Scoped: [{ id: 'in', project: 'p1' }] }, calls);
  await Promise.all([1, 2, 3, 4].map(() => mode('Scoped', manager, { id: 'in' }, ctx)));
  assert.equal(calls.length, 1);
});

test('explicit settings, lists without rules, and errors behave safely', async () => {
  assert.equal(lists.Explicit.ui.itemView.defaultFieldMode, 'edit');
  assert.equal(lists.NoAccess.ui, undefined);
  assert.equal(await mode('Throws', manager), 'read', 'a throwing operation rule refuses, as the server would');
  assert.equal(await mode('FilterThrows', manager), 'edit', 'a filter error keeps today\'s default; the server still enforces');
});
