'use client'

import { useState, type ReactNode } from 'react'
import { useLocale } from '@/features/i18n/LocaleProvider'
import Link from 'next/link'
import { ArrowLeft, Pencil, RefreshCw } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { Code, DeskHeader, DeskSection, DeskTable, Facts, Figure, Notice, Panel, Pill, Status, Td, Th, Tr, Track } from '@/features/platform/components/desk'

import { getPurchaseOrder, managePurchaseOrder } from '../actions'
import { PurchaseOrderFormDialog } from '../components/PurchaseOrderFormDialog'
import { ReceivePurchaseOrderDialog } from '../components/ReceivePurchaseOrderDialog'
import { PO_ACTION_FROM, PO_STATUS_LABEL, PO_STATUS_TONE, formatCents as formatCentsBase, formatDateTime as formatDateTimeBase, partsLabel, poLines, poTotalCents, type Part, type PurchaseOrder } from '../lib/types'

type ConfirmAction = 'order' | 'close' | 'cancel'

const CONFIRM: Record<ConfirmAction, { title: string; description: string; label: string; done: string }> = {
  order: { title: 'Place order', description: 'Every line goes on order.', label: 'Place order', done: 'Order placed' },
  close: { title: 'Close short', description: 'Outstanding quantities come off order.', label: 'Close short', done: 'Purchase order closed' },
  cancel: { title: 'Cancel purchase order', description: 'On-order quantities from this PO are released.', label: 'Cancel PO', done: 'Purchase order cancelled' },
}

function blockedBy(action: keyof typeof PO_ACTION_FROM, status: string) {
  return (PO_ACTION_FROM[action] as readonly string[]).includes(status) ? null : `${PO_STATUS_LABEL[status] || status} purchase orders cannot be ${action === 'update' ? 'edited' : action === 'order' ? 'ordered' : action === 'receive' ? 'received' : action === 'close' ? 'closed' : 'cancelled'}`
}

