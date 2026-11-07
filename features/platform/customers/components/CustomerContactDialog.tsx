'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { customerLabel } from '../lib/locale'
import { Notice, Pill, Track } from '@/features/platform/components/desk'
import { FormField } from '@/features/platform/crm/components/FormField'

export type CustomerContactValues = { firstName: string; lastName: string; primaryEmail: string; primaryPhone: string }

export function CustomerContactDialog({
  open,
  onOpenChange,
  initialValues,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialValues: CustomerContactValues
  onSubmit: (values: CustomerContactValues) => Promise<string | null>
}) {
  const { locale } = useLocale()
  const text = (value: string) => customerLabel(locale, value)
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerContactValues, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (open && !wasOpen.current) {
      setValues(initialValues)
      setErrors({})
      setFormError(null)
    }
    wasOpen.current = open
  }, [open, initialValues])

  const set = (key: keyof CustomerContactValues, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: undefined, ...(key === 'primaryEmail' || key === 'primaryPhone' ? { primaryEmail: undefined, primaryPhone: undefined } : {}) }))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const found: Partial<Record<keyof CustomerContactValues, string>> = {}
    if (!values.firstName.trim()) found.firstName = text('Required')
    if (!values.lastName.trim()) found.lastName = text('Required')
    const email = values.primaryEmail.trim()
    const digits = values.primaryPhone.replace(/\D/g, '')
    if (!email && !values.primaryPhone.trim()) found.primaryPhone = text('Email or phone required')
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) found.primaryEmail = text('Invalid email')
    if (values.primaryPhone.trim() && (digits.length < 7 || digits.length > 15)) found.primaryPhone = text('Invalid phone')
    setErrors(found)
    if (Object.values(found).some(Boolean)) return
    setBusy(true)
    setFormError(null)
    const error = await onSubmit({ firstName: values.firstName.trim(), lastName: values.lastName.trim(), primaryEmail: email, primaryPhone: values.primaryPhone.trim() })
    setBusy(false)
    if (error) setFormError(error)
  }

  const fieldClass = 'h-11 sm:h-9'

  return (
    <Dialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next) }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{text('Edit contact')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="customer-first-name" label={text('First name')} error={errors.firstName}>
              <Input id="customer-first-name" className={fieldClass} maxLength={100} value={values.firstName} aria-invalid={Boolean(errors.firstName)} onChange={event => set('firstName', event.target.value)} />
            </FormField>
            <FormField id="customer-last-name" label={text('Last name')} error={errors.lastName}>
              <Input id="customer-last-name" className={fieldClass} maxLength={100} value={values.lastName} aria-invalid={Boolean(errors.lastName)} onChange={event => set('lastName', event.target.value)} />
            </FormField>
            <FormField id="customer-email" label={text('Email')} error={errors.primaryEmail}>
              <Input id="customer-email" type="email" inputMode="email" className={fieldClass} maxLength={320} value={values.primaryEmail} aria-invalid={Boolean(errors.primaryEmail)} onChange={event => set('primaryEmail', event.target.value)} />
            </FormField>
            <FormField id="customer-phone" label={text('Phone')} error={errors.primaryPhone}>
              <Input id="customer-phone" type="tel" inputMode="tel" className={fieldClass} maxLength={50} value={values.primaryPhone} aria-invalid={Boolean(errors.primaryPhone)} onChange={event => set('primaryPhone', event.target.value)} />
            </FormField>
          </div>
          {formError && <Notice tone="bad">{formError}</Notice>}
          <DialogFooter className="sm:justify-end">
            <Track>
              <Pill variant="plain" className="h-11 sm:h-8" disabled={busy} onClick={() => onOpenChange(false)}>{text('Cancel')}</Pill>
              <Pill type="submit" variant="primary" className="h-11 sm:h-8" disabled={busy}>{busy ? text('Saving…') : text('Save')}</Pill>
            </Track>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
