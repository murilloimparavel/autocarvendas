'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ClipboardList, Pencil, Plus, RefreshCw, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import {
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

import { getPartsCatalog, getPurchaseOrders } from '../actions'
import { PartFormDialog } from '../components/PartFormDialog'
import {
  PO_RECEIVABLE,
  PO_STATUS_LABEL,
  PO_STATUS_TONE,
  STOCK_LABEL,
  STOCK_TONE,
  available,
  formatAge,
  formatCents,
  poLines,
  stockState,
  type Part,
  type PartsRooftop,
  type PurchaseOrder,
} from '../lib/types'
import { countLabel } from '@/features/platform/lib/format'

type StockFilter = 'all' | 'low' | 'out' | 'on-order'

function matchesFilter(part: Part, filter: StockFilter) {
  if (filter === 'low') return stockState(part) === 'low'
  if (filter === 'out') return stockState(part) === 'out'
  if (filter === 'on-order') return Number(part.onOrderQuantity || 0) > 0
  return true
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-center gap-3 rounded-md border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">{children}</div>
}

export function PartsPageClient({
  initialParts,
  initialRooftops,
  initialError,
  initialPurchaseOrders = [],
}: {
  initialParts: Part[]
  initialRooftops: PartsRooftop[]
  initialError: string | null
  initialPurchaseOrders?: PurchaseOrder[]
}) {
  const router = useRouter()
  const [parts, setParts] = useState(initialParts)
  const [rooftops, setRooftops] = useState(initialRooftops)
  const [purchaseOrders, setPurchaseOrders] = useState(initialPurchaseOrders)
  const [error, setError] = useState(initialError)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<StockFilter>('all')
  const [search, setSearch] = useState('')
  const [rooftopId, setRooftopId] = useState('all')
  const [editing, setEditing] = useState<{ part: Part | null } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Clock for ages and lateness; advances on each refresh.
  const [now, setNow] = useState(() => Date.now())

  const load = async () => {
    setLoading(true)
    const [response, orders] = await Promise.all([getPartsCatalog(), getPurchaseOrders()])
    if (response.success) {
      setParts(response.data.partsInventories || [])
      setRooftops(response.data.rooftops || [])
      setError(null)
    } else {
      setError(response.error)
    }
    if (orders.success) setPurchaseOrders(orders.data.partsPurchaseOrders || [])
    setNow(Date.now())
    setLoading(false)
  }

  const scoped = useMemo(() => (rooftopId === 'all' ? parts : parts.filter(part => part.rooftop?.id === rooftopId)), [parts, rooftopId])
  const counts = useMemo(() => ({
    all: scoped.length,
    low: scoped.filter(part => stockState(part) === 'low').length,
    out: scoped.filter(part => stockState(part) === 'out').length,
    onOrder: scoped.filter(part => Number(part.onOrderQuantity || 0) > 0).length,
  }), [scoped])
  const totals = useMemo(() => ({
    value: scoped.reduce((sum, part) => sum + Number(part.quantity || 0) * Number(part.costCents || 0), 0),
    committed: scoped.reduce((sum, part) => sum + Number(part.committedQuantity || 0), 0),
    onOrder: scoped.reduce((sum, part) => sum + Number(part.onOrderQuantity || 0), 0),
  }), [scoped])

  // Needs you: parts at or under their reorder point (out first, then least available), and POs waiting to be received (oldest order first).
  const belowReorder = useMemo(
    () => scoped
      .filter(part => stockState(part) !== 'ok')
      .sort((a, b) => (stockState(a) === stockState(b) ? available(a) - available(b) : stockState(a) === 'out' ? -1 : 1)),
    [scoped],
  )
  const toReceive = useMemo(
    () => purchaseOrders
      .filter(order => PO_RECEIVABLE.includes(order.status) && (rooftopId === 'all' || order.rooftop?.id === rooftopId))
      .sort((a, b) => new Date(a.orderedAt || a.createdAt).getTime() - new Date(b.orderedAt || b.createdAt).getTime()),
    [purchaseOrders, rooftopId],
  )

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return scoped.filter(part => matchesFilter(part, filter)).filter(part =>
      !term || [part.partNumber, part.description, part.binLocation, part.supplier, part.supplierPartNumber].some(value => String(value || '').toLowerCase().includes(term)),
    )
  }, [scoped, filter, search])

  const dialogRooftops = useMemo(() => (rooftopId !== 'all' ? rooftops.filter(rooftop => rooftop.id === rooftopId) : rooftops), [rooftops, rooftopId])
  const isFiltered = filter !== 'all' || Boolean(search.trim())
  const multiRooftop = rooftops.length > 1
  const partHref = (part: Part) => `${basePath}/platform/parts/${part.id}`
  const poHref = (order: PurchaseOrder) => `${basePath}/platform/parts/purchase-orders/${order.id}`

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Parts' },
  ]

  const header = (
    <DeskHeader
      title="Parts"
      tone={error ? 'bad' : counts.out ? 'bad' : counts.low ? 'warn' : 'ok'}
      status={error ? 'Unavailable' : `${counts.out} out of stock, ${counts.low} low`}
      meta={`${countLabel(counts.all, 'part')} · ${counts.low} low · ${counts.out} out · ${countLabel(toReceive.length, 'PO')} to receive`}
      actions={
        <>
          <Pill variant="plain" onClick={load} disabled={loading} className="h-11 sm:h-8">
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            Refresh
          </Pill>
          <Pill asChild className="h-11 sm:h-8">
            <Link href={`${basePath}/platform/parts/purchase-orders`}>
              <ClipboardList />
              Purchase orders
            </Link>
          </Pill>
          <Pill variant="primary" className="h-11 sm:h-8" onClick={() => setEditing({ part: null })} disabled={!rooftops.length} title={rooftops.length ? undefined : 'No rooftop available'}>
            <Plus />
            New part
          </Pill>
        </>
      }
    />
  )

  return (
    <PageContainer title="Parts" header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {notice && (
          <Notice tone="ok">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0">{notice}</p>
              <Pill size="sm" variant="plain" className="max-sm:h-10" onClick={() => setNotice(null)}>Dismiss</Pill>
            </div>
          </Notice>
        )}

        {!error && (
          <div className="grid min-w-0 grid-cols-1 gap-8 xl:grid-cols-2">
            <DeskSection title="Below reorder point" count={belowReorder.length} id="parts-below-reorder">
              {belowReorder.length === 0 ? (
                <Empty>{scoped.length ? 'No parts below reorder point' : 'No parts'}</Empty>
              ) : (
                <DeskTable aria-labelledby="parts-below-reorder">
                  <thead>
                    <tr>
                      <Th>Part</Th>
                      <Th align="right">Avail</Th>
                      <Th align="right" priority={2}>Reorder at</Th>
                      <Th align="right">On order</Th>
                      <Th priority={2}>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {belowReorder.map(part => {
                      const state = stockState(part)
                      return (
                        <Tr key={part.id} className="cursor-pointer" onClick={() => router.push(partHref(part))}>
                          <Td className="max-w-[16rem]">
                            <Link href={partHref(part)} onClick={event => event.stopPropagation()} className="hover:underline">
                              <Code className="text-foreground">{part.partNumber}</Code>
                            </Link>
                            <p className="truncate text-xs text-muted-foreground">{part.description}</p>
                            <div className="md:hidden"><Status tone={STOCK_TONE[state]} className="text-xs">{STOCK_LABEL[state]}</Status></div>
                          </Td>
                          <Td align="right"><Figure size="sm" attention={state === 'out'}>{available(part)}</Figure></Td>
                          <Td align="right" priority={2} className="text-muted-foreground">{part.minimumQuantity || '-'}</Td>
                          <Td align="right" className={Number(part.onOrderQuantity || 0) ? undefined : 'text-muted-foreground'}>{part.onOrderQuantity ?? 0}</Td>
                          <Td priority={2}><Status tone={STOCK_TONE[state]}>{STOCK_LABEL[state]}</Status></Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </DeskTable>
              )}
            </DeskSection>

            <DeskSection
              title="POs to receive"
              count={toReceive.length}
              id="parts-to-receive"
              actions={
                <Pill size="sm" variant="plain" className="max-sm:h-10" asChild>
                  <Link href={`${basePath}/platform/parts/purchase-orders`}>All POs</Link>
                </Pill>
              }
            >
              {toReceive.length === 0 ? (
                <Empty>No purchase orders waiting to be received</Empty>
              ) : (
                <DeskTable aria-labelledby="parts-to-receive">
                  <thead>
                    <tr>
                      <Th>PO</Th>
                      <Th priority={2}>Status</Th>
                      <Th align="right">Received</Th>
                      <Th align="right">Age</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {toReceive.map(order => {
                      const lines = poLines(order)
                      const ordered = lines.reduce((sum, line) => sum + line.quantity, 0)
                      const received = lines.reduce((sum, line) => sum + line.receivedQuantity, 0)
                      return (
                        <Tr key={order.id} className="cursor-pointer" onClick={() => router.push(poHref(order))}>
                          <Td className="max-w-[16rem]">
                            <Link href={poHref(order)} onClick={event => event.stopPropagation()} className="hover:underline">
                              <Code className="text-foreground">{order.reference}</Code>
                            </Link>
                            <p className="truncate text-xs text-muted-foreground">{order.supplier}</p>
                          </Td>
                          <Td priority={2}><Status tone={PO_STATUS_TONE[order.status] || 'idle'}>{PO_STATUS_LABEL[order.status] || order.status}</Status></Td>
                          <Td align="right" className="whitespace-nowrap">{received} of {ordered}</Td>
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
          </div>
        )}

        <ReadoutStrip>
          <Readout label="Parts" value={counts.all} />
          <Readout label="Low stock" value={counts.low} tone={counts.low ? 'warn' : undefined} />
          <Readout label="Out of stock" value={counts.out} tone={counts.out ? 'bad' : undefined} />
          <Readout label="Committed" value={totals.committed} sub="units" />
          <Readout label="On order" value={totals.onOrder} sub="units" />
          <Readout label="Stock at cost" value={formatCents(totals.value)} />
        </ReadoutStrip>

        <DeskSection title="All parts" count={visible.length} id="parts-all">
          <div className="space-y-3">
            <Segmented<StockFilter>
              label="Filter parts"
              value={filter}
              onChange={setFilter}
              size="sm"
              options={[
                { value: 'all', label: 'All', count: counts.all },
                { value: 'low', label: 'Low stock', count: counts.low },
                { value: 'out', label: 'Out of stock', count: counts.out },
                { value: 'on-order', label: 'On order', count: counts.onOrder },
              ]}
            />
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 sm:max-w-sm sm:flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-11 rounded-[4px] pl-9 text-[13px] sm:h-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Part number, description, bin or supplier" aria-label="Search parts" />
              </div>
              {multiRooftop && (
                <Select value={rooftopId} onValueChange={setRooftopId}>
                  <SelectTrigger className="h-11 w-full rounded-[4px] px-3 text-[13px] sm:h-9 sm:w-[200px]" aria-label="Rooftop">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All rooftops</SelectItem>
                    {rooftops.map(rooftop => <SelectItem key={rooftop.id} value={rooftop.id}>{rooftop.name || rooftop.id}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {loading && <span className="text-xs text-muted-foreground" role="status">Refreshing…</span>}
            </div>

            {error ? (
              <Notice tone="bad">
                <p className="font-medium">Parts unavailable</p>
                <p className="mt-0.5 text-muted-foreground">{error}</p>
                <Track className="mt-2"><Pill size="sm" className="max-sm:h-10" onClick={load}>Retry</Pill></Track>
              </Notice>
            ) : visible.length === 0 ? (
              <Empty>
                <p>{scoped.length && isFiltered ? 'No matching parts' : 'No parts'}</p>
                {scoped.length > 0 && isFiltered ? (
                  <Pill size="sm" className="max-sm:h-10" onClick={() => { setFilter('all'); setSearch('') }}>Reset filters</Pill>
                ) : (
                  <Pill size="sm" variant="primary" className="max-sm:h-10" onClick={() => setEditing({ part: null })} disabled={!rooftops.length}>
                    <Plus />
                    New part
                  </Pill>
                )}
              </Empty>
            ) : (
              <DeskTable aria-labelledby="parts-all">
                <thead>
                  <tr>
                    <Th>Part</Th>
                    <Th priority={3}>Bin</Th>
                    <Th priority={3}>Supplier</Th>
                    <Th align="right" priority={3}>Price</Th>
                    <Th align="right" priority={2}>On hand</Th>
                    <Th align="right" priority={2}>Commit</Th>
                    <Th align="right">Avail</Th>
                    <Th align="right" priority={2}>Order</Th>
                    <Th align="right" priority={3}>Reorder</Th>
                    <Th priority={2}>Status</Th>
                    <Th align="right"><span className="sr-only">Actions</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(part => {
                    const state = stockState(part)
                    const reorder = Number(part.minimumQuantity || 0)
                    return (
                      <Tr key={part.id}>
                        <Td className="max-w-[18rem]">
                          <Link href={partHref(part)} className="hover:underline">
                            <Code className="text-foreground">{part.partNumber}</Code>
                          </Link>
                          <p className="truncate">{part.description}</p>
                          {multiRooftop && part.rooftop?.name && <p className="truncate text-xs text-muted-foreground">{part.rooftop.name}</p>}
                          <div className="md:hidden"><Status tone={STOCK_TONE[state]} className="text-xs">{STOCK_LABEL[state]}</Status></div>
                        </Td>
                        <Td priority={3}>{part.binLocation ? <Code>{part.binLocation}</Code> : <span className="text-muted-foreground">No bin</span>}</Td>
                        <Td priority={3} className="max-w-[10rem] truncate text-muted-foreground">{part.supplier || '-'}</Td>
                        <Td align="right" priority={3} className="whitespace-nowrap">{formatCents(part.priceCents)}</Td>
                        <Td align="right" priority={2}>{part.quantity ?? 0}</Td>
                        <Td align="right" priority={2} className="text-muted-foreground">{part.committedQuantity ?? 0}</Td>
                        <Td align="right" className={state === 'out' ? 'font-semibold text-red-700 dark:text-red-300' : state === 'low' ? 'font-semibold text-amber-700 dark:text-amber-300' : 'font-medium'}>{available(part)}</Td>
                        <Td align="right" priority={2} className="text-muted-foreground">{part.onOrderQuantity ?? 0}</Td>
                        <Td align="right" priority={3} className="text-muted-foreground">{reorder || '-'}</Td>
                        <Td priority={2}><Status tone={STOCK_TONE[state]}>{STOCK_LABEL[state]}</Status></Td>
                        <Td align="right" className="w-[1%] whitespace-nowrap">
                          <div className="flex justify-end gap-0.5">
                            <Pill size="sm" variant="plain" className="max-sm:h-10" onClick={() => setEditing({ part })} aria-label={`Edit ${part.partNumber}`}>
                              <Pencil />
                              <span className="max-sm:sr-only">Edit</span>
                            </Pill>
                            <Pill size="sm" variant="plain" className="max-sm:h-10" asChild>
                              <Link href={partHref(part)}>Ledger</Link>
                            </Pill>
                          </div>
                        </Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </DeskTable>
            )}
          </div>
        </DeskSection>

        <PartFormDialog
          open={Boolean(editing)}
          part={editing?.part || null}
          rooftops={dialogRooftops}
          onOpenChange={open => { if (!open) setEditing(null) }}
          onSaved={async () => {
            setNotice(editing?.part ? 'Part saved' : 'Part created')
            setEditing(null)
            await load()
          }}
        />
      </div>
    </PageContainer>
  )
}
