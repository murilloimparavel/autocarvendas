'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, RefreshCw, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import {
  Attention,
  Code,
  DeskHeader,
  DeskSection,
  DeskTable,
  Figure,
  Notice,
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
import { getDealDeskWorkspace, type DealDeskDeal } from '../actions'
import { DEAL_STATUSES, labelForDeal, toneForDeal } from '../lib/dealStatus'
import { formatUsd } from '../lib/formatMoney'
import { useLocale } from '@/features/i18n/LocaleProvider'

interface Deal {
  id: string
  vehiclePrice: number
  status: string
  saleDate: string | null
  createdAt: string
  totalPrice: number
  salesperson: { id: string; name: string } | null
  lead: { id: string; firstName: string; lastName: string } | null
  vehicle: { id: string; year: number; make: string; model: string; stockNumber: string } | null
}

type StatusCounts = Partial<Record<string, number>>

/** Deals the desk has to work: still being penciled or submitted for a decision. */
const DESK_STATUSES = new Set(['pencil', 'submitted'])
/** A desk deal open this many days or longer is marked stale. */
const DESK_STALE_DAYS = 2
const DAY_MS = 24 * 60 * 60 * 1000

function toListDeals(deals: DealDeskDeal[]): Deal[] {
  return deals.map(deal => ({
    ...deal,
    vehiclePrice: (deal.vehiclePriceCents ?? 0) / 100,
    totalPrice: (deal.totalPriceCents ?? 0) / 100,
  }))
}

function countByStatus(deals: Array<{ status: string }>): StatusCounts {
  const counts: StatusCounts = { all: deals.length }
  for (const status of DEAL_STATUSES) counts[status] = 0
  for (const deal of deals) counts[deal.status] = (counts[deal.status] ?? 0) + 1
  return counts
}

// The dealership's zone, not the browser's, so the server and client render the same day.
const formatDate = (date: string | null, timeZone: string, locale: 'pt-BR' | 'en-US') => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric', timeZone })
}

function ageDays(createdAt: string, now: number) {
  const created = new Date(createdAt).getTime()
  if (!Number.isFinite(created)) return 0
  return Math.max(0, Math.floor((now - created) / DAY_MS))
}

function formatAge(days: number) {
  if (days === 0) return 'Today'
  return days === 1 ? '1 day' : `${days} days`
}

const vehicleLabel = (deal: Deal) => (deal.vehicle ? `${deal.vehicle.year} ${deal.vehicle.make} ${deal.vehicle.model}` : 'No vehicle')
const customerLabel = (deal: Deal) => (deal.lead ? `${deal.lead.firstName} ${deal.lead.lastName}` : 'No customer')

