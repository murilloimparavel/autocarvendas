'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, ListChecks, Mail, Phone, Plus, RefreshCw, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import {
  Attention,
  DeskHeader,
  DeskSection,
  DeskTable,
  Figure,
  Notice,
  Panel,
  Pill,
  Readout,
  ReadoutStrip,
  Segmented,
  Status,
  Td,
  Th,
  Tr,
  Track,
} from '@/features/platform/components/desk'
import { dayKey, formatPhone } from '@/features/platform/lib/format'
import {
  createLead,
  getLeadList,
  getLeadVehicleOptions,
  getRooftopStaff,
  type CrmLeadRow,
  type CrmPerson,
  type CrmRooftop,
  type CrmVehicleOption,
  type CrmViewer,
  type LeadListCounts,
  type LeadListFilters,
} from '../actions'
import { CLOSED_LEAD_STATUSES, LEAD_SOURCES, LEAD_STATUSES, formatElapsed, leadStatus, personName, sourceLabel, timeframeLabel } from '../lib/leadOptions'
import { EMPTY_LEAD_FORM, LeadFormDialog, type LeadFormValues } from '../components/LeadFormDialog'

type ListData = { leads: CrmLeadRow[]; counts: LeadListCounts; pageSize: number; page: number }

const isClosed = (status: string | null) => CLOSED_LEAD_STATUSES.includes(status || '')
const QUEUE_LIMIT = 8
const FILTER_TRIGGER = 'h-10 min-w-0 rounded-[4px] px-2.5 text-[13px] lg:h-9'
const vehicleLabel = (lead: CrmLeadRow) =>
  lead.interestedVehicle ? [lead.interestedVehicle.year, lead.interestedVehicle.make, lead.interestedVehicle.model].filter(Boolean).join(' ') : null
const isOverdue = (lead: CrmLeadRow) =>
  !isClosed(lead.status) && !lead.firstResponseAt && Boolean(lead.firstResponseDueAt) && new Date(lead.firstResponseDueAt as string).getTime() < Date.now()

