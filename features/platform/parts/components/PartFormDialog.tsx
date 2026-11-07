'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Notice, Pill, Track } from '@/features/platform/components/desk'
import { formatCentsForInput, parseDollarsToCents } from '@/features/platform/deals/lib/moneyInput'

import { savePart } from '../actions'
import type { Part, PartsRooftop } from '../lib/types'
import { FormField, hasErrors, parseWhole, type FieldErrors } from './FormField'

type Values = {
  rooftopId: string
  partNumber: string
  description: string
  binLocation: string
  minimumQuantity: string
  cost: string
  price: string
  supplier: string
  supplierPartNumber: string
}

function initialValues(part: Part | null, rooftops: PartsRooftop[], locale: 'pt-BR' | 'en-US'): Values {
  return {
    rooftopId: part?.rooftop?.id || (rooftops.length === 1 ? rooftops[0].id : ''),
    partNumber: part?.partNumber || '',
    description: part?.description || '',
    binLocation: part?.binLocation || '',
    minimumQuantity: part ? String(part.minimumQuantity ?? 0) : '0',
    cost: part ? formatCentsForInput(part.costCents, locale) : '',
    price: part ? formatCentsForInput(part.priceCents, locale) : '',
    supplier: part?.supplier || '',
    supplierPartNumber: part?.supplierPartNumber || '',
  }
}

