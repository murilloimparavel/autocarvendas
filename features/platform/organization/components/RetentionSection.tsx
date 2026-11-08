'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { Pencil } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { Textarea } from '@/components/ui/textarea'
import { Code, DeskSection, DeskTable, Notice, Panel, Pill, Segmented, Status, Td, Th, Tr, type DeskTone } from '@/features/platform/components/desk'
import { configureRetentionPolicy } from '../actions'
import { MAX_RETENTION_DAYS, RETENTION_CATEGORIES } from '../lib/permissions'
import type { RetentionPolicy, Rooftop, Viewer } from '../lib/types'
import { Field, FormDialog, fieldA11y, formatDate, newIdempotencyKey, type FieldErrors } from './FormDialog'

type Filter = 'all' | 'set' | 'unset' | 'hold'
type Row = { rooftop: Rooftop; category: { value: string; label: string }; policy: RetentionPolicy | null }
type FormState = { row: Row; retentionDays: string; legalHold: boolean; rationale: string; idempotencyKey: string }

function rowState(row: Row, pt: boolean): { tone: DeskTone; label: string } {
  if (!row.policy) return { tone: 'idle', label: pt ? 'Não configurada' : 'Not set' }
  if (row.policy.legalHold) return { tone: 'warn', label: pt ? 'Retenção legal' : 'Legal hold' }
  return { tone: 'ok', label: pt ? 'Configurada' : 'Set' }
}

function formatDays(days: number, pt: boolean) {
  if (days % 365 === 0) return `${days / 365} ${pt ? (days === 365 ? 'ano' : 'anos') : (days === 365 ? 'year' : 'years')}`
  return `${days} ${pt ? (days === 1 ? 'dia' : 'dias') : (days === 1 ? 'day' : 'days')}`
}

