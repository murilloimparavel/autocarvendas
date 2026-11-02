'use server'

import { revalidatePath } from 'next/cache'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { operatorCommandRequest } from '@/features/platform/lib/operatorCommandClient'
import { PAYMENT_STATUSES, addDays, zonedDayStart } from '@/features/platform/accounting/lib/format'

import type {
  CheckoutSourceOption,
  PaymentCounts,
  PaymentDetail,
  PaymentFilters,
  PaymentListItem,
  PaymentProviderEventRecord,
  PaymentProviderRecord,
  PaymentRefundRecord,
} from '../lib/types'

const PAYMENTS_PATH = '/dashboard/platform/payments'

function revalidatePayments(id?: string) {
  revalidatePath(PAYMENTS_PATH)
  if (id) revalidatePath(`${PAYMENTS_PATH}/${id}`)
}

const LIST_FIELDS =
  'id rooftop { id name } sourceType amountCents currency providerKey status capturedCents refundedCents failureCode reconciliationReference reconciledAt createdAt updatedAt deal { id vehicle { year make model stockNumber } lead { firstName lastName } } serviceOrder { id invoiceNumber } lead { id firstName lastName interestedVehicle { year make model stockNumber } }'

const DAY = /^\d{4}-\d{2}-\d{2}$/

export async function getPayments(filters: PaymentFilters, timeZone: string) {
  const base: Record<string, unknown>[] = []
  if (filters.provider && filters.provider !== 'all') base.push({ providerKey: { equals: filters.provider } })
  if (DAY.test(filters.from || '')) {
    const start = zonedDayStart(filters.from, timeZone)
    if (start) base.push({ createdAt: { gte: start } })
  }
  if (DAY.test(filters.to || '')) {
    const end = zonedDayStart(addDays(filters.to, 1), timeZone)
    if (end) base.push({ createdAt: { lt: end } })
  }
  const term = String(filters.search || '').trim()
  if (term) {
    base.push({
      OR: [
        { id: { equals: term } },
        { providerTransactionId: { contains: term, mode: 'insensitive' } },
        { providerSessionId: { contains: term, mode: 'insensitive' } },
        { reconciliationReference: { contains: term, mode: 'insensitive' } },
      ],
    })
  }
  const baseWhere = { AND: base }
  const where =
    filters.status === 'unreconciled'
      ? { AND: [...base, { status: { in: ['captured', 'partially-refunded', 'refunded'] } }, { reconciledAt: { equals: null } }] }
      : filters.status && filters.status !== 'all'
        ? { AND: [...base, { status: { equals: filters.status } }] }
        : baseWhere
  const countAliases = PAYMENT_STATUSES.map(status => `s_${status.replace(/-/g, '_')}: paymentTransactionsCount(where: { AND: [$base, { status: { equals: "${status}" } }] })`).join('\n')
  const response = await keystoneClient<{ paymentTransactions: PaymentListItem[] } & Record<string, number>>(`
    query Payments($where: PaymentTransactionWhereInput!, $base: PaymentTransactionWhereInput!) {
      paymentTransactions(where: $where, orderBy: [{ createdAt: desc }], take: 200) { ${LIST_FIELDS} }
      all: paymentTransactionsCount(where: $base)
      unreconciled: paymentTransactionsCount(where: { AND: [$base, { status: { in: ["captured", "partially-refunded", "refunded"] } }, { reconciledAt: { equals: null } }] })
      ${countAliases}
    }
  `, { where, base: baseWhere }, { cache: 'no-store' })
  if (!response.success) return response
  const counts: PaymentCounts = { all: response.data.all || 0, unreconciled: response.data.unreconciled || 0 }
  for (const status of PAYMENT_STATUSES) counts[status] = response.data[`s_${status.replace(/-/g, '_')}`] || 0
  return { success: true as const, data: { transactions: response.data.paymentTransactions || [], counts } }
}

const PROVIDER_FIELDS =
  'id name code isInstalled createPaymentFunction capturePaymentFunction refundPaymentFunction getPaymentStatusFunction generatePaymentLinkFunction handleWebhookFunction transactionsCount updatedAt'

export async function getPaymentProviders() {
  return keystoneClient<{ paymentProviders: PaymentProviderRecord[] }>(`
    query PaymentProviders {
      paymentProviders(orderBy: [{ name: asc }], take: 100) { ${PROVIDER_FIELDS} }
    }
  `, {}, { cache: 'no-store' })
}

export async function getPayment(id: string) {
  return keystoneClient<{ paymentTransaction: PaymentDetail | null; paymentRefunds: PaymentRefundRecord[]; paymentProviderEvents: PaymentProviderEventRecord[] }>(`
    query Payment($id: ID!) {
      paymentTransaction(where: { id: $id }) {
        ${LIST_FIELDS}
        paymentProvider { id name code }
        providerTransactionId providerSessionId checkoutUrl version
      }
      paymentRefunds(where: { transaction: { id: { equals: $id } } }, orderBy: [{ createdAt: desc }], take: 100) {
        id amountCents reason status providerRefundId failureCode createdAt updatedAt
      }
      paymentProviderEvents(where: { transaction: { id: { equals: $id } } }, orderBy: [{ receivedAt: desc }], take: 200) {
        id providerKey providerEventId eventType payloadDigest signatureTimestamp receivedAt refund { id }
      }
    }
  `, { id }, { cache: 'no-store' })
}

