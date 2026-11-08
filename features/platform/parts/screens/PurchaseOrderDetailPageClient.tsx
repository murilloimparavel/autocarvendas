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

const PO_ACTION_LABEL: Record<string, string> = {
  update: 'Edit draft', order: 'Place order', receive: 'Receive', close: 'Close short', cancel: 'Cancel PO',
}

function blockedBy(action: keyof typeof PO_ACTION_FROM, status: string, locale: 'pt-BR' | 'en-US') {
  if ((PO_ACTION_FROM[action] as readonly string[]).includes(status)) return null
  if (locale === 'pt-BR') return `Pedidos com situação “${partsLabel(locale, PO_STATUS_LABEL[status] || status)}” não podem ser ${action === 'update' ? 'editados' : action === 'order' ? 'enviados' : action === 'receive' ? 'recebidos' : action === 'close' ? 'encerrados' : 'cancelados'}.`
  return `${PO_STATUS_LABEL[status] || status} purchase orders cannot be ${action === 'update' ? 'edited' : action === 'order' ? 'ordered' : action === 'receive' ? 'received' : action === 'close' ? 'closed' : 'cancelled'}`
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
  const pt = locale === 'pt-BR'
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
      setError(response.success ? (pt ? 'Pedido de compra não encontrado' : 'Purchase order not found') : response.error)
    }
    setLoading(false)
  }

  const breadcrumbs = [
    { type: 'link' as const, label: pt ? 'Painel' : 'Dashboard', href: basePath },
    { type: 'link' as const, label: pt ? 'Peças' : 'Parts', href: `${basePath}/platform/parts` },
    { type: 'link' as const, label: pt ? 'Pedidos de compra' : 'Purchase orders', href: `${basePath}/platform/parts/purchase-orders` },
    { type: 'page' as const, label: order?.reference || (pt ? 'Pedido de compra' : 'Purchase order') },
  ]

  if (!order) {
    return (
      <PageContainer title={pt ? 'Pedido de compra' : 'Purchase order'} breadcrumbs={breadcrumbs} header={<DeskHeader title={pt ? 'Pedido de compra' : 'Purchase order'} tone="bad" status={pt ? 'Indisponível' : 'Unavailable'} />}>
        <div className="min-w-0 max-w-full space-y-4 px-4 pb-24 md:px-6">
          <Notice tone="bad">
            <p className="font-medium">{pt ? 'Pedido de compra indisponível' : 'Purchase order unavailable'}</p>
            <p className="mt-0.5 text-muted-foreground">{error || (pt ? 'Pedido de compra não encontrado' : 'Purchase order not found')}</p>
            <Track className="mt-2">
              <Pill size="sm" className="max-sm:h-10" onClick={load} disabled={loading}>{pt ? 'Tentar novamente' : 'Retry'}</Pill>
              <Pill size="sm" className="max-sm:h-10" asChild><Link href={`${basePath}/platform/parts/purchase-orders`}>{pt ? 'Voltar aos pedidos de compra' : 'Back to purchase orders'}</Link></Pill>
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
    update: blockedBy('update', order.status, locale),
    order: blockedBy('order', order.status, locale),
    receive: blockedBy('receive', order.status, locale),
    close: blockedBy('close', order.status, locale),
    cancel: blockedBy('cancel', order.status, locale),
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
          <Link href={`${basePath}/platform/parts/purchase-orders`}><ArrowLeft />{partsLabel(locale, 'Purchase orders')}</Link>
          </Pill>
          <Pill variant="plain" onClick={load} disabled={loading} className="h-11 sm:h-8">
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            {partsLabel(locale, 'Refresh')}
          </Pill>
          {primary === 'receive' && (
            <Pill variant="primary" className="h-11 sm:h-8" onClick={() => setReceiving(true)}>{partsLabel(locale, 'Receive')}</Pill>
          )}
          {primary === 'order' && (
            <Pill variant="primary" className="h-11 sm:h-8" onClick={() => openConfirm('order')}>{partsLabel(locale, 'Place order')}</Pill>
          )}
        </>
      }
    />
  )

  const actions: Array<{ key: string; label: string; reason: string | null; onClick: () => void; primary?: boolean; danger?: boolean; icon?: ReactNode }> = [
    { key: 'update', label: partsLabel(locale, PO_ACTION_LABEL.update), reason: reasons.update, onClick: () => setEditing(true), icon: <Pencil /> },
    { key: 'order', label: partsLabel(locale, PO_ACTION_LABEL.order), reason: reasons.order, onClick: () => openConfirm('order'), primary: primary === 'order' },
    { key: 'receive', label: partsLabel(locale, PO_ACTION_LABEL.receive), reason: reasons.receive, onClick: () => setReceiving(true), primary: primary === 'receive' },
    { key: 'close', label: partsLabel(locale, PO_ACTION_LABEL.close), reason: reasons.close, onClick: () => openConfirm('close') },
    { key: 'cancel', label: partsLabel(locale, PO_ACTION_LABEL.cancel), reason: reasons.cancel, onClick: () => openConfirm('cancel') },
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
                  <Pill size="sm" variant="plain" className="max-sm:h-10" onClick={() => setNotice(null)}>{pt ? 'Fechar' : 'Dismiss'}</Pill>
                </div>
              </Notice>
            )}
            {error && <Notice tone="bad">{error}</Notice>}
            {terminal ? (
              <p className="text-[13px] text-muted-foreground">{partsLabel(locale, PO_STATUS_LABEL[order.status])} · {partsLabel(locale, 'no further actions')}</p>
            ) : secondary.length > 0 && (
              <Track className="flex-wrap" aria-label={pt ? 'Ações do pedido de compra' : 'Purchase order actions'}>
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
          <DeskSection title={pt ? 'Itens' : 'Lines'} count={lines.length} id="po-lines">
            {lines.length === 0 ? (
              <Panel className="border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">{pt ? 'Nenhum item' : 'No lines'}</Panel>
            ) : (
              <DeskTable aria-labelledby="po-lines">
                <thead>
                  <tr>
                    <Th>{pt ? 'Peça' : 'Part'}</Th>
                    <Th align="right">{pt ? 'Qtd.' : 'Qty'}</Th>
                    <Th align="right" priority={2}>{pt ? 'Recebido' : 'Received'}</Th>
                    <Th align="right">{pt ? 'Pendente' : 'Outstanding'}</Th>
                    <Th align="right" priority={3}>{pt ? 'Custo unitário' : 'Unit cost'}</Th>
                    <Th align="right" priority={2}>{pt ? 'Valor total' : 'Total'}</Th>
                    <Th align="right" priority={3}>{pt ? 'Em estoque' : 'On hand'}</Th>
                    <Th priority={3}>{pt ? 'Endereço' : 'Bin'}</Th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(line => {
                    const part = partById.get(line.partId)
                    const outstanding = Math.max(0, line.quantity - line.receivedQuantity)
                    const live = order.status !== 'draft' && order.status !== 'cancelled'
                    const tone = line.receivedQuantity >= line.quantity ? 'ok' : line.receivedQuantity > 0 ? 'warn' : live ? 'info' : 'idle'
                    const label = partsLabel(locale, line.receivedQuantity >= line.quantity ? 'Received' : line.receivedQuantity > 0 ? 'Partially received' : live ? 'On order' : 'Draft')
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

          <DeskSection title={pt ? 'Detalhes' : 'Details'}>
            <Facts
              items={[
                { label: pt ? 'Total' : 'Total', value: <Figure size="md">{formatCents(poTotalCents(order))}</Figure> },
                { label: pt ? 'Recebido' : 'Received', value: <span className="tabular-nums">{received} {pt ? 'de' : 'of'} {ordered} {pt ? 'unidades' : 'units'}</span> },
                { label: partsLabel(locale, 'Received at cost'), value: <span className="tabular-nums">{formatCents(receivedValue)}</span> },
                { label: pt ? 'Situação' : 'Status', value: <Status tone={PO_STATUS_TONE[order.status] || 'idle'}>{partsLabel(locale, PO_STATUS_LABEL[order.status] || order.status)}</Status> },
                { label: pt ? 'Fornecedor' : 'Supplier', value: order.supplier },
                { label: pt ? 'Criado em' : 'Created', value: formatDateTime(order.createdAt, timeZone) },
                { label: pt ? 'Pedido em' : 'Ordered', value: formatDateTime(order.orderedAt, timeZone) },
                { label: pt ? 'Recebido em' : 'Received on', value: formatDateTime(order.receivedAt, timeZone) },
                order.rooftop?.name ? { label: pt ? 'Loja' : 'Rooftop', value: order.rooftop.name } : null,
              ]}
            />
          </DeskSection>
        </div>

        <Dialog open={Boolean(confirm)} onOpenChange={open => { if (!open && !busy) setConfirm(null) }}>
          <DialogContent className="rounded-md sm:max-w-md sm:rounded-md">
            {confirm && (
              <>
                <DialogHeader>
                  <DialogTitle>{partsLabel(locale, CONFIRM[confirm.action].title)} · {order.reference}</DialogTitle>
                  <DialogDescription>{partsLabel(locale, CONFIRM[confirm.action].description)}</DialogDescription>
                </DialogHeader>
                {confirmError && <Notice tone="bad">{confirmError}</Notice>}
                <DialogFooter className="sm:justify-end">
                  <Track>
                    <Pill variant="plain" className="h-11 sm:h-8" disabled={busy} onClick={() => setConfirm(null)}>{pt ? 'Voltar' : 'Back'}</Pill>
                    <Pill variant={confirm.action === 'cancel' ? 'danger' : 'primary'} className="h-11 sm:h-8" disabled={busy} onClick={runConfirm}>
                {busy ? (pt ? 'Salvando…' : 'Saving…') : partsLabel(locale, CONFIRM[confirm.action].label)}
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
            setNotice(pt ? 'Rascunho salvo' : 'Draft saved')
            await load()
          }}
        />
        <ReceivePurchaseOrderDialog
          open={receiving}
          order={order}
          onOpenChange={setReceiving}
          onSaved={async status => {
            setReceiving(false)
            setNotice(pt ? (status === 'received' ? 'Pedido de compra recebido' : 'Recebimento registrado; pedido de compra recebido parcialmente') : (status === 'received' ? 'Purchase order received' : 'Receipt posted; purchase order partially received'))
            await load()
          }}
        />
      </div>
    </PageContainer>
  )
}
