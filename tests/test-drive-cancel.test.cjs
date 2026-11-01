// Staff cancel of a test drive. Loads the real mutations (operatorWorkflows, customerBookings,
// bookingCapacity, domainEvents) against a small in-memory Prisma. No DB, network or real env.
// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function sandbox(mocks) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    const module = { exports: {} };
    cache.set(filename, module);
    function localRequire(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith('.')) return load(`${path.resolve(path.dirname(filename), specifier)}.ts`);
      throw new Error(`Unmocked dependency: ${specifier}`);
    }
    vm.runInNewContext(output, { module, exports: module.exports, require: localRequire, Date, Error, console }, { filename });
    return module.exports;
  }
  return { load };
}

const HOUR = 60 * 60 * 1000;
const STAFF = 'user-staff';
const CUSTOMER = 'account-customer';

// Just enough Prisma for these commands: the where shapes they actually use.
function memoryDb(drives) {
  const db = { testDrives: drives.map(drive => ({ completed: false, noShow: false, cancelledAt: null, updatedAt: new Date('2026-10-01T00:00:00Z'), ...drive })), audits: [], outbox: [] };
  const time = value => new Date(value).getTime();
  const matches = (row, where = {}) => Object.entries(where).every(([key, rule]) => {
    if (key === 'AND') return rule.every(part => matches(row, part));
    if (rule && typeof rule === 'object' && !(rule instanceof Date)) {
      if ('not' in rule) return row[key] !== rule.not;
      if ('gt' in rule || 'lt' in rule) return (!('gt' in rule) || time(row[key]) > time(rule.gt)) && (!('lt' in rule) || time(row[key]) < time(rule.lt));
    }
    if (rule instanceof Date || row[key] instanceof Date) return row[key] != null && rule != null && time(row[key]) === time(rule);
    return row[key] === rule;
  });
  const pick = (row, select) => (select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : { ...row });
  const prisma = {
    $queryRaw: async () => [{ locked: 1 }],
    $executeRaw: async () => 1,
    testDrive: {
      findFirst: async ({ where, select }) => { const row = db.testDrives.find(r => matches(r, where)); return row ? pick(row, select) : null; },
      count: async ({ where }) => db.testDrives.filter(r => matches(r, where)).length,
      updateMany: async ({ where, data }) => {
        const rows = db.testDrives.filter(r => matches(r, where));
        for (const row of rows) Object.assign(row, data, { updatedAt: new Date() });
        return { count: rows.length };
      },
    },
    domainAuditEvent: {
      findUnique: async ({ where, select }) => { const row = db.audits.find(r => r.eventKey === where.eventKey); return row ? pick(row, select) : null; },
      create: async ({ data }) => { const row = { id: `audit-${db.audits.length + 1}`, ...data }; db.audits.push(row); return { id: row.id }; },
    },
    domainOutboxEvent: { create: async ({ data }) => { db.outbox.push(data); return data; } },
  };
  return { db, prisma };
}

function contextFor(prisma, db, session) {
  const context = {
    session,
    prisma,
    transaction: async fn => fn({ prisma }),
    query: { TestDrive: { findOne: async ({ where }) => {
      const row = db.testDrives.find(r => r.id === where.id);
      return row && { ...row, rooftop: { id: row.rooftopId }, lead: null };
    } } },
    db: { TestDrive: { findOne: async ({ where }) => db.testDrives.find(r => r.id === where.id) } },
  };
  return context;
}

function load() {
  const { load: loadModule } = sandbox({
    'node:crypto': require('node:crypto'),
    graphql: { GraphQLError: class GraphQLError extends Error {} },
    '../access': { permissions: { canManageLeads: ({ session }) => Boolean(session?.itemId) } },
    '../tenantRecords': { assertSessionRooftopPermission: async () => {} },
    './customerOwnership': {
      requireCustomerAccount: context => context.session.accountId,
      customerOwnership: async () => ({}),
      ownedTestDriveWhere: () => ({}),
      ownedServiceAppointmentWhere: () => ({}),
    },
    './submissionUtils': { parseScheduledTime: value => value },
  });
  return {
    workflows: loadModule('features/keystone/mutations/operatorWorkflows.ts'),
    bookings: loadModule('features/keystone/mutations/customerBookings.ts'),
    capacity: loadModule('features/keystone/mutations/bookingCapacity.ts'),
  };
}

