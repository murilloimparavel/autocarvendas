import { customerTradeInStatus } from '../lifecycle/tradeInStatus'
import { calculateDealPrice } from '../lifecycle/dealPricing'
import {
  customerOwnership,
  ownedDealIds,
  ownedDealWhere,
  ownedServiceAppointmentWhere,
  ownedServiceOrderIds,
  ownedTestDriveWhere,
  requireCustomerAccount,
  type CustomerOwnership,
} from './customerOwnership'

// Customer-scoped reads for the storefront account. Every resolver resolves the
// session account, builds its ownership set (customerOwnership.ts) and only reads
// records inside it. Staff-only fields (costs, notes, assignees, provider keys,
// checkout URLs) are never selected.

const vehicleSelect = { select: { id: true, year: true, make: true, model: true, trim: true, vin: true, stockNumber: true } }
const PAGE = 50

type Kind = 'test-drive' | 'service' | 'inquiry' | 'trade-in' | 'financing'
const KIND_LABEL: Record<Kind, string> = {
  'test-drive': 'Test drive',
  service: 'Service',
  inquiry: 'Inquiry',
  'trade-in': 'Trade-in',
  financing: 'Financing',
}

// Customers cannot read acquisitions; a trade-in only reaches one through a deal, which they do see.
function tradeInFacts(tradeIn: any) {
  return { onDeal: Boolean(tradeIn.deal?.id), leadStatus: tradeIn.lead?.status ?? null, offerAmountCents: tradeIn.offerAmountCents ?? null }
}

function vehicleLabel(vehicle: any) {
  if (!vehicle) return null
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ') || null
}

async function rooftopTimezones(prisma: any, items: any[]) {
  const ids = [...new Set(items.map((item: any) => item.rooftopId).filter(Boolean))]
  const rooftops = ids.length ? await prisma.rooftop.findMany({ where: { id: { in: ids } }, select: { id: true, timezone: true } }) : []
  const byId = new Map(rooftops.map((rooftop: any) => [rooftop.id, rooftop.timezone || null]))
  return (item: any) => (byId.get(item.rooftopId) as string | null | undefined) ?? null
}

export function testDriveStatus(drive: { completed?: boolean; noShow?: boolean; cancelledAt?: Date | string | null }) {
  if (drive.cancelledAt) return 'cancelled'
  if (drive.noShow) return 'no-show'
  return drive.completed ? 'completed' : 'requested'
}

function isFuture(value: Date | string | null | undefined) {
  return Boolean(value) && new Date(value as any).getTime() > Date.now()
}

export function testDriveActions(drive: any) {
  const open = testDriveStatus(drive) === 'requested' && isFuture(drive.scheduledTime)
  return { canCancel: open, canReschedule: open }
}

export function serviceAppointmentActions(appointment: any) {
  const scheduled = appointment.status === 'scheduled'
  return { canCancel: scheduled, canReschedule: scheduled && isFuture(appointment.appointmentDate) }
}

// Leads shown as stand-alone inquiries: not the parent lead of another request kind.
const inquiryLeadWhere = {
  testDrives: { none: {} },
  serviceAppointments: { none: {} },
  tradeIns: { none: {} },
  financingApplications: { none: {} },
}

