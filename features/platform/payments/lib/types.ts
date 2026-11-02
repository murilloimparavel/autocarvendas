export type PaymentListItem = {
  id: string
  rooftop: { id: string; name: string } | null
  sourceType: string
  amountCents: number
  currency: string
  providerKey: string
  status: string
  capturedCents: number
  refundedCents: number
  failureCode: string | null
  reconciliationReference: string | null
  reconciledAt: string | null
  createdAt: string
  updatedAt: string
  deal: { id: string; vehicle: { year: number; make: string; model: string; stockNumber: string } | null; lead: { firstName: string; lastName: string } | null } | null
  lead?: { id: string; firstName: string; lastName: string; interestedVehicle: { year: number; make: string; model: string; stockNumber: string } | null } | null
  serviceOrder: { id: string; invoiceNumber: string | null } | null
}

export type PaymentDetail = PaymentListItem & {
  paymentProvider: { id: string; name: string; code: string } | null
  providerTransactionId: string | null
  providerSessionId: string | null
  checkoutUrl: string | null
  version: number
}

export type PaymentRefundRecord = {
  id: string
  amountCents: number
  reason: string
  status: string
  providerRefundId: string | null
  failureCode: string | null
  createdAt: string
  updatedAt: string
}

export type PaymentProviderEventRecord = {
  id: string
  providerKey: string
  providerEventId: string
  eventType: string
  payloadDigest: string
  signatureTimestamp: string
  receivedAt: string
  refund: { id: string } | null
}

export type PaymentProviderRecord = {
  id: string
  name: string
  code: string
  isInstalled: boolean
  createPaymentFunction: string
  capturePaymentFunction: string
  refundPaymentFunction: string
  getPaymentStatusFunction: string
  generatePaymentLinkFunction: string
  handleWebhookFunction: string
  transactionsCount: number
  updatedAt: string | null
}

export type PaymentCounts = Record<string, number>

export type PaymentFilters = { status: string; provider: string; from: string; to: string; search: string }

export type CheckoutSourceOption = { id: string; label: string; detail: string; totalCents: number }
