'use client'

import { useMemo, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, KeyRound, Pencil, Plus, RefreshCw, Search } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { useLocale } from '@/features/i18n/LocaleProvider'
import type { Locale } from '@/features/i18n/messages'
import { Attention, Code, DeskHeader, DeskSection, DeskTable, Notice, Panel, Pill, Segmented, Status, Td, Th, Tr, Track, type DeskTone } from '@/features/platform/components/desk'
import { dayKey } from '@/features/platform/lib/format'
import { Field, FormDialog, fieldA11y, formatDate, formatWhen, type FieldErrors } from '@/features/platform/organization/components/FormDialog'
import { createApiKey, setApiKeyStatus, updateApiKey } from '../actions'
import { API_KEY_SCOPES, endOfDayInZone, type ApiKey, type ApiKeyStatus, type ApiKeysData } from '../lib/scopes'

type Filter = 'active' | 'inactive' | 'expired' | 'revoked' | 'all'
type FormState = { key: ApiKey | null; name: string; scopes: string[]; expiresOn: string; ips: string }
type StatusChange = { key: ApiKey; status: ApiKeyStatus }

const SCOPE_LABEL = new Map(API_KEY_SCOPES.map(scope => [scope.value, scope.label]))
const apiKeyLabelsPt: Record<string, string> = {
  Dashboard: 'Painel', Platform: 'Plataforma', 'API keys': 'Chaves de API', Unavailable: 'Indisponível', Active: 'Ativa', Inactive: 'Inativa', Expired: 'Expirada', Revoked: 'Revogada', All: 'Todas',
  Refresh: 'Atualizar', 'New key': 'Nova chave', 'Your permissions allow no API scopes': 'Suas permissões não permitem nenhum escopo de API', 'Needs you': 'Aguardando sua ação', Key: 'Chave', Status: 'Situação', 'Last used': 'Último uso', Actions: 'Ações', Never: 'Nunca',
  'Change expiry': 'Alterar validade', Revoke: 'Revogar', 'Filter API keys': 'Filtrar chaves de API', 'Name, prefix or scope': 'Nome, prefixo ou escopo', 'Search API keys': 'Buscar chaves de API',
  'API keys unavailable': 'Não foi possível carregar as chaves de API', Retry: 'Tentar novamente', 'No matching API keys': 'Nenhuma chave de API encontrada', 'No API keys': 'Nenhuma chave de API', 'Reset filters': 'Limpar filtros', Scopes: 'Escopos', Expires: 'Validade', Requests: 'Solicitações', 'Allowed IPs': 'IPs permitidos', Created: 'Criada', 'No scopes': 'Sem escopos', 'No expiry': 'Sem validade', 'Any IP': 'Qualquer IP', Deactivate: 'Desativar', Activate: 'Ativar', Edit: 'Editar',
  'Edit API key': 'Editar chave de API', 'New API key': 'Nova chave de API', Save: 'Salvar', 'Create key': 'Criar chave', Name: 'Nome', 'Inventory syndication': 'Integração de estoque', 'Blank for no expiry': 'Deixe em branco para não definir validade', 'One per line; blank for any': 'Um por linha; deixe em branco para permitir qualquer IP',
  'not in your permissions': 'não incluído nas suas permissões', 'Name is required': 'Informe o nome', 'Choose at least one scope': 'Selecione pelo menos um escopo', 'Enter a valid date': 'Informe uma data válida', 'Must be in the future': 'A data deve ser futura', 'API key saved': 'Chave de API salva', 'API key revoked': 'Chave de API revogada', 'API key deactivated': 'Chave de API desativada', 'API key activated': 'Chave de API ativada',
  'Change expiry for': 'Alterar validade de', 'Revoked keys cannot be reactivated': 'Chaves revogadas não podem ser reativadas', 'Expired; requests stay refused until the expiry is changed': 'Expirada; as solicitações continuarão recusadas até que a validade seja alterada',
  'Shown once. Copy it now.': 'Este segredo será exibido uma única vez. Copie agora.', Secret: 'Segredo', Copied: 'Copiado', Copy: 'Copiar', Done: 'Concluir', Dismiss: 'Dispensar', IPs: 'IPs', active: 'ativas', inactive: 'inativas', expired: 'expiradas', revoked: 'revogadas',
  'View vehicle inventory': 'Consultar estoque de veículos', 'Manage vehicle inventory': 'Gerenciar estoque de veículos', 'Manage leads and customers': 'Gerenciar leads e clientes', 'Manage deals': 'Gerenciar negociações', 'Manage service appointments and repair orders': 'Gerenciar agendamentos e ordens de serviço', 'View reports': 'Consultar relatórios',
  '200 characters or fewer': 'Use até 200 caracteres', 'Unknown scope': 'Escopo desconhecido', 'Check the highlighted fields': 'Confira os campos destacados', '50 addresses or fewer': 'Informe no máximo 50 endereços',
  'Only scopes your own permissions allow': 'Você só pode selecionar escopos permitidos pelas suas próprias permissões', 'API key was not created': 'Não foi possível criar a chave de API', 'API key not found': 'Chave de API não encontrada',
}

