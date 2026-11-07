'use server'

import { revalidatePath } from 'next/cache'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { operatorCommandRequest } from '@/features/platform/lib/operatorCommandClient'
import { ROOFTOP_STAFF_QUERY } from '@/features/platform/lib/rooftopStaffQuery'

const CRM_PATH = '/dashboard/platform/crm'
const CUSTOMERS_PATH = '/dashboard/platform/customers'
const LEAD_PAGE_SIZE = 50
const CLOSED = ['closed-won', 'closed-lost']
const STATUS_KEYS = ['new', 'contacted', 'test-drive-scheduled', 'negotiating', 'closed-won', 'closed-lost'] as const

function revalidateLead(leadId?: string, customerId?: string | null) {
  revalidatePath(CRM_PATH)
  revalidatePath(`${CRM_PATH}/tasks`)
  if (leadId) revalidatePath(`${CRM_PATH}/${leadId}`)
  if (customerId) revalidatePath(`${CUSTOMERS_PATH}/${customerId}`)
}

/* ------------------------------------------------------------------ viewer */

export type CrmPerson = { id: string; name: string | null }
export type CrmRooftop = { id: string; name: string }
export type CrmViewer = {
  id: string
  name: string | null
  canManageLeads: boolean
  canViewAllLeads: boolean
  canManageTasks: boolean
}

type PermissionFlags = { canManageLeads?: boolean | null; canViewAllLeads?: boolean | null; canManageFinancing?: boolean | null; canManageService?: boolean | null }

/**
 * The signed-in user and the CRM flags granted by their role or any active membership role.
 * Used only to show or explain actions; every command re-checks on the server.
 */
export async function getCrmViewer() {
  const response = await keystoneClient<{
    authenticatedItem: {
      id: string
      name: string | null
      role: PermissionFlags | null
      rooftopMemberships: Array<{ role: PermissionFlags | null }>
      dealerGroupMemberships: Array<{ role: PermissionFlags | null }>
    } | null
  }>(`
    query CrmViewer {
      authenticatedItem {
        ... on User {
          id name
          role { canManageLeads canViewAllLeads canManageFinancing canManageService }
          rooftopMemberships(where: { status: { equals: "active" } }) { role { canManageLeads canViewAllLeads canManageFinancing canManageService } }
          dealerGroupMemberships(where: { status: { equals: "active" } }) { role { canManageLeads canViewAllLeads canManageFinancing canManageService } }
        }
      }
    }
  `, {}, { cache: 'no-store' })
  if (!response.success || !response.data.authenticatedItem) return null
  const user = response.data.authenticatedItem
  const roles = [user.role, ...(user.rooftopMemberships || []).map(m => m.role), ...(user.dealerGroupMemberships || []).map(m => m.role)].filter(Boolean) as PermissionFlags[]
  const has = (flag: keyof PermissionFlags) => roles.some(role => role[flag] === true)
  return {
    id: user.id,
    name: user.name,
    canManageLeads: has('canManageLeads'),
    canViewAllLeads: has('canViewAllLeads'),
    canManageTasks: has('canManageLeads') || has('canManageFinancing') || has('canManageService'),
  } satisfies CrmViewer
}

export async function getCrmRooftops() {
  const response = await keystoneClient<{ rooftops: CrmRooftop[] }>(`
    query CrmRooftops { rooftops(where: { status: { equals: "active" } }, orderBy: { name: asc }) { id name } }
  `, {}, { cache: 'no-store' })
  return response.success ? response.data.rooftops || [] : []
}

export async function getRooftopStaff(rooftopId: string) {
  const response = await keystoneClient<{ users: CrmPerson[] }>(ROOFTOP_STAFF_QUERY, { rooftopId }, { cache: 'no-store' })
  return response.success ? response.data.users || [] : []
}

