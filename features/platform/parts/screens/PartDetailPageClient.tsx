'use client'

import { useMemo, useState } from 'react'
import { useLocale } from '@/features/i18n/LocaleProvider'
import Link from 'next/link'
import { ArrowLeft, Pencil, RefreshCw } from 'lucide-react'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { Code, DeskHeader, DeskSection, DeskTable, Facts, Notice, Panel, Pill, Readout, ReadoutStrip, Segmented, Status, Td, Th, Tr, Track, type DeskTone } from '@/features/platform/components/desk'
import { recordReference } from '@/features/platform/lib/format'

import { getPartDetail } from '../actions'
import { MovementDialog } from '../components/MovementDialog'
import { PartFormDialog } from '../components/PartFormDialog'
import {
  MOVEMENT_LABEL,
  PO_STATUS_LABEL,
  PO_STATUS_TONE,
  STOCK_LABEL,
  STOCK_TONE,
  available,
  formatCents as formatCentsBase,
  formatDateTime as formatDateTimeBase,
  partsLabel,
  poLines,
  stockState,
  type MovementType,
  type OpenRepairOrder,
  type Part,
  type PartsMovement,
  type PurchaseOrder,
} from '../lib/types'

type LedgerFilter = 'all' | 'stock' | 'ro' | 'orders'

const LEDGER_GROUP: Record<string, LedgerFilter> = {
  receipt: 'stock',
  adjustment: 'stock',
  count: 'stock',
  issue: 'ro',
  return: 'ro',
  commit: 'ro',
  release: 'ro',
  'po-order': 'orders',
  'po-cancel': 'orders',
}

const MOVEMENT_TONE: Record<string, DeskTone> = {
  receipt: 'ok',
  return: 'ok',
  issue: 'info',
  commit: 'info',
  release: 'idle',
  adjustment: 'warn',
  count: 'warn',
  'po-order': 'info',
  'po-cancel': 'idle',
}

const ACTIONS: Array<{ type: MovementType; label: string; primary?: boolean }> = [
  { type: 'receipt', label: 'Receive', primary: true },
  { type: 'commit', label: 'Commit to RO' },
  { type: 'issue', label: 'Issue to RO' },
  { type: 'return', label: 'Return from RO' },
  { type: 'release', label: 'Release' },
  { type: 'adjustment', label: 'Adjust' },
  { type: 'count', label: 'Count' },
  { type: 'po-order', label: 'Mark on order' },
  { type: 'po-cancel', label: 'Cancel on order' },
]

/** Why a movement cannot be recorded right now, or null. Mirrors the server's stock checks. */
function blockedReason(type: MovementType, part: Part, openRos: number): string | null {
  const needsRo = ['issue', 'return', 'commit', 'release'].includes(type)
  if (needsRo && openRos === 0) return 'no open repair orders'
  if (type === 'issue' && Number(part.quantity || 0) <= 0) return 'nothing on hand'
  if (type === 'commit' && available(part) <= 0) return 'nothing available'
  if (type === 'release' && Number(part.committedQuantity || 0) <= 0) return 'nothing committed'
  if (type === 'po-cancel' && Number(part.onOrderQuantity || 0) <= 0) return 'nothing on order'
  return null
}

function movementQuantity(movement: PartsMovement) {
  const fromEvidence = Number((movement.evidence as { quantity?: unknown } | null)?.quantity)
  if (['receipt', 'return', 'adjustment', 'count', 'issue'].includes(movement.movementType)) {
    const delta = movement.quantityDelta
    return delta > 0 ? `+${delta}` : String(delta)
  }
  const size = Number.isFinite(fromEvidence) && fromEvidence > 0 ? fromEvidence : null
  if (size === null) return '-'
  return movement.movementType === 'release' || movement.movementType === 'po-cancel' ? `-${size}` : `+${size}`
}

