'use server'

import { revalidatePath } from 'next/cache'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { operatorCommandRequest } from '@/features/platform/lib/operatorCommandClient'
import { ROOFTOP_STAFF_QUERY } from '@/features/platform/lib/rooftopStaffQuery'

import type { FixedOpsWorkspace, ServiceAppointmentDetail, ServiceOrderDetail, ServicePartOption } from '../lib/types'

const SERVICE_PATH = '/dashboard/platform/service'

type CommandResult = { id: string; status: string | null; updatedAt: string; reused: boolean }

async function command<T = unknown>(query: string, variables: Record<string, unknown>) {
  const response = await operatorCommandRequest<T>(query, variables)
  if (response.success) revalidatePath(SERVICE_PATH, 'layout')
  return response
}

export async function getFixedOpsWorkspace() {
  return keystoneClient<{ fixedOpsWorkspace: FixedOpsWorkspace }>(`
    query FixedOpsWorkspace {
      fixedOpsWorkspace(limit: 100) {
        serviceRooftops { id name }
        appointments { id rooftop { id } appointmentDate serviceType servicePackage { id name } status customerVehicleDescription description estimatedDuration mileageIn advisorNotes lead { id firstName lastName email phone } assignedTech { id name } serviceOrder { id status grandTotalCents } }
        orders { id rooftop { id name } status concern cause correction payType authorizationEvidence authorizationStatus invoiceNumber laborOperations { id operationCode description status technician { id name } } lineItems { id itemType description partNumber quantity unitPriceCents priceCents } laborTotalCents partsTotalCents taxCents grandTotalCents completedAt updatedAt appointment { id appointmentDate serviceType servicePackage { id name } customerVehicleDescription assignedTech { name } } }
        parts { id partNumber description quantity minimumQuantity priceCents supplier }
      }
    }
  `, {}, { cache: 'no-store' })
}

const ORDER_DETAIL_FIELDS = `
  id status updatedAt createdAt concern cause correction payType authorizationStatus authorizationEvidence invoiceNumber diagnosis
  laborTotalCents partsTotalCents taxCents grandTotalCents completedAt lockedAt settledAt
  rooftop { id name }
  appointment {
    id status appointmentDate serviceType servicePackage { id name } description customerVehicleDescription vehicleVin mileageIn transportationNeed advisorNotes
    assignedTech { id name }
    lead { id firstName lastName email phone }
  }
  laborOperations(orderBy: { createdAt: asc }) { id operationCode description status soldHours actualMinutes startedAt completedAt technician { id name } }
  lineItems(orderBy: { createdAt: asc }) { id itemType description partNumber quantity unitPriceCents priceCents }
  partsMovements(orderBy: { occurredAt: desc }) { id movementType quantityDelta reference occurredAt part { id partNumber description } }
`

export async function getServiceOrderDetail(id: string) {
  const response = await keystoneClient<{ serviceOrder: ServiceOrderDetail | null }>(`
    query ServiceOrderDetail($id: ID!) { serviceOrder(where: { id: $id }) { ${ORDER_DETAIL_FIELDS} } }
  `, { id }, { cache: 'no-store' })
  if (!response.success) return response
  if (!response.data.serviceOrder) return { success: false as const, error: 'Repair order not found' }
  // Payments are readable with reporting permission only; settlement needs that permission too.
  const payments = await keystoneClient<{ serviceOrder: { paymentTransactions: ServiceOrderDetail['payments'] } | null }>(`
    query ServiceOrderPayments($id: ID!) { serviceOrder(where: { id: $id }) { paymentTransactions(orderBy: { createdAt: desc }) { id status amountCents capturedCents refundedCents providerKey providerTransactionId createdAt } } }
  `, { id }, { cache: 'no-store' })
  const paymentRows = payments.success ? payments.data.serviceOrder?.paymentTransactions ?? null : null
  return { success: true as const, data: { ...response.data.serviceOrder, payments: paymentRows } }
}

export async function getServiceAppointmentDetail(id: string) {
  const response = await keystoneClient<{ serviceAppointment: ServiceAppointmentDetail | null }>(`
    query ServiceAppointmentDetail($id: ID!) {
      serviceAppointment(where: { id: $id }) {
        id status updatedAt createdAt appointmentDate serviceType servicePackage { id name } description estimatedDuration customerVehicleDescription vehicleVin mileageIn transportationNeed capacitySlot advisorNotes
        rooftop { id name }
        assignedTech { id name }
        lead { id firstName lastName email phone }
        serviceOrder { id status grandTotalCents authorizationStatus }
      }
    }
  `, { id }, { cache: 'no-store' })
  if (!response.success) return response
  if (!response.data.serviceAppointment) return { success: false as const, error: 'Appointment not found' }
  return { success: true as const, data: response.data.serviceAppointment }
}

export async function getServicePartOptions(rooftopId: string) {
  return keystoneClient<{ partsInventories: ServicePartOption[] }>(`
    query ServicePartOptions($rooftopId: ID!) {
      partsInventories(where: { rooftop: { id: { equals: $rooftopId } } }, orderBy: { partNumber: asc }, take: 500) { id partNumber description quantity committedQuantity priceCents }
    }
  `, { rooftopId }, { cache: 'no-store' })
}

export async function getServiceTaxRate() {
  const response = await keystoneClient<{ dealershipProfile: { salesTaxRateBps: number | null } | null }>(`
    query ServiceTaxRate { dealershipProfile { salesTaxRateBps } }
  `, {}, { cache: 'no-store' })
  return response.success ? response.data.dealershipProfile?.salesTaxRateBps ?? null : null
}