/** Everyone with access to any of the given rooftops, de-duplicated and sorted by name. */
export async function getStaffForRooftops(rooftopIds: string[]) {
  const lists = await Promise.all(rooftopIds.map(getRooftopStaff))
  const byId = new Map<string, CrmPerson>()
  for (const person of lists.flat()) byId.set(person.id, person)
  return [...byId.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

export type CrmVehicleOption = { id: string; year: number | null; make: string | null; model: string | null; stockNumber: string | null; rooftop: { id: string } | null }

export async function getLeadVehicleOptions() {
  const response = await keystoneClient<{ vehicles: CrmVehicleOption[] }>(`
    query CrmVehicleOptions {
      vehicles(where: { status: { in: ["available", "pending"] } }, orderBy: [{ stockNumber: asc }], take: 300) {
        id year make model stockNumber rooftop { id }
      }
    }
  `, {}, { cache: 'no-store' })
  return response.success ? response.data.vehicles || [] : []
}

/* --------------------------------------------------------------- lead list */

export type CrmLeadRow = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  source: string | null
  status: string | null
  timeframe: string | null
  createdAt: string
  updatedAt: string
  firstResponseDueAt: string | null
  firstResponseAt: string | null
  lastContact: string | null
  customer: { id: string } | null
  assignedSalesperson: CrmPerson | null
  interestedVehicle: { id: string; year: number | null; make: string | null; model: string | null } | null
}

export type LeadListFilters = {
  status: string
  ownerId: string
  source: string
  search: string
  sort: string
  page: number
}

function leadBaseWhere(filters: Pick<LeadListFilters, 'ownerId' | 'source' | 'search'>) {
  const and: any[] = []
  if (filters.ownerId === 'unassigned') and.push({ assignedSalesperson: null })
  else if (filters.ownerId && filters.ownerId !== 'all') and.push({ assignedSalesperson: { id: { equals: filters.ownerId } } })
  if (filters.source && filters.source !== 'all') and.push({ source: { equals: filters.source } })
  const search = filters.search.trim().slice(0, 100)
  if (search) {
    const terms = search.split(/\s+/).filter(Boolean).slice(0, 4)
    for (const term of terms) {
      and.push({ OR: [
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term } },
      ] })
    }
  }
  return and
}

function statusWhere(status: string) {
  if (status === 'open') return [{ status: { notIn: CLOSED } }]
  if (status === 'overdue') return [{ status: { notIn: CLOSED } }, { firstResponseAt: { equals: null } }, { firstResponseDueAt: { lt: new Date().toISOString() } }]
  if (STATUS_KEYS.includes(status as any)) return [{ status: { equals: status } }]
  return []
}

const SORTS: Record<string, any> = {
  newest: [{ createdAt: 'desc' }],
  oldest: [{ createdAt: 'asc' }],
  sla: [{ firstResponseDueAt: 'asc' }],
  'last-contact': [{ lastContact: 'desc' }],
  updated: [{ updatedAt: 'desc' }],
}

export type LeadListCounts = Record<'open' | 'overdue' | 'all' | 'converted' | (typeof STATUS_KEYS)[number], number>

