import type { DeskTone } from '@/features/platform/components/desk'
import type { Locale } from '@/features/i18n/messages'

export const LEAD_STATUSES: ReadonlyArray<{ value: string; label: string; tone: DeskTone }> = [
  { value: 'new', label: 'New', tone: 'info' },
  { value: 'contacted', label: 'Contacted', tone: 'accent' },
  { value: 'test-drive-scheduled', label: 'Test drive', tone: 'info' },
  { value: 'negotiating', label: 'Negotiating', tone: 'warn' },
  { value: 'closed-won', label: 'Closed won', tone: 'ok' },
  { value: 'closed-lost', label: 'Closed lost', tone: 'bad' },
]

export const CLOSED_LEAD_STATUSES = ['closed-won', 'closed-lost']

export function leadStatus(value: string | null | undefined, locale: Locale = 'en-US') {
  const status = LEAD_STATUSES.find(item => item.value === value)
  if (status) return { ...status, label: locale === 'pt-BR' ? ({ new: 'Novo', contacted: 'Em contato', 'test-drive-scheduled': 'Test-drive agendado', negotiating: 'Em negociação', 'closed-won': 'Venda concluída', 'closed-lost': 'Venda perdida' }[status.value] || status.label) : status.label }
  return { value: value || 'new', label: value || (locale === 'pt-BR' ? 'Novo' : 'New'), tone: 'idle' as DeskTone }
}

export const LEAD_SOURCES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'walk-in', label: 'Walk-in' },
  { value: 'phone', label: 'Phone' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'ad', label: 'Advertisement' },
  { value: 'social', label: 'Social' },
  { value: 'third-party', label: '3rd party' },
]

/** Sources staff can pick when taking a lead by hand. Website leads arrive through the storefront. */
export const STAFF_LEAD_SOURCES = LEAD_SOURCES.filter(source => source.value !== 'website')

export function sourceLabel(value: string | null | undefined, locale: Locale = 'en-US') {
  const source = LEAD_SOURCES.find(item => item.value === value)
  if (locale === 'pt-BR' && source) return ({ 'walk-in': 'Presencial', phone: 'Telefone', website: 'Site', referral: 'Indicação', ad: 'Anúncio', social: 'Rede social', 'third-party': 'Portal ou parceiro' }[source.value] || source.label)
  return source?.label || value || '-'
}

export const BUDGET_RANGES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'under-20k', label: 'Under $20,000' },
  { value: '20-30k', label: '$20,000 - $30,000' },
  { value: '30-40k', label: '$30,000 - $40,000' },
  { value: '40-50k', label: '$40,000 - $50,000' },
  { value: '50-75k', label: '$50,000 - $75,000' },
  { value: '75-100k', label: '$75,000 - $100,000' },
  { value: 'over-100k', label: 'Over $100,000' },
]

export function budgetLabel(value: string | null | undefined, locale: Locale = 'en-US', currencyCode = 'USD') {
  const range = BUDGET_RANGES.find(item => item.value === value)
  if (!range || locale !== 'pt-BR') return range?.label || '-'
  const amount = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 }).format(n)
  const labels: Record<string, string> = {
    'under-20k': `Até ${amount(20000)}`, '20-30k': `${amount(20000)} a ${amount(30000)}`,
    '30-40k': `${amount(30000)} a ${amount(40000)}`, '40-50k': `${amount(40000)} a ${amount(50000)}`,
    '50-75k': `${amount(50000)} a ${amount(75000)}`, '75-100k': `${amount(75000)} a ${amount(100000)}`,
    'over-100k': `Acima de ${amount(100000)}`,
  }
  return labels[value || ''] || range.label
}

export const TIMEFRAMES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'immediately', label: 'Immediately' },
  { value: 'this-week', label: 'This week' },
  { value: 'this-month', label: 'This month' },
  { value: 'just-looking', label: 'Just looking' },
]

