'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { basePath } from '@/features/dashboard/lib/config'
import {
  Attention,
  Code,
  DeskHeader,
  DeskSection,
  DeskTable,
  Figure,
  Meter,
  Notice,
  Pill,
  Readout,
  ReadoutStrip,
  Segmented,
  Status,
  Td,
  Th,
  Tr,
  type DeskTone,
} from '@/features/platform/components/desk'
import { getAnalyticsData, type AnalyticsData } from '../actions'
import { monthLabel } from '../lib/monthLabel'
import { HairlineChart } from '../components/HairlineChart'

type Area = 'sales' | 'inventory' | 'service'
type Period = '6' | '12' | 'all'

/** Same threshold the inventory list uses for an aging unit. */
const AGED_UNIT_DAYS = 60
const ANALYTICS_PT: Record<string, string> = {
  available: 'Disponível', pending: 'Pendente', hold: 'Reservado', service: 'Em serviço', sold: 'Vendido',
  new: 'Novo', used: 'Usado', certified: 'Seminovo certificado',
  scheduled: 'Agendada', 'checked-in': 'Recepcionada', 'checked in': 'Recepcionada', 'in-progress': 'Em andamento', 'in progress': 'Em andamento', 'waiting-parts': 'Aguardando peças', 'waiting parts': 'Aguardando peças',
  completed: 'Concluída', cancelled: 'Cancelada', estimate: 'Orçamento', approved: 'Aprovada', invoiced: 'Faturada', paid: 'Paga',
  maintenance: 'Manutenção', repair: 'Reparo', warranty: 'Garantia', recall: 'Recall', inspection: 'Inspeção', diagnostic: 'Diagnóstico', 'new vehicle': 'Novo', 'used vehicle': 'Usado',
}
const analyticsLabel = (locale: 'pt-BR' | 'en-US', value: string) => locale === 'pt-BR' ? ANALYTICS_PT[value.toLowerCase()] || value : value

const AREA_OPTIONS = [
  { value: 'sales', label: 'Sales' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'service', label: 'Service' },
] as const

const PERIOD_OPTIONS = [
  { value: '6', label: '6 months' },
  { value: '12', label: '12 months' },
  { value: 'all', label: 'All' },
] as const

const statusTone: Record<string, DeskTone> = {
  available: 'ok',
  pending: 'warn',
  hold: 'info',
  service: 'idle',
  sold: 'accent',
}

const humanize = (value: string) => value.replace(/[-_]/g, ' ').replace(/^./, letter => letter.toUpperCase())

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-3 text-[13px] text-muted-foreground">{children}</p>
}

function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-10 items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground sm:min-h-0">
      {children}
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  )
}

/** Label, count and share of the total, as a dense table. Replaces the old rounded bar rows. */
function ShareTable({
  rows,
  empty,
  labelHeading,
  countHeading = 'Count',
  extraHeading,
}: {
  rows: Array<{ key: string; label: ReactNode; value: number; extra?: ReactNode }>
  empty: string
  labelHeading: string
  countHeading?: string
  extraHeading?: string
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  if (!rows.length) return <Empty>{empty}</Empty>
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1
  return (
    <DeskTable>
      <thead>
        <tr>
          <Th>{labelHeading}</Th>
          <Th align="right">{countHeading}</Th>
          {extraHeading && <Th align="right" priority={2}>{extraHeading}</Th>}
          <Th align="right" priority={2}>{pt ? 'Participação' : 'Share'}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <Tr key={row.key}>
            <Td className="max-w-[14rem] truncate">{row.label}</Td>
            <Td align="right" className="w-[1%] whitespace-nowrap">
              <Figure size="sm">{row.value}</Figure>
            </Td>
            {extraHeading && <Td align="right" priority={2} className="w-[1%] whitespace-nowrap text-muted-foreground">{row.extra}</Td>}
            <Td align="right" priority={2} className="w-[1%] whitespace-nowrap">
              <span className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
                <Meter value={row.value / total} label={pt ? 'Participação no total' : 'Share of total'} />
                <span className="w-9 text-right tabular-nums">{Math.round((row.value / total) * 100)}%</span>
              </span>
            </Td>
          </Tr>
        ))}
      </tbody>
    </DeskTable>
  )
}