export async function getLeadList(filters: LeadListFilters) {
  const base = leadBaseWhere(filters)
  const where = { AND: [...base, ...statusWhere(filters.status)] }
  const count = (status: string) => ({ AND: [...base, ...statusWhere(status)] })
  const page = Math.max(0, Math.min(200, Math.floor(filters.page) || 0))
  const response = await keystoneClient<{ leads: CrmLeadRow[] } & Record<string, number>>(`
    query CrmLeadList(
      $where: LeadWhereInput!, $orderBy: [LeadOrderByInput!]!, $take: Int!, $skip: Int!,
      $open: LeadWhereInput!, $overdue: LeadWhereInput!, $all: LeadWhereInput!,
      $new: LeadWhereInput!, $contacted: LeadWhereInput!, $testDrive: LeadWhereInput!,
      $negotiating: LeadWhereInput!, $won: LeadWhereInput!, $lost: LeadWhereInput!, $converted: LeadWhereInput!
    ) {
      leads(where: $where, orderBy: $orderBy, take: $take, skip: $skip) {
        id firstName lastName email phone source status timeframe createdAt updatedAt
        firstResponseDueAt firstResponseAt lastContact
        customer { id }
        assignedSalesperson { id name }
        interestedVehicle { id year make model }
      }
      open: leadsCount(where: $open)
      overdue: leadsCount(where: $overdue)
      all: leadsCount(where: $all)
      new: leadsCount(where: $new)
      contacted: leadsCount(where: $contacted)
      testDrive: leadsCount(where: $testDrive)
      negotiating: leadsCount(where: $negotiating)
      won: leadsCount(where: $won)
      lost: leadsCount(where: $lost)
      converted: leadsCount(where: $converted)
    }
  `, {
    where,
    orderBy: SORTS[filters.sort] || SORTS.newest,
    take: LEAD_PAGE_SIZE,
    skip: page * LEAD_PAGE_SIZE,
    open: count('open'),
    overdue: count('overdue'),
    all: count('all'),
    new: count('new'),
    contacted: count('contacted'),
    testDrive: count('test-drive-scheduled'),
    negotiating: count('negotiating'),
    won: count('closed-won'),
    lost: count('closed-lost'),
    // Converted: closed won, or the buyer on a delivered deal (deliveries before leads auto-closed).
    converted: { AND: [...base, { OR: [{ status: { equals: 'closed-won' } }, { deals: { some: { status: { equals: 'delivered' } } } }] }] },
  }, { cache: 'no-store' })
  if (!response.success) return { success: false as const, error: response.error }
  const data = response.data
  const counts: LeadListCounts = {
    open: data.open, overdue: data.overdue, all: data.all, new: data.new, contacted: data.contacted,
    'test-drive-scheduled': data.testDrive, negotiating: data.negotiating, 'closed-won': data.won, 'closed-lost': data.lost,
    converted: data.converted,
  }
  return { success: true as const, data: { leads: data.leads || [], counts, pageSize: LEAD_PAGE_SIZE, page } }
}

/* ------------------------------------------------------------- lead detail */

export type LeadDetail = {
  id: string
  rooftop: { id: string; name: string | null; currencyCode: string }
  customer: {
    id: string
    firstName: string | null
    lastName: string | null
    status: string | null
    updatedAt: string
    emailConsent: boolean | null
    smsConsent: boolean | null
    phoneConsent: boolean | null
    emailSuppressed: boolean | null
    smsSuppressed: boolean | null
    phoneSuppressed: boolean | null
    preferredChannel: string | null
    household: { id: string; displayName: string | null } | null
  } | null
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  source: string | null
  budgetRange: string | null
  tradeInVehicle: string | null
  timeframe: string | null
  status: string | null
  campaignKey: string | null
  cadenceKey: string | null
  cadenceStatus: string | null
  cadenceStep: string | null
  cadenceDueAt: string | null
  lostReasonCode: string | null
  lostReason: string | null
  notes: string | null
  createdAt: string | null
  updatedAt: string
  assignedAt: string | null
  firstResponseDueAt: string | null
  firstResponseAt: string | null
  lastContact: string | null
  assignedSalesperson: { id: string; name: string | null; email: string | null } | null
  interestedVehicle: { id: string; year: number | null; make: string | null; model: string | null; stockNumber: string | null; price: number | null } | null
  interactions: { id: string; interactionType: string | null; date: string | null; outcome: string | null; notes: string | null; followUpDate: string | null; performedBy: { name: string | null } | null }[]
  tasks: { id: string; title: string | null; description: string | null; dueDate: string | null; priority: string | null; completed: boolean | null; completedDate: string | null; assignedTo: CrmPerson | null }[]
  testDrives: { id: string; scheduledTime: string | null; completed: boolean | null; noShow: boolean | null; vehicle: { year: number | null; make: string | null; model: string | null } | null }[]
  deals: { id: string; status: string | null; structureType: string | null; vehiclePrice: number | null; totalPrice: number | null; monthlyPayment: number | null; vehicle: { year: number | null; make: string | null; model: string | null } | null }[]
  salesVisits: {
    id: string
    kind: string | null
    status: string | null
    scheduledAt: string | null
    arrivedAt: string | null
    managerTurnAt: string | null
    completedAt: string | null
    outcome: string | null
    notes: string | null
    updatedAt: string
    manager: CrmPerson | null
    assignedSalesperson: CrmPerson | null
    vehicle: { id: string; year: number | null; make: string | null; model: string | null; stockNumber: string | null } | null
  }[]
  assignmentEvents: {
    id: string
    reason: string | null
    routeKey: string | null
    assignedAt: string | null
    firstResponseDueAt: string | null
    fromUser: CrmPerson | null
    toUser: CrmPerson | null
    actor: CrmPerson | null
  }[]
}

