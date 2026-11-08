'use client'

import { useMemo, useState } from 'react'
import { useLocale } from '@/features/i18n/LocaleProvider'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, RefreshCw, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { Code, DeskHeader, DeskSection, DeskTable, Figure, Notice, Panel, Pill, Readout, ReadoutStrip, Segmented, Status, Td, Th, Tr, Track } from '@/features/platform/components/desk'

import { getPurchaseOrders } from '../actions'
import { PurchaseOrderFormDialog } from '../components/PurchaseOrderFormDialog'
import { PO_RECEIVABLE, PO_STATUS_LABEL, PO_STATUS_TONE, formatAge, formatCents as formatCentsBase, formatDateTime as formatDateTimeBase, partsLabel, poLines, poTotalCents, stockState, type Part, type PartsRooftop, type PurchaseOrder } from '../lib/types'

type StatusFilter = 'open' | 'draft' | 'ordered' | 'partially-received' | 'received' | 'cancelled' | 'all'
const OPEN_STATUSES = ['draft', 'ordered', 'partially-received']

export function PurchaseOrdersPageClient({
  initialOrders,
  initialParts,
  initialRooftops,
  initialError,
  timeZone,
  currencyCode,
}: {
  initialOrders: PurchaseOrder[]
  initialParts: Part[]
  initialRooftops: PartsRooftop[]
  initialError: string | null
  timeZone: string
  currencyCode: string
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const formatCents = (value: number | null | undefined) => formatCentsBase(value, currencyCode, locale)
  const formatDateTime = (value: string | null | undefined, zone: string) => formatDateTimeBase(value, zone, locale)
  const router = useRouter()
  const [orders, setOrders] = useState(initialOrders)
  const [parts, setParts] = useState(initialParts)
  const [rooftops, setRooftops] = useState(initialRooftops)
  const [error, setError] = useState(initialError)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<StatusFilter>('open')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState<{ partIds: string[] } | null>(null)
  // Clock for ages and lateness; advances on each refresh.
  const [now, setNow] = useState(() => Date.now())

  const load = async () => {
    setLoading(true)
    const response = await getPurchaseOrders()
    if (response.success) {
      setOrders(response.data.partsPurchaseOrders || [])
      setParts(response.data.partsInventories || [])
      setRooftops(response.data.rooftops || [])
      setError(null)
    } else {
      setError(response.error)
    }
    setNow(Date.now())
    setLoading(false)
  }

  const counts = useMemo(() => {
    const by = (status: string) => orders.filter(order => order.status === status).length
    return {
      open: orders.filter(order => OPEN_STATUSES.includes(order.status)).length,
      draft: by('draft'),
      ordered: by('ordered'),
      partial: by('partially-received'),
      received: by('received'),
      cancelled: by('cancelled'),
      all: orders.length,
    }
  }, [orders])
  const openValue = useMemo(() => orders.filter(order => ['ordered', 'partially-received'].includes(order.status)).reduce((sum, order) => sum + poLines(order).reduce((lineSum, line) => lineSum + Math.max(0, line.quantity - line.receivedQuantity) * line.unitCostCents, 0), 0), [orders])
  const reorderParts = useMemo(() => parts.filter(part => stockState(part) !== 'ok' && Number(part.onOrderQuantity || 0) === 0), [parts])
  const reorderRooftop = reorderParts[0]?.rooftop?.id
  const reorderIds = reorderParts.filter(part => part.rooftop?.id === reorderRooftop).map(part => part.id)

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return orders
      .filter(order => (filter === 'all' ? true : filter === 'open' ? OPEN_STATUSES.includes(order.status) : order.status === filter))
      .filter(order => !term || [order.reference, order.supplier, ...poLines(order).map(line => line.partNumber)].some(value => value.toLowerCase().includes(term)))
  }, [orders, filter, search])

  const breadcrumbs = [
    { type: 'link' as const, label: pt ? 'Painel' : 'Dashboard', href: basePath },
    { type: 'link' as const, label: pt ? 'Peças' : 'Parts', href: `${basePath}/platform/parts` },
    { type: 'page' as const, label: pt ? 'Pedidos de compra' : 'Purchase orders' },
  ]

  const poHref = (order: PurchaseOrder) => `${basePath}/platform/parts/purchase-orders/${order.id}`
  // Needs you: orders waiting at the counter, oldest order first.
  const toReceive = orders
    .filter(order => PO_RECEIVABLE.includes(order.status))
    .sort((a, b) => new Date(a.orderedAt || a.createdAt).getTime() - new Date(b.orderedAt || b.createdAt).getTime())

  const header = (
    <DeskHeader
      title={pt ? 'Pedidos de compra' : 'Purchase orders'}
      tone={error ? 'bad' : counts.partial ? 'warn' : counts.ordered ? 'info' : 'idle'}
      status={error ? (pt ? 'Indisponível' : 'Unavailable') : `${counts.open} ${pt ? 'em aberto' : 'open'}`}
      meta={pt ? `${toReceive.length} para receber · ${counts.draft} rascunhos · ${reorderParts.length} peças com estoque baixo sem pedido` : `${toReceive.length} to receive · ${counts.draft} draft · ${reorderParts.length} low-stock parts not on order`}
      actions={
        <>
          <Pill variant="plain" asChild className="h-11 sm:h-8">
            <Link href={`${basePath}/platform/parts`}><ArrowLeft />{pt ? 'Peças' : 'Parts'}</Link>
          </Pill>
          <Pill variant="plain" onClick={load} disabled={loading} className="h-11 sm:h-8">
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            {pt ? 'Atualizar' : 'Refresh'}
          </Pill>
          <Pill className="h-11 sm:h-8" onClick={() => setCreating({ partIds: reorderIds })} disabled={!reorderIds.length} title={reorderIds.length ? undefined : (pt ? 'Nenhuma peça com estoque baixo sem pedido' : 'No low-stock parts without an order')}>
            {pt ? 'Repor estoque baixo' : 'Reorder low stock'}
            <span className="text-xs tabular-nums text-muted-foreground">{reorderIds.length}</span>
          </Pill>
          <Pill variant="primary" className="h-11 sm:h-8" onClick={() => setCreating({ partIds: [] })} disabled={!parts.length} title={parts.length ? undefined : (pt ? 'Cadastre uma peça primeiro' : 'Create a part first')}>
            <Plus />
            {pt ? 'Novo pedido' : 'New PO'}
          </Pill>
        </>
      }
    />
  )

  return (
    <PageContainer title={pt ? 'Pedidos de compra' : 'Purchase orders'} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {!error && (
          <DeskSection title={pt ? 'Para receber' : 'To receive'} count={toReceive.length} id="po-to-receive">
            {toReceive.length === 0 ? (
              <p className="rounded-md border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">{pt ? 'Nenhum pedido de compra aguardando recebimento' : 'No purchase orders waiting to be received'}</p>
            ) : (
              <DeskTable aria-labelledby="po-to-receive">
                <thead>
                  <tr>
                    <Th>{pt ? 'Pedido' : 'PO'}</Th>
                    <Th priority={2}>{pt ? 'Fornecedor' : 'Supplier'}</Th>
                    <Th priority={2}>{pt ? 'Situação' : 'Status'}</Th>
                    <Th align="right">{pt ? 'Recebido' : 'Received'}</Th>
                    <Th align="right" priority={3}>{pt ? 'Saldo a custo' : 'Outstanding at cost'}</Th>
                    <Th align="right">{pt ? 'Tempo' : 'Age'}</Th>
                  </tr>
                </thead>
                <tbody>
                  {toReceive.map(order => {
                    const lines = poLines(order)
                    const ordered = lines.reduce((sum, line) => sum + line.quantity, 0)
                    const received = lines.reduce((sum, line) => sum + line.receivedQuantity, 0)
                    const outstanding = lines.reduce((sum, line) => sum + Math.max(0, line.quantity - line.receivedQuantity) * line.unitCostCents, 0)
                    return (
                      <Tr key={order.id} className="cursor-pointer" onClick={() => router.push(poHref(order))}>
                        <Td className="max-w-[14rem]">
                          <Link href={poHref(order)} onClick={event => event.stopPropagation()} className="hover:underline"><Code className="text-foreground">{order.reference}</Code></Link>
                          <p className="truncate text-xs text-muted-foreground md:hidden">{order.supplier}</p>
                        </Td>
                        <Td priority={2} className="max-w-[14rem] truncate">{order.supplier}</Td>
                        <Td priority={2}><Status tone={PO_STATUS_TONE[order.status] || 'idle'}>{partsLabel(locale, PO_STATUS_LABEL[order.status] || order.status)}</Status></Td>
                        <Td align="right" className="whitespace-nowrap">{received} of {ordered}</Td>
                        <Td align="right" priority={3} className="whitespace-nowrap">{formatCents(outstanding)}</Td>
                        <Td align="right" className="whitespace-nowrap">
                          <Figure size="sm">{formatAge(order.orderedAt || order.createdAt, now)}</Figure>
                          <span className="sr-only"> since ordered</span>
                        </Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </DeskTable>
            )}
          </DeskSection>
        )}

        <ReadoutStrip>
          <Readout label={pt ? 'Em aberto' : 'Open'} value={counts.open} />
          <Readout label={pt ? 'Enviados' : 'Ordered'} value={counts.ordered} tone={counts.ordered ? 'info' : undefined} />
          <Readout label={pt ? 'Recebidos parcialmente' : 'Partially received'} value={counts.partial} tone={counts.partial ? 'warn' : undefined} />
          <Readout label={pt ? 'Saldo a custo' : 'Outstanding at cost'} value={formatCents(openValue)} />
        </ReadoutStrip>

        <DeskSection title={pt ? 'Todos os pedidos de compra' : 'All purchase orders'} count={visible.length} id="po-all">
          <div className="space-y-3">
            <Segmented<StatusFilter>
              label={pt ? 'Filtrar pedidos de compra' : 'Filter purchase orders'}
              value={filter}
              onChange={setFilter}
              size="sm"
              options={[
                { value: 'open', label: pt ? 'Em aberto' : 'Open', count: counts.open },
                { value: 'draft', label: pt ? 'Rascunhos' : 'Draft', count: counts.draft },
                { value: 'ordered', label: pt ? 'Enviados' : 'Ordered', count: counts.ordered },
                { value: 'partially-received', label: pt ? 'Parciais' : 'Partial', count: counts.partial },
                { value: 'received', label: pt ? 'Recebidos' : 'Received', count: counts.received },
                { value: 'cancelled', label: pt ? 'Cancelados' : 'Cancelled', count: counts.cancelled },
                { value: 'all', label: pt ? 'Todos' : 'All', count: counts.all },
              ]}
            />
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 sm:max-w-sm sm:flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-11 rounded-[4px] pl-9 text-[13px] sm:h-9" value={search} onChange={event => setSearch(event.target.value)} placeholder={pt ? 'Número do pedido, fornecedor ou código da peça' : 'Reference, supplier or part number'} aria-label={pt ? 'Buscar pedidos de compra' : 'Search purchase orders'} />
              </div>
              {loading && <span className="text-xs text-muted-foreground" role="status">{pt ? 'Atualizando…' : 'Refreshing…'}</span>}
            </div>

            {error ? (
              <Notice tone="bad">
                <p className="font-medium">{pt ? 'Pedidos de compra indisponíveis' : 'Purchase orders unavailable'}</p>
                <p className="mt-0.5 text-muted-foreground">{error}</p>
                <Track className="mt-2"><Pill size="sm" className="max-sm:h-10" onClick={load}>{pt ? 'Tentar novamente' : 'Retry'}</Pill></Track>
              </Notice>
            ) : visible.length === 0 ? (
              <Panel className="flex flex-col items-center gap-3 border-dashed px-4 py-8 text-center">
                <p className="text-[13px] text-muted-foreground">{orders.length && (filter !== 'all' || search.trim()) ? (pt ? 'Nenhum pedido de compra encontrado' : 'No matching purchase orders') : (pt ? 'Nenhum pedido de compra' : 'No purchase orders')}</p>
                {orders.length > 0 && (filter !== 'all' || search.trim()) && (
                  <Pill size="sm" className="max-sm:h-10" onClick={() => { setFilter('all'); setSearch('') }}>{pt ? 'Limpar filtros' : 'Reset filters'}</Pill>
                )}
              </Panel>
            ) : (
              <DeskTable aria-labelledby="po-all">
                <thead>
                  <tr>
                    <Th>{pt ? 'Pedido' : 'PO'}</Th>
                    <Th priority={2}>{pt ? 'Fornecedor' : 'Supplier'}</Th>
                    <Th>{pt ? 'Situação' : 'Status'}</Th>
                    <Th align="right" priority={3}>{pt ? 'Itens' : 'Lines'}</Th>
                    <Th align="right" priority={2}>{pt ? 'Recebido' : 'Received'}</Th>
                    <Th priority={3}>{pt ? 'Data' : 'Date'}</Th>
                    {rooftops.length > 1 && <Th priority={3}>{pt ? 'Loja' : 'Rooftop'}</Th>}
                    <Th align="right">{pt ? 'Valor total' : 'Total'}</Th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(order => {
                    const lines = poLines(order)
                    const ordered = lines.reduce((sum, line) => sum + line.quantity, 0)
                    const received = lines.reduce((sum, line) => sum + line.receivedQuantity, 0)
                    const live = order.status !== 'draft' && order.status !== 'cancelled'
                    return (
                      <Tr key={order.id} className="cursor-pointer" onClick={() => router.push(poHref(order))}>
                        <Td className="max-w-[14rem]">
                          <Link href={poHref(order)} onClick={event => event.stopPropagation()} className="hover:underline"><Code className="text-foreground">{order.reference}</Code></Link>
                          <p className="truncate text-xs text-muted-foreground md:hidden">{order.supplier}</p>
                        </Td>
                        <Td priority={2} className="max-w-[14rem] truncate">{order.supplier}</Td>
                        <Td><Status tone={PO_STATUS_TONE[order.status] || 'idle'}>{PO_STATUS_LABEL[order.status] || order.status}</Status></Td>
                        <Td align="right" priority={3} className="text-muted-foreground">{lines.length}</Td>
                        <Td align="right" priority={2} className="whitespace-nowrap">{live ? `${received} of ${ordered}` : <span className="text-muted-foreground">-</span>}</Td>
                        <Td priority={3} className="whitespace-nowrap text-muted-foreground">
                          {order.orderedAt ? `Ordered ${formatDateTime(order.orderedAt, timeZone)}` : `Created ${formatDateTime(order.createdAt, timeZone)}`}
                        </Td>
                        {rooftops.length > 1 && <Td priority={3} className="text-muted-foreground">{order.rooftop?.name || '-'}</Td>}
                        <Td align="right" className="whitespace-nowrap font-medium">{formatCents(poTotalCents(order))}</Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </DeskTable>
            )}
          </div>
        </DeskSection>

        <PurchaseOrderFormDialog
          open={Boolean(creating)}
          order={null}
          parts={parts}
          rooftops={rooftops}
          currencyCode={currencyCode}
          initialPartIds={creating?.partIds}
          onOpenChange={open => { if (!open) setCreating(null) }}
          onSaved={id => {
            setCreating(null)
            router.push(`${basePath}/platform/parts/purchase-orders/${id}`)
          }}
        />
      </div>
    </PageContainer>
  )
}
