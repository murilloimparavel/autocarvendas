import { SERVICE_APPOINTMENT_TRANSITIONS } from '../lifecycle/serviceAppointmentTransitions'
import { recordDomainEventInTransaction, type DomainEventInput } from '../lifecycle/domainEvents'
import { assertServiceSlotCapacity, assertTestDriveVehicleCapacity } from './bookingCapacity'
import { customerOwnership, ownedServiceAppointmentWhere, ownedTestDriveWhere, requireCustomerAccount } from './customerOwnership'
import { serviceAppointmentActions, testDriveActions } from './customerRecords'
import { parseScheduledTime } from './submissionUtils'

// Customer self-service for upcoming bookings. Ownership comes from customerOwnership
// (session account only). Lifecycle rules:
//   - service: only a `scheduled` appointment (the vehicle is not in the shop yet); cancel
//     uses the existing scheduled -> cancelled transition, reschedule keeps `scheduled`
//     and re-checks the hourly slot capacity;
//   - test drive: only an open (not completed, no-show or cancelled) future drive; cancel
//     closes it like a no-show (completed + cancelledAt), reschedule re-checks the vehicle.
// Every write is optimistic on updatedAt and audited with the caller's idempotency key.

type BookingKind = 'test-drive' | 'service'

function bookingKind(value: unknown): BookingKind {
  const kind = String(value || '')
  if (kind !== 'test-drive' && kind !== 'service') throw new Error('Unsupported booking')
  return kind
}

function customerKey(value: unknown) {
  const key = String(value || '').trim()
  if (key.length < 8 || key.length > 180 || !/^[a-zA-Z0-9:_-]+$/.test(key)) throw new Error('A valid idempotency key is required')
  return key
}

