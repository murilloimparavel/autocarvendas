import type { DeskTone } from '@/features/platform/components/desk'

export const ACQUISITION_STATUSES = ['appraised', 'approved', 'purchased', 'arrived', 'reconditioning', 'frontline', 'cancelled'] as const
export type AcquisitionStatus = typeof ACQUISITION_STATUSES[number]

export const ACQUISITION_SOURCES = ['trade-in', 'auction', 'wholesale', 'consumer-purchase', 'oem-distributor', 'dealer-transfer'] as const

export const acquisitionSourceLabels: Record<string, string> = {
  'trade-in': 'Trade-in',
  auction: 'Auction',
  wholesale: 'Wholesale',
  'consumer-purchase': 'Bought from consumer',
  'oem-distributor': 'OEM / distributor',
  'dealer-transfer': 'Dealer transfer',
}

export const acquisitionStatusLabels: Record<string, string> = {
  appraised: 'Appraised',
  approved: 'Approved',
  purchased: 'Purchased',
  arrived: 'Arrived',
  reconditioning: 'In recon',
  frontline: 'Frontline',
  cancelled: 'Cancelled',
}

export const acquisitionStatusTones: Record<string, DeskTone> = {
  appraised: 'info',
  approved: 'info',
  purchased: 'warn',
  arrived: 'warn',
  reconditioning: 'warn',
  frontline: 'ok',
  cancelled: 'idle',
}

/** Mirrors lifecycle/inventoryAcquisitionLifecycle.ts. */
export const ACQUISITION_NEXT: Record<string, string | null> = {
  appraised: 'approved',
  approved: 'purchased',
  purchased: 'arrived',
  arrived: 'reconditioning',
  reconditioning: 'frontline',
  frontline: null,
  cancelled: null,
}

export const acquisitionActionLabels: Record<string, string> = {
  approved: 'Approve',
  purchased: 'Record purchase',
  arrived: 'Mark arrived',
  reconditioning: 'Send to recon',
  frontline: 'Mark frontline',
  cancelled: 'Cancel',
}

export const RECON_CATEGORIES = ['mechanical', 'body', 'detail', 'tires', 'inspection', 'other'] as const

export const reconCategoryLabels: Record<string, string> = {
  mechanical: 'Mechanical',
  body: 'Body',
  detail: 'Detail',
  tires: 'Tires',
  inspection: 'Inspection',
  other: 'Other',
}

export const reconStatusLabels: Record<string, string> = {
  open: 'Open',
  'in-progress': 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const reconStatusTones: Record<string, DeskTone> = {
  open: 'info',
  'in-progress': 'warn',
  completed: 'ok',
  cancelled: 'idle',
}

export const COST_TYPES = ['reconditioning', 'transport', 'auction-fee', 'detail', 'other'] as const

export const costTypeLabels: Record<string, string> = {
  reconditioning: 'Reconditioning',
  transport: 'Transport',
  'auction-fee': 'Auction fee',
  detail: 'Detail',
  other: 'Other',
}

export const merchandisingStatusLabels: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
}

export const merchandisingStatusTones: Record<string, DeskTone> = {
  draft: 'idle',
  submitted: 'info',
  approved: 'ok',
  rejected: 'bad',
}

export const feedStatusLabels: Record<string, string> = {
  'not-published': 'Not published',
  succeeded: 'Published',
  partial: 'Partly published',
  failed: 'Failed',
}

export const feedStatusTones: Record<string, DeskTone> = {
  'not-published': 'idle',
  succeeded: 'ok',
  partial: 'warn',
  failed: 'bad',
}

export const feedChannelLabels: Record<string, string> = {
  'public-inventory-feed': 'Public inventory feed',
  'manual-marketplace-export': 'Marketplace export',
}

export const vehicleStatusLabels: Record<string, string> = {
  available: 'Available',
  prep: 'In prep',
  pending: 'Pending',
  hold: 'On hold',
  service: 'In service',
  sold: 'Sold',
}

export const vehicleStatusTones: Record<string, DeskTone> = {
  available: 'ok',
  prep: 'info',
  pending: 'warn',
  hold: 'info',
  service: 'idle',
  sold: 'accent',
}

export const CONDITIONS = ['new', 'used', 'certified'] as const

export const conditionLabels: Record<string, string> = {
  new: 'New',
  used: 'Used',
  certified: 'Certified Pre-Owned',
}

export const RATINGS = ['excellent', 'good', 'fair', 'poor'] as const

export const ratingLabels: Record<string, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
}

export const dealStatusLabels: Record<string, string> = {
  pencil: 'Pencil',
  submitted: 'Submitted',
  approved: 'Approved',
  financed: 'Financed',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

/** "merchandising-draft-updated" -> "Merchandising draft updated"; "cost:transport" -> "Cost: transport". */
export function eventTypeLabel(value: string) {
  const [head, tail] = value.split(':')
  const words = head.replace(/-/g, ' ')
  const label = words.charAt(0).toUpperCase() + words.slice(1)
  return tail ? `${label}: ${tail.replace(/-/g, ' ')}` : label
}

/** VIN check used by every inventory form: 17 characters, no I, O or Q. */
export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/

export function formatMoneyCents(cents: number | null | undefined, currencyCode = 'USD', locale = 'en-US') {
  if (cents == null) return '-'
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100)
}

export function formatDateTime(value: string | null | undefined, timeZone: string, locale = 'en-US') {
  if (!value) return '-'
  return new Date(value).toLocaleString(locale, { timeZone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function formatDate(value: string | null | undefined, timeZone: string, locale = 'en-US') {
  if (!value) return '-'
  return new Date(value).toLocaleDateString(locale, { timeZone, month: 'short', day: 'numeric', year: 'numeric' })
}

export function personName(person: { name: string | null } | null | undefined, locale = 'en-US') {
  return person?.name || (locale === 'pt-BR' ? 'Sistema' : 'System')
}
