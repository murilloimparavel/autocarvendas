// Staff cancel of a storefront financing application that never went to a lender.
// Loads the real recordLenderDecision, financingLifecycle and provider registry against a small in-memory Prisma.
// Run: node --test tests/*.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function loader(mocks) {
  const cache = new Map();
  return function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    const module = { exports: {} };
    cache.set(filename, module);
    const localRequire = specifier => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith('.')) {
        const base = path.resolve(path.dirname(filename), specifier);
        return load(fs.existsSync(`${base}.ts`) ? `${base}.ts` : path.join(base, 'index.ts'));
      }
      throw new Error(`Unmocked dependency: ${specifier}`);
    };
    vm.runInNewContext(output, { module, exports: module.exports, require: localRequire, Date, Error, Object, Promise, crypto: require('node:crypto') }, { filename });
    return module.exports;
  };
}

function setup({ status = 'submitted', submissions = [] } = {}) {
  const events = [];
  const db = {
    application: { id: 'app-1', reference: 'FIN-E7E9CBE5022B4503', status, rooftopId: 'rooftop-1' },
    submissions,
    decisions: [],
  };
  const load = loader({
    '../access': { permissions: { canManageFinancing: ({ session }) => Boolean(session?.itemId) } },
    '../tenantRecords': { assertSessionRooftopPermission: async () => {} },
    '../lifecycle/domainEvents': { recordDomainEventInTransaction: async (_tx, event) => { events.push(event); } },
  });
  const { recordLenderDecision } = load('features/keystone/mutations/recordLenderDecision.ts');
  const prisma = {
    $executeRaw: async () => 1,
    lenderDecision: {
      findUnique: async ({ where }) => db.decisions.find(row => row.idempotencyKey === where.idempotencyKey) || null,
      create: async ({ data }) => { const row = { id: `decision-${db.decisions.length + 1}`, ...data }; db.decisions.push(row); return { id: row.id }; },
    },
    financingApplication: {
      findUnique: async () => ({ ...db.application }),
      updateMany: async ({ where, data }) => {
        if (where.id !== db.application.id || where.status !== db.application.status) return { count: 0 };
        Object.assign(db.application, data); return { count: 1 };
      },
    },
    lenderSubmission: { findFirst: async ({ where }) => db.submissions.find(row => row.id === where.id) || null },
  };
  const context = {
    session: { itemId: 'user-staff' },
    transaction: async fn => fn({ prisma }),
    query: {
      FinancingApplication: { findOne: async () => ({ id: db.application.id, rooftop: { id: db.application.rooftopId } }) },
    },
    db: { LenderDecision: { findOne: async ({ where }) => db.decisions.find(row => row.id === where.id) || null } },
  };
  const record = data => recordLenderDecision(null, { data: { applicationId: 'app-1', providerKey: 'operator-recorded', idempotencyKey: `lender-decision:app-1:${data.decision}:0001`, ...data } }, context);
  return { db, events, record };
}

test('staff can cancel a submitted application that never went to a lender without a lender reference', async () => {
  const { db, events, record } = setup();
  await record({ decision: 'cancelled' });
  assert.equal(db.application.status, 'cancelled');
  assert.equal(db.decisions.length, 1);
  assert.equal(db.decisions[0].externalReference, null);
  assert.equal(db.decisions[0].recordedById, 'user-staff');
  assert.equal(events[0].action, 'recorded:cancelled');
});

test('cancelled is terminal', async () => {
  const { record } = setup({ status: 'cancelled' });
  await assert.rejects(record({ decision: 'cancelled' }), /cannot transition from cancelled to cancelled/);
});

test('decisions answering a lender still need the lender reference', async () => {
  const queued = { id: 'sub-1', applicationId: 'app-1' };
  await assert.rejects(setup({ status: 'under-review', submissions: [queued] }).record({ decision: 'cancelled', submissionId: 'sub-1' }), /require an evidence reference/);
  await assert.rejects(setup({ status: 'under-review' }).record({ decision: 'expired' }), /require an evidence reference/);
  await assert.rejects(setup({ status: 'under-review' }).record({ decision: 'declined', reasonCodes: ['DTI'] }), /require an evidence reference/);
  const ok = setup({ status: 'under-review', submissions: [queued] });
  await ok.record({ decision: 'cancelled', submissionId: 'sub-1', externalReference: 'LND-77' });
  assert.equal(ok.db.application.status, 'cancelled');
});

test('decisionNeedsLenderReference', () => {
  const { decisionNeedsLenderReference } = loader({})('features/keystone/lifecycle/financingLifecycle.ts');
  assert.equal(decisionNeedsLenderReference('cancelled', null), false);
  assert.equal(decisionNeedsLenderReference('cancelled', 'sub-1'), true);
  assert.equal(decisionNeedsLenderReference('approved', null), true);
});
