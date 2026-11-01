import { SERVICE_APPOINTMENT_TRANSITIONS } from '../lifecycle/serviceAppointmentTransitions'
import { permissions } from '../access'
import { domainEventRequestHash, recordDomainEventInTransaction, type DomainEventInput } from '../lifecycle/domainEvents'
import { assertSessionRooftopPermission } from '../tenantRecords'
import { cancelTestDriveInTransaction, TEST_DRIVE_CANCEL_SELECT } from './customerBookings'

function commandKey(value: unknown) {
  const key = String(value || '').trim()
  if (key.length < 8 || key.length > 200) throw new Error('A valid idempotency key is required')
  return key
}

async function replayOrLock(tx: any, event: DomainEventInput) {
  await tx.prisma.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${`command:${event.eventKey}`}, 0))`
  const replay = await tx.prisma.domainAuditEvent.findUnique({ where: { eventKey: event.eventKey }, select: { aggregateId: true } })
  if (!replay) return false
  if (replay.aggregateId !== event.aggregateId) throw new Error('Idempotency key belongs to another record')
  await recordDomainEventInTransaction(tx, event)
  return true
}

const LEAD_TRANSITIONS: Record<string, string[]> = {
  new: ['contacted', 'test-drive-scheduled', 'closed-lost'],
  contacted: ['test-drive-scheduled', 'negotiating', 'closed-won', 'closed-lost'],
  'test-drive-scheduled': ['contacted', 'negotiating', 'closed-won', 'closed-lost'],
  negotiating: ['closed-won', 'closed-lost'],
  'closed-won': [],
  'closed-lost': [],
}

export async function transitionLead(_root: unknown, { id, toStatus, lostReasonCode, lostReasonDetails, idempotencyKey }: any, context: any) {
  if (!context.session?.itemId || !permissions.canManageLeads({ session: context.session })) throw new Error('Lead management permission is required')
  const lead = await context.query.Lead.findOne({ where: { id }, query: 'id status rooftop { id } updatedAt' })
  if (!lead?.rooftop?.id) throw new Error('Lead not found or not accessible')
  await assertSessionRooftopPermission(context, lead.rooftop.id, 'canManageLeads')
  if (!LEAD_TRANSITIONS[lead.status]?.includes(toStatus)) throw new Error(`Invalid lead transition: ${lead.status} -> ${toStatus}`)
  const allowedLostReasons = ['purchased-elsewhere', 'price', 'financing', 'vehicle-unavailable', 'no-response', 'timing', 'other']
  const normalizedLostReason = String(lostReasonCode || '')
  const normalizedLostDetails = String(lostReasonDetails || '').trim().slice(0, 2000)
  if (toStatus === 'closed-lost' && !allowedLostReasons.includes(normalizedLostReason)) throw new Error('A structured lost-sale reason is required')
  if (toStatus !== 'closed-lost' && (normalizedLostReason || normalizedLostDetails)) throw new Error('Lost-sale evidence is only valid for closed-lost')
  const event: DomainEventInput = {
    eventKey: `lead-transition:${commandKey(idempotencyKey)}`,
    rooftopId: lead.rooftop.id,
    aggregateType: 'Lead', aggregateId: id, action: `transitioned:${toStatus}`, topic: 'lead.transitioned',
    actorId: context.session.itemId,
    afterSnapshot: { leadId: id, toStatus, lostReasonCode: normalizedLostReason || null, lostReasonDetails: normalizedLostDetails || null },
    payload: { leadId: id, rooftopId: lead.rooftop.id, status: toStatus, lostReasonCode: normalizedLostReason || null },
  }
  await context.transaction(async (tx: any) => {
    if (await replayOrLock(tx, event)) return
    const changed = await tx.prisma.lead.updateMany({
      where: { id, rooftopId: lead.rooftop.id, status: lead.status, updatedAt: new Date(lead.updatedAt) },
      data: { status: toStatus, lastContact: new Date(), ...(toStatus === 'closed-lost' ? { lostReasonCode: normalizedLostReason, lostReason: normalizedLostDetails || null, cadenceStatus: 'completed', cadenceDueAt: null } : {}) },
    })
    if (changed.count !== 1) throw new Error('Lead changed concurrently; reload and retry')
    await recordDomainEventInTransaction(tx, event)
  }, { timeout: 30_000 })
  return context.db.Lead.findOne({ where: { id } })
}

export async function recordLeadInteraction(_root: unknown, { data }: any, context: any) {
  if (!context.session?.itemId || !permissions.canManageLeads({ session: context.session })) throw new Error('Lead management permission is required')
  const leadId = String(data.leadId || '')
  const lead = await context.query.Lead.findOne({ where: { id: leadId }, query: 'id status firstResponseAt rooftop { id } updatedAt' })
  if (!lead?.rooftop?.id) throw new Error('Lead not found or not accessible')
  await assertSessionRooftopPermission(context, lead.rooftop.id, 'canManageLeads')
  const interactionType = String(data.interactionType || '')
  const outcome = String(data.outcome || '')
  const notes = String(data.notes || '').trim().slice(0, 4000)
  if (!notes) throw new Error('Interaction notes are required')
  const occurredAt = data.date ? new Date(data.date) : new Date()
  if (Number.isNaN(occurredAt.getTime())) throw new Error('Interaction date is invalid')
  const followUpDate = data.followUpDate ? new Date(data.followUpDate) : null
  if (followUpDate && Number.isNaN(followUpDate.getTime())) throw new Error('Follow-up date is invalid')
  const event: DomainEventInput = {
    eventKey: `lead-interaction:${commandKey(data.idempotencyKey)}`,
    rooftopId: lead.rooftop.id,
    aggregateType: 'Lead', aggregateId: leadId, action: 'interaction-recorded', topic: 'lead.interaction-recorded',
    actorId: context.session.itemId,
    afterSnapshot: {
      leadId, interactionType, outcome, notesHash: domainEventRequestHash(notes),
      requestedDate: data.date ? occurredAt.toISOString() : null,
      followUpDate: followUpDate?.toISOString() ?? null,
    },
    payload: { leadId, rooftopId: lead.rooftop.id, interactionType, outcome },
  }
  let interactionId = ''
  await context.transaction(async (tx: any) => {
    await tx.prisma.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${`command:${event.eventKey}`}, 0))`
    const replay = await tx.prisma.domainAuditEvent.findUnique({ where: { eventKey: event.eventKey }, select: { metadata: true } })
    if (replay) {
      const metadata = (replay.metadata || {}) as Record<string, unknown>
      await recordDomainEventInTransaction(tx, { ...event, metadata })
      interactionId = String(metadata.interactionId || '')
      if (!interactionId) throw new Error('Interaction replay evidence is incomplete')
      return
    }
    const interaction = await tx.prisma.customerInteraction.create({
      data: {
        rooftopId: lead.rooftop.id,
        leadId,
        performedById: context.session.itemId,
        interactionType,
        outcome,
        notes,
        date: occurredAt,
        followUpDate,
      },
      select: { id: true },
    })
    interactionId = interaction.id
    const changed = await tx.prisma.lead.updateMany({
      where: { id: leadId, updatedAt: new Date(lead.updatedAt) },
      data: {
        lastContact: occurredAt,
        ...(lead.firstResponseAt ? {} : { firstResponseAt: occurredAt }),
        ...(lead.status === 'new' ? { status: 'contacted' } : {}),
      },
    })
    if (changed.count !== 1) throw new Error('Lead changed concurrently; reload and retry')
    await recordDomainEventInTransaction(tx, { ...event, metadata: { interactionId: interaction.id } })
  }, { timeout: 30_000 })
  return { id: interactionId, leadId }
}