export function PartDetailPageClient({
  id,
  initialPart,
  initialMovements,
  initialRepairOrders,
  initialPurchaseOrders,
  initialError,
  timeZone,
  currencyCode,
}: {
  id: string
  initialPart: Part | null
  initialMovements: PartsMovement[]
  initialRepairOrders: OpenRepairOrder[]
  initialPurchaseOrders: PurchaseOrder[]
  initialError: string | null
  timeZone: string
  currencyCode: string
}) {
  const { locale } = useLocale()
  const formatCents = (value: number | null | undefined) => formatCentsBase(value, currencyCode, locale)
  const formatDateTime = (value: string | null | undefined, zone: string) => formatDateTimeBase(value, zone, locale)
  const [part, setPart] = useState(initialPart)
  const [movements, setMovements] = useState(initialMovements)
  const [repairOrders, setRepairOrders] = useState(initialRepairOrders)
  const [purchaseOrders, setPurchaseOrders] = useState(initialPurchaseOrders)
  const [error, setError] = useState(initialError)
  const [loading, setLoading] = useState(false)
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>('all')
  const [movementType, setMovementType] = useState<MovementType | null>(null)
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const response = await getPartDetail(id)
    if (response.success && response.data.partsInventory) {
      setPart(response.data.partsInventory)
      setMovements(response.data.partsMovements || [])
      setRepairOrders(response.data.serviceOrders || [])
      setPurchaseOrders(response.data.purchaseOrders || [])
      setError(null)
    } else {
      setError(response.success ? 'Part not found' : response.error)
    }
    setLoading(false)
  }

  const rooftopRos = useMemo(() => repairOrders.filter(order => order.rooftop?.id === part?.rooftop?.id), [repairOrders, part?.rooftop?.id])
  const openPos = useMemo(() => purchaseOrders.filter(order => poLines(order).some(line => line.partId === id)), [purchaseOrders, id])
  const ledgerCounts = useMemo(() => ({
    all: movements.length,
    stock: movements.filter(movement => LEDGER_GROUP[movement.movementType] === 'stock').length,
    ro: movements.filter(movement => LEDGER_GROUP[movement.movementType] === 'ro').length,
    orders: movements.filter(movement => LEDGER_GROUP[movement.movementType] === 'orders').length,
  }), [movements])
  const visibleMovements = ledgerFilter === 'all' ? movements : movements.filter(movement => LEDGER_GROUP[movement.movementType] === ledgerFilter)

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'link' as const, label: 'Parts', href: `${basePath}/platform/parts` },
    { type: 'page' as const, label: part?.partNumber || 'Part' },
  ]

  if (!part) {
    return (
      <PageContainer title="Part" breadcrumbs={breadcrumbs} header={<DeskHeader title="Part" tone="bad" status="Unavailable" />}>
        <div className="min-w-0 max-w-full space-y-4 px-4 pb-24 md:px-6">
          <Notice tone="bad">
            <p className="font-medium">Part unavailable</p>
            <p className="mt-0.5 text-muted-foreground">{error || 'Part not found'}</p>
            <Track className="mt-2">
              <Pill size="sm" className="max-sm:h-10" onClick={load} disabled={loading}>Retry</Pill>
              <Pill size="sm" className="max-sm:h-10" asChild><Link href={`${basePath}/platform/parts`}>Back to parts</Link></Pill>
            </Track>
          </Notice>
        </div>
      </PageContainer>
    )
  }

  const state = stockState(part)
  const blocked = ACTIONS.map(action => ({ ...action, reason: blockedReason(action.type, part, rooftopRos.length) }))
  const margin = part.priceCents && part.costCents != null && part.priceCents > 0 ? Math.round(((part.priceCents - part.costCents) / part.priceCents) * 1000) / 10 : null

  const receive = blocked.find(action => action.primary)
  const secondary = blocked.filter(action => !action.primary)

  const header = (
    <DeskHeader
      title={<><span className="font-mono">{part.partNumber}</span> <span className="font-normal">{part.description}</span></>}
      tone={STOCK_TONE[state]}
      status={partsLabel(locale, STOCK_LABEL[state])}
      meta={
        <span className="flex flex-wrap items-baseline gap-x-2">
          <Status tone={STOCK_TONE[state]}>{partsLabel(locale, STOCK_LABEL[state])}</Status>
          <span>· {part.binLocation ? <>Bin <Code>{part.binLocation}</Code></> : 'No bin'}</span>
          {part.supplier && <span>· {part.supplier}</span>}
          {part.rooftop?.name && <span>· {part.rooftop.name}</span>}
        </span>
      }
      actions={
        <>
          <Pill variant="plain" asChild className="h-11 sm:h-8">
            <Link href={`${basePath}/platform/parts`}><ArrowLeft />Parts</Link>
          </Pill>
          <Pill variant="plain" onClick={load} disabled={loading} className="h-11 sm:h-8">
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            Refresh
          </Pill>
          <Pill onClick={() => setEditing(true)} className="h-11 sm:h-8">
            <Pencil />
            Edit
          </Pill>
          {receive && (
            <Pill
              variant="primary"
              className="h-11 sm:h-8"
              disabled={Boolean(receive.reason)}
              title={receive.reason ? `${receive.label}: ${receive.reason}` : undefined}
              onClick={() => setMovementType(receive.type)}
            >
              {receive.label}
            </Pill>
          )}
        </>
      }
    />
  )

  return (
    <PageContainer title={part.partNumber} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {(notice || error) && (
          <div className="space-y-2">
            {notice && (
              <Notice tone="ok">
                <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                  <p className="min-w-0">{notice}</p>
                  <Pill size="sm" variant="plain" className="max-sm:h-10" onClick={() => setNotice(null)}>Dismiss</Pill>
                </div>
              </Notice>
            )}
            {error && <Notice tone="bad">{error}</Notice>}
          </div>
        )}

        <DeskSection title="Stock">
          <div className="space-y-3">
            <ReadoutStrip>
              <Readout label="Available" value={available(part)} tone={STOCK_TONE[state]} sub={partsLabel(locale, STOCK_LABEL[state])} />
              <Readout label="On hand" value={part.quantity ?? 0} />
              <Readout label="Committed" value={part.committedQuantity ?? 0} />
              <Readout label="On order" value={part.onOrderQuantity ?? 0} />
              <Readout label="Reorder point" value={part.minimumQuantity || '-'} />
            </ReadoutStrip>
            <Track className="flex-wrap" aria-label="Record stock movement">
              {secondary.map(action => (
                <Pill
                  key={action.type}
                  className="h-11 sm:h-8"
                  disabled={Boolean(action.reason)}
                  title={action.reason ? `${action.label}: ${action.reason}` : undefined}
                  onClick={() => setMovementType(action.type)}
                >
                  {action.label}
                </Pill>
              ))}
            </Track>
            {blocked.some(action => action.reason) && (
              <p className="text-xs text-muted-foreground">
                {blocked.filter(action => action.reason).map(action => `${action.label}: ${action.reason}`).join(' · ')}
              </p>
            )}
          </div>
        </DeskSection>

        <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <DeskSection title="Ledger" count={movements.length} id="part-ledger">
            <Segmented<LedgerFilter>
              label="Filter ledger"
              value={ledgerFilter}
              onChange={setLedgerFilter}
              size="sm"
              className="mb-3"
              options={[
                { value: 'all', label: 'All', count: ledgerCounts.all },
                { value: 'stock', label: 'Stock', count: ledgerCounts.stock },
                { value: 'ro', label: 'Repair orders', count: ledgerCounts.ro },
                { value: 'orders', label: 'Orders', count: ledgerCounts.orders },
              ]}
            />
            {visibleMovements.length === 0 ? (
              <Panel className="border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">No movements</Panel>
            ) : (
              <DeskTable aria-labelledby="part-ledger">
                <thead>
                  <tr>
                    <Th priority={2}>When</Th>
                    <Th>Movement</Th>
                    <Th priority={3}>Reference</Th>
                    <Th align="right">Qty</Th>
                    <Th align="right" priority={2}>On hand</Th>
                    <Th align="right" priority={3}>Committed</Th>
                    <Th align="right" priority={3}>On order</Th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMovements.map(movement => (
                    <Tr key={movement.id}>
                      <Td priority={2} className="whitespace-nowrap text-muted-foreground">{formatDateTime(movement.occurredAt, timeZone)}</Td>
                      <Td className="min-w-0">
                        <Status tone={MOVEMENT_TONE[movement.movementType] || 'idle'}>{MOVEMENT_LABEL[movement.movementType] || movement.movementType}</Status>
                        {movement.reason && <p className="break-words text-xs text-muted-foreground">{movement.reason}</p>}
                        <p className="text-xs text-muted-foreground md:hidden">{formatDateTime(movement.occurredAt, timeZone)}</p>
                      </Td>
                      <Td priority={3} className="min-w-0">
                        <p className="break-words text-muted-foreground">{movement.reference}</p>
                        {movement.serviceOrder && <Code>{movement.serviceOrder.invoiceNumber || recordReference('RO', movement.serviceOrder.id)}</Code>}
                      </Td>
                      <Td align="right" className="font-medium">{movementQuantity(movement)}</Td>
                      <Td align="right" priority={2}>{movement.onHandAfter ?? '-'}</Td>
                      <Td align="right" priority={3} className="text-muted-foreground">{movement.committedAfter ?? '-'}</Td>
                      <Td align="right" priority={3} className="text-muted-foreground">{movement.onOrderAfter ?? '-'}</Td>
                    </Tr>
                  ))}
                </tbody>
              </DeskTable>
            )}
          </DeskSection>

          <div className="min-w-0 space-y-8">
            <DeskSection title="Open purchase orders" count={openPos.length}>
              {openPos.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">None</p>
              ) : (
                <Panel className="divide-y">
                  {openPos.map(order => {
                    const line = poLines(order).find(item => item.partId === id)
                    return (
                      <Link key={order.id} href={`${basePath}/platform/parts/purchase-orders/${order.id}`} className="flex min-h-11 min-w-0 items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40">
                        <span className="min-w-0">
                          <Code className="text-foreground">{order.reference}</Code>
                          <span className="block truncate text-xs text-muted-foreground">{order.supplier}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-0.5">
                          <Status tone={PO_STATUS_TONE[order.status] || 'idle'}>{partsLabel(locale, PO_STATUS_LABEL[order.status] || order.status)}</Status>
                          {line && <span className="text-xs tabular-nums text-muted-foreground">{line.receivedQuantity} of {line.quantity} received</span>}
                        </span>
                      </Link>
                    )
                  })}
                </Panel>
              )}
            </DeskSection>
            <DeskSection title="Details">
              <Facts
                items={[
                  { label: 'Bin', value: part.binLocation || '-', mono: true },
                  { label: 'Cost', value: <span className="tabular-nums">{formatCents(part.costCents)}</span> },
                  { label: 'Retail price', value: <span className="tabular-nums">{formatCents(part.priceCents)}</span> },
                  margin !== null && { label: 'Margin', value: <span className="tabular-nums">{margin}%</span> },
                  { label: 'Stock at cost', value: <span className="tabular-nums">{formatCents(Number(part.quantity || 0) * Number(part.costCents || 0))}</span> },
                  { label: 'Supplier', value: part.supplier || '-' },
                  { label: 'Supplier part number', value: part.supplierPartNumber || '-', mono: true },
                  part.rooftop?.name ? { label: 'Rooftop', value: part.rooftop.name } : null,
                ]}
              />
            </DeskSection>
          </div>
        </div>

        <MovementDialog
          open={Boolean(movementType)}
          type={movementType}
          part={part}
          repairOrders={rooftopRos}
          onOpenChange={open => { if (!open) setMovementType(null) }}
          onSaved={async () => {
            setNotice(`${MOVEMENT_LABEL[movementType || ''] || 'Movement'} recorded`)
            setMovementType(null)
            await load()
          }}
        />
        <PartFormDialog
          open={editing}
          part={part}
          rooftops={part.rooftop ? [part.rooftop] : []}
          currencyCode={currencyCode}
          onOpenChange={setEditing}
          onSaved={async () => {
            setNotice('Part saved')
            setEditing(false)
            await load()
          }}
        />
      </div>
    </PageContainer>
  )
}
