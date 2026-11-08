/** "2026-10" -> "Oct 2026". Month keys are calendar months, so format them without a time zone shift. */
export function monthLabel(month: string, locale: 'pt-BR' | 'en-US' = 'en-US') {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return month
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)).toLocaleDateString(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' })
}
