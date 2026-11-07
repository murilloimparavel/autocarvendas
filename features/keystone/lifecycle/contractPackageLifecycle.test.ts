import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertContractAction } from './contractPackageLifecycle'
import { canMove, TRANSACTION_TRANSITIONS, REFUND_TRANSITIONS, CHECKOUT_STARTABLE } from './paymentState'

test('signed contract cannot be re-prepared or reported back to sent', () => {
  assert.throws(() => assertContractAction('signed', 'prepare'))
  assert.throws(() => assertContractAction('signed', 'record-provider-status', 'sent'))
  assert.throws(() => assertContractAction('void', 'record-provider-status', 'signed'))
})
test('normal contract flow is allowed', () => {
  assertContractAction(undefined, 'prepare')
  assertContractAction('awaiting-external-handoff', 'record-provider-status', 'sent')
  assertContractAction('sent', 'record-provider-status', 'signed')
  assertContractAction('signed', 'record-provider-status', 'void')
  assertContractAction('declined', 'prepare')
})
test('settled payments never move backwards', () => {
  assert.equal(canMove(TRANSACTION_TRANSITIONS, 'captured', 'pending'), false)
  assert.equal(canMove(TRANSACTION_TRANSITIONS, 'refunded', 'captured'), false)
  assert.equal(canMove(TRANSACTION_TRANSITIONS, 'pending', 'captured'), true)
  assert.equal(canMove(REFUND_TRANSITIONS, 'succeeded', 'failed'), false)
  assert.ok(!(CHECKOUT_STARTABLE as readonly string[]).includes('captured'))
})
