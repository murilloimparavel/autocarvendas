'use server'

import { revalidatePath } from 'next/cache'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { operatorCommandRequest } from '@/features/platform/lib/operatorCommandClient'
import { ROOFTOP_STAFF_QUERY } from '@/features/platform/lib/rooftopStaffQuery'
import type { DealDefaults, MoneyLine } from '@/features/keystone/lifecycle/dealPricing'

export type DealDeskDeal = {
  id: string
  vehiclePriceCents: number | null
  totalPriceCents: number | null
  status: string
  saleDate: string | null
  createdAt: string
  salesperson: { id: string; name: string } | null
  lead: { id: string; firstName: string; lastName: string } | null
  vehicle: { id: string; year: number; make: string; model: string; stockNumber: string } | null
}

export type DealLenderOffer = {
  id: string
  providerKey: string
  decision: string
  approvedAmountCents: number | null
  aprBasisPoints: number | null
  termMonths: number | null
  monthlyPaymentCents: number | null
  selected: boolean
}

export type DealWorksheetVersion = { id: string; snapshot: any; occurredAt: string }

export type DealSetupVehicle = {
  id: string
  stockNumber: string
  year: number
  make: string
  model: string
  price: number
  purchasePrice: number
  condition: string | null
  rooftop: { id: string }
}

export type DealSetupLead = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  rooftop: { id: string } | null
  interestedVehicle: { id: string } | null
  assignedSalesperson: { id: string } | null
}

export type DealTradeInOption = {
  id: string
  year: string | null
  make: string | null
  model: string | null
  trim: string | null
  vin: string | null
  offerAmountCents: number | null
  lead: { id: string } | null
  rooftop: { id: string } | null
}

export type DealTradeIn = { id: string; year: string | null; make: string | null; model: string | null; trim: string | null; vin: string | null; offerAmountCents: number | null }

export type DomainTimelineEntry = { id: string; action: string; occurredAt: string; afterSnapshot: unknown; actor: { name: string } | null }

type DealCommandResult = { id: string; status: string; reused: boolean; updatedAt: string }

function revalidateDeal(dealId?: string) {
  revalidatePath('/dashboard/platform/deals')
  if (dealId) revalidatePath(`/dashboard/platform/deals/${dealId}`)
}

export async function getDealDeskWorkspace(status: string) {
  return keystoneClient<{ dealDeskWorkspace: { deals: DealDeskDeal[] }; storefrontProfile: { currencyCode: string | null } | null }>(`
    query DealDeskWorkspace($status: String) {
      storefrontProfile { currencyCode }
      dealDeskWorkspace(status: $status, limit: 100) {
        deals { id vehiclePriceCents totalPriceCents status saleDate createdAt salesperson { id name } lead { id firstName lastName } vehicle { id year make model stockNumber } }
      }
    }
  `, { status }, { cache: 'no-store' })
}

const DEAL_DEFAULTS_FIELDS = 'salesTaxRateBps docFeeCents'
const TRADE_IN_OPTION_FIELDS = 'id year make model trim vin offerAmountCents lead { id } rooftop { id }'

function dealDefaults(profile: Partial<DealDefaults> | null | undefined): DealDefaults {
  return { salesTaxRateBps: Number(profile?.salesTaxRateBps) || 0, docFeeCents: Number(profile?.docFeeCents) || 0 }
}

