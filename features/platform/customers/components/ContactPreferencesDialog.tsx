'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Notice, Pill, Track } from '@/features/platform/components/desk'
import { FormField } from '@/features/platform/crm/components/FormField'
import { customerLabel } from '../lib/locale'

export type PreferenceValues = {
  emailConsent: boolean
  smsConsent: boolean
  phoneConsent: boolean
  emailSuppressed: boolean
  smsSuppressed: boolean
  phoneSuppressed: boolean
  preferredChannel: string
  source: string
  reason: string
}

const CHANNELS = [
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'SMS' },
  { key: 'phone', label: 'Phone' },
] as const

export const PREFERENCE_SOURCES = [
  { value: 'operator-recorded', label: 'Recorded by staff' },
  { value: 'customer-request', label: 'Customer request' },
  { value: 'phone-call', label: 'Phone call' },
  { value: 'in-person', label: 'In person' },
  { value: 'written', label: 'Written consent' },
]

export function ContactPreferencesDialog({
  open,
  onOpenChange,
  initialValues,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialValues: PreferenceValues
  onSubmit: (values: PreferenceValues) => Promise<string | null>
}) {
  const { locale } = useLocale()
  const text = (value: string) => customerLabel(locale, value)
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<{ preferredChannel?: string; reason?: string }>({})
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

  const toggle = (key: keyof PreferenceValues, checked: boolean) => {
    setValues(prev => ({ ...prev, [key]: checked }))
    setErrors(prev => ({ ...prev, preferredChannel: undefined }))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const found: { preferredChannel?: string; reason?: string } = {}
    const channel = values.preferredChannel
    if (channel !== 'none') {
      const consent = values[`${channel}Consent` as keyof PreferenceValues]
      const suppressed = values[`${channel}Suppressed` as keyof PreferenceValues]
      if (!consent || suppressed) found.preferredChannel = text('Needs consent and no suppression')
    }
    if (!values.reason.trim()) found.reason = text('Required')
    else if (values.reason.length > 1000) found.reason = text('At most 1000 characters')
    setErrors(found)
    if (found.preferredChannel || found.reason) return
    setBusy(true)
    setFormError(null)
    const error = await onSubmit({ ...values, reason: values.reason.trim() })
    setBusy(false)
    if (error) setFormError(error)
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next) }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{text('Contact preferences')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="overflow-hidden rounded-md border">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b bg-muted/40 px-3 py-2 text-[12px] font-medium text-muted-foreground">
              <span>{text('Channel')}</span><span>{text('Consent')}</span><span>{text('Suppressed')}</span>
            </div>
            {CHANNELS.map(channel => (
              <div key={channel.key} className="grid min-h-11 grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b px-3 py-1 last:border-b-0">
                <span className="text-sm">{channel.label}</span>
                <span className="flex w-16 justify-center">
                  <Checkbox
                    className="size-5"
                    checked={values[`${channel.key}Consent`]}
                    onCheckedChange={checked => toggle(`${channel.key}Consent`, checked === true)}
                    aria-label={`${text(channel.label)} ${text('consent')}`}
                  />
                </span>
                <span className="flex w-20 justify-center">
                  <Checkbox
                    className="size-5"
                    checked={values[`${channel.key}Suppressed`]}
                    onCheckedChange={checked => toggle(`${channel.key}Suppressed`, checked === true)}
                    aria-label={`${text(channel.label)} ${text('suppressed')}`}
                  />
                </span>
              </div>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="pref-channel" label={text('Preferred channel')} error={errors.preferredChannel}>
              <Select value={values.preferredChannel} onValueChange={value => { setValues(prev => ({ ...prev, preferredChannel: value })); setErrors(prev => ({ ...prev, preferredChannel: undefined })) }}>
                <SelectTrigger id="pref-channel" className="rounded-[4px] h-11 sm:h-9" aria-invalid={Boolean(errors.preferredChannel)}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{text('No outbound contact')}</SelectItem>
                  <SelectItem value="email">{text('Email')}</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="phone">{text('Phone')}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField id="pref-source" label={text('Source')}>
              <Select value={values.source} onValueChange={value => setValues(prev => ({ ...prev, source: value }))}>
                <SelectTrigger id="pref-source" className="rounded-[4px] h-11 sm:h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{PREFERENCE_SOURCES.map(source => <SelectItem key={source.value} value={source.value}>{text(source.label)}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField id="pref-reason" label={text('Reason')} error={errors.reason} className="sm:col-span-2">
              <Textarea className="rounded-[4px]" id="pref-reason" rows={3} maxLength={1000} value={values.reason} aria-invalid={Boolean(errors.reason)} onChange={event => { setValues(prev => ({ ...prev, reason: event.target.value })); setErrors(prev => ({ ...prev, reason: undefined })) }} />
            </FormField>
          </div>
          {formError && <Notice tone="bad">{formError}</Notice>}
          <DialogFooter className="sm:justify-end">
            <Track>
              <Pill variant="plain" className="h-11 sm:h-8" disabled={busy} onClick={() => onOpenChange(false)}>{text('Cancel')}</Pill>
              <Pill type="submit" variant="primary" className="h-11 sm:h-8" disabled={busy}>{busy ? text('Saving…') : text('Save preferences')}</Pill>
            </Track>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
