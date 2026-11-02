import { permissions } from '../access'
import { calculateDealPrice } from '../lifecycle/dealPricing'
import { executeAdapterFunction } from '../utils/paymentProviderAdapter'
import { recordDomainEventInTransaction } from '../lifecycle/domainEvents'
import { assertSessionRooftopPermission } from '../tenantRecords'
import { paymentReturnState, paymentReturnUrls, readPaymentReturnReference } from '../lib/paymentReturn'

const paymentReturnSecret = () => process.env.SESSION_SECRET || ''

const required = (value: unknown, name: string, max = 500) => {
  const text = String(value || '').trim()
  if (!text || text.length > max) throw new Error(`${name} is required`)
  return text
}
const positiveCents = (value: unknown, name: string) => {
  const amount = Number(value)
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(`${name} must be positive integer cents`)
  return amount
}

export type VerifiedPaymentEvent = {
  id: string
  type: string
  providerKey: string
  createdAt: Date
  signatureTimestamp: Date
  transactionId: string
  providerTransactionId?: string
  providerSessionId?: string
  providerRefundId?: string
  amountCents?: number
  providerStatus?: string
  rawDigest: string
}

function assertPaymentAdmin(context: any) {
  if (!context.session?.itemId || !permissions.canManagePayments({ session: context.session })) {
    throw new Error('Payment administration permission is required')
  }
}

async function installedPaymentProvider(context: any, code: string) {
  const provider = await context.sudo().query.PaymentProvider.findOne({
    where: { code },
    query: 'id code isInstalled createPaymentFunction refundPaymentFunction credentials',
  })
  if (!provider?.isInstalled) throw new Error('Payment provider not found')
  return provider
}

async function canManageSourcePayments(context: any, rooftopId: string) {
  try {
    await assertSessionRooftopPermission(context, rooftopId, 'canManagePayments')
    return true
  } catch {
    return false
  }
}

async function payableSource(context: any, sourceType: string, sourceId: string) {
  if (sourceType === 'deal') {
    const deal = await context.sudo().prisma.deal.findUnique({ where: { id: sourceId }, include: { vehicle: { select: { year: true, make: true, model: true } } } })
    const rooftop = deal && await canManageSourcePayments(context, deal.rooftopId) ? await context.query.Rooftop.findOne({ where: { id: deal.rooftopId }, query: 'id currencyCode' }) : null
    if (!deal || !rooftop?.id || !['approved', 'financed', 'delivered'].includes(deal.status)) throw new Error('Accessible approved deal source required')
    const total = calculateDealPrice(deal).cashPayableCents
    return { rooftopId: rooftop.id, currency: String(rooftop.currencyCode || 'USD').toLowerCase(), maximumCents: Math.max(0, total), description: `${deal.vehicle?.year || ''} ${deal.vehicle?.make || ''} ${deal.vehicle?.model || ''} deal payment`.trim(), relation: { dealId: deal.id } }
  }
  if (sourceType === 'service') {
    const order = await context.sudo().prisma.serviceOrder.findUnique({ where: { id: sourceId } })
    const rooftop = order && await canManageSourcePayments(context, order.rooftopId) ? await context.query.Rooftop.findOne({ where: { id: order.rooftopId }, query: 'id currencyCode' }) : null
    if (!order || !rooftop?.id || !['invoiced', 'paid'].includes(order.status)) throw new Error('Accessible invoiced service-order source required')
    return { rooftopId: rooftop.id, currency: String(rooftop.currencyCode || 'USD').toLowerCase(), maximumCents: Number(order.grandTotalCents || 0), description: `Service invoice ${order.invoiceNumber || order.id}`, relation: { serviceOrderId: order.id } }
  }
  throw new Error('Unsupported payment source')
}

