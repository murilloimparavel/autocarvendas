import type { Metadata } from 'next'

import type { StorefrontBusiness } from './business'
import { formatMileage, formatPrice, vehicleTitle } from './format'
import { primaryVehicleImage, vehicleImageUrl } from './images'
import type { Vehicle } from './types'
import type { Locale } from '@/features/i18n/messages'
import { translate } from '@/features/i18n/messages'

// Shared photo of the showroom used when a page has no picture of its own (link previews).
export const SHARE_PHOTO = '/images/showroom-dusk.jpg'

function place(business: StorefrontBusiness) {
  return business.addressLine2.split(',')[0]?.trim() || ''
}

function oneLine(text: string, max = 160) {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

/** The shop's description: what the owner wrote, otherwise a plain sentence from its name and town. */
export function businessDescription(business: StorefrontBusiness, locale: Locale = 'en-US') {
  if (business.homepageDescription.trim()) return oneLine(business.homepageDescription)
  const town = place(business)
  return locale === 'pt-BR'
    ? oneLine(`${business.fullName}${town ? ` em ${town}` : ''}: ${translate(locale, 'browseInventory')}, agende um test-drive, simule o financiamento e avalie seu veículo na troca.`)
    : oneLine(`${business.fullName}${town ? ` in ${town}` : ''}: browse new and pre-owned vehicles, book a test drive, apply for financing and get an offer on your trade-in.`)
}

export function pageMetadata(business: StorefrontBusiness, page: 'inventory' | 'financing', title: string, locale: Locale = 'en-US'): Metadata {
  const description = locale === 'pt-BR'
    ? oneLine(`${business.fullName}: ${translate(locale, page === 'inventory' ? 'inventoryMeta' : 'financingMeta')}`)
    : oneLine(page === 'inventory'
      ? `Browse every vehicle on the lot at ${business.fullName}, with prices, mileage and photos. Filter by make, model, year and budget.`
      : `Estimate a monthly payment on any vehicle at ${business.fullName}, then send a financing application to the finance team.`)
  return { title, description, openGraph: { title: `${title} | ${business.shortName}`, description } }
}

export function vehicleMetadata(business: StorefrontBusiness, vehicle: Vehicle, locale: Locale = 'en-US'): Metadata {
  const title = vehicleTitle(vehicle)
  const facts = [
    vehicle.price ? formatPrice(vehicle.price, business.currencyCode, locale) : '',
    vehicle.mileage != null ? formatMileage(vehicle.mileage, locale) : '',
    vehicle.color || '',
    vehicle.stockNumber ? `${translate(locale, 'stockNumber')} ${vehicle.stockNumber}` : '',
  ].filter(Boolean).join(', ')
  const description = oneLine(locale === 'pt-BR'
    ? `${title}${facts ? `: ${facts}` : ''}. ${translate(locale, 'availableAt')} ${business.fullName}. ${translate(locale, 'bookTestDrive')} ${translate(locale, 'orApplyFinancing')}`
    : `${title}${facts ? `: ${facts}` : ''}. Available at ${business.fullName}. Book a test drive or apply for financing online.`)
  const photo = vehicleImageUrl(primaryVehicleImage(vehicle.images))
  return {
    title,
    description,
    openGraph: { title: `${title} | ${business.shortName}`, description, ...(photo ? { images: [{ url: photo, alt: title }] } : {}) },
    twitter: { card: 'summary_large_image' },
  }
}

/** Defaults for every storefront page; pages override title, description and image. */
export function storefrontMetadata(business: StorefrontBusiness, origin: string | null, locale: Locale = 'en-US'): Metadata {
  const description = businessDescription(business, locale)
  return {
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    title: { default: business.homepageTitle || business.fullName, template: `%s | ${business.shortName}` },
    description,
    openGraph: {
      type: 'website',
      siteName: business.fullName,
      title: business.homepageTitle || business.fullName,
      description,
      images: [{ url: SHARE_PHOTO, width: 2400, height: 1029, alt: `${business.fullName} showroom` }],
    },
    twitter: { card: 'summary_large_image' },
  }
}
