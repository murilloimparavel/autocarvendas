import { SERVICE_APPOINTMENT_TRANSITIONS } from '@/features/keystone/lifecycle/serviceAppointmentTransitions'
import type { DeskTone } from '@/features/platform/components/desk'
import { recordReference } from '@/features/platform/lib/format'

const serviceTermsPt: Record<string, string> = {
  Scheduled: 'Agendado', 'Checked in': 'Recepcionado', 'In progress': 'Em andamento',
  'Waiting parts': 'Aguardando peças', Completed: 'Concluído', Cancelled: 'Cancelado',
  'Check in': 'Recepcionar', 'Start work': 'Iniciar serviço', 'Complete': 'Concluir', Cancel: 'Cancelar',
  Estimate: 'Orçamento', Approved: 'Aprovado', Invoiced: 'Faturado', Paid: 'Pago',
  'Approve repair': 'Aprovar serviço', 'Start repair': 'Iniciar serviço',
  'Complete repair': 'Concluir serviço', Invoice: 'Faturar', 'Mark paid': 'Marcar como pago',
  Open: 'Aberto', Dispatched: 'Designado', Paused: 'Pausado', Dispatch: 'Designar', Start: 'Iniciar',
  Labor: 'Mão de obra', Part: 'Peça', Sublet: 'Serviço terceirizado', Maintenance: 'Manutenção',
  Repair: 'Reparo', Warranty: 'Garantia', Recall: 'Recall', Inspection: 'Inspeção',
  Diagnostic: 'Diagnóstico', None: 'Nenhum', Waiter: 'Aguardar na loja', Shuttle: 'Transporte',
  Loaner: 'Veículo cortesia', Rental: 'Locação', 'Drop-off': 'Deixar o veículo',
}

/** Translate only known interface enum labels; never pass customer or staff authored text here. */
export function serviceLabel(locale: 'pt-BR' | 'en-US', label: string) {
  return locale === 'pt-BR' ? serviceTermsPt[label] || label : label
}

export const APPOINTMENT_STATUSES = ['scheduled', 'checked-in', 'in-progress', 'waiting-parts', 'completed', 'cancelled']

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  'checked-in': 'Checked in',
  'in-progress': 'In progress',
  'waiting-parts': 'Waiting parts',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

/** Button labels for each appointment transition. */
export const APPOINTMENT_ACTION_LABELS: Record<string, string> = {
  'checked-in': 'Check in',
  'in-progress': 'Start work',
  'waiting-parts': 'Waiting parts',
  completed: 'Complete',
  cancelled: 'Cancel',
}

export function appointmentTransitions(status: string | null | undefined) {
  return APPOINTMENT_STATUSES.filter(next => (SERVICE_APPOINTMENT_TRANSITIONS[status || ''] || []).includes(next))
}

export const ORDER_STATUSES = ['estimate', 'approved', 'in-progress', 'completed', 'invoiced', 'paid', 'cancelled'] as const

export const ORDER_STATUS_LABELS: Record<string, string> = {
  estimate: 'Estimate',
  approved: 'Approved',
  'in-progress': 'In progress',
  completed: 'Completed',
  invoiced: 'Invoiced',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

export const ORDER_ACTION_LABELS: Record<string, string> = {
  approved: 'Approve repair',
  'in-progress': 'Start repair',
  completed: 'Complete repair',
  invoiced: 'Invoice',
  paid: 'Mark paid',
}

export const NEXT_ORDER_STATUS: Record<string, string | undefined> = {
  estimate: 'approved',
  approved: 'in-progress',
  'in-progress': 'completed',
  completed: 'invoiced',
  invoiced: 'paid',
}

export const STATUS_TONES: Record<string, DeskTone> = {
  scheduled: 'info',
  'checked-in': 'info',
  estimate: 'idle',
  approved: 'info',
  'in-progress': 'warn',
  'waiting-parts': 'warn',
  completed: 'ok',
  invoiced: 'info',
  paid: 'ok',
  cancelled: 'bad',
}

export const LABOR_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  dispatched: 'Dispatched',
  'in-progress': 'In progress',
  paused: 'Paused',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const LABOR_TONES: Record<string, DeskTone> = {
  open: 'idle',
  dispatched: 'info',
  'in-progress': 'warn',
  paused: 'warn',
  completed: 'ok',
  cancelled: 'bad',
}

export const SERVICE_TYPE_OPTIONS = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'repair', label: 'Repair' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'recall', label: 'Recall' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'diagnostic', label: 'Diagnostic' },
]

