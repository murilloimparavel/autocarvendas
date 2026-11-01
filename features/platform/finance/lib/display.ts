import type { DeskTone } from '@/features/platform/components/desk'

export const PRODUCT_CATEGORIES = ['service-contract', 'gap', 'maintenance', 'appearance', 'tire-wheel', 'other'] as const

export const categoryLabels: Record<string, string> = {
  'service-contract': 'Service contract',
  gap: 'GAP',
  maintenance: 'Maintenance',
  appearance: 'Appearance',
  'tire-wheel': 'Tire and wheel',
  other: 'Other',
}

export function formatCents(cents: number | null | undefined, empty = '-') {
  if (cents == null) return empty
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

export function formatDay(value: string | null | undefined, timeZone: string) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateTime(value: string | null | undefined, timeZone: string) {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function formatApr(bps: number | null | undefined) {
  return bps == null ? '-' : `${(bps / 100).toFixed(2)}%`
}

/** Tone for free-form workflow states. */
export function stateTone(value: string | null | undefined): DeskTone {
  const state = (value || '').toLowerCase()
  if (['approved', 'accepted', 'completed', 'complete', 'signed', 'funded', 'quoted', 'submitted-to-lender', 'succeeded', 'active'].includes(state)) return 'ok'
  if (['declined', 'rejected', 'failed', 'expired', 'cancelled', 'canceled', 'void', 'denied'].includes(state)) return 'bad'
  if (['conditional', 'requested', 'pending', 'presented', 'queued', 'submitted', 'under-review', 'creating'].includes(state)) return 'warn'
  return 'idle'
}

export function personName(person: { firstName?: string | null; lastName?: string | null } | null | undefined, fallback = 'No customer') {
  if (!person) return fallback
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || fallback
}

export function vehicleName(vehicle: { year?: number | null; make?: string | null; model?: string | null } | null | undefined, fallback = 'No vehicle') {
  if (!vehicle) return fallback
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || fallback
}

export function newIdempotencyKey(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`
}

/** Whole days since a timestamp; null when unknown. */
export function daysSince(value: string | null | undefined, now = Date.now()) {
  if (!value) return null
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return null
  return Math.max(0, Math.floor((now - time) / 86_400_000))
}

export function formatAge(days: number | null) {
  if (days == null) return '-'
  return days === 0 ? 'Today' : `${days}d`
}

export function countLabel(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`
}

/** Desk headline: manager approvals first, then storefront applications still waiting on a lender. */
export function financeDeskStatus({ error, approvalsWaiting, applicationsWaiting }: { error: boolean; approvalsWaiting: number; applicationsWaiting: number }): { tone: DeskTone; label: string } {
  if (error) return { tone: 'bad', label: 'Unavailable' }
  if (approvalsWaiting > 0) return { tone: 'warn', label: 'Approvals waiting' }
  if (applicationsWaiting > 0) return { tone: 'warn', label: `${countLabel(applicationsWaiting, 'application')} waiting` }
  return { tone: 'ok', label: 'Up to date' }
}

// Storefront financing form values (FinancingPage) shown as the customer chose them.
const employmentLabels: Record<string, string> = {
  employed: 'Employed', 'self-employed': 'Self-employed', retired: 'Retired', student: 'Student', other: 'Other',
}
const creditTierLabels: Record<string, string> = {
  'excellent-720-plus': 'Excellent (720+)', 'good-680-719': 'Good (680–719)', 'fair-620-679': 'Fair (620–679)',
  'rebuilding-under-620': 'Rebuilding (<620)', unknown: 'Not sure',
}
export function employmentLabel(value: string | null | undefined) {
  return value ? employmentLabels[value] || value : '-'
}
export function creditTierLabel(value: string | null | undefined) {
  return value ? creditTierLabels[value] || value : '-'
}