// Staff cancel goes through the same cancelTestDriveInTransaction as the customer's own
// cancel, so the drive ends up the same whoever cancelled it. Only the audit event says
// who: the staff member as actorId, with cancelledBy 'staff'.
async function cancelTestDriveByStaff(context: any, rooftopId: string, id: string, idempotencyKey: unknown) {
  const record = await context.prisma.testDrive.findFirst({ where: { id, rooftopId }, select: TEST_DRIVE_CANCEL_SELECT })
  if (!record) throw new Error('Test drive not found or not accessible')
  const event: DomainEventInput = {
    eventKey: `test-drive:${commandKey(idempotencyKey)}`,
    rooftopId,
    aggregateType: 'TestDrive', aggregateId: id, action: 'staff-cancelled', topic: 'test-drive.staff-cancelled',
    actorId: context.session.itemId,
    afterSnapshot: { id, cancelledBy: 'staff' },
    payload: { id, rooftopId, status: 'cancelled', source: 'operator-desk' },
  }
  await context.transaction(async (tx: any) => {
    if (await replayOrLock(tx, event)) return
    await cancelTestDriveInTransaction(tx, record, 'Only an open test drive that has not started yet can be cancelled')
    await recordDomainEventInTransaction(tx, event)
  }, { timeout: 30_000 })
  return context.db.TestDrive.findOne({ where: { id } })
}

