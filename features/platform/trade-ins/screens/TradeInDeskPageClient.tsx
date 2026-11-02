'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, RefreshCw, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { Code, DeskHeader, DeskSection, DeskTable, Figure, Notice, Panel, Pill, Segmented, Status, Td, Th, Tr, Track } from '@/features/platform/components/desk'
import { formatPhone } from '@/features/platform/lib/format'
import {
  createWalkInTradeIn,
  getTradeInCreateOptions,
  getTradeIns,
  type TradeIn,
  type TradeInAcquisition,
  type TradeInLeadOption,
  type TradeInRooftop,
} from '../actions'
import { EMPTY_TRADE_IN_FORM, TradeInFormDialog, tradeInDetailsPayload, type TradeInFormValues } from '../components/TradeInFormDialog'
import {
  conditionLabel,
  conditionTone,
  formatMileage,
  formatWholeUsd,
  tradeInCustomer,
  tradeInQueue,
  tradeInState,
  tradeInMatches,
  tradeInVehicleLabel,
  type TradeInQueue,
} from '../lib/tradeInState'

type DeskData = { tradeIns: TradeIn[]; acquisitions: Record<string, TradeInAcquisition>; canSeeAcquisitions: boolean }

export function TradeInDeskPageClient({
  initialData,
  initialError,
  timeZone,
}: {
  initialData: DeskData | null
  initialError: string | null
  timeZone: string
}) {
  const router = useRouter()
  const [data, setData] = useState<DeskData>(initialData ?? { tradeIns: [], acquisitions: {}, canSeeAcquisitions: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [search, setSearch] = useState('')
  const [sortOrder, setSortOrder] = useState('recent')
  const [filter, setFilter] = useState<TradeInQueue>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createOptions, setCreateOptions] = useState<{ rooftops: TradeInRooftop[]; leads: TradeInLeadOption[] } | null>(null)
  const createKeyRef = useRef<string>('')

  const { tradeIns, acquisitions } = data

  const load = async () => {
    setLoading(true)
    setError(null)
    const response = await getTradeIns()
    if (response.success) setData(response.data)
    else setError(response.error || 'Unable to load trade-ins.')
    setLoading(false)
  }

  const counts = useMemo(() => {
    const result: Record<TradeInQueue, number> = { appraise: 0, offered: 0, 'on-deal': 0, acquired: 0, closed: 0, all: tradeIns.length }
    for (const tradeIn of tradeIns) result[tradeInQueue(tradeIn, acquisitions[tradeIn.id])] += 1
    return result
  }, [tradeIns, acquisitions])

  const visible = useMemo(() => {
    const rows = tradeIns.filter(tradeIn => {
      if (filter !== 'all' && tradeInQueue(tradeIn, acquisitions[tradeIn.id]) !== filter) return false
      return tradeInMatches(tradeIn, search)
    })
    return [...rows].sort((a, b) =>
      sortOrder === 'offer-desc'
        ? (b.offerAmount || 0) - (a.offerAmount || 0)
        : sortOrder === 'mileage'
          ? (a.mileage ?? Number.MAX_SAFE_INTEGER) - (b.mileage ?? Number.MAX_SAFE_INTEGER)
          : sortOrder === 'vehicle'
            ? tradeInVehicleLabel(a).localeCompare(tradeInVehicleLabel(b))
            : new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    )
  }, [tradeIns, acquisitions, filter, search, sortOrder])

  const openCreate = async () => {
    setCreateError(null)
    createKeyRef.current = `trade-in-walk-in:${crypto.randomUUID()}`
    // Options load before the dialog opens so a single rooftop can be preselected.
    if (!createOptions) {
      setCreateBusy(true)
      const response = await getTradeInCreateOptions()
      setCreateBusy(false)
      if (response.success) setCreateOptions(response.data)
      else setCreateError(response.error || 'Unable to load rooftops.')
    }
    setCreateOpen(true)
  }

  const submitCreate = async (values: TradeInFormValues) => {
    setCreateBusy(true)
    setCreateError(null)
    const details = tradeInDetailsPayload(values)
    const response = await createWalkInTradeIn({
      rooftopId: values.rooftopId,
      leadId: values.leadId || undefined,
      ...details,
      condition: details.condition || undefined,
      idempotencyKey: createKeyRef.current,
    })
    setCreateBusy(false)
    if (!response.success) {
      setCreateError(response.error)
      return
    }
    setCreateOpen(false)
    router.push(`${basePath}/platform/trade-ins/${response.data.createWalkInTradeIn.id}`)
  }

  const createInitial: TradeInFormValues = {
    ...EMPTY_TRADE_IN_FORM,
    rooftopId: createOptions?.rooftops.length === 1 ? createOptions.rooftops[0].id : '',
  }

  const isFiltered = Boolean(search.trim()) || filter !== 'all'
  const resetFilters = () => {
    setSearch('')
    setFilter('all')
  }

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Trade-Ins' },
  ]

  const header = (
    <DeskHeader
      title="Trade-ins"
      tone={error ? 'bad' : counts.appraise > 0 ? 'warn' : 'ok'}
      status={error ? 'Unavailable' : `${counts.appraise} need appraisal`}
      meta={error ? 'Unavailable' : `${counts.appraise} need appraisal · ${counts.offered} offered · ${counts['on-deal']} on deals`}
      actions={
        <>
          <Pill variant="plain" className="max-md:h-10" onClick={load} disabled={loading} aria-label="Refresh trade-ins">
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            Refresh
          </Pill>
          <Pill variant="primary" className="max-md:h-10" onClick={openCreate} disabled={createBusy}>
            <Plus />
            New trade-in
          </Pill>
        </>
      }
    />
  )

  const filterOptions: Array<{ value: TradeInQueue; label: string; count: number; tone?: 'warn' | 'info' | 'ok' }> = [
    { value: 'appraise', label: 'Needs appraisal', count: counts.appraise, tone: 'warn' },
    { value: 'offered', label: 'Offered', count: counts.offered, tone: 'info' },
    { value: 'on-deal', label: 'On deal', count: counts['on-deal'], tone: 'ok' },
    ...(data.canSeeAcquisitions ? [{ value: 'acquired' as const, label: 'Acquired', count: counts.acquired }] : []),
    ...(counts.closed > 0 ? [{ value: 'closed' as const, label: 'Closed', count: counts.closed }] : []),
    { value: 'all', label: 'All', count: counts.all },
  ]

  // Appraisals waiting on a value, longest waiting first.
  const now = Date.now()
  const awaiting = tradeIns
    .filter(tradeIn => tradeInQueue(tradeIn, acquisitions[tradeIn.id]) === 'appraise')
    .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
  const waitedDays = (createdAt: string | null) =>
    createdAt ? Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 86_400_000)) : null
  const detailHref = (tradeIn: TradeIn) => `${basePath}/platform/trade-ins/${tradeIn.id}`
  const shortDate = (value: string | null) => value ? new Date(value).toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric' }) : '-'

  const vehicleCell = (tradeIn: TradeIn) => (
    <>
      <Link href={detailHref(tradeIn)} onClick={event => event.stopPropagation()} className="font-medium text-foreground hover:underline">
        {tradeInVehicleLabel(tradeIn)}
      </Link>
      <p className="text-xs text-muted-foreground">VIN <Code>{tradeIn.vin || 'not entered'}</Code></p>
    </>
  )

  const customerLine = (tradeIn: TradeIn) => {
    const customer = tradeInCustomer(tradeIn)
    return `${customer || 'No customer'}${tradeIn.lead ? ` · ${formatPhone(tradeIn.lead.phone) || tradeIn.lead.email || 'No contact'}` : ''}`
  }

  const conditionCell = (tradeIn: TradeIn) => tradeIn.condition
    ? <Status tone={conditionTone[tradeIn.condition] ?? 'idle'}>{conditionLabel(tradeIn.condition)}</Status>
    : <span className="text-muted-foreground">Not graded</span>

  return (
    <PageContainer title="Trade-Ins" header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        <DeskSection id="trade-ins-awaiting" title="Awaiting a value" count={error ? undefined : awaiting.length}>
          {error ? (
            <Notice tone="bad">
              <p className="font-medium">Trade-ins unavailable</p>
              <p className="mt-0.5 text-muted-foreground">{error}</p>
              <Track className="mt-2"><Pill size="sm" onClick={load}>Retry</Pill></Track>
            </Notice>
          ) : awaiting.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No appraisals waiting</p>
          ) : (
            <DeskTable aria-label="Trade-ins awaiting a value">
              <thead>
                <tr>
                  <Th align="right" className="w-20">Waiting</Th>
                  <Th>Vehicle</Th>
                  <Th priority={2}>Customer</Th>
                  <Th priority={3} align="right">Mileage</Th>
                  <Th priority={3}>Condition</Th>
                  <Th className="w-0"><span className="sr-only">Actions</span></Th>
                </tr>
              </thead>
              <tbody>
                {awaiting.map(tradeIn => {
                  const days = waitedDays(tradeIn.createdAt)
                  return (
                    <Tr key={tradeIn.id} className="cursor-pointer" onClick={() => router.push(detailHref(tradeIn))}>
                      <Td align="right" className="whitespace-nowrap">
                        <Figure size="sm">{days == null ? '-' : `${days}d`}</Figure>
                        <span className="block text-xs text-muted-foreground">{shortDate(tradeIn.createdAt)}</span>
                      </Td>
                      <Td className="min-w-0">
                        {vehicleCell(tradeIn)}
                        <p className="break-words text-xs text-muted-foreground md:hidden">{customerLine(tradeIn)}</p>
                      </Td>
                      <Td priority={2} className="min-w-0 text-muted-foreground">{customerLine(tradeIn)}</Td>
                      <Td priority={3} align="right" className="whitespace-nowrap text-muted-foreground">{tradeIn.mileage != null ? formatMileage(tradeIn.mileage) : '-'}</Td>
                      <Td priority={3}>{conditionCell(tradeIn)}</Td>
                      <Td className="text-right">
                        <Pill asChild size="sm" variant="primary" className="h-10 md:h-7" onClick={event => event.stopPropagation()}>
                          <Link href={detailHref(tradeIn)} aria-label={`Appraise ${tradeInVehicleLabel(tradeIn)}`}>Appraise</Link>
                        </Pill>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>

        <section aria-labelledby="trade-ins-all" className="min-w-0 space-y-3">
          <h2 id="trade-ins-all" className="text-[15px] font-semibold text-foreground">All trade-ins</h2>
          <Segmented<TradeInQueue> label="Filter trade-ins" value={filter} onChange={setFilter} options={filterOptions} className="max-md:[&_button]:h-10" />
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-10 rounded-[4px] pl-9 text-[13px] sm:h-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Vehicle, customer, VIN or reference" aria-label="Search trade-ins" />
            </div>
            <Select value={sortOrder} onValueChange={setSortOrder}>
              <SelectTrigger className="h-10 w-[9.5rem] shrink-0 rounded-[4px] px-2.5 text-[13px] sm:h-9" aria-label="Sort trade-ins"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Newest first</SelectItem>
                <SelectItem value="vehicle">Vehicle</SelectItem>
                <SelectItem value="offer-desc">Highest offer</SelectItem>
                <SelectItem value="mileage">Lowest mileage</SelectItem>
              </SelectContent>
            </Select>
            {loading && <span className="text-xs text-muted-foreground" role="status">Refreshing…</span>}
          </div>

          {error ? null : visible.length === 0 ? (
            <Panel className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">{tradeIns.length > 0 && isFiltered ? 'No matching trade-ins' : 'No trade-ins'}</p>
              <Track>
                {tradeIns.length > 0 && isFiltered ? <Pill size="sm" className="max-md:h-10" onClick={resetFilters}>Reset filters</Pill> : <Pill size="sm" variant="primary" className="max-md:h-10" onClick={openCreate} disabled={createBusy}><Plus />New trade-in</Pill>}
              </Track>
            </Panel>
          ) : (
            <DeskTable aria-label="Trade-ins">
              <thead>
                <tr>
                  <Th>Vehicle</Th>
                  <Th priority={2}>Status</Th>
                  <Th priority={2}>Customer</Th>
                  <Th priority={3} align="right">Mileage</Th>
                  <Th priority={3}>Condition</Th>
                  <Th align="right">Offer</Th>
                  <Th priority={3} align="right">Reference</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map(tradeIn => {
                  const state = tradeInState(tradeIn, acquisitions[tradeIn.id])
                  return (
                    <Tr key={tradeIn.id} className="cursor-pointer" onClick={() => router.push(detailHref(tradeIn))}>
                      <Td className="min-w-0">
                        {vehicleCell(tradeIn)}
                        <p className="md:hidden"><Status tone={state.tone} className="text-xs">{state.label}</Status></p>
                      </Td>
                      <Td priority={2}><Status tone={state.tone}>{state.label}</Status></Td>
                      <Td priority={2} className="min-w-0 text-muted-foreground">
                        {customerLine(tradeIn)}
                        <p className="text-xs">{shortDate(tradeIn.createdAt)}</p>
                      </Td>
                      <Td priority={3} align="right" className="whitespace-nowrap text-muted-foreground">{tradeIn.mileage != null ? formatMileage(tradeIn.mileage) : '-'}</Td>
                      <Td priority={3}>{conditionCell(tradeIn)}</Td>
                      <Td align="right" className="whitespace-nowrap">
                        {tradeIn.offerAmount != null ? <Figure size="sm">{formatWholeUsd(tradeIn.offerAmount)}</Figure> : <span className="text-muted-foreground">-</span>}
                      </Td>
                      <Td priority={3} align="right" className="whitespace-nowrap text-muted-foreground">
                        {tradeIn.referenceValue != null ? formatWholeUsd(tradeIn.referenceValue) : '-'}
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DeskTable>
          )}
        </section>
      </div>

      <TradeInFormDialog
        open={createOpen}
        mode="create"
        initialValues={createInitial}
        rooftops={createOptions?.rooftops || []}
        leads={createOptions?.leads || []}
        busy={createBusy}
        error={createError}
        onSubmit={submitCreate}
        onOpenChange={open => {
          setCreateOpen(open)
          if (!open) setCreateError(null)
        }}
      />
    </PageContainer>
  )
}
