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
import { useLocale } from '@/features/i18n/LocaleProvider'

const DAY_MS = 86_400_000
/** Same threshold the deal desk uses: a pencil or submitted deal is stale after two days. */
const DESK_STALE_DAYS = 2
/** Same threshold the inventory list uses: an available unit is aging past 60 days. */
const AGED_UNIT_DAYS = 60

const leadStages: Array<{ value: string; label: string; labelPt: string }> = [
  { value: 'new', label: 'New', labelPt: 'Novo' },
  { value: 'contacted', label: 'Contacted', labelPt: 'Em contato' },
  { value: 'test-drive-scheduled', label: 'Test drive', labelPt: 'Test-drive agendado' },
  { value: 'negotiating', label: 'Negotiating', labelPt: 'Em negociação' },
  { value: 'closed-won', label: 'Closed won', labelPt: 'Venda concluída' },
  { value: 'closed-lost', label: 'Closed lost', labelPt: 'Venda perdida' },
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
const dealLabelPt: Record<string, string> = {
  pencil: 'Em negociação', submitted: 'Enviada', approved: 'Aprovada', financed: 'Financiada', delivered: 'Entregue', cancelled: 'Cancelada',
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

function formatDate(value: string, locale: 'pt-BR' | 'en-US') {
  return formatInZone(value, undefined, 'date', locale)
}

function comparisonLabel(metric: PeriodMetric, locale: 'pt-BR' | 'en-US') {
  if (metric.previous === 0) return metric.current === 0 ? (locale === 'pt-BR' ? 'Sem alteração' : 'No change') : (locale === 'pt-BR' ? 'Sem período anterior' : 'No prior period')
  const prefix = Number(metric.percentChange) > 0 ? '+' : ''
  return locale === 'pt-BR' ? `${prefix}${metric.percentChange}% em relação aos 30 dias anteriores` : `${prefix}${metric.percentChange}% vs prior 30d`
}

function comparisonTone(metric: PeriodMetric): DeskTone | undefined {
  if (metric.previous === 0) return undefined
  return metric.direction === 'up' ? 'ok' : metric.direction === 'down' ? 'bad' : 'idle'
}

function plural(count: number, one: string, many = `${one}s`, locale: 'pt-BR' | 'en-US' = 'en-US') {
  return new Intl.PluralRules(locale).select(count) === 'one' ? one : many
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
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const copy = (english: string, portuguese: string) => pt ? portuguese : english
  const hydrated = useHydrated()
  const router = useRouter()
  const [report, setReport] = useState<OperationalReport | null>(initialReport)
  const [currencyCode, setCurrencyCode] = useState(initialCurrencyCode)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)

  const formatCurrencyCents = (value: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 }).format((value || 0) / 100)

  const loadDashboardData = async () => {
    setLoading(true)
    setError(null)
    const response = await getOperationalReport()
    if (response.success && response.data.operationalReport) {
      setReport(response.data.operationalReport)
      setCurrencyCode(response.data.dealershipProfile?.currencyCode || 'USD')
    } else {
      setError(response.success ? copy('Unable to load the overview.', 'Não foi possível carregar a visão geral.') : response.error)
    }
    setLoading(false)
  }

  const breadcrumbs = [
    { type: 'link' as const, label: copy('Dashboard', 'Painel'), href: basePath },
    { type: 'page' as const, label: copy('Platform', 'Plataforma') },
    { type: 'page' as const, label: copy('Overview', 'Visão geral') },
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
          label: copy('Appointments and test drives today', 'Agendamentos e test-drives de hoje'),
          detail: copy('Service appointments and scheduled test drives', 'Agendamentos da oficina e test-drives'),
          count: metrics.todayAppointments,
          status: copy('Today', 'Hoje'),
          tone: 'info',
          attention: false,
          href: `${platform}/service`,
          place: copy('Service', 'Oficina'),
          also: { href: `${platform}/test-drives`, label: copy('Test drives', 'Test-drives') },
        },
        {
          key: 'desk',
          label: copy('Deals on the desk', 'Vendas em negociação'),
          detail: staleDesk ? (pt ? `Em negociação ou enviadas · algumas aguardam há ${DESK_STALE_DAYS}+ dias` : `Pencil or submitted · some waiting ${DESK_STALE_DAYS}+ days`) : copy('Pencil or submitted', 'Em negociação ou enviadas'),
          count: metrics.pendingDeals,
          status: copy('Waiting', 'Aguardando'),
          tone: 'warn',
          attention: staleDesk,
          href: `${platform}/deals`,
          place: copy('Deals', 'Vendas'),
        },
        {
          key: 'leads',
          label: copy('New leads not yet contacted', 'Novos leads ainda sem contato'),
          detail: copy('Lead status New', 'Lead com status novo'),
          count: newLeads,
          status: copy('New', 'Novo'),
          tone: 'info',
          attention: false,
          href: `${platform}/crm`,
          place: 'CRM',
          also: { href: `${platform}/crm/tasks`, label: copy('Tasks', 'Tarefas') },
        },
        {
          key: 'ro-estimate',
          label: copy('Estimates awaiting approval', 'Orçamentos aguardando aprovação'),
          detail: copy('Repair orders in Estimate', 'Ordens de serviço com orçamento'),
          count: orderCount('estimate'),
          status: copy('Estimate', 'Orçamento'),
          tone: 'warn',
          attention: false,
          href: `${platform}/service`,
          place: copy('Service', 'Oficina'),
        },
        {
          key: 'ro-approved',
          label: copy('Approved repair orders not started', 'Ordens de serviço aprovadas ainda não iniciadas'),
          detail: copy('Repair orders in Approved', 'Ordens de serviço aprovadas'),
          count: orderCount('approved'),
          status: copy('Approved', 'Aprovada'),
          tone: 'info',
          attention: false,
          href: `${platform}/service`,
          place: copy('Service', 'Oficina'),
        },
        {
          key: 'ro-progress',
          label: copy('Repair orders in the shop', 'Veículos em serviço na oficina'),
          detail: copy('Repair orders in progress', 'Ordens de serviço em andamento'),
          count: orderCount('in-progress'),
          status: copy('In progress', 'Em andamento'),
          tone: 'info',
          attention: false,
          href: `${platform}/service`,
          place: copy('Service', 'Oficina'),
        },
        {
          key: 'ro-completed',
          label: copy('Completed repair orders not invoiced', 'Ordens de serviço concluídas sem faturamento'),
          detail: copy('Repair orders in Completed', 'Ordens de serviço concluídas'),
          count: orderCount('completed'),
          status: copy('To invoice', 'A faturar'),
          tone: 'warn',
          attention: false,
          href: `${platform}/service`,
          place: copy('Service', 'Oficina'),
        },
        {
          key: 'funding',
          label: copy('Contracts with a funding exception', 'Contratos com pendência na liberação do crédito'),
          detail: copy('Funding cases in Exception', 'Processos de liberação de crédito com pendência'),
          count: report.exceptions.funding,
          status: copy('Exception', 'Pendência'),
          tone: 'bad',
          attention: true,
          href: `${platform}/finance`,
          place: copy('Finance', 'Financeiro'),
        },
        {
          key: 'payments',
          label: copy('Payments failed or stuck creating', 'Pagamentos com falha ou em processamento'),
          detail: copy('Payment transactions in Failed or Creating', 'Transações de pagamento com falha ou em criação'),
          count: report.exceptions.payments,
          status: copy('Exception', 'Pendência'),
          tone: 'bad',
          attention: true,
          href: `${platform}/payments`,
          place: copy('Payments', 'Pagamentos'),
        },
        {
          key: 'accounting',
          label: copy('Accounting batches failed or posting', 'Lotes contábeis com falha ou em lançamento'),
          detail: copy('Journal batches in Failed or Posting', 'Lotes contábeis com falha ou em lançamento'),
          count: report.exceptions.accounting,
          status: copy('Exception', 'Pendência'),
          tone: 'bad',
          attention: true,
          href: `${platform}/accounting`,
          place: copy('Accounting', 'Contabilidade'),
        },
        {
          key: 'parts',
          label: copy('Parts at or below minimum', 'Peças no limite ou abaixo do estoque mínimo'),
          detail: copy('On hand less committed, at or under the minimum', 'Saldo disponível igual ou abaixo do estoque mínimo'),
          count: metrics.parts?.lowStockCount ?? 0,
          status: copy('Low stock', 'Estoque baixo'),
          tone: 'warn',
          attention: true,
          href: `${platform}/parts`,
          place: copy('Parts', 'Peças'),
        },
      ]
    : []
  if (metrics && unitsAging) {
    queue.push({
      key: 'aged',
      label: copy(`Units in stock averaging over ${AGED_UNIT_DAYS} days`, `Veículos no estoque há mais de ${AGED_UNIT_DAYS} dias, em média`),
      detail: `${metrics.inventory.available} ${pt ? plural(metrics.inventory.available, 'veículo', 'veículos', locale) : plural(metrics.inventory.available, 'unit')} ${copy('available', 'disponíveis')}`,
      count: averageAge,
      figure: `${averageAge}d`,
      status: copy('Aged', 'Estoque antigo'),
      tone: 'warn',
      attention: true,
      href: `${platform}/vehicles`,
      place: copy('Inventory', 'Estoque'),
    })
  }
  const waiting = queue.filter(item => item.count > 0)
  const clear = queue.filter(item => item.count === 0)

  const header = (
    <DeskHeader
      title={copy('Overview', 'Visão geral')}
      tone={report ? (waiting.length > 0 ? 'warn' : 'ok') : 'bad'}
      status={report ? (waiting.length > 0 ? `${waiting.length} ${copy('waiting', 'aguardando')}` : copy('Nothing waiting', 'Nenhuma pendência')) : copy('Unavailable', 'Indisponível')}
      meta={
        report ? (
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-medium text-foreground">{waiting.length > 0 ? (pt ? `${waiting.length} ${plural(waiting.length, 'pendência', 'pendências', locale)} para você` : `${waiting.length} ${plural(waiting.length, 'item')} need you`) : copy('Nothing waiting', 'Nenhuma pendência')}</span>
            {hydrated && <span>{copy('Updated', 'Atualizado em')} <ViewerTime value={report.generatedAt} style="datetime" /></span>}
          </span>
        ) : copy('Unavailable', 'Indisponível')
      }
      actions={
        <>
          <Pill variant="plain" onClick={loadDashboardData} disabled={loading} aria-label={copy('Refresh', 'Atualizar')} className="h-10 sm:h-8">
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            {copy('Refresh', 'Atualizar')}
          </Pill>
          <Pill asChild variant="primary" className="h-10 sm:h-8">
            <Link href={`${platform}/analytics`}>
              {copy('Analytics', 'Indicadores')}
              <ArrowRight />
            </Link>
          </Pill>
        </>
      }
    />
  )

  if (!report || !metrics) {
    return (
      <PageContainer title={copy('Overview', 'Visão geral')} header={header} breadcrumbs={breadcrumbs}>
        <div className="px-4 pb-24 md:px-6">
          <Notice tone="bad">
            <p className="font-medium">{copy('Unable to load the overview', 'Não foi possível carregar a visão geral')}</p>
            {error && <p className="mt-0.5 text-muted-foreground">{error}</p>}
          </Notice>
        </div>
      </PageContainer>
    )
  }

  const revenueChart = metrics.deliveredByMonth.map(item => ({ ...item, label: monthLabel(item.month, locale), revenue: item.revenueCents / 100 }))
  const latestMonth = revenueChart[revenueChart.length - 1]?.month
  const compactCurrency = new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, notation: 'compact', maximumFractionDigits: 0 })
  const knownStages = new Set(leadStages.map(stage => stage.value))
  const pipeline = [
    ...leadStages.map(stage => ({ ...stage, displayLabel: pt ? stage.labelPt : stage.label, count: metrics.salesFunnel.find(item => item.label === stage.value)?.count ?? 0 })),
    ...metrics.salesFunnel.filter(item => !knownStages.has(item.label)).map(item => ({ value: item.label, label: item.label, labelPt: item.label, displayLabel: item.label, count: item.count })),
  ]
  const pc = metrics.periodComparison

  return (
      <PageContainer title={copy('Overview', 'Visão geral')} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {error && <Notice tone="bad">{error}</Notice>}

        <DeskSection id="overview-needs-you" title={copy('Needs you today', 'Pendências de hoje')} count={waiting.length}>
          {waiting.length > 0 ? (
            <ul className="divide-y rounded-md border bg-card">
              {waiting.map(item => <QueueRow key={item.key} item={item} />)}
            </ul>
          ) : (
            <p className="py-3 text-[13px] text-muted-foreground">{copy('Nothing waiting', 'Nenhuma pendência')}</p>
          )}
          {waiting.length > 0 && clear.length > 0 && (
            <p className="mt-2 text-[12px] text-muted-foreground">{clear.length} {copy('other queues clear', 'outras filas sem pendências')}</p>
          )}
        </DeskSection>

        <DeskSection
          id="overview-recent-deals"
          title={copy('Latest deals', 'Vendas recentes')}
          count={metrics.recentDeals.length}
          actions={
            <Link href={`${platform}/deals`} className="inline-flex min-h-10 items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground sm:min-h-0">
              {copy('Desk log', 'Ver todas as vendas')}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          }
        >
          {metrics.recentDeals.length > 0 ? (
            <DeskTable>
              <thead>
                <tr>
                  <Th>{copy('Status', 'Status')}</Th>
                  <Th>{copy('Vehicle', 'Veículo')}</Th>
                  <Th priority={2}>{copy('Customer', 'Cliente')}</Th>
                  <Th align="right">{copy('Price', 'Preço')}</Th>
                  <Th align="right" priority={3}>{copy('Gross', 'Margem bruta')}</Th>
                  <Th align="right" priority={2}>{copy('Age', 'Tempo')}</Th>
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
                        <Status tone={dealTone[deal.status] ?? 'idle'}>{pt ? dealLabelPt[deal.status] ?? deal.status : dealLabel[deal.status] ?? deal.status}</Status>
                      </Td>
                      <Td className="min-w-0 max-w-[16rem]">
                        <Link href={href} onClick={event => event.stopPropagation()} className="block truncate font-medium text-foreground hover:underline">
                          {deal.vehicle ? `${deal.vehicle.year} ${deal.vehicle.make} ${deal.vehicle.model}` : copy('No vehicle', 'Sem veículo')}
                        </Link>
                        <span className="block truncate text-[12px] text-muted-foreground md:hidden">
                          {deal.lead ? `${deal.lead.firstName} ${deal.lead.lastName}` : copy('No customer', 'Sem cliente')}
                        </span>
                      </Td>
                      <Td priority={2} className="max-w-[12rem] truncate">
                        {deal.lead ? `${deal.lead.firstName} ${deal.lead.lastName}` : <span className="text-muted-foreground">{copy('No customer', 'Sem cliente')}</span>}
                      </Td>
                      <Td align="right" className="whitespace-nowrap">
                        <Figure size="sm">{formatCurrencyCents(deal.vehiclePriceCents)}</Figure>
                      </Td>
                      <Td align="right" priority={3} className="whitespace-nowrap text-muted-foreground">{formatCurrencyCents(deal.grossCents)}</Td>
                      <Td align="right" priority={2} className="whitespace-nowrap text-[12px] text-muted-foreground">
                        {stale ? (
                          <Attention>{days} {pt ? plural(days, 'dia', 'dias', locale) : plural(days, 'day')}</Attention>
                        ) : pending ? (
                          <span className="tabular-nums">{days === 0 ? copy('Today', 'Hoje') : `${days} ${pt ? plural(days, 'dia', 'dias', locale) : plural(days, 'day')}`}</span>
                        ) : hydrated ? (
                          formatDate(deal.occurredAt, locale)
                        ) : null}
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DeskTable>
          ) : (
            <p className="py-3 text-[13px] text-muted-foreground">{copy('No deals yet', 'Nenhuma venda registrada')}</p>
          )}
        </DeskSection>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr]">
          <DeskSection id="overview-revenue" title={copy('Delivered revenue by month', 'Faturamento de vendas por mês')}>
            {revenueChart.length > 0 ? (
              <HairlineChart
                data={revenueChart}
                xKey="label"
                yKey="revenue"
                label={copy('Delivered revenue', 'Faturamento de vendas')}
                yWidth={52}
                format={value => compactCurrency.format(value)}
                highlight={row => row.month === latestMonth}
              />
            ) : (
              <p className="py-3 text-[13px] text-muted-foreground">{copy('No deliveries', 'Nenhuma entrega registrada')}</p>
            )}
          </DeskSection>

          <DeskSection
            id="overview-pipeline"
            title={copy('Lead pipeline', 'Funil de leads')}
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
                    <Th>{copy('Stage', 'Etapa')}</Th>
                    <Th align="right">Leads</Th>
                    <Th align="right" priority={2}>{copy('Share', 'Participação')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {pipeline.map(stage => (
                    <Tr key={stage.value}>
                      <Td className={stage.count === 0 ? 'text-muted-foreground' : 'text-foreground'}>{stage.displayLabel}</Td>
                      <Td align="right" className="w-[1%] whitespace-nowrap">
                        <Figure size="sm" className={stage.count === 0 ? 'text-muted-foreground' : undefined}>{stage.count}</Figure>
                      </Td>
                      <Td align="right" priority={2} className="w-[1%] whitespace-nowrap">
                        <span className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
                          <Meter value={stage.count / metrics.totalLeads} label={`${stage.displayLabel} ${copy('share of leads', 'do total de leads')}`} />
                          <span className="w-9 text-right tabular-nums">{Math.round((stage.count / metrics.totalLeads) * 100)}%</span>
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </DeskTable>
            ) : (
              <p className="py-3 text-[13px] text-muted-foreground">{copy('No leads', 'Nenhum lead cadastrado')}</p>
            )}
          </DeskSection>
        </div>

        <DeskSection id="overview-salespeople" title={copy('Salespeople by gross', 'Vendedores por margem bruta')} count={metrics.topSalespeople.length}>
          {metrics.topSalespeople.length > 0 ? (
            <DeskTable>
              <thead>
                <tr>
                  <Th>{copy('Salesperson', 'Vendedor')}</Th>
                  <Th align="right">{copy('Delivered', 'Entregas')}</Th>
                  <Th align="right">{copy('Gross', 'Margem bruta')}</Th>
                  <Th align="right" priority={2}>{copy('Revenue', 'Faturamento')}</Th>
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
            <p className="py-3 text-[13px] text-muted-foreground">{copy('No delivered deals', 'Nenhuma venda entregue')}</p>
          )}
        </DeskSection>
        <DeskSection id="overview-30d" title={copy('Last 30 days', 'Últimos 30 dias')}>
          <ReadoutStrip>
            <Readout label={copy('Units delivered', 'Veículos entregues')} value={pc.deliveredCount.current} sub={comparisonLabel(pc.deliveredCount, locale)} tone={comparisonTone(pc.deliveredCount)} />
            <Readout label={copy('Gross', 'Margem bruta')} value={formatCurrencyCents(pc.deliveredGrossCents.current)} sub={metrics.deliveredDeals ? `${copy('Avg', 'Média')} ${formatCurrencyCents(metrics.averageDeliveredGrossCents)} ${copy('all time', 'no período total')}` : comparisonLabel(pc.deliveredGrossCents, locale)} tone={comparisonTone(pc.deliveredGrossCents)} />
            <Readout label={copy('Delivered revenue', 'Faturamento de vendas')} value={formatCurrencyCents(pc.deliveredRevenueCents.current)} sub={comparisonLabel(pc.deliveredRevenueCents, locale)} tone={comparisonTone(pc.deliveredRevenueCents)} />
            <Readout label={copy('New leads', 'Novos leads')} value={pc.newLeads.current} sub={comparisonLabel(pc.newLeads, locale)} tone={comparisonTone(pc.newLeads)} />
            <Readout label={copy('Lead conversion', 'Conversão de leads')} value={`${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(metrics.leadConversionPercent)}%`} sub={metrics.convertedLeads != null ? (pt ? `${metrics.convertedLeads} de ${countLabel(metrics.totalLeads, 'lead', 'leads')}` : `${metrics.convertedLeads} of ${countLabel(metrics.totalLeads, 'lead')}`) : countLabel(metrics.totalLeads, pt ? 'lead' : 'lead', pt ? 'leads' : 'leads')} />
            <Readout label={copy('Service revenue', 'Faturamento da oficina')} value={formatCurrencyCents(pc.settledServiceRevenueCents.current)} sub={comparisonLabel(pc.settledServiceRevenueCents, locale)} tone={comparisonTone(pc.settledServiceRevenueCents)} />
          </ReadoutStrip>
        </DeskSection>


        <DeskSection id="overview-stock-service" title={copy('Stock and shop', 'Estoque e oficina')}>
          <ReadoutStrip>
            <Readout label={copy('Units in stock', 'Veículos em estoque')} value={metrics.inventory.available} sub={metrics.inventory.available ? `${copy('Avg age', 'Tempo médio')} ${countLabel(averageAge, pt ? 'dia' : 'day', pt ? 'dias' : 'days')}` : undefined} />
            <Readout label={copy('Retail', 'Valor de venda')} value={formatCurrencyCents(metrics.inventory.retailCents)} />
            <Readout label={copy('Cost', 'Custo')} value={formatCurrencyCents(metrics.inventory.costCents)} sub={`${copy('Spread', 'Diferença')} ${formatCurrencyCents(metrics.inventory.retailCents - metrics.inventory.costCents)}`} />
            <Readout label={copy('Sold hours', 'Horas vendidas')} value={new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(metrics.service.soldHours)} sub={`${copy('Actual', 'Realizadas')} ${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(metrics.service.actualHours)} · ${copy('ELR', 'Taxa efetiva por hora')} ${formatCurrencyCents(metrics.service.effectiveLaborRateCents)}`} />
            <Readout label={copy('Open exceptions', 'Pendências em aberto')} value={exceptions} sub={`${copy('Acct', 'Contab.')} ${report.exceptions.accounting} · ${copy('Pay', 'Pag.')} ${report.exceptions.payments} · ${copy('Fund', 'Créd.')} ${report.exceptions.funding}`} />
          </ReadoutStrip>
        </DeskSection>
      </div>
    </PageContainer>
  )
}
