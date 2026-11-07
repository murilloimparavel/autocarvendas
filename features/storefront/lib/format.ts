import type { Locale } from '@/features/i18n/messages'

export function storefrontCurrency(currencyCode?: string | null, locale: Locale = 'en-US') {
  const code = String(currencyCode || '').trim().toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : locale === 'pt-BR' ? 'BRL' : 'USD'
}

export function currencySymbol(currencyCode?: string | null, locale: Locale = 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: storefrontCurrency(currencyCode, locale) })
    .formatToParts(0)
    .find((part) => part.type === 'currency')?.value ?? '$'
}

export function formatPrice(price: number, currencyCode?: string | null, locale: Locale = 'en-US') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: storefrontCurrency(currencyCode, locale),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

export function formatMileage(mileage: number, locale: Locale = 'en-US') {
  const localizedDistance = locale === 'pt-BR' ? mileage * 1.609344 : mileage
  const unit = locale === 'pt-BR' ? 'km' : 'mi'
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(localizedDistance)} ${unit}`
}

export function vehicleTitle(vehicle: { year: number; make: string; model: string; trim?: string }) {
  const base = `${vehicle.year} ${vehicle.make} ${vehicle.model}`
  return vehicle.trim ? `${base} ${vehicle.trim}` : base
}
