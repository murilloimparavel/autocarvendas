'use client'

import { useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowRightLeft, CalendarPlus, Check, Mail, Pencil, Phone, RefreshCw, Route } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { OperatorActionDialog } from '@/features/platform/components/OperatorActionDialog'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import {
  Attention,
  Code,
  DeskHeader,
  DeskSection,
  Facts,
  Notice,
  Panel,
  Pill,
  TitleLine,
  Track,
  type DeskTone,
} from '@/features/platform/components/desk'
import { formatPhone } from '@/features/platform/lib/format'
import {
  type CrmPerson,
  type CrmVehicleOption,
  type CrmViewer,
  type LeadDetail,
  advanceLeadCadence,
  completeLeadTask,
  createLeadTask,
  enrollLeadCadence,
  getCustomerDuplicateCount,
  getLead,
  getLeadVehicleOptions,
  manageSalesVisit,
  recordLeadInteraction,
  routeLead,
  transferLeadOwnership,
  transitionLead,
  updateCustomerCommunicationPreferences,
  updateLeadDetails,
} from '../actions'
import {
  CLOSED_LEAD_STATUSES,
  LEAD_STATUSES,
  LEAD_TRANSITIONS,
  PRIORITY_TONE,
  VISIT_ACTIONS,
  VISIT_OUTCOMES,
  VISIT_STATUSES,
  budgetLabel,
  formatDateTime,
  fromZonedInputValue,
  leadStatus,
  sourceLabel,
  timeframeLabel,
} from '../lib/leadOptions'
import { LeadFormDialog, type LeadFormValues } from '../components/LeadFormDialog'
import { TransferLeadDialog } from '../components/TransferLeadDialog'
import { SalesVisitDialog, type VisitDialogAction } from '../components/SalesVisitDialog'
import { FormField } from '../components/FormField'

type Lead = LeadDetail
type Visit = Lead['salesVisits'][number]

const lostReasonOptions = [
  { value: 'purchased-elsewhere', label: 'Purchased elsewhere', labelPt: 'Comprou em outro lugar' },
  { value: 'price', label: 'Price', labelPt: 'Preço' },
  { value: 'financing', label: 'Financing', labelPt: 'Financiamento' },
  { value: 'vehicle-unavailable', label: 'Vehicle unavailable', labelPt: 'Veículo indisponível' },
  { value: 'no-response', label: 'No response', labelPt: 'Sem resposta' },
  { value: 'timing', label: 'Timing', labelPt: 'Momento' },
  { value: 'other', label: 'Other', labelPt: 'Outro' },
]

const dealTone: Record<string, DeskTone> = { pencil: 'idle', submitted: 'warn', approved: 'info', financed: 'info', delivered: 'ok', cancelled: 'bad' }

const VISIT_ACTION_LABEL: Record<string, { en: string; pt: string }> = {
  arrive: { en: 'Check in', pt: 'Registrar chegada' }, 'manager-turn': { en: 'Manager turn', pt: 'Chamar gerente' },
  complete: { en: 'Complete', pt: 'Concluir' }, cancel: { en: 'Cancel', pt: 'Cancelar' }, 'no-show': { en: 'No-show', pt: 'Não compareceu' },
}

const ROUTE_LABEL: Record<string, { en: string; pt: string }> = {
  'manual-transfer': { en: 'Transfer', pt: 'Transferência' }, 'manual-intake': { en: 'Assigned at intake', pt: 'Atribuído na entrada' }, 'intake-creator': { en: 'Intake staff', pt: 'Equipe de entrada' },
}

function formatCurrency(value: number | null | undefined, locale: 'pt-BR' | 'en-US', currencyCode: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 }).format(value || 0)
}

function leadName(lead: Lead, locale: 'pt-BR' | 'en-US') {
  return [lead.firstName, lead.lastName].filter(Boolean).join(' ') || (locale === 'pt-BR' ? 'Lead sem nome' : 'Unnamed lead')
}

function vehicleName(vehicle: { year: number | null; make: string | null; model: string | null } | null, locale: 'pt-BR' | 'en-US') {
  if (!vehicle) return locale === 'pt-BR' ? 'Sem veículo' : 'No vehicle'
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
}

function consentLabel(suppressed: boolean | null | undefined, consent: boolean | null | undefined, locale: 'pt-BR' | 'en-US') {
  if (locale === 'pt-BR') return suppressed ? 'Bloqueado para contato' : consent ? 'Consentiu' : 'Sem consentimento'
  return suppressed ? 'Suppressed' : consent ? 'Consented' : 'Not consented'
}

function systemLabel(value: string | null | undefined, locale: 'pt-BR' | 'en-US') {
  if (!value) return '-'
  if (locale !== 'pt-BR') return value.replaceAll('-', ' ')
  const labels: Record<string, string> = {
    'purchased-elsewhere': 'Comprou em outro lugar', price: 'Preço', financing: 'Financiamento',
    'vehicle-unavailable': 'Veículo indisponível', 'no-response': 'Sem resposta', timing: 'Momento', other: 'Outro',
    phone: 'Telefone', email: 'E-mail', sms: 'SMS', text: 'Mensagem de texto', visit: 'Visita', 'test-drive': 'Test-drive', video: 'Vídeo',
    positive: 'Positivo', neutral: 'Neutro', negative: 'Negativo', 'no-answer': 'Não atendeu', voicemail: 'Correio de voz',
    low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente', internal: 'Interno',
    scheduled: 'Agendado', arrived: 'Compareceu', 'manager-turn': 'Atendimento do gerente', completed: 'Concluído', cancelled: 'Cancelado', 'no-show': 'Não compareceu',
    sold: 'Vendido', 'follow-up-required': 'Acompanhamento necessário', 'be-back': 'Retorno agendado', 'not-interested': 'Sem interesse', 'credit-declined': 'Crédito recusado',
    pencil: 'Em negociação', submitted: 'Enviada', approved: 'Aprovada', financed: 'Financiada', delivered: 'Entregue',
    active: 'Ativa', paused: 'Pausada', none: 'Nenhuma',
    'initial-response': 'Primeiro contato', 'two-hour-call': 'Ligação após duas horas', 'day-one-text': 'Mensagem do primeiro dia',
    'post-visit-call': 'Ligação após a visita', 'day-one-email': 'E-mail do primeiro dia',
    'unsold-day-one': 'Acompanhamento do primeiro dia', 'unsold-day-three': 'Ligação do terceiro dia',
  }
  return labels[value] || value.replaceAll('-', ' ')
}

function leadFormValues(lead: Lead): LeadFormValues {
  return {
    firstName: lead.firstName || '',
    lastName: lead.lastName || '',
    email: lead.email || '',
    phone: lead.phone || '',
    source: lead.source || 'walk-in',
    budgetRange: lead.budgetRange || '',
    timeframe: lead.timeframe || '',
    tradeInVehicle: lead.tradeInVehicle || '',
    notes: lead.notes || '',
    interestedVehicleId: lead.interestedVehicle?.id || '',
    rooftopId: lead.rooftop.id,
    assignedToId: '',
  }
}