export async function customerRequestHistory(_root: unknown, _args: unknown, context: any) {
  const accountId = requireCustomerAccount(context)
  const prisma = context.prisma
  const ownership = await customerOwnership(prisma, accountId)
  const [drives, services, inquiries, tradeIns, applications] = await Promise.all([
    prisma.testDrive.findMany({ where: ownedTestDriveWhere(ownership), take: PAGE, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, rooftopId: true, scheduledTime: true, completed: true, noShow: true, cancelledAt: true, vehicle: vehicleSelect } }),
    prisma.serviceAppointment.findMany({ where: ownedServiceAppointmentWhere(ownership), take: PAGE, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, rooftopId: true, appointmentDate: true, status: true, customerVehicleDescription: true } }),
    ownership.leadIds.length
      ? prisma.lead.findMany({ where: { id: { in: ownership.leadIds }, ...inquiryLeadWhere }, take: PAGE, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, rooftopId: true, createdAt: true, status: true, interestedVehicle: vehicleSelect } })
      : [],
    ownership.tradeInIds.length
      ? prisma.tradeIn.findMany({ where: { id: { in: ownership.tradeInIds } }, take: PAGE, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, rooftopId: true, createdAt: true, offerAmountCents: true, year: true, make: true, model: true, trim: true, deal: { select: { id: true } }, lead: { select: { status: true } } } })
      : [],
    ownership.applicationIds.length
      ? prisma.financingApplication.findMany({ where: { id: { in: ownership.applicationIds } }, take: PAGE, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, rooftopId: true, createdAt: true, reference: true, status: true, requestedAmountCents: true, vehicle: vehicleSelect } })
      : [],
  ])
  const timezone = await rooftopTimezones(prisma, [...drives, ...services, ...inquiries, ...tradeIns, ...applications])
  const row = (kindKey: Kind, item: any, scheduledAt: any, status: string, vehicle: string | null, amountCents: number | null = null) => ({
    id: item.id, kind: KIND_LABEL[kindKey], kindKey, scheduledAt, status, timezone: timezone(item), vehicle, amountCents,
    reference: typeof item.reference === 'string' ? item.reference : null,
  })
  return [
    ...drives.map((item: any) => row('test-drive', item, item.scheduledTime, testDriveStatus(item), vehicleLabel(item.vehicle))),
    ...services.map((item: any) => row('service', item, item.appointmentDate, item.status, item.customerVehicleDescription || null)),
    ...inquiries.map((item: any) => row('inquiry', item, item.createdAt, item.status || 'new', vehicleLabel(item.interestedVehicle))),
    ...tradeIns.map((item: any) => row('trade-in', item, item.createdAt, customerTradeInStatus(tradeInFacts(item)), vehicleLabel(item), item.offerAmountCents ?? null)),
    ...applications.map((item: any) => row('financing', item, item.createdAt, item.status, vehicleLabel(item.vehicle), item.requestedAmountCents ?? null)),
  ].sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()).slice(0, PAGE)
}

async function submissionResponse(prisma: any, aggregateType: string, aggregateId: string) {
  const event = await prisma.domainAuditEvent.findFirst({
    where: { aggregateType, aggregateId, action: 'submitted', eventKey: { startsWith: 'public-submission:' } },
    select: { metadata: true },
  })
  const response = (event?.metadata as any)?.response
  return response && typeof response === 'object' && !Array.isArray(response) ? response : null
}

async function serviceOrderSummary(prisma: any, serviceOrderId: string | null | undefined) {
  if (!serviceOrderId) return null
  const order = await prisma.serviceOrder.findUnique({
    where: { id: serviceOrderId },
    select: { id: true, status: true, invoiceNumber: true, grandTotalCents: true, completedAt: true, settledAt: true },
  })
  return order || null
}