export async function createPaymentCheckout(_root: unknown, { data }: any, context: any) {
  assertPaymentAdmin(context)
  const sourceType = required(data.sourceType, 'Source type', 20)
  const sourceId = required(data.sourceId, 'Source ID', 100)
  const providerKey = required(data.providerKey, 'Provider', 50)
  const idempotencyKey = required(data.idempotencyKey, 'Idempotency key', 200)
  const amountCents = positiveCents(data.amountCents, 'Amount')
  const source = await payableSource(context, sourceType, sourceId)
  const provider = await installedPaymentProvider(context, providerKey)
  const currency = source.currency
  const eventKey = `payment-checkout:${idempotencyKey}`
  const transactionId = await context.transaction(async (tx: any) => {
    await tx.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${source.rooftopId}:${sourceType}:${sourceId}`}, 0))`
    const existing = await tx.prisma.paymentTransaction.findUnique({ where: { idempotencyKey } })
    await recordDomainEventInTransaction(tx, { eventKey, rooftopId: source.rooftopId, aggregateType: 'PaymentTransaction', aggregateId: sourceId, action: 'checkout-requested', topic: 'payment.checkout-requested', actorId: context.session.itemId, afterSnapshot: { sourceType, sourceId, amountCents, currency, providerKey }, payload: { rooftopId: source.rooftopId, sourceType, sourceId, amountCents, providerKey } })
    if (existing) {
      if (existing.sourceType !== sourceType || existing.amountCents !== amountCents || existing.providerKey !== providerKey || existing.dealId !== (source.relation.dealId || null) || existing.serviceOrderId !== (source.relation.serviceOrderId || null)) throw new Error('Payment idempotency key was reused with different evidence')
      return existing.id
    }
    const captured = await tx.prisma.paymentTransaction.aggregate({ where: { rooftopId: source.rooftopId, sourceType, ...(source.relation), status: { in: ['creating', 'pending', 'authorized', 'captured', 'partially-refunded', 'refunded'] } }, _sum: { amountCents: true, refundedCents: true } })
    const reservedBalance = Number(captured._sum.amountCents || 0) - Number(captured._sum.refundedCents || 0)
    if (amountCents > source.maximumCents - reservedBalance) throw new Error('Payment exceeds the remaining source balance')
    return (await tx.prisma.paymentTransaction.create({ data: { rooftopId: source.rooftopId, ...source.relation, sourceType, amountCents, currency, providerKey, paymentProviderId: provider.id, status: 'creating', idempotencyKey }, select: { id: true } })).id
  }, { timeout: 30_000 })
  const current = await context.sudo().prisma.paymentTransaction.findUnique({ where: { id: transactionId } })
  if (current.checkoutUrl && current.providerSessionId) return context.db.PaymentTransaction.findOne({ where: { id: transactionId } })
  try {
    const requestHeaders = context.req?.headers || {}
    const origin = `${requestHeaders['x-forwarded-proto'] || 'https'}://${requestHeaders['x-forwarded-host'] || requestHeaders.host}`
    // The customer pays, so they return to the storefront, never to the dashboard that staff used.
    const { successUrl, cancelUrl } = paymentReturnUrls(origin, transactionId, paymentReturnSecret())
    const response = await executeAdapterFunction({ provider, functionName: 'createPaymentFunction', args: { amount: amountCents, currency, description: source.description, metadata: { openfront_transaction_id: transactionId }, idempotencyKey, successUrl, cancelUrl } })
    await context.sudo().prisma.paymentTransaction.update({ where: { id: transactionId }, data: { status: 'pending', checkoutUrl: response?.checkoutUrl, providerSessionId: response?.providerSessionId, providerTransactionId: response?.providerTransactionId, version: { increment: 1 } } })
  } catch (error: any) {
    await context.sudo().prisma.paymentTransaction.update({ where: { id: transactionId }, data: { status: 'failed', failureCode: String(error?.code || error?.message || 'PROVIDER_ERROR').slice(0, 100), version: { increment: 1 } } })
    throw error
  }
  return context.db.PaymentTransaction.findOne({ where: { id: transactionId } })
}

