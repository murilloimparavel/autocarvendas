'use server'

import { revalidatePath } from 'next/cache'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { operatorCommandRequest } from '@/features/platform/lib/operatorCommandClient'
import { inventoryCommandRequest } from '@/features/platform/vehicles/lib/inventoryCommandClient'

export type TradeInLead = { id: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null; status?: string | null; lostReasonCode?: string | null; lostReason?: string | null }
export type TradeInDealRef = {
  id: string
  status: string | null
  updatedAt?: string | null
  tradeInValueCents?: number | null
  vehicle: { year: number | null; make: string | null; model: string | null; stockNumber?: string | null } | null
}

export type TradeIn = {
  id: string
  createdAt: string | null
  updatedAt: string | null
  vin: string | null
  year: string | null
  make: string | null
  model: string | null
  trim: string | null
  mileage: number | null
  condition: string | null
  exteriorCondition: string | null
  interiorCondition: string | null
  mechanicalIssues: string | null
  referenceValue: number | null
  offerAmount: number | null
  rooftop: { id: string; name: string | null } | null
  appraisedBy: { id: string; name: string | null } | null
  lead: TradeInLead | null
  deal: TradeInDealRef | null
}

export type TradeInAcquisition = { id: string; reference: string; status: string; sourceReference: string | null; vehicle: { id: string; stockNumber: string | null } | null }
export type TradeInTimelineEntry = { id: string; action: string; occurredAt: string; actor: { name: string } | null }
export type TradeInRooftop = { id: string; name: string }
export type TradeInLeadOption = { id: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null; rooftop: { id: string } | null }
export type PencilDealOption = {
  id: string
  updatedAt: string
  tradeInValueCents: number | null
  lead: { id: string; firstName: string | null; lastName: string | null } | null
  vehicle: { year: number | null; make: string | null; model: string | null; stockNumber: string | null } | null
  rooftop: { id: string } | null
}

type CommandResult = { id: string; status: string | null; updatedAt: string; reused: boolean }

const TRADE_INS_PATH = '/dashboard/platform/trade-ins'

const TRADE_IN_FIELDS = `
  id createdAt updatedAt vin year make model trim mileage condition exteriorCondition interiorCondition mechanicalIssues
  referenceValue offerAmount
  rooftop { id name }
  appraisedBy { id name }
  lead { id firstName lastName email phone status lostReasonCode lostReason }
  deal { id status updatedAt tradeInValueCents vehicle { year make model stockNumber } }
`

function revalidateTradeIn(id?: string) {
  revalidatePath(TRADE_INS_PATH)
  if (id) revalidatePath(`${TRADE_INS_PATH}/${id}`)
}

/** Acquisitions started from a trade-in carry `trade-in:<id>` as their source reference. */
function acquisitionsByTradeIn(rows: TradeInAcquisition[]) {
  const map: Record<string, TradeInAcquisition> = {}
  for (const row of rows) {
    const id = row.sourceReference?.startsWith('trade-in:') ? row.sourceReference.slice('trade-in:'.length) : null
    if (id && !map[id]) map[id] = row
  }
  return map
}

export async function getTradeIns() {
  const [tradeIns, acquisitions] = await Promise.all([
    keystoneClient<{ tradeIns: TradeIn[] }>(`
      query TradeInDesk {
        tradeIns(orderBy: { createdAt: desc }, take: 200) { ${TRADE_IN_FIELDS} }
      }
    `, {}, { cache: 'no-store' }),
    // Only inventory managers can read acquisitions; everyone else sees no acquisition state.
    keystoneClient<{ inventoryAcquisitions: TradeInAcquisition[] }>(`
      query TradeInAcquisitions {
        inventoryAcquisitions(where: { acquisitionSource: { equals: "trade-in" } }, orderBy: { createdAt: desc }, take: 500) { id reference status sourceReference vehicle { id stockNumber } }
      }
    `, {}, { cache: 'no-store' }),
  ])
  if (!tradeIns.success) return { success: false as const, error: tradeIns.error }
  return {
    success: true as const,
    data: {
      tradeIns: tradeIns.data.tradeIns || [],
      acquisitions: acquisitions.success ? acquisitionsByTradeIn(acquisitions.data.inventoryAcquisitions || []) : {},
      canSeeAcquisitions: acquisitions.success,
    },
  }
}

export async function getTradeIn(id: string) {
  const [tradeIn, acquisitions, timeline] = await Promise.all([
    keystoneClient<{ tradeIn: TradeIn | null }>(`
      query TradeInDetail($id: ID!) { tradeIn(where: { id: $id }) { ${TRADE_IN_FIELDS} } }
    `, { id }, { cache: 'no-store' }),
    keystoneClient<{ inventoryAcquisitions: TradeInAcquisition[] }>(`
      query TradeInAcquisition($reference: String!) {
        inventoryAcquisitions(where: { sourceReference: { equals: $reference } }, orderBy: { createdAt: desc }, take: 1) { id reference status sourceReference vehicle { id stockNumber } }
      }
    `, { reference: `trade-in:${id}` }, { cache: 'no-store' }),
    keystoneClient<{ domainTimeline: TradeInTimelineEntry[] }>(`
      query TradeInTimeline($id: ID!) { domainTimeline(aggregateType: "TradeIn", aggregateId: $id, limit: 20) { id action occurredAt actor { name } } }
    `, { id }, { cache: 'no-store' }),
  ])
  if (!tradeIn.success) return { success: false as const, error: tradeIn.error }
  return {
    success: true as const,
    data: {
      tradeIn: tradeIn.data.tradeIn,
      acquisition: acquisitions.success ? acquisitions.data.inventoryAcquisitions?.[0] ?? null : null,
      canSeeAcquisitions: acquisitions.success,
      timeline: timeline.success ? timeline.data.domainTimeline || [] : [],
    },
  }
}