async function requestDetail(prisma: any, ownership: CustomerOwnership, kind: string, id: string) {
  if (kind === 'test-drive') {
    const drive = await prisma.testDrive.findFirst({
      where: { AND: [{ id }, ownedTestDriveWhere(ownership)] },
      select: { id: true, rooftopId: true, createdAt: true, scheduledTime: true, completed: true, noShow: true, cancelledAt: true, vehicle: vehicleSelect, lead: { select: { status: true } } },
    })
    if (!drive) return null
    return {
      kind, id: drive.id, rooftopId: drive.rooftopId, submittedAt: drive.createdAt, scheduledAt: drive.scheduledTime,
      status: testDriveStatus(drive), cancelledAt: drive.cancelledAt, vehicle: drive.vehicle ? { ...drive.vehicle, label: vehicleLabel(drive.vehicle) } : null,
      ...testDriveActions(drive),
    }
  }
  if (kind === 'service') {
    const appointment = await prisma.serviceAppointment.findFirst({
      where: { AND: [{ id }, ownedServiceAppointmentWhere(ownership)] },
      select: {
        id: true, rooftopId: true, createdAt: true, appointmentDate: true, status: true, serviceType: true, description: true,
        customerVehicleDescription: true, vehicleVin: true, estimatedDuration: true, transportationNeed: true, serviceOrderId: true,
        servicePackage: { select: { id: true, name: true, priceCents: true, estimatedDuration: true } },
      },
    })
    if (!appointment) return null
    return {
      kind, id: appointment.id, rooftopId: appointment.rooftopId, submittedAt: appointment.createdAt, scheduledAt: appointment.appointmentDate,
      status: appointment.status, serviceType: appointment.serviceType, concern: appointment.description,
      vehicleDescription: appointment.customerVehicleDescription, vehicleVin: appointment.vehicleVin || null,
      estimatedDuration: appointment.estimatedDuration, servicePackage: appointment.servicePackage || null,
      serviceOrder: await serviceOrderSummary(prisma, appointment.serviceOrderId),
      ...serviceAppointmentActions(appointment),
    }
  }
  if (kind === 'inquiry') {
    if (!ownership.leadIds.includes(id)) return null
    const lead = await prisma.lead.findFirst({
      where: { id, ...inquiryLeadWhere },
      select: { id: true, rooftopId: true, createdAt: true, status: true, timeframe: true, interestedVehicle: vehicleSelect },
    })
    if (!lead) return null
    const response = await submissionResponse(prisma, 'Lead', lead.id)
    return {
      kind, id: lead.id, rooftopId: lead.rooftopId, submittedAt: lead.createdAt, scheduledAt: lead.createdAt, status: lead.status || 'new',
      intent: typeof response?.intent === 'string' ? response.intent : null,
      intentLabel: typeof response?.intentLabel === 'string' ? response.intentLabel : null,
      preferredContact: typeof response?.preferredContact === 'string' ? response.preferredContact : null,
      vehicle: lead.interestedVehicle ? { ...lead.interestedVehicle, label: vehicleLabel(lead.interestedVehicle) } : null,
    }
  }
  if (kind === 'trade-in') {
    if (!ownership.tradeInIds.includes(id)) return null
    const tradeIn = await prisma.tradeIn.findUnique({
      where: { id },
      select: { id: true, rooftopId: true, createdAt: true, year: true, make: true, model: true, trim: true, vin: true, mileage: true, condition: true, offerAmountCents: true, deal: { select: { id: true } }, lead: { select: { status: true } } },
    })
    if (!tradeIn) return null
    const response = await submissionResponse(prisma, 'TradeIn', tradeIn.id)
    const estimate = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
    return {
      kind, id: tradeIn.id, rooftopId: tradeIn.rooftopId, submittedAt: tradeIn.createdAt, scheduledAt: tradeIn.createdAt,
      status: customerTradeInStatus(tradeInFacts(tradeIn)),
      vehicle: { year: tradeIn.year, make: tradeIn.make, model: tradeIn.model, trim: tradeIn.trim, vin: tradeIn.vin, label: vehicleLabel(tradeIn) },
      mileage: tradeIn.mileage, condition: tradeIn.condition, offerAmountCents: tradeIn.offerAmountCents ?? null,
      estimatedMin: estimate(response?.estimatedMin), estimatedMax: estimate(response?.estimatedMax),
      estimateMode: typeof response?.estimateMode === 'string' ? response.estimateMode : null,
    }
  }
  if (kind === 'financing') {
    if (!ownership.applicationIds.includes(id)) return null
    const application = await prisma.financingApplication.findUnique({
      where: { id },
      select: {
        id: true, rooftopId: true, createdAt: true, submittedAt: true, reference: true, status: true, requestedAmountCents: true,
        plannedMonthlyPaymentCents: true, plannedDownPaymentCents: true, loanTermMonths: true, vehicle: vehicleSelect,
        decisions: { orderBy: { decidedAt: 'desc' }, take: 10, select: { id: true, decision: true, approvedAmountCents: true, aprBasisPoints: true, termMonths: true, monthlyPaymentCents: true, decidedAt: true } },
      },
    })
    if (!application) return null
    return {
      kind, id: application.id, rooftopId: application.rooftopId, submittedAt: application.submittedAt || application.createdAt,
      scheduledAt: application.submittedAt || application.createdAt, reference: application.reference, status: application.status,
      requestedAmountCents: application.requestedAmountCents, plannedMonthlyPaymentCents: application.plannedMonthlyPaymentCents,
      plannedDownPaymentCents: application.plannedDownPaymentCents, loanTermMonths: application.loanTermMonths,
      vehicle: application.vehicle ? { ...application.vehicle, label: vehicleLabel(application.vehicle) } : null,
      decisions: application.decisions,
    }
  }
  return null
}

export async function customerRequestDetail(_root: unknown, { kind, id }: { kind: string; id: string }, context: any) {
  const accountId = requireCustomerAccount(context)
  const prisma = context.prisma
  const ownership = await customerOwnership(prisma, accountId)
  const detail = await requestDetail(prisma, ownership, String(kind || ''), String(id || ''))
  if (!detail) return null
  const timezone = await rooftopTimezones(prisma, [detail])
  const { rooftopId: _rooftopId, ...rest } = detail as any
  return { ...rest, label: KIND_LABEL[detail.kind as Kind], timezone: timezone(detail) }
}