export function LeadDetailPageClient({
  id,
  initialLead,
  initialDuplicateCount,
  viewer,
  staff,
  initialError,
  timeZone,
}: {
  id: string
  initialLead: Lead | null
  initialDuplicateCount: number
  viewer: CrmViewer | null
  staff: CrmPerson[]
  initialError: string | null
  timeZone: string
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const copy = (english: string, portuguese: string) => pt ? portuguese : english
  const interactionKeyRef = useRef(`lead-interaction:${crypto.randomUUID()}`)
  const [lead, setLead] = useState<Lead | null>(initialLead)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [notice, setNotice] = useState<{ tone: DeskTone; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [duplicateCount, setDuplicateCount] = useState(initialDuplicateCount)
  const [interaction, setInteraction] = useState({ interactionType: 'phone', outcome: 'positive', notes: '', followUpDate: '' })
  const [interactionError, setInteractionError] = useState<string | null>(null)
  const [task, setTask] = useState({ title: '', description: '', dueDate: '', priority: 'medium', communicationChannel: 'internal', assignedToId: '' })
  const [taskError, setTaskError] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [contactChannel, setContactChannel] = useState(initialLead?.customer?.preferredChannel || 'none')
  const [cadence, setCadence] = useState({
    cadenceKey: initialLead?.cadenceKey || 'internet-lead-first-response',
    campaignKey: initialLead?.campaignKey || 'website-organic',
  })
  const [lostReasonDialogOpen, setLostReasonDialogOpen] = useState(false)
  const [lostReasonValues, setLostReasonValues] = useState({ lostReasonCode: '', lostReasonDetails: '' })
  const [lostReasonError, setLostReasonError] = useState<string | null>(null)
  const lostReasonIdempotencyKeyRef = useRef<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const editKeyRef = useRef<string | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const transferKeyRef = useRef<string | null>(null)
  const [visitDialog, setVisitDialog] = useState<{ action: VisitDialogAction; visit?: Visit } | null>(null)
  const visitKeyRef = useRef<string | null>(null)
  const [vehicles, setVehicles] = useState<CrmVehicleOption[]>([])

  const canManage = viewer?.canManageLeads === true
  const canTasks = viewer?.canManageTasks === true
  const manageReason = canManage ? undefined : copy('Requires lead management permission', 'Requer permissão para gerenciar leads')

  const loadLead = async (quiet = false) => {
    if (!quiet) setLoading(true)
    setError(null)
    const response = await getLead(id)
    if (response.success && response.data?.lead) {
      const loaded = response.data.lead
      setLead(loaded)
      setContactChannel(loaded.customer?.preferredChannel || 'none')
      setCadence({ cadenceKey: loaded.cadenceKey || 'internet-lead-first-response', campaignKey: loaded.campaignKey || 'website-organic' })
      setDuplicateCount(loaded.customer?.id ? await getCustomerDuplicateCount(loaded.customer.id) : 0)
    } else {
      setLead(null)
      setError(response.success ? copy('This lead was not found.', 'Lead não encontrado.') : copy('Unable to load lead details. Try again.', 'Não foi possível carregar os dados do lead. Tente novamente.'))
    }
    setLoading(false)
  }

  const ensureVehicles = async () => {
    if (vehicles.length === 0) setVehicles(await getLeadVehicleOptions())
  }

  const runCommand = async (work: () => Promise<{ success: boolean; error?: string }>, failure: string, success?: string) => {
    setSaving(true)
    setNotice(null)
    const response = await work()
    if (!response.success) setNotice({ tone: 'bad', text: failure })
    else if (success) setNotice({ tone: 'ok', text: success })
    await loadLead(true)
    setSaving(false)
    return response.success
  }

  const updateLeadStatus = async (status: string) => {
    if (status === 'closed-lost') {
      setLostReasonValues({ lostReasonCode: '', lostReasonDetails: '' })
      setLostReasonError(null)
      lostReasonIdempotencyKeyRef.current = `lead-transition:${id}:${status}:${crypto.randomUUID()}`
      setLostReasonDialogOpen(true)
      return
    }
    await runCommand(() => transitionLead({ id, toStatus: status, idempotencyKey: `lead-transition:${id}:${status}:${crypto.randomUUID()}` }), copy('Unable to update status', 'Não foi possível atualizar o status'))
  }

  const submitLostLeadTransition = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!lostReasonValues.lostReasonCode) { setLostReasonError(copy('Choose a lost reason', 'Selecione o motivo da perda')); return }
    if (!lostReasonIdempotencyKeyRef.current) return
    setSaving(true)
    setLostReasonError(null)
    const response = await transitionLead({
      id,
      toStatus: 'closed-lost',
      lostReasonCode: lostReasonValues.lostReasonCode,
      lostReasonDetails: lostReasonValues.lostReasonDetails.trim(),
      idempotencyKey: lostReasonIdempotencyKeyRef.current,
    })
    if (!response.success) {
      setLostReasonError(copy('Unable to close this lead. Try again.', 'Não foi possível encerrar este lead. Tente novamente.'))
      setSaving(false)
      return
    }
    lostReasonIdempotencyKeyRef.current = null
    setLostReasonDialogOpen(false)
    await loadLead(true)
    setSaving(false)
  }

  const handleLostReasonDialogOpenChange = (open: boolean) => {
    setLostReasonDialogOpen(open)
    if (!open) {
      lostReasonIdempotencyKeyRef.current = null
      setLostReasonError(null)
      setLostReasonValues({ lostReasonCode: '', lostReasonDetails: '' })
    }
  }

  const logInteraction = async () => {
    if (!interaction.notes.trim()) { setInteractionError(copy('Notes are required', 'Informe as observações do atendimento')); return }
    const followUp = interaction.followUpDate ? fromZonedInputValue(interaction.followUpDate, timeZone) : null
    if (interaction.followUpDate && !followUp) { setInteractionError(copy('Follow-up date is invalid', 'A data de retorno é inválida')); return }
    setInteractionError(null)
    const ok = await runCommand(() => recordLeadInteraction({
      leadId: id,
      idempotencyKey: interactionKeyRef.current,
      interactionType: interaction.interactionType,
      outcome: interaction.outcome,
      notes: interaction.notes,
      date: new Date().toISOString(),
      ...(followUp ? { followUpDate: followUp } : {}),
    }), copy('Unable to log activity', 'Não foi possível registrar a atividade'))
    if (ok) {
      setInteraction({ interactionType: 'phone', outcome: 'positive', notes: '', followUpDate: '' })
      interactionKeyRef.current = `lead-interaction:${crypto.randomUUID()}`
    }
  }

  const applyRoutingRule = async () => {
    if (!lead) return
    await runCommand(() => routeLead({ leadId: lead.id, expectedUpdatedAt: lead.updatedAt, idempotencyKey: `crm-route:${lead.id}:${lead.updatedAt}` }), copy('Unable to route lead', 'Não foi possível distribuir o lead'), copy('Lead routed', 'Lead distribuído'))
  }

  const createTask = async () => {
    if (!task.title.trim()) { setTaskError(copy('Title is required', 'Informe o título da tarefa')); return }
    const due = task.dueDate ? fromZonedInputValue(task.dueDate, timeZone) : null
    if (task.dueDate && !due) { setTaskError(copy('Due date is invalid', 'A data de vencimento é inválida')); return }
    setTaskError(null)
    const ok = await runCommand(() => createLeadTask({
      leadId: id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      communicationChannel: task.communicationChannel,
      idempotencyKey: `crm-task:${id}:${crypto.randomUUID()}`,
      ...(due ? { dueDate: due } : {}),
      ...(task.assignedToId ? { assignedToId: task.assignedToId } : {}),
    }), copy('Unable to create task', 'Não foi possível criar a tarefa'))
    if (ok) setTask({ title: '', description: '', dueDate: '', priority: 'medium', communicationChannel: 'internal', assignedToId: '' })
  }

  const saveContactPreference = async (suppressSelected = false) => {
    if (!lead?.customer) return
    const selected = contactChannel
    if (suppressSelected && selected === 'none') { setNotice({ tone: 'bad', text: copy('Select a channel to suppress', 'Selecione um canal para bloquear o contato') }); return }
    const customer = lead.customer
    await runCommand(() => updateCustomerCommunicationPreferences(lead.id, {
      customerId: customer.id,
      expectedUpdatedAt: customer.updatedAt,
      emailConsent: selected === 'email' ? true : customer.emailConsent === true,
      smsConsent: selected === 'sms' ? true : customer.smsConsent === true,
      phoneConsent: selected === 'phone' ? true : customer.phoneConsent === true,
      emailSuppressed: suppressSelected && selected === 'email' ? true : customer.emailSuppressed === true,
      smsSuppressed: suppressSelected && selected === 'sms' ? true : customer.smsSuppressed === true,
      phoneSuppressed: suppressSelected && selected === 'phone' ? true : customer.phoneSuppressed === true,
      preferredChannel: suppressSelected ? 'none' : selected,
      source: 'operator-recorded',
      reason: suppressSelected ? `Customer requested ${selected} suppression` : `Customer confirmed ${selected} preference`,
      idempotencyKey: `crm-preference:${customer.id}:${crypto.randomUUID()}`,
    }), copy('Unable to update preferences', 'Não foi possível atualizar as preferências'))
  }

  const enrollCadence = async () => {
    if (!lead) return
    await runCommand(() => enrollLeadCadence({
      leadId: lead.id,
      expectedUpdatedAt: lead.updatedAt,
      cadenceKey: cadence.cadenceKey,
      campaignKey: cadence.campaignKey,
      idempotencyKey: `crm-cadence:${lead.id}:${crypto.randomUUID()}`,
    }), copy('Unable to enroll cadence', 'Não foi possível iniciar a sequência de contatos'))
  }

  const advanceCadence = async () => {
    if (!lead) return
    await runCommand(() => advanceLeadCadence({ leadId: lead.id, expectedUpdatedAt: lead.updatedAt, idempotencyKey: `crm-cadence-advance:${lead.id}:${crypto.randomUUID()}` }), copy('Unable to advance cadence', 'Não foi possível avançar a sequência de contatos'))
  }

  const completeTask = async (taskId: string) => {
    await runCommand(() => completeLeadTask(id, taskId), copy('Unable to complete task', 'Não foi possível concluir a tarefa'))
  }

  const openEdit = async () => {
    editKeyRef.current = `lead-details:${id}:${crypto.randomUUID()}`
    setEditOpen(true)
    await ensureVehicles()
  }

  const submitEdit = async (values: LeadFormValues) => {
    if (!lead) return copy('Lead is not loaded', 'Os dados do lead não foram carregados')
    const { rooftopId: _rooftopId, assignedToId: _assignedToId, ...details } = values
    const response = await updateLeadDetails({ ...details, leadId: lead.id, expectedUpdatedAt: lead.updatedAt, idempotencyKey: editKeyRef.current || `lead-details:${id}:${crypto.randomUUID()}` })
    if (!response.success) return copy('Unable to save lead details. Try again.', 'Não foi possível salvar os dados do lead. Tente novamente.')
    editKeyRef.current = null
    setEditOpen(false)
    setNotice({ tone: 'ok', text: copy('Lead details saved', 'Dados do lead salvos') })
    await loadLead(true)
    return null
  }

  const openTransfer = () => {
    transferKeyRef.current = `lead-transfer:${id}:${crypto.randomUUID()}`
    setTransferOpen(true)
  }

  const submitTransfer = async (values: { assignedToId: string; reason: string }) => {
    if (!lead) return copy('Lead is not loaded', 'Os dados do lead não foram carregados')
    const response = await transferLeadOwnership({ leadId: lead.id, expectedUpdatedAt: lead.updatedAt, idempotencyKey: transferKeyRef.current || `lead-transfer:${id}:${crypto.randomUUID()}`, ...values })
    if (!response.success) return copy('Unable to transfer this lead. Try again.', 'Não foi possível transferir este lead. Tente novamente.')
    transferKeyRef.current = null
    setTransferOpen(false)
    setNotice({ tone: 'ok', text: copy('Lead transferred', 'Lead transferido') })
    await loadLead(true)
    return null
  }

  const openVisit = async (action: VisitDialogAction, visit?: Visit) => {
    visitKeyRef.current = `crm-visit:${visit?.id || id}:${action}:${crypto.randomUUID()}`
    setVisitDialog({ action, visit })
    if (action === 'schedule') await ensureVehicles()
  }

  const submitVisit = async (values: { kind: string; scheduledAtIso: string | null; vehicleId: string; managerId: string; outcome: string; notes: string }) => {
    if (!lead || !visitDialog) return copy('Lead is not loaded', 'Os dados do lead não foram carregados')
    const { action, visit } = visitDialog
    const idempotencyKey = visitKeyRef.current || `crm-visit:${crypto.randomUUID()}`
    const response = await manageSalesVisit(lead.id, action === 'schedule'
      ? {
          action,
          leadId: lead.id,
          kind: values.kind,
          ...(values.vehicleId ? { vehicleId: values.vehicleId } : {}),
          ...(values.kind === 'appointment' && values.scheduledAtIso ? { scheduledAt: values.scheduledAtIso } : {}),
          notes: values.notes.trim(),
          idempotencyKey,
        }
      : {
          action,
          visitId: visit?.id,
          expectedUpdatedAt: visit?.updatedAt,
          ...(action === 'manager-turn' ? { managerId: values.managerId } : {}),
          ...(action === 'complete' ? { outcome: values.outcome } : {}),
          notes: values.notes.trim(),
          idempotencyKey,
        })
    if (!response.success) return copy('Unable to save this visit. Try again.', 'Não foi possível salvar este atendimento. Tente novamente.')
    visitKeyRef.current = null
    setVisitDialog(null)
    await loadLead(true)
    return null
  }

  const breadcrumbs = [
    { type: 'link' as const, label: copy('Dashboard', 'Painel'), href: basePath },
    { type: 'page' as const, label: copy('Platform', 'Plataforma') },
    { type: 'link' as const, label: 'CRM', href: `${basePath}/platform/crm` },
    { type: 'page' as const, label: lead ? leadName(lead, locale) : copy('Lead', 'Lead') },
  ]

  if (loading) {
    return (
      <PageContainer title="CRM" breadcrumbs={breadcrumbs}>
        <div className="space-y-3 px-4 pb-24 md:px-6" role="status" aria-label={copy('Loading lead', 'Carregando lead')}>
          <div className="h-7 w-56 max-w-full animate-pulse rounded-[2px] bg-muted" />
          <div className="h-4 w-72 max-w-full animate-pulse rounded-[2px] bg-muted" />
          <div className="h-48 animate-pulse rounded-md bg-muted" />
        </div>
      </PageContainer>
    )
  }

  if (!lead) {
    return (
      <PageContainer title="CRM" breadcrumbs={breadcrumbs} header={<DeskHeader title={copy('Lead unavailable', 'Lead indisponível')} tone="bad" status={copy('Unavailable', 'Indisponível')} />}>
        <div className="space-y-3 px-4 pb-24 md:px-6">
          <Notice tone="bad">{error || copy('This lead was not found.', 'Lead não encontrado.')}</Notice>
          <Track>
            <Pill onClick={() => loadLead()}>{copy('Retry', 'Tentar novamente')}</Pill>
            <Pill asChild><Link href={`${basePath}/platform/crm`}>{copy('Back to CRM', 'Voltar ao CRM')}</Link></Pill>
          </Track>
        </div>
      </PageContainer>
    )
  }

  const currentStatus = leadStatus(lead.status, locale)
  const openTasks = lead.tasks.filter(item => !item.completed)
  const completedTasks = lead.tasks.filter(item => item.completed)
  const responseOverdue = Boolean(lead.firstResponseDueAt && !lead.firstResponseAt && new Date(lead.firstResponseDueAt).getTime() < Date.now())
  const isClosed = CLOSED_LEAD_STATUSES.includes(lead.status || '')
  const allowedStatuses = LEAD_TRANSITIONS[lead.status || 'new'] || []
  const activeVisits = lead.salesVisits.filter(visit => VISIT_ACTIONS[visit.status || ''])
  const pastVisits = lead.salesVisits.filter(visit => !VISIT_ACTIONS[visit.status || ''])
  const selectSm = 'h-11 rounded-[4px] sm:h-9'
  const nextTask = [...openTasks].sort((a, b) =>
    (a.dueDate ? Date.parse(a.dueDate) : Infinity) - (b.dueDate ? Date.parse(b.dueDate) : Infinity))[0] || null
  const nextTaskOverdue = Boolean(nextTask?.dueDate && Date.parse(nextTask.dueDate) < Date.now())
  const awaitingResponse = !isClosed && !lead.firstResponseAt
  const responseState = lead.firstResponseAt
    ? `${copy('Responded', 'Respondido em')} ${formatDateTime(lead.firstResponseAt, timeZone, locale)}`
    : responseOverdue
      ? copy('First response overdue', 'Prazo do primeiro contato vencido')
      : lead.firstResponseDueAt ? `${copy('Respond by', 'Responder até')} ${formatDateTime(lead.firstResponseDueAt, timeZone, locale)}` : copy('No response yet', 'Ainda sem resposta')
  const dealHref = `${basePath}/platform/deals/create?leadId=${lead.id}${lead.interestedVehicle ? `&vehicleId=${lead.interestedVehicle.id}` : ''}`
  // While the lead waits on a first response, reaching the customer is the next action; after that, the deal.
  const contactFirst = awaitingResponse && Boolean(lead.phone || lead.email)

  const header = (
    <DeskHeader
      title={leadName(lead, locale)}
      tone={currentStatus.tone}
      status={currentStatus.label}
      meta={<span>{currentStatus.label} · {responseState} · {lead.assignedSalesperson?.name || copy('Unassigned', 'Sem responsável')} · {sourceLabel(lead.source, locale)} · {copy('Created', 'Cadastrado em')} {formatDateTime(lead.createdAt, timeZone, locale)}</span>}
      actions={
        <>
          <Pill variant="plain" className="max-md:h-10" onClick={() => loadLead()} aria-label={copy('Refresh', 'Atualizar')}><RefreshCw /></Pill>
          <Pill variant="plain" className="max-md:h-10" onClick={openEdit} disabled={!canManage || saving} title={manageReason}><Pencil />{copy('Edit', 'Editar')}</Pill>
          {lead.email && <Pill asChild className="max-md:h-10" variant={contactFirst && !lead.phone ? 'primary' : 'raised'}><a href={`mailto:${lead.email}`}><Mail />{copy('Email', 'E-mail')}</a></Pill>}
          {lead.phone && <Pill asChild className="max-md:h-10" variant={contactFirst ? 'primary' : 'raised'}><a href={`tel:${lead.phone}`}><Phone />{copy('Call', 'Ligar')}</a></Pill>}
          <Pill asChild className="max-md:h-10" variant={contactFirst ? 'raised' : 'primary'}>
            <Link href={dealHref}>{copy('Start deal', 'Iniciar venda')}</Link>
          </Pill>
        </>
      }
    />
  )

  const visitRow = (visit: Visit) => {
    const status = VISIT_STATUSES[visit.status || ''] || { label: systemLabel(visit.status, locale), tone: 'idle' as DeskTone }
    const actions = VISIT_ACTIONS[visit.status || ''] || []
    const outcome = VISIT_OUTCOMES.find(item => item.value === visit.outcome)?.label || visit.outcome
    return (
      <div key={visit.id} className="space-y-2 px-3 py-2.5">
        <div className="min-w-0">
          <TitleLine as="p" tone={status.tone} status={pt ? systemLabel(visit.status, locale) : status.label} className="text-sm font-medium">
            {copy(visit.kind === 'showroom' ? 'Showroom visit' : 'Sales appointment', visit.kind === 'showroom' ? 'Visita à loja' : 'Atendimento de vendas')} · {pt ? systemLabel(visit.status, locale) : status.label}
          </TitleLine>
          <p className="pl-4 text-xs text-muted-foreground">
            {[
              visit.scheduledAt && `${copy('Scheduled', 'Agendado para')} ${formatDateTime(visit.scheduledAt, timeZone, locale)}`,
              visit.arrivedAt && `${copy('Arrived', 'Chegou em')} ${formatDateTime(visit.arrivedAt, timeZone, locale)}`,
              visit.managerTurnAt && `${copy('Manager', 'Gerente')} ${formatDateTime(visit.managerTurnAt, timeZone, locale)}${visit.manager?.name ? ` ${copy('to', 'com')} ${visit.manager.name}` : ''}`,
              visit.completedAt && `${copy('Completed', 'Concluído em')} ${formatDateTime(visit.completedAt, timeZone, locale)}`,
            ].filter(Boolean).join(' · ')}
          </p>
          <p className="pl-4 text-xs text-muted-foreground">
            {[visit.vehicle ? vehicleName(visit.vehicle, locale) : null, visit.assignedSalesperson?.name, outcome && `${copy('Outcome', 'Resultado')}: ${pt ? systemLabel(visit.outcome, locale) : outcome}`].filter(Boolean).join(' · ')}
          </p>
          {visit.notes && <p className="mt-0.5 whitespace-pre-line break-words pl-4 text-xs">{visit.notes}</p>}
        </div>
        {actions.length > 0 && (
          <Track className="ml-4">
            {actions.map(action => (
              <Pill key={action} size="sm" className="h-11 sm:h-7" onClick={() => openVisit(action, visit)} disabled={!canManage || saving} title={manageReason}>
                {VISIT_ACTION_LABEL[action][pt ? 'pt' : 'en']}
              </Pill>
            ))}
          </Track>
        )}
      </div>
    )
  }

  return (
    <PageContainer title="CRM" header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full px-4 pb-24 md:px-6">
        {responseOverdue && <Notice tone="warn" className="mb-4">{copy('First response overdue · due', 'Prazo do primeiro contato vencido · previsto para')} {formatDateTime(lead.firstResponseDueAt, timeZone, locale)}</Notice>}
        {notice && <Notice tone={notice.tone} className="mb-4">{notice.text}</Notice>}
        {!canManage && <p className="mb-4 text-xs text-muted-foreground">{copy('Read only · requires lead management permission', 'Somente leitura · requer permissão para gerenciar leads')}</p>}

        <div className="mb-8 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <DeskSection title={copy('Next task', 'Próxima tarefa')} id="lead-next-task">
            {nextTask ? (
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-foreground">{nextTask.title}</p>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {nextTask.dueDate ? (
                      nextTaskOverdue
                        ? <Attention>{copy('Overdue', 'Atrasada')} · {formatDateTime(nextTask.dueDate, timeZone, locale)}</Attention>
                        : <span>{copy('Due', 'Vence em')} {formatDateTime(nextTask.dueDate, timeZone, locale)}</span>
                    ) : <span>{copy('No due date', 'Sem data de vencimento')}</span>}
                    <span>{systemLabel(nextTask.priority, locale)}</span>
                    {nextTask.assignedTo?.name && <span>{nextTask.assignedTo.name}</span>}
                  </p>
                  {nextTask.description && <p className="mt-1 break-words text-xs text-muted-foreground">{nextTask.description}</p>}
                </div>
                <Pill
                  variant="primary"
                  className="h-10 shrink-0 md:h-8"
                  onClick={() => completeTask(nextTask.id)}
                  disabled={!canTasks || saving}
                  title={canTasks ? undefined : copy('Requires task permission', 'Requer permissão para gerenciar tarefas')}
                  aria-label={`${copy('Complete', 'Concluir')} ${nextTask.title || copy('task', 'tarefa')}`}
                >
                  <Check />{copy('Done', 'Concluída')}
                </Pill>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-[13px] text-muted-foreground">{copy('No open tasks', 'Nenhuma tarefa em aberto')}</p>
                {awaitingResponse && <p className="text-[13px] text-foreground">{responseOverdue ? <Attention>{copy('First response overdue', 'Prazo do primeiro contato vencido')}</Attention> : responseState}</p>}
              </div>
            )}
          </DeskSection>

          <DeskSection title={copy('Contact', 'Contato')} id="lead-contact">
            <div className="grid min-w-0 grid-cols-1 gap-x-8 md:grid-cols-2">
              <Facts items={[
                { label: copy('Phone', 'Telefone'), value: lead.phone ? <a className="underline-offset-2 hover:underline" href={`tel:${lead.phone}`}>{formatPhone(lead.phone)}</a> : '-' },
                { label: copy('Email', 'E-mail'), value: lead.email ? <a className="break-all underline-offset-2 hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a> : '-' },
                { label: copy('Preferred channel', 'Canal preferido'), value: <span>{lead.customer?.preferredChannel && lead.customer.preferredChannel !== 'none' ? systemLabel(lead.customer.preferredChannel, locale) : copy('No preference', 'Sem preferência')}</span> },
                { label: copy('First response', 'Primeiro contato'), value: responseOverdue ? <Attention>{copy('Overdue', 'Atrasado')}</Attention> : lead.firstResponseAt ? `${copy('Responded', 'Respondido em')} ${formatDateTime(lead.firstResponseAt, timeZone, locale)}` : lead.firstResponseDueAt ? `${copy('Due', 'Prazo')} ${formatDateTime(lead.firstResponseDueAt, timeZone, locale)}` : copy('No SLA', 'Sem prazo definido') },
              ]} />
              <Facts items={[
                { label: copy('Source', 'Origem'), value: sourceLabel(lead.source, locale) },
                { label: copy('Timeframe', 'Quando pretende comprar?'), value: timeframeLabel(lead.timeframe, locale) },
                { label: copy('Last contact', 'Último contato'), value: formatDateTime(lead.lastContact, timeZone, locale) },
                { label: copy('Customer', 'Cliente'), value: lead.customer ? (
                  <Link className="underline underline-offset-2" href={`${basePath}/platform/customers/${lead.customer.id}`}>
                    {[lead.customer.firstName, lead.customer.lastName].filter(Boolean).join(' ') || copy('Customer', 'Cliente')}
                  </Link>
                ) : copy('Not linked', 'Não vinculado') },
                duplicateCount > 0 && { label: copy('Duplicates', 'Possíveis duplicados'), value: (
                  <Link className="text-amber-700 underline underline-offset-2 dark:text-amber-300" href={`${basePath}/platform/customers/${lead.customer?.id}#duplicates`}>
                    {duplicateCount} {copy('possible', 'possíveis')}
                  </Link>
                ) },
                lead.customer?.household && { label: copy('Household', 'Núcleo familiar'), value: lead.customer.household.displayName || '-' },
              ]} />
            </div>
          </DeskSection>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-8">
            <DeskSection title={copy('Activity', 'Atividade')} count={lead.interactions.length}>
              {canManage && (
                <Panel className="space-y-2 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={interaction.interactionType} onValueChange={value => setInteraction(prev => ({ ...prev, interactionType: value }))}>
                      <SelectTrigger className={selectSm} aria-label={copy('Interaction type', 'Tipo de atendimento')}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="phone">{copy('Phone', 'Telefone')}</SelectItem>
                        <SelectItem value="email">{copy('Email', 'E-mail')}</SelectItem>
                        <SelectItem value="sms">{copy('Text', 'Mensagem de texto')}</SelectItem>
                        <SelectItem value="visit">{copy('Visit', 'Visita')}</SelectItem>
                        <SelectItem value="test-drive">Test-drive</SelectItem>
                        <SelectItem value="video">{copy('Video', 'Vídeo')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={interaction.outcome} onValueChange={value => setInteraction(prev => ({ ...prev, outcome: value }))}>
                      <SelectTrigger className={selectSm} aria-label={copy('Interaction outcome', 'Resultado do atendimento')}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="positive">{copy('Positive', 'Positivo')}</SelectItem>
                        <SelectItem value="neutral">{copy('Neutral', 'Neutro')}</SelectItem>
                        <SelectItem value="negative">{copy('Negative', 'Negativo')}</SelectItem>
                        <SelectItem value="no-answer">{copy('No answer', 'Não atendeu')}</SelectItem>
                        <SelectItem value="voicemail">{copy('Voicemail', 'Correio de voz')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Textarea
                    aria-label={copy('Interaction notes', 'Observações do atendimento')}
                    aria-invalid={Boolean(interactionError)}
                    value={interaction.notes}
                    onChange={event => { setInteraction(prev => ({ ...prev, notes: event.target.value })); setInteractionError(null) }}
                    placeholder={copy('Notes', 'Observações')}
                    className="min-h-20 rounded-[4px]"
                  />
                  {interactionError && <p className="text-xs text-red-600 dark:text-red-400">{interactionError}</p>}
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      {copy('Follow up', 'Data para retorno')}
                      <Input aria-label={copy('Follow-up date', 'Data para retorno')} type="datetime-local" value={interaction.followUpDate} onChange={event => setInteraction(prev => ({ ...prev, followUpDate: event.target.value }))} className="h-11 min-w-0 flex-1 rounded-[4px] sm:h-9 sm:w-56" />
                    </label>
                    <Track className="self-end">
                      <Pill variant="primary" className="h-11 sm:h-8" onClick={logInteraction} disabled={saving}>{copy('Log activity', 'Registrar atendimento')}</Pill>
                    </Track>
                  </div>
                </Panel>
              )}

              {lead.interactions.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{copy('No activity', 'Nenhuma atividade registrada')}</p>
              ) : (
                <ol className="mt-4 space-y-0">
                  {lead.interactions.map(item => (
                    <li key={item.id} className="relative border-l pb-4 pl-5 last:pb-0">
                      <span className="absolute -left-[4px] top-1.5 size-2 rounded-[1px] bg-muted-foreground/50" aria-hidden="true" />
                      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
                        <p className="text-sm font-medium capitalize">
                          {systemLabel(item.interactionType, locale)}
                          <span className="font-normal text-muted-foreground"> · {systemLabel(item.outcome, locale)}</span>
                        </p>
                        <p className="text-xs tabular-nums text-muted-foreground">{formatDateTime(item.date, timeZone, locale)}</p>
                      </div>
                      {item.performedBy?.name && <p className="text-xs text-muted-foreground">{item.performedBy.name}</p>}
                      {item.notes && <p className="mt-1 whitespace-pre-line break-words text-sm">{item.notes}</p>}
                      {item.followUpDate && <p className="mt-1 text-xs text-sky-700 dark:text-sky-300">{copy('Follow up', 'Retorno')} {formatDateTime(item.followUpDate, timeZone, locale)}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </DeskSection>

            <DeskSection
              title={copy('Tasks', 'Tarefas')}
              count={openTasks.length}
              actions={completedTasks.length > 0 ? (
                <Track>
                  <Pill size="sm" variant="plain" className="max-md:h-10" aria-pressed={showCompleted} onClick={() => setShowCompleted(value => !value)}>{showCompleted ? copy('Hide', 'Ocultar') : copy('Show', 'Mostrar')} {completedTasks.length} {copy('completed', 'concluídas')}</Pill>
                </Track>
              ) : undefined}
            >
              {openTasks.length > 0 && (
                <Panel className="mb-3 divide-y">
                  {openTasks.map(item => {
                    const overdue = Boolean(item.dueDate && new Date(item.dueDate).getTime() < Date.now())
                    return (
                      <div key={item.id} className="flex min-w-0 items-start justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <TitleLine as="p" tone={overdue ? 'bad' : PRIORITY_TONE[item.priority || ''] ?? 'idle'} status={overdue ? copy('Overdue', 'Atrasada') : systemLabel(item.priority, locale)} className="text-sm font-medium">
                            {item.title}
                          </TitleLine>
                          <p className={`pl-4 text-xs ${overdue ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                            {item.dueDate ? `${overdue ? copy('Overdue', 'Atrasada') : copy('Due', 'Vence em')} ${formatDateTime(item.dueDate, timeZone, locale)}` : copy('No due date', 'Sem data de vencimento')} · {systemLabel(item.priority, locale)}
                            {item.assignedTo?.name ? ` · ${item.assignedTo.name}` : ''}
                          </p>
                          {item.description && <p className="mt-0.5 break-words pl-4 text-xs text-muted-foreground">{item.description}</p>}
                        </div>
                        <Track className="shrink-0">
                          <Pill size="sm" className="h-11 sm:h-7" onClick={() => completeTask(item.id)} disabled={!canTasks || saving} title={canTasks ? undefined : copy('Requires task permission', 'Requer permissão para gerenciar tarefas')} aria-label={`${copy('Complete', 'Concluir')} ${item.title || copy('task', 'tarefa')}`}>
                            <Check />{copy('Done', 'Concluída')}
                          </Pill>
                        </Track>
                      </div>
                    )
                  })}
                </Panel>
              )}
              {openTasks.length === 0 && <p className="pb-3 text-sm text-muted-foreground">{copy('No open tasks', 'Nenhuma tarefa em aberto')}</p>}
              {showCompleted && completedTasks.length > 0 && (
                <Panel className="mb-3 divide-y">
                  {completedTasks.map(item => (
                    <div key={item.id} className="px-4 py-2.5">
                      <TitleLine as="p" tone="ok" status={copy('Completed', 'Concluída')} className="text-sm text-muted-foreground line-through">{item.title}</TitleLine>
                      <p className="pl-4 text-xs text-muted-foreground">{copy('Completed', 'Concluída em')} {formatDateTime(item.completedDate, timeZone, locale)}{item.assignedTo?.name ? ` · ${item.assignedTo.name}` : ''}</p>
                    </div>
                  ))}
                </Panel>
              )}

              {canTasks && (
                <Panel className="space-y-2 p-3">
                  <Input aria-label={copy('Task title', 'Título da tarefa')} aria-invalid={Boolean(taskError)} className="h-11 rounded-[4px] sm:h-9" value={task.title} onChange={event => { setTask(prev => ({ ...prev, title: event.target.value })); setTaskError(null) }} placeholder={copy('Task title', 'Título da tarefa')} maxLength={200} />
                  <Textarea aria-label={copy('Task details', 'Detalhes da tarefa')} value={task.description} onChange={event => setTask(prev => ({ ...prev, description: event.target.value }))} placeholder={copy('Details', 'Detalhes')} className="min-h-16 rounded-[4px]" maxLength={4000} />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Input aria-label={copy('Task due date', 'Prazo da tarefa')} type="datetime-local" value={task.dueDate} onChange={event => setTask(prev => ({ ...prev, dueDate: event.target.value }))} className="h-11 min-w-0 rounded-[4px] sm:h-9" />
                    <Select value={task.assignedToId || '__owner__'} onValueChange={value => setTask(prev => ({ ...prev, assignedToId: value === '__owner__' ? '' : value }))}>
                      <SelectTrigger className={selectSm} aria-label={copy('Task assignee', 'Responsável pela tarefa')}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__owner__">{copy('Lead owner', 'Responsável pelo lead')}</SelectItem>
                        {staff.map(person => <SelectItem key={person.id} value={person.id}>{person.name || copy('Unnamed', 'Sem nome')}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={task.priority} onValueChange={value => setTask(prev => ({ ...prev, priority: value }))}>
                      <SelectTrigger className={selectSm} aria-label={copy('Task priority', 'Prioridade da tarefa')}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">{copy('Low', 'Baixa')}</SelectItem>
                        <SelectItem value="medium">{copy('Medium', 'Média')}</SelectItem>
                        <SelectItem value="high">{copy('High', 'Alta')}</SelectItem>
                        <SelectItem value="urgent">{copy('Urgent', 'Urgente')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={task.communicationChannel} onValueChange={value => setTask(prev => ({ ...prev, communicationChannel: value }))}>
                      <SelectTrigger className={selectSm} aria-label={copy('Task channel', 'Canal da tarefa')}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal">{copy('Internal', 'Interno')}</SelectItem>
                        <SelectItem value="email">{copy('Email', 'E-mail')}</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="phone">{copy('Phone', 'Telefone')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {taskError && <p className="text-xs text-red-600 dark:text-red-400">{taskError}</p>}
                  <div className="flex justify-end">
                    <Track><Pill className="h-11 sm:h-8" onClick={createTask} disabled={saving}>{copy('Create task', 'Criar tarefa')}</Pill></Track>
                  </div>
                </Panel>
              )}
            </DeskSection>

            <DeskSection
              title={copy('Visits and appointments', 'Visitas e agendamentos')}
              count={lead.salesVisits.length}
              actions={
                <Track>
                  <Pill size="sm" className="h-11 sm:h-7" onClick={() => openVisit('schedule')} disabled={!canManage || saving || isClosed} title={isClosed ? copy('Lead is closed', 'O lead está encerrado') : manageReason}>
                    <CalendarPlus />{copy('Schedule', 'Agendar')}
                  </Pill>
                </Track>
              }
            >
              {lead.salesVisits.length === 0 ? (
                <p className="text-sm text-muted-foreground">{copy('No visits', 'Nenhuma visita registrada')}</p>
              ) : (
                <div className="space-y-3">
                  {activeVisits.length > 0 && <Panel className="divide-y">{activeVisits.map(visitRow)}</Panel>}
                  {pastVisits.length > 0 && <Panel className="divide-y">{pastVisits.map(visitRow)}</Panel>}
                </div>
              )}
            </DeskSection>

            <DeskSection title={copy('Notes', 'Observações')}>
              <p className="whitespace-pre-line break-words text-sm">{lead.notes || <span className="text-muted-foreground">{copy('No notes', 'Nenhuma observação')}</span>}</p>
            </DeskSection>
          </div>

          <div className="min-w-0 space-y-8">
            <DeskSection title={copy('Status', 'Status')}>
              <div className="space-y-3">
                <Select value={lead.status || 'new'} onValueChange={updateLeadStatus} disabled={saving || !canManage || allowedStatuses.length === 0}>
                  <SelectTrigger aria-label={copy('Lead status', 'Status do lead')} className={selectSm}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.filter(status => status.value === lead.status || allowedStatuses.includes(status.value)).map(status => (
                      <SelectItem key={status.value} value={status.value}>{leadStatus(status.value, locale).label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isClosed && <p className="text-xs text-muted-foreground">{copy('Closed leads cannot change status', 'Leads encerrados não podem ter o status alterado')}</p>}
                {lead.status === 'closed-lost' && (lead.lostReasonCode || lead.lostReason) && (
                  <Facts items={[
                    !!lead.lostReasonCode && { label: copy('Lost reason', 'Motivo da perda'), value: <span>{systemLabel(lead.lostReasonCode, locale)}</span> },
                    !!lead.lostReason && { label: copy('Details', 'Detalhes'), value: lead.lostReason },
                  ]} />
                )}
              </div>
            </DeskSection>

            <DeskSection
              title={copy('Owner', 'Responsável')}
              actions={
                <Track>
                  {!lead.assignedSalesperson && (
                    <Pill size="sm" className="h-11 sm:h-7" onClick={applyRoutingRule} disabled={!canManage || saving} title={manageReason}><Route />{copy('Route', 'Distribuir')}</Pill>
                  )}
                  <Pill size="sm" className="h-11 sm:h-7" onClick={openTransfer} disabled={!canManage || saving} title={manageReason}><ArrowRightLeft />{copy('Transfer', 'Transferir')}</Pill>
                </Track>
              }
            >
              <Facts items={[
                { label: copy('Salesperson', 'Vendedor responsável'), value: lead.assignedSalesperson?.name || copy('Unassigned', 'Sem responsável') },
                { label: copy('Assigned', 'Atribuído em'), value: formatDateTime(lead.assignedAt, timeZone, locale) },
                { label: copy('First response', 'Primeiro contato'), value: lead.firstResponseAt ? `${copy('Responded', 'Respondido em')} ${formatDateTime(lead.firstResponseAt, timeZone, locale)}` : lead.firstResponseDueAt ? `${copy('Due', 'Prazo')} ${formatDateTime(lead.firstResponseDueAt, timeZone, locale)}` : copy('No SLA', 'Sem prazo definido') },
              ]} />
              <p className="mt-4 text-[12px] font-medium text-muted-foreground">{copy('Assignment history', 'Histórico de atribuições')}</p>
              {lead.assignmentEvents.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">{copy('No assignments', 'Nenhuma atribuição registrada')}</p>
              ) : (
                <ol className="mt-2 space-y-0">
                  {lead.assignmentEvents.map(event => (
                    <li key={event.id} className="relative border-l pb-3 pl-4 last:pb-0">
                      <span className="absolute -left-[4px] top-1.5 size-2 rounded-[1px] bg-muted-foreground/50" aria-hidden="true" />
                      <p className="text-sm">{event.fromUser?.name ? `${event.fromUser.name} ${copy('to', 'para')} ` : ''}{event.toUser?.name || copy('Unknown', 'Não identificado')}</p>
                      <p className="text-xs text-muted-foreground">
                        {[formatDateTime(event.assignedAt, timeZone, locale), event.routeKey ? (ROUTE_LABEL[event.routeKey]?.[pt ? 'pt' : 'en'] || copy('Routing rule', 'Regra de distribuição')) : null, event.actor?.name ? `${copy('by', 'por')} ${event.actor.name}` : null].filter(Boolean).join(' · ')}
                      </p>
                      {event.reason && <p className="break-words text-xs text-muted-foreground">{event.reason}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </DeskSection>

            <DeskSection title={copy('Vehicle of interest', 'Veículo de interesse')}>
              {lead.interestedVehicle ? (
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{vehicleName(lead.interestedVehicle, locale)}</p>
                    <p className="text-xs text-muted-foreground">
                      <Code>#{lead.interestedVehicle.stockNumber}</Code> · <span className="tabular-nums">{formatCurrency(lead.interestedVehicle.price, locale, lead.rooftop.currencyCode)}</span>
                    </p>
                  </div>
                  <Track className="shrink-0">
                    <Pill size="sm" asChild><Link href={`/inventory/${lead.interestedVehicle.id}`}>{copy('Listing', 'Anúncio')}</Link></Pill>
                  </Track>
                </div>
              ) : <p className="text-sm text-muted-foreground">{copy('No vehicle', 'Nenhum veículo de interesse')}</p>}
            </DeskSection>

            <DeskSection title={copy('Trade and finance', 'Troca e financiamento')}>
              <Facts items={[
                { label: copy('Trade-in', 'Veículo na troca'), value: lead.tradeInVehicle || '-' },
                { label: copy('Budget', 'Faixa de preço'), value: budgetLabel(lead.budgetRange, locale, lead.rooftop.currencyCode) },
              ]} />
              {lead.deals.length > 0 ? (
                <Panel className="mt-3 divide-y">
                  {lead.deals.map(deal => (
                    <Link key={deal.id} href={`${basePath}/platform/deals/${deal.id}`} className="flex min-w-0 items-start justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40">
                      <div className="min-w-0">
                        <TitleLine as="p" tone={dealTone[deal.status || ''] ?? 'idle'} status={systemLabel(deal.status, locale)} className="text-sm font-medium">{vehicleName(deal.vehicle, locale)}</TitleLine>
                        <p className="pl-4 text-xs text-muted-foreground">{systemLabel(deal.status, locale)}</p>
                      </div>
                      <div className="shrink-0 text-right tabular-nums">
                        {deal.structureType === 'cash' ? (
                          <>
                            <p className="text-sm font-medium">{formatCurrency(deal.totalPrice ?? deal.vehiclePrice, locale, lead.rooftop.currencyCode)}</p>
                            <p className="text-xs text-muted-foreground">{copy('Cash', 'À vista')}</p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-medium">{formatCurrency(deal.vehiclePrice, locale, lead.rooftop.currencyCode)}</p>
                            <p className="text-xs text-muted-foreground">{deal.monthlyPayment ? `${formatCurrency(deal.monthlyPayment, locale, lead.rooftop.currencyCode)}${pt ? '/mês' : '/mo'}` : copy('Finance', 'Financiamento')}</p>
                          </>
                        )}
                      </div>
                    </Link>
                  ))}
                </Panel>
              ) : <p className="mt-2 text-sm text-muted-foreground">{copy('No deals', 'Nenhuma venda registrada')}</p>}
            </DeskSection>

            <DeskSection title={copy('Test drives', 'Test-drives')} count={lead.testDrives.length}>
              {lead.testDrives.length > 0 ? (
                <Panel className="divide-y">
                  {lead.testDrives.map(testDrive => {
                    const state = testDrive.completed ? copy('Completed', 'Concluído') : testDrive.noShow ? copy('No-show', 'Não compareceu') : copy('Scheduled', 'Agendado')
                    return (
                      <div key={testDrive.id} className="flex min-w-0 items-baseline justify-between gap-3 px-3 py-2.5">
                        <TitleLine as="p" tone={testDrive.completed ? 'ok' : testDrive.noShow ? 'bad' : 'info'} status={state} className="text-sm">{vehicleName(testDrive.vehicle, locale)}</TitleLine>
                        <span className="shrink-0 text-right text-xs text-muted-foreground"><span className="tabular-nums">{formatDateTime(testDrive.scheduledTime, timeZone, locale)}</span> · {state}</span>
                      </div>
                    )
                  })}
                </Panel>
              ) : <p className="text-sm text-muted-foreground">{copy('No test drives', 'Nenhum test-drive agendado')}</p>}
            </DeskSection>

            <DeskSection title={copy('Consent', 'Consentimento de contato')}>
              <div className="space-y-3">
                <Facts items={[
                  { label: 'E-mail', value: consentLabel(lead.customer?.emailSuppressed, lead.customer?.emailConsent, locale) },
                  { label: 'SMS', value: consentLabel(lead.customer?.smsSuppressed, lead.customer?.smsConsent, locale) },
                  { label: copy('Phone', 'Telefone'), value: consentLabel(lead.customer?.phoneSuppressed, lead.customer?.phoneConsent, locale) },
                ]} />
                <Select value={contactChannel} onValueChange={setContactChannel} disabled={!lead.customer || saving || !canManage}>
                  <SelectTrigger aria-label={copy('Preferred channel', 'Canal preferido')} className={selectSm}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{copy('No preferred channel', 'Sem canal preferido')}</SelectItem>
                    <SelectItem value="email">{copy('Email', 'E-mail')}</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="phone">{copy('Phone', 'Telefone')}</SelectItem>
                  </SelectContent>
                </Select>
                <Track block>
                  <Pill size="sm" className="h-11 sm:h-7" onClick={() => saveContactPreference(false)} disabled={!lead.customer || saving || !canManage} title={manageReason}>{copy('Save preference', 'Salvar preferência')}</Pill>
                  <Pill size="sm" className="h-11 sm:h-7" onClick={() => saveContactPreference(true)} disabled={!lead.customer || contactChannel === 'none' || saving || !canManage} title={manageReason}>{copy('Suppress', 'Bloquear contato')}</Pill>
                </Track>
              </div>
            </DeskSection>

            <DeskSection title={copy('Cadence', 'Sequência de contatos')}>
              <div className="space-y-3">
                <Facts items={[
                  { label: copy('Status', 'Status'), value: systemLabel(lead.cadenceStatus, locale) },
                  !!lead.cadenceStep && { label: copy('Step', 'Etapa'), value: systemLabel(lead.cadenceStep, locale) },
                  !!lead.cadenceDueAt && { label: copy('Due', 'Próximo contato'), value: formatDateTime(lead.cadenceDueAt, timeZone, locale) },
                ]} />
                <FormField id="cadence-campaign" label={copy('Campaign', 'Campanha')}>
                  <Input id="cadence-campaign" className="h-11 rounded-[4px] sm:h-9" value={cadence.campaignKey} onChange={event => setCadence(prev => ({ ...prev, campaignKey: event.target.value }))} disabled={!canManage} />
                </FormField>
                <Select value={cadence.cadenceKey} onValueChange={value => setCadence(prev => ({ ...prev, cadenceKey: value }))} disabled={!canManage}>
                  <SelectTrigger aria-label={copy('Follow-up cadence', 'Sequência de contatos')} className={selectSm}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internet-lead-first-response">{copy('Internet first response', 'Primeiro contato de lead on-line')}</SelectItem>
                    <SelectItem value="showroom-follow-up">{copy('Showroom follow-up', 'Retorno após visita à loja')}</SelectItem>
                    <SelectItem value="unsold-follow-up">{copy('Unsold follow-up', 'Retorno de venda não concluída')}</SelectItem>
                  </SelectContent>
                </Select>
                <Track block>
                  <Pill size="sm" className="h-11 sm:h-7" onClick={enrollCadence} disabled={saving || isClosed || !canManage} title={isClosed ? copy('Lead is closed', 'O lead está encerrado') : manageReason}>{copy('Enroll', 'Iniciar')}</Pill>
                  <Pill size="sm" className="h-11 sm:h-7" onClick={advanceCadence} disabled={saving || lead.cadenceStatus !== 'active' || !canManage} title={lead.cadenceStatus !== 'active' ? copy('No active cadence', 'Nenhuma sequência ativa') : manageReason}>{copy('Advance', 'Avançar')}</Pill>
                </Track>
              </div>
            </DeskSection>
          </div>
        </div>

        <OperatorActionDialog
          open={lostReasonDialogOpen}
          title={copy('Close lead as lost', 'Encerrar lead como perdido')}
          fields={[
            { name: 'lostReasonCode', label: copy('Lost reason', 'Motivo da perda'), type: 'select', placeholder: copy('Select a reason', 'Selecione o motivo'), options: lostReasonOptions.map(item => ({ value: item.value, label: pt ? item.labelPt : item.label })) },
            { name: 'lostReasonDetails', label: copy('Additional details', 'Detalhes adicionais'), type: 'textarea', required: false, maxLength: 2000, placeholder: copy('Optional', 'Opcional') },
          ]}
          values={lostReasonValues}
          error={lostReasonError}
          busy={saving}
          submitLabel={copy('Close as lost', 'Encerrar como perdido')}
          onValuesChange={values => setLostReasonValues({ lostReasonCode: values.lostReasonCode || '', lostReasonDetails: values.lostReasonDetails || '' })}
          onSubmit={submitLostLeadTransition}
          onOpenChange={handleLostReasonDialogOpenChange}
        />
        <LeadFormDialog
          mode="edit"
          open={editOpen}
          onOpenChange={setEditOpen}
          initialValues={leadFormValues(lead)}
          rooftops={[]}
          vehicles={[
            ...(lead.interestedVehicle && !vehicles.some(vehicle => vehicle.id === lead.interestedVehicle?.id)
              ? [{ ...lead.interestedVehicle, rooftop: { id: lead.rooftop.id } }]
              : []),
            ...vehicles.filter(vehicle => !vehicle.rooftop || vehicle.rooftop.id === lead.rooftop.id),
          ]}
          onSubmit={submitEdit}
        />
        <TransferLeadDialog
          open={transferOpen}
          onOpenChange={setTransferOpen}
          staff={staff}
          currentOwnerId={lead.assignedSalesperson?.id || null}
          onSubmit={submitTransfer}
        />
        {visitDialog && (
          <SalesVisitDialog
            action={visitDialog.action}
            open={Boolean(visitDialog)}
            onOpenChange={open => { if (!open) setVisitDialog(null) }}
            timeZone={timeZone}
            staff={staff}
            vehicles={vehicles.filter(vehicle => !vehicle.rooftop || vehicle.rooftop.id === lead.rooftop.id)}
            defaultVehicleId={lead.interestedVehicle?.id || null}
            viewerId={viewer?.id || null}
            onSubmit={submitVisit}
          />
        )}
      </div>
    </PageContainer>
  )
}
