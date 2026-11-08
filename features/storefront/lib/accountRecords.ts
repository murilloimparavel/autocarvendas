import { storefrontCurrency } from './format'
import type { CustomerRequestKind } from './customerRequests'

export type Tone = 'ok' | 'warn' | 'bad' | 'accent' | 'idle'

const OK_STATUSES = new Set(['completed', 'appraised', 'approved', 'funded', 'won', 'closed-won', 'sold', 'delivered', 'captured', 'fulfilled', 'paid', 'invoiced', 'financed'])
const BAD_STATUSES = new Set(['cancelled', 'canceled', 'declined', 'rejected', 'lost', 'closed-lost', 'no-show', 'expired', 'failed', 'refunded'])
// Closed without an outcome either way (a trade-in request whose lead was closed).
const IDLE_STATUSES = new Set(['closed'])
const ACTIVE_STATUSES = new Set(['checked-in', 'in-progress', 'waiting-parts', 'contacted', 'qualified', 'in-review', 'under-review', 'reviewing', 'submitted-to-lender', 'conditional', 'arrived', 'ready', 'pending', 'authorized', 'partially-refunded', 'submitted', 'negotiating', 'test-drive-scheduled'])

export function statusTone(status: string | null | undefined): Tone {
  const key = String(status || '').trim().toLowerCase().replaceAll(' ', '-').replaceAll('_', '-')
  if (!key) return 'idle'
  if (IDLE_STATUSES.has(key)) return 'idle'
  if (OK_STATUSES.has(key)) return 'ok'
  if (BAD_STATUSES.has(key)) return 'bad'
  if (ACTIVE_STATUSES.has(key)) return 'accent'
  return 'warn'
}

export function statusLabel(status: string | null | undefined, locale: 'pt-BR' | 'en-US' = 'en-US') {
  const label = String(status || '').trim().replaceAll('-', ' ').replaceAll('_', ' ')
  if (locale === 'pt-BR') {
    const normalized = label.toLowerCase()
    const labels: Record<string, string> = {
      completed: 'Concluído', appraised: 'Avaliado', approved: 'Aprovado', funded: 'Financiado', won: 'Ganho', 'closed won': 'Ganho', sold: 'Vendido', delivered: 'Entregue', captured: 'Pago', fulfilled: 'Concluído', paid: 'Pago', invoiced: 'Faturado', financed: 'Financiado',
      cancelled: 'Cancelado', canceled: 'Cancelado', declined: 'Recusado', rejected: 'Rejeitado', lost: 'Perdido', 'closed lost': 'Perdido', 'no show': 'Não compareceu', expired: 'Expirado', failed: 'Falhou', refunded: 'Reembolsado', closed: 'Encerrado',
      'checked in': 'Recebido na oficina', 'in progress': 'Em andamento', 'waiting parts': 'Aguardando peças', contacted: 'Contatado', qualified: 'Qualificado', 'in review': 'Em análise', 'under review': 'Em análise', reviewing: 'Em análise', 'submitted to lender': 'Enviado à financeira', conditional: 'Aprovado com condições', arrived: 'Chegou', ready: 'Pronto', pending: 'Pendente', authorized: 'Autorizado', 'partially refunded': 'Parcialmente reembolsado', submitted: 'Enviado', negotiating: 'Em negociação', 'test drive scheduled': 'Test-drive agendado', estimate: 'Orçamento',
    }
    return labels[normalized] || (label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Status indisponível')
  }
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Status unavailable'
}

const ROUTE_PREFIX: Record<CustomerRequestKind, string> = {
  inquiry: 'inq',
  'test-drive': 'td',
  'trade-in': 'trade',
  financing: 'fin',
  service: 'svc',
}

export function isCustomerRequestKind(value: unknown): value is CustomerRequestKind {
  return typeof value === 'string' && value in ROUTE_PREFIX
}

export function customerRequestPath(kind: CustomerRequestKind, id: string) {
  return `/account/requests/${ROUTE_PREFIX[kind]}-${encodeURIComponent(id)}`
}

export function parseCustomerRequestRef(ref: string): { kind: CustomerRequestKind; id: string } | null {
  const decoded = decodeURIComponent(String(ref || ''))
  const index = decoded.indexOf('-')
  if (index < 1) return null
  const prefix = decoded.slice(0, index)
  const id = decoded.slice(index + 1)
  const kind = (Object.keys(ROUTE_PREFIX) as CustomerRequestKind[]).find((key) => ROUTE_PREFIX[key] === prefix)
  if (!kind || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return null
  return { kind, id }
}

export function formatDateTime(value: string | null | undefined, timeZone?: string | null, locale: 'pt-BR' | 'en-US' = 'en-US') {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  // dateStyle/timeStyle can't be combined with timeZoneName (Intl throws), so spell the fields out.
  const fields: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }
  try {
    return date.toLocaleString(locale, { ...fields, timeZone: timeZone || undefined })
  } catch {
    // An unknown stored time zone falls back to the server's zone rather than failing the page.
    return date.toLocaleString(locale, fields)
  }
}

export function formatDate(value: string | null | undefined, timeZone?: string | null, locale: 'pt-BR' | 'en-US' = 'en-US') {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  try {
    return date.toLocaleDateString(locale, { dateStyle: 'medium', timeZone: timeZone || undefined })
  } catch {
    return date.toLocaleDateString(locale, { dateStyle: 'medium' })
  }
}

export function formatCents(cents: number | null | undefined, currencyCode?: string | null, locale: 'pt-BR' | 'en-US' = 'en-US') {
  if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) return null
  return new Intl.NumberFormat(locale, { style: 'currency', currency: storefrontCurrency(currencyCode) }).format(Number(cents) / 100)
}