/** Create a part (part === null) or edit one. Saves through configurePart. */
export function PartFormDialog({
  open,
  part,
  rooftops,
  currencyCode,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  part: Part | null
  rooftops: PartsRooftop[]
  currencyCode: string
  onOpenChange: (open: boolean) => void
  onSaved: (partId: string) => void
}) {
  const { locale } = useLocale()
  const moneyPlaceholder = new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode }).format(0)
  const [values, setValues] = useState<Values>(() => initialValues(part, rooftops, locale))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState('')

  useEffect(() => {
    if (!open) return
    setValues(initialValues(part, rooftops, locale))
    setErrors({})
    setFormError(null)
    setIdempotencyKey(`parts-desk:part:${crypto.randomUUID()}`)
    // Reset only when the dialog opens; later prop changes must not wipe what was typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, locale])

  const set = (name: keyof Values, value: string) => {
    setValues(current => ({ ...current, [name]: value }))
    setErrors(current => ({ ...current, [name]: undefined }))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: FieldErrors = {}
    const costCents = parseDollarsToCents(values.cost, locale)
    const priceCents = parseDollarsToCents(values.price, locale)
    const minimumQuantity = parseWhole(values.minimumQuantity || '0', 0)
    if (!part && !values.rooftopId) next.rooftopId = 'Choose a rooftop'
    if (!values.partNumber.trim()) next.partNumber = 'Part number is required'
    else if (values.partNumber.trim().length > 100) next.partNumber = 'At most 100 characters'
    if (!values.description.trim()) next.description = 'Description is required'
    if (values.binLocation.trim().length > 100) next.binLocation = 'At most 100 characters'
    if (minimumQuantity === null) next.minimumQuantity = 'Whole number of 0 or more'
    if (costCents === null) next.cost = locale === 'pt-BR' ? 'Informe um valor em reais e centavos' : 'Enter dollars and cents'
    if (priceCents === null) next.price = locale === 'pt-BR' ? 'Informe um valor em reais e centavos' : 'Enter dollars and cents'
    else if (!values.price.trim()) next.price = 'Price is required'
    setErrors(next)
    if (hasErrors(next)) return

    setBusy(true)
    setFormError(null)
    const response = await savePart({
      ...(part ? { partId: part.id, expectedUpdatedAt: part.updatedAt } : { rooftopId: values.rooftopId }),
      partNumber: values.partNumber.trim(),
      description: values.description.trim(),
      binLocation: values.binLocation.trim(),
      minimumQuantity: minimumQuantity ?? 0,
      costCents: costCents ?? 0,
      priceCents: priceCents ?? 0,
      supplier: values.supplier.trim(),
      supplierPartNumber: values.supplierPartNumber.trim(),
      idempotencyKey,
    })
    setBusy(false)
    if (!response.success) {
      if ('field' in response && response.field === 'partNumber') setErrors({ partNumber: response.error })
      else setFormError(response.error)
      // A rejected command applied nothing, so the next attempt may use a fresh key.
      if (response.rejected) setIdempotencyKey(`parts-desk:part:${crypto.randomUUID()}`)
      return
    }
    onSaved(response.data.configurePart.id)
  }

  return (
    <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value) }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-md sm:rounded-md sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{part ? `Edit ${part.partNumber}` : 'New part'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {!part && rooftops.length > 1 && (
              <FormField id="part-rooftop" label="Rooftop" error={errors.rooftopId} className="sm:col-span-2">
                <Select value={values.rooftopId} onValueChange={value => set('rooftopId', value)}>
                  <SelectTrigger id="part-rooftop" className="h-11 rounded-[4px] px-3 text-[13px] sm:h-9" aria-invalid={Boolean(errors.rooftopId)}>
                    <SelectValue placeholder="Select rooftop" />
                  </SelectTrigger>
                  <SelectContent>
                    {rooftops.map(rooftop => <SelectItem key={rooftop.id} value={rooftop.id}>{rooftop.name || rooftop.id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
            )}
            <FormField id="part-number" label="Part number" error={errors.partNumber}>
              <Input id="part-number" className="h-11 rounded-[4px] text-[13px] font-mono uppercase sm:h-9" value={values.partNumber} maxLength={100} aria-invalid={Boolean(errors.partNumber)} onChange={event => set('partNumber', event.target.value)} />
            </FormField>
            <FormField id="part-bin" label="Bin location" error={errors.binLocation}>
              <Input id="part-bin" className="h-11 rounded-[4px] text-[13px] sm:h-9" value={values.binLocation} maxLength={100} onChange={event => set('binLocation', event.target.value)} />
            </FormField>
            <FormField id="part-description" label="Description" error={errors.description} className="sm:col-span-2">
              <Input id="part-description" className="h-11 rounded-[4px] text-[13px] sm:h-9" value={values.description} maxLength={1000} aria-invalid={Boolean(errors.description)} onChange={event => set('description', event.target.value)} />
            </FormField>
            <FormField id="part-cost" label={locale === 'pt-BR' ? 'Custo' : 'Cost'} error={errors.cost}>
              <Input id="part-cost" className="h-11 rounded-[4px] text-[13px] sm:h-9" inputMode="decimal" placeholder={moneyPlaceholder} value={values.cost} aria-invalid={Boolean(errors.cost)} onChange={event => set('cost', event.target.value)} />
            </FormField>
            <FormField id="part-price" label={locale === 'pt-BR' ? 'Preço de venda' : 'Retail price'} error={errors.price}>
              <Input id="part-price" className="h-11 rounded-[4px] text-[13px] sm:h-9" inputMode="decimal" placeholder={moneyPlaceholder} value={values.price} aria-invalid={Boolean(errors.price)} onChange={event => set('price', event.target.value)} />
            </FormField>
            <FormField id="part-reorder" label="Reorder point" error={errors.minimumQuantity}>
              <Input id="part-reorder" className="h-11 rounded-[4px] text-[13px] sm:h-9" inputMode="numeric" value={values.minimumQuantity} aria-invalid={Boolean(errors.minimumQuantity)} onChange={event => set('minimumQuantity', event.target.value)} />
            </FormField>
            <FormField id="part-supplier" label="Supplier">
              <Input id="part-supplier" className="h-11 rounded-[4px] text-[13px] sm:h-9" value={values.supplier} maxLength={200} onChange={event => set('supplier', event.target.value)} />
            </FormField>
            <FormField id="part-supplier-number" label="Supplier part number" className="sm:col-span-2">
              <Input id="part-supplier-number" className="h-11 rounded-[4px] text-[13px] font-mono sm:h-9" value={values.supplierPartNumber} maxLength={100} onChange={event => set('supplierPartNumber', event.target.value)} />
            </FormField>
          </div>
          {formError && <Notice tone="bad">{formError}</Notice>}
          <DialogFooter className="sm:justify-end">
            <Track>
              <Pill variant="plain" className="h-11 sm:h-8" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Pill>
              <Pill type="submit" variant="primary" className="h-11 sm:h-8" disabled={busy}>{busy ? 'Saving…' : part ? 'Save part' : 'Create part'}</Pill>
            </Track>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
