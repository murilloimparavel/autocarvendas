// A paid reservation deposit becomes a hot lead (routed + urgent call-back task, once), sends one
// confirmation, shows in the buyer's account, and counts toward the deal on the same car.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(relative, { env = {}, mocks = {} } = {}) {
  const filename = path.resolve(root, relative);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module, exports: module.exports, process: { env }, console: { warn() {}, error() {}, log() {} }, Intl, Date, Promise, String, Array, Number, Object, Boolean, Map, Set, Error,
    require: (spec) => { if (Object.hasOwn(mocks, spec)) return mocks[spec]; throw new Error(`Unmocked dependency: ${spec}`); },
  }, { filename });
  return module.exports;
}

function crmTx({ rule = null, ruleAccess = true, owner = null, fallback = 'u-sales' } = {}) {
  const events = new Map();
  const state = { tasks: [], leadUpdates: [], assignments: [] };
  const lead = { id: 'l1', rooftopId: 'r1', firstName: 'Sam', lastName: 'Buyer', phone: '555-0100', email: 'sam@mail.test', assignedSalespersonId: owner, interestedVehicle: { id: 'v1', year: 2022, make: 'Chevrolet', model: 'Equinox', trim: 'LT', stockNumber: 'S100' } };
  const tx = { prisma: {
    domainAuditEvent: { async findUnique({ where }) { return events.has(where.eventKey) ? { id: 'e' } : null } },
    lead: { async findUnique() { return lead }, async update({ data }) { state.leadUpdates.push(data); return {} } },
    leadAssignmentEvent: { async create({ data }) { state.assignments.push(data); return {} } },
    task: { async create({ data }) { state.tasks.push(data); return { id: `t${state.tasks.length}` } } },
    rooftopMembership: { async findFirst() { return fallback ? { userId: fallback } : null } },
    dealerGroupMembership: { async findFirst() { return null } },
  } };
  const mocks = {
    '../mutations/leadRouting': { async findMatchingRoutingRule() { return rule }, async userHasActiveRooftopAccess() { return ruleAccess } },
    '../lifecycle/domainEvents': { async recordDomainEventInTransaction(_tx, input) { events.set(input.eventKey, input) } },
  };
  return { tx, state, events, mocks }
}

test('paid deposit routes an unowned lead and opens one urgent call-back task due within 15 minutes', async () => {
  const { tx, state, mocks } = crmTx({ rule: { assigneeId: 'u-rule', routeKey: 'web' } });
  const { applyPaidReservationInTransaction } = load('features/keystone/lib/reservationFollowUp.ts', { mocks });
  const now = new Date('2026-11-06T15:00:00Z');
  const result = await applyPaidReservationInTransaction(tx, { id: 'p1', rooftopId: 'r1', leadId: 'l1', capturedCents: 50000 }, now);
  assert.equal(result.assigneeId, 'u-rule');
  assert.equal(state.tasks.length, 1);
  const task = state.tasks[0];
  assert.equal(task.priority, 'urgent');
  assert.equal(task.assignedToId, 'u-rule');
  assert.equal(task.dueDate.getTime(), now.getTime() + 15 * 60_000);
  assert.match(task.title, /Call Sam Buyer: paid \$500\.00 deposit on 2022 Chevrolet Equinox LT/);
  assert.equal(state.leadUpdates[0].assignedSalespersonId, 'u-rule');
  assert.equal(state.assignments[0].toUserId, 'u-rule');
  // Replay (second webhook for the same payment) does nothing.
  assert.equal(await applyPaidReservationInTransaction(tx, { id: 'p1', rooftopId: 'r1', leadId: 'l1', capturedCents: 50000 }, now), null);
  assert.equal(state.tasks.length, 1);
});

test('no routing rule falls back to a rooftop salesperson; an owned lead keeps its owner', async () => {
  const a = crmTx({ fallback: 'u-sales' });
  const fa = load('features/keystone/lib/reservationFollowUp.ts', { mocks: a.mocks });
  assert.equal((await fa.applyPaidReservationInTransaction(a.tx, { id: 'p2', rooftopId: 'r1', leadId: 'l1', capturedCents: 50000 })).assigneeId, 'u-sales');
  const b = crmTx({ owner: 'u-owner', rule: { assigneeId: 'u-rule', routeKey: 'web' } });
  const fb = load('features/keystone/lib/reservationFollowUp.ts', { mocks: b.mocks });
  assert.equal((await fb.applyPaidReservationInTransaction(b.tx, { id: 'p3', rooftopId: 'r1', leadId: 'l1', capturedCents: 50000 })).assigneeId, 'u-owner');
  assert.equal(b.state.assignments.length, 0);
  assert.equal(b.state.tasks[0].assignedToId, 'u-owner');
});