export const TRANSPORTATION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'waiter', label: 'Waiter' },
  { value: 'shuttle', label: 'Shuttle' },
  { value: 'loaner', label: 'Loaner' },
  { value: 'rental', label: 'Rental' },
  { value: 'drop-off', label: 'Drop-off' },
]

export const LINE_TYPE_LABELS: Record<string, string> = { labor: 'Labor', part: 'Part', sublet: 'Sublet' }

/** Display reference only; a sequential RO number needs a schema field. */
export function roReference(id: string) {
  return recordReference('RO', id) || 'RO'
}

export function customerName(lead: { firstName: string | null; lastName: string | null; email: string | null } | null | undefined) {
  if (!lead) return null
  return [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || 'Customer'
}

export const ORDER_EDITABLE_STATUSES = ['estimate', 'approved', 'in-progress']

/** Mirrors the gates in transitionServiceOrder.ts; returns the reason the move is blocked, or null. */
export function orderTransitionBlock(
  order: {
    status: string | null
    concern: string | null
    cause: string | null
    correction: string | null
    authorizationStatus: string | null
    invoiceNumber: string | null
    grandTotalCents: number | null
    laborOperations: Array<{ status: string }>
    payments: Array<{ status: string; capturedCents: number; refundedCents: number; providerTransactionId: string | null }> | null
  },
  toStatus: string,
): string | null {
  if (NEXT_ORDER_STATUS[order.status || ''] !== toStatus) return `Not available from ${ORDER_STATUS_LABELS[order.status || ''] || order.status}`
  if (toStatus === 'approved') {
    if (!String(order.concern || '').trim()) return 'Record the customer concern first'
    if (order.authorizationStatus !== 'authorized') return 'Customer authorization is required'
  }
  if (toStatus === 'completed') {
    if (!String(order.cause || '').trim() || !String(order.correction || '').trim()) return 'Record cause and correction first'
    if (order.laborOperations.some(operation => !['completed', 'cancelled'].includes(operation.status))) return 'Complete or cancel every labor operation first'
  }
  if (toStatus === 'paid') {
    if (order.payments === null) return 'Requires reporting and dealership management permission'
    const net = settledNetCents(order.payments)
    if (net < (order.grandTotalCents ?? 0)) return 'Verified payments do not cover the invoice total'
  }
  return null
}

/** Net captured, provider-verified service payments, as serviceSettlementEvidence counts them. */
export function settledNetCents(payments: Array<{ status: string; capturedCents: number; refundedCents: number; providerTransactionId: string | null }>) {
  return payments
    .filter(payment => ['captured', 'partially-refunded'].includes(payment.status) && payment.providerTransactionId && payment.capturedCents >= payment.refundedCents && payment.refundedCents >= 0)
    .reduce((sum, payment) => sum + payment.capturedCents - payment.refundedCents, 0)
}

export type LaborAction = 'dispatch' | 'start' | 'pause' | 'complete' | 'cancel'

export const LABOR_ACTION_LABELS: Record<LaborAction, string> = {
  dispatch: 'Dispatch',
  start: 'Start',
  pause: 'Pause',
  complete: 'Complete',
  cancel: 'Cancel',
}

const LABOR_ALLOWED: Record<string, LaborAction[]> = {
  open: ['dispatch', 'cancel'],
  dispatched: ['start', 'cancel'],
  'in-progress': ['pause', 'complete'],
  paused: ['start', 'complete', 'cancel'],
}

/** Actions the labor op's status allows, each with the server's blocking reason or null (fixedOpsOperations.ts). */
export function laborActions(order: { status: string | null; authorizationStatus: string | null }, operationStatus: string) {
  return (LABOR_ALLOWED[operationStatus] || []).map(action => {
    let blocked: string | null = null
    if (!ORDER_EDITABLE_STATUSES.includes(order.status || '')) blocked = 'Labor is locked after completion'
    else if (['start', 'pause', 'complete'].includes(action) && (!['approved', 'in-progress'].includes(order.status || '') || order.authorizationStatus !== 'authorized')) blocked = 'Requires an authorized, approved repair'
    return { action, blocked }
  })
}