export async function getDealWorkspace(id: string) {
  const response = await keystoneClient<{ dealWorkspace: { deal: any; worksheetVersions: DealWorksheetVersion[] }; dealershipProfile: Partial<DealDefaults> | null; storefrontProfile: { currencyCode: string | null } | null; dealTradeIn: { rooftop: { id: string } | null; tradeInVehicle: DealTradeIn | null } | null }>(`
    query DealWorkspace($id: ID!) {
      dealershipProfile { ${DEAL_DEFAULTS_FIELDS} }
      storefrontProfile { currencyCode }
      dealTradeIn: deal(where: { id: $id }) { rooftop { id } tradeInVehicle { id year make model trim vin offerAmountCents } }
      dealWorkspace(id: $id) {
        deal { id financeEvidence vehiclePriceCents tradeInValueCents downPaymentCents financingAmountCents monthlyPaymentCents loanTerm apr taxAmountCents totalPriceCents fees rebates products taxLines residualValueCents moneyFactorBasisPoints status structureType worksheetVersion presentedAt acceptedAt saleDate createdAt updatedAt salesperson { id name } lead { id firstName lastName } vehicle { id year make model trim exteriorColor condition stockNumber vin priceCents } approvals { id decision approvalDate notes approver { name } } }
        worksheetVersions { id snapshot occurredAt }
      }
    }
  `, { id }, { cache: 'no-store' })
  if (!response.success) return response
  return {
    ...response,
    data: {
      ...response.data,
      dealDefaults: dealDefaults(response.data.dealershipProfile),
      currencyCode: response.data.storefrontProfile?.currencyCode || 'USD',
      rooftopId: response.data.dealTradeIn?.rooftop?.id ?? null,
      tradeIn: response.data.dealTradeIn?.tradeInVehicle ?? null,
    },
  }
}

export async function getDealLenderOffers(dealId: string) {
  return keystoneClient<{ dealLenderOffers: DealLenderOffer[] }>(`
    query DealLenderOffers($dealId: ID!) {
      dealLenderOffers(dealId: $dealId) { id providerKey decision approvedAmountCents aprBasisPoints termMonths monthlyPaymentCents selected }
    }
  `, { dealId }, { cache: 'no-store' })
}

export async function getDealTimeline(aggregateType: 'Deal' | 'FinanceFundingCase' | 'DeliveryCase', aggregateId: string) {
  return keystoneClient<{ domainTimeline: DomainTimelineEntry[] }>(`
    query DealTimeline($aggregateType: String!, $aggregateId: ID!) {
      domainTimeline(aggregateType: $aggregateType, aggregateId: $aggregateId, limit: 20) {
        id action occurredAt afterSnapshot actor { name }
      }
    }
  `, { aggregateType, aggregateId }, { cache: 'no-store' })
}

export async function getDealSetupOptions() {
  const [vehicles, leads, profile, tradeIns] = await Promise.all([
    keystoneClient<{ vehicles: DealSetupVehicle[] }>(`
      query DealSetupVehicles { vehicles(where: { status: { equals: "available" } }) { id stockNumber year make model price purchasePrice condition rooftop { id } } }
    `, {}, { cache: 'no-store' }),
    keystoneClient<{ leads: DealSetupLead[] }>(`
      query DealSetupLeads { leads(where: { status: { not: { equals: "closed-lost" } } }) { id firstName lastName email phone rooftop { id } interestedVehicle { id } assignedSalesperson { id } } }
    `, {}, { cache: 'no-store' }),
    keystoneClient<{ dealershipProfile: Partial<DealDefaults> | null; storefrontProfile: { currencyCode: string | null } | null }>(`
      query DealSetupDefaults { dealershipProfile { ${DEAL_DEFAULTS_FIELDS} } storefrontProfile { currencyCode } }
    `, {}, { cache: 'no-store' }),
    keystoneClient<{ tradeIns: DealTradeInOption[] }>(`
      query DealSetupTradeIns { tradeIns(where: { deal: null }, orderBy: { createdAt: desc }, take: 200) { ${TRADE_IN_OPTION_FIELDS} } }
    `, {}, { cache: 'no-store' }),
  ])
  if (!vehicles.success) return { success: false as const, error: vehicles.error }
  if (!leads.success) return { success: false as const, error: leads.error }
  return {
    success: true as const,
    data: {
      vehicles: vehicles.data.vehicles || [],
      leads: leads.data.leads || [],
      tradeIns: tradeIns.success ? tradeIns.data.tradeIns || [] : [],
      // The server applies the same defaults when it creates the pencil; this is the preview.
      dealDefaults: dealDefaults(profile.success ? profile.data.dealershipProfile : null),
      currencyCode: profile.success ? profile.data.storefrontProfile?.currencyCode || 'USD' : 'USD',
    },
  }
}

