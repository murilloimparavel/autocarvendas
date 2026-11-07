'use server'

import { revalidatePath } from 'next/cache'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { operatorCommandRequest } from '@/features/platform/lib/operatorCommandClient'

import type { OpenRepairOrder, Part, PartsMovement, PartsRooftop, PurchaseOrder } from '../lib/types'

const PARTS_PATH = '/dashboard/platform/parts'

const PART_FIELDS = 'id partNumber description binLocation quantity committedQuantity onOrderQuantity minimumQuantity costCents priceCents supplier supplierPartNumber updatedAt rooftop { id name }'
const PO_FIELDS = 'id reference supplier status lines orderedAt receivedAt createdAt updatedAt rooftop { id name }'

export async function getPartsCurrencyCode() {
  const response = await keystoneClient<{ storefrontProfile: { currencyCode: string | null } | null }>(`
    query PartsCurrency { storefrontProfile { currencyCode } }
  `, {}, { cache: 'no-store' })
  return response.success ? response.data.storefrontProfile?.currencyCode || 'USD' : 'USD'
}

export async function getPartsCatalog() {
  return keystoneClient<{ partsInventories: Part[]; rooftops: PartsRooftop[] }>(`
    query PartsCatalog {
      partsInventories(orderBy: [{ partNumber: asc }], take: 1000) { ${PART_FIELDS} }
      rooftops(where: { status: { equals: "active" } }, orderBy: [{ name: asc }], take: 100) { id name }
    }
  `, {}, { cache: 'no-store' })
}

export async function getPartDetail(id: string) {
  return keystoneClient<{
    partsInventory: Part | null
    partsMovements: PartsMovement[]
    serviceOrders: OpenRepairOrder[]
    purchaseOrders: PurchaseOrder[]
  }>(`
    query PartDetail($id: ID!) {
      partsInventory(where: { id: $id }) { ${PART_FIELDS} }
      partsMovements(where: { part: { id: { equals: $id } } }, orderBy: [{ occurredAt: desc }], take: 500) {
        id movementType quantityDelta onHandAfter committedAfter onOrderAfter reference reason occurredAt evidence
        serviceOrder { id status invoiceNumber }
      }
      serviceOrders(where: { status: { in: ["estimate", "approved", "in-progress"] } }, orderBy: [{ updatedAt: desc }], take: 200) {
        id status invoiceNumber concern rooftop { id }
        appointment { customerVehicleDescription lead { firstName lastName } }
      }
      purchaseOrders: partsPurchaseOrders(where: { status: { in: ["draft", "ordered", "partially-received"] } }, orderBy: [{ updatedAt: desc }], take: 200) { ${PO_FIELDS} }
    }
  `, { id }, { cache: 'no-store' })
}

export async function getPurchaseOrders() {
  return keystoneClient<{ partsPurchaseOrders: PurchaseOrder[]; partsInventories: Part[]; rooftops: PartsRooftop[] }>(`
    query PartsPurchaseOrders {
      partsPurchaseOrders(orderBy: [{ updatedAt: desc }], take: 500) { ${PO_FIELDS} }
      partsInventories(orderBy: [{ partNumber: asc }], take: 1000) { ${PART_FIELDS} }
      rooftops(where: { status: { equals: "active" } }, orderBy: [{ name: asc }], take: 100) { id name }
    }
  `, {}, { cache: 'no-store' })
}

export async function getPurchaseOrder(id: string) {
  return keystoneClient<{ partsPurchaseOrder: PurchaseOrder | null; partsInventories: Part[] }>(`
    query PartsPurchaseOrder($id: ID!) {
      partsPurchaseOrder(where: { id: $id }) { ${PO_FIELDS} }
      partsInventories(orderBy: [{ partNumber: asc }], take: 1000) { ${PART_FIELDS} }
    }
  `, { id }, { cache: 'no-store' })
}

export type SavePartInput = {
  partId?: string
  rooftopId?: string
  partNumber: string
  description: string
  binLocation: string
  minimumQuantity: number
  costCents: number
  priceCents: number
  supplier: string
  supplierPartNumber: string
  expectedUpdatedAt?: string
  idempotencyKey: string
}

export async function savePart(data: SavePartInput) {
  if (!data.partId) {
    // configurePart upserts by part number; a new part must not overwrite an existing one.
    const existing = await keystoneClient<{ partsInventories: Array<{ id: string }> }>(`
      query ExistingPart($rooftopId: ID!, $partNumber: String!) {
        partsInventories(where: { rooftop: { id: { equals: $rooftopId } }, partNumber: { equals: $partNumber } }, take: 1) { id }
      }
    `, { rooftopId: data.rooftopId, partNumber: data.partNumber.trim().toUpperCase() }, { cache: 'no-store' })
    if (existing.success && existing.data.partsInventories.length) {
      return { success: false as const, error: `Part number ${data.partNumber.trim().toUpperCase()} already exists`, rejected: true, field: 'partNumber' }
    }
  }
  const response = await operatorCommandRequest<{ configurePart: { id: string } }>(`
    mutation ConfigurePart($data: ConfigurePartInput!) {
      configurePart(data: $data) { id }
    }
  `, { data })
  if (response.success) revalidatePath(PARTS_PATH)
  return response
}

export type RecordMovementInput = {
  partId: string
  movementType: string
  quantity: number
  quantityDelta?: number
  serviceOrderId?: string
  reference: string
  reason: string
  idempotencyKey: string
}

export async function recordMovement(data: RecordMovementInput) {
  const response = await operatorCommandRequest<{ recordPartsMovement: { id: string } }>(`
    mutation RecordPartsMovement($data: RecordPartsMovementInput!) {
      recordPartsMovement(data: $data) { id }
    }
  `, { data })
  if (response.success) revalidatePath(PARTS_PATH)
  return response
}

export type ManagePurchaseOrderInput = {
  action: 'create' | 'update' | 'order' | 'receive' | 'close' | 'cancel'
  purchaseOrderId?: string
  rooftopId?: string
  reference?: string
  supplier?: string
  lines?: Array<{ partId: string; quantity: number; unitCostCents: number }>
  receiptLines?: Array<{ partId: string; quantity: number }>
  expectedUpdatedAt?: string
  idempotencyKey: string
}

export async function managePurchaseOrder(data: ManagePurchaseOrderInput) {
  const response = await operatorCommandRequest<{ managePartsPurchaseOrder: { id: string; status: string } }>(`
    mutation ManagePartsPurchaseOrder($data: ManagePartsPurchaseOrderInput!) {
      managePartsPurchaseOrder(data: $data) { id status }
    }
  `, { data })
  if (response.success) revalidatePath(PARTS_PATH)
  return response
}
