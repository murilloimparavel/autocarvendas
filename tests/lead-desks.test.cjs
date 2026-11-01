// Finance and trade-in desk helpers that storefront submissions surface through.
// Run: node --test tests/*.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative.endsWith('.ts') ? relative : `${relative}.ts`);
  if (cache.has(filename)) return cache.get(filename).exports;
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  cache.set(filename, module);
  const localRequire = specifier => {
    if (specifier.startsWith('@/')) return load(specifier.slice(2));
    if (specifier.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), specifier)));
    throw new Error(`Unmocked dependency: ${specifier}`);
  };
  vm.runInNewContext(output, { module, exports: module.exports, require: localRequire, Intl, Date }, { filename });
  return module.exports;
}

const display = load('features/platform/finance/lib/display');
const plain = value => JSON.parse(JSON.stringify(value));

test('finance desk is not "Up to date" while a storefront application waits on a lender', () => {
  assert.deepEqual(plain(display.financeDeskStatus({ error: false, approvalsWaiting: 0, applicationsWaiting: 1 })), { tone: 'warn', label: '1 application waiting' });
  assert.deepEqual(plain(display.financeDeskStatus({ error: false, approvalsWaiting: 0, applicationsWaiting: 3 })), { tone: 'warn', label: '3 applications waiting' });
  assert.equal(display.financeDeskStatus({ error: false, approvalsWaiting: 2, applicationsWaiting: 1 }).label, 'Approvals waiting');
  assert.deepEqual(plain(display.financeDeskStatus({ error: false, approvalsWaiting: 0, applicationsWaiting: 0 })), { tone: 'ok', label: 'Up to date' });
  assert.equal(display.financeDeskStatus({ error: true, approvalsWaiting: 0, applicationsWaiting: 4 }).label, 'Unavailable');
});

test('countLabel pluralizes', () => {
  assert.equal(display.countLabel(1, 'application'), '1 application');
  assert.equal(display.countLabel(0, 'application'), '0 applications');
  assert.equal(display.countLabel(5, 'product'), '5 products');
});

test('financing form values read as the customer chose them', () => {
  assert.equal(display.employmentLabel('self-employed'), 'Self-employed');
  assert.equal(display.creditTierLabel('good-680-719'), 'Good (680–719)');
  assert.equal(display.creditTierLabel('rebuilding-under-620'), 'Rebuilding (<620)');
  assert.equal(display.creditTierLabel('legacy-value'), 'legacy-value');
  assert.equal(display.employmentLabel(null), '-');
});
