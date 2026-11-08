'use client'

import { useState, type FormEvent } from 'react'
import { Pencil } from 'lucide-react'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { Input } from '@/components/ui/input'
import { DeskSection, Facts, Notice, Panel, Pill, Status, Track, type DeskTone } from '@/features/platform/components/desk'
import { updateDealerGroup } from '../actions'
import { SLUG_PATTERN } from '../lib/permissions'
import type { DealerGroup, RecordStatus, Viewer } from '../lib/types'
import { Field, FormDialog, fieldA11y, formatDate, type FieldErrors } from './FormDialog'

export const RECORD_STATUS: Record<RecordStatus, { label: string; tone: DeskTone }> = {
  active: { label: 'Active', tone: 'ok' },
  suspended: { label: 'Suspended', tone: 'warn' },
  archived: { label: 'Archived', tone: 'idle' },
}

type EditState = { group: DealerGroup; values: { name: string; slug: string; legalName: string } }
type StatusState = { group: DealerGroup; status: RecordStatus }

export function DealerGroupSection({
  groups,
  viewer,
  timeZone,
  onChanged,
}: {
  groups: DealerGroup[]
  viewer: Viewer | null
  timeZone: string
  onChanged: (message: string) => void
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const [edit, setEdit] = useState<EditState | null>(null)
  const [statusChange, setStatusChange] = useState<StatusState | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const canManage = Boolean(viewer?.canManageDealerships)
  const lockedReason = canManage ? undefined : pt ? 'Requer permissão de administração da concessionária' : 'Requires dealership administration permission'

  const openEdit = (group: DealerGroup) => {
    setFieldErrors({})
    setError(null)
    setEdit({ group, values: { name: group.name, slug: group.slug, legalName: group.legalName || '' } })
  }

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!edit) return
    const name = edit.values.name.trim()
    const slug = edit.values.slug.trim()
    const legalName = edit.values.legalName.trim()
    const errors: FieldErrors = {}
    if (!name) errors.name = pt ? 'O nome é obrigatório.' : 'Name is required'
    else if (name.length > 200) errors.name = pt ? 'Use até 200 caracteres.' : '200 characters or fewer'
    if (!SLUG_PATTERN.test(slug) || slug.length < 2 || slug.length > 120) errors.slug = pt ? 'Use letras minúsculas, números e hífens simples (2 a 120 caracteres).' : 'Lowercase letters, numbers and single hyphens, 2-120 characters'
    if (legalName.length > 240) errors.legalName = pt ? 'Use até 240 caracteres.' : '240 characters or fewer'
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    setBusy(true)
    setError(null)
    const response = await updateDealerGroup(edit.group.id, { name, slug, legalName })
    setBusy(false)
    if (!response.success) {
      setError(response.error)
      setFieldErrors(response.fieldErrors || {})
      return
    }
    setEdit(null)
    onChanged(pt ? 'Grupo de lojas salvo.' : 'Dealer group saved')
  }

  const submitStatus = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!statusChange) return
    setBusy(true)
    setError(null)
    const response = await updateDealerGroup(statusChange.group.id, { status: statusChange.status })
    setBusy(false)
    if (!response.success) { setError(response.error); return }
    setStatusChange(null)
    onChanged(pt ? `Grupo de lojas ${statusChange.status === 'active' ? 'reativado' : statusChange.status === 'suspended' ? 'suspenso' : 'arquivado'}.` : `Dealer group ${RECORD_STATUS[statusChange.status].label.toLowerCase()}`)
  }

  if (!groups.length) {
    return (
      <Panel className="px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">{pt ? 'Nenhum grupo de lojas cadastrado' : 'No dealer group'}</p>
      </Panel>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map(group => {
        const state = RECORD_STATUS[group.status] || RECORD_STATUS.active
        const stateLabel = pt ? ({ active: 'Ativo', suspended: 'Suspenso', archived: 'Arquivado' } as const)[group.status] : state.label
        const actionLabels = pt ? { suspend: 'Suspender', archive: 'Arquivar', reactivate: 'Reativar' } : { suspend: 'Suspend', archive: 'Archive', reactivate: 'Reactivate' }
        const transitions: Array<{ status: RecordStatus; label: string }> =
          group.status === 'active'
            ? [{ status: 'suspended', label: actionLabels.suspend }, { status: 'archived', label: actionLabels.archive }]
            : group.status === 'suspended'
              ? [{ status: 'active', label: actionLabels.reactivate }, { status: 'archived', label: actionLabels.archive }]
              : [{ status: 'active', label: actionLabels.reactivate }]
        return (
          <DeskSection
            key={group.id}
            title={<span className="flex min-w-0 flex-wrap items-baseline gap-x-3">{group.name}<Status tone={state.tone}>{stateLabel}</Status></span>}
            actions={
              <Track>
                {transitions.map(transition => (
                  <Pill key={transition.status} size="sm" className="h-11 sm:h-7" disabled={!canManage} title={lockedReason} onClick={() => { setError(null); setStatusChange({ group, status: transition.status }) }}>
                    {transition.label}
                  </Pill>
                ))}
                <Pill size="sm" variant="primary" className="h-11 sm:h-7" disabled={!canManage} title={lockedReason} onClick={() => openEdit(group)}>
                  <Pencil />
                  {pt ? 'Editar' : 'Edit'}
                </Pill>
              </Track>
            }
          >
            <Panel className="px-4">
              <Facts
                className="md:grid md:grid-cols-2 md:gap-x-8 md:divide-y-0 md:[&>div]:border-b md:[&>div:nth-last-child(-n+2)]:border-b-0"
                items={[
                  { label: 'Status', value: stateLabel },
                  { label: 'Slug', value: group.slug, mono: true },
                  { label: pt ? 'Razão social' : 'Legal name', value: group.legalName || (pt ? 'Não informado' : 'Not set') },
                  { label: pt ? 'Lojas' : 'Rooftops', value: group.rooftopsCount ?? 0 },
                  { label: pt ? 'Membros do grupo' : 'Group members', value: group.membershipsCount ?? 0 },
                  group.createdAt ? { label: pt ? 'Criado em' : 'Created', value: formatDate(group.createdAt, timeZone) } : null,
                ]}
              />
            </Panel>
            {!canManage && <p className="mt-2 text-xs text-muted-foreground">{lockedReason}</p>}
          </DeskSection>
        )
      })}

      <FormDialog
        open={Boolean(edit)}
        title={pt ? 'Editar grupo de lojas' : 'Edit dealer group'}
        error={error}
        busy={busy}
        onSubmit={submitEdit}
        onOpenChange={open => { if (!open) setEdit(null) }}
      >
        {edit && (
          <div className="grid gap-4">
            <Field id="group-name" label={pt ? 'Nome' : 'Name'} error={fieldErrors.name}>
              <Input {...fieldA11y('group-name', fieldErrors.name)} value={edit.values.name} maxLength={200} onChange={event => setEdit({ ...edit, values: { ...edit.values, name: event.target.value } })} />
            </Field>
            <Field id="group-slug" label={pt ? 'Identificador (slug)' : 'Slug'} error={fieldErrors.slug}>
              <Input {...fieldA11y('group-slug', fieldErrors.slug)} value={edit.values.slug} maxLength={120} onChange={event => setEdit({ ...edit, values: { ...edit.values, slug: event.target.value.toLowerCase() } })} />
            </Field>
            <Field id="group-legal" label={pt ? 'Razão social' : 'Legal name'} error={fieldErrors.legalName}>
              <Input {...fieldA11y('group-legal', fieldErrors.legalName)} value={edit.values.legalName} maxLength={240} onChange={event => setEdit({ ...edit, values: { ...edit.values, legalName: event.target.value } })} />
            </Field>
          </div>
        )}
      </FormDialog>

      <FormDialog
        open={Boolean(statusChange)}
        title={statusChange ? `${pt ? (statusChange.status === 'active' ? 'Reativar' : statusChange.status === 'suspended' ? 'Suspender' : 'Arquivar') : (statusChange.status === 'active' ? 'Reactivate' : statusChange.status === 'suspended' ? 'Suspend' : 'Archive')} ${statusChange.group.name}` : ''}
        error={error}
        busy={busy}
        submitLabel={statusChange ? (pt ? (statusChange.status === 'active' ? 'Reativar' : statusChange.status === 'suspended' ? 'Suspender' : 'Arquivar') : (statusChange.status === 'active' ? 'Reactivate' : statusChange.status === 'suspended' ? 'Suspend' : 'Archive')) : undefined}
        submitVariant={statusChange?.status === 'active' ? 'primary' : 'danger'}
        onSubmit={submitStatus}
        onOpenChange={open => { if (!open) setStatusChange(null) }}
      >
        {statusChange && statusChange.status !== 'active' && (
          <Notice tone="warn">{pt ? 'Todas as lojas deste grupo deixarão de aceitar alterações operacionais' : 'Every rooftop in this group stops accepting operating changes'}</Notice>
        )}
      </FormDialog>
    </div>
  )
}
