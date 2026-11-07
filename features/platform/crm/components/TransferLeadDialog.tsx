'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Notice, Pill, Track } from '@/features/platform/components/desk'
import { FormField } from './FormField'
import type { CrmPerson } from '../actions'
import { useLocale } from '@/features/i18n/LocaleProvider'

export function TransferLeadDialog({
  open,
  onOpenChange,
  staff,
  currentOwnerId,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  staff: CrmPerson[]
  currentOwnerId: string | null
  onSubmit: (values: { assignedToId: string; reason: string }) => Promise<string | null>
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const copy = (english: string, portuguese: string) => pt ? portuguese : english
  const [assignedToId, setAssignedToId] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<{ assignedToId?: string; reason?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (open && !wasOpen.current) {
      setAssignedToId('')
      setReason('')
      setErrors({})
      setFormError(null)
    }
    wasOpen.current = open
  }, [open])

  const candidates = staff.filter(person => person.id !== currentOwnerId)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const found = {
      assignedToId: assignedToId ? undefined : copy('Required', 'Obrigatório'),
      reason: !reason.trim() ? copy('Required', 'Obrigatório') : reason.length > 500 ? copy('At most 500 characters', 'Use no máximo 500 caracteres') : undefined,
    }
    setErrors(found)
    if (found.assignedToId || found.reason) return
    setBusy(true)
    setFormError(null)
    const error = await onSubmit({ assignedToId, reason: reason.trim() })
    setBusy(false)
    if (error) setFormError(error)
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next) }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy('Transfer lead', 'Transferir lead')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <FormField id="transfer-owner" label={copy('New salesperson', 'Novo responsável')} error={errors.assignedToId}>
            <Select value={assignedToId || undefined} onValueChange={value => { setAssignedToId(value); setErrors(prev => ({ ...prev, assignedToId: undefined })) }}>
              <SelectTrigger id="transfer-owner" className="h-11 rounded-[4px] sm:h-9" aria-invalid={Boolean(errors.assignedToId)}>
                <SelectValue placeholder={candidates.length ? copy('Select salesperson', 'Selecione o vendedor') : copy('No eligible staff', 'Nenhum membro da equipe disponível')} />
              </SelectTrigger>
              <SelectContent>{candidates.map(person => <SelectItem key={person.id} value={person.id}>{person.name || copy('Unnamed', 'Sem nome')}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
          <FormField id="transfer-reason" label={copy('Reason', 'Motivo')} error={errors.reason}>
            <Textarea className="rounded-[4px]" id="transfer-reason" rows={3} maxLength={500} value={reason} aria-invalid={Boolean(errors.reason)} onChange={event => { setReason(event.target.value); setErrors(prev => ({ ...prev, reason: undefined })) }} />
          </FormField>
          {formError && <Notice tone="bad">{formError}</Notice>}
          <DialogFooter className="sm:justify-end">
            <Track>
              <Pill variant="plain" className="h-11 sm:h-8" disabled={busy} onClick={() => onOpenChange(false)}>{copy('Cancel', 'Cancelar')}</Pill>
              <Pill type="submit" variant="primary" className="h-11 sm:h-8" disabled={busy || candidates.length === 0}>{busy ? copy('Saving…', 'Salvando…') : copy('Transfer', 'Transferir')}</Pill>
            </Track>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
