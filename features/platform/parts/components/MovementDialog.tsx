'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { ArrowRight } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Facts, Notice, Pill, Segmented, Track } from '@/features/platform/components/desk'

import { recordMovement } from '../actions'
import { MOVEMENT_LABEL, RO_MOVEMENT_TYPES, partsLabel, previewMovement, repairOrderLabel, type MovementType, type OpenRepairOrder, type Part } from '../lib/types'
import { FormField, hasErrors, parseWhole, type FieldErrors } from './FormField'

function Change({ from, to }: { from: number | null; to: number | null }) {
  const { locale } = useLocale()
  const start = Number(from || 0)
  if (to === null || to === start) return <>{start}</>
  return (
    <span className="inline-flex items-center gap-1">
      {start}
      <ArrowRight aria-label={locale === 'pt-BR' ? 'passa para' : 'becomes'} className="size-3.5 text-muted-foreground" />
      <span className="font-semibold">{to}</span>
    </span>
  )
}

const QUANTITY_LABEL: Partial<Record<MovementType, string>> = {
  count: 'Counted on hand',
  'po-order': 'Quantity on order',
  'po-cancel': 'Quantity to cancel',
}

const DEFAULT_REFERENCE: Partial<Record<MovementType, string>> = {
  adjustment: 'Adjustment',
  count: 'Cycle count',
}