export async function updateTestDriveWorkflow(_root: unknown, { data }: any, context: any) {
  if (!context.session?.itemId || !permissions.canManageLeads({ session: context.session })) throw new Error('Lead management permission is required')
  const id = String(data.id || '')
  const action = String(data.action || '')
  if (!['verify-license', 'complete', 'no-show', 'cancel'].includes(action)) throw new Error('Unsupported test-drive action')
  const drive = await context.query.TestDrive.findOne({ where: { id }, query: 'id completed driverLicenseVerified scheduledTime rooftop { id } lead { id status updatedAt } updatedAt' })
  if (!drive?.rooftop?.id) throw new Error('Test drive not found or not accessible')
  await assertSessionRooftopPermission(context, drive.rooftop.id, 'canManageLeads')
  if (action === 'cancel') return cancelTestDriveByStaff(context, drive.rooftop.id, id, data.idempotencyKey)
  if (drive.completed) throw new Error('Completed test drives are immutable')
  if (action === 'complete' && !drive.driverLicenseVerified) throw new Error('Driver license must be verified before completion')
  if (action === 'no-show' && new Date(drive.scheduledTime).getTime() > Date.now()) throw new Error('A test drive can only be marked no-show after its scheduled time')
  const interestedLevel = String(data.interestedLevel || 'maybe')
  if (action === 'complete' && !['not-interested', 'maybe', 'very-interested'].includes(interestedLevel)) throw new Error('Interest level is invalid')
  const targetLeadStatus = interestedLevel === 'very-interested' ? 'negotiating' : 'contacted'
  if (action === 'complete' && drive.lead?.id && drive.lead.status !== targetLeadStatus && !LEAD_TRANSITIONS[drive.lead.status]?.includes(targetLeadStatus)) {
    throw new Error(`Test drive cannot move lead from ${drive.lead.status} to ${targetLeadStatus}`)
  }
  const event: DomainEventInput = {
    eventKey: `test-drive:${commandKey(data.idempotencyKey)}`,
    rooftopId: drive.rooftop.id,
    aggregateType: 'TestDrive', aggregateId: id, action, topic: `test-drive.${action}`,
    actorId: context.session.itemId,
    afterSnapshot: { testDriveId: id, action, interestedLevel: action === 'complete' ? interestedLevel : null },
    payload: { testDriveId: id, rooftopId: drive.rooftop.id, action },
  }
  await context.transaction(async (tx: any) => {
    if (await replayOrLock(tx, event)) return
    const now = new Date()
    const changed = await tx.prisma.testDrive.updateMany({
      where: { id, updatedAt: new Date(drive.updatedAt), completed: false },
      data: action === 'verify-license'
        ? { driverLicenseVerified: true }
        : action === 'no-show'
          ? { completed: true, noShow: true }
          : { completed: true, interestedLevel, feedback: String(data.feedback || '').trim().slice(0, 4000) },
    })
    if (changed.count !== 1) throw new Error('Test drive changed concurrently; reload and retry')
    if (action === 'complete' && drive.lead?.id) {
      const leadChanged = await tx.prisma.lead.updateMany({
        where: { id: drive.lead.id, rooftopId: drive.rooftop.id, status: drive.lead.status, updatedAt: new Date(drive.lead.updatedAt) },
        data: { status: targetLeadStatus, lastContact: now },
      })
      if (leadChanged.count !== 1) throw new Error('Lead changed concurrently; reload and retry')
    }
    await recordDomainEventInTransaction(tx, event)
  }, { timeout: 30_000 })
  return context.db.TestDrive.findOne({ where: { id } })
}

const APPOINTMENT_TRANSITIONS = SERVICE_APPOINTMENT_TRANSITIONS

