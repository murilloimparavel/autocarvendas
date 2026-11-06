// What happens after a storefront reservation deposit is paid. Market practice (CDK, VinSolutions,
// DealerSocket): a paid deposit is the hottest lead a store gets, so it is routed to a salesperson
// at once with an urgent call-back task due now, and the buyer gets a confirmation naming the car,
// the amount, and what happens next.
//
// The CRM part runs inside the verified-webhook transaction and is idempotent through a domain
// event key per payment. The email runs after commit and is claimed exactly once.
import { findMatchingRoutingRule, userHasActiveRooftopAccess } from '../mutations/leadRouting'
import { recordDomainEventInTransaction } from '../lifecycle/domainEvents'

export const RESERVATION_CALLBACK_MINUTES = 15

export function vehicleTitle(vehicle: { year?: number | null; make?: string | null; model?: string | null; trim?: string | null } | null | undefined) {
  if (!vehicle) return 'your vehicle'
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ') || 'your vehicle'
}

export function usd(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cents || 0) / 100)
}

/** First active rooftop member whose role can work leads: the fallback owner when no routing rule matches. */
async function fallbackSalesperson(tx: any, rooftopId: string) {
  const direct = await tx.prisma.rooftopMembership.findFirst({
    where: { rooftopId, status: 'active', userId: { not: null }, OR: [{ role: { is: { canManageLeads: true } } }, { user: { is: { role: { is: { canManageLeads: true } } } } }] },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { userId: true },
  })
  if (direct?.userId) return String(direct.userId)
  const group = await tx.prisma.dealerGroupMembership.findFirst({
    where: { status: 'active', accessAllRooftops: true, userId: { not: null }, dealerGroup: { rooftops: { some: { id: rooftopId } } }, OR: [{ role: { is: { canManageLeads: true } } }, { user: { is: { role: { is: { canManageLeads: true } } } } }] },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { userId: true },
  })
  return group?.userId ? String(group.userId) : null
}

/**
 * Routes the reservation lead and opens the call-back task. Runs in the webhook transaction right
 * after a reservation payment is captured. Replays (duplicate webhooks, payment_intent + session
 * events for one payment) find the event key and do nothing.
 */
export async function applyPaidReservationInTransaction(tx: any, transaction: { id: string; rooftopId: string; leadId: string | null; capturedCents: number }, now = new Date()) {
  if (!transaction.leadId) return null
  const eventKey = `reservation-paid:${transaction.id}`
  const prior = await tx.prisma.domainAuditEvent.findUnique({ where: { eventKey }, select: { id: true } })
  if (prior) return null
  const lead = await tx.prisma.lead.findUnique({
    where: { id: transaction.leadId },
    select: { id: true, rooftopId: true, firstName: true, lastName: true, phone: true, email: true, assignedSalespersonId: true, interestedVehicle: { select: { id: true, year: true, make: true, model: true, trim: true, stockNumber: true } } },
  })
  if (!lead || lead.rooftopId !== transaction.rooftopId) return null

  let assigneeId: string | null = lead.assignedSalespersonId || null
  let routeKey = 'existing-owner'
  let reason = 'Lead already owned'
  if (!assigneeId) {
    const rule = await findMatchingRoutingRule(tx, lead.rooftopId, 'website')
    if (rule && await userHasActiveRooftopAccess(tx, rule.assigneeId, lead.rooftopId)) {
      assigneeId = String(rule.assigneeId); routeKey = String(rule.routeKey); reason = 'Paid reservation deposit: matched active routing rule'
    } else {
      assigneeId = await fallbackSalesperson(tx, lead.rooftopId)
      routeKey = 'reservation-fallback'; reason = 'Paid reservation deposit: no routing rule matched; first salesperson on the rooftop'
    }
  }
  const dueAt = new Date(now.getTime() + RESERVATION_CALLBACK_MINUTES * 60_000)
  const car = vehicleTitle(lead.interestedVehicle)
  const stock = lead.interestedVehicle?.stockNumber ? ` (stock ${lead.interestedVehicle.stockNumber})` : ''

  if (assigneeId && !lead.assignedSalespersonId) {
    await tx.prisma.lead.update({ where: { id: lead.id }, data: { assignedSalespersonId: assigneeId, assignedAt: now, firstResponseDueAt: dueAt } })
    await tx.prisma.leadAssignmentEvent.create({ data: { rooftopId: lead.rooftopId, leadId: lead.id, fromUserId: null, toUserId: assigneeId, actorId: assigneeId, reason, routeKey, assignedAt: now, firstResponseDueAt: dueAt } })
  } else if (lead.assignedSalespersonId) {
    await tx.prisma.lead.update({ where: { id: lead.id }, data: { firstResponseDueAt: dueAt } })
  }
  const task = await tx.prisma.task.create({
    data: {
      rooftopId: lead.rooftopId,
      leadId: lead.id,
      assignedToId: assigneeId,
      title: `Call ${[lead.firstName, lead.lastName].filter(Boolean).join(' ')}: paid ${usd(transaction.capturedCents)} deposit on ${car}`.slice(0, 200),
      description: [
        `${lead.firstName} paid a ${usd(transaction.capturedCents)} refundable deposit online to hold the ${car}${stock}.`,
        'Call within 15 minutes, confirm the unit is held, and book the visit to sign and take delivery.',
        [lead.phone, lead.email].filter(Boolean).join(' · '),
      ].filter(Boolean).join('\n'),
      priority: 'urgent',
      completed: false,
      dueDate: dueAt,
    },
    select: { id: true },
  })
  await recordDomainEventInTransaction(tx, {
    eventKey, rooftopId: lead.rooftopId, aggregateType: 'Lead', aggregateId: lead.id, action: 'reservation-paid', topic: 'lead.reservation-paid', actorId: null,
    afterSnapshot: { transactionId: transaction.id, assigneeId, routeKey, taskId: task.id, dueAt: dueAt.toISOString(), capturedCents: transaction.capturedCents },
    metadata: { taskId: task.id },
    payload: { rooftopId: lead.rooftopId, leadId: lead.id, transactionId: transaction.id, assigneeId, taskId: task.id },
  })
  return { leadId: lead.id, assigneeId, taskId: task.id }
}

