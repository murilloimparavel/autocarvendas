import { sanitizeStoreLogoSvg } from '../../lib/sanitize-store-logo'
import { DEFAULT_STORE_LOGO_ICON, normalizeStoreLogoColor } from '../../lib/store-logo'

export const DEFAULT_STOREFRONT_NAME = 'Openfront Dealership'

export type StorefrontBusiness = {
  rooftopSlug: string
  fullName: string
  shortName: string
  salesEmail: string
  serviceEmail: string
  phoneDisplay: string
  phoneHref: string
  directionsHref: string
  addressLine1: string
  addressLine2: string
  hoursMonFri: string
  hoursSaturday: string
  hoursSunday: string
  websiteUrl: string
  currencyCode: string
  homepageTitle: string
  homepageDescription: string
  logoIcon: string
  logoColor: string
  timezone: string
}

export type StorefrontProfileDto = Partial<Omit<StorefrontBusiness, 'directionsHref'>> & {
  configured?: boolean
}

export type StorefrontSettingsState =
  | { status: 'ready'; business: StorefrontBusiness }
  | { status: 'error' }

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

// The icon always shows beside the name, as in E-commerce: the saved icon when it is
// a safe SVG, otherwise the platform default icon. The text lockup stays alongside it.
function storeOwnLogo(value: unknown) {
  return sanitizeStoreLogoSvg(clean(value)) || sanitizeStoreLogoSvg(DEFAULT_STORE_LOGO_ICON)
}

export function createStorefrontBusiness(profile: StorefrontProfileDto = {}): StorefrontBusiness {
  const addressLine1 = clean(profile.addressLine1)
  const addressLine2 = clean(profile.addressLine2)
  const address = [addressLine1, addressLine2].filter(Boolean).join(', ')

  return {
    rooftopSlug: clean(profile.rooftopSlug),
    fullName: clean(profile.fullName) || clean(profile.shortName) || DEFAULT_STOREFRONT_NAME,
    shortName: clean(profile.shortName) || clean(profile.fullName) || DEFAULT_STOREFRONT_NAME,
    salesEmail: clean(profile.salesEmail),
    serviceEmail: clean(profile.serviceEmail),
    phoneDisplay: clean(profile.phoneDisplay),
    phoneHref: clean(profile.phoneHref),
    directionsHref: address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
      : '',
    addressLine1,
    addressLine2,
    hoursMonFri: clean(profile.hoursMonFri),
    hoursSaturday: clean(profile.hoursSaturday),
    hoursSunday: clean(profile.hoursSunday),
    websiteUrl: clean(profile.websiteUrl),
    currencyCode: clean(profile.currencyCode).toUpperCase(),
    homepageTitle: clean(profile.homepageTitle),
    homepageDescription: clean(profile.homepageDescription),
    logoIcon: storeOwnLogo(profile.logoIcon),
    logoColor: normalizeStoreLogoColor(profile.logoColor),
    timezone: clean(profile.timezone),
  }
}