/** Public: what a customer returning from checkout may see about their own payment. */
export async function paymentReturnStatus(_root: unknown, { reference }: { reference?: string }, context: any) {
  const transactionId = readPaymentReturnReference(reference, paymentReturnSecret())
  if (!transactionId) return null
  const tx = await context.sudo().prisma.paymentTransaction.findUnique({
    where: { id: transactionId },
    select: {
      status: true, amountCents: true, currency: true, checkoutUrl: true, sourceType: true,
      deal: { select: { vehicle: { select: { year: true, make: true, model: true, trim: true, stockNumber: true } } } },
      serviceOrder: { select: { invoiceNumber: true } },
    },
  })
  if (!tx) return null
  const { state, retryUrl } = paymentReturnState(tx.status, tx.checkoutUrl)
  const vehicle = tx.deal?.vehicle
  return {
    state,
    retryUrl,
    amountCents: tx.amountCents,
    currency: String(tx.currency || 'usd').toUpperCase(),
    reference: `PAY-${transactionId.slice(-8).toUpperCase()}`,
    purpose: tx.sourceType === 'deal' ? 'Vehicle payment' : 'Service payment',
    item: vehicle ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ') : tx.serviceOrder?.invoiceNumber ? `Invoice ${tx.serviceOrder.invoiceNumber}` : null,
    stockNumber: vehicle?.stockNumber || null,
  }
}

export async function requestPaymentRefund(_root: unknown, { data }: any, context: any) {
  assertPaymentAdmin(context)
  const transactionId = required(data.transactionId, 'Transaction ID', 100)
  const idempotencyKey = required(data.idempotencyKey, 'Idempotency key', 200)
  const amountCents = positiveCents(data.amountCents, 'Refund amount')
  const reason = required(data.reason, 'Refund reason', 500)
  const transaction = await context.query.PaymentTransaction.findOne({ where: { id: transactionId }, query: 'id status amountCents currency capturedCents refundedCents providerKey providerTransactionId rooftop { id }' })
  if (!transaction?.rooftop?.id || !['captured', 'partially-refunded'].includes(transaction.status) || !transaction.providerTransactionId) throw new Error('Captured payment transaction required')
  await assertSessionRooftopPermission(context, transaction.rooftop.id, 'canManagePayments')
  const provider = await installedPaymentProvider(context, transaction.providerKey)
  const refundId = await context.transaction(async (tx: any) => {
    await tx.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-refund:${transactionId}`}, 0))`
    const existing = await tx.prisma.paymentRefund.findUnique({ where: { idempotencyKey } })
    await recordDomainEventInTransaction(tx, { eventKey: `payment-refund:${idempotencyKey}`, rooftopId: transaction.rooftop.id, aggregateType: 'PaymentRefund', aggregateId: transactionId, action: 'requested', topic: 'payment.refund-requested', actorId: context.session.itemId, afterSnapshot: { transactionId, amountCents, reason }, payload: { rooftopId: transaction.rooftop.id, transactionId, amountCents } })
    if (existing) {
      if (existing.transactionId !== transactionId || existing.amountCents !== amountCents || existing.reason !== reason) throw new Error('Refund idempotency key was reused with different evidence')
      return existing.id
    }
    const reserved = await tx.prisma.paymentRefund.aggregate({ where: { transactionId, status: { in: ['creating', 'pending', 'succeeded'] } }, _sum: { amountCents: true } })
    if (amountCents > transaction.capturedCents - Number(reserved._sum.amountCents || 0)) throw new Error('Refund exceeds remaining captured amount')
    return (await tx.prisma.paymentRefund.create({ data: { rooftopId: transaction.rooftop.id, transactionId, amountCents, reason, status: 'creating', idempotencyKey }, select: { id: true } })).id
  }, { timeout: 30_000 })
  const existing = await context.sudo().prisma.paymentRefund.findUnique({ where: { id: refundId } })
  if (!existing.providerRefundId) {
    try {
      const result = await executeAdapterFunction({ provider, functionName: 'refundPaymentFunction', args: { paymentId: transaction.providerTransactionId, amount: amountCents, currency: transaction.currency, idempotencyKey, metadata: { openfront_refund_id: refundId, openfront_transaction_id: transactionId, openfront_reason: reason.slice(0, 200) } } })
      await context.sudo().prisma.paymentRefund.update({ where: { id: refundId }, data: { providerRefundId: result?.providerRefundId ? String(result.providerRefundId) : undefined, status: result?.status === 'succeeded' ? 'succeeded' : 'pending' } })
    } catch (error: any) {
      await context.sudo().prisma.paymentRefund.update({ where: { id: refundId }, data: { status: 'failed', failureCode: String(error?.code || error?.message || 'PROVIDER_ERROR').slice(0, 100) } })
      throw error
    }
  }
  return context.db.PaymentRefund.findOne({ where: { id: refundId } })
}