export function timeframeLabel(value: string | null | undefined, locale: Locale = 'en-US') {
  const timeframe = TIMEFRAMES.find(item => item.value === value)
  if (locale === 'pt-BR' && timeframe) return ({ immediately: 'Imediatamente', 'this-week': 'Nesta semana', 'this-month': 'Neste mês', 'just-looking': 'Só pesquisando' }[timeframe.value] || timeframe.label)
  return timeframe?.label || '-'
}

export const VISIT_STATUSES: Record<string, { label: string; tone: DeskTone }> = {
  scheduled: { label: 'Scheduled', tone: 'info' },
  arrived: { label: 'Arrived', tone: 'warn' },
  'manager-turn': { label: 'Manager turn', tone: 'warn' },
  completed: { label: 'Completed', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'idle' },
  'no-show': { label: 'No show', tone: 'bad' },
}

/** Mirrors VISIT_TRANSITIONS in features/keystone/mutations/crmEngagementWorkflows.ts. */
export const VISIT_ACTIONS: Record<string, ReadonlyArray<'arrive' | 'manager-turn' | 'complete' | 'cancel' | 'no-show'>> = {
  scheduled: ['arrive', 'no-show', 'cancel'],
  arrived: ['manager-turn', 'complete', 'cancel'],
  'manager-turn': ['complete', 'cancel'],
}

export const PRIORITY_TONE: Record<string, DeskTone> = { urgent: 'bad', high: 'warn', medium: 'idle', low: 'idle' }

/** "2026-10-23T14:30" for a datetime-local input, in the dealership time zone. */
export function toZonedInputValue(value: string | number | Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(value))
      .map(part => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

function zoneOffsetMs(instant: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(instant))
      .map(part => [part.type, part.value]),
  )
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
  return asUtc - Math.floor(instant / 1000) * 1000
}

/** Reads a datetime-local value as wall time in the dealership zone and returns the ISO instant. */
export function fromZonedInputValue(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const wall = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]))
  const first = wall - zoneOffsetMs(wall, timeZone)
  const instant = wall - zoneOffsetMs(first, timeZone)
  return new Date(instant).toISOString()
}

/** Start and end (exclusive) of the current calendar day in the dealership zone. */
export function zonedDayBounds(timeZone: string, now = Date.now()) {
  const key = new Date(now).toLocaleDateString('en-CA', { timeZone })
  const start = fromZonedInputValue(`${key}T00:00`, timeZone) as string
  const [year, month, day] = key.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
  const end = fromZonedInputValue(`${next}T00:00`, timeZone) as string
  return { start, end }
}

export function formatDateTime(value: string | null | undefined, timeZone: string, locale: Locale = 'en-US') {
  if (!value) return '-'
  return new Date(value).toLocaleString(locale, { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function formatDay(value: string | null | undefined, timeZone: string, locale: Locale = 'en-US') {
  if (!value) return '-'
  return new Date(value).toLocaleDateString(locale, { timeZone, month: 'short', day: 'numeric', year: 'numeric' })
}

export function personName(first: string | null | undefined, last: string | null | undefined, fallback = 'Unnamed') {
  return [first, last].filter(Boolean).join(' ') || fallback
}

/** Mirrors LEAD_TRANSITIONS in features/keystone/mutations/operatorWorkflows.ts. */
export const LEAD_TRANSITIONS: Record<string, string[]> = {
  new: ['contacted', 'test-drive-scheduled', 'closed-lost'],
  contacted: ['test-drive-scheduled', 'negotiating', 'closed-won', 'closed-lost'],
  'test-drive-scheduled': ['contacted', 'negotiating', 'closed-won', 'closed-lost'],
  negotiating: ['closed-won', 'closed-lost'],
  'closed-won': [],
  'closed-lost': [],
}

export const VISIT_OUTCOMES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'sold', label: 'Sold' },
  { value: 'follow-up-required', label: 'Follow-up required' },
  { value: 'be-back', label: 'Be-back scheduled' },
  { value: 'not-interested', label: 'Not interested' },
  { value: 'credit-declined', label: 'Credit declined' },
]

/** Elapsed time as a short windshield figure: "35m", "4h", "3d". */
export function formatElapsed(fromMs: number, nowMs = Date.now()) {
  const minutes = Math.max(0, Math.floor((nowMs - fromMs) / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