export async function getRooftopSalespeople(rooftopId: string) {
  return keystoneClient<{ users: Array<{ id: string; name: string }> }>(ROOFTOP_STAFF_QUERY, { rooftopId }, { cache: 'no-store' })
}

export async function createDealPencil(data: {
  rooftopId: string
  vehicleId: string
  leadId?: string
  salespersonId?: string
  tradeInId?: string
  vehiclePriceCents: number
  tradeInValueCents: number
  downPaymentCents: number
  idempotencyKey: string
}) {
  const response = await operatorCommandRequest<{ createDealPencil: { id: string } | null }>(`
    mutation CreateDealPencil($data: CreateDealPencilInput!) {
      createDealPencil(data: $data) { id }
    }
  `, { data })
  if (response.success) revalidateDeal()
  return response
}

export async function saveDealWorksheet(data: {
  dealId: string
  structureType: string
  vehiclePriceCents: number
  tradeInValueCents: number
  downPaymentCents: number
  monthlyPaymentCents: number
  loanTerm: number | null
  apr: number | null
  residualValueCents: number | null
  moneyFactorBasisPoints: number | null
  fees: MoneyLine[]
  rebates: MoneyLine[]
  products: MoneyLine[]
  taxLines: MoneyLine[]
  expectedUpdatedAt: string
  reason: string
  idempotencyKey: string
}) {
  const response = await keystoneClient<{ saveDealWorksheet: DealCommandResult }>(`
    mutation SaveDealWorksheet($data: SaveDealWorksheetInput!) {
      saveDealWorksheet(data: $data) { id status reused updatedAt }
    }
  `, { data })
  if (response.success) revalidateDeal(data.dealId)
  return response
}

export async function presentDealWorksheet(data: { dealId: string; expectedUpdatedAt: string; idempotencyKey: string }) {
  const response = await keystoneClient<{ presentDealWorksheet: DealCommandResult }>(`
    mutation PresentDealWorksheet($data: PresentDealWorksheetInput!) {
      presentDealWorksheet(data: $data) { id status reused updatedAt }
    }
  `, { data })
  if (response.success) revalidateDeal(data.dealId)
  return response
}

export async function acceptDealWorksheet(data: { dealId: string; expectedUpdatedAt: string; acknowledgment: string; idempotencyKey: string }) {
  const response = await keystoneClient<{ acceptDealWorksheet: DealCommandResult }>(`
    mutation AcceptDealWorksheet($data: AcceptDealWorksheetInput!) {
      acceptDealWorksheet(data: $data) { id status reused updatedAt }
    }
  `, { data })
  if (response.success) revalidateDeal(data.dealId)
  return response
}

export async function selectDealLenderOffer(data: { dealId: string; lenderDecisionId: string; expectedUpdatedAt: string; idempotencyKey: string }) {
  const response = await keystoneClient<{ selectDealLenderOffer: DealCommandResult }>(`
    mutation SelectDealLenderOffer($data: SelectDealLenderOfferInput!) {
      selectDealLenderOffer(data: $data) { id status reused updatedAt }
    }
  `, { data })
  if (response.success) revalidateDeal(data.dealId)
  return response
}

export async function reopenDealWorksheet(data: { dealId: string; expectedUpdatedAt: string; reason: string; idempotencyKey: string }) {
  const response = await keystoneClient<{ reopenDealWorksheet: DealCommandResult }>(`
    mutation ReopenDealWorksheet($data: ReopenDealWorksheetInput!) {
      reopenDealWorksheet(data: $data) { id status reused updatedAt }
    }
  `, { data })
  if (response.success) revalidateDeal(data.dealId)
  return response
}

export async function transitionDeal(input: { id: string; toStatus: string; notes: string; idempotencyKey: string }) {
  const response = await operatorCommandRequest<{ transitionDeal: { id: string; status: string; saleDate: string | null; lockedAt: string | null } | null }>(`
    mutation TransitionDeal($id: ID!, $toStatus: String!, $notes: String, $idempotencyKey: String!) {
      transitionDeal(id: $id, toStatus: $toStatus, notes: $notes, idempotencyKey: $idempotencyKey) { id status saleDate lockedAt }
    }
  `, input)
  if (response.success) revalidateDeal(input.id)
  return response
}

