'use client'

import { useMemo, useState } from 'react'
import { Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Attention, Code, DeskSection, DeskTable, Figure, Notice, Panel, Pill, Segmented, Status, Td, Th, Tr, Track } from '@/features/platform/components/desk'
import { type CatalogRooftop, type CatalogRoutingRule, configureRoutingRule, deleteRoutingRule, getRoutingStaff } from '../actions'
import { ConfirmDialog, EmptyRow, Field, FormDialog, TAP, TAP_INPUT, TAP_SM } from './formKit'
import { cn } from '@/lib/utils'
import { useLocale } from '@/features/i18n/LocaleProvider'

export const ROUTING_SOURCES = [
  { value: 'any', label: 'Any source' },
  { value: 'walk-in', label: 'Walk-in' },
  { value: 'website', label: 'Website' },
  { value: 'phone', label: 'Phone' },
  { value: 'referral', label: 'Referral' },
  { value: 'ad', label: 'Advertisement' },
  { value: 'social', label: 'Social media' },
  { value: 'third-party', label: 'Third party' },
]
const sourceLabel = (value: string, pt: boolean) => {
  if (!pt) return ROUTING_SOURCES.find(source => source.value === value)?.label || value
  const labels: Record<string, string> = {
    any: 'Qualquer origem', 'walk-in': 'Visita à loja', website: 'Site', phone: 'Telefone',
    referral: 'Indicação', ad: 'Anúncio', social: 'Rede social', 'third-party': 'Terceiro',
  }
  return labels[value] || value
}

type StateFilter = 'active' | 'inactive' | 'all'
type Draft = { ruleId?: string; rooftopId: string; name: string; source: string; assigneeId: string; priority: string; firstResponseMinutes: string; active: boolean }

function formatMinutes(minutes: number, pt: boolean) {
  const min = pt ? 'min' : 'min'
  const hours = Math.floor(minutes / 60)
  const days = minutes / 1440
  if (minutes < 60) return `${minutes} ${min}`
  if (minutes % 1440 === 0) return pt ? `${days} ${days === 1 ? 'dia' : 'dias'}` : `${days} d`
  if (minutes % 60 === 0) return `${hours} h`
  return `${hours} h ${minutes % 60} ${min}`
}

