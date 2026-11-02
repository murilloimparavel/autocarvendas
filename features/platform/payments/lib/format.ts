import type { PaymentListItem, PaymentProviderRecord } from './types'

export function paymentSource(tx: Pick<PaymentListItem, 'sourceType' | 'deal' | 'serviceOrder' | 'lead'>) {
  if (tx.sourceType === 'deal') {
    const vehicle = tx.deal?.vehicle ? `${tx.deal.vehicle.year} ${tx.deal.vehicle.make} ${tx.deal.vehicle.model}` : 'Deal'
    const customer = tx.deal?.lead ? `${tx.deal.lead.firstName || ''} ${tx.deal.lead.lastName || ''}`.trim() : ''
    return { label: vehicle, detail: customer, href: tx.deal ? `/platform/deals/${tx.deal.id}` : null }
  }
  if (tx.sourceType === 'service') {
    return { label: tx.serviceOrder?.invoiceNumber ? `Invoice ${tx.serviceOrder.invoiceNumber}` : 'Service order', detail: '', href: tx.serviceOrder ? '/platform/service' : null }
  }
  if (tx.sourceType === 'reservation') {
    const lead = tx.lead
    const vehicle = lead?.interestedVehicle ? `${lead.interestedVehicle.year} ${lead.interestedVehicle.make} ${lead.interestedVehicle.model}` : 'Vehicle reservation'
    const customer = lead ? `${lead.firstName || ''} ${lead.lastName || ''}`.trim() : ''
    return { label: `Reservation deposit: ${vehicle}`, detail: customer, href: lead ? `/platform/crm` : null }
  }
  return { label: tx.sourceType, detail: '', href: null }
}

export const BUILT_IN_ADAPTERS = ['manual', 'stripe'] as const

/** The adapter all six function fields point at, or null when they differ. */
export function providerAdapter(provider: PaymentProviderRecord) {
  const values = [
    provider.createPaymentFunction,
    provider.capturePaymentFunction,
    provider.refundPaymentFunction,
    provider.getPaymentStatusFunction,
    provider.generatePaymentLinkFunction,
    provider.handleWebhookFunction,
  ]
  return values.every(value => value === values[0]) ? values[0] : null
}

export const SETTLED_STATUSES = ['captured', 'partially-refunded', 'refunded']
export const REFUNDABLE_STATUSES = ['captured', 'partially-refunded']