export async function getLead(id: string) {
  return keystoneClient<{ lead: LeadDetail | null }>(`
    query LeadDetail($id: ID!) {
      lead(where: { id: $id }) {
        id
        rooftop { id name currencyCode }
        customer { id firstName lastName status updatedAt emailConsent smsConsent phoneConsent emailSuppressed smsSuppressed phoneSuppressed preferredChannel household { id displayName } }
        firstName lastName email phone source budgetRange tradeInVehicle timeframe status
        campaignKey cadenceKey cadenceStatus cadenceStep cadenceDueAt
        lostReasonCode lostReason notes createdAt updatedAt assignedAt firstResponseDueAt firstResponseAt lastContact
        assignedSalesperson { id name email }
        interestedVehicle { id year make model stockNumber price }
        interactions(orderBy: { date: desc }) { id interactionType date outcome notes followUpDate performedBy { name } }
        tasks(orderBy: { dueDate: asc }) { id title description dueDate priority completed completedDate assignedTo { id name } }
        testDrives(orderBy: { scheduledTime: desc }) { id scheduledTime completed noShow vehicle { year make model } }
        deals(orderBy: { createdAt: desc }) { id status structureType vehiclePrice totalPrice monthlyPayment vehicle { year make model } }
        salesVisits(orderBy: { createdAt: desc }) {
          id kind status scheduledAt arrivedAt managerTurnAt completedAt outcome notes updatedAt
          manager { id name } assignedSalesperson { id name }
          vehicle { id year make model stockNumber }
        }
        assignmentEvents(orderBy: { assignedAt: desc }) {
          id reason routeKey assignedAt firstResponseDueAt
          fromUser { id name } toUser { id name } actor { id name }
        }
      }
    }
  `, { id }, { cache: 'no-store' })
}

export async function getCustomerDuplicateCount(customerId: string) {
  const response = await keystoneClient<{ customerDuplicateCandidates: Array<{ id: string }> }>(`
    query CustomerDuplicates($customerId: ID!) {
      customerDuplicateCandidates(customerId: $customerId) { id }
    }
  `, { customerId }, { cache: 'no-store' })
  return response.success ? response.data.customerDuplicateCandidates.length : 0
}

/* ---------------------------------------------------------- lead commands */

export type LeadFormInput = {
  firstName: string
  lastName: string
  email: string
  phone: string
  source: string
  budgetRange: string
  timeframe: string
  tradeInVehicle: string
  notes: string
  interestedVehicleId: string
}

export async function createLead(data: LeadFormInput & { rooftopId: string; assignedToId: string; idempotencyKey: string }) {
  const response = await operatorCommandRequest<{ openLead: { id: string; customerId: string; assignedToId: string | null; routeKey: string | null; reused: boolean } }>(`
    mutation OpenLead($data: OpenLeadInput!) {
      openLead(data: $data) { id customerId assignedToId routeKey firstResponseDueAt reused }
    }
  `, {
    data: {
      ...data,
      budgetRange: data.budgetRange || null,
      timeframe: data.timeframe || null,
      interestedVehicleId: data.interestedVehicleId || null,
      assignedToId: data.assignedToId || null,
    },
  })
  if (response.success) revalidateLead(response.data.openLead.id, response.data.openLead.customerId)
  return response
}

export async function updateLeadDetails(data: LeadFormInput & { leadId: string; expectedUpdatedAt: string; idempotencyKey: string }) {
  const response = await operatorCommandRequest<{ updateLeadDetails: { id: string; updatedAt: string } }>(`
    mutation UpdateLeadDetails($data: UpdateLeadDetailsInput!) {
      updateLeadDetails(data: $data) { id status updatedAt reused }
    }
  `, {
    data: {
      ...data,
      budgetRange: data.budgetRange || null,
      timeframe: data.timeframe || null,
      interestedVehicleId: data.interestedVehicleId || null,
    },
  })
  if (response.success) revalidateLead(data.leadId)
  return response
}