function apiKeyLabel(locale: Locale, value: string) {
  if (locale !== 'pt-BR') return value
  if (value.startsWith('Not an IP address: ')) return `Endereço IP inválido: ${value.slice('Not an IP address: '.length)}`
  return apiKeyLabelsPt[value] || value
}

function isExpired(key: ApiKey) {
  return Boolean(key.expiresAt && Date.parse(key.expiresAt) <= Date.now())
}

function keyState(key: ApiKey, locale: Locale): { tone: DeskTone; label: string; filter: Filter } {
  if (key.status === 'revoked') return { tone: 'idle', label: apiKeyLabel(locale, 'Revoked'), filter: 'revoked' }
  if (isExpired(key)) return { tone: 'bad', label: apiKeyLabel(locale, 'Expired'), filter: 'expired' }
  if (key.status === 'inactive') return { tone: 'warn', label: apiKeyLabel(locale, 'Inactive'), filter: 'inactive' }
  return { tone: 'ok', label: apiKeyLabel(locale, 'Active'), filter: 'active' }
}

function parseIps(text: string) {
  return [...new Set(text.split(/[\s,]+/).map(value => value.trim()).filter(Boolean))]
}

export function ApiKeysPageClient({ data, timeZone }: { data: ApiKeysData; timeZone: string }) {
  const { locale } = useLocale()
  const text = (value: string) => apiKeyLabel(locale, value)
  const scopeLabel = (value: string) => {
    const scope = API_KEY_SCOPES.find(item => item.value === value)
    return scope ? text(scope.label) : SCOPE_LABEL.get(value) || value
  }
  const router = useRouter()
  const [refreshing, startRefresh] = useTransition()
  const [filter, setFilter] = useState<Filter>('active')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const [statusChange, setStatusChange] = useState<StatusChange | null>(null)
  const [secret, setSecret] = useState<{ name: string; token: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = () => startRefresh(() => router.refresh())
  const grantable = new Set(data.grantableScopes)

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { active: 0, inactive: 0, expired: 0, revoked: 0, all: data.keys.length }
    for (const key of data.keys) result[keyState(key, locale).filter] += 1
    return result
  }, [data.keys, locale])

  const term = search.trim().toLowerCase()
  const visible = data.keys
    .filter(key => filter === 'all' || keyState(key, locale).filter === filter)
    .filter(key => !term || `${key.name} ${key.tokenPreview || ''} ${(key.scopes || []).join(' ')}`.toLowerCase().includes(term))

  const openForm = (key: ApiKey | null) => {
    setFieldErrors({})
    setError(null)
    setForm({
      key,
      name: key?.name || '',
      scopes: key?.scopes || [],
      expiresOn: key?.expiresAt ? dayKey(key.expiresAt, timeZone) : '',
      ips: (key?.restrictedToIPs || []).join('\n'),
    })
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form) return
    const errors: FieldErrors = {}
    const name = form.name.trim()
    if (!name) errors.name = text('Name is required')
    if (!form.scopes.length) errors.scopes = text('Choose at least one scope')
    let expiresAt: string | null = null
    if (form.expiresOn) {
      const at = endOfDayInZone(form.expiresOn, timeZone)
      if (!at || Number.isNaN(at.getTime())) errors.expiresAt = text('Enter a valid date')
      else if (at.getTime() <= Date.now()) errors.expiresAt = text('Must be in the future')
      else expiresAt = at.toISOString()
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    setBusy(true)
    setError(null)
    const input = { name, scopes: form.scopes, expiresAt, restrictedToIPs: parseIps(form.ips) }
    if (form.key) {
      const response = await updateApiKey(form.key.id, input)
      setBusy(false)
      if (!response.success) { setError(response.error); setFieldErrors(Object.fromEntries(Object.entries(response.fieldErrors || {}).map(([key, value]) => [key, text(value)]))); return }
      setForm(null)
      setNotice(text('API key saved'))
      refresh()
      return
    }
    const response = await createApiKey(input)
    setBusy(false)
    if (!response.success) { setError(response.error); setFieldErrors(Object.fromEntries(Object.entries(response.fieldErrors || {}).map(([key, value]) => [key, text(value)]))); return }
    setForm(null)
    setCopied(false)
    setSecret({ name: response.data.key.name, token: response.data.token })
    refresh()
  }

  const submitStatus = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!statusChange) return
    setBusy(true)
    setError(null)
    const response = await setApiKeyStatus(statusChange.key.id, statusChange.status)
    setBusy(false)
    if (!response.success) { setError(response.error); return }
    setStatusChange(null)
    setNotice(text(statusChange.status === 'revoked' ? 'API key revoked' : statusChange.status === 'inactive' ? 'API key deactivated' : 'API key activated'))
    refresh()
  }

  const copySecret = async () => {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret.token)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  // Needs you: keys past their expiry that were never revoked, oldest expiry first. Integrations using them are being refused.
  const expiredKeys = data.keys
    .filter(key => key.status !== 'revoked' && isExpired(key))
    .sort((a, b) => Date.parse(a.expiresAt || '') - Date.parse(b.expiresAt || ''))

  const breadcrumbs = [
    { type: 'link' as const, label: text('Dashboard'), href: basePath },
    { type: 'page' as const, label: text('Platform') },
    { type: 'page' as const, label: text('API keys') },
  ]

  const header = (
    <DeskHeader
      title={text('API keys')}
      status={data.error ? text('Unavailable') : `${counts.active} ${text('active')}`}
      meta={data.error ? text('Unavailable') : `${counts.active} ${text('active')} · ${counts.inactive} ${text('inactive')} · ${counts.expired} ${text('expired')} · ${counts.revoked} ${text('revoked')}`}
      actions={
        <>
          <Pill variant="plain" className="h-11 sm:h-8" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
            {text('Refresh')}
          </Pill>
          <Pill variant="primary" className="h-11 sm:h-8" onClick={() => openForm(null)} disabled={Boolean(data.error) || !data.grantableScopes.length} title={!data.grantableScopes.length ? text('Your permissions allow no API scopes') : undefined}>
            <Plus />
            {text('New key')}
          </Pill>
        </>
      }
    />
  )

  return (
    <PageContainer title={text('API keys')} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-4 px-4 pb-24 md:px-6">
        {notice && (
          <Notice tone="ok">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0">{notice}</p>
              <Track><Pill size="sm" variant="plain" onClick={() => setNotice(null)}>{text('Dismiss')}</Pill></Track>
            </div>
          </Notice>
        )}
        {!data.error && !data.grantableScopes.length && <Notice tone="warn">{text('Your permissions allow no API scopes')}</Notice>}
        {!data.error && expiredKeys.length > 0 && (
          <DeskSection title={text('Needs you')} count={expiredKeys.length} id="api-keys-needs-you" className="pb-4">
            <DeskTable aria-labelledby="api-keys-needs-you">
              <thead>
                <tr>
                  <Th>{text('Key')}</Th>
                  <Th>{text('Status')}</Th>
                  <Th priority={2}>{text('Last used')}</Th>
                  <Th align="right"><span className="sr-only">{text('Actions')}</span></Th>
                </tr>
              </thead>
              <tbody>
                {expiredKeys.map(key => (
                  <Tr key={key.id}>
                    <Td className="max-w-0 min-w-[9rem]">
                      <span className="block truncate font-medium text-foreground">{key.name}</span>
                      <Code>{key.tokenPreview || ''}</Code>
                    </Td>
                    <Td><Attention>{text('Expired')} {key.expiresAt ? formatDate(key.expiresAt, timeZone, locale) : ''}</Attention></Td>
                    <Td priority={2} className="whitespace-nowrap text-muted-foreground">{key.lastUsedAt ? formatWhen(key.lastUsedAt, timeZone, locale) : text('Never')}</Td>
                    <Td align="right" className="w-px whitespace-nowrap">
                      <div className="inline-flex gap-1">
                        <Pill size="sm" className="h-11 sm:h-7" onClick={() => openForm(key)} aria-label={`${text('Change expiry for')} ${key.name}`}>{text('Change expiry')}</Pill>
                        <Pill size="sm" variant="plain" className="h-11 sm:h-7" onClick={() => { setError(null); setStatusChange({ key, status: 'revoked' }) }}>{text('Revoke')}</Pill>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </DeskTable>
          </DeskSection>
        )}
        <Segmented<Filter>
          label={text('Filter API keys')}
          value={filter}
          onChange={setFilter}
          size="sm"
          options={[
            { value: 'active', label: text('Active'), count: counts.active, tone: 'ok' },
            { value: 'inactive', label: text('Inactive'), count: counts.inactive, tone: 'warn' },
            { value: 'expired', label: text('Expired'), count: counts.expired, tone: 'bad' },
            { value: 'revoked', label: text('Revoked'), count: counts.revoked, tone: 'idle' },
            { value: 'all', label: text('All'), count: counts.all },
          ]}
        />
        <div className="relative min-w-0 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-11 pl-9 sm:h-9" value={search} onChange={event => setSearch(event.target.value)} placeholder={text('Name, prefix or scope')} aria-label={text('Search API keys')} />
        </div>

        {data.error ? (
          <Notice tone="bad">
            <p className="font-medium">{text('API keys unavailable')}</p>
            <p className="mt-0.5 text-muted-foreground">{text(data.error)}</p>
            <Track className="mt-2"><Pill size="sm" onClick={refresh}>{text('Retry')}</Pill></Track>
          </Notice>
        ) : visible.length === 0 ? (
          <Panel className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <KeyRound className="size-5 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{text(data.keys.length ? 'No matching API keys' : 'No API keys')}</p>
            {data.keys.length > 0 && <Track><Pill size="sm" onClick={() => { setSearch(''); setFilter('all') }}>{text('Reset filters')}</Pill></Track>}
          </Panel>
        ) : (
          <DeskTable aria-label={text('API keys')}>
            <thead>
              <tr>
                <Th>{text('Key')}</Th>
                <Th priority={3}>{text('Scopes')}</Th>
                <Th>{text('Status')}</Th>
                <Th priority={2}>{text('Expires')}</Th>
                <Th priority={2}>{text('Last used')}</Th>
                <Th align="right" priority={3}>{text('Requests')}</Th>
                <Th priority={3}>{text('Allowed IPs')}</Th>
                <Th align="right"><span className="sr-only">{text('Actions')}</span></Th>
              </tr>
            </thead>
            <tbody>
              {visible.map(key => {
                const state = keyState(key, locale)
                const scopes = key.scopes || []
                const ips = key.restrictedToIPs || []
                return (
                  <Tr key={key.id}>
                    <Td className="max-w-0 min-w-[9rem]">
                      <span className="block truncate font-medium text-foreground">{key.name}</span>
                      <span className="block truncate"><Code>{key.tokenPreview || ''}</Code></span>
                      {key.createdAt && <span className="block truncate text-xs text-muted-foreground">{text('Created')} {formatDate(key.createdAt, timeZone, locale)}</span>}
                    </Td>
                    <Td priority={3} className="max-w-[16rem] text-muted-foreground">
                      <span className="line-clamp-2">{scopes.length ? scopes.map(scopeLabel).join(', ') : text('No scopes')}</span>
                    </Td>
                    <Td><Status tone={state.tone}>{state.label}</Status></Td>
                    <Td priority={2} className="whitespace-nowrap text-muted-foreground">{key.expiresAt ? formatDate(key.expiresAt, timeZone, locale) : text('No expiry')}</Td>
                    <Td priority={2} className="whitespace-nowrap text-muted-foreground">{key.lastUsedAt ? formatWhen(key.lastUsedAt, timeZone, locale) : text('Never')}</Td>
                    <Td align="right" priority={3}>{key.usageCount?.total ?? 0}</Td>
                    <Td priority={3}>{ips.length ? <Code>{ips.length === 1 ? ips[0] : `${ips.length} ${text('IPs')}`}</Code> : <span className="text-muted-foreground">{text('Any IP')}</span>}</Td>
                    <Td align="right" className="w-px whitespace-nowrap">
                      {key.status !== 'revoked' && (
                        <div className="inline-flex flex-wrap justify-end gap-1">
                          {key.status === 'active' ? (
                            <Pill size="sm" className="h-11 sm:h-7" onClick={() => { setError(null); setStatusChange({ key, status: 'inactive' }) }}>{text('Deactivate')}</Pill>
                          ) : (
                            <Pill size="sm" className="h-11 sm:h-7" onClick={() => { setError(null); setStatusChange({ key, status: 'active' }) }}>{text('Activate')}</Pill>
                          )}
                          <Pill size="sm" className="h-11 sm:h-7" onClick={() => { setError(null); setStatusChange({ key, status: 'revoked' }) }}>{text('Revoke')}</Pill>
                          <Pill size="sm" className="h-11 sm:h-7" onClick={() => openForm(key)} aria-label={`${text('Edit')} ${key.name}`}>
                            <Pencil />
                            {text('Edit')}
                          </Pill>
                        </div>
                      )}
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </DeskTable>
        )}
      </div>

      <FormDialog
        open={Boolean(form)}
        title={text(form?.key ? 'Edit API key' : 'New API key')}
        error={error ? text(error) : error}
        busy={busy}
        submitLabel={text(form?.key ? 'Save' : 'Create key')}
        onSubmit={submit}
        onOpenChange={open => { if (!open) setForm(null) }}
        wide
      >
        {form && (
          <div className="grid gap-4">
            <Field id="key-name" label={text('Name')} error={fieldErrors.name}>
              <Input {...fieldA11y('key-name', fieldErrors.name)} className="h-11 sm:h-9" value={form.name} maxLength={200} placeholder={text('Inventory syndication')} onChange={event => setForm({ ...form, name: event.target.value })} />
            </Field>
            <fieldset className="min-w-0" aria-describedby={fieldErrors.scopes ? 'key-scopes-error' : undefined}>
              <legend className="mb-1 text-[12px] font-medium text-muted-foreground">{text('Scopes')}</legend>
              <div className="grid gap-x-4 sm:grid-cols-2">
                {API_KEY_SCOPES.map(scope => {
                  const allowed = grantable.has(scope.value)
                  const checked = form.scopes.includes(scope.value)
                  return (
                    <label key={scope.value} className={`flex min-h-11 items-start gap-2 py-1 text-sm sm:min-h-9 ${allowed ? '' : 'text-muted-foreground'}`}>
                      <Checkbox
                        className="mt-0.5"
                        checked={checked}
                        disabled={!allowed && !checked}
                        onCheckedChange={value => setForm({ ...form, scopes: value === true ? [...form.scopes, scope.value] : form.scopes.filter(item => item !== scope.value) })}
                      />
                      <span className="min-w-0">
                        {text(scope.label)}
                        <span className="block font-mono text-xs text-muted-foreground">{scope.value}{allowed ? '' : ` · ${text('not in your permissions')}`}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
              {fieldErrors.scopes && <p id="key-scopes-error" className="mt-1 text-xs text-red-700 dark:text-red-300">{fieldErrors.scopes}</p>}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="key-expires" label={text('Expires')} error={fieldErrors.expiresAt} hint={text('Blank for no expiry')}>
                <Input {...fieldA11y('key-expires', fieldErrors.expiresAt)} className="h-11 sm:h-9" type="date" value={form.expiresOn} onChange={event => setForm({ ...form, expiresOn: event.target.value })} />
              </Field>
              <Field id="key-ips" label={text('Allowed IPs')} error={fieldErrors.restrictedToIPs} hint={text('One per line; blank for any')}>
                <Textarea {...fieldA11y('key-ips', fieldErrors.restrictedToIPs)} rows={3} className="font-mono text-sm" value={form.ips} onChange={event => setForm({ ...form, ips: event.target.value })} />
              </Field>
            </div>
          </div>
        )}
      </FormDialog>

      <FormDialog
        open={Boolean(statusChange)}
        title={statusChange ? `${text(statusChange.status === 'revoked' ? 'Revoke' : statusChange.status === 'inactive' ? 'Deactivate' : 'Activate')} ${statusChange.key.name}` : ''}
        error={error ? text(error) : error}
        busy={busy}
        submitLabel={text(statusChange?.status === 'revoked' ? 'Revoke' : statusChange?.status === 'inactive' ? 'Deactivate' : 'Activate')}
        submitVariant={statusChange?.status === 'active' ? 'primary' : 'danger'}
        onSubmit={submitStatus}
        onOpenChange={open => { if (!open) setStatusChange(null) }}
      >
        {statusChange?.status === 'revoked' && <Notice tone="warn">{text('Revoked keys cannot be reactivated')}</Notice>}
        {statusChange?.status === 'active' && isExpired(statusChange.key) && <Notice tone="warn">{text('Expired; requests stay refused until the expiry is changed')}</Notice>}
      </FormDialog>

      <Dialog open={Boolean(secret)} onOpenChange={open => { if (!open) setSecret(null) }}>
        <DialogContent className="sm:max-w-lg" onInteractOutside={event => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{secret?.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Notice tone="warn">{text('Shown once. Copy it now.')}</Notice>
            <label htmlFor="api-key-secret" className="text-[12px] font-medium text-muted-foreground">{text('Secret')}</label>
            <Input id="api-key-secret" readOnly value={secret?.token || ''} className="h-11 font-mono text-xs" onFocus={event => event.currentTarget.select()} />
          </div>
          <DialogFooter className="sm:justify-end">
            <Track>
              <Pill className="h-11 sm:h-8" onClick={copySecret}>
                {copied ? <Check /> : <Copy />}
                {text(copied ? 'Copied' : 'Copy')}
              </Pill>
              <Pill variant="primary" className="h-11 sm:h-8" onClick={() => setSecret(null)}>{text('Done')}</Pill>
            </Track>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
