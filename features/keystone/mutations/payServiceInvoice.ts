import { executeAdapterFunction } from '../utils/paymentProviderAdapter'
import { paymentReturnUrls } from '../lib/paymentReturn'
import { customerOwnership, ownedServiceOrderIds, requireCustomerAccount } from './customerOwnership'

// Customer pays their own invoiced repair order online from /account/service/<id>, the way
// Xtime / myKaarma pay-links work. Ownership is the account boundary in customerOwnership.ts;
// the amount is always the server-computed open balance, never a client number. One open
// checkout per order is reused, so double clicks and retries never create a second charge.

const paymentReturnSecret = () => process.env.SESSION_SECRET || ''
const SETTLED = ['captured', 'partially-refunded', 'refunded']
const OPEN = ['creating', 'pending', 'authorized']
const OPEN_CHECKOUT_MS = 30 * 60 * 1000

async function cardProvider(context: any) {
  const providers = await context.sudo().query.PaymentProvider.findMany({
    where: { isInstalled: { equals: true }, createPaymentFunction: { equals: 'stripe' } },
    orderBy: [{ createdAt: 'asc' }],
    take: 1,
    query: 'id code isInstalled createPaymentFunction refundPaymentFunction credentials',
  })
  return providers[0] || null
}

export function serviceBalanceCents(grandTotalCents: number, payments: Array<{ status: string; capturedCents: number | null; refundedCents: number | null }>) {
  const settled = payments.filter(p => SETTLED.includes(p.status)).reduce((sum, p) => sum + Number(p.capturedCents || 0) - Number(p.refundedCents || 0), 0)
  return Math.max(0, Number(grandTotalCents || 0) - settled)
}

export async function payServiceInvoice(_root: unknown, { serviceOrderId }: { serviceOrderId: string }, context: any) {
  const accountId = requireCustomerAccount(context)
  const orderId = String(serviceOrderId || '')
  const ownership = await customerOwnership(context.prisma, accountId)
  if (!(await ownedServiceOrderIds(context.prisma, ownership)).includes(orderId)) throw new Error('Repair order not found')
  const provider = await cardProvider(context)
  if (!provider) throw new Error('Online payment is unavailable right now. Please call the service department.')
  const sudo = context.sudo()
  const now = Date.now()

  const transactionId: string = await sudo.transaction(async (tx: any) => {
    await tx.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`customer-service-pay:${orderId}`}, 0))`
    const order = await tx.prisma.serviceOrder.findUnique({ where: { id: orderId }, select: { id: true, rooftopId: true, status: true, grandTotalCents: true, invoiceNumber: true } })
    if (!order || order.status !== 'invoiced') throw new Error('This repair order has no open invoice to pay')
    const payments = await tx.prisma.paymentTransaction.findMany({ where: { serviceOrderId: orderId }, orderBy: [{ createdAt: 'desc' }], select: { id: true, status: true, amountCents: true, capturedCents: true, refundedCents: true, checkoutUrl: true, createdAt: true, providerKey: true } })
    const balance = serviceBalanceCents(order.grandTotalCents, payments)
    if (balance <= 0) throw new Error('This invoice is already paid')
    const open = payments.find((p: any) => OPEN.includes(p.status) && p.providerKey === provider.code && p.amountCents === balance && now - new Date(p.createdAt).getTime() < OPEN_CHECKOUT_MS)
    if (open) return open.id
    // An older open checkout for a different amount must not double-collect: it expires on its own.
    const pendingCents = payments.filter((p: any) => OPEN.includes(p.status) && now - new Date(p.createdAt).getTime() < OPEN_CHECKOUT_MS).reduce((s: number, p: any) => s + Number(p.amountCents || 0), 0)
    if (pendingCents > 0) throw new Error('A payment for this invoice is already in progress. Try again in a few minutes.')
    const created = await tx.prisma.paymentTransaction.create({
      data: { rooftopId: order.rooftopId, serviceOrderId: orderId, sourceType: 'service', amountCents: balance, currency: 'usd', providerKey: provider.code, paymentProviderId: provider.id, status: 'creating', idempotencyKey: `customer-service-pay:${orderId}:${now}` },
      select: { id: true },
    })
    await tx.prisma.domainAuditEvent.create({ data: { rooftopId: order.rooftopId, eventKey: `customer-service-pay:${created.id}`, aggregateType: 'ServiceOrder', aggregateId: orderId, action: 'customer-checkout-requested', actorId: accountId, afterSnapshot: { transactionId: created.id, amountCents: balance, invoiceNumber: order.invoiceNumber }, metadata: {} }, select: { id: true } })
    return created.id
  }, { timeout: 30_000 })

  const current = await sudo.prisma.paymentTransaction.findUnique({ where: { id: transactionId }, include: { serviceOrder: { select: { invoiceNumber: true } } } })
  if (current.checkoutUrl && current.providerSessionId && ['pending', 'creating'].includes(current.status)) return { checkoutUrl: current.checkoutUrl }
  try {
    const headers = context.req?.headers || {}
    const origin = `${headers['x-forwarded-proto'] || 'https'}://${headers['x-forwarded-host'] || headers.host}`
    const { successUrl, cancelUrl } = paymentReturnUrls(origin, transactionId, paymentReturnSecret())
    const response = await executeAdapterFunction({
      provider,
      functionName: 'createPaymentFunction',
      args: { amount: current.amountCents, currency: current.currency, description: `Service invoice ${current.serviceOrder?.invoiceNumber || ''}`.trim(), metadata: { openfront_transaction_id: transactionId }, idempotencyKey: current.idempotencyKey, successUrl, cancelUrl },
    })
    await sudo.prisma.paymentTransaction.update({ where: { id: transactionId }, data: { status: 'pending', checkoutUrl: response?.checkoutUrl, providerSessionId: response?.providerSessionId, providerTransactionId: response?.providerTransactionId || '', version: { increment: 1 } } })
    if (!response?.checkoutUrl) throw new Error('Provider returned no checkout link')
    return { checkoutUrl: response.checkoutUrl }
  } catch (error: any) {
    await sudo.prisma.paymentTransaction.update({ where: { id: transactionId }, data: { status: 'failed', failureCode: String(error?.code || error?.message || 'PROVIDER_ERROR').slice(0, 100), version: { increment: 1 } } })
    console.error('Service invoice checkout failed:', error?.message || error)
    throw new Error('Card checkout could not be started. Please try again.')
  }
}