test('confirmation email is sent once, names the car and next step, and needs a captured deposit', async () => {
  const rows = new Map();
  const sent = [];
  const payment = { id: 'p1', rooftopId: 'r1', status: 'captured', sourceType: 'reservation', capturedCents: 50000, lead: { id: 'l1', firstName: 'Sam', email: 'sam@mail.test', assignedSalesperson: { name: 'Dana Seller' }, interestedVehicle: { id: 'v1', year: 2022, make: 'Chevrolet', model: 'Equinox', trim: 'LT', stockNumber: 'S100' } } };
  const prisma = {
    paymentTransaction: { async findUnique() { return payment } },
    domainAuditEvent: { async create({ data }) { if (rows.has(data.eventKey)) throw new Error('unique'); rows.set(data.eventKey, data); return { id: 1 } }, async update({ where, data }) { Object.assign(rows.get(where.eventKey), data); return {} } },
    rooftop: { async findUnique() { return { name: 'Openship Motors' } } },
    dealershipProfile: { async findFirst() { return { phone: '555-0199', addressLine1: '1 Main St', city: 'Austin', state: 'TX' } } },
  };
  const mail = { async sendReservationConfirmationEmail(to, details) { sent.push({ to, details }); return { sent: true, messageId: 'm1' } } };
  const { deliverReservationConfirmation } = load('features/keystone/lib/reservationFollowUp.ts', {
    env: { SMTP_HOST: 'smtp.test', SMTP_FROM: 'a@b.test', SMTP_STORE_LINK: 'https://shop.test/' },
    mocks: { '../mutations/leadRouting': {}, '../lifecycle/domainEvents': {}, './mail': mail },
  });
  const context = { sudo: () => ({ prisma }) };
  await deliverReservationConfirmation(context, 'p1');
  await deliverReservationConfirmation(context, 'p1');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'sam@mail.test');
  assert.equal(sent[0].details.vehicle, '2022 Chevrolet Equinox LT');
  assert.equal(sent[0].details.depositLabel, '$500.00');
  assert.equal(sent[0].details.salesperson, 'Dana Seller');
  assert.equal(sent[0].details.accountUrl, 'https://shop.test/account/vehicles');
  assert.equal(rows.get('reservation-confirmation-email:p1').metadata.status, 'sent');
  const mailSrc = fs.readFileSync(path.resolve(root, 'features/keystone/lib/mail.ts'), 'utf8');
  assert.match(mailSrc, /What happens next:/);
  payment.status = 'pending';
  rows.clear();
  await deliverReservationConfirmation(context, 'p1');
  assert.equal(sent.length, 1);
});

test('webhook capture applies the follow-up in the transaction and mails after commit', () => {
  const src = fs.readFileSync(path.resolve(root, 'features/keystone/mutations/paymentOperations.ts'), 'utf8');
  assert.match(src, /status === 'captured' && transaction\.sourceType === 'reservation' && transaction\.leadId\) \{\n\s+await applyPaidReservationInTransaction\(tx/);
  assert.match(src, /\}, \{ timeout: 30_000 \}\)\n\s+if \(!result\.duplicate && result\.status === 'captured' && result\.sourceType === 'reservation'\) await deliverReservationConfirmation/);
});

test('a reservation deposit on the same buyer and car counts toward the deal; others do not', async () => {
  const { dealPaymentsWhere, dealReceivedCents } = load('features/keystone/lifecycle/cashPayment.ts', { mocks: { './dealPricing': { calculateDealPrice: () => ({ cashPayableCents: 0 }) }, './paymentMethods': { FORM_8300_THRESHOLD_CENTS: 1000000 } } });
  const where = dealPaymentsWhere({ id: 'd1', rooftopId: 'r1', leadId: 'l1', vehicleId: 'v1' });
  assert.deepEqual(JSON.parse(JSON.stringify(where.OR)), [{ dealId: 'd1' }, { sourceType: 'reservation', leadId: 'l1', lead: { is: { interestedVehicleId: 'v1' } } }]);
  assert.deepEqual(JSON.parse(JSON.stringify(dealPaymentsWhere({ id: 'd1', rooftopId: 'r1' }).OR)), [{ dealId: 'd1' }]);
  const rows = [{ capturedCents: 50000, refundedCents: 0 }, { capturedCents: 100000, refundedCents: 0 }];
  const received = await dealReceivedCents({ prisma: { paymentTransaction: { async findMany() { return rows } } } }, { id: 'd1', rooftopId: 'r1', leadId: 'l1', vehicleId: 'v1' });
  assert.equal(received, 150000);
  const ops = fs.readFileSync(path.resolve(root, 'features/keystone/mutations/paymentOperations.ts'), 'utf8');
  assert.match(ops, /calculateDealPrice\(deal\)\.cashPayableCents - depositCents/);
});

test('account payments include the buyer\'s own settled reservation deposits', () => {
  const src = fs.readFileSync(path.resolve(root, 'features/keystone/mutations/customerRecords.ts'), 'utf8');
  assert.match(src, /sourceType: 'reservation', leadId: \{ in: leadIds \}, status: \{ in: \['authorized', 'captured', 'partially-refunded', 'refunded'\] \}/);
  assert.match(src, /Reservation deposit · /);
});