export async function transferLeadOwnership(data: { leadId: string; assignedToId: string; expectedUpdatedAt: string; reason: string; idempotencyKey: string }) {
  const response = await operatorCommandRequest<{ transferLeadOwnership: { id: string } }>(`
    mutation TransferLeadOwnership($data: TransferLeadOwnershipInput!) {
      transferLeadOwnership(data: $data) { id status updatedAt reused }
    }
  `, { data })
  if (response.success) revalidateLead(data.leadId)
  return response
}

export async function transitionLead(input: {
  id: string
  toStatus: string
  lostReasonCode?: string
  lostReasonDetails?: string
  idempotencyKey: string
}) {
  const response = await operatorCommandRequest(`
    mutation TransitionLead($id: ID!, $toStatus: String!, $lostReasonCode: String, $lostReasonDetails: String, $idempotencyKey: String!) {
      transitionLead(id: $id, toStatus: $toStatus, lostReasonCode: $lostReasonCode, lostReasonDetails: $lostReasonDetails, idempotencyKey: $idempotencyKey) { id status }
    }
  `, input)
  if (response.success) revalidateLead(input.id)
  return response
}

export async function recordLeadInteraction(data: {
  leadId: string
  interactionType: string
  outcome?: string
  notes: string
  date?: string
  followUpDate?: string
  idempotencyKey: string
}) {
  const response = await operatorCommandRequest(`
    mutation RecordLeadInteraction($data: RecordLeadInteractionInput!) {
      recordLeadInteraction(data: $data) { id leadId }
    }
  `, { data })
  if (response.success) revalidateLead(data.leadId)
  return response
}

export async function routeLead(data: { leadId: string; expectedUpdatedAt: string; idempotencyKey: string }) {
  const response = await operatorCommandRequest(`
    mutation RouteLead($data: RouteLeadInput!) {
      routeLead(data: $data) { id status updatedAt reused }
    }
  `, { data })
  if (response.success) revalidateLead(data.leadId)
  return response
}

export async function createLeadTask(data: {
  leadId: string
  title: string
  description?: string
  priority?: string
  dueDate?: string
  assignedToId?: string
  communicationChannel?: string
  idempotencyKey: string
}) {
  const response = await operatorCommandRequest(`
    mutation CreateLeadTask($data: CreateLeadTaskInput!) {
      createLeadTask(data: $data) { id }
    }
  `, { data })
  if (response.success) revalidateLead(data.leadId)
  return response
}

