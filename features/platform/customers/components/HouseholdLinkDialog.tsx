'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Search } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { Notice, Panel, Pill, Track } from '@/features/platform/components/desk'
import { formatPhone } from '@/features/platform/lib/format'
import { FormField } from '@/features/platform/crm/components/FormField'
import { personName } from '@/features/platform/crm/lib/leadOptions'
import { searchCustomers, type CustomerSearchResult } from '../actions'
import { customerLabel } from '../lib/locale'

export function HouseholdLinkDialog({
  open,
  onOpenChange,
  customerId,
  rooftopId,
  currentHousehold,
  defaultDisplayName,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerId: string
  rooftopId: string
  currentHousehold: { id: string; displayName: string | null } | null
  defaultDisplayName: string
  onSubmit: (values: { member: CustomerSearchResult; displayName: string }) => Promise<string | null>
}) {
  const { locale } = useLocale()
  const text = (value: string) => customerLabel(locale, value)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<CustomerSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [member, setMember] = useState<CustomerSearchResult | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [errors, setErrors] = useState<{ member?: string; displayName?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (open && !wasOpen.current) {
      setSearch('')
      setResults([])
      setMember(null)
      setDisplayName(currentHousehold?.displayName || defaultDisplayName)
      setErrors({})
      setFormError(null)
    }
    wasOpen.current = open
  }, [open, currentHousehold, defaultDisplayName])

  useEffect(() => {
    if (!open) return
    const term = search.trim()
    if (term.length < 2) { setResults([]); return }
    let cancelled = false
    setSearching(true)
    const handle = setTimeout(async () => {
      const found = await searchCustomers({ search: term, rooftopId, excludeId: customerId })
      if (!cancelled) { setResults(found); setSearching(false) }
    }, 250)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [search, open, rooftopId, customerId])

  const conflict = member?.household && currentHousehold && member.household.id !== currentHousehold.id

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const found = {
      member: !member ? text('Select a customer') : conflict ? text('Already in a different household') : undefined,
      displayName: !displayName.trim() ? text('Required') : displayName.length > 200 ? text('At most 200 characters') : undefined,
    }
    setErrors(found)
    if (found.member || found.displayName || !member) return
    setBusy(true)
    setFormError(null)
    const error = await onSubmit({ member, displayName: displayName.trim() })
    setBusy(false)
    if (error) setFormError(error)
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next) }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{text(currentHousehold ? 'Add household member' : 'Link household')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormField id="household-search" label={text('Customer')} error={errors.member}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="household-search" className="rounded-[4px] h-11 pl-9 sm:h-9" placeholder={text('Search name, email, phone')} value={search} onChange={event => setSearch(event.target.value)} autoComplete="off" />
            </div>
          </FormField>
          {member ? (
            <Panel className="flex min-w-0 items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{personName(member.firstName, member.lastName)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[member.primaryEmail, formatPhone(member.primaryPhone, locale), member.household?.displayName ? `${text('Household')} ${member.household.displayName}` : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              <Track className="shrink-0"><Pill size="sm" className="h-11 sm:h-7" onClick={() => setMember(null)}>{text('Change')}</Pill></Track>
            </Panel>
          ) : search.trim().length >= 2 && (
            <Panel className="max-h-60 divide-y overflow-y-auto">
              {searching && results.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">{text('Searching…')}</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">{text('No matching customers')}</p>
              ) : results.map(result => (
                <button
                  key={result.id}
                  type="button"
                  className="flex min-h-11 w-full min-w-0 flex-col items-start px-3 py-2 text-left transition-colors hover:bg-muted/40"
                  onClick={() => { setMember(result); setErrors(prev => ({ ...prev, member: undefined })); if (!currentHousehold && result.household?.displayName) setDisplayName(result.household.displayName) }}
                >
                  <span className="text-sm font-medium">{personName(result.firstName, result.lastName)}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[result.primaryEmail, formatPhone(result.primaryPhone, locale), result.household?.displayName ? `${text('Household')} ${result.household.displayName}` : null].filter(Boolean).join(' · ')}
                  </span>
                </button>
              ))}
            </Panel>
          )}
          {conflict && <Notice tone="warn">{text('Selected customer is already in another household')}</Notice>}
          <FormField id="household-name" label={text('Household name')} error={errors.displayName}>
            <Input id="household-name" className="rounded-[4px] h-11 sm:h-9" maxLength={200} value={displayName} aria-invalid={Boolean(errors.displayName)} onChange={event => { setDisplayName(event.target.value); setErrors(prev => ({ ...prev, displayName: undefined })) }} />
          </FormField>
          {formError && <Notice tone="bad">{formError}</Notice>}
          <DialogFooter className="sm:justify-end">
            <Track>
              <Pill variant="plain" className="h-11 sm:h-8" disabled={busy} onClick={() => onOpenChange(false)}>{text('Cancel')}</Pill>
              <Pill type="submit" variant="primary" className="h-11 sm:h-8" disabled={busy || Boolean(conflict)}>{busy ? text('Saving…') : text('Link')}</Pill>
            </Track>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
