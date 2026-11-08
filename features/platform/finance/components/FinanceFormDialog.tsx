'use client'

import type { FormEvent, ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Notice, Pill, Track } from '@/features/platform/components/desk'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { financeLabel } from '../lib/display'
import { cn } from '@/lib/utils'

export type FinanceFormField = {
  name: string
  label: string
  type?: 'text' | 'money' | 'number' | 'textarea' | 'select' | 'checkbox' | 'readonly'
  options?: Array<{ value: string; label: string }>
  placeholder?: string
  description?: string
  maxLength?: number
  wide?: boolean
}

export type FieldErrors = Record<string, string>

/** Dialog form whose validation errors sit under the field they belong to. */
export function FinanceFormDialog({
  open,
  title,
  description,
  fields,
  values,
  errors,
  error,
  busy,
  submitLabel = 'Save',
  children,
  onValuesChange,
  onSubmit,
  onOpenChange,
}: {
  open: boolean
  title: string
  description?: string
  fields: FinanceFormField[]
  values: Record<string, string>
  errors: FieldErrors
  error?: string | null
  busy?: boolean
  submitLabel?: string
  children?: ReactNode
  onValuesChange: (values: Record<string, string>) => void
  onSubmit: () => void
  onOpenChange: (open: boolean) => void
}) {
  const { locale } = useLocale()
  const text = (value: string) => financeLabel(locale, value)
  const change = (name: string, value: string) => onValuesChange({ ...values, [name]: value })
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }
  return (
    <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value) }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map(field => {
              const id = `finance-${field.name}`
              const fieldError = errors[field.name]
              const describedBy = fieldError ? `${id}-error` : field.description ? `${id}-description` : undefined
              const wide = field.wide || field.type === 'textarea' || field.type === 'checkbox'
              return (
                <div key={field.name} className={cn('grid min-w-0 gap-1.5 text-sm', wide && 'sm:col-span-2')}>
                  {field.type !== 'checkbox' && (
                    <label htmlFor={id} className="text-[12px] font-medium text-muted-foreground">{text(field.label)}</label>
                  )}
                  {field.type === 'textarea' ? (
                    <Textarea id={id} rows={3} maxLength={field.maxLength} placeholder={field.placeholder ? text(field.placeholder) : undefined} value={values[field.name] || ''} aria-invalid={Boolean(fieldError)} aria-describedby={describedBy} onChange={event => change(field.name, event.target.value)} />
                  ) : field.type === 'select' ? (
                    <Select value={values[field.name] || ''} onValueChange={value => change(field.name, value)}>
                      <SelectTrigger id={id} className="h-10 w-full rounded-[4px]" aria-label={text(field.label)} aria-invalid={Boolean(fieldError)} aria-describedby={describedBy}>
                        <SelectValue placeholder={text(field.placeholder || 'Select')} />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options || []).map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : field.type === 'checkbox' ? (
                    <label htmlFor={id} className="flex min-h-11 items-start gap-2 rounded-md border bg-muted/40 p-3">
                      <input id={id} type="checkbox" className="mt-0.5 size-4" checked={values[field.name] === 'yes'} aria-invalid={Boolean(fieldError)} aria-describedby={describedBy} onChange={event => change(field.name, event.target.checked ? 'yes' : '')} />
                      <span>{text(field.label)}</span>
                    </label>
                  ) : field.type === 'readonly' ? (
                    <p id={id} className="flex h-10 items-center rounded-[4px] border bg-muted/40 px-3 text-[13px]">{values[field.name] || '-'}</p>
                  ) : (
                    <Input
                      id={id}
                      className="h-10 rounded-[4px]"
                      inputMode={field.type === 'money' ? 'decimal' : field.type === 'number' ? 'numeric' : undefined}
                      maxLength={field.maxLength ?? (field.type === 'money' ? 20 : undefined)}
                      placeholder={field.placeholder ? text(field.placeholder) : field.type === 'money' ? (locale === 'pt-BR' ? 'R$ 0,00' : '$0') : undefined}
                      value={values[field.name] || ''}
                      aria-invalid={Boolean(fieldError)}
                      aria-describedby={describedBy}
                      onChange={event => change(field.name, event.target.value)}
                    />
                  )}
                  {fieldError ? (
                    <p id={`${id}-error`} className="text-xs text-red-600 dark:text-red-400">{text(fieldError)}</p>
                  ) : field.description ? (
                    <p id={`${id}-description`} className="text-xs text-muted-foreground">{text(field.description)}</p>
                  ) : null}
                </div>
              )
            })}
          </div>
          {children}
          {error && <Notice tone="bad">{text(error)}</Notice>}
          <DialogFooter className="sm:justify-end">
            <Track>
              <Pill variant="plain" disabled={busy} onClick={() => onOpenChange(false)}>{text('Cancel')}</Pill>
              <Pill type="submit" variant="primary" disabled={busy}>{busy ? text('Saving…') : text(submitLabel)}</Pill>
            </Track>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
