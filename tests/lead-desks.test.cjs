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
const tradeIns = load('features/platform/trade-ins/lib/tradeInState');
const shared = load('features/keystone/lifecycle/tradeInStatus');
const account = load('features/storefront/lib/accountRecords');
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

const tradeIn = (overrides = {}) => ({
  id: 'cmvyfht9v000gql0x7dga0xwi', year: '2019', make: 'Honda', model: 'Accord', trim: 'EX-L', vin: '1HGCV1F59KA012345',
  offerAmount: null, deal: null,
  lead: { id: 'lead1', firstName: 'QA', lastName: 'Test', email: 'qa+tradein@example.com', phone: '7035550189', status: 'new' },
  ...overrides,
});

test('admin shows the trade-in reference the storefront confirmation gave the customer', () => {
  assert.equal(tradeIns.tradeInReference(tradeIn()), 'TRADE-7DGA0XWI');
  assert.equal(tradeIns.tradeInMatches(tradeIn(), 'trade-7dga0xwi'), true);
  assert.equal(tradeIns.tradeInMatches(tradeIn(), 'qa+tradein'), true);
  assert.equal(tradeIns.tradeInMatches(tradeIn(), 'civic'), false);
  assert.equal(tradeIns.tradeInMatches(tradeIn(), '  '), true);
});

test('a trade-in whose lead was closed lost leaves the appraisal queue', () => {
  const open = tradeIn();
  const closed = tradeIn({ lead: { ...open.lead, status: 'closed-lost' } });
  assert.equal(tradeIns.tradeInQueue(open, null), 'appraise');
  assert.equal(tradeIns.tradeInQueue(closed, null), 'closed');
  assert.deepEqual(plain(tradeIns.tradeInState(closed, null)), { tone: 'idle', label: 'Closed' });
  // A trade-in already on a deal or acquired keeps that state; the deal owns it now.
  assert.equal(tradeIns.tradeInQueue({ ...closed, deal: { id: 'd1', status: 'pencil' } }, null), 'on-deal');
  assert.equal(tradeIns.tradeInQueue(closed, { id: 'a1' }), 'acquired');
  // Closed won is a sale, not a dropped request.
  assert.equal(tradeIns.tradeInQueue(tradeIn({ lead: { ...open.lead, status: 'closed-won' } }), null), 'appraise');
});

test('a closed trade-in offers no actions', () => {
  const open = tradeIn();
  const closed = tradeIn({ lead: { ...open.lead, status: 'closed-lost' } });
  assert.deepEqual(plain(tradeIns.tradeInActions(open, null)), { closed: false, appraise: true, attach: true, acquire: true });
  assert.deepEqual(plain(tradeIns.tradeInActions(closed, null)), { closed: true, appraise: false, attach: false, acquire: false });
  assert.equal(tradeIns.tradeInActions({ ...open, deal: { id: 'd1', status: 'pencil' } }, null).attach, false);
  assert.equal(tradeIns.tradeInActions(open, { id: 'a1' }).acquire, false);
});

test('a closed trade-in states why, from its lost lead', () => {
  const lead = tradeIn().lead;
  assert.equal(tradeIns.tradeInClosedReason({ lead: { ...lead, status: 'closed-lost', lostReasonCode: 'other', lostReason: 'QA test submission' } }), 'Other: QA test submission');
  assert.equal(tradeIns.tradeInClosedReason({ lead: { ...lead, status: 'closed-lost', lostReasonCode: 'purchased-elsewhere', lostReason: '' } }), 'Purchased elsewhere');
  assert.equal(tradeIns.tradeInClosedReason({ lead: { ...lead, status: 'closed-lost', lostReasonCode: null, lostReason: 'Sold it privately' } }), 'Sold it privately');
  assert.equal(tradeIns.tradeInClosedReason({ lead: { ...lead, status: 'closed-lost' } }), 'No reason recorded');
});

test('admin and customer read trade-in state from one mapper', () => {
  const cases = [
    [{ leadStatus: 'new' }, 'submitted', 'appraise', 'submitted'],
    [{ leadStatus: 'new', offerAmountCents: 180000 }, 'offered', 'offered', 'appraised'],
    [{ leadStatus: 'closed-lost' }, 'closed', 'closed', 'closed'],
    [{ leadStatus: 'closed-lost', offerAmountCents: 180000 }, 'closed', 'closed', 'closed'],
    [{ leadStatus: 'closed-lost', onDeal: true }, 'on-deal', 'on-deal', 'appraised'],
    [{ leadStatus: 'closed-won', onDeal: true, acquired: true }, 'acquired', 'acquired', 'appraised'],
  ];
  for (const [facts, sharedStatus, adminQueue, customerStatus] of cases) {
    assert.equal(shared.tradeInStatus(facts), sharedStatus, JSON.stringify(facts));
    assert.equal(shared.customerTradeInStatus(facts), customerStatus, JSON.stringify(facts));
    const row = tradeIn({
      offerAmount: facts.offerAmountCents ?? null,
      deal: facts.onDeal ? { id: 'd1', status: 'pencil' } : null,
      lead: { ...tradeIn().lead, status: facts.leadStatus },
    });
    assert.equal(tradeIns.tradeInQueue(row, facts.acquired ? { id: 'a1' } : null), adminQueue, JSON.stringify(facts));
  }
});

test('the customer sees a closed trade-in as Closed in a neutral tone', () => {
  const { customerRequestStatusLabel } = load('features/storefront/lib/customerRequests');
  assert.equal(customerRequestStatusLabel('Trade-in', 'closed'), 'Closed');
  assert.equal(account.statusTone('closed'), 'idle');
  assert.equal(account.statusTone('closed-lost'), 'bad');
});