/** Month-to-date cell: the label, the windshield figure, and the prior month beside it. */
export function AnalyticsDashboardPageClient({ initialData, timeZone }: { initialData: AnalyticsData; timeZone: string }) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const [data, setData] = useState<AnalyticsData>(initialData)
  const [loading, setLoading] = useState(false)
  const [area, setArea] = useState<Area>('sales')
  const [period, setPeriod] = useState<Period>('12')

  const loadData = async () => {
    setLoading(true)
    setData(await getAnalyticsData())
    setLoading(false)
  }

  const { sales: salesMetrics, inventory: inventoryMetrics, service: serviceMetrics, operations, currencyCode, error } = data

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 }).format(value)
  }
  const compactCurrency = new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, notation: 'compact', maximumFractionDigits: 0 })
  const platform = `${basePath}/platform`

  const breadcrumbs = [
    { type: 'link' as const, label: pt ? 'Painel' : 'Dashboard', href: basePath },
    { type: 'page' as const, label: pt ? 'Plataforma' : 'Platform' },
    { type: 'page' as const, label: pt ? 'Indicadores' : 'Analytics' },
  ]

  const exceptions = operations?.exceptions?.total || 0
  const NO_DATA = '-'
  const opMetrics = operations?.metrics
  // Rates over an empty set have no value; the report returns 0 or 100 for those.
  const financePenetration = opMetrics?.deliveredDeals ? `${opMetrics.financeProductPenetrationPercent || 0}%` : NO_DATA
  const laborRate = opMetrics?.service?.soldHours ? formatCurrency((opMetrics.service.effectiveLaborRateCents || 0) / 100) : NO_DATA
  const partsFillRate = serviceMetrics?.partsCommittedQuantity && opMetrics?.parts?.fillRatePercent !== undefined ? `${opMetrics.parts.fillRatePercent}%` : NO_DATA

  // Month to date comes from the operational report's delivered-by-month buckets (calendar months, UTC, as the server groups them).
  const deliveredByMonth = opMetrics?.deliveredByMonth || []
  const currentKey = operations?.generatedAt ? operations.generatedAt.slice(0, 7) : null
  const previousKey = currentKey
    ? (() => {
        const [year, month] = currentKey.split('-').map(Number)
        return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`
      })()
    : null
  const mtd = deliveredByMonth.find(item => item.month === currentKey) || { month: currentKey || '', revenueCents: 0, grossCents: 0, count: 0 }
  const lastMonth = deliveredByMonth.find(item => item.month === previousKey) || null
  const lastMonthName = previousKey ? monthLabel(previousKey, locale) : locale === 'pt-BR' ? 'Mês anterior' : 'Last month'
  const grossChart = deliveredByMonth.map(item => ({ month: item.month, label: monthLabel(item.month, locale), gross: item.grossCents / 100 }))

  const agedUnits = (inventoryMetrics?.agingBreakdown || []).filter(bucket => bucket.range === '61-90' || bucket.range === '90+').reduce((sum, bucket) => sum + bucket.count, 0)
  const lowStock = opMetrics?.parts?.lowStockCount ?? serviceMetrics?.lowStockParts.length ?? 0
  const watch = [
    { key: 'aged', label: pt ? `Veículos há mais de ${AGED_UNIT_DAYS} dias no estoque` : `Units over ${AGED_UNIT_DAYS} days in stock`, count: agedUnits, status: pt ? 'Estoque antigo' : 'Aged', tone: 'warn' as DeskTone, href: `${platform}/vehicles`, place: pt ? 'Estoque' : 'Inventory' },
    { key: 'parts', label: pt ? 'Peças no limite mínimo ou abaixo' : 'Parts at or below minimum', count: lowStock, status: pt ? 'Estoque baixo' : 'Low stock', tone: 'warn' as DeskTone, href: `${platform}/parts`, place: pt ? 'Peças' : 'Parts' },
    { key: 'funding', label: pt ? 'Pendências de liberação de crédito' : 'Funding exceptions', count: operations?.exceptions?.funding || 0, status: pt ? 'Pendência' : 'Exception', tone: 'bad' as DeskTone, href: `${platform}/finance`, place: pt ? 'Financeiro' : 'Finance' },
    { key: 'payments', label: pt ? 'Pendências de pagamento' : 'Payment exceptions', count: operations?.exceptions?.payments || 0, status: pt ? 'Pendência' : 'Exception', tone: 'bad' as DeskTone, href: `${platform}/payments`, place: pt ? 'Pagamentos' : 'Payments' },
    { key: 'accounting', label: pt ? 'Pendências contábeis' : 'Accounting exceptions', count: operations?.exceptions?.accounting || 0, status: pt ? 'Pendência' : 'Exception', tone: 'bad' as DeskTone, href: `${platform}/accounting`, place: pt ? 'Contabilidade' : 'Accounting' },
  ].filter(item => item.count > 0)

  const header = (
    <DeskHeader
      title={pt ? 'Indicadores' : 'Analytics'}
      tone={error ? 'bad' : exceptions > 0 ? 'warn' : 'ok'}
      status={error ? 'Unavailable' : exceptions > 0 ? `${exceptions} open exceptions` : 'No open exceptions'}
      meta={
        error
          ? 'Unavailable'
          : operations?.generatedAt
            ? `${currentKey ? `${monthLabel(currentKey, locale)} ${locale === 'pt-BR' ? 'até agora' : 'to date'}` : locale === 'pt-BR' ? 'Mês até agora' : 'Month to date'} · ${locale === 'pt-BR' ? 'Atualizado' : 'Updated'} ${new Date(operations.generatedAt).toLocaleString(locale, { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
            : undefined
      }
      actions={
        <Pill variant="plain" className="h-10 sm:h-8" onClick={loadData} disabled={loading} aria-label={pt ? 'Atualizar' : 'Refresh'}>
          <RefreshCw className={loading ? 'animate-spin' : undefined} />
          {error ? (pt ? 'Tentar novamente' : 'Retry') : (pt ? 'Atualizar' : 'Refresh')}
        </Pill>
      }
    />
  )

  if (error) {
    return (
      <PageContainer title={pt ? 'Indicadores' : 'Analytics'} header={header} breadcrumbs={breadcrumbs}>
        <div className="px-4 pb-24 md:px-6">
          <Notice tone="bad">
            <p className="font-medium">{pt ? 'Não foi possível carregar os indicadores' : 'Unable to load analytics'}</p>
            <p className="mt-0.5 text-muted-foreground">{error}</p>
          </Notice>
        </div>
      </PageContainer>
    )
  }

  const allMonths = salesMetrics?.salesByMonth || []
  const months = (period === 'all' ? allMonths : allMonths.slice(-Number(period))).map(month => ({ ...month, label: monthLabel(month.month, locale) }))
  const periodGross = grossChart.filter(item => months.some(month => month.month === item.month))
  const periodUnits = months.reduce((sum, month) => sum + month.count, 0)
  const periodRevenue = months.reduce((sum, month) => sum + month.revenue, 0)
  const slowMoving = (inventoryMetrics?.slowMoving || []).filter(v => v.daysInStock > AGED_UNIT_DAYS)
  const isCurrent = (row: { month: string }) => row.month === currentKey

  return (
    <PageContainer title={pt ? 'Indicadores' : 'Analytics'} header={header} breadcrumbs={breadcrumbs}>
    <div className="min-w-0 max-w-full space-y-8 overflow-x-hidden px-4 pb-24 md:px-6 [&_.recharts-responsive-container]:max-w-full">

      <section aria-labelledby="analytics-mtd" className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2 border-b border-foreground/15 pb-2">
          <h2 id="analytics-mtd" className="text-[15px] font-semibold text-foreground">
            {currentKey ? `${monthLabel(currentKey, locale)} ${locale === 'pt-BR' ? 'até agora' : 'to date'}` : locale === 'pt-BR' ? 'Mês até agora' : 'Month to date'}
          </h2>
          <span className="text-[12px] text-muted-foreground">{pt ? 'Vendas concluídas por data da venda' : 'Delivered deals by sale date'}</span>
        </div>
        <ReadoutStrip className="mt-3">
          <Readout
            label={pt ? 'Veículos entregues' : 'Units delivered'}
            value={mtd.count}
            sub={lastMonth ? `${lastMonthName}: ${lastMonth.count}` : `${lastMonthName}: ${pt ? 'nenhum' : 'none'}`}
          />
          <Readout
            label={pt ? 'Margem bruta' : 'Gross'}
            value={formatCurrency(mtd.grossCents / 100)}
            sub={lastMonth ? `${lastMonthName}: ${formatCurrency(lastMonth.grossCents / 100)}` : `${lastMonthName}: ${pt ? 'nenhum' : 'none'}`}
          />
          <Readout
            label={pt ? 'Margem bruta por veículo' : 'Gross per unit'}
            value={mtd.count ? formatCurrency(mtd.grossCents / 100 / mtd.count) : NO_DATA}
            sub={lastMonth?.count ? `${lastMonthName}: ${formatCurrency(lastMonth.grossCents / 100 / lastMonth.count)}` : undefined}
          />
          <Readout
            label={pt ? 'Faturamento das vendas concluídas' : 'Delivered revenue'}
            value={formatCurrency(mtd.revenueCents / 100)}
            sub={lastMonth ? `${lastMonthName}: ${formatCurrency(lastMonth.revenueCents / 100)}` : undefined}
          />
        </ReadoutStrip>
      </section>

      {watch.length > 0 && (
        <DeskSection id="analytics-watch" title={pt ? 'Pontos de atenção' : 'Needs attention'} count={watch.length}>
          <ul className="divide-y rounded-md border bg-card">
            {watch.map(item => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-2.5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:grid-cols-[7.5rem_minmax(0,1fr)_4rem_7rem]"
                >
                  <span className="max-sm:hidden"><Status tone={item.tone}>{item.status}</Status></span>
                  <span className="min-w-0 truncate text-[14px] font-medium text-foreground">{item.label}</span>
                  <span className="text-right"><Figure size="md" attention>{item.count}</Figure></span>
                  <span className="inline-flex items-center justify-end gap-1 text-[12px] font-medium max-sm:hidden">
                    {item.place}
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </DeskSection>
      )}

      <ReadoutStrip>
        <Readout label={pt ? 'Adesão a produtos financeiros' : 'F&I penetration'} value={financePenetration} sub={financePenetration === NO_DATA ? (pt ? 'Nenhuma entrega' : 'No deliveries') : undefined} />
        <Readout label={pt ? 'Valor efetivo da hora de mão de obra' : 'Effective labor rate'} value={laborRate} sub={laborRate === NO_DATA ? (pt ? 'Nenhuma hora vendida' : 'No sold hours') : undefined} />
        <Readout label={pt ? 'Índice de atendimento de peças' : 'Parts fill rate'} value={partsFillRate} sub={partsFillRate === NO_DATA ? (pt ? 'Nenhuma peça reservada' : 'No committed parts') : undefined} />
        <Readout
          label={pt ? 'Pendências em aberto' : 'Open exceptions'}
          value={exceptions}
          sub={pt ? `${operations?.exceptions?.accounting || 0} contábeis · ${operations?.exceptions?.payments || 0} pagamentos · ${operations?.exceptions?.funding || 0} de crédito` : `${operations?.exceptions?.accounting || 0} accounting · ${operations?.exceptions?.payments || 0} payments · ${operations?.exceptions?.funding || 0} funding`}
        />
      </ReadoutStrip>

      <Segmented label={pt ? 'Área dos indicadores' : 'Analytics area'} value={area} onChange={setArea} options={AREA_OPTIONS.map(option => ({ ...option, label: analyticsLabel(locale, option.label.toLowerCase()) }))} />

      {area === 'sales' && (
        <div className="space-y-8">
          <DeskSection
            id="analytics-by-month"
            title={pt ? 'Por mês' : 'By month'}
            actions={<Segmented label={pt ? 'Período' : 'Period'} size="sm" value={period} onChange={setPeriod} options={PERIOD_OPTIONS.map(option => ({ ...option, label: option.value === 'all' && pt ? 'Todo o período' : option.value !== 'all' && pt ? `${option.value} meses` : option.label }))} />}
          >
            <div className="space-y-4">
              <p className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted-foreground">
                <span>{pt ? 'Veículos' : 'Units'} <Figure size="sm" className="ml-1 text-foreground">{periodUnits}</Figure></span>
                <span>{pt ? 'Faturamento' : 'Revenue'} <Figure size="sm" className="ml-1 text-foreground">{formatCurrency(periodRevenue)}</Figure></span>
                <span>{pt ? 'Vendas concluídas no total' : 'All-time delivered'} <Figure size="sm" className="ml-1 text-foreground">{salesMetrics?.totalSales || 0}</Figure></span>
                <span>{pt ? 'Margem média por venda' : 'Avg deal gross'} <Figure size="sm" className="ml-1 text-foreground">{salesMetrics?.totalSales ? formatCurrency(salesMetrics.avgDealProfit || 0) : NO_DATA}</Figure></span>
              </p>
              {months.length ? (
                <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-3">
                  <div className="min-w-0">
                    <p className="mb-1 text-[12px] font-medium text-muted-foreground">{pt ? 'Veículos entregues' : 'Units delivered'}</p>
                    <HairlineChart data={months} xKey="label" yKey="count" label={pt ? 'Veículos' : 'Units'} highlight={isCurrent} yWidth={28} />
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 text-[12px] font-medium text-muted-foreground">{pt ? 'Margem bruta' : 'Gross'}</p>
                    {periodGross.length ? (
                      <HairlineChart data={periodGross} xKey="label" yKey="gross" label={pt ? 'Margem bruta' : 'Gross'} highlight={isCurrent} yWidth={52} format={value => compactCurrency.format(value)} />
                    ) : (
                      <Empty>{pt ? 'Nenhuma margem registrada' : 'No gross recorded'}</Empty>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 text-[12px] font-medium text-muted-foreground">{pt ? 'Faturamento' : 'Revenue'}</p>
                    <HairlineChart data={months} xKey="label" yKey="revenue" label={pt ? 'Faturamento' : 'Revenue'} highlight={isCurrent} yWidth={52} format={value => compactCurrency.format(value)} />
                  </div>
                </div>
              ) : (
                <Empty>{pt ? 'Nenhuma entrega registrada' : 'No deliveries'}</Empty>
              )}
            </div>
          </DeskSection>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <DeskSection id="analytics-reps" title={pt ? 'Vendas por vendedor' : 'Sales reps'} count={salesMetrics?.salesByRep.length || 0}>
              {salesMetrics?.salesByRep.length ? (
                <DeskTable>
                  <thead>
                    <tr>
                      <Th>{pt ? 'Vendedor' : 'Rep'}</Th>
                      <Th align="right">{pt ? 'Veículos' : 'Units'}</Th>
                      <Th align="right">{pt ? 'Faturamento' : 'Revenue'}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesMetrics.salesByRep.slice(0, 10).map((rep, index) => (
                      <Tr key={`${rep.name}-${index}`}>
                        <Td className="max-w-[14rem] truncate font-medium">{rep.name}</Td>
                        <Td align="right"><Figure size="sm">{rep.count}</Figure></Td>
                        <Td align="right" className="whitespace-nowrap text-muted-foreground">{formatCurrency(rep.revenue)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </DeskTable>
              ) : (
                <Empty>{pt ? 'Nenhuma venda concluída' : 'No delivered deals'}</Empty>
              )}
            </DeskSection>

            <DeskSection id="analytics-makes" title={pt ? 'Vendas por marca' : 'Sales by make'} count={salesMetrics?.vehiclesSold.length || 0}>
              <ShareTable
                labelHeading={pt ? 'Marca' : 'Make'}
                countHeading={pt ? 'Veículos' : 'Units'}
                empty={pt ? 'Nenhuma venda concluída' : 'No delivered deals'}
                rows={(salesMetrics?.vehiclesSold || []).slice(0, 10).map(item => ({ key: item.make, label: item.make, value: item.count }))}
              />
            </DeskSection>
          </div>

          <DeskSection id="analytics-top-vehicles" title={pt ? 'Veículos mais vendidos' : 'Top selling vehicles'} count={salesMetrics?.topVehicles?.length || 0}>
            {salesMetrics?.topVehicles?.length ? (
              <DeskTable>
                <thead>
                  <tr>
                    <Th>{pt ? 'Veículo' : 'Vehicle'}</Th>
                    <Th align="right">{pt ? 'Vendido' : 'Sold'}</Th>
                    <Th align="right" priority={2}>{pt ? 'Faturamento' : 'Revenue'}</Th>
                  </tr>
                </thead>
                <tbody>
                  {salesMetrics.topVehicles.map(vehicle => (
                    <Tr key={`${vehicle.year}-${vehicle.make}-${vehicle.model}`}>
                      <Td className="max-w-[18rem] truncate font-medium">{vehicle.year} {vehicle.make} {vehicle.model}</Td>
                      <Td align="right"><Figure size="sm">{vehicle.count}</Figure></Td>
                      <Td align="right" priority={2} className="whitespace-nowrap text-muted-foreground">{formatCurrency(vehicle.revenue)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </DeskTable>
            ) : (
              <Empty>{pt ? 'Nenhuma venda registrada' : 'No sales'}</Empty>
            )}
          </DeskSection>
        </div>
      )}

      {area === 'inventory' && (
        <div className="space-y-8">
          <DeskSection
            id="analytics-slow"
            title={pt ? `Há mais de ${AGED_UNIT_DAYS} dias no estoque` : `Over ${AGED_UNIT_DAYS} days in stock`}
            count={slowMoving.length}
            actions={<SectionLink href={`${platform}/vehicles`}>{pt ? 'Estoque' : 'Inventory'}</SectionLink>}
          >
            {slowMoving.length ? (
              <DeskTable>
                <thead>
                  <tr>
                    <Th>{pt ? 'Status' : 'Status'}</Th>
                    <Th>{pt ? 'Veículo' : 'Vehicle'}</Th>
                    <Th priority={2}>{pt ? 'Cód. estoque' : 'Stock #'}</Th>
                    <Th align="right" priority={2}>{pt ? 'Preço' : 'Price'}</Th>
                    <Th align="right">{pt ? 'Dias' : 'Days'}</Th>
                  </tr>
                </thead>
                <tbody>
                  {slowMoving.map(vehicle => (
                    <Tr key={vehicle.id}>
                      <Td className="w-[1%]">
                        <Status tone={vehicle.daysInStock > 90 ? 'bad' : 'warn'}>{pt ? (vehicle.daysInStock > 90 ? 'Mais de 90 dias' : '61 a 90 dias') : (vehicle.daysInStock > 90 ? '90+ days' : '61-90 days')}</Status>
                      </Td>
                      <Td className="max-w-[16rem]">
                        <Link href={`${platform}/vehicles/${vehicle.id}`} className="block truncate font-medium text-foreground hover:underline">
                          {vehicle.year} {vehicle.make} {vehicle.model}
                        </Link>
                        <span className="md:hidden"><Code>#{vehicle.stockNumber}</Code></span>
                      </Td>
                      <Td priority={2} className="whitespace-nowrap"><Code>#{vehicle.stockNumber}</Code></Td>
                      <Td align="right" priority={2} className="whitespace-nowrap text-muted-foreground">{formatCurrency(vehicle.price)}</Td>
                      <Td align="right" className="whitespace-nowrap"><Figure size="sm" attention>{vehicle.daysInStock}</Figure></Td>
                    </Tr>
                  ))}
                </tbody>
              </DeskTable>
            ) : (
              <Empty>{pt ? `Nenhum veículo há mais de ${AGED_UNIT_DAYS} dias` : `No units over ${AGED_UNIT_DAYS} days`}</Empty>
            )}
          </DeskSection>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <DeskSection id="analytics-aging" title={pt ? 'Tempo no estoque dos veículos disponíveis' : 'Aging, available units'}>
              {inventoryMetrics?.agingBreakdown?.length ? (
                <HairlineChart
                  data={inventoryMetrics.agingBreakdown.map(bucket => ({ ...bucket, label: pt ? `${bucket.range} dias` : `${bucket.range} days` }))}
                  xKey="label"
                  yKey="count"
                  label={pt ? 'Veículos' : 'Units'}
                  yWidth={28}
                  highlight={bucket => bucket.range === '61-90' || bucket.range === '90+'}
                />
              ) : (
                <Empty>{pt ? 'Nenhum veículo' : 'No vehicles'}</Empty>
              )}
            </DeskSection>

            <DeskSection id="analytics-status" title={pt ? 'Por status' : 'By status'} count={inventoryMetrics?.totalVehicles || 0}>
              <ShareTable
                labelHeading="Status"
                countHeading={pt ? 'Veículos' : 'Units'}
                empty={pt ? 'Nenhum veículo' : 'No vehicles'}
                rows={(inventoryMetrics?.vehiclesByStatus || []).map(item => ({
                  key: item.status,
                  label: <Status tone={statusTone[item.status] || 'idle'}>{analyticsLabel(locale, humanize(item.status))}</Status>,
                  value: item.count,
                }))}
              />
            </DeskSection>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <DeskSection id="analytics-condition" title={pt ? 'Por condição' : 'By condition'}>
              <ShareTable
                labelHeading={pt ? 'Condição' : 'Condition'}
                countHeading={pt ? 'Veículos' : 'Units'}
                empty={pt ? 'Nenhum veículo' : 'No vehicles'}
                rows={(inventoryMetrics?.vehiclesByCondition || []).map(item => ({ key: item.condition, label: analyticsLabel(locale, humanize(item.condition)), value: item.count }))}
              />
            </DeskSection>

            <ReadoutStrip className="self-start">
              <Readout label={pt ? 'Total de veículos' : 'Total vehicles'} value={inventoryMetrics?.totalVehicles || 0} />
              <Readout label={pt ? 'Valor do estoque' : 'Inventory value'} value={formatCurrency(inventoryMetrics?.totalValue || 0)} />
              <Readout
                label={pt ? 'Média de dias no estoque' : 'Avg days in stock'}
                value={inventoryMetrics?.totalVehicles ? Math.round(inventoryMetrics.avgDaysInStock || 0) : NO_DATA}
                sub={inventoryMetrics?.avgDaysInStock && inventoryMetrics.avgDaysInStock > AGED_UNIT_DAYS ? <Attention>{pt ? 'Estoque antigo' : 'Aged'}</Attention> : undefined}
              />
              <Readout label={pt ? 'Disponíveis' : 'Available'} value={inventoryMetrics?.vehiclesByStatus.find(s => s.status === 'available')?.count || 0} />
            </ReadoutStrip>
          </div>
        </div>
      )}

      {area === 'service' && (
        <div className="space-y-8">
          <ReadoutStrip>
            <Readout label={pt ? 'Agendamentos de hoje' : "Today's appointments"} value={serviceMetrics?.todayAppointments || 0} />
            <Readout label={pt ? 'Ordens de serviço em andamento' : 'Active ROs'} value={serviceMetrics?.activeRepairOrders || 0} />
            <Readout label={pt ? 'Faturamento das ordens de serviço pagas' : 'Settled RO revenue'} value={formatCurrency(serviceMetrics?.serviceRevenue || 0)} />
            <Readout label={pt ? 'Valor médio por ordem paga' : 'Avg settled RO'} value={serviceMetrics?.settledRepairOrders ? formatCurrency(serviceMetrics.avgRepairOrder || 0) : NO_DATA} />
          </ReadoutStrip>

          <DeskSection
            id="analytics-low-stock"
            title={pt ? 'Peças com estoque baixo' : 'Low stock parts'}
            count={serviceMetrics?.lowStockParts?.length || 0}
            actions={<SectionLink href={`${platform}/parts`}>{pt ? 'Peças' : 'Parts'}</SectionLink>}
          >
            {serviceMetrics?.lowStockParts?.length ? (
              <DeskTable>
                <thead>
                  <tr>
                    <Th>{pt ? 'Cód. da peça' : 'Part #'}</Th>
                    <Th>{pt ? 'Descrição' : 'Description'}</Th>
                    <Th align="right">{pt ? 'Em estoque' : 'On hand'}</Th>
                    <Th align="right" priority={2}>{pt ? 'Mínimo' : 'Minimum'}</Th>
                  </tr>
                </thead>
                <tbody>
                  {serviceMetrics.lowStockParts.map(part => (
                    <Tr key={part.id}>
                      <Td className="whitespace-nowrap">
                        <Link href={`${platform}/parts/${part.id}`} className="hover:underline"><Code className="text-foreground">#{part.partNumber}</Code></Link>
                      </Td>
                      <Td className="max-w-[16rem] truncate">{part.description}</Td>
                      <Td align="right"><Figure size="sm" attention>{part.quantity}</Figure></Td>
                      <Td align="right" priority={2} className="text-muted-foreground">{part.minimumQuantity}</Td>
                    </Tr>
                  ))}
                </tbody>
              </DeskTable>
            ) : (
              <Empty>{pt ? 'Nenhuma peça com estoque baixo' : 'No low-stock parts'}</Empty>
            )}
          </DeskSection>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <DeskSection id="analytics-ro-status" title={pt ? 'Ordens de serviço por status' : 'Repair orders by status'}>
              <ShareTable
                labelHeading="Status"
                countHeading={pt ? 'Ordens' : 'ROs'}
                extraHeading={pt ? 'Total' : 'Total'}
                empty={pt ? 'Nenhuma ordem de serviço' : 'No repair orders'}
                rows={(serviceMetrics?.repairOrdersByStatus || []).map(item => ({ key: item.status, label: analyticsLabel(locale, humanize(item.status)), value: item.count, extra: formatCurrency(item.revenue) }))}
              />
            </DeskSection>

            <DeskSection id="analytics-appt-status" title={pt ? 'Agendamentos por status' : 'Appointments by status'}>
              <ShareTable
                labelHeading="Status"
                empty={pt ? 'Nenhum agendamento' : 'No appointments'}
                rows={(serviceMetrics?.appointmentsByStatus || []).map(item => ({ key: item.status, label: analyticsLabel(locale, humanize(item.status)), value: item.count }))}
              />
            </DeskSection>
          </div>

          <DeskSection id="analytics-mix" title={pt ? 'Serviços realizados' : 'Service mix'}>
            <ShareTable
              labelHeading={pt ? 'Tipo de serviço' : 'Service type'}
              countHeading={pt ? 'Agendamentos' : 'Appointments'}
              empty={pt ? 'Nenhum agendamento' : 'No appointments'}
              rows={(serviceMetrics?.serviceTypeBreakdown || []).map(item => ({ key: item.serviceType, label: analyticsLabel(locale, humanize(item.serviceType)), value: item.count }))}
            />
          </DeskSection>
        </div>
      )}
    </div>
    </PageContainer>
  )
}
