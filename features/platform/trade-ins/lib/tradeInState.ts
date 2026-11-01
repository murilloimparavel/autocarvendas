import type { DeskTone } from '@/features/platform/components/desk'
import type { TradeIn, TradeInAcquisition } from '../actions'
import { customerRequestReference } from '@/features/storefront/lib/customerRequests'
import { tradeInStatus } from '@/features/keystone/lifecycle/tradeInStatus'

export type TradeInQueue = 'appraise' | 'offered' | 'on-deal' | 'acquired' | 'closed' | 'all'

export const CONDITION_OPTIONS = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
] as const

export const conditionTone: Record<string, DeskTone> = {
  excellent: 'ok',
  good: 'info',
  fair: 'warn',
  poor: 'bad',
}

export function conditionLabel(value: string | null | undefined) {
  return CONDITION_OPTIONS.find(option => option.value === value)?.label ?? (value || 'Not graded')
}

// Storefront requests store "Ownership: <own|financing|lease>[; customer-reported payoff: $X]" (submitTradeIn).
const ownershipLabel: Record<string, string> = { own: 'Owned', financing: 'Financed', lease: 'Leased' }

export function conditionNotes(value: string) {
  return value
    .replace(/^Ownership: (own|financing|lease)\b/, (_match, ownership: string) => `Ownership: ${ownershipLabel[ownership]}`)
    .replace(/; customer-reported payoff:/, '; Customer-reported payoff:')
}

export function tradeInQueue(tradeIn: TradeIn, acquisition: TradeInAcquisition | null | undefined): Exclude<TradeInQueue, 'all'> {
  const status = tradeInStatus({
    acquired: Boolean(acquisition),
    onDeal: Boolean(tradeIn.deal),
    leadStatus: tradeIn.lead?.status,
    offerAmountCents: tradeIn.offerAmount,
  })
  return status === 'submitted' ? 'appraise' : status
}

export function tradeInState(tradeIn: TradeIn, acquisition: TradeInAcquisition | null | undefined): { tone: DeskTone; label: string } {
  const queue = tradeInQueue(tradeIn, acquisition)
  if (queue === 'acquired') return { tone: 'ok', label: 'In acquisition' }
  if (queue === 'on-deal') return { tone: tradeIn.deal?.status === 'cancelled' ? 'idle' : 'ok', label: tradeIn.deal?.status === 'pencil' ? 'On pencil deal' : 'On deal' }
  if (queue === 'closed') return { tone: 'idle', label: 'Closed' }
  if (queue === 'offered') return { tone: 'info', label: 'Offered' }
  return { tone: 'warn', label: 'Needs appraisal' }
}

/** The reference the customer saw on the storefront confirmation, e.g. TRADE-7DGA0XWI. */
export function tradeInReference(tradeIn: Pick<TradeIn, 'id'>) {
  return customerRequestReference('trade-in', tradeIn.id)
}

export function tradeInMatches(tradeIn: TradeIn, term: string) {
  const needle = term.trim().toLowerCase()
  if (!needle) return true
  return [tradeInVehicleLabel(tradeIn), tradeIn.vin, tradeInCustomer(tradeIn), tradeIn.lead?.email, tradeIn.lead?.phone, tradeInReference(tradeIn)]
    .filter(Boolean).join(' ').toLowerCase().includes(needle)
}

/** Appraise, attach and acquire only apply to a live request; a closed one keeps Edit for corrections. */
export function tradeInActions(tradeIn: TradeIn, acquisition: TradeInAcquisition | null | undefined) {
  const closed = tradeInQueue(tradeIn, acquisition) === 'closed'
  return { closed, appraise: !closed, attach: !closed && !tradeIn.deal, acquire: !closed && !acquisition }
}

const lostReasonLabels: Record<string, string> = {
  'purchased-elsewhere': 'Purchased elsewhere', price: 'Price', financing: 'Financing',
  'vehicle-unavailable': 'Vehicle unavailable', 'no-response': 'No response', timing: 'Timing', other: 'Other',
}

/** Why a closed trade-in was closed, from its lost lead: "Other: QA test submission". */
export function tradeInClosedReason(tradeIn: Pick<TradeIn, 'lead'>) {
  const code = tradeIn.lead?.lostReasonCode
  const details = tradeIn.lead?.lostReason?.trim()
  const reason = code ? lostReasonLabels[code] || code : null
  if (reason && details) return `${reason}: ${details}`
  return reason || details || 'No reason recorded'
}

export function tradeInVehicleLabel(tradeIn: Pick<TradeIn, 'year' | 'make' | 'model' | 'trim'>) {
  return [tradeIn.year, tradeIn.make, tradeIn.model, tradeIn.trim].filter(Boolean).join(' ') || 'Unknown vehicle'
}

export function tradeInCustomer(tradeIn: Pick<TradeIn, 'lead'>) {
  return tradeIn.lead ? [tradeIn.lead.firstName, tradeIn.lead.lastName].filter(Boolean).join(' ') || 'Customer' : null
}

export function formatWholeUsd(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0)
}

export function formatMileage(value: number | null | undefined) {
  return value == null ? 'Mileage not entered' : `${new Intl.NumberFormat('en-US').format(value)} mi`
}

/** Preliminary wholesale number from the reference value, condition and mileage. Staff record the offer. */
export function preliminaryWholesaleEstimate(referenceValue: number, condition: string | null, mileage: number | null) {
  const conditionFactor = { excellent: 0.9, good: 0.82, fair: 0.72, poor: 0.58 }[condition || 'good'] || 0.78
  const mileagePenalty = Math.max(0, ((mileage || 0) - 90000) * 0.04)
  return Math.max(500, Math.round((referenceValue || 0) * conditionFactor - mileagePenalty))
}

export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/
