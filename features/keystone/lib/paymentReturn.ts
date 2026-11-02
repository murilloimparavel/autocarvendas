import { createHmac, timingSafeEqual } from 'node:crypto'

// Where a payment provider sends the customer after checkout. Customers never land in
// /dashboard: success and cancel both go to public storefront pages, identified by a
// signed reference so the page can show the payment without exposing or trusting raw ids.
//
// The reference is an HMAC over the transaction id keyed with SESSION_SECRET (the same
// key customer email verification uses). It reveals only what the return page shows:
// amount, vehicle or invoice, and the payment's current state.

const PURPOSE = 'payment-return'

export const PAYMENT_RETURN_PATHS = { success: '/payment/received', cancel: '/payment/not-completed' } as const

function sign(transactionId: string, secret: string) {
  return createHmac('sha256', secret).update(`${PURPOSE}:${transactionId}`).digest('base64url').slice(0, 32)
}

export function paymentReturnReference(transactionId: string, secret: string) {
  if (!transactionId || !secret || secret.length < 32) throw new Error('Payment return reference is unavailable')
  return `${Buffer.from(transactionId).toString('base64url')}.${sign(transactionId, secret)}`
}

/** The transaction id a reference names, or null when it is malformed or not ours. */
export function readPaymentReturnReference(reference: unknown, secret: string): string | null {
  const [payload, signature, extra] = String(reference || '').trim().split('.')
  if (!payload || !signature || extra !== undefined || !secret || secret.length < 32) return null
  let transactionId = ''
  try {
    transactionId = Buffer.from(payload, 'base64url').toString('utf8')
  } catch {
    return null
  }
  if (!/^[a-z0-9]{10,64}$/i.test(transactionId)) return null
  const expected = Buffer.from(sign(transactionId, secret))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  return transactionId
}

/** Absolute success and cancel URLs on the storefront origin for one transaction. */
export function paymentReturnUrls(origin: string, transactionId: string, secret: string) {
  const base = String(origin || '').replace(/\/+$/, '')
  if (!/^https?:\/\/[^/]+$/i.test(base)) throw new Error('Payment return origin is invalid')
  const ref = encodeURIComponent(paymentReturnReference(transactionId, secret))
  return {
    successUrl: `${base}${PAYMENT_RETURN_PATHS.success}?ref=${ref}`,
    cancelUrl: `${base}${PAYMENT_RETURN_PATHS.cancel}?ref=${ref}`,
  }
}

/** What the customer sees for a transaction state. */
export function paymentReturnState(status: string, checkoutUrl?: string | null) {
  if (['captured', 'authorized'].includes(status)) return { state: 'received' as const, retryUrl: null }
  if (['partially-refunded', 'refunded'].includes(status)) return { state: 'refunded' as const, retryUrl: null }
  // Stripe-hosted checkout stays open after a declined card until the session expires, and the
  // expiry webhook moves the payment to canceled. A failed create has no checkout link at all.
  if (['creating', 'pending'].includes(status) || (status === 'failed' && checkoutUrl)) return { state: 'pending' as const, retryUrl: checkoutUrl && /^https:\/\//.test(checkoutUrl) ? checkoutUrl : null }
  return { state: 'closed' as const, retryUrl: null }
}