async function replayOrLock(tx: any, event: DomainEventInput) {
  await tx.prisma.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${`command:${event.eventKey}`}, 0))`
  const replay = await tx.prisma.domainAuditEvent.findUnique({ where: { eventKey: event.eventKey }, select: { aggregateId: true } })
  if (!replay) return false
  if (replay.aggregateId !== event.aggregateId) throw new Error('Idempotency key belongs to another booking')
  await recordDomainEventInTransaction(tx, event)
  return true
}

async function ownedBooking(context: any, accountId: string, kind: BookingKind, id: string) {
  const ownership = await customerOwnership(context.prisma, accountId)
  if (kind === 'test-drive') {
    const drive = await context.prisma.testDrive.findFirst({
      where: { AND: [{ id }, ownedTestDriveWhere(ownership)] },
      select: TEST_DRIVE_CANCEL_SELECT,
    })
    if (!drive) throw new Error('Booking not found')
    return { kind, record: drive }
  }
  const appointment = await context.prisma.serviceAppointment.findFirst({
    where: { AND: [{ id }, ownedServiceAppointmentWhere(ownership)] },
    select: { id: true, rooftopId: true, appointmentDate: true, status: true, updatedAt: true },
  })
  if (!appointment) throw new Error('Booking not found')
  return { kind, record: appointment }
}

export const TEST_DRIVE_CANCEL_SELECT = { id: true, rooftopId: true, vehicleId: true, scheduledTime: true, completed: true, noShow: true, cancelledAt: true, updatedAt: true } as const

/**
 * The one way a test drive gets cancelled, whether the customer or staff cancels it.
 * Run inside a transaction. Only an open, future drive can be cancelled. The drive
 * is closed with cancelledAt set, which also frees the vehicle's slot: the capacity
 * check skips drives where cancelledAt is set. The caller records the audit event.
 */
export async function cancelTestDriveInTransaction(
  tx: any,
  record: { id: string; updatedAt: Date | string; scheduledTime: Date | string | null; completed?: boolean; noShow?: boolean; cancelledAt?: Date | string | null },
  refusal: string,
) {
  if (!testDriveActions(record).canCancel) throw new Error(refusal)
  const changed = await tx.prisma.testDrive.updateMany({
    where: { id: record.id, completed: false, cancelledAt: null, updatedAt: record.updatedAt },
    data: { completed: true, cancelledAt: new Date() },
  })
  if (changed.count !== 1) throw new Error('This test drive just changed. Reload and try again.')
}

export async function cancelCustomerBooking(_root: unknown, { kind, id, idempotencyKey }: { kind: string; id: string; idempotencyKey: string }, context: any) {
  const accountId = requireCustomerAccount(context)
  const bookingType = bookingKind(kind)
  const key = customerKey(idempotencyKey)
  const { record } = await ownedBooking(context, accountId, bookingType, String(id || ''))
  const event: DomainEventInput = {
    eventKey: `customer-booking-cancel:${key}`,
    rooftopId: record.rooftopId,
    aggregateType: bookingType === 'service' ? 'ServiceAppointment' : 'TestDrive',
    aggregateId: record.id,
    action: bookingType === 'service' ? 'transitioned:cancelled' : 'customer-cancelled',
    topic: bookingType === 'service' ? 'service-appointment.transitioned' : 'test-drive.customer-cancelled',
    actorId: accountId,
    afterSnapshot: { id: record.id, cancelledBy: 'customer' },
    payload: { id: record.id, rooftopId: record.rooftopId, status: 'cancelled', source: 'storefront-account' },
  }
  await context.transaction(async (tx: any) => {
    if (await replayOrLock(tx, event)) return
    if (bookingType === 'service') {
      if (!serviceAppointmentActions(record).canCancel || !SERVICE_APPOINTMENT_TRANSITIONS[record.status]?.includes('cancelled')) {
        throw new Error('This appointment can no longer be cancelled online. Contact the service department.')
      }
      const changed = await tx.prisma.serviceAppointment.updateMany({
        where: { id: record.id, status: record.status, updatedAt: record.updatedAt },
        data: { status: 'cancelled' },
      })
      if (changed.count !== 1) throw new Error('This appointment just changed. Reload and try again.')
    } else {
      await cancelTestDriveInTransaction(tx, record, 'This test drive can no longer be cancelled online. Contact the dealership.')
    }
    await recordDomainEventInTransaction(tx, event)
  }, { timeout: 30_000 })
  return { id: record.id, kind: bookingType, status: 'cancelled' }
}

export async function rescheduleCustomerBooking(
  _root: unknown,
  { kind, id, date, time, idempotencyKey }: { kind: string; id: string; date: string; time: string; idempotencyKey: string },
  context: any,
) {
  const accountId = requireCustomerAccount(context)
  const bookingType = bookingKind(kind)
  const key = customerKey(idempotencyKey)
  const { record } = await ownedBooking(context, accountId, bookingType, String(id || ''))
  const location = await context.prisma.rooftop.findUnique({ where: { id: record.rooftopId }, select: { timezone: true } })
  const scheduled = parseScheduledTime(date, time, bookingType === 'service' ? 'Appointment' : 'Test drive', location?.timezone || 'UTC')
  if (new Date(scheduled.iso).getTime() <= Date.now()) throw new Error('Choose a future time.')
  const event: DomainEventInput = {
    eventKey: `customer-booking-reschedule:${key}`,
    rooftopId: record.rooftopId,
    aggregateType: bookingType === 'service' ? 'ServiceAppointment' : 'TestDrive',
    aggregateId: record.id,
    action: 'customer-rescheduled',
    topic: bookingType === 'service' ? 'service-appointment.customer-rescheduled' : 'test-drive.customer-rescheduled',
    actorId: accountId,
    afterSnapshot: { id: record.id, scheduledAt: scheduled.iso },
    payload: { id: record.id, rooftopId: record.rooftopId, scheduledAt: scheduled.iso, source: 'storefront-account' },
  }
  await context.transaction(async (tx: any) => {
    if (await replayOrLock(tx, event)) return
    if (bookingType === 'service') {
      if (!serviceAppointmentActions(record).canReschedule) throw new Error('This appointment can no longer be rescheduled online. Contact the service department.')
      const capacitySlot = await assertServiceSlotCapacity(tx, record.rooftopId, scheduled.iso, record.id)
      const changed = await tx.prisma.serviceAppointment.updateMany({
        where: { id: record.id, status: 'scheduled', updatedAt: record.updatedAt },
        data: { appointmentDate: new Date(scheduled.iso), capacitySlot },
      })
      if (changed.count !== 1) throw new Error('This appointment just changed. Reload and try again.')
    } else {
      if (!testDriveActions(record).canReschedule) throw new Error('This test drive can no longer be rescheduled online. Contact the dealership.')
      const vehicleId = (record as any).vehicleId
      if (vehicleId) await assertTestDriveVehicleCapacity(tx, vehicleId, scheduled.iso, record.id)
      const changed = await tx.prisma.testDrive.updateMany({
        where: { id: record.id, completed: false, cancelledAt: null, updatedAt: record.updatedAt },
        data: { scheduledTime: new Date(scheduled.iso) },
      })
      if (changed.count !== 1) throw new Error('This test drive just changed. Reload and try again.')
    }
    await recordDomainEventInTransaction(tx, event)
  }, { timeout: 30_000 })
  return { id: record.id, kind: bookingType, status: bookingType === 'service' ? 'scheduled' : 'requested', scheduledAt: new Date(scheduled.iso) }
}