const slot = new Date(Date.now() + 3 * 24 * HOUR);
slot.setUTCMinutes(0, 0, 0);
const drive = (id, extra = {}) => ({ id, rooftopId: 'rooftop-1', vehicleId: 'vehicle-1', scheduledTime: slot, ...extra });

test('staff cancel frees the slot: the same vehicle and time can be booked again', async () => {
  const { workflows, capacity } = load();
  const { db, prisma } = memoryDb([drive('td-1')]);
  const tx = { prisma };

  await assert.rejects(capacity.assertTestDriveVehicleCapacity(tx, 'vehicle-1', slot.toISOString()), /already booked/);

  const staff = contextFor(prisma, db, { itemId: STAFF });
  await workflows.updateTestDriveWorkflow(null, { data: { id: 'td-1', action: 'cancel', idempotencyKey: 'test-drive:td-1:cancel' } }, staff);

  await capacity.assertTestDriveVehicleCapacity(tx, 'vehicle-1', slot.toISOString());
});

test('staff cancel leaves the drive exactly as a customer cancel does; only the audit says who', async () => {
  const { workflows, bookings } = load();
  const { db, prisma } = memoryDb([drive('td-staff'), drive('td-customer', { vehicleId: 'vehicle-2' })]);

  await workflows.updateTestDriveWorkflow(null, { data: { id: 'td-staff', action: 'cancel', idempotencyKey: 'test-drive:td-staff:cancel' } }, contextFor(prisma, db, { itemId: STAFF }));
  await bookings.cancelCustomerBooking(null, { kind: 'test-drive', id: 'td-customer', idempotencyKey: 'customer-cancel-td-customer' }, contextFor(prisma, db, { accountId: CUSTOMER }));

  const state = id => {
    const row = db.testDrives.find(r => r.id === id);
    return { completed: row.completed, noShow: row.noShow, cancelled: row.cancelledAt instanceof Date };
  };
  assert.deepEqual(state('td-staff'), state('td-customer'));
  assert.deepEqual(state('td-staff'), { completed: true, noShow: false, cancelled: true });

  const staffAudit = db.audits.find(a => a.aggregateId === 'td-staff');
  assert.equal(staffAudit.action, 'staff-cancelled');
  assert.equal(staffAudit.actorId, STAFF);
  assert.equal(staffAudit.aggregateType, 'TestDrive');
  assert.ok(staffAudit.occurredAt instanceof Date);
  assert.deepEqual(JSON.parse(JSON.stringify(staffAudit.afterSnapshot)), { id: 'td-staff', cancelledBy: 'staff' });
  assert.equal(db.outbox.find(o => o.aggregateId === 'td-staff').topic, 'test-drive.staff-cancelled');
});

test('staff cancel is idempotent and refuses drives that are past, closed or already cancelled', async () => {
  const { workflows } = load();
  const past = new Date(Date.now() - 2 * HOUR);
  const { db, prisma } = memoryDb([drive('td-open'), drive('td-past', { scheduledTime: past }), drive('td-done', { completed: true })]);
  const staff = contextFor(prisma, db, { itemId: STAFF });
  const cancel = (id, key = `test-drive:${id}:cancel`) => workflows.updateTestDriveWorkflow(null, { data: { id, action: 'cancel', idempotencyKey: key } }, staff);

  await cancel('td-open');
  const cancelledAt = db.testDrives.find(r => r.id === 'td-open').cancelledAt;
  await cancel('td-open');
  assert.equal(db.testDrives.find(r => r.id === 'td-open').cancelledAt, cancelledAt);
  assert.equal(db.audits.filter(a => a.aggregateId === 'td-open').length, 1);
  // A second cancel with a new key is refused: the cancelled drive is closed.
  await assert.rejects(cancel('td-open', 'test-drive:td-open:cancel-again'), /can be cancelled/);

  await assert.rejects(cancel('td-past'), /can be cancelled/);
  await assert.rejects(cancel('td-done'), /can be cancelled/);
  assert.equal(db.testDrives.find(r => r.id === 'td-past').cancelledAt, null);
});

test('staff cancel needs lead permission', async () => {
  const { workflows } = load();
  const { db, prisma } = memoryDb([drive('td-1')]);
  await assert.rejects(
    workflows.updateTestDriveWorkflow(null, { data: { id: 'td-1', action: 'cancel', idempotencyKey: 'test-drive:td-1:cancel' } }, contextFor(prisma, db, {})),
    /permission is required/,
  );
  assert.equal(db.testDrives[0].cancelledAt, null);
});