export function RetentionSection({
  rooftops,
  policies,
  viewer,
  timeZone,
  error: loadError,
  onChanged,
}: {
  rooftops: Rooftop[]
  policies: RetentionPolicy[]
  viewer: Viewer | null
  timeZone: string
  error?: string
  onChanged: (message: string) => void
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const [filter, setFilter] = useState<Filter>('all')
  const [form, setForm] = useState<FormState | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const canManage = Boolean(viewer?.canManageDealerships)

  const rows = useMemo(() => rooftops.flatMap(rooftop => RETENTION_CATEGORIES.map(category => ({
    rooftop,
    category,
    policy: policies.find(policy => policy.rooftop?.id === rooftop.id && policy.category === category.value) || null,
  }))), [rooftops, policies])

  const counts = {
    all: rows.length,
    set: rows.filter(row => row.policy).length,
    unset: rows.filter(row => !row.policy).length,
    hold: rows.filter(row => row.policy?.legalHold).length,
  }
  const matches = (row: Row) => filter === 'all' || (filter === 'set' ? Boolean(row.policy) : filter === 'unset' ? !row.policy : Boolean(row.policy?.legalHold))

  const blockedReason = (row: Row) => {
    if (!canManage) return pt ? 'Requer permissão de administração da concessionária' : 'Requires dealership administration permission'
    if (row.rooftop.status !== 'active') return pt ? 'A loja não está ativa' : 'Rooftop is not active'
    return undefined
  }

  const openForm = (row: Row) => {
    setFieldErrors({})
    setError(null)
    setForm({
      row,
      retentionDays: row.policy ? String(row.policy.retentionDays) : '',
      legalHold: row.policy?.legalHold ?? false,
      rationale: row.policy?.rationale ?? '',
      idempotencyKey: newIdempotencyKey(`retention:${row.rooftop.id}:${row.category.value}`),
    })
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form) return
    const daysText = form.retentionDays.trim().replace(/,/g, '')
    const retentionDays = Number(daysText)
    const rationale = form.rationale.trim()
    const errors: FieldErrors = {}
    if (!/^\d+$/.test(daysText) || retentionDays < 1 || retentionDays > MAX_RETENTION_DAYS) errors.retentionDays = pt ? `Número inteiro de 1 a ${MAX_RETENTION_DAYS.toLocaleString('pt-BR')}` : `Whole number from 1 to ${MAX_RETENTION_DAYS.toLocaleString('en-US')}`
    if (!rationale) errors.rationale = pt ? 'A justificativa é obrigatória' : 'Rationale is required'
    else if (rationale.length > 1000) errors.rationale = pt ? 'Use até 1.000 caracteres' : '1,000 characters or fewer'
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    setBusy(true)
    setError(null)
    const response = await configureRetentionPolicy({
      rooftopId: form.row.rooftop.id,
      category: form.row.category.value,
      retentionDays,
      legalHold: form.legalHold,
      rationale,
      idempotencyKey: form.idempotencyKey,
      expectedUpdatedAt: form.row.policy?.updatedAt ?? null,
    })
    setBusy(false)
    if (!response.success) { setError(response.error); return }
    setForm(null)
    onChanged(pt ? 'Política de retenção salva.' : 'Retention policy saved')
  }

  if (loadError) return <Notice tone="bad">Retention policies unavailable: {loadError}</Notice>

  return (
    <div className="space-y-4">
      <Segmented<Filter>
        label={pt ? 'Filtrar políticas de retenção' : 'Filter retention policies'}
        value={filter}
        onChange={setFilter}
        size="sm"
        options={[
          { value: 'all', label: pt ? 'Todas' : 'All', count: counts.all },
          { value: 'set', label: pt ? 'Configuradas' : 'Set', count: counts.set, tone: 'ok' },
          { value: 'unset', label: pt ? 'Não configuradas' : 'Not set', count: counts.unset, tone: 'idle' },
          { value: 'hold', label: pt ? 'Retenção legal' : 'Legal hold', count: counts.hold, tone: 'warn' },
        ]}
      />
      {!canManage && <p className="text-xs text-muted-foreground">{pt ? 'Requer permissão de administração da concessionária' : 'Requires dealership administration permission'}</p>}

      {rooftops.length === 0 ? (
        <Panel className="px-4 py-12 text-center"><p className="text-sm text-muted-foreground">{pt ? 'Nenhuma loja cadastrada' : 'No rooftops'}</p></Panel>
      ) : (
        rooftops.map(rooftop => {
          const rooftopRows = rows.filter(row => row.rooftop.id === rooftop.id && matches(row))
          return (
            <DeskSection key={rooftop.id} title={<>{rooftop.name} <Code>{rooftop.code}</Code></>} count={rooftopRows.length}>
              {rooftopRows.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">{pt ? 'Nenhuma política encontrada' : 'No matching policies'}</p>
              ) : (
                <DeskTable aria-label={pt ? `Políticas de retenção para ${rooftop.name}` : `Retention policies for ${rooftop.name}`}>
                  <thead>
                    <tr>
                      <Th>{pt ? 'Categoria' : 'Category'}</Th>
                      <Th>{pt ? 'Situação' : 'Status'}</Th>
                      <Th align="right" priority={2}>{pt ? 'Prazo' : 'Keep for'}</Th>
                      <Th priority={3}>{pt ? 'Última verificação' : 'Last swept'}</Th>
                      <Th priority={3}>{pt ? 'Justificativa' : 'Rationale'}</Th>
                      <Th align="right"><span className="sr-only">{pt ? 'Ação' : 'Action'}</span></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooftopRows.map(row => {
                      const state = rowState(row, pt)
                      const blocked = blockedReason(row)
                      return (
                        <Tr key={row.category.value}>
                          <Td className="max-w-0 min-w-[8rem]">
                            <span className="block truncate font-medium text-foreground">{row.category.label}</span>
                            {row.policy && (
                              <span className="block truncate text-xs text-muted-foreground md:hidden">{formatDays(row.policy.retentionDays, pt)}</span>
                            )}
                            {blocked && <span className="block text-xs text-muted-foreground">{blocked}</span>}
                          </Td>
                          <Td><Status tone={state.tone}>{state.label}</Status></Td>
                          <Td align="right" priority={2} className="whitespace-nowrap">
                            {row.policy ? formatDays(row.policy.retentionDays, pt) : <span className="text-muted-foreground">{pt ? 'Não definido' : 'Not set'}</span>}
                          </Td>
                          <Td priority={3} className="whitespace-nowrap text-muted-foreground">
                            {row.policy ? (row.policy.lastSweptAt ? formatDate(row.policy.lastSweptAt, timeZone) : (pt ? 'Nunca' : 'Never')) : ''}
                            {row.policy && <span className="block text-xs">{pt ? 'Atualizado' : 'Updated'} {formatDate(row.policy.updatedAt, timeZone)}</span>}
                          </Td>
                          <Td priority={3} className="max-w-[18rem] break-words text-muted-foreground">{row.policy?.rationale || ''}</Td>
                          <Td align="right" className="w-px whitespace-nowrap">
                            <Pill size="sm" variant={row.policy ? 'raised' : 'primary'} className="h-11 sm:h-7" disabled={Boolean(blocked)} title={blocked} onClick={() => openForm(row)}>
                              <Pencil />
                              {row.policy ? (pt ? 'Editar' : 'Edit') : (pt ? 'Definir política' : 'Set policy')}
                            </Pill>
                          </Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </DeskTable>
              )}
            </DeskSection>
          )
        })
      )}

      <FormDialog
        open={Boolean(form)}
        title={form ? `${form.row.category.label}: ${form.row.rooftop.name}` : ''}
        error={error}
        busy={busy}
        onSubmit={submit}
        onOpenChange={open => { if (!open) setForm(null) }}
      >
        {form && (
          <div className="grid gap-4">
            <Field id="retention-days" label={pt ? 'Prazo de retenção (dias)' : 'Retention days'} error={fieldErrors.retentionDays}>
              <Input {...fieldA11y('retention-days', fieldErrors.retentionDays)} className="h-11 sm:h-9" inputMode="numeric" value={form.retentionDays} onChange={event => setForm({ ...form, retentionDays: event.target.value })} />
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <Checkbox checked={form.legalHold} onCheckedChange={value => setForm({ ...form, legalHold: value === true })} />
              {pt ? 'Retenção legal' : 'Legal hold'}
            </label>
            {form.row.policy?.legalHold && !form.legalHold && <Notice tone="warn">{pt ? 'A retenção legal será removida' : 'Releasing the legal hold'}</Notice>}
            <Field id="retention-rationale" label={pt ? 'Justificativa' : 'Rationale'} error={fieldErrors.rationale}>
              <Textarea {...fieldA11y('retention-rationale', fieldErrors.rationale)} rows={3} maxLength={1000} value={form.rationale} onChange={event => setForm({ ...form, rationale: event.target.value })} />
            </Field>
          </div>
        )}
      </FormDialog>
    </div>
  )
}
