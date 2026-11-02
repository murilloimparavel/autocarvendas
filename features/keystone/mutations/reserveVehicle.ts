import { executeAdapterFunction } from '../utils/paymentProviderAdapter'
import { paymentReturnUrls } from '../lib/paymentReturn'
import { resolveCustomerInTransaction } from './customerIdentity'
import { runPublicSubmission } from './publicSubmissionPolicy'
import { SubmissionError } from './submissionErrors'
import { optionalText, requiredText, resolveAvailableVehicle, validEmail, validPhone } from './submissionUtils'

// A shopper reserves a vehicle by paying a refundable deposit online. The lead and the
// payment transaction are written in one public-submission transaction; the provider
// checkout is created afterwards (no network I/O inside the transaction). Capture and
// refund follow the same verified webhook and staff refund path as every other payment.
export const RESERVATION_DEPOSIT_CENTS = 50_000

const paymentReturnSecret = () => process.env.SESSION_SECRET || ''

export function reservationDepositCents(vehiclePriceCents: unknown) {
  const price = Number(vehiclePriceCents)
  if (!Number.isSafeInteger(price) || price <= 0) return RESERVATION_DEPOSIT_CENTS
  return Math.min(RESERVATION_DEPOSIT_CENTS, price)
}

async function cardProvider(context: any) {
  const providers = await context.sudo().query.PaymentProvider.findMany({
    where: { isInstalled: { equals: true }, createPaymentFunction: { equals: 'stripe' } },
    orderBy: [{ createdAt: 'asc' }],
    take: 1,
    query: 'id code isInstalled createPaymentFunction refundPaymentFunction credentials',
  })
  return providers[0] || null
}

export async function reserveVehicle(_root: unknown, { data }: { data: any }, context: any) {
  const firstName = requiredText(data.firstName, 'First name', 100)
  const lastName = requiredText(data.lastName, 'Last name', 100)
  const email = validEmail(data.email)
  const phone = validPhone(data.phone, true)
  const message = optionalText(data.message, 4000, 'Message')
  const vehicleId = requiredText(data.vehicleId, 'Vehicle', 100)

  const provider = await cardProvider(context)
  if (!provider) {
    throw new SubmissionError('Online reservations are unavailable right now. Please call the dealership.', 503, 'PAYMENTS_UNAVAILABLE')
  }

  const result = await runPublicSubmission({
    context,
    workflow: 'reservation',
    rooftopSlug: data.rooftopSlug,
    idempotencyKey: data.idempotencyKey,
    honeypot: data.website,
    requestEvidence: { firstName, lastName, email, phone, message, vehicleId, providerKey: provider.code },
    aggregateType: 'Lead',
    topic: 'public-reservation.submitted',
    aggregateId: (response) => String(response.leadId),
    handler: async (transactionContext, { rooftopId }) => {
      const vehicle = await resolveAvailableVehicle(transactionContext, vehicleId, rooftopId)
      if (!vehicle) throw new SubmissionError('This vehicle is no longer available.', 409, 'VEHICLE_UNAVAILABLE')
      const rooftop = await transactionContext.sudo().prisma.rooftop.findUnique({ where: { id: rooftopId }, select: { currencyCode: true } })
      const amountCents = reservationDepositCents(vehicle.priceCents ?? vehicle.listPriceCents)
      const { customer } = await resolveCustomerInTransaction(transactionContext, { rooftopId, firstName, lastName, email, phone })
      const lead = await transactionContext.sudo().query.Lead.createOne({
        data: {
          rooftop: { connect: { id: rooftopId } },
          customer: { connect: { id: customer.id } },
          firstName,
          lastName,
          email,
          phone,
          source: 'website',
          status: 'new',
          timeframe: 'immediately',
          interestedVehicle: { connect: { id: vehicle.id } },
          notes: [
            'Vehicle reservation with an online deposit, submitted from the storefront.',
            `Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model} (stock ${vehicle.stockNumber}, VIN ${vehicle.vin}).`,
            `Deposit: ${(amountCents / 100).toFixed(2)} ${String(rooftop?.currencyCode || 'USD').toUpperCase()}, refundable from Payments.`,
            message ? `Customer message: ${message}` : 'Customer did not include an additional message.',
          ].join('\n'),
        },
        query: 'id',
      })
      const transaction = await transactionContext.prisma.paymentTransaction.create({
        data: {
          rooftopId,
          leadId: lead.id,
          sourceType: 'reservation',
          amountCents,
          currency: String(rooftop?.currencyCode || 'USD').toLowerCase(),
          providerKey: provider.code,
          paymentProviderId: provider.id,
          status: 'creating',
          idempotencyKey: `reservation:${String(data.idempotencyKey).trim()}`,
        },
        select: { id: true },
      })
      return {
        leadId: lead.id,
        transactionId: transaction.id,
        amountCents,
        selectedVehicle: vehicle,
      }
    },
  })

  const transactionId = String(result.transactionId)
  const current = await context.sudo().prisma.paymentTransaction.findUnique({ where: { id: transactionId } })
  if (!current) throw new Error('Reservation payment is missing')
  if (current.checkoutUrl && current.providerSessionId) {
    return { ...result, checkoutUrl: current.checkoutUrl }
  }
  if (!['creating', 'failed'].includes(current.status)) {
    throw new SubmissionError('This reservation was already paid or closed.', 409, 'RESERVATION_CLOSED')
  }
  const vehicle: any = result.selectedVehicle || {}
  try {
    const headers = context.req?.headers || {}
    const origin = `${headers['x-forwarded-proto'] || 'https'}://${headers['x-forwarded-host'] || headers.host}`
    const { successUrl, cancelUrl } = paymentReturnUrls(origin, transactionId, paymentReturnSecret())
    const response = await executeAdapterFunction({
      provider,
      functionName: 'createPaymentFunction',
      args: {
        amount: current.amountCents,
        currency: current.currency,
        description: `Reservation deposit: ${[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}`.trim(),
        metadata: { openfront_transaction_id: transactionId },
        idempotencyKey: current.idempotencyKey,
        successUrl,
        cancelUrl,
      },
    })
    await context.sudo().prisma.paymentTransaction.update({
      where: { id: transactionId },
      data: {
        status: 'pending',
        checkoutUrl: response?.checkoutUrl,
        providerSessionId: response?.providerSessionId,
        providerTransactionId: response?.providerTransactionId || '',
        version: { increment: 1 },
      },
    })
    if (!response?.checkoutUrl) throw new Error('Provider returned no checkout link')
    return { ...result, checkoutUrl: response.checkoutUrl }
  } catch (error: any) {
    await context.sudo().prisma.paymentTransaction.update({
      where: { id: transactionId },
      data: { status: 'failed', failureCode: String(error?.code || error?.message || 'PROVIDER_ERROR').slice(0, 100), version: { increment: 1 } },
    })
    console.error('Reservation checkout failed:', error?.message || error)
    throw new SubmissionError('Card checkout could not be started. Please try again.', 502, 'PAYMENT_START_FAILED')
  }
}
