'use client'
import { ViewerTime } from '@/features/dashboard/components/ViewerTime';
import { formatInZone } from '@/features/dashboard/lib/storeTime';

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, RefreshCw } from 'lucide-react'

import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import {
  Attention,
  DeskHeader,
  DeskSection,
  DeskTable,
  Figure,
  Meter,
  Notice,
  Pill,
  Readout,
  ReadoutStrip,
  Status,
  Td,
  Th,
  Tr,
  type DeskTone,
} from '@/features/platform/components/desk'
import { getOperationalReport, type OperationalReport, type PeriodMetric } from '../actions'
import { useHydrated } from '../../lib/useHydrated'
import { monthLabel } from '../../analytics/lib/monthLabel'
import { HairlineChart } from '../../analytics/components/HairlineChart'
import { countLabel } from '@/features/platform/lib/format'

const DAY_MS = 86_400_000
/** Same threshold the deal desk uses: a pencil or submitted deal is stale after two days. */
const DESK_STALE_DAYS = 2
/** Same threshold the inventory list uses: an available unit is aging past 60 days. */
const AGED_UNIT_DAYS = 60

const leadStages: Array<{ value: string; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'test-drive-scheduled', label: 'Test drive' },
  { value: 'negotiating', label: 'Negotiating' },
  { value: 'closed-won', label: 'Closed won' },
  { value: 'closed-lost', label: 'Closed lost' },
]

const dealTone: Record<string, DeskTone> = {
  pencil: 'idle',
  submitted: 'warn',
  approved: 'info',
  financed: 'info',
  delivered: 'ok',
  cancelled: 'bad',
}

