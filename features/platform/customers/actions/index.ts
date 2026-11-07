'use server'

import { revalidatePath } from 'next/cache'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { operatorCommandRequest } from '@/features/platform/lib/operatorCommandClient'

const CUSTOMERS_PATH = '/dashboard/platform/customers'
const CRM_PATH = '/dashboard/platform/crm'
const PAGE_SIZE = 50

export async function getCustomerCurrencyCode() {
  const response = await keystoneClient<{ storefrontProfile: { currencyCode: string | null } | null }>(`
    query CustomerCurrency { storefrontProfile { currencyCode } }
  `, {}, { cache: 'no-store' })
  return response.success ? response.data.storefrontProfile?.currencyCode || 'USD' : 'USD'
}

function revalidateCustomer(...ids: Array<string | null | undefined>) {
  revalidatePath(CUSTOMERS_PATH)
  revalidatePath(CRM_PATH)
  for (const id of ids) if (id) revalidatePath(`${CUSTOMERS_PATH}/${id}`)
}

/* ------------------------------------------------------------------ list */

export type CustomerRow = {
  id: string
  firstName: string | null
  lastName: string | null
  primaryEmail: string | null
  primaryPhone: string | null
  status: string | null
  preferredChannel: string | null
  emailSuppressed: boolean | null
  smsSuppressed: boolean | null
  phoneSuppressed: boolean | null
  createdAt: string
  updatedAt: string
  leadsCount: number
  openLeadsCount: number
  household: { id: string; displayName: string | null } | null
  mergedInto: { id: string; firstName: string | null; lastName: string | null } | null
}

export type CustomerListFilters = {
  status: 'active' | 'merged' | 'all'
  segment: 'all' | 'open-leads' | 'household' | 'suppressed' | 'reachable'
  search: string
  sort: 'updated' | 'newest' | 'name'
  page: number
}

const OPEN_LEAD = { status: { notIn: ['closed-won', 'closed-lost'] } }

function baseWhere(filters: Pick<CustomerListFilters, 'segment' | 'search'>) {
  const and: any[] = []
  const search = filters.search.trim().slice(0, 100)
  for (const term of search.split(/\s+/).filter(Boolean).slice(0, 4)) {
    and.push({ OR: [
      { firstName: { contains: term, mode: 'insensitive' } },
      { lastName: { contains: term, mode: 'insensitive' } },
      { primaryEmail: { contains: term, mode: 'insensitive' } },
      { primaryPhone: { contains: term } },
      { normalizedPhone: { contains: term.replace(/\D/g, '') || term } },
    ] })
  }
  if (filters.segment === 'open-leads') and.push({ leads: { some: OPEN_LEAD } })
  if (filters.segment === 'household') and.push({ NOT: { household: null } })
  if (filters.segment === 'suppressed') and.push({ OR: [{ emailSuppressed: { equals: true } }, { smsSuppressed: { equals: true } }, { phoneSuppressed: { equals: true } }] })
  if (filters.segment === 'reachable') and.push({ NOT: { preferredChannel: { equals: 'none' } } })
  return and
}

function statusWhere(status: string) {
  return status === 'active' || status === 'merged' ? [{ status: { equals: status } }] : []
}

const SORTS: Record<string, any> = {
  updated: [{ updatedAt: 'desc' }],
  newest: [{ createdAt: 'desc' }],
  name: [{ lastName: 'asc' }, { firstName: 'asc' }],
}

export async function getCustomers(filters: CustomerListFilters) {
  const base = baseWhere(filters)
  const page = Math.max(0, Math.min(200, Math.floor(filters.page) || 0))
  const response = await keystoneClient<{ customers: CustomerRow[]; active: number; merged: number; all: number }>(`
    query CustomerDirectory($where: CustomerWhereInput!, $orderBy: [CustomerOrderByInput!]!, $take: Int!, $skip: Int!, $openLead: LeadWhereInput!, $active: CustomerWhereInput!, $merged: CustomerWhereInput!, $all: CustomerWhereInput!) {
      customers(where: $where, orderBy: $orderBy, take: $take, skip: $skip) {
        id firstName lastName primaryEmail primaryPhone status preferredChannel
        emailSuppressed smsSuppressed phoneSuppressed createdAt updatedAt
        leadsCount
        openLeadsCount: leadsCount(where: $openLead)
        household { id displayName }
        mergedInto { id firstName lastName }
      }
      active: customersCount(where: $active)
      merged: customersCount(where: $merged)
      all: customersCount(where: $all)
    }
  `, {
    where: { AND: [...base, ...statusWhere(filters.status)] },
    orderBy: SORTS[filters.sort] || SORTS.updated,
    take: PAGE_SIZE,
    skip: page * PAGE_SIZE,
    openLead: OPEN_LEAD,
    active: { AND: [...base, ...statusWhere('active')] },
    merged: { AND: [...base, ...statusWhere('merged')] },
    all: { AND: base },
  }, { cache: 'no-store' })
  if (!response.success) return { success: false as const, error: response.error }
  const { customers, active, merged, all } = response.data
  return { success: true as const, data: { customers: customers || [], counts: { active, merged, all }, page, pageSize: PAGE_SIZE } }
}