export async function transitionServiceAppointment(_root: unknown, { id, toStatus, idempotencyKey }: any, context: any) {
  if (!context.session?.itemId || !permissions.canManageService({ session: context.session })) throw new Error('Service management permission is required')
  const appointment = await context.query.ServiceAppointment.findOne({ where: { id }, query: 'id status rooftop { id } updatedAt' })
  if (!appointment?.rooftop?.id) throw new Error('Service appointment not found or not accessible')
  await assertSessionRooftopPermission(context, appointment.rooftop.id, 'canManageService')
  if (!APPOINTMENT_TRANSITIONS[appointment.status]?.includes(toStatus)) throw new Error(`Invalid service appointment transition: ${appointment.status} -> ${toStatus}`)
  const event: DomainEventInput = {
    eventKey: `service-appointment:${commandKey(idempotencyKey)}`,
    rooftopId: appointment.rooftop.id,
    aggregateType: 'ServiceAppointment', aggregateId: id, action: `transitioned:${toStatus}`, topic: 'service-appointment.transitioned',
    actorId: context.session.itemId,
    afterSnapshot: { appointmentId: id, toStatus },
    payload: { appointmentId: id, rooftopId: appointment.rooftop.id, status: toStatus },
  }
  await context.transaction(async (tx: any) => {
    if (await replayOrLock(tx, event)) return
    const changed = await tx.prisma.serviceAppointment.updateMany({
      where: { id, status: appointment.status, updatedAt: new Date(appointment.updatedAt) },
      data: { status: toStatus },
    })
    if (changed.count !== 1) throw new Error('Service appointment changed concurrently; reload and retry')
    await recordDomainEventInTransaction(tx, event)
  }, { timeout: 30_000 })
  return context.db.ServiceAppointment.findOne({ where: { id } })
}

export async function recordTradeInAppraisal(_root: unknown, { data }: any, context: any) {
  if (!context.session?.itemId || !permissions.canManageTradeIns({ session: context.session })) throw new Error('Trade-in management permission is required')
  const id = String(data.id || '')
  const tradeIn = await context.query.TradeIn.findOne({ where: { id }, query: 'id rooftop { id } deal { id } updatedAt' })
  if (!tradeIn?.rooftop?.id) throw new Error('Trade-in not found or not accessible')
  await assertSessionRooftopPermission(context, tradeIn.rooftop.id, 'canManageTradeIns')
  if (tradeIn.deal?.id) throw new Error('Attached trade-in appraisal is immutable')
  const referenceValueCents = Number(data.referenceValueCents ?? 0)
  const offerAmountCents = Number(data.offerAmountCents ?? 0)
  if (![referenceValueCents, offerAmountCents].every(value => Number.isInteger(value) && value >= 0)) throw new Error('Appraisal values must be non-negative integer cents')
  const event: DomainEventInput = {
    eventKey: `trade-in-appraisal:${commandKey(data.idempotencyKey)}`,
    rooftopId: tradeIn.rooftop.id,
    aggregateType: 'TradeIn', aggregateId: id, action: 'appraised', topic: 'trade-in.appraised',
    actorId: context.session.itemId,
    afterSnapshot: { tradeInId: id, referenceValueCents, offerAmountCents, valuationSource: 'operator-recorded' },
    payload: { tradeInId: id, rooftopId: tradeIn.rooftop.id, referenceValueCents, offerAmountCents, valuationSource: 'operator-recorded' },
  }
  await context.transaction(async (tx: any) => {
    if (await replayOrLock(tx, event)) return
    const changed = await tx.prisma.tradeIn.updateMany({
      where: { id, updatedAt: new Date(tradeIn.updatedAt), deal: { is: null } },
      data: { kbbValueCents: referenceValueCents, offerAmountCents, appraisedById: context.session.itemId },
    })
    if (changed.count !== 1) throw new Error('Trade-in changed concurrently; reload and retry')
    await recordDomainEventInTransaction(tx, event)
  }, { timeout: 30_000 })
  return context.db.TradeIn.findOne({ where: { id } })
}

