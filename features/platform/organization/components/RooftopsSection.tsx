'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Code, DeskTable, Notice, Panel, Pill, Segmented, Status, Td, Th, Tr, Track } from '@/features/platform/components/desk'
import { createRooftop, updateRooftop } from '../actions'
import { SLUG_PATTERN, US_TIME_ZONES, isValidTimeZone } from '../lib/permissions'
import type { DealerGroup, RecordStatus, Rooftop, Viewer } from '../lib/types'
import { RECORD_STATUS } from './DealerGroupSection'
import { Field, FormDialog, fieldA11y, type FieldErrors } from './FormDialog'

type Filter = RecordStatus | 'all'
type FormValues = { dealerGroupId: string; code: string; name: string; publicSlug: string; timezone: string }
type FormState = { mode: 'create' } | { mode: 'edit'; rooftop: Rooftop }

function timeZoneLabel(zone: string) {
  return zone.replace(/^America\//, '').replace(/^Pacific\//, '').replace(/_/g, ' ')
}

export function RooftopsSection({
  rooftops,
  groups,
  viewer,
  onChanged,
}: {
  rooftops: Rooftop[]
  groups: DealerGroup[]
  viewer: Viewer | null
  onChanged: (message: string) => void
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const [values, setValues] = useState<FormValues>({ dealerGroupId: '', code: '', name: '', publicSlug: '', timezone: pt ? 'America/Sao_Paulo' : 'America/New_York' })
  const [statusChange, setStatusChange] = useState<{ rooftop: Rooftop; status: RecordStatus } | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const canManage = Boolean(viewer?.canManageDealerships)
  const lockedReason = canManage ? undefined : pt ? 'Requer permissão de administração da concessionária' : 'Requires dealership administration permission'

  const counts = useMemo(() => ({
    all: rooftops.length,
    active: rooftops.filter(rooftop => rooftop.status === 'active').length,
    suspended: rooftops.filter(rooftop => rooftop.status === 'suspended').length,
    archived: rooftops.filter(rooftop => rooftop.status === 'archived').length,
  }), [rooftops])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rooftops
      .filter(rooftop => filter === 'all' || rooftop.status === filter)
      .filter(rooftop => !term || `${rooftop.name} ${rooftop.code} ${rooftop.publicSlug}`.toLowerCase().includes(term))
  }, [rooftops, filter, search])

  const zones = (current: string) => (current && !US_TIME_ZONES.includes(current) ? [current, ...US_TIME_ZONES] : US_TIME_ZONES)

  const openCreate = () => {
    setFieldErrors({})
    setError(null)
    setValues({ dealerGroupId: groups.length === 1 ? groups[0].id : '', code: '', name: '', publicSlug: '', timezone: pt ? 'America/Sao_Paulo' : 'America/New_York' })
    setForm({ mode: 'create' })
  }

  const openEdit = (rooftop: Rooftop) => {
    setFieldErrors({})
    setError(null)
    setValues({ dealerGroupId: rooftop.dealerGroup?.id || '', code: rooftop.code, name: rooftop.name, publicSlug: rooftop.publicSlug, timezone: rooftop.timezone })
    setForm({ mode: 'edit', rooftop })
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form) return
    const code = values.code.trim().toUpperCase()
    const name = values.name.trim()
    const publicSlug = values.publicSlug.trim()
    const errors: FieldErrors = {}
    if (form.mode === 'create') {
      if (!values.dealerGroupId) errors.dealerGroup = pt ? 'Selecione o grupo de lojas.' : 'Dealer group is required'
      if (!code) errors.code = pt ? 'Informe o código.' : 'Code is required'
      else if (code.length > 40) errors.code = pt ? 'Use até 40 caracteres.' : '40 characters or fewer'
      else if (rooftops.some(rooftop => rooftop.dealerGroup?.id === values.dealerGroupId && rooftop.code === code)) errors.code = pt ? 'Este código já está em uso neste grupo.' : 'Already in use in this group'
    }
    if (!name) errors.name = pt ? 'Informe o nome.' : 'Name is required'
    else if (name.length > 200) errors.name = pt ? 'Use até 200 caracteres.' : '200 characters or fewer'
    if (!SLUG_PATTERN.test(publicSlug) || publicSlug.length < 2 || publicSlug.length > 120) errors.publicSlug = pt ? 'Use letras minúsculas, números e hífens simples (de 2 a 120 caracteres).' : 'Lowercase letters, numbers and single hyphens, 2-120 characters'
    else if (rooftops.some(rooftop => rooftop.publicSlug === publicSlug && (form.mode === 'create' || rooftop.id !== form.rooftop.id))) errors.publicSlug = pt ? 'Este endereço já está em uso.' : 'Already in use'
    if (!isValidTimeZone(values.timezone)) errors.timezone = pt ? 'Selecione um fuso horário válido.' : 'Choose a time zone'
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    setBusy(true)
    setError(null)
    const response = form.mode === 'create'
      ? await createRooftop({ dealerGroupId: values.dealerGroupId, code, name, publicSlug, timezone: values.timezone })
      : await updateRooftop(form.rooftop.id, { name, publicSlug, timezone: values.timezone })
    setBusy(false)
    if (!response.success) {
      setError(response.error)
      const serverErrors = { ...(response.fieldErrors || {}) }
      if (serverErrors.rooftopKey) serverErrors.code = pt ? 'Este código já está em uso neste grupo.' : 'Already in use in this group'
      setFieldErrors(serverErrors)
      return
    }
    setForm(null)
    onChanged(pt ? (form.mode === 'create' ? 'Loja cadastrada.' : 'Alterações da loja salvas.') : (form.mode === 'create' ? 'Rooftop created' : 'Rooftop saved'))
  }

  const submitStatus = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!statusChange) return
    setBusy(true)
    setError(null)
    const response = await updateRooftop(statusChange.rooftop.id, { status: statusChange.status })
    setBusy(false)
    if (!response.success) { setError(response.error); return }
    setStatusChange(null)
    onChanged(pt ? `Loja ${statusChange.status === 'active' ? 'reativada' : statusChange.status === 'suspended' ? 'suspensa' : 'arquivada'}.` : `Rooftop ${RECORD_STATUS[statusChange.status].label.toLowerCase()}`)
  }

  const verb = (status: RecordStatus) => pt
    ? status === 'active' ? 'Reativar' : status === 'suspended' ? 'Suspender' : 'Arquivar'
    : status === 'active' ? 'Reactivate' : status === 'suspended' ? 'Suspend' : 'Archive'

  return (
    <div className="space-y-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented<Filter>
          label={pt ? 'Filtrar lojas por status' : 'Filter rooftops'}
          value={filter}
          onChange={setFilter}
          size="sm"
          options={[
            { value: 'all', label: pt ? 'Todas' : 'All', count: counts.all },
            { value: 'active', label: pt ? 'Ativas' : 'Active', count: counts.active, tone: 'ok' },
            { value: 'suspended', label: pt ? 'Suspensas' : 'Suspended', count: counts.suspended, tone: 'warn' },
            { value: 'archived', label: pt ? 'Arquivadas' : 'Archived', count: counts.archived, tone: 'idle' },
          ]}
        />
        <Track>
          <Pill variant="primary" className="h-11 sm:h-8" disabled={!canManage || !groups.length} title={!groups.length ? (pt ? 'Nenhum grupo de lojas' : 'No dealer group') : lockedReason} onClick={openCreate}>
            <Plus />
            {pt ? 'Nova loja' : 'New rooftop'}
          </Pill>
        </Track>
      </div>
      {!canManage && <p className="text-xs text-muted-foreground">{lockedReason}</p>}
      <div className="relative min-w-0 sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-11 pl-9 sm:h-9" value={search} onChange={event => setSearch(event.target.value)} placeholder={pt ? 'Nome, código ou endereço' : 'Name, code or slug'} aria-label={pt ? 'Buscar lojas' : 'Search rooftops'} />
      </div>

      {visible.length === 0 ? (
        <Panel className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">{rooftops.length ? (pt ? 'Nenhuma loja encontrada' : 'No matching rooftops') : (pt ? 'Nenhuma loja cadastrada' : 'No rooftops')}</p>
          {rooftops.length > 0 && (
            <Track><Pill size="sm" onClick={() => { setSearch(''); setFilter('all') }}>{pt ? 'Limpar filtros' : 'Reset filters'}</Pill></Track>
          )}
        </Panel>
      ) : (
        <DeskTable aria-label={pt ? 'Lojas' : 'Rooftops'}>
          <thead>
            <tr>
              <Th>{pt ? 'Loja' : 'Rooftop'}</Th>
              <Th priority={2}>{pt ? 'Grupo' : 'Group'}</Th>
              <Th priority={3}>{pt ? 'Vitrine' : 'Storefront'}</Th>
              <Th priority={3}>{pt ? 'Fuso horário' : 'Time zone'}</Th>
              <Th>{pt ? 'Situação' : 'Status'}</Th>
              <Th align="right" priority={2}>{pt ? 'Membros' : 'Members'}</Th>
              <Th align="right"><span className="sr-only">{pt ? 'Ações' : 'Actions'}</span></Th>
            </tr>
          </thead>
          <tbody>
            {visible.map(rooftop => {
              const state = RECORD_STATUS[rooftop.status] || RECORD_STATUS.active
              const transitions: RecordStatus[] = rooftop.status === 'active' ? ['suspended', 'archived'] : rooftop.status === 'suspended' ? ['active', 'archived'] : ['active']
              return (
                <Tr key={rooftop.id}>
                  <Td className="max-w-0 min-w-[9rem]">
                    <span className="block truncate font-medium text-foreground">{rooftop.name}</span>
                    <span className="block truncate"><Code>{rooftop.code}</Code> <span className="text-xs text-muted-foreground">· {rooftop.currencyCode}</span></span>
                  </Td>
                  <Td priority={2} className="text-muted-foreground">{rooftop.dealerGroup?.name || (pt ? 'Sem grupo' : 'No group')}</Td>
                  <Td priority={3}><Code>/{rooftop.publicSlug}</Code></Td>
                  <Td priority={3} className="whitespace-nowrap text-muted-foreground">{timeZoneLabel(rooftop.timezone)}</Td>
                  <Td><Status tone={state.tone}>{pt ? ({ Active: 'Ativa', Suspended: 'Suspensa', Archived: 'Arquivada' } as Record<string, string>)[state.label] || state.label : state.label}</Status></Td>
                  <Td align="right" priority={2}>{rooftop.membershipsCount ?? 0}</Td>
                  <Td align="right" className="w-px whitespace-nowrap">
                    <div className="inline-flex flex-wrap justify-end gap-1">
                      {transitions.map(status => (
                        <Pill key={status} size="sm" className="h-11 sm:h-7" disabled={!canManage} title={lockedReason} onClick={() => { setError(null); setStatusChange({ rooftop, status }) }}>
                          {verb(status)}
                        </Pill>
                      ))}
                      <Pill size="sm" className="h-11 sm:h-7" disabled={!canManage} title={lockedReason} onClick={() => openEdit(rooftop)} aria-label={`${pt ? 'Editar' : 'Edit'} ${rooftop.name}`}>
                        <Pencil />
                        {pt ? 'Editar' : 'Edit'}
                      </Pill>
                    </div>
                  </Td>
                </Tr>
              )
            })}
          </tbody>
        </DeskTable>
      )}

      <FormDialog
        open={Boolean(form)}
        title={pt ? (form?.mode === 'create' ? 'Cadastrar loja' : 'Editar loja') : (form?.mode === 'create' ? 'New rooftop' : 'Edit rooftop')}
        error={error}
        busy={busy}
        submitLabel={pt ? (form?.mode === 'create' ? 'Cadastrar' : 'Salvar') : (form?.mode === 'create' ? 'Create' : 'Save')}
        onSubmit={submit}
        onOpenChange={open => { if (!open) setForm(null) }}
      >
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            {form.mode === 'create' ? (
              <Field id="rooftop-group" label={pt ? 'Grupo de lojas' : 'Dealer group'} error={fieldErrors.dealerGroup} className="sm:col-span-2">
                <Select value={values.dealerGroupId} onValueChange={value => setValues({ ...values, dealerGroupId: value })}>
                  <SelectTrigger {...fieldA11y('rooftop-group', fieldErrors.dealerGroup)} className="h-11 sm:h-9"><SelectValue placeholder={pt ? 'Selecione o grupo de lojas' : 'Select dealer group'} /></SelectTrigger>
                  <SelectContent>{groups.map(group => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            ) : null}
            <Field id="rooftop-code" label={pt ? 'Código' : 'Code'} error={fieldErrors.code} hint={form.mode === 'edit' ? (pt ? 'Não pode ser alterado depois do cadastro.' : 'Fixed after creation') : undefined}>
              <Input {...fieldA11y('rooftop-code', fieldErrors.code)} className="h-11 font-mono uppercase sm:h-9" value={values.code} maxLength={40} disabled={form.mode === 'edit'} onChange={event => setValues({ ...values, code: event.target.value.toUpperCase() })} />
            </Field>
            <Field id="rooftop-name" label={pt ? 'Nome da loja' : 'Name'} error={fieldErrors.name}>
              <Input {...fieldA11y('rooftop-name', fieldErrors.name)} className="h-11 sm:h-9" value={values.name} maxLength={200} onChange={event => setValues({ ...values, name: event.target.value })} />
            </Field>
            <Field id="rooftop-slug" label={pt ? 'Endereço da vitrine' : 'Storefront slug'} error={fieldErrors.publicSlug}>
              <Input {...fieldA11y('rooftop-slug', fieldErrors.publicSlug)} className="h-11 sm:h-9" value={values.publicSlug} maxLength={120} onChange={event => setValues({ ...values, publicSlug: event.target.value.toLowerCase() })} />
            </Field>
            <Field id="rooftop-timezone" label={pt ? 'Fuso horário' : 'Time zone'} error={fieldErrors.timezone}>
              <Select value={values.timezone} onValueChange={value => setValues({ ...values, timezone: value })}>
                <SelectTrigger {...fieldA11y('rooftop-timezone', fieldErrors.timezone)} className="h-11 sm:h-9"><SelectValue placeholder={pt ? 'Selecione o fuso horário' : 'Select time zone'} /></SelectTrigger>
                <SelectContent>{zones(values.timezone).map(zone => <SelectItem key={zone} value={zone}>{timeZoneLabel(zone)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field id="rooftop-currency" label={pt ? 'Moeda' : 'Currency'} hint={pt ? 'Este cadastro ainda aceita apenas USD.' : 'USD only'}>
              <Input id="rooftop-currency" className="h-11 font-mono sm:h-9" value={form.mode === 'edit' ? form.rooftop.currencyCode : 'USD'} disabled readOnly />
            </Field>
          </div>
        )}
      </FormDialog>

      <FormDialog
        open={Boolean(statusChange)}
        title={statusChange ? `${verb(statusChange.status)} ${statusChange.rooftop.name}` : ''}
        error={error}
        busy={busy}
        submitLabel={statusChange ? verb(statusChange.status) : (pt ? 'Salvar' : 'Save')}
        submitVariant={statusChange?.status === 'active' ? 'primary' : 'danger'}
        onSubmit={submitStatus}
        onOpenChange={open => { if (!open) setStatusChange(null) }}
      >
        {statusChange && statusChange.status !== 'active' && (
          <Notice tone="warn">{pt ? 'O estoque e as alterações operacionais desta loja serão suspensos.' : 'Inventory and operating changes stop at this rooftop'}</Notice>
        )}
      </FormDialog>
    </div>
  )
}
