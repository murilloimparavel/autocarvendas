// Test-drive / service receipt email: once on success, replay doesn't resend, mail throw doesn't
// surface, unconfigured is recorded as skipped, and the submission sends only after commit.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(relative, { env, mocks }) {
  const filename = path.resolve(root, relative);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module, exports: module.exports, process: { env }, console: { warn() {}, error() {}, log() {} }, Intl, Date, Promise, String, Array, RegExp,
    require: (spec) => { if (Object.hasOwn(mocks, spec)) return mocks[spec]; throw new Error(`Unmocked dependency: ${spec}`); },
  }, { filename });
  return module.exports;
}

const receipt = { kind: 'test_drive', requestId: 'td1', rooftopId: 'r1', to: 'buyer@mail.test', customerName: 'Sam Buyer', what: '2022 Honda Civic', scheduledTime: '2027-01-15T16:00:00.000Z', vehicleId: 'v1' };
const configured = { SMTP_HOST: 'smtp.test', SMTP_FROM: 'a@b.test', SMTP_STORE_LINK: 'https://shop.test/' };

function ctx() {
  const rows = new Map();
  const sudo = { prisma: {
    domainAuditEvent: {
      async create({ data }) { if (rows.has(data.eventKey)) throw new Error('unique'); rows.set(data.eventKey, data); return { id: 1 }; },
      async update({ where, data }) { Object.assign(rows.get(where.eventKey), data); return {}; },
    },
    rooftop: { async findUnique() { return { name: 'Lakeside Motors', timezone: 'America/Chicago' }; } },
  } };
  return { rows, context: { sudo: () => sudo } };
}
function setup(env, send) {
  const sent = [];
  const mail = { sendRequestReceiptEmail: async (to, d) => { sent.push({ to, d }); return send ? send() : { sent: true }; } };
  return { mod: load('features/keystone/lib/requestReceiptEmail.ts', { env, mocks: { './mail': mail } }), sent };
}

test('sends once, in the dealership zone, linking the vehicle page; replay does not resend', async () => {
  const { mod, sent } = setup(configured);
  const { rows, context } = ctx();
  await mod.deliverRequestReceipt(context, receipt);
  await mod.deliverRequestReceipt(context, receipt);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].d.url, 'https://shop.test/inventory/v1');
  assert.match(sent[0].d.whenLabel, /10:00 AM CST/);
  assert.equal(rows.get('request-receipt-email:test_drive:td1').metadata.status, 'sent');
});

test('a mail throw is recorded and never surfaces', async () => {
  const { mod } = setup(configured, () => { throw new Error('boom'); });
  const { rows, context } = ctx();
  await assert.doesNotReject(mod.deliverRequestReceipt(context, receipt));
  assert.equal(rows.get('request-receipt-email:test_drive:td1').metadata.status, 'failed');
});

test('unconfigured mail is recorded as skipped_not_configured', async () => {
  const { mod, sent } = setup({});
  const { rows, context } = ctx();
  await mod.deliverRequestReceipt(context, receipt);
  assert.equal(sent.length, 0);
  assert.equal(rows.get('request-receipt-email:test_drive:td1').metadata.status, 'skipped_not_configured');
});

test('public submissions send only after the transaction commits and never on replay', () => {
  const policy = fs.readFileSync(path.join(root, 'features/keystone/mutations/publicSubmissionPolicy.ts'), 'utf8');
  assert.ok(policy.indexOf('options.afterCommit(outcome') > policy.indexOf("}, { timeout: 30_000 })"));
  assert.match(policy, /if \(!outcome\.reused && options\.afterCommit\)/);
  for (const file of ['submitTestDrive.ts', 'submitServiceBooking.ts']) {
    assert.match(fs.readFileSync(path.join(root, 'features/keystone/mutations', file), 'utf8'), /afterCommit: .*deliverRequestReceipt/s);
  }
  assert.match(fs.readFileSync(path.join(root, 'features/keystone/lib/requestReceiptEmail.ts'), 'utf8'), /import\('\.\/mail'\)/);
});