/** Trade-ins a pencil deal can take: same rooftop, not on another deal, and the deal's lead or none. */
export async function getAttachableTradeIns(rooftopId: string, leadId: string | null) {
  const response = await keystoneClient<{ tradeIns: DealTradeInOption[] }>(`
    query DealAttachableTradeIns($rooftopId: ID!) {
      tradeIns(where: { deal: null, rooftop: { id: { equals: $rooftopId } } }, orderBy: { createdAt: desc }, take: 100) { ${TRADE_IN_OPTION_FIELDS} }
    }
  `, { rooftopId }, { cache: 'no-store' })
  if (!response.success) return response
  return { ...response, data: { tradeIns: (response.data.tradeIns || []).filter(tradeIn => !leadId || !tradeIn.lead || tradeIn.lead.id === leadId) } }
}

export async function setDealTradeIn(data: { dealId: string; tradeInId: string | null; expectedUpdatedAt: string; reason?: string; idempotencyKey: string }) {
  const response = await operatorCommandRequest<{ setDealTradeIn: DealCommandResult }>(`
    mutation SetDealTradeIn($data: SetDealTradeInInput!) {
      setDealTradeIn(data: $data) { id status reused updatedAt }
    }
  `, { data })
  if (response.success) {
    revalidateDeal(data.dealId)
    revalidatePath('/dashboard/platform/trade-ins')
  }
  return response
}

/** A walk-in customer added from the new-deal form: an ordinary lead through `openLead`. */
export async function openWalkInLead(data: { rooftopId: string; firstName: string; lastName: string; email?: string; phone?: string; interestedVehicleId?: string; idempotencyKey: string }) {
  const response = await operatorCommandRequest<{ openLead: { id: string; assignedToId: string | null; reused: boolean } }>(`
    mutation OpenWalkInLead($data: OpenLeadInput!) {
      openLead(data: $data) { id assignedToId reused }
    }
  `, { data: { ...data, source: 'walk-in' } })
  if (response.success) revalidatePath('/dashboard/platform/crm')
  return response
}

/**
 * "Create worksheet": the pencil, then worksheet version 1 so the deal is ready to present.
 * Both keys derive from the form's one idempotency key, so a retry replays instead of duplicating.
 */
export async function createDealWorksheet(data: Parameters<typeof createDealPencil>[0]) {
  const created = await operatorCommandRequest<{ createDealPencil: { id: string; updatedAt: string } | null }>(`
    mutation CreateDealPencil($data: CreateDealPencilInput!) {
      createDealPencil(data: $data) { id updatedAt }
    }
  `, { data })
  if (!created.success || !created.data?.createDealPencil?.id) return { success: false as const, error: created.success ? 'The deal was not created' : created.error }
  const deal = created.data.createDealPencil
  // Fees and tax lines are omitted, so version 1 keeps the dealership defaults the pencil was seeded with.
  const saved = await operatorCommandRequest<{ saveDealWorksheet: DealCommandResult }>(`
    mutation SaveInitialWorksheet($data: SaveDealWorksheetInput!) {
      saveDealWorksheet(data: $data) { id status reused updatedAt }
    }
  `, { data: {
    dealId: deal.id,
    structureType: 'cash',
    vehiclePriceCents: data.vehiclePriceCents,
    tradeInValueCents: data.tradeInValueCents,
    downPaymentCents: data.downPaymentCents,
    monthlyPaymentCents: 0,
    loanTerm: null,
    apr: null,
    residualValueCents: null,
    moneyFactorBasisPoints: null,
    expectedUpdatedAt: deal.updatedAt,
    reason: 'Initial worksheet',
    idempotencyKey: `${data.idempotencyKey}:worksheet-1`,
  } })
  revalidateDeal(deal.id)
  return { success: true as const, data: { dealId: deal.id, worksheetError: saved.success ? null : saved.error || 'The worksheet was not saved' } }
}
