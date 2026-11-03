// Admin Delete buttons follow each list's operation-level delete access.
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
const { withDeleteAwareUi } = load();
const manager = { itemId: 'u1', data: { role: { canManage: true } } };
const reader = { itemId: 'u2', data: { role: { canManage: false } } };
const hide = (list, session) => list.ui.hideDelete({ session, context: {} });
const lists = withDeleteAwareUi({
  Locked: { access: { operation: { query: () => true, delete: () => false } }, ui: { listView: { initialColumns: ['name'] } } },
  RoleBased: { access: { operation: { delete: ({ session }) => session?.data?.role?.canManage === true } } },
  Explicit: { access: { operation: { delete: () => false } }, ui: { hideDelete: false } },
  NoRule: { fields: {} },
  Throws: { access: { operation: { delete: () => { throw new Error('boom'); } } } },
});

test('always-denied delete hides the button for everyone and keeps other ui', async () => {
  assert.equal(await hide(lists.Locked, manager), true);
  assert.deepEqual(lists.Locked.ui.listView, { initialColumns: ['name'] });
});
test('role-based delete hides only without the permission', async () => {
  assert.equal(await hide(lists.RoleBased, manager), false);
  assert.equal(await hide(lists.RoleBased, reader), true);
});
test('explicit hideDelete and lists without a rule are untouched; a throwing rule hides', async () => {
  assert.equal(lists.Explicit.ui.hideDelete, false);
  assert.equal(lists.NoRule.ui, undefined);
  assert.equal(await hide(lists.Throws, manager), true);
});