export function LeadRoutingPanel({
  rules,
  rooftops,
  error,
  onReload,
}: {
  rules: CatalogRoutingRule[]
  rooftops: CatalogRooftop[]
  error: string | null
  onReload: () => Promise<void>
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const [stateFilter, setStateFilter] = useState<StateFilter>('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([])
  const [staffError, setStaffError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [pending, setPending] = useState<CatalogRoutingRule | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  const counts = { active: rules.filter(rule => rule.active).length, inactive: rules.filter(rule => !rule.active).length, all: rules.length }
  const groups = useMemo(() => {
    const filtered = rules
      .filter(rule => stateFilter === 'all' || (stateFilter === 'active' ? rule.active : !rule.active))
      .filter(rule => sourceFilter === 'all' || rule.source === sourceFilter || (sourceFilter !== 'any' && rule.source === 'any'))
    const byRooftop = new Map<string, { rooftop: CatalogRooftop | null; rules: CatalogRoutingRule[] }>()
    for (const rule of filtered) {
      const key = rule.rooftop?.id || 'none'
      if (!byRooftop.has(key)) byRooftop.set(key, { rooftop: rule.rooftop, rules: [] })
      byRooftop.get(key)!.rules.push(rule)
    }
    // Same order routeLead evaluates: highest priority first, then route key.
    for (const group of byRooftop.values()) group.rules.sort((left, right) => right.priority - left.priority || left.routeKey.localeCompare(right.routeKey))
    return [...byRooftop.values()]
  }, [rules, stateFilter, sourceFilter])

  const loadStaff = async (rooftopId: string) => {
    setStaff([]); setStaffError(null)
    if (!rooftopId) return
    const response = await getRoutingStaff(rooftopId)
    if (response.success) setStaff(response.users)
    else setStaffError(response.error)
  }

  const open = (rule?: CatalogRoutingRule) => {
    setFieldErrors({}); setFormError(null)
    setIdempotencyKey(`desk-routing-rule:${crypto.randomUUID()}`)
    const next: Draft = rule
      ? { ruleId: rule.id, rooftopId: rule.rooftop?.id || '', name: rule.name, source: rule.source, assigneeId: rule.assignee?.id || '', priority: String(rule.priority), firstResponseMinutes: String(rule.firstResponseMinutes), active: rule.active }
      : { rooftopId: rooftops[0]?.id || '', name: '', source: 'any', assigneeId: '', priority: '100', firstResponseMinutes: '30', active: true }
    setDraft(next)
    void loadStaff(next.rooftopId)
  }

  const submit = async () => {
    if (!draft) return
    const errors: Record<string, string> = {}
    const name = draft.name.trim()
    const priority = Number(draft.priority)
    const minutes = Number(draft.firstResponseMinutes)
    if (!draft.rooftopId) errors.rooftopId = pt ? 'Selecione uma loja' : 'Choose a rooftop'
    if (!name) errors.name = pt ? 'Informe o nome' : 'Name is required'
    else if (name.length > 200) errors.name = pt ? 'O nome deve ter até 200 caracteres' : 'Name is too long'
    if (!draft.assigneeId) errors.assigneeId = pt ? 'Selecione quem receberá estes leads' : 'Choose who receives these leads'
    if (!draft.priority.trim() || !Number.isInteger(priority) || priority < 0 || priority > 10000) errors.priority = pt ? 'Informe um número inteiro de 0 a 10.000' : 'Whole number from 0 to 10000'
    if (!draft.firstResponseMinutes.trim() || !Number.isInteger(minutes) || minutes < 1 || minutes > 10080) errors.firstResponseMinutes = pt ? 'Informe um número inteiro de 1 a 10.080' : 'Whole number from 1 to 10080'
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    setBusy(true); setFormError(null)
    const response = await configureRoutingRule({ ruleId: draft.ruleId, rooftopId: draft.rooftopId, name, source: draft.source, assigneeId: draft.assigneeId, priority, firstResponseMinutes: minutes, active: draft.active, idempotencyKey })
    setBusy(false)
    if (!response.success) { setFormError(response.error); return }
    setNotice({ tone: 'ok', text: pt ? `${draft.ruleId ? 'Regra salva' : 'Regra adicionada'}: ${name}` : draft.ruleId ? `Saved ${name}` : `Added ${name}` })
    setDraft(null)
    await onReload()
  }

  const toggle = async (rule: CatalogRoutingRule) => {
    if (!rule.rooftop?.id || !rule.assignee?.id) return
    setTogglingId(rule.id); setNotice(null)
    const response = await configureRoutingRule({
      ruleId: rule.id,
      rooftopId: rule.rooftop.id,
      name: rule.name,
      source: rule.source,
      assigneeId: rule.assignee.id,
      priority: rule.priority,
      firstResponseMinutes: rule.firstResponseMinutes,
      active: !rule.active,
      idempotencyKey: `desk-routing-rule:${rule.id}:${rule.active ? 'off' : 'on'}:${rule.updatedAt}`,
    })
    setTogglingId(null)
    if (!response.success) { setNotice({ tone: 'bad', text: response.error }); return }
    setNotice({ tone: 'ok', text: pt ? `${rule.name} ${rule.active ? 'desativada' : 'ativada'}` : `${rule.name} ${rule.active ? 'deactivated' : 'activated'}` })
    await onReload()
  }

  const confirmDelete = async () => {
    if (!pending) return
    setBusy(true); setFormError(null)
    const response = await deleteRoutingRule(pending.id)
    setBusy(false)
    if (!response.success) { setFormError(response.error); return }
    setNotice({ tone: 'ok', text: pt ? `Regra excluída: ${pending.name}` : `Deleted ${pending.name}` })
    setPending(null)
    await onReload()
  }

  const staffOptions = draft?.assigneeId && !staff.some(user => user.id === draft.assigneeId)
    ? [...staff, { id: draft.assigneeId, name: rules.find(rule => rule.id === draft.ruleId)?.assignee?.name || 'Current assignee' }]
    : staff

  return (
    <div className="space-y-4">
      {error && <Notice tone="bad">{error}</Notice>}
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Segmented<StateFilter>
          label={pt ? 'Filtrar regras' : 'Filter rules'}
          value={stateFilter}
          onChange={setStateFilter}
          size="sm"
          options={[
            { value: 'all', label: pt ? 'Todas' : 'All', count: counts.all },
            { value: 'active', label: pt ? 'Ativas' : 'Active', count: counts.active, tone: 'ok' },
            { value: 'inactive', label: pt ? 'Inativas' : 'Inactive', count: counts.inactive, tone: 'idle' },
          ]}
        />
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className={`${TAP_INPUT} w-full sm:w-48`} aria-label={pt ? 'Origem da oportunidade' : 'Lead source'}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{pt ? 'Todas as origens' : 'All sources'}</SelectItem>
            {ROUTING_SOURCES.map(source => <SelectItem key={source.value} value={source.value}>{source.value === 'any' ? (pt ? 'Qualquer origem' : 'Any-source rules') : (pt ? ({ 'walk-in': 'Visita à loja', website: 'Site', phone: 'Telefone', referral: 'Indicação', ad: 'Anúncio', social: 'Rede social', 'third-party': 'Terceiro' } as Record<string, string>)[source.value] || source.label : source.label)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Track className="sm:ml-auto">
          <Pill variant="primary" className={TAP} disabled={rooftops.length === 0} onClick={() => open()}>
            <Plus />
            {pt ? 'Adicionar regra' : 'Add rule'}
          </Pill>
        </Track>
      </div>

      {groups.length === 0 ? (
        <Panel><EmptyRow>{rules.length === 0 ? (pt ? 'Nenhuma regra de distribuição cadastrada' : 'No routing rules yet') : (pt ? 'Nenhuma regra encontrada' : 'No rules match')}</EmptyRow></Panel>
      ) : groups.map(group => {
        let activeRank = 0
        return (
          <DeskSection key={group.rooftop?.id || 'none'} title={rooftops.length > 1 ? group.rooftop?.name || (pt ? 'Sem loja' : 'No rooftop') : (pt ? 'Ordem de avaliação' : 'Evaluation order')} count={group.rules.length}>
            <DeskTable aria-label={pt ? `Regras de distribuição${group.rooftop?.name ? ` para ${group.rooftop.name}` : ''}` : `Routing rules${group.rooftop?.name ? ` for ${group.rooftop.name}` : ''}`}>
              <thead>
                <tr>
                  <Th align="right" className="w-10"><span className="sr-only">{pt ? 'Ordem' : 'Order'}</span>#</Th>
                  <Th>{pt ? 'Regra' : 'Rule'}</Th>
                  <Th priority={2}>{pt ? 'Responsável' : 'Assignee'}</Th>
                  <Th>{pt ? 'Situação' : 'Status'}</Th>
                  <Th align="right" priority={2}>{pt ? 'Primeira resposta' : 'First response'}</Th>
                  <Th align="right" priority={3}>{pt ? 'Prioridade' : 'Priority'}</Th>
                  <Th align="right"><span className="sr-only">{pt ? 'Ações' : 'Actions'}</span></Th>
                </tr>
              </thead>
              <tbody>
                {group.rules.map(rule => {
                  if (rule.active) activeRank += 1
                  const assignee = rule.assignee?.name || rule.assignee?.email
                  return (
                    <Tr key={rule.id}>
                      <Td align="right" className="w-10 text-xs text-muted-foreground">{rule.active ? activeRank : '-'}</Td>
                      <Td className="max-w-0 min-w-[8rem]">
                        <span className="block truncate font-medium text-foreground">{rule.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {sourceLabel(rule.source, pt)}
                          <span className="md:hidden"> · {assignee || (pt ? 'Sem responsável' : 'No assignee')} · {formatMinutes(rule.firstResponseMinutes, pt)}</span>
                        </span>
                      </Td>
                      <Td priority={2}>{assignee ? <span className="text-foreground">{assignee}</span> : <Attention>{pt ? 'Sem responsável' : 'No assignee'}</Attention>}</Td>
                      <Td>{rule.active ? <Status tone="ok">{pt ? 'Ativa' : 'Active'}</Status> : <Status tone="idle">{pt ? 'Inativa' : 'Inactive'}</Status>}</Td>
                      <Td align="right" priority={2}><Figure size="sm">{formatMinutes(rule.firstResponseMinutes, pt)}</Figure></Td>
                      <Td align="right" priority={3}><Code>{rule.priority}</Code></Td>
                      <Td align="right" className="w-px whitespace-nowrap">
                        <div className="inline-flex flex-wrap justify-end gap-1">
                          <Pill size="sm" className={TAP_SM} disabled={togglingId === rule.id || !rule.assignee?.id} title={!rule.assignee?.id ? (pt ? 'Atribua um responsável primeiro' : 'Assign someone first') : undefined} onClick={() => toggle(rule)}>
                            <Power />
                            {togglingId === rule.id ? (pt ? 'Salvando…' : 'Saving…') : rule.active ? (pt ? 'Desativar' : 'Deactivate') : (pt ? 'Ativar' : 'Activate')}
                          </Pill>
                          <Pill size="sm" className={TAP_SM} onClick={() => open(rule)}>
                            <Pencil />
                            {pt ? 'Editar' : 'Edit'}
                          </Pill>
                          <Pill size="sm" variant="plain" className={cn(TAP_SM, 'max-sm:w-11')} aria-label={pt ? `Excluir ${rule.name}` : `Delete ${rule.name}`} onClick={() => { setFormError(null); setPending(rule) }}>
                            <Trash2 />
                          </Pill>
                        </div>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DeskTable>
          </DeskSection>
        )
      })}

      <FormDialog
        open={draft !== null}
        title={draft?.ruleId ? 'Edit routing rule' : 'Add routing rule'}
        busy={busy}
        error={formError}
        onSubmit={submit}
        onOpenChange={value => { if (!value) setDraft(null) }}
        wide
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {!draft?.ruleId && rooftops.length > 1 && (
            <Field id="rule-rooftop" label="Rooftop" error={fieldErrors.rooftopId} className="sm:col-span-2">
              <Select value={draft?.rooftopId || ''} onValueChange={value => { setDraft(current => current && { ...current, rooftopId: value, assigneeId: '' }); void loadStaff(value) }}>
                <SelectTrigger id="rule-rooftop" className={TAP_INPUT}><SelectValue placeholder={pt ? 'Selecione uma loja' : 'Select rooftop'} /></SelectTrigger>
                <SelectContent>{rooftops.map(rooftop => <SelectItem key={rooftop.id} value={rooftop.id}>{rooftop.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
          <Field id="rule-name" label="Name" error={fieldErrors.name} className="sm:col-span-2">
            <Input id="rule-name" className={TAP_INPUT} maxLength={200} value={draft?.name || ''} aria-invalid={Boolean(fieldErrors.name)} onChange={event => setDraft(current => current && { ...current, name: event.target.value })} />
          </Field>
          <Field id="rule-source" label="Lead source">
            <Select value={draft?.source || 'any'} onValueChange={value => setDraft(current => current && { ...current, source: value })}>
              <SelectTrigger id="rule-source" className={TAP_INPUT}><SelectValue /></SelectTrigger>
              <SelectContent>{ROUTING_SOURCES.map(source => <SelectItem key={source.value} value={source.value}>{source.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field id="rule-assignee" label="Assign to" error={fieldErrors.assigneeId || staffError}>
            <Select value={draft?.assigneeId || ''} onValueChange={value => setDraft(current => current && { ...current, assigneeId: value })}>
              <SelectTrigger id="rule-assignee" className={TAP_INPUT}><SelectValue placeholder={staffOptions.length ? 'Select person' : 'No eligible staff'} /></SelectTrigger>
              <SelectContent>{staffOptions.map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field id="rule-priority" label="Priority" error={fieldErrors.priority} hint="Higher runs first">
            <Input id="rule-priority" className={TAP_INPUT} inputMode="numeric" value={draft?.priority || ''} aria-invalid={Boolean(fieldErrors.priority)} onChange={event => setDraft(current => current && { ...current, priority: event.target.value })} />
          </Field>
          <Field id="rule-response" label="First response (minutes)" error={fieldErrors.firstResponseMinutes}>
            <Input id="rule-response" className={TAP_INPUT} inputMode="numeric" value={draft?.firstResponseMinutes || ''} aria-invalid={Boolean(fieldErrors.firstResponseMinutes)} onChange={event => setDraft(current => current && { ...current, firstResponseMinutes: event.target.value })} />
          </Field>
          <label htmlFor="rule-active" className="flex min-h-11 items-center gap-3 text-sm sm:col-span-2">
            <Switch id="rule-active" checked={draft?.active ?? true} onCheckedChange={checked => setDraft(current => current && { ...current, active: checked })} />
            Active
          </label>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={pending !== null}
        title={`Delete ${pending?.name || 'rule'}?`}
        confirmLabel="Delete"
        busy={busy}
        error={formError}
        onConfirm={confirmDelete}
        onOpenChange={value => { if (!value) { setPending(null); setFormError(null) } }}
      />
    </div>
  )
}
