'use client'

import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, Search, UserPlus } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DeskSection, DeskTable, Notice, Panel, Pill, Segmented, Status, Td, Th, Tr, Track, type DeskTone } from '@/features/platform/components/desk'
import { changeMembership, createStaffUser, type MembershipChangeInput } from '../actions'
import { roleIsTenantAssignable } from '../lib/permissions'
import type { DealerGroup, Membership, MembershipAuditEvent, MembershipStatus, Role, Rooftop, ScopeType, StaffOption, Viewer } from '../lib/types'
import { Field, FormDialog, fieldA11y, formatDate, formatWhen, type FieldErrors } from './FormDialog'

export const MEMBERSHIP_STATUS: Record<MembershipStatus, { label: string; tone: DeskTone }> = {
  active: { label: 'Active', tone: 'ok' },
  invited: { label: 'Invited', tone: 'info' },
  suspended: { label: 'Suspended', tone: 'warn' },
  revoked: { label: 'Removed', tone: 'idle' },
}

const MEMBERSHIP_STATUS_PT: Record<MembershipStatus, string> = {
  active: 'Ativo', invited: 'Convidado', suspended: 'Suspenso', revoked: 'Removido',
}

type StatusFilter = MembershipStatus | 'all'
type ChangeKind = 'activate' | 'suspend' | 'reactivate' | 'remove' | 'role'

const CHANGE_COPY: Record<ChangeKind, { title: string; submit: string; done: string; status?: MembershipStatus; danger?: boolean }> = {
  activate: { title: 'Activate access', submit: 'Activate', done: 'Access activated', status: 'active' },
  suspend: { title: 'Suspend access', submit: 'Suspend', done: 'Access suspended', status: 'suspended', danger: true },
  reactivate: { title: 'Reactivate access', submit: 'Reactivate', done: 'Access reactivated', status: 'active' },
  remove: { title: 'Remove access', submit: 'Remove', done: 'Access removed', status: 'revoked', danger: true },
  role: { title: 'Change role', submit: 'Save', done: 'Access updated' },
}

type ChangeState = { kind: ChangeKind; membership: Membership; roleId: string; accessAllRooftops: boolean; reason: string }

type GrantState = {
  mode: 'existing' | 'invite'
  userId: string
  name: string
  email: string
  password: string
  scope: string
  roleId: string
  status: 'active' | 'invited'
  accessAllRooftops: boolean
  reason: string
}

const EMPTY_GRANT: GrantState = { mode: 'existing', userId: '', name: '', email: '', password: '', scope: '', roleId: '', status: 'active', accessAllRooftops: false, reason: '' }

function scopeValue(scopeType: ScopeType, id: string) {
  return `${scopeType}:${id}`
}

function parseScope(value: string): { scopeType: ScopeType; scopeId: string } | null {
  const index = value.indexOf(':')
  if (index < 0) return null
  const scopeType = value.slice(0, index)
  const scopeId = value.slice(index + 1)
  if ((scopeType !== 'dealer-group' && scopeType !== 'rooftop') || !scopeId) return null
  return { scopeType, scopeId }
}

function personName(person: { name?: string | null; email?: string | null } | null | undefined, pt = false) {
  return person?.name || person?.email || (pt ? 'Pessoa desconhecida' : 'Unknown user')
}