export async function getTradeInCreateOptions() {
  const [rooftops, leads] = await Promise.all([
    keystoneClient<{ rooftops: TradeInRooftop[] }>(`
      query TradeInRooftops { rooftops(where: { status: { equals: "active" } }, orderBy: { name: asc }, take: 100) { id name } }
    `, {}, { cache: 'no-store' }),
    keystoneClient<{ leads: TradeInLeadOption[] }>(`
      query TradeInLeads { leads(where: { status: { notIn: ["closed-lost", "closed-won"] } }, orderBy: { createdAt: desc }, take: 300) { id firstName lastName email phone rooftop { id } } }
    `, {}, { cache: 'no-store' }),
  ])
  if (!rooftops.success) return { success: false as const, error: rooftops.error }
  return { success: true as const, data: { rooftops: rooftops.data.rooftops || [], leads: leads.success ? leads.data.leads || [] : [] } }
}

export async function getPencilDealsForTradeIn() {
  return keystoneClient<{ deals: PencilDealOption[] }>(`
    query TradeInPencilDeals {
      deals(where: { status: { equals: "pencil" }, tradeInVehicle: null }, orderBy: { createdAt: desc }, take: 100) {
        id updatedAt tradeInValueCents rooftop { id } lead { id firstName lastName } vehicle { year make model stockNumber }
      }
    }
  `, {}, { cache: 'no-store' })
}

export async function createWalkInTradeIn(data: {
  rooftopId: string
  leadId?: string
  vin?: string
  year: string
  make: string
  model: string
  trim?: string
  mileage?: number | null
  condition?: string
  exteriorCondition?: string
  interiorCondition?: string
  mechanicalIssues?: string
  idempotencyKey: string
}) {
  const response = await operatorCommandRequest<{ createWalkInTradeIn: CommandResult }>(`
    mutation CreateWalkInTradeIn($data: CreateWalkInTradeInInput!) {
      createWalkInTradeIn(data: $data) { id status updatedAt reused }
    }
  `, { data })
  if (response.success) revalidateTradeIn()
  return response
}

export async function updateTradeInDetails(id: string, data: {
  vin: string
  year: string
  make: string
  model: string
  trim: string
  mileage: number | null
  condition: string | null
  exteriorCondition: string
  interiorCondition: string
  mechanicalIssues: string
}) {
  const response = await keystoneClient<{ updateTradeIn: { id: string } | null }>(`
    mutation UpdateTradeInDetails($id: ID!, $data: TradeInUpdateInput!) {
      updateTradeIn(where: { id: $id }, data: $data) { id }
    }
  `, { id, data })
  if (response.success) revalidateTradeIn(id)
  return response
}

export async function recordTradeInAppraisal(data: {
  id: string
  referenceValueCents: number
  offerAmountCents: number
  idempotencyKey: string
}) {
  const response = await operatorCommandRequest<{ recordTradeInAppraisal: { id: string } | null }>(`
    mutation RecordTradeInAppraisal($data: RecordTradeInAppraisalInput!) {
      recordTradeInAppraisal(data: $data) { id }
    }
  `, { data })
  if (response.success) revalidateTradeIn(data.id)
  return response
}

export async function setDealTradeIn(data: {
  dealId: string
  tradeInId?: string | null
  expectedUpdatedAt: string
  reason?: string
  idempotencyKey: string
}) {
  const response = await operatorCommandRequest<{ setDealTradeIn: CommandResult }>(`
    mutation SetDealTradeIn($data: SetDealTradeInInput!) {
      setDealTradeIn(data: $data) { id status updatedAt reused }
    }
  `, { data })
  if (response.success) {
    revalidateTradeIn(data.tradeInId || undefined)
    revalidatePath('/dashboard/platform/deals')
    revalidatePath(`/dashboard/platform/deals/${data.dealId}`)
  }
  return response
}

export async function acquireTradeIn(data: {
  tradeInId: string
  rooftopId: string
  vin: string
  year: number
  make: string
  model: string
  odometer: number | null
  appraisalCents: number
  reconEstimateCents: number | null
  reason: string
}) {
  const response = await inventoryCommandRequest<{ startInventoryAcquisition: { id: string; reference: string; status: string } | null }>(`
    mutation AcquireTradeIn($data: StartInventoryAcquisitionInput!) {
      startInventoryAcquisition(data: $data) { id reference status }
    }
  `, {
    data: {
      rooftopId: data.rooftopId,
      // One acquisition per trade-in: a retry returns the acquisition already started.
      idempotencyKey: `trade-in-acquisition:${data.tradeInId}`,
      reason: data.reason,
      acquisitionSource: 'trade-in',
      sourceReference: `trade-in:${data.tradeInId}`,
      vin: data.vin,
      year: data.year,
      make: data.make,
      model: data.model,
      odometer: data.odometer,
      appraisalCents: data.appraisalCents,
      reconEstimateCents: data.reconEstimateCents,
    },
  })
  if (response.success) {
    revalidateTradeIn(data.tradeInId)
    revalidatePath('/dashboard/platform/vehicles')
  }
  return response
}