export function DealListPageClient({
  initialDeals,
  initialError,
  timeZone,
  currencyCode,
}: {
  initialDeals: DealDeskDeal[] | null
  initialError: string | null
  timeZone: string
  currencyCode: string
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const formatCurrency = (value: number | null | undefined) => formatUsd(value, { whole: true, currencyCode, locale })
  const router = useRouter()
  const [deals, setDeals] = useState<Deal[]>(initialDeals ? toListDeals(initialDeals) : [])
  // The desk queue always reads from the unfiltered board so status tabs never empty it.
  const [boardDeals, setBoardDeals] = useState<Deal[]>(initialDeals ? toListDeals(initialDeals) : [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortOrder, setSortOrder] = useState<string>('recent')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusCounts, setStatusCounts] = useState<StatusCounts>(() => (initialDeals ? countByStatus(initialDeals) : {}))
  const [now] = useState(() => Date.now())
  const requestRef = useRef(0)

  const loadDeals = useCallback(async (status: string) => {
    const request = ++requestRef.current
    setLoading(true)
    setError(null)
    const response = await getDealDeskWorkspace(status)
    if (request !== requestRef.current) return
    if (response.success && response.data) {
      const loaded = response.data.dealDeskWorkspace.deals || []
      setDeals(toListDeals(loaded))
      if (status === 'all') setBoardDeals(toListDeals(loaded))
      setStatusCounts(current => (status === 'all' ? countByStatus(loaded) : { ...current, [status]: loaded.length }))
    } else {
      setError(response.error || (pt ? 'Não foi possível carregar as vendas.' : 'Unable to load deals.'))
    }
    setLoading(false)
  }, [])

  const changeStatus = (status: string) => {
    setStatusFilter(status)
    void loadDeals(status)
  }

  const resetFilters = () => {
    setSearchQuery('')
    setSortOrder('recent')
    if (statusFilter !== 'all') changeStatus('all')
  }

  const deskQueue = useMemo(
    () =>
      boardDeals
        .filter(deal => DESK_STATUSES.has(deal.status))
        .map(deal => ({ deal, days: ageDays(deal.createdAt, now) }))
        .sort((a, b) => new Date(a.deal.createdAt).getTime() - new Date(b.deal.createdAt).getTime()),
    [boardDeals, now],
  )
  const staleCount = deskQueue.filter(item => item.days >= DESK_STALE_DAYS).length

  const filteredDeals = deals
    .filter(deal => {
      if (!searchQuery) return true
      const search = searchQuery.toLowerCase()
      const vehicleStr = deal.vehicle ? `${deal.vehicle.year} ${deal.vehicle.make} ${deal.vehicle.model}`.toLowerCase() : ''
      const customerStr = deal.lead ? `${deal.lead.firstName} ${deal.lead.lastName}`.toLowerCase() : ''
      return vehicleStr.includes(search) || customerStr.includes(search) || deal.vehicle?.stockNumber.toLowerCase().includes(search)
    })
    .sort((a, b) => {
      if (sortOrder === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      if (sortOrder === 'value-desc') return b.totalPrice - a.totalPrice
      if (sortOrder === 'value-asc') return a.totalPrice - b.totalPrice
      return new Date(b.saleDate || b.createdAt).getTime() - new Date(a.saleDate || a.createdAt).getTime()
    })

  const totalRevenue = boardDeals
    .filter(d => d.status === 'delivered' && Boolean(d.saleDate))
    .reduce((sum, d) => sum + (d.vehiclePrice || 0), 0)
  const deliveredCount = boardDeals.filter(d => d.status === 'delivered').length
  const isFiltered = Boolean(searchQuery) || statusFilter !== 'all'
  const dealHref = (deal: Deal) => `${basePath}/platform/deals/${deal.id}`

  const breadcrumbs = [
    { type: 'link' as const, label: pt ? 'Painel' : 'Dashboard', href: basePath },
    { type: 'page' as const, label: pt ? 'Plataforma' : 'Platform' },
    { type: 'page' as const, label: pt ? 'Vendas' : 'Deals' },
  ]

  const metaParts = [
    deskQueue.length ? (pt ? `${deskQueue.length} aguardando atendimento` : `${deskQueue.length} on the desk`) : (pt ? 'Nenhuma venda pendente' : 'Desk clear'),
    staleCount ? (pt ? `${staleCount} sem atualização` : `${staleCount} stale`) : null,
    `${statusCounts.all ?? boardDeals.length} ${pt ? ((statusCounts.all ?? boardDeals.length) === 1 ? 'venda' : 'vendas') : ((statusCounts.all ?? boardDeals.length) === 1 ? 'deal' : 'deals')}`,
  ].filter(Boolean)

  const header = (
    <DeskHeader
      title={pt ? 'Vendas' : 'Deals'}
      meta={metaParts.join(' · ')}
      actions={
        <>
          <Pill variant="plain" onClick={() => loadDeals(statusFilter)} disabled={loading} aria-label={pt ? 'Atualizar vendas' : 'Refresh deals'}>
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            {pt ? 'Atualizar' : 'Refresh'}
          </Pill>
          <Pill asChild variant="primary">
            <Link href={`${basePath}/platform/deals/create`}>
              <Plus />
              {pt ? 'Nova venda' : 'New deal'}
            </Link>
          </Pill>
        </>
      }
    />
  )

  const boardOptions = [
    { value: 'all', label: pt ? 'Todas' : 'All', count: statusCounts.all },
    ...DEAL_STATUSES.map(status => ({ value: status, label: pt ? ({ pencil: 'Rascunho', submitted: 'Enviada para aprovação', approved: 'Aprovada', financed: 'Financiada', delivered: 'Entregue', cancelled: 'Cancelada' } as Record<string, string>)[status] || status : labelForDeal(status), tone: toneForDeal(status), count: statusCounts[status] })),
  ]

  return (
    <PageContainer title={pt ? 'Vendas' : 'Deals'} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        <DeskSection
          id="deal-desk-queue"
          title={pt ? 'Aguardando atendimento' : 'On the desk'}
          count={deskQueue.length}
          actions={staleCount ? <Attention>{staleCount} waiting {DESK_STALE_DAYS}+ days</Attention> : undefined}
        >
          {deskQueue.length === 0 ? (
            <p className="py-4 text-[13px] text-muted-foreground">
              {error ? 'Desk queue unavailable until deals load.' : 'No deals waiting on pencil or a decision.'}
            </p>
          ) : (
            <ul className="divide-y rounded-md border bg-card">
              {deskQueue.map(({ deal, days }) => {
                const stale = days >= DESK_STALE_DAYS
                return (
                  <li key={deal.id}>
                    <Link
                      href={dealHref(deal)}
                      className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-4 py-2.5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:grid-cols-[6.5rem_minmax(0,1fr)_auto_5.5rem]"
                    >
                      <span className="max-sm:hidden">
                        <Status tone={toneForDeal(deal.status)}>{labelForDeal(deal.status)}</Status>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium text-foreground">{vehicleLabel(deal)}</span>
                        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[12px] text-muted-foreground">
                          <span className="sm:hidden">
                            <Status tone={toneForDeal(deal.status)} className="text-[12px]">{labelForDeal(deal.status)}</Status>
                          </span>
                          {deal.vehicle && <Code>#{deal.vehicle.stockNumber}</Code>}
                          <span className="truncate">{customerLabel(deal)} · {deal.salesperson?.name || 'Unassigned'}</span>
                        </span>
                      </span>
                      <span className="text-right max-sm:col-start-2 max-sm:row-start-1">
                        <Figure size="sm">{formatCurrency(deal.totalPrice)}</Figure>
                      </span>
                      <span className="text-right text-[12px] text-muted-foreground max-sm:col-start-2 max-sm:row-start-2">
                        {stale ? <Attention>{formatAge(days)}</Attention> : <span className="tabular-nums">{formatAge(days)}</span>}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </DeskSection>

        <DeskSection
          id="deal-board"
          title={pt ? 'Todas as vendas' : 'All deals'}
          count={filteredDeals.length}
          actions={loading ? <span role="status" className="text-xs text-muted-foreground">{pt ? 'Carregando vendas' : 'Loading deals'}</span> : undefined}
        >
          <div className="space-y-3">
            <Segmented label={pt ? 'Filtrar por status' : 'Filter by status'} value={statusFilter} onChange={changeStatus} options={boardOptions} size="sm" className="w-full" />
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1 sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={pt ? 'Veículo, cliente ou código do estoque' : 'Vehicle, customer or stock #'}
                  aria-label={pt ? 'Buscar vendas' : 'Search deals'}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="h-10 rounded-[4px] pl-9 text-[13px] shadow-none"
                />
              </div>
              <Select value={sortOrder} onValueChange={setSortOrder}>
                <SelectTrigger className="h-10 w-full rounded-[4px] text-[13px] sm:w-[180px]" aria-label={pt ? 'Ordenar vendas' : 'Sort deals'}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">{pt ? 'Atividade mais recente' : 'Recently active'}</SelectItem>
                  <SelectItem value="oldest">{pt ? 'Mais antigas primeiro' : 'Oldest first'}</SelectItem>
                  <SelectItem value="value-desc">{pt ? 'Maior valor primeiro' : 'Value high to low'}</SelectItem>
                  <SelectItem value="value-asc">{pt ? 'Menor valor primeiro' : 'Value low to high'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error ? (
              <Notice tone="bad">
                <p className="font-medium">{pt ? 'Não foi possível carregar as vendas' : 'Unable to load deals'}</p>
                <p className="mt-0.5 text-muted-foreground">{error}</p>
                <Track className="mt-2">
                  <Pill size="sm" onClick={() => loadDeals(statusFilter)}>{pt ? 'Tentar novamente' : 'Retry'}</Pill>
                </Track>
              </Notice>
            ) : loading && filteredDeals.length === 0 ? (
              <p role="status" className="py-10 text-center text-sm text-muted-foreground">{pt ? 'Carregando vendas' : 'Loading deals'}</p>
            ) : filteredDeals.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
                <p>{pt ? (isFiltered ? 'Nenhuma venda encontrada com esses filtros' : 'Nenhuma venda cadastrada') : (isFiltered ? 'No matching deals' : 'No deals')}</p>
                {isFiltered && (
                  <Track>
                    <Pill size="sm" onClick={resetFilters}>{pt ? 'Limpar filtros' : 'Reset filters'}</Pill>
                  </Track>
                )}
              </div>
            ) : (
              <div className={loading ? 'opacity-60' : undefined} aria-busy={loading}>
                <DeskTable>
                  <thead>
                    <tr>
                      <Th>{pt ? 'Situação' : 'Status'}</Th>
                      <Th>{pt ? 'Veículo' : 'Vehicle'}</Th>
                      <Th priority={2}>{pt ? 'Cód. estoque' : 'Stock #'}</Th>
                      <Th priority={2}>{pt ? 'Cliente' : 'Customer'}</Th>
                      <Th priority={3}>{pt ? 'Vendedor' : 'Salesperson'}</Th>
                      <Th align="right">{pt ? 'Valor total' : 'Total'}</Th>
                      <Th align="right" priority={3}>{pt ? 'Preço' : 'Price'}</Th>
                      <Th align="right" priority={2}>{pt ? 'Data' : 'Date'}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDeals.map(deal => (
                      <Tr key={deal.id} className="cursor-pointer" onClick={() => router.push(dealHref(deal))}>
                        <Td className="w-[1%]">
                          <Status tone={toneForDeal(deal.status)}>{pt ? ({ pencil: 'Rascunho', submitted: 'Enviada para aprovação', approved: 'Aprovada', financed: 'Financiada', delivered: 'Entregue', cancelled: 'Cancelada' } as Record<string, string>)[deal.status] || deal.status : labelForDeal(deal.status)}</Status>
                        </Td>
                        <Td className="min-w-0 max-w-[16rem]">
                          <Link
                            href={dealHref(deal)}
                            onClick={event => event.stopPropagation()}
                            className="block truncate font-medium text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
                          >
                            {vehicleLabel(deal)}
                          </Link>
                          <span className="block truncate text-[12px] text-muted-foreground md:hidden">{customerLabel(deal)}</span>
                        </Td>
                        <Td priority={2} className="whitespace-nowrap">{deal.vehicle ? <Code>#{deal.vehicle.stockNumber}</Code> : <span className="text-muted-foreground">-</span>}</Td>
                        <Td priority={2} className="max-w-[12rem] truncate">{customerLabel(deal)}</Td>
                        <Td priority={3} className="max-w-[10rem] truncate text-muted-foreground">{deal.salesperson?.name || (pt ? 'Sem responsável' : 'Unassigned')}</Td>
                        <Td align="right" className="whitespace-nowrap">
                          <Figure size="sm">{formatCurrency(deal.totalPrice)}</Figure>
                        </Td>
                        <Td align="right" priority={3} className="whitespace-nowrap text-muted-foreground">{formatCurrency(deal.vehiclePrice)}</Td>
                        <Td align="right" priority={2} className="whitespace-nowrap text-muted-foreground">{formatDate(deal.saleDate || deal.createdAt, timeZone, locale)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </DeskTable>
              </div>
            )}
          </div>
        </DeskSection>

        {boardDeals.length > 0 && (
          <ReadoutStrip>
            <Readout label={pt ? 'Aguardando atendimento' : 'On the desk'} value={deskQueue.length} />
            <Readout label={pt ? 'Entregues' : 'Delivered'} value={deliveredCount} />
            <Readout label={pt ? 'Faturamento das vendas concluídas' : 'Delivered revenue'} value={formatCurrency(totalRevenue)} />
          </ReadoutStrip>
        )}
      </div>
    </PageContainer>
  )
}