export function MovementDialog({
  open,
  type,
  part,
  repairOrders,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  type: MovementType | null
  part: Part
  repairOrders: OpenRepairOrder[]
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { locale } = useLocale()
  const [quantity, setQuantity] = useState('')
  const [direction, setDirection] = useState<'add' | 'remove'>('add')
  const [serviceOrderId, setServiceOrderId] = useState('')
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState('')

  useEffect(() => {
    if (!open || !type) return
    setQuantity(type === 'count' ? String(part.quantity ?? 0) : '')
    setDirection('add')
    setServiceOrderId('')
    setReference(DEFAULT_REFERENCE[type] || '')
    setReason('')
    setErrors({})
    setFormError(null)
    setIdempotencyKey(`parts-desk:movement:${crypto.randomUUID()}`)
  }, [open, type, part.quantity])

  const needsRo = type ? RO_MOVEMENT_TYPES.has(type) : false
  const parsed = parseWhole(quantity, type === 'count' ? 0 : 1)
  const delta = type === 'adjustment' && parsed !== null ? (direction === 'add' ? parsed : -parsed) : undefined
  const preview = useMemo(
    () => (type && parsed !== null ? previewMovement(part, type, parsed, delta) : null),
    [part, type, parsed, delta],
  )

  if (!type) return null

  const chooseRo = (id: string) => {
    setServiceOrderId(id)
    setErrors(current => ({ ...current, serviceOrderId: undefined }))
    const order = repairOrders.find(item => item.id === id)
    if (order && (!reference.trim() || reference.startsWith('RO '))) setReference(`RO ${order.invoiceNumber || order.id.slice(-8).toUpperCase()}`)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: FieldErrors = {}
    if (parsed === null) next.quantity = locale === 'pt-BR' ? (type === 'count' ? 'Informe um número inteiro igual ou maior que zero' : 'Informe um número inteiro igual ou maior que 1') : (type === 'count' ? 'Whole number of 0 or more' : 'Whole number of at least 1')
    if (needsRo && !serviceOrderId) next.serviceOrderId = locale === 'pt-BR' ? 'Selecione uma ordem de serviço' : 'Choose a repair order'
    if (!reference.trim()) next.reference = locale === 'pt-BR' ? 'Informe uma referência' : 'Reference is required'
    else if (reference.trim().length > 200) next.reference = locale === 'pt-BR' ? 'Use no máximo 200 caracteres' : 'At most 200 characters'
    if (!reason.trim()) next.reason = locale === 'pt-BR' ? 'Informe o motivo' : 'Reason is required'
    if (!next.quantity && preview?.error) next.quantity = preview.error
    setErrors(next)
    if (hasErrors(next) || parsed === null) return

    setBusy(true)
    setFormError(null)
    const response = await recordMovement({
      partId: part.id,
      movementType: type,
      quantity: parsed,
      ...(type === 'adjustment' ? { quantityDelta: delta } : {}),
      ...(needsRo ? { serviceOrderId } : {}),
      reference: reference.trim(),
      reason: reason.trim(),
      idempotencyKey,
    })
    setBusy(false)
    if (!response.success) {
      setFormError(response.error)
      if (response.rejected) setIdempotencyKey(`parts-desk:movement:${crypto.randomUUID()}`)
      return
    }
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value) }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-md sm:rounded-md sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{partsLabel(locale, MOVEMENT_LABEL[type])} · {part.partNumber}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          {needsRo && (
            <FormField id="movement-ro" label={locale === 'pt-BR' ? 'Ordem de serviço' : 'Repair order'} error={errors.serviceOrderId}>
              <Select value={serviceOrderId} onValueChange={chooseRo}>
                <SelectTrigger id="movement-ro" className="h-11 rounded-[4px] px-3 text-[13px] sm:h-9" aria-invalid={Boolean(errors.serviceOrderId)}>
                  <SelectValue placeholder={repairOrders.length ? (locale === 'pt-BR' ? 'Selecione a OS' : 'Select repair order') : (locale === 'pt-BR' ? 'Nenhuma OS em aberto' : 'No open repair orders')} />
                </SelectTrigger>
                <SelectContent>
                  {repairOrders.map(order => <SelectItem key={order.id} value={order.id}>{repairOrderLabel(order)}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
          )}
          {type === 'adjustment' && (
            <Segmented<'add' | 'remove'>
              label={locale === 'pt-BR' ? 'Tipo de ajuste' : 'Adjustment direction'}
              value={direction}
              onChange={setDirection}
              block
              options={[{ value: 'add', label: locale === 'pt-BR' ? 'Adicionar ao estoque' : 'Add stock' }, { value: 'remove', label: locale === 'pt-BR' ? 'Retirar do estoque' : 'Remove stock' }]}
            />
          )}
          <FormField id="movement-quantity" label={partsLabel(locale, QUANTITY_LABEL[type] || 'Quantity')} error={errors.quantity}>
            <Input
              id="movement-quantity"
              className="h-11 rounded-[4px] text-[13px] sm:h-9"
              inputMode="numeric"
              value={quantity}
              aria-invalid={Boolean(errors.quantity)}
              onChange={event => { setQuantity(event.target.value); setErrors(current => ({ ...current, quantity: undefined })) }}
            />
          </FormField>
          <FormField id="movement-reference" label={locale === 'pt-BR' ? 'Referência' : 'Reference'} error={errors.reference}>
            <Input
              id="movement-reference"
              className="h-11 rounded-[4px] text-[13px] sm:h-9"
              value={reference}
              maxLength={200}
              placeholder={type === 'receipt' ? (locale === 'pt-BR' ? 'Romaneio ou nota fiscal' : 'Packing slip or invoice') : undefined}
              aria-invalid={Boolean(errors.reference)}
              onChange={event => { setReference(event.target.value); setErrors(current => ({ ...current, reference: undefined })) }}
            />
          </FormField>
          <FormField id="movement-reason" label={locale === 'pt-BR' ? 'Motivo' : 'Reason'} error={errors.reason}>
            <Textarea
              id="movement-reason"
              className="rounded-[4px] text-[13px]"
              rows={2}
              value={reason}
              maxLength={1000}
              aria-invalid={Boolean(errors.reason)}
              onChange={event => { setReason(event.target.value); setErrors(current => ({ ...current, reason: undefined })) }}
            />
          </FormField>
          <Facts
            items={[
              { label: locale === 'pt-BR' ? 'Em estoque' : 'On hand', value: <Change from={part.quantity} to={preview && !preview.error ? preview.onHand : null} />, mono: true },
              { label: locale === 'pt-BR' ? 'Reservado' : 'Committed', value: <Change from={part.committedQuantity} to={preview && !preview.error ? preview.committed : null} />, mono: true },
              { label: locale === 'pt-BR' ? 'Em pedido' : 'On order', value: <Change from={part.onOrderQuantity} to={preview && !preview.error ? preview.onOrder : null} />, mono: true },
            ]}
          />
          {formError && <Notice tone="bad">{formError}</Notice>}
          <DialogFooter className="sm:justify-end">
            <Track>
              <Pill variant="plain" className="h-11 sm:h-8" disabled={busy} onClick={() => onOpenChange(false)}>{locale === 'pt-BR' ? 'Cancelar' : 'Cancel'}</Pill>
              <Pill type="submit" variant="primary" className="h-11 sm:h-8" disabled={busy}>{busy ? (locale === 'pt-BR' ? 'Salvando…' : 'Saving…') : `${locale === 'pt-BR' ? 'Registrar' : 'Record'} ${partsLabel(locale, MOVEMENT_LABEL[type]).toLowerCase()}`}</Pill>
            </Track>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