/* ---------------------------------------------------------------- detail */

type Person = { id: string; name: string | null }
type VehicleRef = { id: string; year: number | null; make: string | null; model: string | null; stockNumber?: string | null } | null

export type CustomerLead = {
  id: string
  firstName: string | null
  lastName: string | null
  source: string | null
  status: string | null
  createdAt: string
  lastContact: string | null
  assignedSalesperson: Person | null
  interestedVehicle: VehicleRef
  deals: { id: string; status: string | null; vehiclePrice: number | null; saleDate: string | null; createdAt: string; vehicle: VehicleRef }[]
  testDrives: { id: string; scheduledTime: string | null; completed: boolean | null; noShow: boolean | null; vehicle: VehicleRef }[]
  tradeIns: { id: string; year: number | null; make: string | null; model: string | null; mileage: number | null; offerAmount: number | null; createdAt: string }[]
  serviceAppointments: {
    id: string
    appointmentDate: string | null
    serviceType: string | null
    status: string | null
    customerVehicleDescription: string | null
    serviceOrder: { id: string; status: string | null; invoiceNumber: string | null; grandTotal: number | null } | null
  }[]
}

export type CustomerDetail = {
  id: string
  rooftop: { id: string; name: string | null } | null
  firstName: string | null
  lastName: string | null
  primaryEmail: string | null
  primaryPhone: string | null
  status: string | null
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  emailConsent: boolean | null
  smsConsent: boolean | null
  phoneConsent: boolean | null
  emailSuppressed: boolean | null
  smsSuppressed: boolean | null
  phoneSuppressed: boolean | null
  preferredChannel: string | null
  contactPreferenceUpdatedAt: string | null
  suppressionReason: string | null
  suppressionSource: string | null
  household: { id: string; displayName: string | null; members: { id: string; firstName: string | null; lastName: string | null; primaryEmail: string | null; primaryPhone: string | null; status: string | null }[] } | null
  mergedInto: { id: string; firstName: string | null; lastName: string | null } | null
  mergedCustomers: { id: string; firstName: string | null; lastName: string | null; mergedAt: string | null }[]
  contactPreferenceEvents: { id: string; source: string | null; reason: string | null; occurredAt: string | null; preferenceSnapshot: any; actor: Person | null }[]
  mergeEventsAsSurvivor: MergeEvent[]
  mergeEventsAsDuplicate: MergeEvent[]
  salesVisits: { id: string; kind: string | null; status: string | null; scheduledAt: string | null; completedAt: string | null; outcome: string | null; lead: { id: string } | null; vehicle: VehicleRef }[]
  leads: CustomerLead[]
}

type MergeEvent = {
  id: string
  reason: string | null
  mergedAt: string | null
  movedLeadIds: string[] | null
  survivor: { id: string; firstName: string | null; lastName: string | null } | null
  duplicate: { id: string; firstName: string | null; lastName: string | null } | null
  actor: Person | null
}

const MERGE_EVENT_FIELDS = 'id reason mergedAt movedLeadIds survivor { id firstName lastName } duplicate { id firstName lastName } actor { id name }'

export async function getCustomer(id: string) {
  return keystoneClient<{ customer: CustomerDetail | null }>(`
    query CustomerDetail($id: ID!) {
      customer(where: { id: $id }) {
        id rooftop { id name }
        firstName lastName primaryEmail primaryPhone status createdAt updatedAt mergedAt
        emailConsent smsConsent phoneConsent emailSuppressed smsSuppressed phoneSuppressed
        preferredChannel contactPreferenceUpdatedAt suppressionReason suppressionSource
        household { id displayName members(orderBy: { lastName: asc }) { id firstName lastName primaryEmail primaryPhone status } }
        mergedInto { id firstName lastName }
        mergedCustomers(orderBy: { mergedAt: desc }) { id firstName lastName mergedAt }
        contactPreferenceEvents(orderBy: { occurredAt: desc }, take: 50) { id source reason occurredAt preferenceSnapshot actor { id name } }
        mergeEventsAsSurvivor(orderBy: { mergedAt: desc }) { ${MERGE_EVENT_FIELDS} }
        mergeEventsAsDuplicate(orderBy: { mergedAt: desc }) { ${MERGE_EVENT_FIELDS} }
        salesVisits(orderBy: { createdAt: desc }, take: 50) { id kind status scheduledAt completedAt outcome lead { id } vehicle { id year make model } }
        leads(orderBy: { createdAt: desc }) {
          id firstName lastName source status createdAt lastContact
          assignedSalesperson { id name }
          interestedVehicle { id year make model stockNumber }
          deals(orderBy: { createdAt: desc }) { id status vehiclePrice saleDate createdAt vehicle { id year make model stockNumber } }
          testDrives(orderBy: { scheduledTime: desc }) { id scheduledTime completed noShow vehicle { id year make model } }
          tradeIns(orderBy: { createdAt: desc }) { id year make model mileage offerAmount createdAt }
          serviceAppointments(orderBy: { appointmentDate: desc }) {
            id appointmentDate serviceType status customerVehicleDescription
            serviceOrder { id status invoiceNumber grandTotal }
          }
        }
      }
    }
  `, { id }, { cache: 'no-store' })
}