export async function reconcilePaymentTransaction(_root: unknown, { data }: any, context: any) {
  assertPaymentAdmin(context)
  const transactionId = required(data.transactionId, 'Transaction ID', 100)
  const reference = required(data.reconciliationReference, 'Reconciliation reference', 200)
  const idempotencyKey = required(data.idempotencyKey, 'Idempotency key', 200)
  return context.transaction(async (tx: any) => {
    const session = tx.withSession(context.session)
    const transaction = await session.query.PaymentTransaction.findOne({ where: { id: transactionId }, query: 'id status reconciliationReference rooftop { id }' })
    if (!transaction?.rooftop?.id || !['captured', 'partially-refunded', 'refunded'].includes(transaction.status)) throw new Error('Settled payment required for reconciliation')
    await assertSessionRooftopPermission(context, transaction.rooftop.id, 'canManagePayments')
    await recordDomainEventInTransaction(tx, { eventKey: `payment-reconcile:${idempotencyKey}`, rooftopId: transaction.rooftop.id, aggregateType: 'PaymentTransaction', aggregateId: transactionId, action: 'reconciled', topic: 'payment.reconciled', actorId: context.session.itemId, afterSnapshot: { transactionId, reference }, payload: { rooftopId: transaction.rooftop.id, transactionId, reference } })
    if (transaction.reconciliationReference && transaction.reconciliationReference !== reference) throw new Error('Payment is already reconciled with different evidence')
    await tx.prisma.paymentTransaction.updateMany({ where: { id: transactionId, reconciliationReference: '' }, data: { reconciliationReference: reference, reconciledAt: new Date(), version: { increment: 1 } } })
    return session.db.PaymentTransaction.findOne({ where: { id: transactionId } })
  }, { timeout: 30_000 })
}

