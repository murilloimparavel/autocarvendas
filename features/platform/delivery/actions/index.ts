'use server'

import { revalidatePath } from 'next/cache'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { operatorCommandRequest } from '@/features/platform/lib/operatorCommandClient'
import { ROOFTOP_STAFF_QUERY } from '@/features/platform/lib/rooftopStaffQuery'

export type DeliveryRecord = {
  id: string
  status: string
  updatedAt: string
  saleDate: string | null
  financeEvidence: unknown
  vehicle: { id: string; vin: string; stockNumber: string; year: number; make: string; model: string; status: string } | null
  lead: { id: string; firstName: string; lastName: string } | null
  salesperson: { id: string; name: string } | null
}

export type DeliveryChecklistItem = { code: string; status: string; evidenceReference?: string; source?: string }
export type WeOwe = { id: string; description: string; status: string; promisedAt: string; estimatedCostCents: number | null; owner: { id: string; name: string } | null }
export type DeliveryCase = {
  id: string
  updatedAt: string
  deliverySnapshot: unknown
  deal: { id: string } | null
  status: string
  appointmentAt: string | null
  checklist: DeliveryChecklistItem[] | null
  customerAcknowledgment: string | null
  weOweItems: WeOwe[]
}

export type DeliveryWorkspace = { deliveries: DeliveryRecord[]; cases: DeliveryCase[]; rooftopByDeal: Record<string, string> }

const DELIVERY_PATH = '/dashboard/platform/delivery'

export async function getDeliveryCurrencyCode() {
  const response = await keystoneClient<{ storefrontProfile: { currencyCode: string | null } | null }>(`
    query DeliveryCurrency { storefrontProfile { currencyCode } }
  `, {}, { cache: 'no-store' })
  return response.success ? response.data.storefrontProfile?.currencyCode || 'USD' : 'USD'
}

export async function getDeliveryWorkspace() {
  const response = await keystoneClient<{ deliveryWorkspace: Omit<DeliveryWorkspace, 'rooftopByDeal'>; deals: Array<{ id: string; rooftop: { id: string } | null }> }>(`
    query DeliveryWorkspace {
      deliveryWorkspace(limit: 100) {
        deliveries { id financeEvidence status updatedAt saleDate vehicle { id vin stockNumber year make model status } lead { id firstName lastName } salesperson { id name } }
        cases { id updatedAt deliverySnapshot deal { id } status appointmentAt checklist customerAcknowledgment weOweItems { id description status promisedAt estimatedCostCents owner { id name } } }
      }
      deals(where: { status: { in: ["financed", "delivered"] } }, orderBy: { updatedAt: asc }, take: 100) { id rooftop { id } }
    }
  `, {}, { cache: 'no-store' })
  if (!response.success) return response
  const rooftopByDeal = Object.fromEntries((response.data.deals || []).flatMap(deal => (deal.rooftop?.id ? [[deal.id, deal.rooftop.id]] : [])))
  return { success: true as const, data: { deliveryWorkspace: { ...response.data.deliveryWorkspace, rooftopByDeal } } }
}

export async function getDeliveryStaff(rooftopId: string) {
  return keystoneClient<{ users: Array<{ id: string; name: string }> }>(ROOFTOP_STAFF_QUERY, { rooftopId }, { cache: 'no-store' })
}

export async function manageDeliveryCase(data: {
  dealId: string
  action: 'schedule' | 'arrive' | 'record-checklist' | 'acknowledge' | 'cancel'
  appointmentAt?: string
  checklist?: DeliveryChecklistItem[]
  customerAcknowledgment?: string
  reason?: string
  idempotencyKey: string
}) {
  const response = await operatorCommandRequest(`
    mutation ManageDeliveryCase($data: ManageDeliveryCaseInput!) {
      manageDeliveryCase(data: $data) { id status }
    }
  `, { data })
  if (response.success) revalidatePath(DELIVERY_PATH)
  return response
}

export async function completeDealDelivery(data: {
  dealId: string
  expectedUpdatedAt: string
  expectedFundingUpdatedAt: string
  expectedDeliveryCaseUpdatedAt: string
  idempotencyKey: string
}) {
  const response = await operatorCommandRequest(`
    mutation CompleteDealDelivery($data: CompleteDealDeliveryInput!) {
      completeDealDelivery(data: $data) { id status reused updatedAt }
    }
  `, { data })
  if (response.success) revalidatePath(DELIVERY_PATH)
  return response
}

export async function manageWeOweItem(data: {
  dealId: string
  itemId?: string
  action: 'create' | 'update' | 'fulfill' | 'waive'
  description?: string
  promisedAt?: string
  ownerId?: string
  estimatedCostCents?: number
  fulfillmentEvidence?: string
  customerAcknowledgment?: string
  idempotencyKey: string
}) {
  const response = await operatorCommandRequest(`
    mutation ManageWeOwe($data: ManageWeOweItemInput!) {
      manageWeOweItem(data: $data) { id status }
    }
  `, { data })
  if (response.success) revalidatePath(DELIVERY_PATH)
  return response
}