export function AccessSection({
  memberships,
  auditEvents,
  groups,
  rooftops,
  roles,
  staff,
  viewer,
  timeZone,
  errors,
  onChanged,
  initialStatusFilter = 'active',
}: {
  initialStatusFilter?: StatusFilter
  memberships: Membership[]
  auditEvents: MembershipAuditEvent[]
  groups: DealerGroup[]
  rooftops: Rooftop[]
  roles: Role[]
  staff: StaffOption[]
  viewer: Viewer | null
  timeZone: string
  errors: { access?: string; audit?: string; staff?: string }
  onChanged: (message: string) => void
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const copy = (en: string, br: string) => pt ? br : en
  const statusLabel = (status: MembershipStatus) => pt ? MEMBERSHIP_STATUS_PT[status] : MEMBERSHIP_STATUS[status].label
  const changeCopy = (kind: ChangeKind, part: 'title' | 'submit' | 'done') => pt
    ? ({
        activate: { title: 'Ativar acesso', submit: 'Ativar', done: 'Acesso ativado' },
        suspend: { title: 'Suspender acesso', submit: 'Suspender', done: 'Acesso suspenso' },
        reactivate: { title: 'Reativar acesso', submit: 'Reativar', done: 'Acesso reativado' },
        remove: { title: 'Remover acesso', submit: 'Remover', done: 'Acesso removido' },
        role: { title: 'Alterar função', submit: 'Salvar', done: 'Acesso atualizado' },
      } as const)[kind][part]
    : CHANGE_COPY[kind][part]
  const actionError = (message: string) => pt ? 'Não foi possível concluir a alteração. Confira os dados e tente novamente.' : message
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter)
  const [scopeFilter, setScopeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [change, setChange] = useState<ChangeState | null>(null)
  const [grant, setGrant] = useState<GrantState | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const canManage = Boolean(viewer?.canManageDealerships)
  const lockedReason = canManage ? undefined : pt ? 'Requer permissão de administração da concessionária' : 'Requires dealership administration permission'

  const roleNames = useMemo(() => new Map(roles.map(role => [role.id, role.name])), [roles])
  const scopeOptions = useMemo(() => [
    ...groups.map(group => ({ value: scopeValue('dealer-group', group.id), label: `${pt ? 'Grupo' : 'Group'}: ${group.name}` })),
    ...rooftops.map(rooftop => ({ value: scopeValue('rooftop', rooftop.id), label: `${pt ? 'Loja' : 'Rooftop'}: ${rooftop.name} (${rooftop.code})` })),
  ], [groups, rooftops, pt])

  const inScope = (membership: Membership) => scopeFilter === 'all' || scopeValue(membership.scopeType, membership.scopeId) === scopeFilter
  const scoped = memberships.filter(inScope)
  const counts = {
    all: scoped.length,
    active: scoped.filter(row => row.status === 'active').length,
    invited: scoped.filter(row => row.status === 'invited').length,
    suspended: scoped.filter(row => row.status === 'suspended').length,
    revoked: scoped.filter(row => row.status === 'revoked').length,
  }
  const term = search.trim().toLowerCase()
  const visible = scoped
    .filter(row => statusFilter === 'all' || row.status === statusFilter)
    .filter(row => !term || `${row.user?.name || ''} ${row.user?.email || ''} ${row.role?.name || ''} ${row.scopeName}`.toLowerCase().includes(term))
    .sort((a, b) => personName(a.user, pt).localeCompare(personName(b.user, pt)))

  const history = auditEvents
    .filter(event => {
      if (scopeFilter === 'all') return true
      const parsed = parseScope(scopeFilter)
      if (!parsed) return true
      return parsed.scopeType === 'rooftop' ? event.rooftop?.id === parsed.scopeId : event.scopeType === 'dealer-group' && event.dealerGroup?.id === parsed.scopeId
    })
    .filter(event => !term || `${event.targetUser?.name || ''} ${event.targetUser?.email || ''} ${event.actor?.name || ''} ${event.reason}`.toLowerCase().includes(term))

  const assignableRoles = roles.filter(roleIsTenantAssignable)

  const ownReason = (membership: Membership) => (membership.user?.id && membership.user.id === viewer?.id ? copy('You cannot change your own access', 'Você não pode alterar o próprio acesso') : undefined)

  const openChange = (kind: ChangeKind, membership: Membership) => {
    setError(null)
    setFieldErrors({})
    setChange({ kind, membership, roleId: membership.role?.id || '', accessAllRooftops: membership.accessAllRooftops, reason: '' })
  }

  const run = async (input: MembershipChangeInput) => {
    const response = await changeMembership(input)
    if (!response.success) {
      setError(actionError(response.error))
      return false
    }
    return true
  }

  const submitChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!change) return
    const membership = change.membership
    const reason = change.reason.trim()
    const errors: FieldErrors = {}
    if (!change.roleId) errors.role = copy('Role is required', 'Selecione uma função')
    if (!reason) errors.reason = copy('Reason is required', 'Informe o motivo')
    else if (reason.length > 500) errors.reason = copy('500 characters or fewer', 'Use até 500 caracteres')
    setFieldErrors(errors)
    if (Object.keys(errors).length || !membership.user?.id) return
    setBusy(true)
    setError(null)
    const ok = await run({
      scopeType: membership.scopeType,
      scopeId: membership.scopeId,
      targetUserId: membership.user.id,
      roleId: change.roleId,
      status: CHANGE_COPY[change.kind].status ?? membership.status,
      accessAllRooftops: membership.scopeType === 'dealer-group' ? change.accessAllRooftops : false,
      reason,
      expectedUpdatedAt: membership.updatedAt,
    })
    setBusy(false)
    if (!ok) return
    setChange(null)
    onChanged(changeCopy(change.kind, 'done'))
  }

  const openGrant = () => {
    setError(null)
    setFieldErrors({})
    const parsed = parseScope(scopeFilter)
    setGrant({ ...EMPTY_GRANT, scope: parsed ? scopeFilter : scopeOptions.length === 1 ? scopeOptions[0].value : '' })
  }

  const submitGrant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!grant) return
    const parsed = parseScope(grant.scope)
    const reason = grant.reason.trim()
    const errors: FieldErrors = {}
    if (grant.mode === 'existing' && !grant.userId) errors.user = copy('Choose a staff member', 'Selecione uma pessoa da equipe')
    if (grant.mode === 'invite') {
      if (!grant.name.trim()) errors.name = copy('Name is required', 'Informe o nome')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(grant.email.trim())) errors.email = copy('Enter a valid email', 'Informe um e-mail válido')
      else if (staff.some(person => person.email.toLowerCase() === grant.email.trim().toLowerCase())) errors.email = copy('Already on staff; choose Existing staff', 'Esta pessoa já faz parte da equipe; selecione a opção de pessoa existente')
      if (grant.password.length < 8) errors.password = copy('At least 8 characters', 'Use pelo menos 8 caracteres')
    }
    if (!parsed) errors.scope = copy('Choose a dealer group or rooftop', 'Selecione um grupo de lojas ou uma unidade')
    if (!grant.roleId) errors.role = copy('Role is required', 'Selecione uma função')
    if (!reason) errors.reason = copy('Reason is required', 'Informe o motivo')
    else if (reason.length > 500) errors.reason = copy('500 characters or fewer', 'Use até 500 caracteres')
    if (grant.mode === 'existing' && grant.userId && grant.userId === viewer?.id) errors.user = copy('You cannot change your own access', 'Você não pode alterar o próprio acesso')
    setFieldErrors(errors)
    if (Object.keys(errors).length || !parsed) return

    setBusy(true)
    setError(null)
    let userId = grant.userId
    if (grant.mode === 'invite') {
      const created = await createStaffUser({ name: grant.name.trim(), email: grant.email.trim(), password: grant.password })
      if (!created.success || !created.data.createUser) {
        setBusy(false)
        setError(created.success ? copy('Staff login was not created', 'Não foi possível criar o acesso da pessoa') : actionError(created.error))
        if (!created.success && created.fieldErrors) setFieldErrors(created.fieldErrors)
        return
      }
      userId = created.data.createUser.id
    }
    const existing = memberships.find(row => row.scopeType === parsed.scopeType && row.scopeId === parsed.scopeId && row.user?.id === userId)
    const ok = await run({
      scopeType: parsed.scopeType,
      scopeId: parsed.scopeId,
      targetUserId: userId,
      roleId: grant.roleId,
      status: grant.status,
      accessAllRooftops: parsed.scopeType === 'dealer-group' ? grant.accessAllRooftops : false,
      reason,
      expectedUpdatedAt: existing?.updatedAt ?? null,
    })
    setBusy(false)
    if (!ok) {
      if (grant.mode === 'invite') setGrant({ ...grant, mode: 'existing', userId, password: '' })
      return
    }
    setGrant(null)
    onChanged(grant.status === 'invited' ? copy('Invite recorded', 'Convite registrado') : copy('Access granted', 'Acesso concedido'))
  }

  const grantScope = grant ? parseScope(grant.scope) : null
  const grantExisting = grant && grantScope && grant.mode === 'existing' && grant.userId
    ? memberships.find(row => row.scopeType === grantScope.scopeType && row.scopeId === grantScope.scopeId && row.user?.id === grant.userId)
    : undefined

  const describeSnapshot = (event: MembershipAuditEvent) => {
    const before = event.previousSnapshot
    const after = event.nextSnapshot
    const label = (status?: string) => (status && MEMBERSHIP_STATUS[status as MembershipStatus] ? statusLabel(status as MembershipStatus) : status || (pt ? 'Nenhum' : 'None'))
    const parts: ReactNode[] = []
    if (!before) parts.push(<span key="s">{label(after?.status)}</span>)
    else if (before.status !== after?.status) parts.push(<span key="s" className="inline-flex items-center gap-1">{label(before.status)}<ArrowRight className="size-3" aria-label={pt ? 'para' : 'to'} />{label(after?.status)}</span>)
    if (after?.roleId && before?.roleId !== after.roleId) parts.push(<span key="r">{pt ? 'Função' : 'Role'} {roleNames.get(after.roleId) || (pt ? 'alterada' : 'changed')}</span>)
    if (event.scopeType === 'dealer-group' && Boolean(before?.accessAllRooftops) !== Boolean(after?.accessAllRooftops)) parts.push(<span key="a">{pt ? (after?.accessAllRooftops ? 'Acesso a todas as lojas concedido' : 'Acesso a todas as lojas removido') : (after?.accessAllRooftops ? 'All rooftops granted' : 'All rooftops removed')}</span>)
    return parts
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Segmented<StatusFilter>
          label={pt ? 'Filtrar acessos por status' : 'Filter access by status'}
            value={statusFilter}
            onChange={setStatusFilter}
            size="sm"
            options={[
              { value: 'active', label: pt ? 'Ativos' : 'Active', count: counts.active, tone: 'ok' },
              { value: 'invited', label: pt ? 'Convidados' : 'Invited', count: counts.invited, tone: 'info' },
              { value: 'suspended', label: pt ? 'Suspensos' : 'Suspended', count: counts.suspended, tone: 'warn' },
              { value: 'revoked', label: pt ? 'Removidos' : 'Removed', count: counts.revoked, tone: 'idle' },
              { value: 'all', label: pt ? 'Todos' : 'All', count: counts.all },
            ]}
          />
          <Track>
            <Pill variant="primary" className="h-11 sm:h-8" disabled={!canManage || !scopeOptions.length} title={!scopeOptions.length ? (pt ? 'Nenhum grupo ou loja cadastrado' : 'No dealer group or rooftop') : lockedReason} onClick={openGrant}>
              <UserPlus />
              {pt ? 'Conceder acesso' : 'Grant access'}
            </Pill>
          </Track>
        </div>
        {!canManage && <p className="text-xs text-muted-foreground">{lockedReason}</p>}
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 sm:max-w-sm sm:flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-11 pl-9 sm:h-9" value={search} onChange={event => setSearch(event.target.value)} placeholder={pt ? 'Nome, e-mail, função ou motivo' : 'Name, email, role or reason'} aria-label={pt ? 'Buscar acessos' : 'Search access'} />
          </div>
          <Select value={scopeFilter} onValueChange={setScopeFilter}>
            <SelectTrigger className="h-11 w-full sm:h-9 sm:w-[260px]" aria-label={pt ? 'Filtrar por escopo' : 'Filter by scope'}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{pt ? 'Todos os grupos e lojas' : 'All groups and rooftops'}</SelectItem>
              {scopeOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <DeskSection title={pt ? 'Membros' : 'Members'} count={visible.length}>
        {errors.access ? (
            <Notice tone="bad">{pt ? 'Acessos indisponíveis:' : 'Access unavailable:'} {errors.access}</Notice>
        ) : visible.length === 0 ? (
          <Panel className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">{memberships.length ? (pt ? 'Nenhum membro encontrado' : 'No matching members') : (pt ? 'Nenhum acesso cadastrado' : 'No memberships')}</p>
            {memberships.length > 0 && (
              <Track><Pill size="sm" onClick={() => { setSearch(''); setStatusFilter('all'); setScopeFilter('all') }}>{pt ? 'Limpar filtros' : 'Reset filters'}</Pill></Track>
            )}
          </Panel>
        ) : (
          <DeskTable aria-label={pt ? 'Membros' : 'Members'}>
            <thead>
              <tr>
                <Th>{pt ? 'Membro' : 'Member'}</Th>
                <Th priority={2}>{pt ? 'Escopo' : 'Scope'}</Th>
                <Th priority={2}>{pt ? 'Função' : 'Role'}</Th>
                <Th>{pt ? 'Situação' : 'Status'}</Th>
                <Th priority={3}>{pt ? 'Entrada' : 'Joined'}</Th>
                <Th align="right"><span className="sr-only">{pt ? 'Ações' : 'Actions'}</span></Th>
              </tr>
            </thead>
            <tbody>
              {visible.map(membership => {
                const state = MEMBERSHIP_STATUS[membership.status] || MEMBERSHIP_STATUS.invited
                const blocked = lockedReason || ownReason(membership)
                const actions: Array<{ kind: ChangeKind; label: string }> =
                  membership.status === 'invited'
                    ? [{ kind: 'activate', label: changeCopy('activate', 'submit') }, { kind: 'remove', label: changeCopy('remove', 'submit') }]
                    : membership.status === 'active'
                      ? [{ kind: 'suspend', label: changeCopy('suspend', 'submit') }, { kind: 'remove', label: changeCopy('remove', 'submit') }]
                      : membership.status === 'suspended'
                        ? [{ kind: 'reactivate', label: changeCopy('reactivate', 'submit') }, { kind: 'remove', label: changeCopy('remove', 'submit') }]
                        : [{ kind: 'reactivate', label: changeCopy('reactivate', 'submit') }]
                return (
                  <Tr key={`${membership.scopeType}:${membership.id}`}>
                    <Td className="max-w-0 min-w-[9rem]">
                      <span className="block truncate font-medium text-foreground">{personName(membership.user, pt)}</span>
                      {membership.user?.email && <span className="block truncate text-xs text-muted-foreground">{membership.user.email}</span>}
                      <span className="block truncate text-xs text-muted-foreground md:hidden">
                        {membership.scopeName} · {membership.role?.name || (pt ? 'Sem função' : 'No role')}
                      </span>
                      {blocked && <span className="block text-xs text-muted-foreground">{blocked}</span>}
                    </Td>
                    <Td priority={2} className="text-muted-foreground">
                      {membership.scopeType === 'dealer-group' ? (pt ? 'Grupo' : 'Group') : (pt ? 'Loja' : 'Rooftop')}: {membership.scopeName}
                      {membership.scopeType === 'dealer-group' && membership.accessAllRooftops ? (pt ? ' · Todas as lojas' : ' · All rooftops') : ''}
                    </Td>
                    <Td priority={2}>{membership.role?.name || <span className="text-muted-foreground">{pt ? 'Sem função' : 'No role'}</span>}</Td>
                    <Td><Status tone={state.tone}>{statusLabel(membership.status)}</Status></Td>
                    <Td priority={3} className="whitespace-nowrap text-muted-foreground">
                      {membership.joinedAt ? formatDate(membership.joinedAt, timeZone) : (pt ? 'Ainda não' : 'Not yet')}
                      {membership.invitedBy?.name ? <span className="block text-xs">{pt ? 'Convidado por' : 'Added by'} {membership.invitedBy.name}</span> : null}
                    </Td>
                    <Td align="right" className="w-px whitespace-nowrap">
                      <div className="inline-flex flex-wrap justify-end gap-1">
                        {actions.map(action => (
                          <Pill key={action.kind} size="sm" className="h-11 sm:h-7" disabled={Boolean(blocked)} title={blocked} onClick={() => openChange(action.kind, membership)}>
                            {action.label}
                          </Pill>
                        ))}
                        <Pill size="sm" className="h-11 sm:h-7" disabled={Boolean(blocked)} title={blocked} onClick={() => openChange('role', membership)}>
                          {pt ? 'Função' : 'Role'}
                        </Pill>
                      </div>
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </DeskTable>
        )}
      </DeskSection>

      <DeskSection title={pt ? 'Histórico' : 'History'} count={history.length}>
        {errors.audit ? (
          <Notice tone="bad">{pt ? 'Histórico indisponível:' : 'History unavailable:'} {errors.audit}</Notice>
        ) : !canManage ? (
          <Notice>{lockedReason}</Notice>
        ) : history.length === 0 ? (
          <Panel className="px-4 py-10 text-center"><p className="text-sm text-muted-foreground">{pt ? 'Nenhuma alteração de acesso' : 'No access changes'}</p></Panel>
        ) : (
          <DeskTable aria-label={pt ? 'Histórico de acessos' : 'Access history'}>
            <thead>
              <tr>
                <Th>{pt ? 'Membro' : 'Member'}</Th>
                <Th>{pt ? 'Alteração' : 'Change'}</Th>
                <Th priority={2}>{pt ? 'Motivo' : 'Reason'}</Th>
                <Th priority={3}>{pt ? 'Responsável' : 'By'}</Th>
                <Th align="right">{pt ? 'Quando' : 'When'}</Th>
              </tr>
            </thead>
            <tbody>
              {history.map(event => (
                <Tr key={event.id}>
                  <Td className="max-w-0 min-w-[8rem]">
                    <span className="block truncate font-medium text-foreground">{personName(event.targetUser, pt)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {event.rooftop ? `${pt ? 'Loja' : 'Rooftop'}: ${event.rooftop.name}` : event.dealerGroup ? `${pt ? 'Grupo' : 'Group'}: ${event.dealerGroup.name}` : ''}
                    </span>
                  </Td>
                  <Td>
                    <span className="block font-medium text-foreground">
                      {event.action === 'created' ? (pt ? 'Concedido' : 'Granted') : event.action === 'onboarding-bootstrap' ? (pt ? 'Configuração inicial' : 'Setup') : (pt ? 'Alterado' : 'Changed')}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      {describeSnapshot(event).map((part, index) => <span key={index}>{part}</span>)}
                    </span>
                  </Td>
                  <Td priority={2} className="max-w-[20rem] break-words text-foreground">{event.reason}</Td>
                  <Td priority={3} className="text-muted-foreground">{event.actor?.name || (pt ? 'Sistema' : 'System')}</Td>
                  <Td align="right" className="whitespace-nowrap text-xs text-muted-foreground">{formatWhen(event.occurredAt, timeZone)}</Td>
                </Tr>
              ))}
            </tbody>
          </DeskTable>
        )}
      </DeskSection>

      <FormDialog
        open={Boolean(change)}
        title={change ? `${changeCopy(change.kind, 'title')}: ${personName(change.membership.user, pt)}` : ''}
        error={error}
        busy={busy}
        submitLabel={change ? changeCopy(change.kind, 'submit') : (pt ? 'Salvar' : 'Save')}
        submitVariant={change && CHANGE_COPY[change.kind].danger ? 'danger' : 'primary'}
        onSubmit={submitChange}
        onOpenChange={open => { if (!open) setChange(null) }}
      >
        {change && (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">{change.membership.scopeType === 'dealer-group' ? (pt ? 'Grupo' : 'Group') : (pt ? 'Loja' : 'Rooftop')}: {change.membership.scopeName}</p>
            {change.kind === 'role' && (
              <>
                <Field id="change-role" label={pt ? 'Função' : 'Role'} error={fieldErrors.role}>
                  <Select value={change.roleId} onValueChange={value => setChange({ ...change, roleId: value })}>
                    <SelectTrigger {...fieldA11y('change-role', fieldErrors.role)} className="h-11 sm:h-9"><SelectValue placeholder={pt ? 'Selecione a função' : 'Select role'} /></SelectTrigger>
                    <SelectContent>
                      {roles.map(role => (
                        <SelectItem key={role.id} value={role.id} disabled={!roleIsTenantAssignable(role)}>
                          {role.name}{roleIsTenantAssignable(role) ? '' : (pt ? ' (permissões administrativas)' : ' (admin permissions)')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {change.membership.scopeType === 'dealer-group' && (
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <Checkbox checked={change.accessAllRooftops} onCheckedChange={value => setChange({ ...change, accessAllRooftops: value === true })} />
                    {pt ? 'Acesso a todas as lojas' : 'Access to all rooftops'}
                  </label>
                )}
              </>
            )}
            {change.kind !== 'role' && !assignableRoles.some(role => role.id === change.roleId) && (
              <Field id="change-role" label={pt ? 'Função' : 'Role'} error={fieldErrors.role}>
                <Select value={change.roleId} onValueChange={value => setChange({ ...change, roleId: value })}>
                  <SelectTrigger {...fieldA11y('change-role', fieldErrors.role)} className="h-11 sm:h-9"><SelectValue placeholder={pt ? 'Selecione a função' : 'Select role'} /></SelectTrigger>
                  <SelectContent>{assignableRoles.map(role => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            )}
            <Field id="change-reason" label={pt ? 'Motivo' : 'Reason'} error={fieldErrors.reason}>
              <Textarea {...fieldA11y('change-reason', fieldErrors.reason)} rows={3} maxLength={500} value={change.reason} onChange={event => setChange({ ...change, reason: event.target.value })} />
            </Field>
          </div>
        )}
      </FormDialog>

      <FormDialog
        open={Boolean(grant)}
        title={pt ? 'Conceder acesso' : 'Grant access'}
        error={error}
        busy={busy}
        submitLabel={pt ? (grant?.status === 'invited' ? 'Enviar convite' : 'Conceder acesso') : grant?.status === 'invited' ? 'Invite' : 'Grant'}
        onSubmit={submitGrant}
        onOpenChange={open => { if (!open) setGrant(null) }}
        wide
      >
        {grant && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Segmented<'existing' | 'invite'>
                label={pt ? 'Pessoa' : 'Who'}
                value={grant.mode}
                onChange={mode => { setFieldErrors({}); setGrant({ ...grant, mode }) }}
                size="sm"
                options={[
                  { value: 'existing', label: pt ? 'Pessoa da equipe existente' : 'Existing staff' },
                  { value: 'invite', label: pt ? 'Criar acesso para nova pessoa' : 'New staff login', disabled: !viewer?.canManagePeople },
                ]}
              />
              {!viewer?.canManagePeople && <p className="mt-1 text-xs text-muted-foreground">{pt ? 'Criar acessos exige permissão de gestão de pessoas' : 'New logins require people management permission'}</p>}
            </div>
            {grant.mode === 'existing' ? (
              <Field id="grant-user" label={pt ? 'Pessoa da equipe' : 'Staff member'} error={fieldErrors.user || errors.staff} className="sm:col-span-2">
                <Select value={grant.userId} onValueChange={value => setGrant({ ...grant, userId: value })}>
                  <SelectTrigger {...fieldA11y('grant-user', fieldErrors.user)} className="h-11 sm:h-9"><SelectValue placeholder={staff.length ? (pt ? 'Selecione uma pessoa' : 'Select staff member') : (pt ? 'Nenhuma pessoa da equipe' : 'No staff')} /></SelectTrigger>
                  <SelectContent>
                    {staff.map(person => (
                      <SelectItem key={person.id} value={person.id} disabled={person.id === viewer?.id}>
                        {person.name} · {person.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <>
                <Field id="grant-name" label={pt ? 'Nome' : 'Name'} error={fieldErrors.name}>
                  <Input {...fieldA11y('grant-name', fieldErrors.name)} className="h-11 sm:h-9" value={grant.name} maxLength={200} onChange={event => setGrant({ ...grant, name: event.target.value })} />
                </Field>
                <Field id="grant-email" label={pt ? 'E-mail' : 'Email'} error={fieldErrors.email}>
                  <Input {...fieldA11y('grant-email', fieldErrors.email)} className="h-11 sm:h-9" type="email" value={grant.email} maxLength={320} onChange={event => setGrant({ ...grant, email: event.target.value })} />
                </Field>
                <Field id="grant-password" label={pt ? 'Senha temporária' : 'Temporary password'} error={fieldErrors.password} className="sm:col-span-2">
                  <Input {...fieldA11y('grant-password', fieldErrors.password)} className="h-11 sm:h-9" type="password" autoComplete="new-password" value={grant.password} onChange={event => setGrant({ ...grant, password: event.target.value })} />
                </Field>
              </>
            )}
            <Field id="grant-scope" label={pt ? 'Grupo de lojas ou unidade' : 'Dealer group or rooftop'} error={fieldErrors.scope} className="sm:col-span-2">
              <Select value={grant.scope} onValueChange={value => setGrant({ ...grant, scope: value, accessAllRooftops: value.startsWith('dealer-group:') ? grant.accessAllRooftops : false })}>
                <SelectTrigger {...fieldA11y('grant-scope', fieldErrors.scope)} className="h-11 sm:h-9"><SelectValue placeholder={pt ? 'Selecione o escopo' : 'Select scope'} /></SelectTrigger>
                <SelectContent>{scopeOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field id="grant-role" label={pt ? 'Função' : 'Role'} error={fieldErrors.role}>
              <Select value={grant.roleId} onValueChange={value => setGrant({ ...grant, roleId: value })}>
                <SelectTrigger {...fieldA11y('grant-role', fieldErrors.role)} className="h-11 sm:h-9"><SelectValue placeholder={assignableRoles.length ? (pt ? 'Selecione a função' : 'Select role') : (pt ? 'Nenhuma função disponível' : 'No assignable roles')} /></SelectTrigger>
                <SelectContent>
                  {roles.map(role => (
                    <SelectItem key={role.id} value={role.id} disabled={!roleIsTenantAssignable(role)}>
                          {role.name}{roleIsTenantAssignable(role) ? '' : (pt ? ' (permissões administrativas)' : ' (admin permissions)')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="grant-status" label={pt ? 'Situação' : 'Status'}>
              <Select value={grant.status} onValueChange={value => setGrant({ ...grant, status: value as GrantState['status'] })}>
                <SelectTrigger id="grant-status" className="h-11 sm:h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{pt ? 'Ativo agora' : 'Active now'}</SelectItem>
                  <SelectItem value="invited">{pt ? 'Convidado' : 'Invited'}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {grantScope?.scopeType === 'dealer-group' && (
              <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
                <Checkbox checked={grant.accessAllRooftops} onCheckedChange={value => setGrant({ ...grant, accessAllRooftops: value === true })} />
                {pt ? 'Acesso a todas as lojas' : 'Access to all rooftops'}
              </label>
            )}
            {grantExisting && (
              <Notice tone="warn" className="sm:col-span-2">
                {pt
                  ? `Esta pessoa já está ${statusLabel(grantExisting.status).toLowerCase()} nesta unidade como ${grantExisting.role?.name || 'sem função'}; ao salvar, o acesso atual será substituído.`
                  : `Already ${MEMBERSHIP_STATUS[grantExisting.status]?.label.toLowerCase()} here as ${grantExisting.role?.name || 'no role'}; saving replaces it`}
              </Notice>
            )}
            <Field id="grant-reason" label={pt ? 'Motivo' : 'Reason'} error={fieldErrors.reason} className="sm:col-span-2">
              <Textarea {...fieldA11y('grant-reason', fieldErrors.reason)} rows={3} maxLength={500} value={grant.reason} onChange={event => setGrant({ ...grant, reason: event.target.value })} />
            </Field>
          </div>
        )}
      </FormDialog>
    </div>
  )
}
