export function formatCents(cents: number | null | undefined, currencyCode = 'USD', locale: 'pt-BR' | 'en-US' = 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, maximumFractionDigits: 2 }).format((cents || 0) / 100)
}

export function formatDateTime(value: string | null | undefined, timeZone: string, empty = 'Unscheduled', locale: 'pt-BR' | 'en-US' = 'en-US') {
  if (!value) return empty
  return new Date(value).toLocaleString(locale, { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

/** "1.5" -> 1.5; null when it is not a positive quantity the line commands accept. */
export function parseQuantity(text: string) {
  const cleaned = text.trim()
  if (!/^\d+(\.\d{1,2})?$|^\.\d{1,2}$/.test(cleaned)) return null
  const value = Number(cleaned)
  return value > 0 && value <= 10_000 ? value : null
}

/** Non-negative whole number, or null. Blank is null. */
export function parseWhole(text: string, max = 2_147_483_647) {
  const cleaned = text.trim().replace(/,/g, '')
  if (!/^\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isSafeInteger(value) && value <= max ? value : null
}

export function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '')
}

/** Service appointment and vehicle mileage are stored in miles by the source DMS. */
export function formatMileage(value: number | null | undefined, locale: 'pt-BR' | 'en-US') {
  if (value == null || !Number.isFinite(value)) return '—'
  const displayValue = locale === 'pt-BR' ? Math.round(value * 1.609344) : value
  return `${displayValue.toLocaleString(locale)} ${locale === 'pt-BR' ? 'km' : 'mi'}`
}

/** Convert a user-entered locale distance back to the source system's stored miles. */
export function mileageToStoredMiles(value: number, locale: 'pt-BR' | 'en-US') {
  return locale === 'pt-BR' ? Math.round(value / 1.609344) : value
}

/** Time of day only, in dealership time: "9:30 AM". */
export function formatTime(value: string | null | undefined, timeZone: string, empty = '—', locale: 'pt-BR' | 'en-US' = 'en-US') {
  if (!value) return empty
  return new Date(value).toLocaleTimeString(locale, { timeZone, hour: 'numeric', minute: '2-digit' })
}

/** Elapsed time since a timestamp as a short figure: "45m", "6h", "3d". */
export function formatAge(value: string | null | undefined, now = Date.now()) {
  if (!value) return '—'
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