function paymentRow(payment: any) {
  return {
    id: payment.id, sourceType: payment.sourceType, amountCents: payment.amountCents, currency: payment.currency, status: payment.status,
    capturedCents: payment.capturedCents, refundedCents: payment.refundedCents, createdAt: payment.createdAt,
    dealId: payment.dealId || null, serviceOrderId: payment.serviceOrderId || null,
  }
}

const paymentSelect = { id: true, sourceType: true, amountCents: true, currency: true, status: true, capturedCents: true, refundedCents: true, createdAt: true, dealId: true, serviceOrderId: true }

function dealTotals(deal: any) {
  try {
    const price = calculateDealPrice(deal)
    return { totalPriceCents: price.totalPriceCents, balanceCents: price.balanceCents, taxAmountCents: price.taxAmountCents, feesCents: price.feesCents, rebatesCents: price.rebatesCents }
  } catch {
    return { totalPriceCents: null, balanceCents: null, taxAmountCents: null, feesCents: null, rebatesCents: null }
  }
}

export async function customerPurchases(_root: unknown, _args: unknown, context: any) {
  const accountId = requireCustomerAccount(context)
  const prisma = context.prisma
  const ownership = await customerOwnership(prisma, accountId)
  if (!ownership.leadIds.length) return []
  const deals = await prisma.deal.findMany({
    where: ownedDealWhere(ownership),
    take: PAGE,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true, rooftopId: true, createdAt: true, status: true, structureType: true, saleDate: true,
      vehiclePriceCents: true, tradeInValueCents: true, downPaymentCents: true, financingAmountCents: true, monthlyPaymentCents: true,
      loanTerm: true, apr: true, taxAmountCents: true, fees: true, rebates: true, products: true, taxLines: true,
      vehicle: vehicleSelect,
      deliveryCases: {
        select: {
          id: true, status: true, appointmentAt: true, acknowledgedAt: true,
          weOweItems: { orderBy: { promisedAt: 'asc' }, select: { id: true, description: true, status: true, promisedAt: true, fulfilledAt: true } },
        },
      },
      paymentTransactions: { orderBy: { createdAt: 'desc' }, select: paymentSelect },
    },
  })
  const timezone = await rooftopTimezones(prisma, deals)
  return deals.map((deal: any) => ({
    id: deal.id, createdAt: deal.createdAt, status: deal.status, structureType: deal.structureType, saleDate: deal.saleDate, timezone: timezone(deal),
    vehicle: deal.vehicle ? { ...deal.vehicle, label: vehicleLabel(deal.vehicle) } : null,
    vehiclePriceCents: deal.vehiclePriceCents, tradeInValueCents: deal.tradeInValueCents, downPaymentCents: deal.downPaymentCents,
    financingAmountCents: deal.financingAmountCents, monthlyPaymentCents: deal.monthlyPaymentCents, loanTerm: deal.loanTerm, apr: deal.apr,
    ...dealTotals(deal),
    deliveries: deal.deliveryCases.map((delivery: any) => ({
      id: delivery.id, status: delivery.status, appointmentAt: delivery.appointmentAt, acknowledgedAt: delivery.acknowledgedAt,
      weOweItems: delivery.weOweItems,
    })),
    payments: deal.paymentTransactions.map(paymentRow),
  }))
}

export async function customerServiceHistory(_root: unknown, _args: unknown, context: any) {
  const accountId = requireCustomerAccount(context)
  const prisma = context.prisma
  const ownership = await customerOwnership(prisma, accountId)
  const appointments = await prisma.serviceAppointment.findMany({
    where: ownedServiceAppointmentWhere(ownership),
    take: PAGE,
    orderBy: [{ appointmentDate: 'desc' }, { id: 'desc' }],
    select: {
      id: true, rooftopId: true, appointmentDate: true, status: true, serviceType: true, customerVehicleDescription: true, serviceOrderId: true,
      servicePackage: { select: { id: true, name: true } },
    },
  })
  const orderIds = appointments.map((appointment: any) => appointment.serviceOrderId).filter(Boolean)
  const orders = orderIds.length
    ? await prisma.serviceOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, status: true, invoiceNumber: true, grandTotalCents: true, completedAt: true, settledAt: true } })
    : []
  const orderById = new Map(orders.map((order: any) => [order.id, order]))
  const timezone = await rooftopTimezones(prisma, appointments)
  return appointments.map((appointment: any) => ({
    id: appointment.id, appointmentDate: appointment.appointmentDate, status: appointment.status, serviceType: appointment.serviceType,
    vehicleDescription: appointment.customerVehicleDescription || null, servicePackage: appointment.servicePackage || null,
    serviceOrder: orderById.get(appointment.serviceOrderId) || null, timezone: timezone(appointment),
    ...serviceAppointmentActions(appointment),
  }))
}

