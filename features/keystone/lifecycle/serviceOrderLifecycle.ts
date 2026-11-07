import { moneyToCents } from './dealLifecycle'

export const SERVICE_ORDER_STATUSES = [
  'estimate',
  'approved',
  'in-progress',
  'completed',
  'invoiced',
  'paid',
  'cancelled',
] as const

export type ServiceOrderStatus = typeof SERVICE_ORDER_STATUSES[number]

const SERVICE_ORDER_TRANSITIONS: Record<ServiceOrderStatus, readonly ServiceOrderStatus[]> = {
  estimate: ['approved'],
  approved: ['in-progress'],
  'in-progress': ['completed'],
  completed: ['invoiced'],
  invoiced: ['paid'],
  paid: [],
  // Reached only by the payment webhook when the whole invoice is refunded (house rule); never by a staff transition.
  cancelled: [],
}

export const SERVICE_ORDER_EVIDENCE_FIELDS = [
  'appointment',
  'concern',
  'cause',
  'correction',
  'payType',
  'authorizationStatus',
  'authorizationEvidence',
  'inspectionEvidence',
  'declinedWork',
  'invoiceNumber',
  'laborOperations',
  'partsMovements',
  'diagnosis',
  'workPerformed',
  'recommendations',
  'laborTotal',
  'partsTotal',
  'tax',
  'grandTotal',
  'completedAt',
  'evidenceSnapshot',
  'lockedAt',
  'settledAt',
] as const

export function isServiceOrderStatus(value: unknown): value is ServiceOrderStatus {
  return typeof value === 'string' && SERVICE_ORDER_STATUSES.includes(value as ServiceOrderStatus)
}

export function isServiceOrderEvidenceLocked(status: unknown) {
  return status === 'completed' || status === 'invoiced' || status === 'paid' || status === 'cancelled'
}

export function assertServiceOrderTransition(current: unknown, next: unknown) {
  if (!isServiceOrderStatus(current) || !isServiceOrderStatus(next)) {
    throw new Error('Invalid service order status transition')
  }
  if (!SERVICE_ORDER_TRANSITIONS[current].includes(next)) {
    throw new Error(`Service order cannot transition from ${current} to ${next}`)
  }
}

export function buildServiceOrderEvidenceSnapshot(order: Record<string, any>) {
  return {
    version: 2,
    appointmentId: order.appointment?.id || null,
    concern: String(order.concern || ''),
    cause: String(order.cause || ''),
    correction: String(order.correction || ''),
    payType: order.payType || 'customer',
    authorizationStatus: order.authorizationStatus || 'pending',
    authorizationEvidence: order.authorizationEvidence || {},
    inspectionEvidence: order.inspectionEvidence || [],
    declinedWork: order.declinedWork || [],
    invoiceNumber: String(order.invoiceNumber || ''),
    diagnosis: String(order.diagnosis || ''),
    workPerformed: String(order.workPerformed || ''),
    recommendations: String(order.recommendations || ''),
    laborTotalCents: moneyToCents(order.laborTotal),
    partsTotalCents: moneyToCents(order.partsTotal),
    taxCents: moneyToCents(order.tax),
    grandTotalCents: moneyToCents(order.grandTotal),
    laborOperations: (order.laborOperations || []).map((operation: Record<string, any>) => ({ id: operation.id, operationCode: operation.operationCode, description: operation.description, status: operation.status, technicianId: operation.technician?.id || null, soldHours: operation.soldHours, actualMinutes: operation.actualMinutes, timePunches: operation.timePunches, startedAt: operation.startedAt, completedAt: operation.completedAt })),
    partsMovements: (order.partsMovements || []).map((movement: Record<string, any>) => ({ id: movement.id, partId: movement.part?.id || null, partNumber: movement.part?.partNumber || null, movementType: movement.movementType, quantityDelta: movement.quantityDelta, onHandAfter: movement.onHandAfter, committedAfter: movement.committedAfter, onOrderAfter: movement.onOrderAfter, reference: movement.reference, reason: movement.reason, occurredAt: movement.occurredAt })),
    lineItems: (order.lineItems || []).map((line: Record<string, any>) => ({
      id: line.id,
      itemType: line.itemType || null,
      description: line.description || '',
      partNumber: line.partNumber || '',
      quantity: Number(line.quantity || 0),
      unitPriceCents: moneyToCents(line.unitPrice),
      priceCents: moneyToCents(line.price),
      costCents: moneyToCents(line.cost),
    })),
  }
}
