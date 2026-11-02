// A storefront reservation takes a refundable deposit: $500, or the vehicle price when it is lower.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.resolve(__dirname, '../features/keystone/mutations/reserveVehicle.ts'), 'utf8');
const fn = src.match(/export function reservationDepositCents[\s\S]*?\n}\n/)[0].replace('export ', '').replace('(vehiclePriceCents: unknown)', '(vehiclePriceCents)');
const RESERVATION_DEPOSIT_CENTS = 50_000;
const reservationDepositCents = new Function('RESERVATION_DEPOSIT_CENTS', `${fn}; return reservationDepositCents`)(RESERVATION_DEPOSIT_CENTS);

test('deposit is $500, capped at the vehicle price', () => {
  assert.equal(reservationDepositCents(5_290_000), 50_000);
  assert.equal(reservationDepositCents(30_000), 30_000);
  assert.equal(reservationDepositCents(null), 50_000);
});

test('reservation payments carry their lead and reuse the verified webhook + staff refund path', () => {
  assert.match(src, /sourceType: 'reservation'/);
  assert.match(src, /leadId: lead\.id/);
  assert.match(src, /openfront_transaction_id: transactionId/);
  const migration = fs.readFileSync(path.resolve(__dirname, '../migrations/20261102170000_vehicle_reservation_deposit/migration.sql'), 'utf8');
  assert.match(migration, /"sourceType" = 'reservation' AND "lead" IS NOT NULL/);
});
