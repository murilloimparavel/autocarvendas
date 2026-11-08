import { MAX_CENTS, MAX_TAX_RATE_BPS } from '@/features/keystone/lifecycle/dealPricing'

const amountPattern = /^\d+(\.\d{0,2})?$|^\.\d{1,2}$/

/** "$33,450.50" -> 3345050. Blank is zero; anything else that is not dollars and cents is null. */
export function parseDollarsToCents(text: string, locale: 'pt-BR' | 'en-US' = 'en-US'): number | null {
  const raw = text.trim().replace(/[^\d.,]/g, '')
  const cleaned = locale === 'pt-BR'
    ? raw.includes(',') ? raw.replaceAll('.', '').replace(',', '.') : /^\d{1,3}(?:\.\d{3})+$/.test(raw) ? raw.replaceAll('.', '') : raw
    : raw.replaceAll(',', '')
  if (!cleaned) return 0
  if (!amountPattern.test(cleaned)) return null
  const [whole, fraction = ''] = cleaned.split('.')
  const cents = Number(whole || 0) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents <= MAX_CENTS ? cents : null
}

/** 3345050 -> "33,450.50"; whole dollars drop the cents. */
export function formatCentsForInput(cents: number | null | undefined, locale: 'pt-BR' | 'en-US' = 'en-US'): string {
  const value = Number(cents) || 0
  return (value / 100).toLocaleString(locale, { minimumFractionDigits: value % 100 ? 2 : 0, maximumFractionDigits: 2 })
}

/** "4.15" or "4.15%" -> 415 basis points; null when it is not 0-100 with two decimals. */
export function parsePercentToBps(text: string, locale: 'pt-BR' | 'en-US' = 'en-US'): number | null {
  const raw = text.trim().replace(/%$/, '').trim().replace(/[^\d.,]/g, '')
  const cleaned = locale === 'pt-BR'
    ? raw.includes(',') ? raw.replaceAll('.', '').replace(',', '.') : /^\d{1,3}(?:\.\d{3})+$/.test(raw) ? raw.replaceAll('.', '') : raw
    : raw.replaceAll(',', '')
  if (!cleaned) return 0
  if (!amountPattern.test(cleaned)) return null
  const [whole, fraction = ''] = cleaned.split('.')
  const bps = Number(whole || 0) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(bps) && bps <= MAX_TAX_RATE_BPS ? bps : null
}

export function formatBpsForInput(bps: number | null | undefined, locale: 'pt-BR' | 'en-US' = 'en-US'): string {
  const value = Number(bps) || 0
  return (value / 100).toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}
