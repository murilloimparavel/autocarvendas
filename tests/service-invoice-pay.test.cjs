// A customer pays their own invoiced repair order online: only for an order they own, only the
// server-computed open balance, one open checkout reused on retry.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(mocks) {
  const filename = path.resolve(root, 'features/keystone/mutations/payServiceInvoice.ts');
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module, exports: module.exports, process: { env: { SESSION_SECRET: 'x'.repeat(40) } }, console: { warn() {}, error() {}, log() {} }, Date, Promise, String, Number, Array, Object, Error,
    require: (spec) => { if (Object.hasOwn(mocks, spec)) return mocks[spec]; throw new Error(`Unmocked dependency: ${spec}`); },
  }, { filename });
  return module.exports;
}

function harness({ owned = ['so1'], status = 'invoiced', payments = [] } = {}) {
  const created = [];
  const charges = [];
  const store = { payments: [...payments] };
  const prisma = {
    $executeRaw: async () => 1,
    serviceOrder: { async findUnique() { return { id: 'so1', rooftopId: 'r1', status, grandTotalCents: 42000, invoiceNumber: 'INV-7' } } },
    paymentTransaction: {
      async findMany() { return store.payments },
      async create({ data }) { const row = { id: `p${created.length + 1}`, ...data, createdAt: new Date(), capturedCents: 0, refundedCents: 0, checkoutUrl: null }; created.push(row); store.payments.unshift(row); return { id: row.id } },
      async findUnique({ where }) { return { ...store.payments.find(p => p.id === where.id), serviceOrder: { invoiceNumber: 'INV-7' } } },
      async update({ where, data }) { Object.assign(store.payments.find(p => p.id === where.id), data); return {} },
    },
    domainAuditEvent: { async create() { return { id: 'e' } } },
  };
  const sudo = { prisma, transaction: async (fn) => fn({ prisma }), query: { PaymentProvider: { async findMany() { return [{ id: 'pp', code: 'stripe' }] } } } };
  const context = { session: { listKey: 'User', itemId: 'acct' }, prisma: {}, sudo: () => sudo, req: { headers: { host: 'dealership.openship.org', 'x-forwarded-proto': 'https' } } };
  const mocks = {
    '../utils/paymentProviderAdapter': { async executeAdapterFunction({ args }) { charges.push(args); return { checkoutUrl: 'https://checkout.stripe.test/s1', providerSessionId: 'cs_1' } } },
    '../lib/paymentReturn': { paymentReturnUrls: () => ({ successUrl: 's', cancelUrl: 'c' }) },
    './customerOwnership': { requireCustomerAccount: (c) => c.session.itemId, async customerOwnership() { return {} }, async ownedServiceOrderIds() { return owned } },
  };
  return { mod: load(mocks), context, created, charges, store }
}

test('charges exactly the open balance and reuses the open checkout on retry', async () => {
  const h = harness({ payments: [{ id: 'old', status: 'captured', amountCents: 10000, capturedCents: 10000, refundedCents: 0, createdAt: new Date(0), providerKey: 'stripe' }] });
  const first = await h.mod.payServiceInvoice(null, { serviceOrderId: 'so1' }, h.context);
  assert.equal(first.checkoutUrl, 'https://checkout.stripe.test/s1');
  assert.equal(h.created.length, 1);
  assert.equal(h.created[0].amountCents, 32000);
  assert.equal(h.created[0].sourceType, 'service');
  assert.equal(h.charges[0].amount, 32000);
  const again = await h.mod.payServiceInvoice(null, { serviceOrderId: 'so1' }, h.context);
  assert.equal(again.checkoutUrl, 'https://checkout.stripe.test/s1');
  assert.equal(h.created.length, 1);
  assert.equal(h.charges.length, 1);
});

test('refuses orders the account does not own, unpaid estimates and paid invoices', async () => {
  const notMine = harness({ owned: [] });
  await assert.rejects(notMine.mod.payServiceInvoice(null, { serviceOrderId: 'so1' }, notMine.context), /Repair order not found/);
  const estimate = harness({ status: 'in-progress' });
  await assert.rejects(estimate.mod.payServiceInvoice(null, { serviceOrderId: 'so1' }, estimate.context), /no open invoice/);
  const paid = harness({ payments: [{ id: 'x', status: 'captured', amountCents: 42000, capturedCents: 42000, refundedCents: 0, createdAt: new Date(0), providerKey: 'stripe' }] });
  await assert.rejects(paid.mod.payServiceInvoice(null, { serviceOrderId: 'so1' }, paid.context), /already paid/);
  const anon = harness();
  anon.context.session = null;
  await assert.rejects(anon.mod.payServiceInvoice(null, { serviceOrderId: 'so1' }, { ...anon.context, session: null }));
});

test('account repair order page shows a Pay button only for an open invoice', () => {
  const page = fs.readFileSync(path.resolve(root, 'features/storefront/screens/AccountServiceOrderPage.tsx'), 'utf8');
  assert.match(page, /const canPay = order\.status === 'invoiced' && Number\(order\.balanceCents \|\| 0\) > 0/);
  assert.match(page, /action=\{payServiceInvoiceAction\}/);
  const schema = fs.readFileSync(path.resolve(root, 'schema.graphql'), 'utf8');
  assert.match(schema, /payServiceInvoice\(serviceOrderId: ID!\): JSON!/);
});
