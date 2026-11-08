'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Notice, Pill, Track } from '@/features/platform/components/desk'
import { formatCentsForInput, parseDollarsToCents } from '@/features/platform/deals/lib/moneyInput'

import { managePurchaseOrder } from '../actions'
import { poLines, type Part, type PartsRooftop, type PurchaseOrder } from '../lib/types'
import { FormField, hasErrors, parseWhole, type FieldErrors } from './FormField'

type LineDraft = { key: string; partId: string; quantity: string; unitCost: string }

const newLine = (): LineDraft => ({ key: crypto.randomUUID(), partId: '', quantity: '1', unitCost: '' })

/** Create a draft PO (order === null) or edit a draft's supplier, reference and lines. */
export function PurchaseOrderFormDialog({
  open,
  order,
  parts,
  rooftops,
  currencyCode,
  initialPartIds,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  order: PurchaseOrder | null
  parts: Part[]
  rooftops: PartsRooftop[]
  currencyCode: string
  /** Prefill lines for a new PO, for example every low-stock part. */
  initialPartIds?: string[]
  onOpenChange: (open: boolean) => void
  onSaved: (purchaseOrderId: string) => void
}) {
  const { locale } = useLocale()
  const moneyPlaceholder = new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode }).format(0)
  const [rooftopId, setRooftopId] = useState('')
  const [reference, setReference] = useState('')
  const [supplier, setSupplier] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([])
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState('')

  useEffect(() => {
    if (!open) return
    const partById = new Map(parts.map(part => [part.id, part]))
    if (order) {
      setRooftopId(order.rooftop?.id || '')
      setReference(order.reference)
      setSupplier(order.supplier)
      setLines(poLines(order).map(line => ({ key: crypto.randomUUID(), partId: line.partId, quantity: String(line.quantity), unitCost: formatCentsForInput(line.unitCostCents, locale) })))
    } else {
      const prefill = (initialPartIds || []).map(id => partById.get(id)).filter(Boolean) as Part[]
      setRooftopId(prefill[0]?.rooftop?.id || (rooftops.length === 1 ? rooftops[0].id : ''))
      setReference(`${locale === 'pt-BR' ? 'OC' : 'PO'}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`)
      setSupplier(prefill.find(part => part.supplier)?.supplier || '')
      setLines(prefill.length
        ? prefill.map(part => ({
            key: crypto.randomUUID(),
            partId: part.id,
            quantity: String(Math.max(1, Number(part.minimumQuantity || 0) * 2 - (Number(part.quantity || 0) - Number(part.committedQuantity || 0)) - Number(part.onOrderQuantity || 0))),
            unitCost: part.costCents ? formatCentsForInput(part.costCents, locale) : '',
          }))
        : [newLine()])
    }
    setErrors({})
    setFormError(null)
    setIdempotencyKey(`parts-desk:po:${crypto.randomUUID()}`)
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, locale])

  const rooftopParts = useMemo(() => parts.filter(part => !rooftopId || part.rooftop?.id === rooftopId), [parts, rooftopId])
  const partById = useMemo(() => new Map(parts.map(part => [part.id, part])), [parts])

  const total = lines.reduce((sum, line) => {
    const quantity = parseWhole(line.quantity, 1)
    const cost = parseDollarsToCents(line.unitCost, locale)
    return quantity && cost !== null ? sum + quantity * cost : sum
  }, 0)

  const updateLine = (key: string, patch: Partial<LineDraft>) => {
    setLines(current => current.map(line => {
      if (line.key !== key) return line
      const next = { ...line, ...patch }
      if (patch.partId && !line.unitCost) {
        const part = partById.get(patch.partId)
        if (part?.costCents) next.unitCost = formatCentsForInput(part.costCents, locale)
      }
      return next
    }))
    setErrors(current => ({ ...current, [`${key}:partId`]: undefined, [`${key}:quantity`]: undefined, [`${key}:unitCost`]: undefined, lines: undefined }))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: FieldErrors = {}
    if (!order && !rooftopId) next.rooftopId = locale === 'pt-BR' ? 'Selecione uma loja' : 'Choose a rooftop'
    if (!reference.trim()) next.reference = locale === 'pt-BR' ? 'Informe a referência' : 'Reference is required'
    else if (reference.trim().length > 100) next.reference = locale === 'pt-BR' ? 'Máximo de 100 caracteres' : 'At most 100 characters'
    if (!supplier.trim()) next.supplier = locale === 'pt-BR' ? 'Informe o fornecedor' : 'Supplier is required'
    if (!lines.length) next.lines = locale === 'pt-BR' ? 'Adicione pelo menos um item' : 'Add at least one line'
    const seen = new Set<string>()
    const payload: Array<{ partId: string; quantity: number; unitCostCents: number }> = []
    for (const line of lines) {
      const quantity = parseWhole(line.quantity, 1)
      const unitCostCents = line.unitCost.trim() ? parseDollarsToCents(line.unitCost, locale) : null
      if (!line.partId) next[`${line.key}:partId`] = locale === 'pt-BR' ? 'Selecione uma peça' : 'Choose a part'
      else if (seen.has(line.partId)) next[`${line.key}:partId`] = locale === 'pt-BR' ? 'Esta peça já está em outro item do pedido' : 'Part is already on another line'
      if (quantity === null) next[`${line.key}:quantity`] = locale === 'pt-BR' ? 'A quantidade mínima é 1' : 'At least 1'
      if (unitCostCents === null) next[`${line.key}:unitCost`] = locale === 'pt-BR' ? 'Informe o custo' : 'Enter a cost'
      seen.add(line.partId)
      if (line.partId && quantity !== null && unitCostCents !== null) payload.push({ partId: line.partId, quantity, unitCostCents })
    }
    setErrors(next)
    if (hasErrors(next)) return

    setBusy(true)
    setFormError(null)
    const response = await managePurchaseOrder({
      action: order ? 'update' : 'create',
      ...(order ? { purchaseOrderId: order.id, expectedUpdatedAt: order.updatedAt } : { rooftopId }),
      reference: reference.trim(),
      supplier: supplier.trim(),
      lines: payload,
      idempotencyKey,
    })
    setBusy(false)
    if (!response.success) {
      setFormError(response.error)
      if (response.rejected) setIdempotencyKey(`parts-desk:po:${crypto.randomUUID()}`)
      return
    }
    onSaved(response.data.managePartsPurchaseOrder.id)
  }

  return (
    <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value) }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-md sm:rounded-md sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{order ? `${locale === 'pt-BR' ? 'Editar pedido' : 'Edit'} ${order.reference}` : (locale === 'pt-BR' ? 'Novo pedido de compra' : 'New purchase order')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {!order && rooftops.length > 1 && (
              <FormField id="po-rooftop" label={locale === 'pt-BR' ? 'Loja' : 'Rooftop'} error={errors.rooftopId} className="sm:col-span-2">
                <Select value={rooftopId} onValueChange={value => { setRooftopId(value); setLines([newLine()]); setErrors(current => ({ ...current, rooftopId: undefined })) }}>
                  <SelectTrigger id="po-rooftop" className="h-11 rounded-[4px] px-3 text-[13px] sm:h-9" aria-invalid={Boolean(errors.rooftopId)}><SelectValue placeholder={locale === 'pt-BR' ? 'Selecione a loja' : 'Select rooftop'} /></SelectTrigger>
                  <SelectContent>{rooftops.map(rooftop => <SelectItem key={rooftop.id} value={rooftop.id}>{rooftop.name || rooftop.id}</SelectItem>)}</SelectContent>
                </Select>
              </FormField>
            )}
            <FormField id="po-reference" label={locale === 'pt-BR' ? 'Número do pedido' : 'PO reference'} error={errors.reference}>
              <Input id="po-reference" className="h-11 rounded-[4px] text-[13px] font-mono uppercase sm:h-9" value={reference} maxLength={100} aria-invalid={Boolean(errors.reference)} onChange={event => { setReference(event.target.value); setErrors(current => ({ ...current, reference: undefined })) }} />
            </FormField>
            <FormField id="po-supplier" label={locale === 'pt-BR' ? 'Fornecedor' : 'Supplier'} error={errors.supplier}>
              <Input id="po-supplier" className="h-11 rounded-[4px] text-[13px] sm:h-9" value={supplier} maxLength={200} aria-invalid={Boolean(errors.supplier)} onChange={event => { setSupplier(event.target.value); setErrors(current => ({ ...current, supplier: undefined })) }} />
            </FormField>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 border-b pb-2">
              <p className="text-sm font-semibold">{locale === 'pt-BR' ? 'Itens' : 'Lines'} <span className="text-xs font-normal tabular-nums text-muted-foreground">{lines.length}</span></p>
              <Track>
                <Pill size="sm" className="h-11 sm:h-7" onClick={() => setLines(current => [...current, newLine()])} disabled={lines.length >= 200 || (!order && rooftops.length > 1 && !rooftopId)}>
                  <Plus />
                  {locale === 'pt-BR' ? 'Adicionar item' : 'Add line'}
                </Pill>
              </Track>
            </div>
            {errors.lines && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{errors.lines}</p>}
            {lines.map((line, index) => (
              <div key={line.key} className="grid min-w-0 gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_5.5rem_7.5rem_auto] sm:items-start sm:border-0 sm:p-0">
                <FormField id={`po-line-${line.key}-part`} label={`${locale === 'pt-BR' ? 'Peça' : 'Part'} ${index + 1}`} error={errors[`${line.key}:partId`]}>
                  <Select value={line.partId} onValueChange={value => updateLine(line.key, { partId: value })}>
                    <SelectTrigger id={`po-line-${line.key}-part`} className="h-11 rounded-[4px] px-3 text-[13px] min-w-0 sm:h-9" aria-invalid={Boolean(errors[`${line.key}:partId`])}>
                      <SelectValue placeholder={rooftopParts.length ? (locale === 'pt-BR' ? 'Selecione a peça' : 'Select part') : (locale === 'pt-BR' ? 'Nenhuma peça cadastrada' : 'No parts')} />
                    </SelectTrigger>
                    <SelectContent>
                      {rooftopParts.map(part => (
                        <SelectItem key={part.id} value={part.id}>{part.partNumber} · {part.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField id={`po-line-${line.key}-qty`} label={locale === 'pt-BR' ? 'Qtd.' : 'Qty'} error={errors[`${line.key}:quantity`]}>
                  <Input id={`po-line-${line.key}-qty`} className="h-11 rounded-[4px] text-[13px] sm:h-9" inputMode="numeric" value={line.quantity} aria-invalid={Boolean(errors[`${line.key}:quantity`])} onChange={event => updateLine(line.key, { quantity: event.target.value })} />
                </FormField>
                <FormField id={`po-line-${line.key}-cost`} label={locale === 'pt-BR' ? 'Custo unitário' : 'Unit cost'} error={errors[`${line.key}:unitCost`]}>
                  <Input id={`po-line-${line.key}-cost`} className="h-11 rounded-[4px] text-[13px] sm:h-9" inputMode="decimal" placeholder={moneyPlaceholder} value={line.unitCost} aria-invalid={Boolean(errors[`${line.key}:unitCost`])} onChange={event => updateLine(line.key, { unitCost: event.target.value })} />
                </FormField>
                <div className="flex justify-end sm:pt-6">
                  <Track>
                    <Pill size="sm" variant="plain" className="h-11 sm:h-7" aria-label={`${locale === 'pt-BR' ? 'Remover item' : 'Remove line'} ${index + 1}`} onClick={() => setLines(current => current.filter(item => item.key !== line.key))} disabled={lines.length <= 1}>
                      <Trash2 />
                    </Pill>
                  </Track>
                </div>
              </div>
            ))}
            <p className="text-right text-[13px] tabular-nums"><span className="text-muted-foreground">{locale === 'pt-BR' ? 'Total' : 'Total'}</span> <span className="font-semibold">{new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode }).format(total / 100)}</span></p>
          </div>

          {formError && <Notice tone="bad">{formError}</Notice>}
          <DialogFooter className="sm:justify-end">
            <Track>
              <Pill variant="plain" className="h-11 sm:h-8" disabled={busy} onClick={() => onOpenChange(false)}>{locale === 'pt-BR' ? 'Cancelar' : 'Cancel'}</Pill>
              <Pill type="submit" variant="primary" className="h-11 sm:h-8" disabled={busy}>{busy ? (locale === 'pt-BR' ? 'Salvando…' : 'Saving…') : order ? (locale === 'pt-BR' ? 'Salvar rascunho' : 'Save draft') : (locale === 'pt-BR' ? 'Criar rascunho' : 'Create draft')}</Pill>
            </Track>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
