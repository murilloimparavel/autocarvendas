import type { DeskTone } from '@/features/platform/components/desk'

export function money(cents: number | null | undefined, currency = 'usd', locale: 'pt-BR' | 'en-US' = 'en-US') {
  const value = (Number(cents) || 0) / 100
  const code = currency?.toUpperCase() || 'USD'
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(value)
  } catch {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(value)
  }
}

export function dateTime(value: string | null | undefined, timeZone: string, locale: 'pt-BR' | 'en-US' = 'en-US') {
  if (!value) return ''
  return new Date(value).toLocaleString(locale, { timeZone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function shortDate(value: string | null | undefined, timeZone: string, locale: 'pt-BR' | 'en-US' = 'en-US') {
  if (!value) return ''
  return new Date(value).toLocaleDateString(locale, { timeZone, month: 'short', day: 'numeric', year: 'numeric' })
}

export const nonce = (prefix: string) => `${prefix}:${crypto.randomUUID()}`

export const BATCH_STATUSES = ['staged', 'posting', 'failed', 'posted', 'reconciled', 'locked'] as const
export type BatchStatus = (typeof BATCH_STATUSES)[number]

export const BATCH_STATUS_LABEL: Record<string, string> = {
  staged: 'Staged',
  posting: 'Posting',
  failed: 'Failed',
  posted: 'Posted',
  reconciled: 'Reconciled',
  locked: 'Locked',
}

const ACCOUNTING_UI_LABELS: Record<string, string> = {
  Staged: 'Em preparação', Posting: 'Enviando', Failed: 'Falhou', Posted: 'Enviado', Reconciled: 'Conciliado', Locked: 'Bloqueado',
  Balanced: 'Fechado', 'Out of balance': 'Com divergência', 'Not posted': 'Não enviado', 'Not locked': 'Não bloqueado',
  Deal: 'Venda', 'Service order': 'Ordem de serviço', 'Parts PO': 'Pedido de compra de peças', Payment: 'Pagamento',
  'Not reconciled': 'Não conciliado', 'Authorized, not captured': 'Autorizado, não capturado', 'Not captured': 'Não capturado', Unreconciled: 'Não conciliado',
  'Queue for posting': 'Enviar para contabilização', 'Fix and queue again': 'Corrigir e enviar novamente', 'Record posting result': 'Registrar resultado do envio',
  'out of balance': 'com divergência', balanced: 'conciliado', attempt: 'tentativa', attempts: 'tentativas',
}

export function accountingLabel(locale: 'pt-BR' | 'en-US', label: string) {
  return locale === 'pt-BR' ? ACCOUNTING_UI_LABELS[label] || label : label
}

export function batchTone(status: string): DeskTone {
  if (status === 'failed') return 'bad'
  if (status === 'posting' || status === 'staged') return 'warn'
  if (status === 'posted') return 'info'
  if (status === 'reconciled' || status === 'locked') return 'ok'
  return 'idle'
}

export const SOURCE_TYPES = ['deal', 'service', 'parts', 'payment'] as const
export type AccountingSourceType = (typeof SOURCE_TYPES)[number]

export const SOURCE_TYPE_LABEL: Record<string, string> = {
  deal: 'Deal',
  service: 'Service order',
  parts: 'Parts PO',
  payment: 'Payment',
}

/** Amount codes each source produces when staged (features/keystone/mutations/accountingOperations.ts, sourcePairs). */
export const SOURCE_CODES: Record<AccountingSourceType, string[]> = {
  deal: ['vehicle-sale', 'sales-tax', 'fees', 'finance-products', 'rebates', 'trade-in'],
  service: ['labor', 'parts', 'sales-tax'],
  parts: ['inventory-receipt'],
  payment: ['payment-capture', 'payment-refund'],
}

export const ACCOUNTING_PROVIDER = 'operator-recorded'

export const PAYMENT_STATUSES = ['creating', 'pending', 'authorized', 'captured', 'failed', 'canceled', 'partially-refunded', 'refunded'] as const

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  creating: 'Creating',
  pending: 'Pending',
  authorized: 'Authorized',
  captured: 'Captured',
  failed: 'Failed',
  canceled: 'Canceled',
  'partially-refunded': 'Partially refunded',
  refunded: 'Refunded',
}

export function paymentStatusLabel(locale: 'pt-BR' | 'en-US', label: string) {
  if (locale === 'en-US') return label
  const labels: Record<string, string> = {
    Creating: 'Criando', Pending: 'Pendente', Authorized: 'Autorizado', Captured: 'Capturado',
    Failed: 'Falhou', Canceled: 'Cancelado', 'Partially refunded': 'Parcialmente estornado', Refunded: 'Estornado',
    'Not reconciled': 'Não conciliado', 'Authorized, not captured': 'Autorizado, não capturado',
    'Not captured': 'Não capturado', Unreconciled: 'Não conciliado',
  }
  return labels[label] || label
}

export function paymentTone(status: string): DeskTone {
  if (status === 'failed') return 'bad'
  if (['creating', 'pending', 'authorized', 'partially-refunded'].includes(status)) return 'warn'
  if (status === 'captured') return 'ok'
  if (status === 'refunded') return 'info'
  return 'idle'
}

export function refundTone(status: string): DeskTone {
  if (status === 'failed') return 'bad'
  if (status === 'creating' || status === 'pending') return 'warn'
  if (status === 'succeeded') return 'ok'
  return 'idle'
}

/** Midnight of a YYYY-MM-DD calendar day in `timeZone`, as an ISO instant. */
export function zonedDayStart(day: string, timeZone: string) {
  const [year, month, date] = day.split('-').map(Number)
  if (!year || !month || !date) return null
  const guess = Date.UTC(year, month - 1, date)
  const offsetAt = (instant: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(instant))
    const get = (type: string) => Number(parts.find(part => part.type === type)?.value || 0)
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - instant
  }
  let instant = guess - offsetAt(guess)
  instant = guess - offsetAt(instant)
  return new Date(instant).toISOString()
}

export function addDays(day: string, days: number) {
  const [year, month, date] = day.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, date + days))
  return next.toISOString().slice(0, 10)
}