export async function processVerifiedPaymentWebhook(event: VerifiedPaymentEvent, context: any) {
  const supportedEvents = ['checkout.session.completed', 'checkout.session.expired', 'payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.canceled', 'refund.created', 'refund.updated']
  if (!supportedEvents.includes(event.type)) throw new Error('Unsupported payment webhook event type')
  return context.transaction(async (tx: any) => {
    await tx.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-webhook:${event.transactionId}`}, 0))`
    const duplicate = await tx.prisma.paymentProviderEvent.findUnique({ where: { providerEventId: event.id } })
    if (duplicate) return { duplicate: true, transactionId: duplicate.transactionId }
    const transaction = await tx.prisma.paymentTransaction.findUnique({ where: { id: event.transactionId } })
    if (!transaction || transaction.providerKey !== event.providerKey) throw new Error('Payment webhook transaction not found')
    let status = transaction.status
    let capturedCents = transaction.capturedCents
    let refundedCents = transaction.refundedCents
    let failureCode = transaction.failureCode
    if (event.type === 'payment_intent.succeeded' || (event.type === 'checkout.session.completed' && event.providerStatus === 'paid')) {
      if (event.amountCents && event.amountCents !== transaction.amountCents) throw new Error('Payment webhook amount does not match authoritative transaction')
      capturedCents = event.amountCents || transaction.amountCents; failureCode = ''
      if (!['partially-refunded', 'refunded'].includes(transaction.status)) status = 'captured'
    } else if (['checkout.session.expired', 'payment_intent.canceled'].includes(event.type) && ['creating', 'pending', 'authorized', 'failed'].includes(transaction.status)) status = 'canceled'
    else if (event.type === 'payment_intent.payment_failed' && ['creating', 'pending', 'authorized', 'failed'].includes(transaction.status)) { status = 'failed'; failureCode = 'PROVIDER_PAYMENT_FAILED' }
    else if (['refund.created', 'refund.updated'].includes(event.type) && event.providerRefundId) {
      const refund = await tx.prisma.paymentRefund.findFirst({ where: { providerRefundId: event.providerRefundId } })
      if (!refund || refund.transactionId !== transaction.id || !['captured', 'partially-refunded', 'refunded'].includes(transaction.status)) throw new Error('Payment refund webhook does not match a captured transaction')
      if (event.providerStatus === 'succeeded') await tx.prisma.paymentRefund.update({ where: { id: refund.id }, data: { status: 'succeeded', failureCode: '' } })
      else if (['failed', 'canceled'].includes(event.providerStatus || '')) await tx.prisma.paymentRefund.update({ where: { id: refund.id }, data: { status: event.providerStatus, failureCode: 'PROVIDER_REFUND_FAILED' } })
      if (event.providerStatus === 'succeeded') {
        const succeeded = await tx.prisma.paymentRefund.aggregate({ where: { transactionId: transaction.id, status: 'succeeded' }, _sum: { amountCents: true } })
        refundedCents = Math.min(capturedCents, Number(succeeded._sum.amountCents || 0))
        status = refundedCents >= capturedCents ? 'refunded' : 'partially-refunded'
      }
    }
    await tx.prisma.paymentTransaction.update({ where: { id: transaction.id }, data: { status, capturedCents, refundedCents, failureCode, providerTransactionId: event.providerTransactionId || transaction.providerTransactionId, providerSessionId: event.providerSessionId || transaction.providerSessionId, version: { increment: 1 } } })
    const refund = event.providerRefundId ? await tx.prisma.paymentRefund.findFirst({ where: { providerRefundId: event.providerRefundId }, select: { id: true } }) : null
    await tx.prisma.paymentProviderEvent.create({ data: { rooftopId: transaction.rooftopId, transactionId: transaction.id, refundId: refund?.id, providerKey: transaction.providerKey, providerEventId: event.id, eventType: event.type, payloadDigest: event.rawDigest, signatureTimestamp: event.signatureTimestamp, receivedAt: new Date() } })
    await recordDomainEventInTransaction(tx, { eventKey: `payment-webhook:${event.id}`, rooftopId: transaction.rooftopId, aggregateType: 'PaymentTransaction', aggregateId: transaction.id, action: event.type, topic: 'payment.provider-event-verified', actorId: null, afterSnapshot: { transactionId: transaction.id, status, capturedCents, refundedCents, payloadDigest: event.rawDigest }, payload: { rooftopId: transaction.rooftopId, transactionId: transaction.id, status, providerEventId: event.id } })
    if (status === 'captured' && transaction.serviceOrderId) {
      const order = await tx.prisma.serviceOrder.findUnique({ where: { id: transaction.serviceOrderId }, select: { status: true, grandTotalCents: true } })
      const totals = await tx.prisma.paymentTransaction.aggregate({ where: { serviceOrderId: transaction.serviceOrderId, status: { in: ['captured', 'partially-refunded', 'refunded'] } }, _sum: { capturedCents: true, refundedCents: true } })
      if (order?.status === 'invoiced' && Number(totals._sum.capturedCents || 0) - Number(totals._sum.refundedCents || 0) >= Number(order.grandTotalCents || 0)) await tx.prisma.serviceOrder.update({ where: { id: transaction.serviceOrderId }, data: { status: 'paid', settledAt: new Date() } })
    }
    return { duplicate: false, transactionId: transaction.id, status }
  }, { timeout: 30_000 })
}