export function LeadListPageClient({
  viewer,
  rooftops,
  staff,
  initialFilters,
  initialData,
  initialQueue = [],
  initialError,
  timeZone,
}: {
  viewer: CrmViewer | null
  rooftops: CrmRooftop[]
  staff: CrmPerson[]
  initialFilters: LeadListFilters
  initialData: ListData | null
  initialQueue?: CrmLeadRow[]
  initialError: string | null
  timeZone: string
}) {
  const router = useRouter()
  const [filters, setFilters] = useState<LeadListFilters>(initialFilters)
  const [searchInput, setSearchInput] = useState(initialFilters.search)
  const [data, setData] = useState<ListData | null>(initialData)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)
  const [queue, setQueue] = useState<CrmLeadRow[]>(initialQueue)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [vehicles, setVehicles] = useState<CrmVehicleOption[]>([])
  const createKeyRef = useRef<string | null>(null)
  const firstLoad = useRef(true)
  const requestId = useRef(0)

  const load = useCallback(async (next: LeadListFilters) => {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    const response = await getLeadList(next)
    if (id !== requestId.current) return
    if (response.success) setData(response.data)
    else setError(response.error || 'Unable to load leads')
    setLoading(false)
  }, [])

  const loadQueue = useCallback(async () => {
    const response = await getLeadList({ ...initialFilters, sort: 'sla', page: 0 })
    if (response.success) { setQueue(response.data.leads); setQueueError(null) }
    else setQueueError(response.error || 'Unable to load leads')
  }, [initialFilters])

  useEffect(() => {
    if (firstLoad.current) { firstLoad.current = false; return }
    load(filters)
  }, [filters, load])

  useEffect(() => {
    const handle = setTimeout(() => {
      setFilters(prev => (prev.search === searchInput.trim() ? prev : { ...prev, search: searchInput.trim(), page: 0 }))
    }, 300)
    return () => clearTimeout(handle)
  }, [searchInput])

  const update = (patch: Partial<LeadListFilters>) => setFilters(prev => ({ ...prev, ...patch, page: patch.page ?? 0 }))

  const counts = data?.counts
  const statusOptions = [
    { value: 'open', label: 'Open', count: counts?.open },
    ...LEAD_STATUSES.map(stage => ({ value: stage.value, label: stage.label, count: counts?.[stage.value as keyof LeadListCounts], tone: stage.tone })),
    { value: 'overdue', label: 'Overdue', count: counts?.overdue, tone: 'bad' as const },
    { value: 'all', label: 'All', count: counts?.all },
  ]
  const total = counts ? (filters.status in counts ? counts[filters.status as keyof LeadListCounts] : counts.all) : 0
  const pageSize = data?.pageSize ?? 50
  const pageStart = total === 0 ? 0 : filters.page * pageSize + 1
  const pageEnd = Math.min(total, (filters.page + 1) * pageSize)
  const isFiltered = Boolean(filters.search) || filters.source !== 'all' || filters.ownerId !== initialFilters.ownerId

  const resetFilters = () => {
    setSearchInput('')
    setFilters({ ...initialFilters, status: filters.status })
  }

  const openCreate = async () => {
    createKeyRef.current = `lead-create:${crypto.randomUUID()}`
    setCreateOpen(true)
    if (vehicles.length === 0) setVehicles(await getLeadVehicleOptions())
  }

  const submitCreate = async (values: LeadFormValues) => {
    const rooftopId = values.rooftopId || (rooftops.length === 1 ? rooftops[0].id : '')
    if (!rooftopId) return 'Select a rooftop'
    const response = await createLead({ ...values, rooftopId, idempotencyKey: createKeyRef.current || `lead-create:${crypto.randomUUID()}` })
    if (!response.success) return response.error
    createKeyRef.current = null
    setCreateOpen(false)
    router.push(`${basePath}/platform/crm/${response.data.openLead.id}`)
    return null
  }

  const formatAge = (date: string) => {
    const days = Math.round((Date.parse(dayKey(Date.now(), timeZone)) - Date.parse(dayKey(date, timeZone))) / 86_400_000)
    if (days === 0) return 'today'
    if (days === 1) return 'yesterday'
    if (days > 1 && days < 7) return `${days} days ago`
    return new Date(date).toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric' })
  }
  const formatDue = (date: string) => new Date(date).toLocaleString('en-US', { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  const nextStep = (lead: CrmLeadRow): { label: string; bad?: boolean } => {
    if (isClosed(lead.status)) return { label: leadStatus(lead.status).label }
    if (isOverdue(lead)) return { label: 'Response overdue', bad: true }
    if (!lead.firstResponseAt && lead.firstResponseDueAt) return { label: `Respond by ${formatDue(lead.firstResponseDueAt)}` }
    if (!lead.firstResponseAt) return { label: 'First response' }
    return { label: 'Follow up' }
  }

  const canCreate = viewer?.canManageLeads === true
  const rooftopForCreate = rooftops.length === 1 ? rooftops[0].id : ''

  // Waiting on a first response, most overdue first, then the longest waiting.
  const now = Date.now()
  const waiting = queue
    .filter(lead => !isClosed(lead.status) && !lead.firstResponseAt)
    .sort((a, b) =>
      (a.firstResponseDueAt ? Date.parse(a.firstResponseDueAt) : Infinity) - (b.firstResponseDueAt ? Date.parse(b.firstResponseDueAt) : Infinity)
      || Date.parse(a.createdAt) - Date.parse(b.createdAt))
  const waitingShown = waiting.slice(0, QUEUE_LIMIT)

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'CRM' },
  ]

  const refreshAll = () => {
    load(filters)
    loadQueue()
  }

  const header = (
    <DeskHeader
      title="Leads"
      tone={error ? 'bad' : (counts?.overdue ?? 0) > 0 ? 'warn' : 'ok'}
      status={error ? 'Unavailable' : (counts?.overdue ?? 0) > 0 ? `${counts?.overdue} response overdue` : 'No overdue responses'}
      meta={counts ? `${counts.open} open · ${counts.overdue} response overdue` : undefined}
      actions={
        <>
          <Pill variant="plain" onClick={refreshAll} disabled={loading} aria-label="Refresh" className="max-md:h-10">
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
          </Pill>
          <Pill asChild variant="plain" className="max-md:h-10">
            <Link href={`${basePath}/platform/crm/tasks`}><ListChecks />My tasks</Link>
          </Pill>
          <Pill variant="primary" onClick={openCreate} disabled={!canCreate} title={canCreate ? undefined : 'Requires lead management permission'} className="max-md:h-10">
            <Plus />New lead
          </Pill>
        </>
      }
    />
  )

  const openLead = (id: string) => router.push(`${basePath}/platform/crm/${id}`)

  return (
    <PageContainer title="CRM" header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {!canCreate && viewer && <p className="text-xs text-muted-foreground">New lead requires lead management permission</p>}

        <DeskSection
          id="crm-waiting"
          title="Waiting on first response"
          count={waiting.length}
          actions={waiting.length > QUEUE_LIMIT ? (
            <Pill size="sm" variant="plain" className="max-md:h-10" onClick={() => update({ status: 'overdue', sort: 'sla' })}>
              Show overdue
            </Pill>
          ) : undefined}
        >
          {queueError ? (
            <Notice tone="bad">Unable to load the response queue: {queueError}</Notice>
          ) : waitingShown.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No leads waiting on a first response</p>
          ) : (
            <DeskTable aria-label="Leads waiting on a first response">
              <thead>
                <tr>
                  <Th align="right" className="w-20">Waiting</Th>
                  <Th>Lead</Th>
                  <Th priority={2}>Interest</Th>
                  <Th priority={3}>Owner</Th>
                  <Th priority={2}>Response due</Th>
                  <Th className="w-0"><span className="sr-only">Contact</span></Th>
                </tr>
              </thead>
              <tbody>
                {waitingShown.map(lead => {
                  const overdue = isOverdue(lead)
                  const vehicle = vehicleLabel(lead)
                  return (
                    <Tr key={lead.id} className="cursor-pointer" onClick={() => openLead(lead.id)}>
                      <Td align="right">
                        <Figure size="sm" attention={overdue}>{formatElapsed(Date.parse(lead.createdAt), now)}</Figure>
                        {overdue && <span className="sr-only"> overdue</span>}
                      </Td>
                      <Td className="min-w-0">
                        <Link href={`${basePath}/platform/crm/${lead.id}`} onClick={event => event.stopPropagation()} className="font-medium text-foreground hover:underline">
                          {personName(lead.firstName, lead.lastName, 'Unnamed lead')}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground md:hidden">
                          {overdue ? 'Response overdue' : lead.firstResponseDueAt ? `Due ${formatDue(lead.firstResponseDueAt)}` : 'No response yet'}
                        </p>
                      </Td>
                      <Td priority={2} className="text-muted-foreground">{[sourceLabel(lead.source), vehicle].filter(Boolean).join(' · ')}</Td>
                      <Td priority={3} className={lead.assignedSalesperson ? 'text-foreground' : 'text-muted-foreground'}>{lead.assignedSalesperson?.name || 'Unassigned'}</Td>
                      <Td priority={2} className="whitespace-nowrap">
                        {overdue
                          ? <Attention>Overdue · {formatDue(lead.firstResponseDueAt as string)}</Attention>
                          : <span className="text-muted-foreground">{lead.firstResponseDueAt ? formatDue(lead.firstResponseDueAt) : 'No SLA'}</span>}
                      </Td>
                      <Td className="text-right">
                        {lead.phone ? (
                          <Pill asChild size="sm" className="h-10 md:h-7" onClick={event => event.stopPropagation()}>
                            <a href={`tel:${lead.phone}`} aria-label={`Call ${personName(lead.firstName, lead.lastName, 'lead')}`}><Phone />Call</a>
                          </Pill>
                        ) : lead.email ? (
                          <Pill asChild size="sm" className="h-10 md:h-7" onClick={event => event.stopPropagation()}>
                            <a href={`mailto:${lead.email}`} aria-label={`Email ${personName(lead.firstName, lead.lastName, 'lead')}`}><Mail />Email</a>
                          </Pill>
                        ) : null}
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>

        <section aria-labelledby="crm-all-leads" className="min-w-0 space-y-3">
          <h2 id="crm-all-leads" className="sr-only">All leads</h2>
          <Segmented
            label="Lead status"
            value={filters.status}
            onChange={value => update({ status: value })}
            options={statusOptions}
            className="max-md:[&_button]:h-10"
          />
          <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-0 lg:max-w-xs lg:flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, email, phone"
                value={searchInput}
                onChange={event => setSearchInput(event.target.value)}
                className="h-10 rounded-[4px] pl-9 text-[13px] lg:h-9"
                aria-label="Search leads"
              />
            </div>
            <div className="grid min-w-0 grid-cols-3 gap-2 lg:flex">
              <Select value={filters.ownerId} onValueChange={value => update({ ownerId: value })}>
                <SelectTrigger className={`${FILTER_TRIGGER} lg:w-[170px]`} aria-label="Filter by owner"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All owners</SelectItem>
                  {viewer && <SelectItem value={viewer.id}>Mine</SelectItem>}
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {staff.filter(person => person.id !== viewer?.id).map(person => (
                    <SelectItem key={person.id} value={person.id}>{person.name || 'Unnamed'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.source} onValueChange={value => update({ source: value })}>
                <SelectTrigger className={`${FILTER_TRIGGER} lg:w-[150px]`} aria-label="Filter by source"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  {LEAD_SOURCES.map(source => <SelectItem key={source.value} value={source.value}>{source.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.sort} onValueChange={value => update({ sort: value })}>
                <SelectTrigger className={`${FILTER_TRIGGER} lg:w-[170px]`} aria-label="Sort leads"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="sla">Response due first</SelectItem>
                  <SelectItem value="last-contact">Recent contact</SelectItem>
                  <SelectItem value="updated">Recently updated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading && !data ? (
            <Panel className="divide-y" aria-busy="true">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="space-y-2 px-4 py-3">
                  <div className="h-3.5 w-40 animate-pulse rounded-[2px] bg-muted" />
                  <div className="h-3 w-64 max-w-full animate-pulse rounded-[2px] bg-muted" />
                </div>
              ))}
            </Panel>
          ) : error ? (
            <Notice tone="bad">
              <p className="font-medium">Unable to load leads</p>
              <p className="mt-0.5 text-muted-foreground">{error}</p>
              <Track className="mt-2">
                <Pill size="sm" onClick={() => load(filters)}>Retry</Pill>
              </Track>
            </Notice>
          ) : !data || data.leads.length === 0 ? (
            <Panel className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">{isFiltered ? 'No matching leads' : 'No leads'}</p>
              <Track>
                {isFiltered && <Pill size="sm" className="max-md:h-10" onClick={resetFilters}>Reset filters</Pill>}
                {canCreate && <Pill size="sm" variant="primary" className="max-md:h-10" onClick={openCreate}><Plus />New lead</Pill>}
              </Track>
            </Panel>
          ) : (
            <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={loading}>
              <DeskTable aria-label="Leads">
                <thead>
                  <tr>
                    <Th>Lead</Th>
                    <Th>Status</Th>
                    <Th priority={3}>Source</Th>
                    <Th priority={2}>Vehicle</Th>
                    <Th priority={2}>Owner</Th>
                    <Th priority={3}>Activity</Th>
                    <Th priority={2}>Next step</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.leads.map(lead => {
                    const stage = leadStatus(lead.status)
                    const step = nextStep(lead)
                    const vehicle = vehicleLabel(lead)
                    const activity = lead.lastContact ? `Contacted ${formatAge(lead.lastContact)}` : `Created ${formatAge(lead.createdAt)}`
                    const hot = lead.timeframe === 'immediately' && !isClosed(lead.status)
                    return (
                      <Tr key={lead.id} className="cursor-pointer" onClick={() => openLead(lead.id)}>
                        <Td className="min-w-0 max-w-[16rem]">
                          <Link href={`${basePath}/platform/crm/${lead.id}`} onClick={event => event.stopPropagation()} className="font-medium text-foreground hover:underline">
                            {lead.firstName} {lead.lastName}
                          </Link>
                          {hot && <span className="ml-2 text-[12px] font-medium text-red-700 dark:text-red-300">Hot</span>}
                          <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                            {[lead.email, formatPhone(lead.phone), lead.timeframe && lead.timeframe !== 'immediately' ? timeframeLabel(lead.timeframe) : null].filter(Boolean).join(' · ')}
                          </p>
                          <p className="truncate text-xs md:hidden">
                            {step.bad ? <Attention>{step.label}</Attention> : <span className="text-muted-foreground">{step.label}</span>}
                          </p>
                        </Td>
                        <Td><Status tone={stage.tone}>{stage.label}</Status></Td>
                        <Td priority={3} className="text-muted-foreground">{sourceLabel(lead.source)}</Td>
                        <Td priority={2} className="text-muted-foreground">{vehicle || '-'}</Td>
                        <Td priority={2} className={lead.assignedSalesperson ? 'text-foreground' : 'text-muted-foreground'}>{lead.assignedSalesperson?.name || 'Unassigned'}</Td>
                        <Td priority={3} className="whitespace-nowrap text-muted-foreground">{activity}</Td>
                        <Td priority={2} className="whitespace-nowrap">
                          {step.bad ? <Attention>{step.label}</Attention> : <span className="text-muted-foreground">{step.label}</span>}
                        </Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </DeskTable>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs tabular-nums text-muted-foreground">{pageStart}-{pageEnd} of {total}</p>
                <Track>
                  <Pill size="sm" className="h-10 sm:h-7" disabled={filters.page === 0 || loading} onClick={() => update({ page: filters.page - 1 })} aria-label="Previous page"><ChevronLeft /></Pill>
                  <Pill size="sm" className="h-10 sm:h-7" disabled={pageEnd >= total || loading} onClick={() => update({ page: filters.page + 1 })} aria-label="Next page"><ChevronRight /></Pill>
                </Track>
              </div>
            </div>
          )}
        </section>

        <ReadoutStrip>
          <Readout label="Open" value={counts?.open ?? '-'} />
          <Readout label="Response overdue" value={counts?.overdue ?? '-'} tone={(counts?.overdue ?? 0) > 0 ? 'bad' : 'idle'} />
          <Readout label="New" value={counts?.new ?? '-'} tone={(counts?.new ?? 0) > 0 ? 'info' : 'idle'} />
          <Readout
            label="Converted"
            value={counts?.converted ?? '-'}
            tone={(counts?.converted ?? 0) > 0 ? 'ok' : 'idle'}
            sub={counts && counts.all > 0 ? `${Math.round((counts.converted / counts.all) * 100)}% conversion` : undefined}
          />
        </ReadoutStrip>
      </div>

      <LeadFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialValues={{ ...EMPTY_LEAD_FORM, rooftopId: rooftopForCreate }}
        rooftops={rooftops}
        vehicles={vehicles}
        loadStaff={getRooftopStaff}
        onSubmit={submitCreate}
      />
    </PageContainer>
  )
}