export type CustomerRequestRow = {
  id: string
  kind: string
  kindKey?: string | null
  scheduledAt: string
  status: string
  timezone?: string | null
  vehicle?: string | null
  amountCents?: number | null
  reference?: string | null
}

export type CustomerPayment = {
  id: string
  sourceType: string
  amountCents: number
  currency: string
  status: string
  capturedCents: number
  refundedCents: number
  createdAt: string
  dealId: string | null
  serviceOrderId: string | null
  label?: string
}

export type CustomerVehicle = { id: string; year?: number | string | null; make?: string | null; model?: string | null; trim?: string | null; vin?: string | null; stockNumber?: string | null; label?: string | null }

export type CustomerPurchase = {
  id: string
  createdAt: string
  status: string
  structureType?: string | null
  saleDate?: string | null
  timezone?: string | null
  vehicle: CustomerVehicle | null
  vehiclePriceCents?: number | null
  tradeInValueCents?: number | null
  downPaymentCents?: number | null
  financingAmountCents?: number | null
  monthlyPaymentCents?: number | null
  loanTerm?: number | null
  apr?: number | null
  totalPriceCents?: number | null
  balanceCents?: number | null
  taxAmountCents?: number | null
  deliveries: Array<{
    id: string
    status: string
    appointmentAt?: string | null
    acknowledgedAt?: string | null
    weOweItems: Array<{ id: string; description: string; status: string; promisedAt: string; fulfilledAt?: string | null }>
  }>
  payments: CustomerPayment[]
}

export type CustomerServiceOrderSummary = { id: string; status: string; invoiceNumber?: string | null; grandTotalCents?: number | null; completedAt?: string | null; settledAt?: string | null }

export type CustomerServiceVisit = {
  id: string
  appointmentDate: string
  status: string
  serviceType?: string | null
  vehicleDescription?: string | null
  servicePackage?: { id: string; name: string } | null
  serviceOrder: CustomerServiceOrderSummary | null
  timezone?: string | null
  canCancel: boolean
  canReschedule: boolean
}

export type CustomerServiceOrder = {
  id: string
  createdAt: string
  status: string
  invoiceNumber?: string | null
  concern?: string | null
  cause?: string | null
  correction?: string | null
  workPerformed?: string | null
  recommendations?: string | null
  laborTotalCents?: number | null
  partsTotalCents?: number | null
  taxCents?: number | null
  grandTotalCents?: number | null
  completedAt?: string | null
  settledAt?: string | null
  timezone?: string | null
  paidCents: number
  balanceCents: number
  appointment?: { id: string; appointmentDate?: string | null; customerVehicleDescription?: string | null; vehicleVin?: string | null } | null
  lineItems: Array<{ id: string; itemType: string; description: string; partNumber?: string | null; quantity?: number | null; unitPriceCents?: number | null; priceCents?: number | null }>
  laborOperations: Array<{ id: string; description: string; status: string; soldHours?: number | null; completedAt?: string | null }>
  payments: CustomerPayment[]
}

export type CustomerEmailLink = { email: string; linkedCustomerCount: number; newlyLinkedCount?: number | null; verified: boolean }

// RO statuses read as the customer sees them; "paid" means settled outside the app.
export function serviceOrderStatusLabel(status: string, locale: 'pt-BR' | 'en-US' = 'en-US') {
  if (locale === 'pt-BR') return status === 'estimate' ? 'Orçamento' : statusLabel(status, locale)
  if (status === 'estimate') return 'Estimate'
  if (status === 'paid') return 'Paid'
  return statusLabel(status, locale)
}