export async function customerServiceOrder(_root: unknown, { id }: { id: string }, context: any) {
  const accountId = requireCustomerAccount(context)
  const prisma = context.prisma
  const ownership = await customerOwnership(prisma, accountId)
  const orderId = String(id || '')
  if (!(await ownedServiceOrderIds(prisma, ownership)).includes(orderId)) return null
  const order = await prisma.serviceOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true, rooftopId: true, createdAt: true, status: true, invoiceNumber: true, concern: true, cause: true, correction: true,
      workPerformed: true, recommendations: true, laborTotalCents: true, partsTotalCents: true, taxCents: true, grandTotalCents: true,
      completedAt: true, settledAt: true,
      appointment: { select: { id: true, appointmentDate: true, customerVehicleDescription: true, vehicleVin: true } },
      lineItems: { orderBy: { createdAt: 'asc' }, select: { id: true, itemType: true, description: true, partNumber: true, quantity: true, unitPriceCents: true, priceCents: true } },
      laborOperations: { orderBy: { createdAt: 'asc' }, select: { id: true, description: true, status: true, soldHours: true, completedAt: true } },
      paymentTransactions: { orderBy: { createdAt: 'desc' }, select: paymentSelect },
    },
  })
  if (!order) return null
  const timezone = await rooftopTimezones(prisma, [order])
  const { rooftopId: _rooftopId, paymentTransactions, ...rest } = order
  const settled = paymentTransactions
    .filter((payment: any) => ['captured', 'partially-refunded', 'refunded'].includes(payment.status))
    .reduce((sum: number, payment: any) => sum + Number(payment.capturedCents || 0) - Number(payment.refundedCents || 0), 0)
  return {
    ...rest,
    timezone: timezone(order),
    paidCents: settled,
    balanceCents: Math.max(0, Number(order.grandTotalCents || 0) - settled),
    payments: paymentTransactions.map(paymentRow),
  }
}

export async function customerPayments(_root: unknown, _args: unknown, context: any) {
  const accountId = requireCustomerAccount(context)
  const prisma = context.prisma
  const ownership = await customerOwnership(prisma, accountId)
  const [dealIds, orderIds] = await Promise.all([ownedDealIds(prisma, ownership), ownedServiceOrderIds(prisma, ownership)])
  // Storefront reservation deposits hang off the lead the reservation created (no deal yet).
  // Only settled deposits are shown; an abandoned checkout is not a payment.
  const leadIds = ownership.leadIds
  if (!dealIds.length && !orderIds.length && !leadIds.length) return []
  const payments = await prisma.paymentTransaction.findMany({
    where: { OR: [
      ...(dealIds.length ? [{ dealId: { in: dealIds } }] : []),
      ...(orderIds.length ? [{ serviceOrderId: { in: orderIds } }] : []),
      ...(leadIds.length ? [{ sourceType: 'reservation', leadId: { in: leadIds }, status: { in: ['authorized', 'captured', 'partially-refunded', 'refunded'] } }] : []),
    ] },
    take: PAGE,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { ...paymentSelect, deal: { select: { vehicle: vehicleSelect } }, serviceOrder: { select: { invoiceNumber: true } }, lead: { select: { interestedVehicle: vehicleSelect } } },
  })
  return payments.map((payment: any) => ({
    ...paymentRow(payment),
    label: payment.sourceType === 'service'
      ? `Service invoice ${payment.serviceOrder?.invoiceNumber || ''}`.trim()
      : payment.sourceType === 'reservation'
        ? `Reservation deposit · ${vehicleLabel(payment.lead?.interestedVehicle) || 'Vehicle'}`
        : vehicleLabel(payment.deal?.vehicle) || 'Vehicle purchase',
  }))
}
