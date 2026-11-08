import type { DeskTone } from '@/features/platform/components/desk'
import type { TradeIn, TradeInAcquisition } from '../actions'
import { customerRequestReference } from '@/features/storefront/lib/customerRequests'
import { tradeInStatus } from '@/features/keystone/lifecycle/tradeInStatus'
import type { Locale } from '@/features/i18n/messages'

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

export function conditionLabel(value: string | null | undefined, locale: Locale = 'en-US') {
  if (!value) return locale === 'pt-BR' ? 'Não avaliado' : 'Not graded'
  const english = CONDITION_OPTIONS.find(option => option.value === value)?.label ?? value
  if (locale !== 'pt-BR') return english
  return ({ Excellent: 'Excelente', Good: 'Bom', Fair: 'Regular', Poor: 'Ruim' } as Record<string, string>)[english] || english
}

// Storefront requests store "Ownership: <own|financing|lease>[; customer-reported payoff: $X]" (submitTradeIn).
const ownershipLabel: Record<string, string> = { own: 'Owned', financing: 'Financed', lease: 'Leased' }

export function conditionNotes(value: string, locale: Locale = 'en-US') {
  if (locale !== 'pt-BR') {
    return value
      .replace(/^Ownership: (own|financing|lease)\b/, (_match, ownership: string) => `Ownership: ${ownershipLabel[ownership]}`)
      .replace(/; customer-reported payoff:/, '; Customer-reported payoff:')
  }
  const ownershipPt: Record<string, string> = { own: 'Quitado', financing: 'Financiado', lease: 'Leasing' }
  return value
    .replace(/^Ownership: (own|financing|lease)\b/, (_match, ownership: string) => `Propriedade: ${ownershipPt[ownership]}`)
    .replace(/; customer-reported payoff:/, '; Saldo de quitação informado pelo cliente:')
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

export function tradeInState(tradeIn: TradeIn, acquisition: TradeInAcquisition | null | undefined, locale: Locale = 'en-US'): { tone: DeskTone; label: string } {
  const queue = tradeInQueue(tradeIn, acquisition)
  if (locale === 'pt-BR') {
    if (queue === 'acquired') return { tone: 'ok', label: 'Em processo de entrada no estoque' }
    if (queue === 'on-deal') return { tone: tradeIn.deal?.status === 'cancelled' ? 'idle' : 'ok', label: tradeIn.deal?.status === 'pencil' ? 'Vinculado a uma prévia de venda' : 'Vinculado a uma venda' }
    if (queue === 'closed') return { tone: 'idle', label: 'Encerrado' }
    if (queue === 'offered') return { tone: 'info', label: 'Com proposta' }
    return { tone: 'warn', label: 'Aguardando avaliação' }
  }
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
export function tradeInClosedReason(tradeIn: Pick<TradeIn, 'lead'>, locale: Locale = 'en-US') {
  const code = tradeIn.lead?.lostReasonCode
  const details = tradeIn.lead?.lostReason?.trim()
  const english = code ? lostReasonLabels[code] || code : null
  const reason = locale === 'pt-BR' && english ? ({
    'Purchased elsewhere': 'Comprou em outro lugar', Price: 'Preço', Financing: 'Financiamento',
    'Vehicle unavailable': 'Veículo indisponível', 'No response': 'Sem resposta', Timing: 'Momento', Other: 'Outro',
  } as Record<string, string>)[english] || english : english
  if (reason && details) return `${reason}: ${details}`
  return reason || details || (locale === 'pt-BR' ? 'Nenhum motivo informado' : 'No reason recorded')
}

export function tradeInVehicleLabel(tradeIn: Pick<TradeIn, 'year' | 'make' | 'model' | 'trim'>, locale: Locale = 'en-US') {
  return [tradeIn.year, tradeIn.make, tradeIn.model, tradeIn.trim].filter(Boolean).join(' ') || (locale === 'pt-BR' ? 'Veículo não identificado' : 'Unknown vehicle')
}

export function tradeInCustomer(tradeIn: Pick<TradeIn, 'lead'>, locale: Locale = 'en-US') {
  return tradeIn.lead ? [tradeIn.lead.firstName, tradeIn.lead.lastName].filter(Boolean).join(' ') || (locale === 'pt-BR' ? 'Cliente' : 'Customer') : null
}

export function formatWholeUsd(value: number | null | undefined, locale: Locale = 'en-US', currencyCode = 'USD') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 }).format(value || 0)
}

export function formatMileage(value: number | null | undefined, locale: Locale = 'en-US') {
  if (value == null) return locale === 'pt-BR' ? 'Quilometragem não informada' : 'Mileage not entered'
  const distance = locale === 'pt-BR' ? value * 1.609344 : value
  const unit = locale === 'pt-BR' ? 'km' : 'mi'
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(distance)} ${unit}`
}

/** Preliminary wholesale number from the reference value, condition and mileage. Staff record the offer. */
export function preliminaryWholesaleEstimate(referenceValue: number, condition: string | null, mileage: number | null) {
  const conditionFactor = { excellent: 0.9, good: 0.82, fair: 0.72, poor: 0.58 }[condition || 'good'] || 0.78
  const mileagePenalty = Math.max(0, ((mileage || 0) - 90000) * 0.04)
  return Math.max(500, Math.round((referenceValue || 0) * conditionFactor - mileagePenalty))
}

export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/
