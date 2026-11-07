// Payment transaction / refund state maps. Checkout writers and webhooks race, so every write is
// a compare-and-set on the status it read: a late or replayed event can never move a settled row backwards.
export const TRANSACTION_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  creating: ['pending', 'failed', 'canceled', 'captured'],
  pending: ['authorized', 'captured', 'failed', 'canceled'],
  authorized: ['captured', 'failed', 'canceled'],
  failed: ['captured', 'pending'],
  canceled: ['captured'],
  captured: ['partially-refunded', 'refunded'],
  'partially-refunded': ['refunded'],
  refunded: [],
}
export const REFUND_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  creating: ['pending', 'succeeded', 'failed', 'canceled'],
  pending: ['succeeded', 'failed', 'canceled'],
  failed: [],
  canceled: [],
  succeeded: [],
}
/** Statuses a checkout-start write may still overwrite: nothing settled, nothing the provider has already reported. */
export const CHECKOUT_STARTABLE = ['creating', 'pending', 'failed'] as const
export const CHECKOUT_FAILABLE = ['creating', 'pending'] as const

export function canMove(map: Readonly<Record<string, readonly string[]>>, from: string, to: string) {
  return from === to || Boolean(map[from]?.includes(to))
}
