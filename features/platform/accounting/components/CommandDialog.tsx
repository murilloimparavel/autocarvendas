'use client'

import type { FormEvent, ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Notice, Pill, Track } from '@/features/platform/components/desk'
import { useLocale } from '@/features/i18n/LocaleProvider'

export type CommandField = {
  name: string
  label: string
  type?: 'text' | 'textarea' | 'select' | 'money' | 'date'
  options?: Array<{ value: string; label: string }>
  placeholder?: string
  maxLength?: number
  disabled?: boolean
  wide?: boolean
  hint?: string
}

export type FieldErrors = Record<string, string>

/** Form dialog whose field errors render under each field. */
export function CommandDialog({
  open,
  title,
  description,
  fields,
  values,
  fieldErrors = {},
  error,
  busy = false,
  submitLabel = 'Save',
  danger = false,
  children,
  onValuesChange,
  onSubmit,
  onOpenChange,
}: {
  open: boolean
  title: string
  description?: string
  fields: CommandField[]
  values: Record<string, string>
  fieldErrors?: FieldErrors
  error?: string | null
  busy?: boolean
  submitLabel?: string
  danger?: boolean
  children?: ReactNode
  onValuesChange: (values: Record<string, string>) => void
  onSubmit: () => void
  onOpenChange: (open: boolean) => void
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const change = (name: string, value: string) => onValuesChange({ ...values, [name]: value })
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!busy) onSubmit()
  }
  return (
    <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value) }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} noValidate className="min-w-0 space-y-4">
          {children}
          {fields.length > 0 && (
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              {fields.map(field => {
                const id = `command-${field.name}`
                const fieldError = fieldErrors[field.name]
                const describedBy = fieldError ? `${id}-error` : undefined
                return (
                  <div key={field.name} className={`grid min-w-0 gap-1.5 text-sm ${field.wide || field.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
                    <label htmlFor={id} className="text-[12px] font-medium text-muted-foreground">
                      {field.label}
                    </label>
                    {field.type === 'textarea' ? (
                      <Textarea
                        id={id}
                        rows={3}
                        maxLength={field.maxLength}
                        placeholder={field.placeholder}
                        disabled={field.disabled || busy}
                        aria-invalid={Boolean(fieldError)}
                        aria-describedby={describedBy}
                        value={values[field.name] || ''}
                        onChange={event => change(field.name, event.target.value)}
                      />
                    ) : field.type === 'select' ? (
                      <Select value={values[field.name] || ''} onValueChange={value => change(field.name, value)} disabled={field.disabled || busy}>
                        <SelectTrigger id={id} className="h-11 w-full min-w-0 sm:h-9" aria-invalid={Boolean(fieldError)} aria-describedby={describedBy}>
                          <SelectValue placeholder={field.placeholder || 'Select'} />
                        </SelectTrigger>
                        <SelectContent>
                          {(field.options || []).map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={id}
                        type={field.type === 'date' ? 'date' : 'text'}
                        inputMode={field.type === 'money' ? 'decimal' : undefined}
                        maxLength={field.maxLength}
                        placeholder={field.placeholder ?? (field.type === 'money' ? '$0.00' : undefined)}
                        disabled={field.disabled || busy}
                        aria-invalid={Boolean(fieldError)}
                        aria-describedby={describedBy}
                        className="h-11 sm:h-9"
                        value={values[field.name] || ''}
                        onChange={event => change(field.name, event.target.value)}
                      />
                    )}
                    {fieldError ? (
                      <span id={`${id}-error`} className="text-xs text-red-600 dark:text-red-400">{fieldError}</span>
                    ) : field.hint ? (
                      <span className="text-xs text-muted-foreground">{field.hint}</span>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
          {error && <Notice tone="bad">{error}</Notice>}
          <DialogFooter className="sm:justify-end">
            <Track>
              <Pill variant="plain" className="h-11 sm:h-8" disabled={busy} onClick={() => onOpenChange(false)}>{pt ? 'Cancelar' : 'Cancel'}</Pill>
              <Pill type="submit" variant={danger ? 'danger' : 'primary'} className="h-11 sm:h-8" disabled={busy}>
                {busy ? (pt ? 'Salvando…' : 'Saving…') : submitLabel}
              </Pill>
            </Track>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
