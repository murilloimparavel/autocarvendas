'use client'

import type { FormEvent } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Notice, Pill, Track } from './desk'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { translateSchemaLabel } from '@/features/i18n/messages'

export type OperatorActionField = {
  name: string
  label: string
  type?: 'text' | 'number' | 'email' | 'datetime-local' | 'date' | 'textarea' | 'select' | 'checkbox'
  required?: boolean
  min?: number | string
  max?: number | string
  step?: number
  maxLength?: number
  placeholder?: string
  description?: string
  options?: Array<{ value: string; label: string }>
}

export function OperatorActionDialog({
  open,
  title,
  description,
  fields,
  values,
  error,
  busy = false,
  submitLabel = 'Save',
  onValuesChange,
  onSubmit,
  onOpenChange,
}: {
  open: boolean
  title: string
  description?: string
  fields: OperatorActionField[]
  values: Record<string, string>
  error?: string | null
  busy?: boolean
  submitLabel?: string
  onValuesChange: (values: Record<string, string>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onOpenChange: (open: boolean) => void
}) {
  const { locale } = useLocale()
  const text = (value: string) => translateSchemaLabel(locale, value)
  const change = (name: string, value: string) => onValuesChange({ ...values, [name]: value })
  return <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value) }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{text(description)}</DialogDescription>}
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map(field => <label key={field.name} htmlFor={`operator-${field.name}`} className={`grid gap-1.5 text-sm ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
            <span className="text-[12px] font-medium text-muted-foreground">{text(field.label)}</span>
            {field.type === 'textarea' ? <Textarea id={`operator-${field.name}`} required={field.required ?? true} maxLength={field.maxLength} placeholder={field.placeholder ? text(field.placeholder) : undefined} value={values[field.name] || ''} onChange={event => change(field.name, event.target.value)} rows={3} /> :
              field.type === 'select' ? <Select required={field.required ?? true} value={values[field.name] || ''} onValueChange={value => change(field.name, value)}>
                <SelectTrigger id={`operator-${field.name}`} aria-label={text(field.label)}><SelectValue placeholder={text(field.placeholder || `Select ${field.label.toLowerCase()}`)} /></SelectTrigger>
                <SelectContent>{(field.options || []).map(option => <SelectItem key={option.value} value={option.value}>{text(option.label)}</SelectItem>)}</SelectContent>
              </Select> :
                field.type === 'checkbox' ? <span className="flex items-start gap-2 min-h-10 rounded-[4px] border bg-muted/40 p-3"><input id={`operator-${field.name}`} type="checkbox" required={field.required ?? true} checked={values[field.name] === 'yes'} onChange={event => change(field.name, event.target.checked ? 'yes' : '')} /><span>{text(field.description || field.label)}</span></span> :
                  <Input id={`operator-${field.name}`} type={field.type || 'text'} required={field.required ?? true} min={field.min} max={field.max} step={field.step} maxLength={field.maxLength} placeholder={field.placeholder ? text(field.placeholder) : undefined} value={values[field.name] || ''} onChange={event => change(field.name, event.target.value)} />}
            {field.description && field.type !== 'checkbox' && <span className="text-xs text-muted-foreground">{text(field.description)}</span>}
          </label>)}
        </div>
        {error && <Notice tone="bad">{text(error)}</Notice>}
        <DialogFooter className="sm:justify-end">
          <Track>
            <Pill variant="plain" disabled={busy} onClick={() => onOpenChange(false)}>{text('Cancel')}</Pill>
            <Pill type="submit" variant="primary" disabled={busy}>{text(busy ? 'Saving…' : submitLabel)}</Pill>
          </Track>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
