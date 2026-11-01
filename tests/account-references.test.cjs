// The account must show the reference the customer was given at submission.
// Run: node --test tests/*.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../features/storefront/lib/customerRequests.ts');
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} };
vm.runInNewContext(output, { module: loaded, exports: loaded.exports, require }, { filename });
const { customerFacingReference, customerRequestReference } = loaded.exports;

test('financing shows the stored application reference from the confirmation screen', () => {
  assert.equal(customerFacingReference('financing', 'cmvygogyi0005p80xgjelm082', 'FIN-6E2377C9484641CF'), 'FIN-6E2377C9484641CF');
});

test('without a stored reference the derived one is kept', () => {
  assert.equal(customerFacingReference('financing', 'cmvygogyi0005p80xgjelm082', null), 'FIN-GJELM082');
  assert.equal(customerFacingReference('trade-in', 'cmvygpu7d000bp80xqkl1d41i', '  '), 'TRADE-QKL1D41I');
  assert.equal(customerFacingReference('test-drive', 'cmvygqdtj000hp80x3kbmm4b7'), customerRequestReference('test-drive', 'cmvygqdtj000hp80x3kbmm4b7'));
  assert.equal(customerFacingReference('inquiry', null, null), null);
});
