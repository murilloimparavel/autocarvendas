'use client'

import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { GitMerge, Home, Mail, Pencil, Phone, RefreshCw, SlidersHorizontal, Unlink } from 'lucide-react'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { Code, DeskHeader, DeskSection, Facts, Notice, Panel, Pill, TitleLine, Track, type DeskTone } from '@/features/platform/components/desk'
import { OperatorActionDialog } from '@/features/platform/components/OperatorActionDialog'
import { formatPhone, recordReference } from '@/features/platform/lib/format'
import type { CrmViewer } from '@/features/platform/crm/actions'
import { CLOSED_LEAD_STATUSES, VISIT_STATUSES, formatDateTime, formatDay, leadStatus, personName, sourceLabel } from '@/features/platform/crm/lib/leadOptions'
import {
  getCustomer,
  getDuplicateCandidates,
  linkCustomerHousehold,
  mergeCustomers,
  unlinkCustomerHousehold,
  updateCustomerContact,
  updateCustomerPreferences,
  type CustomerDetail,
  type CustomerLead,
  type DuplicateCandidate,
} from '../actions'
import { CustomerContactDialog, type CustomerContactValues } from '../components/CustomerContactDialog'
import { ContactPreferencesDialog, PREFERENCE_SOURCES, type PreferenceValues } from '../components/ContactPreferencesDialog'
import { HouseholdLinkDialog } from '../components/HouseholdLinkDialog'
import { MergeCustomerDialog, type MergeParty } from '../components/MergeCustomerDialog'

type VehicleRef = { year: number | null; make: string | null; model: string | null } | null

const DEAL_TONE: Record<string, DeskTone> = { pencil: 'idle', submitted: 'warn', approved: 'info', financed: 'info', delivered: 'ok', cancelled: 'bad' }
const SERVICE_TONE: Record<string, DeskTone> = { scheduled: 'info', 'checked-in': 'warn', 'in-progress': 'warn', 'waiting-parts': 'warn', completed: 'ok', cancelled: 'idle' }
const RO_TONE: Record<string, DeskTone> = { estimate: 'idle', approved: 'info', 'in-progress': 'warn', completed: 'ok', invoiced: 'warn', paid: 'ok' }

function vehicleName(vehicle: VehicleRef, pt: boolean) {
  if (!vehicle) return pt ? 'Sem veículo' : 'No vehicle'
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || (pt ? 'Veículo' : 'Vehicle')
}

function money(value: number | null | undefined, pt: boolean) {
  if (value == null) return '-'
  return new Intl.NumberFormat(pt ? 'pt-BR' : 'en-US', { style: 'currency', currency: pt ? 'BRL' : 'USD', maximumFractionDigits: 0 }).format(value)
}

const label = (value: string | null | undefined) => (value ? value.replaceAll('-', ' ') : '-')

function dealStatus(value: string | null | undefined, pt: boolean) {
  if (!value) return undefined
  if (!pt) return value
  return ({ pencil: 'Rascunho', submitted: 'Enviada', approved: 'Aprovada', financed: 'Financiada', delivered: 'Entregue', cancelled: 'Cancelada' } as Record<string, string>)[value] || value
}

function crmLabel(value: string | null | undefined, pt: boolean) {
  if (!value) return '-'
  if (!pt) return label(value)
  const translations: Record<string, string> = {
    scheduled: 'Agendado', arrived: 'Chegou', 'manager-turn': 'Atendimento do gerente', completed: 'Concluído', cancelled: 'Cancelado', 'no-show': 'Não compareceu',
    'checked-in': 'Recepcionado', 'in-progress': 'Em andamento', 'waiting-parts': 'Aguardando peças', estimate: 'Orçamento', approved: 'Aprovado', invoiced: 'Faturado', paid: 'Pago',
    pencil: 'Rascunho', submitted: 'Enviado', financed: 'Financiado', delivered: 'Entregue', 'follow-up-required': 'Requer retorno', 'be-back': 'Retorno agendado', 'not-interested': 'Sem interesse', 'credit-declined': 'Crédito recusado', sold: 'Vendido',
  }
  return translations[value] || label(value)
}

function consentState(consent: boolean | null | undefined, suppressed: boolean | null | undefined, pt: boolean): { text: string; tone: DeskTone } {
  if (suppressed) return { text: pt ? 'Bloqueado' : 'Suppressed', tone: 'bad' }
  if (consent) return { text: pt ? 'Autorizado' : 'Consented', tone: 'ok' }
  return { text: pt ? 'Sem autorização' : 'No consent', tone: 'idle' }
}

function snapshotSummary(snapshot: any) {
  const value = snapshot?.mergedAfter || snapshot
  if (!value || typeof value !== 'object') return ''
  const channels = (['email', 'sms', 'phone'] as const).map(channel => {
    const state = value[`${channel}Suppressed`] ? 'suppressed' : value[`${channel}Consent`] ? 'consent' : 'no consent'
    return `${channel === 'sms' ? 'SMS' : channel.charAt(0).toUpperCase() + channel.slice(1)} ${state}`
  })
  const preferred = value.preferredChannel && value.preferredChannel !== 'none' ? `prefers ${value.preferredChannel === 'sms' ? 'SMS' : value.preferredChannel}` : 'no preferred channel'
  return [...channels, preferred].join(' · ')
}

