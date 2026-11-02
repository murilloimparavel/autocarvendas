/** Display helpers shared by the platform desks. */

/** "1 photo", "3 photos"; pass the plural when it is not just the singular plus s. */
export function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

/** "2025550147" -> "(202) 555-0147"; NANP numbers with or without a leading 1. Anything else is returned trimmed. */
export function formatPhone(value: string | null | undefined) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (national.length !== 10 || (raw.startsWith('+') && !raw.startsWith('+1'))) return raw
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`
}

/**
 * Short, stable reference for a record id, in the storefront's PREFIX-XXXXXXXX
 * shape (see features/storefront/lib/customerRequests.ts).
 */
export function recordReference(prefix: string, id: string | null | undefined) {
  const normalized = String(id ?? '').trim().replace(/[^a-zA-Z0-9]/g, '')
  if (!normalized) return null
  return `${prefix}-${normalized.slice(-8).toUpperCase()}`
}

export const DEFAULT_DEALERSHIP_TIME_ZONE = 'America/New_York'

/** Calendar day of a timestamp in the given zone, e.g. "2026-10-23", for same-day comparisons. */
export function dayKey(value: string | number | Date, timeZone: string) {
  return new Date(value).toLocaleDateString('en-CA', { timeZone })
}