export type DuplicateCandidate = {
  id: string
  firstName: string
  lastName: string
  primaryEmail: string | null
  primaryPhone: string | null
  status: string
  createdAt: string
  updatedAt: string
  leadsCount: number
}

export async function getDuplicateCandidates(customerId: string) {
  return operatorCommandRequest<{ customerDuplicateCandidates: DuplicateCandidate[] }>(`
    query CustomerDuplicateCandidates($customerId: ID!) {
      customerDuplicateCandidates(customerId: $customerId, limit: 20) { id firstName lastName primaryEmail primaryPhone status createdAt updatedAt leadsCount }
    }
  `, { customerId })
}

export type CustomerSearchResult = { id: string; firstName: string | null; lastName: string | null; primaryEmail: string | null; primaryPhone: string | null; updatedAt: string; household: { id: string; displayName: string | null } | null }

export async function searchCustomers(input: { search: string; rooftopId: string; excludeId: string }) {
  const terms = input.search.trim().slice(0, 100).split(/\s+/).filter(Boolean).slice(0, 4)
  if (!terms.length) return []
  const response = await keystoneClient<{ customers: CustomerSearchResult[] }>(`
    query CustomerSearch($where: CustomerWhereInput!) {
      customers(where: $where, orderBy: [{ lastName: asc }], take: 10) { id firstName lastName primaryEmail primaryPhone updatedAt household { id displayName } }
    }
  `, {
    where: {
      AND: [
        { status: { equals: 'active' } },
        { rooftop: { id: { equals: input.rooftopId } } },
        { NOT: { id: { equals: input.excludeId } } },
        ...terms.map(term => ({ OR: [
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { primaryEmail: { contains: term, mode: 'insensitive' } },
          { primaryPhone: { contains: term } },
        ] })),
      ],
    },
  }, { cache: 'no-store' })
  return response.success ? response.data.customers || [] : []
}

/* -------------------------------------------------------------- commands */

export async function updateCustomerContact(data: { customerId: string; expectedUpdatedAt: string; firstName: string; lastName: string; primaryEmail: string; primaryPhone: string; idempotencyKey: string }) {
  const response = await operatorCommandRequest(`
    mutation UpdateCustomerContact($data: UpdateCustomerContactInput!) {
      updateCustomerContact(data: $data) { id status updatedAt reused }
    }
  `, { data })
  if (response.success) revalidateCustomer(data.customerId)
  return response
}

export async function mergeCustomers(data: { survivorId: string; duplicateId: string; survivorExpectedUpdatedAt: string; duplicateExpectedUpdatedAt: string; reason: string; idempotencyKey: string }) {
  const response = await operatorCommandRequest<{ mergeCustomers: { id: string; duplicateId: string; movedLeadCount: number; movedSalesVisitCount: number; reused: boolean } }>(`
    mutation MergeCustomers($data: MergeCustomersInput!) {
      mergeCustomers(data: $data) { id duplicateId movedLeadCount movedSalesVisitCount reused }
    }
  `, { data })
  if (response.success) revalidateCustomer(data.survivorId, data.duplicateId)
  return response
}

export async function linkCustomerHousehold(data: { primaryCustomerId: string; memberCustomerId: string; primaryExpectedUpdatedAt: string; memberExpectedUpdatedAt: string; displayName: string; idempotencyKey: string }) {
  const response = await operatorCommandRequest(`
    mutation LinkHousehold($data: LinkCustomerHouseholdInput!) {
      linkCustomerHousehold(data: $data) { id status updatedAt reused }
    }
  `, { data })
  if (response.success) revalidateCustomer(data.primaryCustomerId, data.memberCustomerId)
  return response
}

export async function unlinkCustomerHousehold(data: { customerId: string; expectedUpdatedAt: string; reason: string; idempotencyKey: string }) {
  const response = await operatorCommandRequest(`
    mutation UnlinkHousehold($data: UnlinkCustomerHouseholdInput!) {
      unlinkCustomerHousehold(data: $data) { id status updatedAt reused }
    }
  `, { data })
  if (response.success) revalidateCustomer(data.customerId)
  return response
}

export async function updateCustomerPreferences(data: {
  customerId: string
  expectedUpdatedAt: string
  emailConsent: boolean
  smsConsent: boolean
  phoneConsent: boolean
  emailSuppressed: boolean
  smsSuppressed: boolean
  phoneSuppressed: boolean
  preferredChannel: string
  source: string
  reason: string
  idempotencyKey: string
}) {
  const response = await operatorCommandRequest(`
    mutation UpdateCustomerPreferences($data: UpdateCustomerCommunicationPreferencesInput!) {
      updateCustomerCommunicationPreferences(data: $data) { id status updatedAt reused }
    }
  `, { data })
  if (response.success) revalidateCustomer(data.customerId)
  return response
}