export function PurchaseOrderDetailPageClient({
  id,
  initialOrder,
  initialParts,
  initialError,
  timeZone,
  currencyCode,
}: {
  id: string
  initialOrder: PurchaseOrder | null
  initialParts: Part[]
  initialError: string | null
  timeZone: string
  currencyCode: string
}) {
  const { locale } = useLocale()
  const formatCents = (value: number | null | undefined) => formatCentsBase(value, currencyCode, locale)
  const formatDateTime = (value: string | null | undefined, zone: string) => formatDateTimeBase(value, zone, locale)
  const [order, setOrder] = useState(initialOrder)
  const [parts, setParts] = useState(initialParts)
  const [error, setError] = useState(initialError)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [receiving, setReceiving] = useState(false)
  const [confirm, setConfirm] = useState<{ action: ConfirmAction; key: string } | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const response = await getPurchaseOrder(id)
    if (response.success && response.data.partsPurchaseOrder) {
      setOrder(response.data.partsPurchaseOrder)
      setParts(response.data.partsInventories || [])
      setError(null)
    } else {
      setError(response.success ? 'Purchase order not found' : response.error)
    }
    setLoading(false)
  }

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'link' as const, label: 'Parts', href: `${basePath}/platform/parts` },
    { type: 'link' as const, label: 'Purchase orders', href: `${basePath}/platform/parts/purchase-orders` },
    { type: 'page' as const, label: order?.reference || 'Purchase order' },
  ]

  if (!order) {
    return (
      <PageContainer title="Purchase order" breadcrumbs={breadcrumbs} header={<DeskHeader title="Purchase order" tone="bad" status="Unavailable" />}>
        <div className="min-w-0 max-w-full space-y-4 px-4 pb-24 md:px-6">
          <Notice tone="bad">
            <p className="font-medium">Purchase order unavailable</p>
            <p className="mt-0.5 text-muted-foreground">{error || 'Purchase order not found'}</p>
            <Track className="mt-2">
              <Pill size="sm" className="max-sm:h-10" onClick={load} disabled={loading}>Retry</Pill>
              <Pill size="sm" className="max-sm:h-10" asChild><Link href={`${basePath}/platform/parts/purchase-orders`}>Back to purchase orders</Link></Pill>
            </Track>
          </Notice>
        </div>
      </PageContainer>
    )
  }

  const lines = poLines(order)
  const ordered = lines.reduce((sum, line) => sum + line.quantity, 0)
  const received = lines.reduce((sum, line) => sum + line.receivedQuantity, 0)
  const receivedValue = lines.reduce((sum, line) => sum + line.receivedQuantity * line.unitCostCents, 0)
  const partById = new Map(parts.map(part => [part.id, part]))
  const reasons = {
    update: blockedBy('update', order.status),
    order: blockedBy('order', order.status),
    receive: blockedBy('receive', order.status),
    close: blockedBy('close', order.status),
    cancel: blockedBy('cancel', order.status),
  }

  const openConfirm = (action: ConfirmAction) => {
    setConfirmError(null)
    setConfirm({ action, key: `parts-desk:po-${action}:${crypto.randomUUID()}` })
  }

  const runConfirm = async () => {
    if (!confirm) return
    setBusy(true)
    setConfirmError(null)
    const response = await managePurchaseOrder({ action: confirm.action, purchaseOrderId: order.id, expectedUpdatedAt: order.updatedAt, idempotencyKey: confirm.key })
    setBusy(false)
    if (!response.success) {
      setConfirmError(response.error)
      if (response.rejected) setConfirm(current => (current ? { ...current, key: `parts-desk:po-${current.action}:${crypto.randomUUID()}` } : null))
      return
    }
    setNotice(CONFIRM[confirm.action].done)
    setConfirm(null)
    await load()
  }

  const primary = !reasons.receive ? 'receive' : !reasons.order ? 'order' : null

  const header = (
    <DeskHeader
      title={<><span className="font-mono">{order.reference}</span> <span className="font-normal">{order.supplier}</span></>}
      tone={PO_STATUS_TONE[order.status] || 'idle'}
      status={partsLabel(locale, PO_STATUS_LABEL[order.status] || order.status)}
      meta={
        <span className="flex flex-wrap items-baseline gap-x-2">
          <Status tone={PO_STATUS_TONE[order.status] || 'idle'}>{partsLabel(locale, PO_STATUS_LABEL[order.status] || order.status)}</Status>
          <span>· {lines.length} {lines.length === 1 ? 'line' : 'lines'}</span>
          <span>· {received} of {ordered} received</span>
          {order.rooftop?.name && <span>· {order.rooftop.name}</span>}
        </span>
      }
      actions={
        <>
          <Pill variant="plain" asChild className="h-11 sm:h-8">
            <Link href={`${basePath}/platform/parts/purchase-orders`}><ArrowLeft />Purchase orders</Link>
          </Pill>
          <Pill variant="plain" onClick={load} disabled={loading} className="h-11 sm:h-8">
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            Refresh
          </Pill>
          {primary === 'receive' && (
            <Pill variant="primary" className="h-11 sm:h-8" onClick={() => setReceiving(true)}>Receive</Pill>
          )}
          {primary === 'order' && (
            <Pill variant="primary" className="h-11 sm:h-8" onClick={() => openConfirm('order')}>Place order</Pill>
          )}
        </>
      }
    />
  )

  const actions: Array<{ key: string; label: string; reason: string | null; onClick: () => void; primary?: boolean; danger?: boolean; icon?: ReactNode }> = [
    { key: 'update', label: 'Edit draft', reason: reasons.update, onClick: () => setEditing(true), icon: <Pencil /> },
    { key: 'order', label: 'Place order', reason: reasons.order, onClick: () => openConfirm('order'), primary: primary === 'order' },
    { key: 'receive', label: 'Receive', reason: reasons.receive, onClick: () => setReceiving(true), primary: primary === 'receive' },
    { key: 'close', label: 'Close short', reason: reasons.close, onClick: () => openConfirm('close') },
    { key: 'cancel', label: 'Cancel PO', reason: reasons.cancel, onClick: () => openConfirm('cancel') },
  ]
  // The primary action sits in the header; the rest stay one click away under it.
  const secondary = actions.filter(action => !action.reason && !action.primary)
  const terminal = order.status === 'received' || order.status === 'cancelled'

  return (
    <PageContainer title={order.reference} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {(notice || error || terminal || secondary.length > 0) && (
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
            {terminal ? (
              <p className="text-[13px] text-muted-foreground">{PO_STATUS_LABEL[order.status]} · no further actions</p>
            ) : secondary.length > 0 && (
              <Track className="flex-wrap" aria-label="Purchase order actions">
                {secondary.map(action => (
                  <Pill key={action.key} className="h-11 sm:h-8" onClick={action.onClick}>
                    {action.icon}
                    {action.label}
                  </Pill>
                ))}
              </Track>
            )}
          </div>
        )}

        <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <DeskSection title="Lines" count={lines.length} id="po-lines">
            {lines.length === 0 ? (
              <Panel className="border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">No lines</Panel>
            ) : (
              <DeskTable aria-labelledby="po-lines">
                <thead>
                  <tr>
                    <Th>Part</Th>
                    <Th align="right">Qty</Th>
                    <Th align="right" priority={2}>Received</Th>
                    <Th align="right">Outstanding</Th>
                    <Th align="right" priority={3}>Unit cost</Th>
                    <Th align="right" priority={2}>Total</Th>
                    <Th align="right" priority={3}>On hand</Th>
                    <Th priority={3}>Bin</Th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(line => {
                    const part = partById.get(line.partId)
                    const outstanding = Math.max(0, line.quantity - line.receivedQuantity)
                    const live = order.status !== 'draft' && order.status !== 'cancelled'
                    const tone = line.receivedQuantity >= line.quantity ? 'ok' : line.receivedQuantity > 0 ? 'warn' : live ? 'info' : 'idle'
                    const label = line.receivedQuantity >= line.quantity ? 'Received' : line.receivedQuantity > 0 ? 'Partial' : live ? 'On order' : 'Not ordered'
                    return (
                      <Tr key={line.partId}>
                        <Td className="min-w-0 max-w-[18rem]">
                          {part ? (
                            <Link href={`${basePath}/platform/parts/${line.partId}`} className="hover:underline"><Code className="text-foreground">{line.partNumber}</Code></Link>
                          ) : (
                            <Code className="text-foreground">{line.partNumber || line.partId}</Code>
                          )}
                          <p className="break-words">{line.description}</p>
                          <Status tone={tone} className="text-xs">{label}</Status>
                        </Td>
                        <Td align="right">{line.quantity}</Td>
                        <Td align="right" priority={2}>{line.receivedQuantity}</Td>
                        <Td align="right">{live && outstanding > 0 ? <Figure size="sm">{outstanding}</Figure> : <span className="text-muted-foreground">{outstanding}</span>}</Td>
                        <Td align="right" priority={3} className="whitespace-nowrap text-muted-foreground">{formatCents(line.unitCostCents)}</Td>
                        <Td align="right" priority={2} className="whitespace-nowrap font-medium">{formatCents(line.quantity * line.unitCostCents)}</Td>
                        <Td align="right" priority={3} className="text-muted-foreground">{part ? part.quantity ?? 0 : '-'}</Td>
                        <Td priority={3}>{part?.binLocation ? <Code>{part.binLocation}</Code> : <span className="text-muted-foreground">-</span>}</Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </DeskTable>
            )}
          </DeskSection>

          <DeskSection title="Details">
            <Facts
              items={[
                { label: 'Total', value: <Figure size="md">{formatCents(poTotalCents(order))}</Figure> },
                { label: 'Received', value: <span className="tabular-nums">{received} of {ordered} units</span> },
                { label: 'Received at cost', value: <span className="tabular-nums">{formatCents(receivedValue)}</span> },
                { label: 'Status', value: <Status tone={PO_STATUS_TONE[order.status] || 'idle'}>{PO_STATUS_LABEL[order.status] || order.status}</Status> },
                { label: 'Supplier', value: order.supplier },
                { label: 'Created', value: formatDateTime(order.createdAt, timeZone) },
                { label: 'Ordered', value: formatDateTime(order.orderedAt, timeZone) },
                { label: 'Received on', value: formatDateTime(order.receivedAt, timeZone) },
                order.rooftop?.name ? { label: 'Rooftop', value: order.rooftop.name } : null,
              ]}
            />
          </DeskSection>
        </div>

        <Dialog open={Boolean(confirm)} onOpenChange={open => { if (!open && !busy) setConfirm(null) }}>
          <DialogContent className="rounded-md sm:max-w-md sm:rounded-md">
            {confirm && (
              <>
                <DialogHeader>
                  <DialogTitle>{CONFIRM[confirm.action].title} · {order.reference}</DialogTitle>
                  <DialogDescription>{CONFIRM[confirm.action].description}</DialogDescription>
                </DialogHeader>
                {confirmError && <Notice tone="bad">{confirmError}</Notice>}
                <DialogFooter className="sm:justify-end">
                  <Track>
                    <Pill variant="plain" className="h-11 sm:h-8" disabled={busy} onClick={() => setConfirm(null)}>Back</Pill>
                    <Pill variant={confirm.action === 'cancel' ? 'danger' : 'primary'} className="h-11 sm:h-8" disabled={busy} onClick={runConfirm}>
                      {busy ? 'Saving…' : CONFIRM[confirm.action].label}
                    </Pill>
                  </Track>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        <PurchaseOrderFormDialog
          open={editing}
          order={order}
          parts={parts}
          rooftops={order.rooftop ? [order.rooftop] : []}
          currencyCode={currencyCode}
          onOpenChange={setEditing}
          onSaved={async () => {
            setEditing(false)
            setNotice('Draft saved')
            await load()
          }}
        />
        <ReceivePurchaseOrderDialog
          open={receiving}
          order={order}
          onOpenChange={setReceiving}
          onSaved={async status => {
            setReceiving(false)
            setNotice(status === 'received' ? 'Purchase order received' : 'Receipt posted; purchase order partially received')
            await load()
          }}
        />
      </div>
    </PageContainer>
  )
}
