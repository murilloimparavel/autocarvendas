// Customers return from checkout to the storefront, never to /dashboard.
// Run: node --test tests/*.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../features/keystone/lib/paymentReturn.ts');
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} };
vm.runInNewContext(output, { module: loaded, exports: loaded.exports, require, Buffer }, { filename });
const { paymentReturnUrls, readPaymentReturnReference, paymentReturnReference, paymentReturnState } = loaded.exports;

const SECRET = 'x'.repeat(40);
const TX = 'cmvyiore8001jmj0xes9nqgft';

test('success and cancel go to storefront pages on the same origin, never /dashboard', () => {
  const { successUrl, cancelUrl } = paymentReturnUrls('https://dealership.openship.org/', TX, SECRET);
  for (const url of [successUrl, cancelUrl]) {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://dealership.openship.org');
    assert.ok(!parsed.pathname.startsWith('/dashboard'), url);
    assert.equal(readPaymentReturnReference(parsed.searchParams.get('ref'), SECRET), TX);
  }
  assert.equal(new URL(successUrl).pathname, '/payment/received');
  assert.equal(new URL(cancelUrl).pathname, '/payment/not-completed');
});

test('the reference does not carry the raw id in the clear and rejects tampering', () => {
  const ref = paymentReturnReference(TX, SECRET);
  assert.ok(!ref.includes(TX));
  assert.equal(readPaymentReturnReference(ref, 'y'.repeat(40)), null);
  const other = paymentReturnReference('cmvs5t85p0017qh0xwmq3pw03', SECRET);
  assert.equal(readPaymentReturnReference(`${ref.split('.')[0]}.${other.split('.')[1]}`, SECRET), null);
  assert.equal(readPaymentReturnReference('', SECRET), null);
  assert.equal(readPaymentReturnReference('a.b.c', SECRET), null);
});

test('a missing secret or a bad origin refuses to build URLs', () => {
  assert.throws(() => paymentReturnUrls('https://dealership.openship.org', TX, ''));
  assert.throws(() => paymentReturnUrls('https://dealership.openship.org/dashboard', TX, SECRET));
  assert.throws(() => paymentReturnUrls('undefined://undefined', TX, SECRET));
});

test('retry is offered only while checkout is still open', () => {
  const link = 'https://checkout.stripe.com/c/pay/cs_test_1';
  assert.deepEqual({ ...paymentReturnState('pending', link) }, { state: 'pending', retryUrl: link });
  assert.equal(paymentReturnState('canceled', link).retryUrl, null);
  assert.equal(paymentReturnState('failed', link).retryUrl, link);
  assert.equal(paymentReturnState('failed', null).state, 'closed');
  assert.equal(paymentReturnState('captured', link).state, 'received');
  assert.equal(paymentReturnState('refunded', link).state, 'refunded');
  assert.equal(paymentReturnState('pending', 'javascript:alert(1)').retryUrl, null);
});
