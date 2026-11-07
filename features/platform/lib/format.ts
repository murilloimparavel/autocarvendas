/** Display helpers shared by the platform desks. */

/** "1 photo", "3 photos"; pass the plural when it is not just the singular plus s. */
export function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

/** Formats NANP and Brazilian phone numbers for display; unknown international formats remain unchanged. */
export function formatPhone(value: string | null | undefined, locale: 'pt-BR' | 'en-US' = 'en-US') {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  if (locale === 'pt-BR') {
    const hasBrazilCountryCode = raw.startsWith('+55') || ((digits.length === 12 || digits.length === 13) && digits.startsWith('55'))
    const brazilNational = hasBrazilCountryCode ? digits.slice(2) : digits
    if ((brazilNational.length === 10 || brazilNational.length === 11) && (!raw.startsWith('+') || raw.startsWith('+55'))) {
      const area = brazilNational.slice(0, 2)
      const subscriber = brazilNational.slice(2)
      const formatted = subscriber.length === 11 ? `${subscriber.slice(0, 5)}-${subscriber.slice(5)}` : `${subscriber.slice(0, 4)}-${subscriber.slice(4)}`
      return `${hasBrazilCountryCode ? '+55 ' : ''}(${area}) ${formatted}`
    }
    if (raw.startsWith('+') && !raw.startsWith('+55')) return raw
  }
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