const dealLabel: Record<string, string> = {
  pencil: 'Pencil',
  submitted: 'Submitted',
  approved: 'Approved',
  financed: 'Financed',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

type QueueItem = {
  key: string
  label: string
  detail?: string
  count: number
  figure?: string
  status: string
  tone: DeskTone
  attention: boolean
  href: string
  place: string
  also?: { href: string; label: string }
}

function formatDate(value: string) {
  return formatInZone(value, undefined, "date")
}

function comparisonLabel(metric: PeriodMetric) {
  if (metric.previous === 0) return metric.current === 0 ? 'No change' : 'No prior period'
  const prefix = Number(metric.percentChange) > 0 ? '+' : ''
  return `${prefix}${metric.percentChange}% vs prior 30d`
}

function comparisonTone(metric: PeriodMetric): DeskTone | undefined {
  if (metric.previous === 0) return undefined
  return metric.direction === 'up' ? 'ok' : metric.direction === 'down' ? 'bad' : 'idle'
}

function plural(count: number, one: string, many = `${one}s`) {
  return count === 1 ? one : many
}

/** One queue row: the whole row opens the page that holds the work; an optional second link sits above it. */
function QueueRow({ item }: { item: QueueItem }) {
  return (
    <li className="relative grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-4 py-2.5 transition-colors hover:bg-muted/40 has-[a:focus-visible]:bg-muted/40 sm:grid-cols-[7.5rem_minmax(0,1fr)_5rem_8rem]">
      <span className="max-sm:hidden">
        <Status tone={item.tone}>{item.status}</Status>
      </span>
      <span className="min-w-0">
        <Link
          href={item.href}
          className="block truncate text-[14px] font-medium text-foreground after:absolute after:inset-0 focus-visible:outline-none"
        >
          {item.label}
        </Link>
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[12px] text-muted-foreground">
          <span className="sm:hidden">
            <Status tone={item.tone} className="text-[12px]">{item.status}</Status>
          </span>
          {item.detail && <span className="truncate">{item.detail}</span>}
          {item.also && (
            <Link href={item.also.href} className="relative z-[1] py-1 font-medium text-foreground underline underline-offset-4 sm:hidden">
              {item.also.label}
            </Link>
          )}
        </span>
      </span>
      <span className="text-right max-sm:col-start-2 max-sm:row-start-1 max-sm:row-span-2">
        <Figure size="md" attention={item.attention}>{item.figure ?? item.count}</Figure>
      </span>
      <span className="flex items-center justify-end gap-3 text-[12px] max-sm:hidden">
        {item.also && (
          <Link href={item.also.href} className="relative z-[1] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {item.also.label}
          </Link>
        )}
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          {item.place}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </span>
      </span>
    </li>
  )
}

export function OverviewDashboardPageClient({
  initialReport,
  initialCurrencyCode,
  initialError,
}: {
  initialReport: OperationalReport | null
  initialCurrencyCode: string
  initialError: string | null
}) {
  const hydrated = useHydrated()
  const router = useRouter()
  const [report, setReport] = useState<OperationalReport | null>(initialReport)
  const [currencyCode, setCurrencyCode] = useState(initialCurrencyCode)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)

  const formatCurrencyCents = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 }).format((value || 0) / 100)

  const loadDashboardData = async () => {
    setLoading(true)
    setError(null)
    const response = await getOperationalReport()
    if (response.success && response.data.operationalReport) {
      setReport(response.data.operationalReport)
      setCurrencyCode(response.data.dealershipProfile?.currencyCode || 'USD')
    } else {
      setError(response.success ? 'Unable to load the overview.' : response.error)
    }
    setLoading(false)
  }

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Overview' },
  ]

  const platform = `${basePath}/platform`
  const metrics = report?.metrics
  const exceptions = report?.exceptions.total ?? 0

  // Work queue, built only from counts the operational report returns. Each row opens the page that lists the records.
  const reportNow = report ? new Date(report.generatedAt).getTime() : 0
  const pendingRecent = (metrics?.recentDeals ?? []).filter(deal => deal.status === 'pencil' || deal.status === 'submitted')
  const ageInDays = (value: string) => Math.max(0, Math.floor((reportNow - new Date(value).getTime()) / DAY_MS))
  const staleDesk = pendingRecent.some(deal => ageInDays(deal.occurredAt) >= DESK_STALE_DAYS)
  const orderCount = (status: string) => metrics?.service.ordersByStatus.find(item => item.label === status)?.count ?? 0
  const newLeads = metrics?.salesFunnel.find(stage => stage.label === 'new')?.count ?? 0
  const averageAge = Math.round(metrics?.inventory.averageAgeDays ?? 0)
  const unitsAging = (metrics?.inventory.available ?? 0) > 0 && averageAge > AGED_UNIT_DAYS

  const queue: QueueItem[] = metrics && report
    ? [
        {
          key: 'today',
          label: 'Appointments and test drives today',
          detail: 'Service appointments and scheduled test drives',
          count: metrics.todayAppointments,
          status: 'Today',
          tone: 'info',
          attention: false,
          href: `${platform}/service`,
          place: 'Service',
          also: { href: `${platform}/test-drives`, label: 'Test drives' },
        },
        {
          key: 'desk',
          label: 'Deals on the desk',
          detail: staleDesk ? `Pencil or submitted · some waiting ${DESK_STALE_DAYS}+ days` : 'Pencil or submitted',
          count: metrics.pendingDeals,
          status: 'Waiting',
          tone: 'warn',
          attention: staleDesk,
          href: `${platform}/deals`,
          place: 'Deals',
        },
        {
          key: 'leads',
          label: 'New leads not yet contacted',
          detail: 'Lead status New',
          count: newLeads,
          status: 'New',
          tone: 'info',
          attention: false,
          href: `${platform}/crm`,
          place: 'CRM',
          also: { href: `${platform}/crm/tasks`, label: 'Tasks' },
        },
        {
          key: 'ro-estimate',
          label: 'Estimates awaiting approval',
          detail: 'Repair orders in Estimate',
          count: orderCount('estimate'),
          status: 'Estimate',
          tone: 'warn',
          attention: false,
          href: `${platform}/service`,
          place: 'Service',
        },
        {
          key: 'ro-approved',
          label: 'Approved repair orders not started',
          detail: 'Repair orders in Approved',
          count: orderCount('approved'),
          status: 'Approved',
          tone: 'info',
          attention: false,
          href: `${platform}/service`,
          place: 'Service',
        },
        {
          key: 'ro-progress',
          label: 'Repair orders in the shop',
          detail: 'Repair orders in progress',
          count: orderCount('in-progress'),
          status: 'In progress',
          tone: 'info',
          attention: false,
          href: `${platform}/service`,
          place: 'Service',
        },
        {
          key: 'ro-completed',
          label: 'Completed repair orders not invoiced',
          detail: 'Repair orders in Completed',
          count: orderCount('completed'),
          status: 'To invoice',
          tone: 'warn',
          attention: false,
          href: `${platform}/service`,
          place: 'Service',
        },
        {
          key: 'funding',
          label: 'Contracts with a funding exception',
          detail: 'Funding cases in Exception',
          count: report.exceptions.funding,
          status: 'Exception',
          tone: 'bad',
          attention: true,
          href: `${platform}/finance`,
          place: 'Finance',
        },
        {
          key: 'payments',
          label: 'Payments failed or stuck creating',
          detail: 'Payment transactions in Failed or Creating',
          count: report.exceptions.payments,
          status: 'Exception',
          tone: 'bad',
          attention: true,
          href: `${platform}/payments`,
          place: 'Payments',
        },
        {
          key: 'accounting',
          label: 'Accounting batches failed or posting',
          detail: 'Journal batches in Failed or Posting',
          count: report.exceptions.accounting,
          status: 'Exception',
          tone: 'bad',
          attention: true,
          href: `${platform}/accounting`,
          place: 'Accounting',
        },
        {
          key: 'parts',
          label: 'Parts at or below minimum',
          detail: 'On hand less committed, at or under the minimum',
          count: metrics.parts?.lowStockCount ?? 0,
          status: 'Low stock',
          tone: 'warn',
          attention: true,
          href: `${platform}/parts`,
          place: 'Parts',
        },
      ]
    : []
  if (metrics && unitsAging) {
    queue.push({
      key: 'aged',
      label: `Units in stock averaging over ${AGED_UNIT_DAYS} days`,
      detail: `${metrics.inventory.available} ${plural(metrics.inventory.available, 'unit')} available`,
      count: averageAge,
      figure: `${averageAge}d`,
      status: 'Aged',
      tone: 'warn',
      attention: true,
      href: `${platform}/vehicles`,
      place: 'Inventory',
    })
  }
  const waiting = queue.filter(item => item.count > 0)
  const clear = queue.filter(item => item.count === 0)

  const header = (
    <DeskHeader
      title="Overview"
      tone={report ? (waiting.length > 0 ? 'warn' : 'ok') : 'bad'}
      status={report ? (waiting.length > 0 ? `${waiting.length} waiting` : 'Nothing waiting') : 'Unavailable'}
      meta={
        report ? (
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-medium text-foreground">{waiting.length > 0 ? `${waiting.length} ${plural(waiting.length, 'item')} need you` : 'Nothing waiting'}</span>
            {hydrated && <span>Updated <ViewerTime value={report.generatedAt} style="datetime" /></span>}
          </span>
        ) : 'Unavailable'
      }
      actions={
        <>
          <Pill variant="plain" onClick={loadDashboardData} disabled={loading} aria-label="Refresh" className="h-10 sm:h-8">
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            Refresh
          </Pill>
          <Pill asChild variant="primary" className="h-10 sm:h-8">
            <Link href={`${platform}/analytics`}>
              Analytics
              <ArrowRight />
            </Link>
          </Pill>
        </>
      }
    />
  )

  if (!report || !metrics) {
    return (
      <PageContainer title="Overview" header={header} breadcrumbs={breadcrumbs}>
        <div className="px-4 pb-24 md:px-6">
          <Notice tone="bad">
            <p className="font-medium">Unable to load the overview</p>
            {error && <p className="mt-0.5 text-muted-foreground">{error}</p>}
          </Notice>
        </div>
      </PageContainer>
    )
  }

  const revenueChart = metrics.deliveredByMonth.map(item => ({ ...item, label: monthLabel(item.month), revenue: item.revenueCents / 100 }))
  const latestMonth = revenueChart[revenueChart.length - 1]?.month
  const compactCurrency = new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode, notation: 'compact', maximumFractionDigits: 0 })
  const knownStages = new Set(leadStages.map(stage => stage.value))
  const pipeline = [
    ...leadStages.map(stage => ({ ...stage, count: metrics.salesFunnel.find(item => item.label === stage.value)?.count ?? 0 })),
    ...metrics.salesFunnel.filter(item => !knownStages.has(item.label)).map(item => ({ value: item.label, label: item.label, count: item.count })),
  ]
  const pc = metrics.periodComparison

  return (
    <PageContainer title="Overview" header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {error && <Notice tone="bad">{error}</Notice>}

        <DeskSection id="overview-needs-you" title="Needs you today" count={waiting.length}>
          {waiting.length > 0 ? (
            <ul className="divide-y rounded-md border bg-card">
              {waiting.map(item => <QueueRow key={item.key} item={item} />)}
            </ul>
          ) : (
            <p className="py-3 text-[13px] text-muted-foreground">Nothing waiting</p>
          )}
          {waiting.length > 0 && clear.length > 0 && (
            <p className="mt-2 text-[12px] text-muted-foreground">{clear.length} other queues clear</p>
          )}
        </DeskSection>

        <DeskSection
          id="overview-recent-deals"
          title="Latest deals"
          count={metrics.recentDeals.length}
          actions={
            <Link href={`${platform}/deals`} className="inline-flex min-h-10 items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground sm:min-h-0">
              Desk log
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          }
        >
          {metrics.recentDeals.length > 0 ? (
            <DeskTable>
              <thead>
                <tr>
                  <Th>Status</Th>
                  <Th>Vehicle</Th>
                  <Th priority={2}>Customer</Th>
                  <Th align="right">Price</Th>
                  <Th align="right" priority={3}>Gross</Th>
                  <Th align="right" priority={2}>Age</Th>
                </tr>
              </thead>
              <tbody>
                {metrics.recentDeals.map(deal => {
                  const pending = deal.status === 'pencil' || deal.status === 'submitted'
                  const days = ageInDays(deal.occurredAt)
                  const stale = pending && days >= DESK_STALE_DAYS
                  const href = `${platform}/deals/${deal.id}`
                  return (
                    <Tr key={deal.id} className="cursor-pointer" onClick={() => router.push(href)}>
                      <Td className="w-[1%]">
                        <Status tone={dealTone[deal.status] ?? 'idle'}>{dealLabel[deal.status] ?? deal.status}</Status>
                      </Td>
                      <Td className="min-w-0 max-w-[16rem]">
                        <Link href={href} onClick={event => event.stopPropagation()} className="block truncate font-medium text-foreground hover:underline">
                          {deal.vehicle ? `${deal.vehicle.year} ${deal.vehicle.make} ${deal.vehicle.model}` : 'No vehicle'}
                        </Link>
                        <span className="block truncate text-[12px] text-muted-foreground md:hidden">
                          {deal.lead ? `${deal.lead.firstName} ${deal.lead.lastName}` : 'No customer'}
                        </span>
                      </Td>
                      <Td priority={2} className="max-w-[12rem] truncate">
                        {deal.lead ? `${deal.lead.firstName} ${deal.lead.lastName}` : <span className="text-muted-foreground">No customer</span>}
                      </Td>
                      <Td align="right" className="whitespace-nowrap">
                        <Figure size="sm">{formatCurrencyCents(deal.vehiclePriceCents)}</Figure>
                      </Td>
                      <Td align="right" priority={3} className="whitespace-nowrap text-muted-foreground">{formatCurrencyCents(deal.grossCents)}</Td>
                      <Td align="right" priority={2} className="whitespace-nowrap text-[12px] text-muted-foreground">
                        {stale ? (
                          <Attention>{days} days</Attention>
                        ) : pending ? (
                          <span className="tabular-nums">{days === 0 ? 'Today' : `${days} ${plural(days, 'day')}`}</span>
                        ) : hydrated ? (
                          formatDate(deal.occurredAt)
                        ) : null}
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DeskTable>
          ) : (
            <p className="py-3 text-[13px] text-muted-foreground">No deals yet</p>
          )}
        </DeskSection>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr]">
          <DeskSection id="overview-revenue" title="Delivered revenue by month">
            {revenueChart.length > 0 ? (
              <HairlineChart
                data={revenueChart}
                xKey="label"
                yKey="revenue"
                label="Delivered revenue"
                yWidth={52}
                format={value => compactCurrency.format(value)}
                highlight={row => row.month === latestMonth}
              />
            ) : (
              <p className="py-3 text-[13px] text-muted-foreground">No deliveries</p>
            )}
          </DeskSection>

          <DeskSection
            id="overview-pipeline"
            title="Lead pipeline"
            count={metrics.totalLeads}
            actions={
              <Link href={`${platform}/crm`} className="inline-flex min-h-10 items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground sm:min-h-0">
                CRM
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            }
          >
            {metrics.totalLeads > 0 ? (
              <DeskTable>
                <thead>
                  <tr>
                    <Th>Stage</Th>
                    <Th align="right">Leads</Th>
                    <Th align="right" priority={2}>Share</Th>
                  </tr>
                </thead>
                <tbody>
                  {pipeline.map(stage => (
                    <Tr key={stage.value}>
                      <Td className={stage.count === 0 ? 'text-muted-foreground' : 'text-foreground'}>{stage.label}</Td>
                      <Td align="right" className="w-[1%] whitespace-nowrap">
                        <Figure size="sm" className={stage.count === 0 ? 'text-muted-foreground' : undefined}>{stage.count}</Figure>
                      </Td>
                      <Td align="right" priority={2} className="w-[1%] whitespace-nowrap">
                        <span className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
                          <Meter value={stage.count / metrics.totalLeads} label={`${stage.label} share of leads`} />
                          <span className="w-9 text-right tabular-nums">{Math.round((stage.count / metrics.totalLeads) * 100)}%</span>
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </DeskTable>
            ) : (
              <p className="py-3 text-[13px] text-muted-foreground">No leads</p>
            )}
          </DeskSection>
        </div>

        <DeskSection id="overview-salespeople" title="Salespeople by gross" count={metrics.topSalespeople.length}>
          {metrics.topSalespeople.length > 0 ? (
            <DeskTable>
              <thead>
                <tr>
                  <Th>Salesperson</Th>
                  <Th align="right">Delivered</Th>
                  <Th align="right">Gross</Th>
                  <Th align="right" priority={2}>Revenue</Th>
                </tr>
              </thead>
              <tbody>
                {metrics.topSalespeople.map(person => (
                  <Tr key={person.id}>
                    <Td className="max-w-[14rem] truncate font-medium">{person.name}</Td>
                    <Td align="right" className="text-muted-foreground">{person.deals}</Td>
                    <Td align="right" className="whitespace-nowrap">
                      <Figure size="sm">{formatCurrencyCents(person.grossCents)}</Figure>
                    </Td>
                    <Td align="right" priority={2} className="whitespace-nowrap text-muted-foreground">{formatCurrencyCents(person.revenueCents)}</Td>
                  </Tr>
                ))}
              </tbody>
            </DeskTable>
          ) : (
            <p className="py-3 text-[13px] text-muted-foreground">No delivered deals</p>
          )}
        </DeskSection>
        <DeskSection id="overview-30d" title="Last 30 days">
          <ReadoutStrip>
            <Readout label="Units delivered" value={pc.deliveredCount.current} sub={comparisonLabel(pc.deliveredCount)} tone={comparisonTone(pc.deliveredCount)} />
            <Readout label="Gross" value={formatCurrencyCents(pc.deliveredGrossCents.current)} sub={metrics.deliveredDeals ? `Avg ${formatCurrencyCents(metrics.averageDeliveredGrossCents)} all time` : comparisonLabel(pc.deliveredGrossCents)} tone={comparisonTone(pc.deliveredGrossCents)} />
            <Readout label="Delivered revenue" value={formatCurrencyCents(pc.deliveredRevenueCents.current)} sub={comparisonLabel(pc.deliveredRevenueCents)} tone={comparisonTone(pc.deliveredRevenueCents)} />
            <Readout label="New leads" value={pc.newLeads.current} sub={comparisonLabel(pc.newLeads)} tone={comparisonTone(pc.newLeads)} />
            <Readout label="Lead conversion" value={`${metrics.leadConversionPercent.toFixed(1)}%`} sub={metrics.convertedLeads != null ? `${metrics.convertedLeads} of ${countLabel(metrics.totalLeads, 'lead')}` : countLabel(metrics.totalLeads, 'lead')} />
            <Readout label="Service revenue" value={formatCurrencyCents(pc.settledServiceRevenueCents.current)} sub={comparisonLabel(pc.settledServiceRevenueCents)} tone={comparisonTone(pc.settledServiceRevenueCents)} />
          </ReadoutStrip>
        </DeskSection>


        <DeskSection id="overview-stock-service" title="Stock and shop">
          <ReadoutStrip>
            <Readout label="Units in stock" value={metrics.inventory.available} sub={metrics.inventory.available ? `Avg age ${countLabel(averageAge, 'day')}` : undefined} />
            <Readout label="Retail" value={formatCurrencyCents(metrics.inventory.retailCents)} />
            <Readout label="Cost" value={formatCurrencyCents(metrics.inventory.costCents)} sub={`Spread ${formatCurrencyCents(metrics.inventory.retailCents - metrics.inventory.costCents)}`} />
            <Readout label="Sold hours" value={metrics.service.soldHours.toFixed(1)} sub={`Actual ${metrics.service.actualHours.toFixed(1)} · ELR ${formatCurrencyCents(metrics.service.effectiveLaborRateCents)}`} />
            <Readout label="Open exceptions" value={exceptions} sub={`Acct ${report.exceptions.accounting} · Pay ${report.exceptions.payments} · Fund ${report.exceptions.funding}`} />
          </ReadoutStrip>
        </DeskSection>
      </div>
    </PageContainer>
  )
}
