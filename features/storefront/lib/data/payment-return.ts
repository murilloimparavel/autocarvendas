import { openfrontClient } from '../config'

export type PaymentReturn = {
  state: 'received' | 'refunded' | 'pending' | 'closed'
  retryUrl: string | null
  amountCents: number
  currency: string
  reference: string
  purpose: string
  item: string | null
  stockNumber: string | null
}

const PAYMENT_RETURN = `
  query PaymentReturn($reference: String!) {
    paymentReturnStatus(reference: $reference) {
      state retryUrl amountCents currency reference purpose item stockNumber
    }
  }
`

/** The payment a signed checkout return reference names, or null when it is missing or invalid. */
export async function loadPaymentReturn(reference: string | null | undefined): Promise<PaymentReturn | null> {
  if (!reference) return null
  try {
    const data = await openfrontClient.request<{ paymentReturnStatus: PaymentReturn | null }>(PAYMENT_RETURN, { reference })
    return data.paymentReturnStatus ?? null
  } catch {
    return null
  }
}