export async function createLeadTask(_root: unknown, { data }: any, context: any) {
  if (!context.session?.itemId || !permissions.canManageTasks({ session: context.session })) throw new Error('Task management permission is required')
  const leadId = String(data.leadId || '')
  const lead = await context.query.Lead.findOne({ where: { id: leadId }, query: 'id rooftop { id } assignedSalesperson { id } customer { id emailConsent smsConsent phoneConsent emailSuppressed smsSuppressed phoneSuppressed }' })
  if (!lead?.rooftop?.id) throw new Error('Lead not found or not accessible')
  await assertSessionRooftopPermission(context, lead.rooftop.id, ['canManageLeads', 'canManageFinancing', 'canManageService'])
  const communicationChannel = String(data.communicationChannel || 'internal')
  if (!['internal', 'email', 'sms', 'phone'].includes(communicationChannel)) throw new Error('Task communication channel is invalid')
  if (communicationChannel !== 'internal') {
    const consent = lead.customer?.[`${communicationChannel}Consent`] === true
    const suppressed = lead.customer?.[`${communicationChannel}Suppressed`] === true
    if (!consent || suppressed) throw new Error(`Customer ${communicationChannel} contact is not permitted`)
  }
  const title = String(data.title || '').trim().slice(0, 200)
  const description = String(data.description || '').trim().slice(0, 4000)
  const priority = String(data.priority || 'medium')
  if (!title) throw new Error('Task title is required')
  if (!['low', 'medium', 'high', 'urgent'].includes(priority)) throw new Error('Task priority is invalid')
  const dueDate = data.dueDate ? (data.dueDate instanceof Date ? data.dueDate : new Date(data.dueDate)) : null
  if (dueDate && Number.isNaN(dueDate.getTime())) throw new Error('Task due date is invalid')
  const assignedToId = String(data.assignedToId || lead.assignedSalesperson?.id || context.session.itemId)
  const event: DomainEventInput = {
    eventKey: `task-create:${commandKey(data.idempotencyKey)}`,
    rooftopId: lead.rooftop.id,
    aggregateType: 'Lead', aggregateId: leadId, action: 'task-created', topic: 'lead.task-created', actorId: context.session.itemId,
    afterSnapshot: { leadId, title, descriptionHash: domainEventRequestHash(description), priority, communicationChannel, dueDate: dueDate?.toISOString() ?? null, assignedToId },
    payload: { leadId, rooftopId: lead.rooftop.id, title, priority, communicationChannel, dueDate: dueDate?.toISOString() ?? null, assignedToId },
  }
  let taskId = ''
  await context.transaction(async (tx: any) => {
    await tx.prisma.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${`command:${event.eventKey}`}, 0))`
    const replay = await tx.prisma.domainAuditEvent.findUnique({ where: { eventKey: event.eventKey }, select: { metadata: true } })
    if (replay) {
      await recordDomainEventInTransaction(tx, { ...event, metadata: replay.metadata })
      taskId = String((replay.metadata as any)?.taskId || '')
      if (!taskId) throw new Error('Task replay evidence is incomplete')
      return
    }
    const [groupAccess, directAccess] = await Promise.all([
      tx.prisma.dealerGroupMembership.count({ where: { userId: assignedToId, status: 'active', accessAllRooftops: true, dealerGroup: { rooftops: { some: { id: lead.rooftop.id } } } } }),
      tx.prisma.rooftopMembership.count({ where: { userId: assignedToId, status: 'active', rooftopId: lead.rooftop.id } }),
    ])
    if (groupAccess === 0 && directAccess === 0) throw new Error('Task assignee must have active rooftop access')
    const task = await tx.prisma.task.create({ data: { rooftopId: lead.rooftop.id, leadId, assignedToId, title, description, priority, completed: false, dueDate }, select: { id: true } })
    taskId = task.id
    await recordDomainEventInTransaction(tx, { ...event, metadata: { taskId } })
  }, { timeout: 30_000 })
  return context.db.Task.findOne({ where: { id: taskId } })
}

export async function completeTask(_root: unknown, { id, idempotencyKey }: any, context: any) {
  if (!context.session?.itemId || !permissions.canManageTasks({ session: context.session })) throw new Error('Task management permission is required')
  const task = await context.query.Task.findOne({ where: { id }, query: 'id completed rooftop { id } updatedAt' })
  if (!task?.rooftop?.id) throw new Error('Task not found or not accessible')
  await assertSessionRooftopPermission(context, task.rooftop.id, ['canManageLeads', 'canManageFinancing', 'canManageService'])
  const event: DomainEventInput = {
    eventKey: `task-complete:${commandKey(idempotencyKey)}`,
    rooftopId: task.rooftop.id,
    aggregateType: 'Task', aggregateId: id, action: 'completed', topic: 'task.completed',
    actorId: context.session.itemId,
    afterSnapshot: { taskId: id, completed: true },
    payload: { taskId: id, rooftopId: task.rooftop.id, completed: true },
  }
  await context.transaction(async (tx: any) => {
    if (await replayOrLock(tx, event)) return
    if (!task.completed) {
      const changed = await tx.prisma.task.updateMany({ where: { id, updatedAt: new Date(task.updatedAt), completed: false }, data: { completed: true, completedDate: new Date() } })
      if (changed.count !== 1) throw new Error('Task changed concurrently; reload and retry')
    }
    await recordDomainEventInTransaction(tx, event)
  }, { timeout: 30_000 })
  return context.db.Task.findOne({ where: { id } })
}
