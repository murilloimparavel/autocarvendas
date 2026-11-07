function formatter(currencyCode: string, locale: string, whole: boolean) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })
}

/**
 * USD for the deal desks. Values that round to zero render as "$0.00" (or "$0"),
 * never "-$0.00", so credits with no amount do not read as negative.
 */
export function formatUsd(value: number | null | undefined, options: { whole?: boolean; currencyCode?: string; locale?: 'pt-BR' | 'en-US' } = {}) {
  if (value == null || !Number.isFinite(value)) return '-'
  const currencyFormatter = formatter(options.currencyCode || 'USD', options.locale || 'en-US', options.whole === true)
  const rounded = options.whole ? Math.round(value) : Math.round(value * 100) / 100
  return currencyFormatter.format(rounded === 0 ? 0 : rounded)
}

/** A credit (trade-in, rebate, down payment) shown as a deduction; zero stays unsigned. */
export function formatUsdCredit(value: number | null | undefined, options: { whole?: boolean; currencyCode?: string; locale?: 'pt-BR' | 'en-US' } = {}) {
  if (value == null || !Number.isFinite(value)) return '-'
  return formatUsd(-Math.abs(value), options)
}
