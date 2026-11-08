/** Wall-clock helpers for the dealership time zone. */

function zoneOffsetMs(instant: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(instant))
      .map(part => [part.type, part.value]),
  )
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second))
  return wall - Math.floor(instant / 1000) * 1000
}

/** "2026-10-23" -> the instant that day starts in `timeZone`; `addDays` shifts the day first. */
export function zonedDayStart(date: string, timeZone: string, addDays = 0) {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return null
  const wall = Date.UTC(year, month - 1, day + addDays)
  const first = wall - zoneOffsetMs(wall, timeZone)
  return new Date(wall - zoneOffsetMs(first, timeZone))
}

export function formatDateTime(value: string | null | undefined, timeZone: string, locale: 'pt-BR' | 'en-US' = 'en-US') {
  if (!value) return '-'
  return new Date(value).toLocaleString(locale, { timeZone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function formatAge(value: string | null | undefined, now = Date.now()) {
  if (!value) return null
  const minutes = Math.max(0, Math.round((now - new Date(value).getTime()) / 60000))
  if (minutes < 60) return `${minutes} min`
  if (minutes < 2880) return `${Math.round(minutes / 60)} h`
  return `${Math.round(minutes / 1440)} d`
}