function sourceName(value: string | null | undefined) {
  if (value === 'customer-merge') return 'Customer merge'
  return PREFERENCE_SOURCES.find(source => source.value === value)?.label || label(value)
}

export function CustomerDetailPageClient({
  id,
  initialCustomer,
  initialDuplicates,
  initialDuplicateError,
  viewer,
  timeZone,
  initialError,
}: {
  id: string
  initialCustomer: CustomerDetail | null
  initialDuplicates: DuplicateCandidate[]
  initialDuplicateError: string | null
  viewer: CrmViewer | null
  timeZone: string
  initialError: string | null
}) {
  const router = useRouter()
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const [customer, setCustomer] = useState<CustomerDetail | null>(initialCustomer)
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>(initialDuplicates)
  const [duplicateError, setDuplicateError] = useState<string | null>(initialDuplicateError)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<{ tone: DeskTone; text: string } | null>(null)
  const [contactOpen, setContactOpen] = useState(false)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [householdOpen, setHouseholdOpen] = useState(false)
  const [unlinkOpen, setUnlinkOpen] = useState(false)
  const [unlinkValues, setUnlinkValues] = useState<Record<string, string>>({ reason: '' })
  const [unlinkError, setUnlinkError] = useState<string | null>(null)
  const [unlinkBusy, setUnlinkBusy] = useState(false)
  const [mergeCandidate, setMergeCandidate] = useState<DuplicateCandidate | null>(null)
  const keys = useRef<Record<string, string>>({})

  const keyFor = (name: string, reset = false) => {
    if (reset || !keys.current[name]) keys.current[name] = `${name}:${id}:${crypto.randomUUID()}`
    return keys.current[name]
  }
  const clearKey = (name: string) => { delete keys.current[name] }

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true)
    setError(null)
    const response = await getCustomer(id)
    if (response.success && response.data.customer) {
      const loaded = response.data.customer
      setCustomer(loaded)
      if (loaded.status === 'active') {
        const found = await getDuplicateCandidates(loaded.id)
        setDuplicates(found.success ? found.data.customerDuplicateCandidates : [])
        setDuplicateError(found.success ? null : found.error)
      } else {
        setDuplicates([])
        setDuplicateError(null)
      }
    } else {
      setCustomer(null)
      setError(response.success ? (pt ? 'Cliente não encontrado.' : 'This customer was not found.') : response.error)
    }
    setLoading(false)
  }

  const breadcrumbs = [
    { type: 'link' as const, label: pt ? 'Painel' : 'Dashboard', href: basePath },
    { type: 'page' as const, label: pt ? 'Plataforma' : 'Platform' },
    { type: 'link' as const, label: pt ? 'Clientes' : 'Customers', href: `${basePath}/platform/customers` },
    { type: 'page' as const, label: customer ? personName(customer.firstName, customer.lastName) : (pt ? 'Cliente' : 'Customer') },
  ]

  if (loading) {
    return (
      <PageContainer title={pt ? 'Clientes' : 'Customers'} breadcrumbs={breadcrumbs}>
        <div className="space-y-3 px-4 pb-24 md:px-6" role="status" aria-label={pt ? 'Carregando cliente' : 'Loading customer'}>
          <div className="h-7 w-56 max-w-full animate-pulse rounded-[2px] bg-muted" />
          <div className="h-4 w-72 max-w-full animate-pulse rounded-[2px] bg-muted" />
          <div className="h-48 animate-pulse rounded-md bg-muted" />
        </div>
      </PageContainer>
    )
  }

  if (!customer) {
    return (
      <PageContainer title={pt ? 'Clientes' : 'Customers'} breadcrumbs={breadcrumbs} header={<DeskHeader title={pt ? 'Cliente indisponível' : 'Customer unavailable'} tone="bad" status={pt ? 'Indisponível' : 'Unavailable'} />}>
        <div className="space-y-3 px-4 pb-24 md:px-6">
          <Notice tone="bad">{error || (pt ? 'Cliente não encontrado.' : 'This customer was not found.')}</Notice>
          <Track>
            <Pill onClick={() => load()}>{pt ? 'Tentar novamente' : 'Retry'}</Pill>
            <Pill asChild><Link href={`${basePath}/platform/customers`}>{pt ? 'Voltar aos clientes' : 'Back to customers'}</Link></Pill>
          </Track>
        </div>
      </PageContainer>
    )
  }

  const name = personName(customer.firstName, customer.lastName)
  const merged = customer.status === 'merged'
  const canManage = viewer?.canManageLeads === true
  const disabledReason = merged ? (pt ? 'Clientes unificados são somente para leitura' : 'Merged customers are read only') : canManage ? undefined : (pt ? 'Requer permissão para gerenciar leads' : 'Requires lead management permission')
  const canAct = canManage && !merged
  const leads = customer.leads
  const openLeadCount = leads.filter(lead => !CLOSED_LEAD_STATUSES.includes(lead.status || '')).length
  const deals = leads.flatMap(lead => lead.deals.map(deal => ({ ...deal, lead })))
  const testDrives = leads.flatMap(lead => lead.testDrives.map(drive => ({ ...drive, lead })))
  const tradeIns = leads.flatMap(lead => lead.tradeIns.map(tradeIn => ({ ...tradeIn, lead })))
  const appointments = leads.flatMap(lead => lead.serviceAppointments.map(appointment => ({ ...appointment, lead })))
  const mergeEvents = [...customer.mergeEventsAsSurvivor, ...customer.mergeEventsAsDuplicate]
    .filter((event, index, all) => all.findIndex(other => other.id === event.id) === index)
    .sort((a, b) => Date.parse(b.mergedAt || '') - Date.parse(a.mergedAt || ''))
  const currentParty: MergeParty = {
    id: customer.id, firstName: customer.firstName, lastName: customer.lastName, primaryEmail: customer.primaryEmail,
    primaryPhone: customer.primaryPhone, leadsCount: leads.length, updatedAt: customer.updatedAt,
  }

  const submitContact = async (values: CustomerContactValues) => {
    const response = await updateCustomerContact({ customerId: customer.id, expectedUpdatedAt: customer.updatedAt, idempotencyKey: keyFor('customer-contact'), ...values })
    if (!response.success) return response.error
    clearKey('customer-contact')
    setContactOpen(false)
    setNotice({ tone: 'ok', text: pt ? 'Contato salvo' : 'Contact saved' })
    await load(true)
    return null
  }

  const submitPreferences = async (values: PreferenceValues) => {
    const response = await updateCustomerPreferences({ customerId: customer.id, expectedUpdatedAt: customer.updatedAt, idempotencyKey: keyFor('customer-preferences'), ...values })
    if (!response.success) return response.error
    clearKey('customer-preferences')
    setPreferencesOpen(false)
    setNotice({ tone: 'ok', text: pt ? 'Preferências salvas' : 'Preferences saved' })
    await load(true)
    return null
  }

  const submitHousehold = async ({ member, displayName }: { member: { id: string; updatedAt: string }; displayName: string }) => {
    const response = await linkCustomerHousehold({
      primaryCustomerId: customer.id,
      memberCustomerId: member.id,
      primaryExpectedUpdatedAt: customer.updatedAt,
      memberExpectedUpdatedAt: member.updatedAt,
      displayName,
      idempotencyKey: keyFor('customer-household'),
    })
    if (!response.success) return response.error
    clearKey('customer-household')
    setHouseholdOpen(false)
    setNotice({ tone: 'ok', text: pt ? 'Grupo familiar vinculado' : 'Household linked' })
    await load(true)
    return null
  }

  const submitUnlink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!unlinkValues.reason?.trim()) { setUnlinkError(pt ? 'Informe o motivo.' : 'Reason is required'); return }
    setUnlinkBusy(true)
    setUnlinkError(null)
    const response = await unlinkCustomerHousehold({ customerId: customer.id, expectedUpdatedAt: customer.updatedAt, reason: unlinkValues.reason.trim(), idempotencyKey: keyFor('customer-household-unlink') })
    setUnlinkBusy(false)
    if (!response.success) { setUnlinkError(response.error); return }
    clearKey('customer-household-unlink')
    setUnlinkOpen(false)
    setNotice({ tone: 'ok', text: pt ? 'Cliente removido do grupo familiar' : 'Removed from household' })
    await load(true)
  }

  const submitMerge = async ({ survivor, duplicate, reason }: { survivor: MergeParty; duplicate: MergeParty; reason: string }) => {
    const response = await mergeCustomers({
      survivorId: survivor.id,
      duplicateId: duplicate.id,
      survivorExpectedUpdatedAt: survivor.updatedAt,
      duplicateExpectedUpdatedAt: duplicate.updatedAt,
      reason,
      idempotencyKey: keyFor(`customer-merge-${duplicate.id}`),
    })
    if (!response.success) return response.error
    clearKey(`customer-merge-${duplicate.id}`)
    setMergeCandidate(null)
    const result = response.data.mergeCustomers
    setNotice({ tone: 'ok', text: pt ? `Unificação concluída · ${result.movedLeadCount} leads e ${result.movedSalesVisitCount} visitas transferidos` : `Merged · ${result.movedLeadCount} lead${result.movedLeadCount === 1 ? '' : 's'} and ${result.movedSalesVisitCount} visit${result.movedSalesVisitCount === 1 ? '' : 's'} moved` })
    if (survivor.id !== customer.id) router.push(`${basePath}/platform/customers/${survivor.id}`)
    else await load(true)
    return null
  }

  const header = (
    <DeskHeader
      title={name}
      tone={merged ? 'idle' : 'ok'}
      status={merged ? (pt ? 'Unificado' : 'Merged') : (pt ? 'Ativo' : 'Active')}
      meta={<span>{merged ? (pt ? 'Unificado' : 'Merged') : (pt ? 'Ativo' : 'Active')} · {openLeadCount} {pt ? (openLeadCount === 1 ? 'lead em aberto' : 'leads em aberto') : `open lead${openLeadCount === 1 ? '' : 's'}`}{customer.rooftop?.name ? ` · ${customer.rooftop.name}` : ''} · {pt ? 'Cliente desde' : 'Customer since'} {formatDay(customer.createdAt, timeZone, locale)} · <Code>{recordReference('CUS', customer.id)}</Code></span>}
      actions={
        <>
          <Pill variant="plain" className="max-md:h-10" onClick={() => load()} aria-label={pt ? 'Atualizar' : 'Refresh'}><RefreshCw /></Pill>
          <Pill variant={!customer.primaryPhone && !customer.primaryEmail ? 'primary' : 'raised'} className="max-md:h-10" onClick={() => { keyFor('customer-contact', true); setContactOpen(true) }} disabled={!canAct} title={disabledReason}><Pencil />{pt ? 'Editar contato' : 'Edit contact'}</Pill>
          {customer.primaryEmail && <Pill asChild className="max-md:h-10" variant={customer.primaryPhone ? 'raised' : 'primary'}><a href={`mailto:${customer.primaryEmail}`}><Mail />{pt ? 'E-mail' : 'Email'}</a></Pill>}
          {customer.primaryPhone && <Pill asChild className="max-md:h-10" variant="primary"><a href={`tel:${customer.primaryPhone}`}><Phone />{pt ? 'Ligar' : 'Call'}</a></Pill>}
        </>
      }
    />
  )

  const empty = (text: string) => <p className="text-sm text-muted-foreground">{text}</p>
  const leadLink = (lead: Pick<CustomerLead, 'id' | 'firstName' | 'lastName'>, children: ReactNode) => (
    <Link href={`${basePath}/platform/crm/${lead.id}`} className="underline underline-offset-2">{children}</Link>
  )

  return (
    <PageContainer title={pt ? 'Clientes' : 'Customers'} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full px-4 pb-24 md:px-6">
        {merged && (
          <Notice tone="warn" className="mb-4">
            {pt ? 'Unificado em' : 'Merged'} {formatDateTime(customer.mergedAt, timeZone, locale)}
            {customer.mergedInto && <> {pt ? 'no cadastro de' : 'into'} <Link className="font-medium underline underline-offset-2" href={`${basePath}/platform/customers/${customer.mergedInto.id}`}>{personName(customer.mergedInto.firstName, customer.mergedInto.lastName)}</Link></>}
          </Notice>
        )}
        {notice && <Notice tone={notice.tone} className="mb-4">{notice.text}</Notice>}
        {!canManage && <p className="mb-4 text-xs text-muted-foreground">{pt ? 'Somente leitura · requer permissão para gerenciar leads' : 'Read only · requires lead management permission'}</p>}

        <DeskSection title={pt ? 'Contato' : 'Contact'} id="customer-contact" className="mb-8">
          <div className="grid min-w-0 grid-cols-1 gap-x-8 md:grid-cols-2">
            <Facts items={[
              { label: pt ? 'Telefone' : 'Phone', value: customer.primaryPhone ? <a className="underline-offset-2 hover:underline" href={`tel:${customer.primaryPhone}`}>{formatPhone(customer.primaryPhone)}</a> : '-' },
              { label: pt ? 'E-mail' : 'Email', value: customer.primaryEmail ? <a className="break-all underline-offset-2 hover:underline" href={`mailto:${customer.primaryEmail}`}>{customer.primaryEmail}</a> : '-' },
              { label: pt ? 'Preferência' : 'Preferred', value: <span className="capitalize">{customer.preferredChannel && customer.preferredChannel !== 'none' ? (customer.preferredChannel === 'sms' ? 'SMS' : customer.preferredChannel) : (pt ? 'Nenhuma' : 'None')}</span> },
            ]} />
            <Facts items={[
              { label: pt ? 'Nome' : 'Name', value: name },
              { label: pt ? 'Grupo familiar' : 'Household', value: customer.household?.displayName || (pt ? 'Nenhum' : 'None') },
              { label: pt ? 'Atualizado em' : 'Updated', value: formatDateTime(customer.updatedAt, timeZone, locale) },
            ]} />
          </div>
        </DeskSection>

        <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-8">
            <DeskSection title={pt ? 'Leads' : 'Leads'} count={leads.length}>
              {leads.length === 0 ? empty(pt ? 'Nenhum lead' : 'No leads') : (
                <Panel className="divide-y">
                  {leads.map(lead => {
                    const status = leadStatus(lead.status, locale)
                    return (
                      <Link key={lead.id} href={`${basePath}/platform/crm/${lead.id}`} className="flex min-h-11 min-w-0 flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                        <div className="min-w-0">
                          <TitleLine as="p" tone={status.tone} status={status.label} className="text-sm font-medium">
                            {lead.interestedVehicle ? vehicleName(lead.interestedVehicle, pt) : personName(lead.firstName, lead.lastName, pt ? 'Lead' : 'Lead')}
                          </TitleLine>
                          <p className="pl-4 text-xs text-muted-foreground">{[status.label, sourceLabel(lead.source, locale), `${pt ? 'Criado em' : 'Created'} ${formatDay(lead.createdAt, timeZone, locale)}`].join(' · ')}</p>
                        </div>
                        <div className="pl-4 text-xs sm:shrink-0 sm:pl-0 sm:text-right">
                          <p className={lead.assignedSalesperson ? 'font-medium' : 'text-muted-foreground'}>{lead.assignedSalesperson?.name || (pt ? 'Não atribuído' : 'Unassigned')}</p>
                          <p className="text-muted-foreground">{lead.lastContact ? `${pt ? 'Contatado em' : 'Contacted'} ${formatDay(lead.lastContact, timeZone, locale)}` : (pt ? 'Ainda não contatado' : 'Not contacted')}</p>
                        </div>
                      </Link>
                    )
                  })}
                </Panel>
              )}
            </DeskSection>

            <DeskSection title={pt ? 'Negociações' : 'Deals'} count={deals.length}>
              {deals.length === 0 ? empty(pt ? 'Nenhuma negociação' : 'No deals') : (
                <Panel className="divide-y">
                  {deals.map(deal => (
                    <Link key={deal.id} href={`${basePath}/platform/deals/${deal.id}`} className="flex min-h-11 min-w-0 items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                      <div className="min-w-0">
                        <TitleLine as="p" tone={DEAL_TONE[deal.status || ''] ?? 'idle'} status={dealStatus(deal.status, pt)} className="text-sm font-medium">{vehicleName(deal.vehicle, pt)}</TitleLine>
                        <p className="pl-4 text-xs capitalize text-muted-foreground">{label(deal.status)} · {deal.saleDate ? `${pt ? 'Vendida em' : 'Sold'} ${formatDay(deal.saleDate, timeZone, locale)}` : `${pt ? 'Aberta em' : 'Opened'} ${formatDay(deal.createdAt, timeZone, locale)}`}</p>
                      </div>
                      <p className="shrink-0 text-sm font-medium tabular-nums">{money(deal.vehiclePrice, pt)}</p>
                    </Link>
                  ))}
                </Panel>
              )}
            </DeskSection>

            <DeskSection title={pt ? 'Test-drives' : 'Test drives'} count={testDrives.length}>
              {testDrives.length === 0 ? empty(pt ? 'Nenhum test drive' : 'No test drives') : (
                <Panel className="divide-y">
                  {testDrives.map(drive => {
                    const state = drive.completed ? (pt ? 'Concluído' : 'Completed') : drive.noShow ? (pt ? 'Não compareceu' : 'No-show') : (pt ? 'Agendado' : 'Scheduled')
                    return (
                      <div key={drive.id} className="flex min-w-0 items-baseline justify-between gap-3 px-4 py-2.5">
                        <TitleLine as="p" tone={drive.completed ? 'ok' : drive.noShow ? 'bad' : 'info'} status={state} className="text-sm">{vehicleName(drive.vehicle, pt)}</TitleLine>
                        <span className="shrink-0 text-right text-xs text-muted-foreground"><span className="tabular-nums">{formatDateTime(drive.scheduledTime, timeZone, locale)}</span> · {state}</span>
                      </div>
                    )
                  })}
                </Panel>
              )}
            </DeskSection>

            <DeskSection title={pt ? 'Veículos avaliados para troca' : 'Trade-ins'} count={tradeIns.length}>
              {tradeIns.length === 0 ? empty(pt ? 'Nenhum veículo na troca' : 'No trade-ins') : (
                <Panel className="divide-y">
                  {tradeIns.map(tradeIn => (
                    <div key={tradeIn.id} className="flex min-w-0 items-start justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <TitleLine as="p" tone={tradeIn.offerAmount != null ? 'ok' : 'warn'} status={tradeIn.offerAmount != null ? (pt ? 'Avaliado' : 'Appraised') : (pt ? 'Aguardando avaliação' : 'Awaiting appraisal')} className="text-sm font-medium">{vehicleName(tradeIn, pt)}</TitleLine>
                        <p className="pl-4 text-xs text-muted-foreground">{[tradeIn.mileage != null ? `${tradeIn.mileage.toLocaleString(pt ? 'pt-BR' : 'en-US')} ${pt ? 'km' : 'mi'}` : null, `${pt ? 'Enviado em' : 'Submitted'} ${formatDay(tradeIn.createdAt, timeZone, locale)}`, tradeIn.offerAmount != null ? (pt ? 'Avaliado' : 'Appraised') : (pt ? 'Aguardando avaliação' : 'Awaiting appraisal')].filter(Boolean).join(' · ')}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium tabular-nums">{money(tradeIn.offerAmount, pt)}</p>
                        <Link href={`${basePath}/platform/trade-ins`} className="text-xs underline underline-offset-2">{pt ? 'Veículos na troca' : 'Trade-ins'}</Link>
                      </div>
                    </div>
                  ))}
                </Panel>
              )}
            </DeskSection>

            <DeskSection title={pt ? 'Oficina' : 'Service'} count={appointments.length}>
              {appointments.length === 0 ? empty(pt ? 'Nenhum agendamento de oficina' : 'No service appointments') : (
                <Panel className="divide-y">
                  {appointments.map(appointment => (
                    <div key={appointment.id} className="space-y-1 px-4 py-2.5">
                      <div className="flex min-w-0 items-baseline justify-between gap-3">
                        <TitleLine as="p" tone={SERVICE_TONE[appointment.status || ''] ?? 'idle'} status={crmLabel(appointment.status, pt)} className="text-sm font-medium capitalize">
                          {crmLabel(appointment.serviceType, pt)} · {appointment.customerVehicleDescription || (pt ? 'Veículo' : 'Vehicle')}
                        </TitleLine>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDateTime(appointment.appointmentDate, timeZone, locale)}</span>
                      </div>
                      <p className="pl-4 text-xs capitalize text-muted-foreground">{crmLabel(appointment.status, pt)}</p>
                      {appointment.serviceOrder && (
                        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 pl-4 text-xs">
                          <TitleLine as="span" tone={RO_TONE[appointment.serviceOrder.status || ''] ?? 'idle'} status={crmLabel(appointment.serviceOrder.status, pt)}>
                            <Code>{appointment.serviceOrder.invoiceNumber || recordReference('RO', appointment.serviceOrder.id)}</Code>
                          </TitleLine>
                          <span className="capitalize text-muted-foreground">{crmLabel(appointment.serviceOrder.status, pt)}</span>
                          <span className="tabular-nums">{money(appointment.serviceOrder.grandTotal, pt)}</span>
                          <Link href={`${basePath}/platform/service`} className="underline underline-offset-2">{pt ? 'Oficina' : 'Service'}</Link>
                        </p>
                      )}
                    </div>
                  ))}
                </Panel>
              )}
            </DeskSection>

            <DeskSection title={pt ? 'Visitas' : 'Visits'} count={customer.salesVisits.length}>
              {customer.salesVisits.length === 0 ? empty(pt ? 'Nenhuma visita' : 'No visits') : (
                <Panel className="divide-y">
                  {customer.salesVisits.map(visit => {
                    const status = VISIT_STATUSES[visit.status || ''] || { label: label(visit.status), tone: 'idle' as DeskTone }
                    return (
                      <div key={visit.id} className="flex min-w-0 items-start justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <TitleLine as="p" tone={status.tone} status={pt ? crmLabel(visit.status, pt) : status.label} className="text-sm font-medium">{visit.kind === 'showroom' ? (pt ? 'Visita à loja' : 'Showroom visit') : (pt ? 'Atendimento de vendas' : 'Sales appointment')} · {pt ? crmLabel(visit.status, pt) : status.label}</TitleLine>
                          <p className="pl-4 text-xs text-muted-foreground">{[visit.vehicle ? vehicleName(visit.vehicle, pt) : null, visit.outcome ? `${pt ? 'Resultado:' : 'Outcome:'} ${crmLabel(visit.outcome, pt)}` : null].filter(Boolean).join(' · ') || '-'}</p>
                        </div>
                        <div className="shrink-0 text-right text-xs">
                          <p className="tabular-nums text-muted-foreground">{formatDateTime(visit.completedAt || visit.scheduledAt, timeZone, locale)}</p>
                          {visit.lead && leadLink({ id: visit.lead.id, firstName: null, lastName: null }, 'Lead')}
                        </div>
                      </div>
                    )
                  })}
                </Panel>
              )}
            </DeskSection>
          </div>

          <div className="min-w-0 space-y-8">
            <DeskSection
              title={pt ? 'Grupo familiar' : 'Household'}
              actions={
                <Track>
                  {customer.household && (
                    <Pill size="sm" className="h-11 sm:h-7" onClick={() => { keyFor('customer-household-unlink', true); setUnlinkValues({ reason: '' }); setUnlinkError(null); setUnlinkOpen(true) }} disabled={!canAct} title={disabledReason}>
                      <Unlink />{pt ? 'Desvincular' : 'Unlink'}
                    </Pill>
                  )}
                  <Pill size="sm" className="h-11 sm:h-7" onClick={() => { keyFor('customer-household', true); setHouseholdOpen(true) }} disabled={!canAct} title={disabledReason}>
                    <Home />{customer.household ? (pt ? 'Adicionar membro' : 'Add member') : (pt ? 'Vincular' : 'Link')}
                  </Pill>
                </Track>
              }
            >
              {customer.household ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{customer.household.displayName}</p>
                  <Panel className="divide-y">
                    {customer.household.members.map(member => (
                      <div key={member.id} className="flex min-h-11 min-w-0 items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <TitleLine as="p" tone={member.status === 'merged' ? 'idle' : 'ok'} status={member.status || undefined} className="text-sm">
                            {member.id === customer.id ? `${personName(member.firstName, member.lastName)} (${pt ? 'este cliente' : 'this customer'})` : (
                              <Link href={`${basePath}/platform/customers/${member.id}`} className="underline underline-offset-2">{personName(member.firstName, member.lastName)}</Link>
                            )}
                          </TitleLine>
                          <p className="truncate pl-4 text-xs text-muted-foreground">{[member.primaryEmail, formatPhone(member.primaryPhone), member.status === 'merged' ? (pt ? 'Unificado' : 'Merged') : null].filter(Boolean).join(' · ') || '-'}</p>
                        </div>
                      </div>
                    ))}
                  </Panel>
                </div>
              ) : empty(pt ? 'Sem grupo familiar' : 'No household')}
            </DeskSection>

            <DeskSection title={pt ? 'Possíveis duplicados' : 'Possible duplicates'} count={merged ? undefined : duplicates.length} id="duplicates">
              {merged ? empty(pt ? 'Não verificado para clientes unificados' : 'Not checked for merged customers') : duplicateError ? (
                <Notice tone="bad">{duplicateError}</Notice>
              ) : duplicates.length === 0 ? empty(pt ? 'Nenhum duplicado encontrado' : 'No duplicates') : (
                <Panel className="divide-y">
                  {duplicates.map(candidate => (
                    <div key={candidate.id} className="flex min-w-0 items-start justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <TitleLine as="p" tone="warn" status={pt ? 'Possível duplicado' : 'Possible duplicate'} className="text-sm font-medium">
                          <Link href={`${basePath}/platform/customers/${candidate.id}`} className="underline underline-offset-2">{personName(candidate.firstName, candidate.lastName)}</Link>
                        </TitleLine>
                        <p className="truncate pl-4 text-xs text-muted-foreground">{[candidate.primaryEmail, formatPhone(candidate.primaryPhone)].filter(Boolean).join(' · ')}</p>
                        <p className="pl-4 text-xs text-muted-foreground">{candidate.leadsCount} {pt ? (candidate.leadsCount === 1 ? 'lead' : 'leads') : `lead${candidate.leadsCount === 1 ? '' : 's'}`} · {pt ? 'desde' : 'since'} {formatDay(candidate.createdAt, timeZone, locale)}</p>
                      </div>
                      <Track className="shrink-0">
                        <Pill size="sm" className="h-11 sm:h-7" onClick={() => setMergeCandidate(candidate)} disabled={!canAct} title={disabledReason}><GitMerge />{pt ? 'Unificar' : 'Merge'}</Pill>
                      </Track>
                    </div>
                  ))}
                </Panel>
              )}
            </DeskSection>

            <DeskSection
              title={pt ? 'Preferências de contato' : 'Contact preferences'}
              actions={
                <Track>
                  <Pill size="sm" className="h-11 sm:h-7" onClick={() => { keyFor('customer-preferences', true); setPreferencesOpen(true) }} disabled={!canAct} title={disabledReason}>
                    <SlidersHorizontal />{pt ? 'Editar' : 'Edit'}
                  </Pill>
                </Track>
              }
            >
              <Facts items={(['email', 'sms', 'phone'] as const).map(channel => {
                const state = consentState(customer[`${channel}Consent`], customer[`${channel}Suppressed`], pt)
                return { label: channel === 'sms' ? 'SMS' : channel.charAt(0).toUpperCase() + channel.slice(1), value: <TitleLine as="span" tone={state.tone} className="justify-end">{state.text}</TitleLine> }
              }).concat([
                { label: pt ? 'Preferência' : 'Preferred', value: <span className="capitalize">{customer.preferredChannel && customer.preferredChannel !== 'none' ? (customer.preferredChannel === 'sms' ? 'SMS' : customer.preferredChannel) : (pt ? 'Nenhuma' : 'None')}</span> },
                ...(customer.suppressionReason ? [{ label: pt ? 'Motivo do bloqueio' : 'Suppression', value: <span>{customer.suppressionReason}</span> }] : []),
              ])} />
              <p className="mt-4 text-[12px] font-medium text-muted-foreground">{pt ? 'Histórico' : 'History'}</p>
              {customer.contactPreferenceEvents.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">{pt ? 'Nenhuma alteração' : 'No changes'}</p> : (
                <ol className="mt-2 space-y-0">
                  {customer.contactPreferenceEvents.map(event => (
                    <li key={event.id} className="relative border-l pb-3 pl-4 last:pb-0">
                      <span className="absolute -left-[4px] top-1.5 size-2 rounded-[1px] bg-muted-foreground/50" aria-hidden="true" />
                      <p className="text-sm">{sourceName(event.source)}</p>
                      <p className="text-xs text-muted-foreground">{[formatDateTime(event.occurredAt, timeZone, locale), event.actor?.name].filter(Boolean).join(' · ')}</p>
                      {event.reason && <p className="break-words text-xs">{event.reason}</p>}
                      <p className="break-words text-xs text-muted-foreground">{snapshotSummary(event.preferenceSnapshot)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </DeskSection>

            <DeskSection title={pt ? 'Histórico de unificações' : 'Merge history'} count={mergeEvents.length}>
              {mergeEvents.length === 0 ? empty(pt ? 'Nenhuma unificação' : 'No merges') : (
                <ol className="space-y-0">
                  {mergeEvents.map(event => {
                    const asSurvivor = event.survivor?.id === customer.id
                    const other = asSurvivor ? event.duplicate : event.survivor
                    return (
                      <li key={event.id} className="relative border-l pb-3 pl-4 last:pb-0">
                        <span className="absolute -left-[4px] top-1.5 size-2 rounded-[1px] bg-muted-foreground/50" aria-hidden="true" />
                        <p className="text-sm">
                          {asSurvivor ? (pt ? 'Incorporou ' : 'Absorbed ') : (pt ? 'Unificado com ' : 'Merged into ')}
                          {other ? <Link href={`${basePath}/platform/customers/${other.id}`} className="underline underline-offset-2">{personName(other.firstName, other.lastName)}</Link> : (pt ? 'cliente' : 'customer')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[formatDateTime(event.mergedAt, timeZone, locale), event.actor?.name ? `${pt ? 'por' : 'by'} ${event.actor.name}` : null, `${(event.movedLeadIds || []).length} ${pt ? 'leads transferidos' : `lead${(event.movedLeadIds || []).length === 1 ? '' : 's'} moved`}`].filter(Boolean).join(' · ')}
                        </p>
                        {event.reason && <p className="break-words text-xs">{event.reason}</p>}
                      </li>
                    )
                  })}
                </ol>
              )}
              {customer.mergedCustomers.length > 0 && mergeEvents.length === 0 && (
                <p className="text-xs text-muted-foreground">{customer.mergedCustomers.length} {pt ? (customer.mergedCustomers.length === 1 ? 'cadastro unificado' : 'cadastros unificados') : `merged record${customer.mergedCustomers.length === 1 ? '' : 's'}`}</p>
              )}
            </DeskSection>
          </div>
        </div>
      </div>

      <CustomerContactDialog
        open={contactOpen}
        onOpenChange={setContactOpen}
        initialValues={{ firstName: customer.firstName || '', lastName: customer.lastName || '', primaryEmail: customer.primaryEmail || '', primaryPhone: customer.primaryPhone || '' }}
        onSubmit={submitContact}
      />
      <ContactPreferencesDialog
        open={preferencesOpen}
        onOpenChange={setPreferencesOpen}
        initialValues={{
          emailConsent: customer.emailConsent === true,
          smsConsent: customer.smsConsent === true,
          phoneConsent: customer.phoneConsent === true,
          emailSuppressed: customer.emailSuppressed === true,
          smsSuppressed: customer.smsSuppressed === true,
          phoneSuppressed: customer.phoneSuppressed === true,
          preferredChannel: customer.preferredChannel || 'none',
          source: 'operator-recorded',
          reason: '',
        }}
        onSubmit={submitPreferences}
      />
      {customer.rooftop && (
        <HouseholdLinkDialog
          open={householdOpen}
          onOpenChange={setHouseholdOpen}
          customerId={customer.id}
          rooftopId={customer.rooftop.id}
          currentHousehold={customer.household}
          defaultDisplayName={`${customer.lastName || name} household`}
          onSubmit={submitHousehold}
        />
      )}
      <OperatorActionDialog
        open={unlinkOpen}
        title={pt ? 'Remover do grupo familiar' : 'Remove from household'}
        fields={[{ name: 'reason', label: pt ? 'Motivo' : 'Reason', type: 'textarea', maxLength: 1000 }]}
        values={unlinkValues}
        error={unlinkError}
        busy={unlinkBusy}
        submitLabel={pt ? 'Desvincular' : 'Unlink'}
        onValuesChange={setUnlinkValues}
        onSubmit={submitUnlink}
        onOpenChange={setUnlinkOpen}
      />
      <MergeCustomerDialog
        open={Boolean(mergeCandidate)}
        onOpenChange={open => { if (!open) setMergeCandidate(null) }}
        current={currentParty}
        candidate={mergeCandidate ? { ...mergeCandidate, leadsCount: mergeCandidate.leadsCount } : null}
        onSubmit={submitMerge}
      />
    </PageContainer>
  )
}