export async function updateCustomerCommunicationPreferences(leadId: string | null, data: {
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
    mutation UpdatePreferences($data: UpdateCustomerCommunicationPreferencesInput!) {
      updateCustomerCommunicationPreferences(data: $data) { id status reused }
    }
  `, { data })
  if (response.success) revalidateLead(leadId || undefined, data.customerId)
  return response
}

export async function enrollLeadCadence(data: {
  leadId: string
  expectedUpdatedAt: string
  cadenceKey: string
  campaignKey: string
  idempotencyKey: string
}) {
  const response = await operatorCommandRequest(`
    mutation EnrollCadence($data: EnrollLeadCadenceInput!) {
      enrollLeadCadence(data: $data) { id status reused }
    }
  `, { data })
  if (response.success) revalidateLead(data.leadId)
  return response
}

export async function advanceLeadCadence(data: { leadId: string; expectedUpdatedAt: string; idempotencyKey: string }) {
  const response = await operatorCommandRequest(`
    mutation AdvanceCadence($data: AdvanceLeadCadenceInput!) {
      advanceLeadCadence(data: $data) { id status reused }
    }
  `, { data })
  if (response.success) revalidateLead(data.leadId)
  return response
}

export async function manageSalesVisit(leadId: string, data: {
  action: string
  visitId?: string
  leadId?: string
  kind?: string
  vehicleId?: string
  managerId?: string
  scheduledAt?: string
  expectedUpdatedAt?: string
  outcome?: string
  notes?: string
  idempotencyKey: string
}) {
  const response = await operatorCommandRequest(`
    mutation ManageVisit($data: ManageSalesVisitInput!) {
      manageSalesVisit(data: $data) { id status reused }
    }
  `, { data })
  if (response.success) revalidateLead(leadId)
  return response
}

export async function completeLeadTask(leadId: string | null, taskId: string) {
  const response = await operatorCommandRequest(`
    mutation CompleteTask($id: ID!, $idempotencyKey: String!) {
      completeTask(id: $id, idempotencyKey: $idempotencyKey) { id completed completedDate }
    }
  `, { id: taskId, idempotencyKey: `task-complete:${taskId}` })
  if (response.success) revalidateLead(leadId || undefined)
  return response
}

/* -------------------------------------------------------------- task queue */

export type TaskQueueItem = {
  id: string
  title: string | null
  description: string | null
  priority: string | null
  dueDate: string | null
  completed: boolean | null
  completedDate: string | null
  assignedTo: CrmPerson | null
  lead: { id: string; firstName: string | null; lastName: string | null; status: string | null; phone: string | null; email: string | null } | null
}

export type TaskQueueFilters = {
  bucket: 'overdue' | 'today' | 'upcoming' | 'no-date' | 'completed'
  scope: 'mine' | 'all'
  assigneeId: string
  todayStart: string
  todayEnd: string
}

export async function getTaskQueue(filters: TaskQueueFilters, viewerId: string) {
  const owner: any[] = filters.scope === 'mine'
    ? [{ assignedTo: { id: { equals: viewerId } } }]
    : filters.assigneeId && filters.assigneeId !== 'all' ? [{ assignedTo: { id: { equals: filters.assigneeId } } }] : []
  const now = new Date().toISOString()
  const completedSince = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const buckets: Record<TaskQueueFilters['bucket'], any[]> = {
    overdue: [{ completed: { equals: false } }, { dueDate: { lt: now } }],
    today: [{ completed: { equals: false } }, { dueDate: { gte: now, lt: filters.todayEnd } }],
    upcoming: [{ completed: { equals: false } }, { dueDate: { gte: filters.todayEnd } }],
    'no-date': [{ completed: { equals: false } }, { dueDate: { equals: null } }],
    completed: [{ completed: { equals: true } }, { completedDate: { gte: completedSince } }],
  }
  const where = (bucket: TaskQueueFilters['bucket']) => ({ AND: [...owner, ...buckets[bucket]] })
  const orderBy = filters.bucket === 'completed' ? [{ completedDate: 'desc' }] : filters.bucket === 'no-date' ? [{ createdAt: 'asc' }] : [{ dueDate: 'asc' }]
  const response = await keystoneClient<{ tasks: TaskQueueItem[]; overdue: number; today: number; upcoming: number; noDate: number; completed: number }>(`
    query TaskQueue(
      $where: TaskWhereInput!, $orderBy: [TaskOrderByInput!]!,
      $overdue: TaskWhereInput!, $today: TaskWhereInput!, $upcoming: TaskWhereInput!, $noDate: TaskWhereInput!, $completed: TaskWhereInput!
    ) {
      tasks(where: $where, orderBy: $orderBy, take: 200) {
        id title description priority dueDate completed completedDate
        assignedTo { id name }
        lead { id firstName lastName status phone email }
      }
      overdue: tasksCount(where: $overdue)
      today: tasksCount(where: $today)
      upcoming: tasksCount(where: $upcoming)
      noDate: tasksCount(where: $noDate)
      completed: tasksCount(where: $completed)
    }
  `, {
    where: where(filters.bucket),
    orderBy,
    overdue: where('overdue'),
    today: where('today'),
    upcoming: where('upcoming'),
    noDate: where('no-date'),
    completed: where('completed'),
  }, { cache: 'no-store' })
  if (!response.success) return { success: false as const, error: response.error }
  const { tasks, overdue, today, upcoming, noDate, completed } = response.data
  return { success: true as const, data: { tasks: tasks || [], counts: { overdue, today, upcoming, 'no-date': noDate, completed } } }
}
