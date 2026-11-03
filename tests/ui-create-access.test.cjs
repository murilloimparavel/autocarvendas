// Admin create buttons follow each list's create access.
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
  vm.runInNewContext(output, { module, exports: module.exports, require });
  return module.exports;
}
const { withCreateAwareUi } = load();
const manager = { itemId: 'u1', data: { role: { canManageContracts: true } } };
const reader = { itemId: 'u2', data: { role: { canManageContracts: false } } };
const hide = (list, session) => list.ui.hideCreate({ session, context: {} });

const lists = withCreateAwareUi({
  ChangeQuote: { access: { operation: { query: () => true, create: () => false } }, ui: { listView: { initialColumns: ['quoteNumber'] } } },
  Lead: { access: { operation: { query: () => true, create: ({ session }) => session?.data?.role?.canManageContracts === true } } },
  Explicit: { access: { operation: { create: () => false } }, ui: { hideCreate: false } },
  Open: { access: { operation: { create: () => true } } },
  NoAccess: { fields: {} },
  Throws: { access: { operation: { create: () => { throw new Error('boom') } } } },
});

test('always-denied create hides the button for everyone and keeps other ui', async () => {
  assert.equal(await hide(lists.ChangeQuote, manager), true);
  assert.equal(await hide(lists.ChangeQuote, undefined), true);
  assert.deepEqual(lists.ChangeQuote.ui.listView, { initialColumns: ['quoteNumber'] });
});

test('role-based create hides only for sessions without the permission', async () => {
  assert.equal(await hide(lists.Lead, manager), false);
  assert.equal(await hide(lists.Lead, reader), true);
});

test('an explicit ui.hideCreate is left alone', () => {
  assert.equal(lists.Explicit.ui.hideCreate, false);
});

test('open create shows the button; lists without access are untouched', async () => {
  assert.equal(await hide(lists.Open, reader), false);
  assert.equal(lists.NoAccess.ui, undefined);
});

test('a throwing rule hides create', async () => {
  assert.equal(await hide(lists.Throws, manager), true);
});

test('access rules themselves are not changed', () => {
  const create = () => false;
  const [wrapped] = Object.values(withCreateAwareUi({ X: { access: { operation: { create } } } }));
  assert.equal(wrapped.access.operation.create, create);
});