/** Records createPaymentCheckout accepts: approved, financed or delivered deals and invoiced or paid service orders. */
export async function getCheckoutSources(sourceType: string) {
  if (sourceType === 'deal') {
    const response = await keystoneClient<{ deals: any[] }>(`
      query CheckoutDeals {
        deals(where: { status: { in: ["approved", "financed", "delivered"] } }, orderBy: [{ updatedAt: desc }], take: 100) {
          id status totalPrice lead { firstName lastName } vehicle { year make model stockNumber }
        }
      }
    `, {}, { cache: 'no-store' })
    if (!response.success) return response
    const options: CheckoutSourceOption[] = (response.data.deals || []).map(deal => ({
      id: deal.id,
      label: deal.vehicle ? `${deal.vehicle.year} ${deal.vehicle.make} ${deal.vehicle.model}` : 'Deal',
      detail: [deal.lead ? `${deal.lead.firstName || ''} ${deal.lead.lastName || ''}`.trim() : '', deal.vehicle?.stockNumber ? `Stock ${deal.vehicle.stockNumber}` : '', deal.status].filter(Boolean).join(' · '),
      totalCents: Math.round(Number(deal.totalPrice || 0) * 100),
    }))
    return { success: true as const, data: options }
  }
  if (sourceType === 'service') {
    const response = await keystoneClient<{ serviceOrders: any[] }>(`
      query CheckoutServiceOrders {
        serviceOrders(where: { status: { in: ["invoiced", "paid"] } }, orderBy: [{ updatedAt: desc }], take: 100) { id status invoiceNumber grandTotalCents }
      }
    `, {}, { cache: 'no-store' })
    if (!response.success) return response
    const options: CheckoutSourceOption[] = (response.data.serviceOrders || []).map(order => ({
      id: order.id,
      label: order.invoiceNumber ? `Invoice ${order.invoiceNumber}` : 'Service order',
      detail: order.status,
      totalCents: Number(order.grandTotalCents || 0),
    }))
    return { success: true as const, data: options }
  }
  return { success: false as const, error: 'Unsupported payment source' }
}

export async function createPaymentCheckout(data: { sourceType: string; sourceId: string; amountCents: number; providerKey: string; idempotencyKey: string }) {
  const response = await operatorCommandRequest<{ createPaymentCheckout: { id: string; checkoutUrl: string | null; status: string } }>(`
    mutation CreatePaymentCheckout($data: CreatePaymentCheckoutInput!) {
      createPaymentCheckout(data: $data) { id checkoutUrl status }
    }
  `, { data })
  if (response.success) revalidatePayments(response.data.createPaymentCheckout.id)
  return response
}

export async function requestPaymentRefund(data: { transactionId: string; amountCents: number; reason: string; idempotencyKey: string }) {
  const response = await operatorCommandRequest<{ requestPaymentRefund: { id: string; status: string } }>(`
    mutation RequestPaymentRefund($data: RequestPaymentRefundInput!) {
      requestPaymentRefund(data: $data) { id status }
    }
  `, { data })
  if (response.success) revalidatePayments(data.transactionId)
  return response
}

export async function reconcilePaymentTransaction(data: { transactionId: string; reconciliationReference: string; idempotencyKey: string }) {
  const response = await operatorCommandRequest<{ reconcilePaymentTransaction: { id: string; reconciledAt: string | null } }>(`
    mutation ReconcilePaymentTransaction($data: ReconcilePaymentInput!) {
      reconcilePaymentTransaction(data: $data) { id reconciledAt }
    }
  `, { data })
  if (response.success) revalidatePayments(data.transactionId)
  return response
}

type ProviderInput = { name: string; adapter: string; isInstalled: boolean }

function adapterFields(adapter: string) {
  return {
    createPaymentFunction: adapter,
    capturePaymentFunction: adapter,
    refundPaymentFunction: adapter,
    getPaymentStatusFunction: adapter,
    generatePaymentLinkFunction: adapter,
    handleWebhookFunction: adapter,
  }
}

export async function createPaymentProvider(input: ProviderInput & { code: string }) {
  const response = await keystoneClient<{ createPaymentProvider: { id: string } | null }>(`
    mutation CreatePaymentProvider($data: PaymentProviderCreateInput!) {
      createPaymentProvider(data: $data) { id }
    }
  `, { data: { name: input.name, code: input.code, isInstalled: input.isInstalled, ...adapterFields(input.adapter) } })
  if (response.success) revalidatePayments()
  return response
}

export async function updatePaymentProvider(id: string, input: Partial<ProviderInput>) {
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name
  if (input.isInstalled !== undefined) data.isInstalled = input.isInstalled
  if (input.adapter !== undefined) Object.assign(data, adapterFields(input.adapter))
  const response = await keystoneClient<{ updatePaymentProvider: { id: string } | null }>(`
    mutation UpdatePaymentProvider($id: ID!, $data: PaymentProviderUpdateInput!) {
      updatePaymentProvider(where: { id: $id }, data: $data) { id }
    }
  `, { id, data })
  if (response.success && !response.data.updatePaymentProvider) return { success: false as const, error: 'Provider not found or not permitted' }
  if (response.success) revalidatePayments()
  return response
}