export async function getServiceCurrencyCode() {
  const response = await keystoneClient<{ storefrontProfile: { currencyCode: string | null } | null }>(`
    query ServiceCurrency { storefrontProfile { currencyCode } }
  `, {}, { cache: 'no-store' })
  return response.success ? response.data.storefrontProfile?.currencyCode || 'USD' : 'USD'
}

export async function getRooftopStaff(rooftopId: string) {
  return keystoneClient<{ users: Array<{ id: string; name: string }> }>(ROOFTOP_STAFF_QUERY, { rooftopId })
}

export async function transitionServiceAppointment(input: { id: string; toStatus: string; idempotencyKey: string }) {
  return command<{ transitionServiceAppointment: { id: string; status: string } }>(`
    mutation TransitionServiceAppointment($id: ID!, $toStatus: String!, $idempotencyKey: String!) {
      transitionServiceAppointment(id: $id, toStatus: $toStatus, idempotencyKey: $idempotencyKey) { id status }
    }
  `, input)
}

/** Appointment details are open CRUD for service staff (ServiceAppointment.ts); status stays command-only. */
export async function updateServiceAppointment(id: string, data: Record<string, unknown>) {
  const response = await keystoneClient<{ updateServiceAppointment: { id: string } | null }>(`
    mutation UpdateServiceAppointment($id: ID!, $data: ServiceAppointmentUpdateInput!) {
      updateServiceAppointment(where: { id: $id }, data: $data) { id }
    }
  `, { id, data })
  if (response.success) revalidatePath(SERVICE_PATH, 'layout')
  return response
}

export async function transitionServiceOrder(input: { id: string; toStatus: string; idempotencyKey: string; invoiceNumber?: string }) {
  return command<{ transitionServiceOrder: { id: string; status: string } }>(`
    mutation TransitionServiceOrder($id: ID!, $toStatus: String!, $idempotencyKey: String!, $invoiceNumber: String) {
      transitionServiceOrder(id: $id, toStatus: $toStatus, idempotencyKey: $idempotencyKey, invoiceNumber: $invoiceNumber) { id status }
    }
  `, input)
}

export async function openServiceOrder(data: {
  appointmentId: string
  idempotencyKey: string
  diagnosis: string
  laborTotalCents: number
  partsTotalCents: number
  taxCents: number
  grandTotalCents: number
}) {
  return command<{ openServiceOrder: { id: string } }>(`
    mutation OpenServiceOrder($data: OpenServiceOrderInput!) {
      openServiceOrder(data: $data) { id }
    }
  `, { data })
}

export async function recordServiceOrderEvidence(data: Record<string, unknown>) {
  return command<{ recordServiceOrderEvidence: { id: string } }>(`
    mutation RecordServiceOrderEvidence($data: RecordServiceOrderEvidenceInput!) {
      recordServiceOrderEvidence(data: $data) { id }
    }
  `, { data })
}

export async function addServiceOrderLineItem(data: Record<string, unknown>) {
  return command<{ addServiceOrderLineItem: CommandResult }>(`
    mutation AddServiceOrderLineItem($data: AddServiceOrderLineInput!) {
      addServiceOrderLineItem(data: $data) { id status updatedAt reused }
    }
  `, { data })
}

export async function updateServiceOrderLineItem(data: Record<string, unknown>) {
  return command<{ updateServiceOrderLineItem: CommandResult }>(`
    mutation UpdateServiceOrderLineItem($data: UpdateServiceOrderLineInput!) {
      updateServiceOrderLineItem(data: $data) { id status updatedAt reused }
    }
  `, { data })
}

export async function removeServiceOrderLineItem(data: Record<string, unknown>) {
  return command<{ removeServiceOrderLineItem: CommandResult }>(`
    mutation RemoveServiceOrderLineItem($data: RemoveServiceOrderLineInput!) {
      removeServiceOrderLineItem(data: $data) { id status updatedAt reused }
    }
  `, { data })
}

export async function setServiceOrderTax(data: Record<string, unknown>) {
  return command<{ setServiceOrderTax: CommandResult }>(`
    mutation SetServiceOrderTax($data: SetServiceOrderTaxInput!) {
      setServiceOrderTax(data: $data) { id status updatedAt reused }
    }
  `, { data })
}

export async function manageLaborOperation(data: Record<string, unknown>) {
  return command<{ manageLaborOperation: { id: string } }>(`
    mutation ManageLaborOperation($data: ManageLaborOperationInput!) {
      manageLaborOperation(data: $data) { id }
    }
  `, { data })
}

type BookingPayload = { ok: boolean; errorCode?: string | null; errorMessage?: string | null; serviceAppointmentId?: string | null }

/** Books a phone or walk-in customer through the same command the storefront uses. */
export async function bookServiceAppointment(data: {
  customerName: string
  customerEmail: string
  customerPhone: string
  appointmentDate: string
  appointmentTime: string
  serviceType: string
  vehicleYear: number
  vehicleMake: string
  vehicleModel: string
  description?: string
  idempotencyKey: string
}) {
  const response = await keystoneClient<{ submitServiceBooking: BookingPayload }>(`
    mutation BookServiceAppointment($data: SubmitServiceBookingInput!) {
      submitServiceBooking(data: $data) { ok errorCode errorMessage serviceAppointmentId }
    }
  `, { data })
  if (!response.success) return response
  const payload = response.data.submitServiceBooking
  if (!payload?.ok) return { success: false as const, error: payload?.errorMessage || 'Unable to book appointment' }
  revalidatePath(SERVICE_PATH)
  return { success: true as const, data: payload }
}
