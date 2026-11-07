'use client'

import type { FormEvent, ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Notice, Pill, Track } from '@/features/platform/components/desk'
import { useLocale } from '@/features/i18n/LocaleProvider'

export type InventoryFormField = {
  name: string
  label: string
  type?: 'text' | 'number' | 'money' | 'date' | 'datetime-local' | 'textarea' | 'select' | 'checkbox'
  required?: boolean
  maxLength?: number
  min?: number
  max?: number
  placeholder?: string
  options?: ReadonlyArray<{ value: string; label: string }>
  wide?: boolean
  disabled?: boolean
  hint?: string
}

export type FieldErrors = Record<string, string>

const labelClass = 'text-[12px] font-medium text-muted-foreground'
/** Radix Select cannot hold an empty value; optional selects use this sentinel for "none". */
export const NONE_VALUE = '__none'

export function InventoryFormDialog({
  open,
  title,
  description,
  fields,
  values,
  errors = {},
  formError,
  busy = false,
  submitLabel = 'Save',
  children,
  onValuesChange,
  onSubmit,
  onOpenChange,
}: {
  open: boolean
  title: string
  description?: string
  fields: InventoryFormField[]
  values: Record<string, string>
  errors?: FieldErrors
  formError?: string | null
  busy?: boolean
  submitLabel?: string
  children?: ReactNode
  onValuesChange: (values: Record<string, string>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onOpenChange: (open: boolean) => void
}) {
  const { locale, t } = useLocale()
  const change = (name: string, value: string) => onValuesChange({ ...values, [name]: value })
  return (
    <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value) }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription className="text-[13px]">{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map(field => {
              const id = `inventory-form-${field.name}`
              const error = errors[field.name]
              const describedBy = error ? `${id}-error` : field.hint ? `${id}-hint` : undefined
              const value = values[field.name] ?? ''
              return (
                <div key={field.name} className={`grid content-start gap-1.5 text-sm ${field.wide || field.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
                  {field.type !== 'checkbox' && <label htmlFor={id} className={labelClass}>{field.label}</label>}
                  {field.type === 'textarea' ? (
                    <Textarea id={id} rows={3} maxLength={field.maxLength} placeholder={field.placeholder} disabled={field.disabled || busy} aria-invalid={Boolean(error)} aria-describedby={describedBy} value={value} onChange={event => change(field.name, event.target.value)} />
                  ) : field.type === 'select' ? (
                    <Select value={value || (field.required === false ? NONE_VALUE : '')} onValueChange={next => change(field.name, next === NONE_VALUE ? '' : next)} disabled={field.disabled || busy}>
                      <SelectTrigger id={id} aria-label={field.label} aria-invalid={Boolean(error)} aria-describedby={describedBy} className="max-sm:h-11">
                        <SelectValue placeholder={field.placeholder || t('choose')} />
                      </SelectTrigger>
                      <SelectContent>
                        {field.required === false && <SelectItem value={NONE_VALUE}>{t('none')}</SelectItem>}
                        {(field.options || []).map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : field.type === 'checkbox' ? (
                    <label htmlFor={id} className="flex min-h-11 items-center gap-2 rounded-[4px] border px-3 py-2">
                      <input id={id} type="checkbox" className="size-4" disabled={field.disabled || busy} checked={value === 'yes'} onChange={event => change(field.name, event.target.checked ? 'yes' : '')} />
                      <span>{field.label}</span>
                    </label>
                  ) : (
                    <Input
                      id={id}
                      type={field.type === 'money' ? 'text' : field.type || 'text'}
                      inputMode={field.type === 'money' ? 'decimal' : field.type === 'number' ? 'numeric' : undefined}
                      min={field.min}
                      max={field.max}
                      maxLength={field.maxLength}
                      placeholder={field.placeholder ?? (field.type === 'money' ? locale === 'pt-BR' ? '0,00' : '$0' : undefined)}
                      disabled={field.disabled || busy}
                      aria-invalid={Boolean(error)}
                      aria-describedby={describedBy}
                      className="max-sm:h-11"
                      value={value}
                      onChange={event => change(field.name, event.target.value)}
                    />
                  )}
                  {error ? <p id={`${id}-error`} className="text-xs text-red-600 dark:text-red-400">{error}</p>
                    : field.hint ? <p id={`${id}-hint`} className="text-xs text-muted-foreground">{field.hint}</p> : null}
                </div>
              )
            })}
          </div>
          {children}
          {formError && <Notice tone="bad">{formError}</Notice>}
          <DialogFooter className="sm:justify-end">
            <Track>
              <Pill variant="plain" className="max-sm:h-11" disabled={busy} onClick={() => onOpenChange(false)}>{t('cancel')}</Pill>
              <Pill type="submit" variant="primary" className="max-sm:h-11" disabled={busy}>{busy ? t('saving') : submitLabel}</Pill>
            </Track>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