/** Confirmation email after the deposit commits. Exactly once per payment; never throws. */
export async function deliverReservationConfirmation(context: any, transactionId: string) {
  const prisma = context.sudo().prisma
  const eventKey = `reservation-confirmation-email:${transactionId}`
  let rooftopId = ''
  try {
    const transaction = await prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
      select: { id: true, rooftopId: true, status: true, sourceType: true, capturedCents: true, lead: { select: { id: true, firstName: true, email: true, assignedSalesperson: { select: { name: true } }, interestedVehicle: { select: { id: true, year: true, make: true, model: true, trim: true, stockNumber: true } } } } },
    })
    if (!transaction || transaction.sourceType !== 'reservation' || transaction.status !== 'captured' || !transaction.lead?.email) return
    rooftopId = transaction.rooftopId
    try {
      await prisma.domainAuditEvent.create({ data: { rooftopId, eventKey, aggregateType: 'PaymentTransaction', aggregateId: transactionId, action: 'confirmation_email', metadata: { status: 'sending' } }, select: { id: true } })
    } catch {
      return // already claimed
    }
    const mark = async (status: string, extra: Record<string, unknown> = {}) => {
      try { await prisma.domainAuditEvent.update({ where: { eventKey }, data: { metadata: { status, ...extra } } }) } catch { /* bookkeeping only */ }
    }
    if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) { await mark('skipped_not_configured'); return }
    const [rooftop, profile] = await Promise.all([
      prisma.rooftop.findUnique({ where: { id: rooftopId }, select: { name: true } }),
      prisma.dealershipProfile.findFirst({ select: { name: true, phone: true, addressLine1: true, city: true, state: true } }),
    ])
    const base = String(process.env.SMTP_STORE_LINK || '').replace(/\/+$/, '')
    const vehicle = transaction.lead.interestedVehicle
    const { sendReservationConfirmationEmail } = await import('./mail')
    const result = await sendReservationConfirmationEmail(transaction.lead.email, {
      dealershipName: rooftop?.name || profile?.name || 'Our dealership',
      customerName: transaction.lead.firstName || 'there',
      vehicle: vehicleTitle(vehicle),
      stockNumber: vehicle?.stockNumber || '',
      depositLabel: usd(transaction.capturedCents),
      salesperson: transaction.lead.assignedSalesperson?.name || '',
      phone: profile?.phone || '',
      address: [profile?.addressLine1, [profile?.city, profile?.state].filter(Boolean).join(', ')].filter(Boolean).join(', '),
      reference: transactionId,
      vehicleUrl: base && vehicle?.id ? `${base}/inventory/${vehicle.id}` : '',
      accountUrl: base ? `${base}/account/vehicles` : '',
    })
    if (result.sent) await mark('sent', { sentAt: new Date().toISOString(), messageId: result.messageId || '' })
    else await mark('failed', { error: result.error || 'send_failed' })
  } catch (error) {
    console.error('Reservation confirmation email failed:', error instanceof Error ? error.message : 'Unknown error')
  }
}
