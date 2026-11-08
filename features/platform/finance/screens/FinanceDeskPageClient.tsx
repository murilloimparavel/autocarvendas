'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { Plus, RefreshCw, Search, X } from 'lucide-react'
import { DealMenuPanel, type MenuRequest } from '../components/DealMenuPanel'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { OperatorActionDialog, type OperatorActionField } from '@/features/platform/components/OperatorActionDialog'
import {
  Attention,
  Code,
  DeskHeader,
  DeskSection,
  DeskTable,
  Facts,
  Figure,
  Notice,
  Pill,
  Readout,
  ReadoutStrip,
  Segmented,
  Status,
  Td,
  Th,
  TitleLine,
  Tr,
  Track,
  type DeskTone,
} from '@/features/platform/components/desk'
import { countLabel, daysSince, financeDeskStatus, formatAge, financeLabel } from '../lib/display'
import { centsToDollarInput, parseDollarsToCents, readDeskFinanceEvidence, type FinanceStep, type FinanceStepCode } from '../lib/financeEvidence'
import { FinanceEvidenceHistory } from '@/features/platform/deals/components/FinanceEvidenceHistory'
import { formatPhone } from '@/features/platform/lib/format'
import { DEAL_PAYMENT_METHODS, DEAL_PAYMENT_METHOD_LABELS } from '@/features/keystone/lifecycle/paymentMethods'
import { cn } from '@/lib/utils'
import { useLocale } from '@/features/i18n/LocaleProvider'
import {
  getFinanceWorkspace,
  manageFinanceContractPackage,
  manageFinanceFundingCase,
  openFinanceFollowUp,
  queueFinancingApplication,
  recordCashDealDeposit,
  recordFinanceComplianceCheck,
  recordLenderDecision,
  reviewFinancePrerequisites,
  transitionDeal,
} from '../actions'
import type {
  ComplianceCheck,
  ContractPackage,
  Deal,
  FinanceApplication,
  FinanceLead,
  FinanceMenu,
  FinanceProduct,
  FinanceSubmission,
  FinanceWorkspace,
  FundingCase,
  ProductCancellation,
} from '../lib/types'

type QueueItem = {
  key: string
  who: string
  vehicle: string
  stock: string | null
  stage: string
  tone: DeskTone
  waitingOn: string
  attention: boolean
  attentionWord: string | null
  ageDays: number | null
  amount: string
  deal?: Deal
  application?: FinanceApplication
}

type FinanceTask = { kind: string; deal?: Deal; application?: FinanceApplication; menu?: FinanceMenu; submission?: FinanceSubmission; decision?: string; nextStatus?: string; fields: Record<string, string>; idempotencyKey: string }

const statusLabels: Record<string, string> = {
  pencil: 'Pencil',
  submitted: 'Submitted',
  approved: 'Approved',
  financed: 'Financed',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

const statusTones: Record<string, DeskTone> = {
  pencil: 'idle',
  submitted: 'warn',
  approved: 'info',
  financed: 'info',
  delivered: 'ok',
  cancelled: 'bad',
}

const filterOptions = [
  { value: 'active', label: 'Active' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'financed', label: 'Financed' },
  { value: 'all', label: 'All' },
]

function formatCurrency(value: number | null | undefined, locale: 'pt-BR' | 'en-US' = 'en-US') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: locale === 'pt-BR' ? 'BRL' : 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

// Dealership time zone, so the server render and the browser agree.
function formatDate(value: string | null | undefined, timeZone: string, locale: 'pt-BR' | 'en-US' = 'en-US') {
  if (!value) return '-'
  return new Date(value).toLocaleDateString(locale, { timeZone, month: 'short', day: 'numeric', year: 'numeric' })
}

const approvalLabels: Record<string, string> = {
  pending: 'Submitted for approval',
  approved: 'Approved',
  rejected: 'Rejected',
  'changes-requested': 'Changes requested',
}

// Older approvals carry boilerplate notes that named the finance desk regardless of where they were decided.
const boilerplateApprovalNote = /^(submitted for|approved by|rejected by) finance desk( approval)?\.?$/i

/** Approvals newest first, without "pending" rows that a later decision has settled. */
function visibleApprovals(approvals: Deal['approvals']) {
  const sorted = [...(approvals || [])].sort((a, b) => new Date(b.approvalDate || 0).getTime() - new Date(a.approvalDate || 0).getTime())
  return sorted.filter((approval, index) => approval.decision !== 'pending' || !sorted.slice(0, index).some(later => later.decision && later.decision !== 'pending'))
}

function approvalSummary(approval: Deal['approvals'][number], locale: 'pt-BR' | 'en-US') {
  const label = approvalLabels[approval.decision || ''] || approval.decision || 'Recorded'
  const by = approval.approver?.name ? `${financeLabel(locale, label)} ${locale === 'pt-BR' ? 'por' : 'by'} ${approval.approver.name}` : financeLabel(locale, label)
  const note = approval.notes && !boilerplateApprovalNote.test(approval.notes.trim()) ? approval.notes.trim() : null
  return { by, note }
}

const stepTone = (step: FinanceStep, next: boolean): DeskTone => step.state === 'done' ? 'ok' : next ? 'info' : step.state === 'optional' ? 'idle' : step.available ? 'warn' : 'idle'

function formatCurrencyCents(cents: number, locale: 'pt-BR' | 'en-US' = 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: locale === 'pt-BR' ? 'BRL' : 'USD' }).format(cents / 100)
}

function parseDollarsSafe(raw: string, locale: 'pt-BR' | 'en-US') {
  try { return parseDollarsToCents(raw, 'Amount', locale) } catch { return null }
}

const checkLabels: Record<string, string> = { identity: 'Identity', ofac: 'OFAC', 'red-flag': 'Red flag', privacy: 'Privacy notice' }
const checkStatusLabels: Record<string, string> = { requested: 'Requested', completed: 'Completed', failed: 'Failed', 'manual-review': 'Manual review' }
const decisionLabels: Record<string, string> = { approved: 'Approved', conditional: 'Conditional', declined: 'Declined', expired: 'Expired', cancelled: 'Cancelled' }
const fundingLabels: Record<string, string> = { pending: 'Pending', exception: 'Exception', 'clear-to-fund': 'Clear to fund', funded: 'Funded', cancelled: 'Cancelled' }
const contractStatusLabels: Record<string, string> = { preparing: 'Preparing', ready: 'Ready', sent: 'Sent', viewed: 'Viewed', signed: 'Signed', declined: 'Declined', void: 'Void' }
const documentLabels: Record<string, string> = {
  'buyers-order': 'Buyer\'s order',
  'retail-installment-contract': 'Retail installment contract',
  'privacy-disclosure': 'Privacy disclosure',
  'product-menu': 'F&I product menu',
}
const itemStatusLabels: Record<string, string> = { open: 'Open', complete: 'Complete', waived: 'Waived', resolved: 'Resolved' }
const providerLabels: Record<string, string> = { 'operator-recorded': 'Recorded by staff' }
const paymentMethodOptions = DEAL_PAYMENT_METHODS.map(value => ({ value, label: DEAL_PAYMENT_METHOD_LABELS[value] }))
const FORM_8300_STATE = 'Cash over $10,000: IRS Form 8300 required'

/** Server codes ("manual-review") to staff labels; unknown codes become "Manual review". */
function label(map: Record<string, string>, value: string | null | undefined, locale: 'pt-BR' | 'en-US' = 'en-US') {
  if (!value) return '-'
  if (map[value]) return financeLabel(locale, map[value])
  const words = value.replace(/[-_]+/g, ' ').trim()
  return financeLabel(locale, words.charAt(0).toUpperCase() + words.slice(1))
}

function paymentMethodLabel(method: string, providerKey: string, locale: 'pt-BR' | 'en-US') {
  if (method) return label(DEAL_PAYMENT_METHOD_LABELS, method, locale)
  return providerKey === 'operator-recorded' ? financeLabel(locale, 'Method not recorded') : label({ stripe: 'Card (online)' }, providerKey, locale)
}

function isCashDeal(deal: Deal) {
  return (deal.financeEvidence?.structureType ?? deal.structureType) === 'cash'
}

function contactLine(deal: Deal, pt: boolean) {
  return [formatPhone(deal.lead?.phone), deal.lead?.email?.trim()].filter(Boolean).join(' · ') || (pt ? 'Sem contato' : 'No contact')
}

function getCustomerName(deal: Deal, pt: boolean) {
  if (!deal.lead) return pt ? 'Sem cliente' : 'No customer'
  return [deal.lead.firstName, deal.lead.lastName].filter(Boolean).join(' ') || (pt ? 'Cliente sem nome' : 'Unnamed customer')
}

function getVehicleName(deal: Deal, pt: boolean) {
  if (!deal.vehicle) return pt ? 'Sem veículo' : 'No vehicle'
  return [deal.vehicle.year, deal.vehicle.make, deal.vehicle.model].filter(Boolean).join(' ') || (pt ? 'Veículo' : 'Vehicle')
}

function getDealWarnings(deal: Deal) {
  const warnings: string[] = []
  const total = deal.totalPrice || deal.vehiclePrice || 0
  const downPayment = deal.downPayment || 0
  const amountFinanced = deal.financingAmount || 0
  const apr = deal.apr || 0

  // Loan risk flags only apply to financed deals; a cash buyer pays the whole amount.
  if (!isCashDeal(deal)) {
    if (total > 0 && downPayment / total < 0.05) warnings.push('Low down payment')
    if (total > 0 && amountFinanced / total > 0.9) warnings.push('High loan-to-value')
    if (apr >= 12) warnings.push('High APR')
  }
  if ((deal.profit || 0) < 0) warnings.push('Negative gross')

  return warnings
}

/** Tone for free-form workflow states (applications, decisions, checks, packages, funding). */
function stateTone(value: string | null | undefined): DeskTone {
  const state = (value || '').toLowerCase()
  if (['approved', 'accepted', 'completed', 'complete', 'signed', 'funded', 'clear-to-fund', 'ready', 'delivered'].includes(state)) return 'ok'
  if (['declined', 'rejected', 'failed', 'expired', 'cancelled', 'void', 'denied', 'exception'].includes(state)) return 'bad'
  if (['conditional', 'changes-requested', 'manual-review', 'requested', 'pending', 'presented', 'quoted', 'preparing', 'sent', 'viewed', 'queued', 'submitted', 'under-review', 'open'].includes(state)) return 'warn'
  return 'idle'
}

function normalizeDeals(deals: Deal[] | undefined) {
  return (deals || []).map(deal => ({ ...deal, financeEvidence: readDeskFinanceEvidence(deal.financeEvidence) }))
}

function stepFor(deal: Deal, code: FinanceStepCode) {
  return deal.financeEvidence?.steps.find(step => step.code === code) ?? null
}

function nextStepFor(deal: Deal) {
  const code = deal.financeEvidence?.nextStep
  return code ? stepFor(deal, code) : null
}

function Empty({ label, onReset, resetLabel = 'Reset filters' }: { label: string; onReset?: () => void; resetLabel?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
      <p>{label}</p>
      {onReset && (
        <Track>
          <Pill size="sm" onClick={onReset}>{resetLabel}</Pill>
        </Track>
      )}
    </div>
  )
}

function Ledger({ children, empty }: { children: ReactNode[]; empty: string }) {
  if (children.length === 0) return <p className="py-3 text-sm text-muted-foreground">{empty}</p>
  return <ul className="divide-y text-sm">{children}</ul>
}

export function FinanceDeskPageClient({
  initialWorkspace,
  initialError,
  timeZone,
}: {
  initialWorkspace: FinanceWorkspace | null
  initialError: string | null
  timeZone: string
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const text = (en: string, br: string) => pt ? br : en
  const [deals, setDeals] = useState<Deal[]>(normalizeDeals(initialWorkspace?.deals))
  const [applications, setApplications] = useState<FinanceApplication[]>(initialWorkspace?.applications || [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [filter, setFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [sortOrder, setSortOrder] = useState('recent')
  const [products, setProducts] = useState<FinanceProduct[]>(initialWorkspace?.products || [])
  const [productCancellations, setProductCancellations] = useState<ProductCancellation[]>(initialWorkspace?.productCancellations || [])
  const [menus, setMenus] = useState<FinanceMenu[]>(initialWorkspace?.menus || [])
  const [complianceChecks, setComplianceChecks] = useState<ComplianceCheck[]>(initialWorkspace?.complianceChecks || [])
  const [contractPackages, setContractPackages] = useState<ContractPackage[]>(initialWorkspace?.contractPackages || [])
  const [fundingCases, setFundingCases] = useState<FundingCase[]>(initialWorkspace?.fundingCases || [])
  const [task, setTask] = useState<FinanceTask | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [menuRequest, setMenuRequest] = useState<MenuRequest | null>(null)

  const loadDeals = async () => {
    setLoading(true)
    setError(null)

    const response = await getFinanceWorkspace()

    if (response.success && response.data) {
      setDeals(normalizeDeals(response.data.financeWorkspace.deals))
      setApplications(response.data.financeWorkspace.applications || [])
      setProducts(response.data.financeWorkspace.products || [])
      setProductCancellations(response.data.financeWorkspace.productCancellations || [])
      setMenus(response.data.financeWorkspace.menus || [])
      setComplianceChecks(response.data.financeWorkspace.complianceChecks || [])
      setContractPackages(response.data.financeWorkspace.contractPackages || [])
      setFundingCases(response.data.financeWorkspace.fundingCases || [])
    } else {
      setError(response.error || (pt ? 'Não foi possível carregar o financeiro.' : 'Unable to load finance.'))
    }

    setLoading(false)
  }

  const openFinanceTask = (taskData: Omit<FinanceTask, 'idempotencyKey'>) => {
    setTaskError(null)
    setNotice(null)
    setTask({ ...taskData, idempotencyKey: `finance-operator:${crypto.randomUUID()}` })
  }

  const recordApprovalAndStatus = (deal: Deal, decision: 'approved' | 'rejected' | 'changes-requested', nextStatus: string) => openFinanceTask({
    kind: 'deal-approval', deal, decision, nextStatus,
    fields: { notes: '' },
  })

  const updateDealStatus = async (deal: Deal, status: string) => {
    setUpdatingId(deal.id)

    const response = await transitionDeal({
      id: deal.id,
      toStatus: status,
      idempotencyKey: `deal-transition:${deal.id}:${status}:${deal.worksheetVersion}:${deal.updatedAt}`,
    })

    setNotice(response.success ? text('Deal status updated.', 'Situação da venda atualizada.') : `${text('Unable to update deal', 'Não foi possível atualizar a venda')}: ${response.error}`)

    await loadDeals()
    setUpdatingId(null)
  }

  const startFinanceFollowUp = async (lead: FinanceLead) => {
    const openTask = lead.tasks?.find(task => !task.completed)
    if (openTask) {
      setNotice(text('This request already has an open follow-up task.', 'Esta solicitação já tem uma tarefa de acompanhamento em aberto.'))
      return
    }

    setUpdatingId(lead.id)
    const response = await openFinanceFollowUp({
      leadId: lead.id,
      reason: text('Review the finance request and decide the next step.', 'Analisar a solicitação de financiamento e definir a próxima etapa.'),
      idempotencyKey: `finance-follow-up:${lead.id}`,
    })

    setNotice(response.success ? text('Follow-up task created.', 'Tarefa de acompanhamento criada.') : `${text('Unable to create follow-up task', 'Não foi possível criar a tarefa de acompanhamento')}: ${response.error}`)
    await loadDeals()
    setUpdatingId(null)
  }

  const queueApplication = async (application: FinanceApplication) => {
    setUpdatingId(application.id)
    const response = await queueFinancingApplication({
      applicationId: application.id,
      providerKey: 'operator-recorded',
      idempotencyKey: `lender-queue:${application.id}:${crypto.randomUUID()}`,
    })
    setNotice(response.success ? text('Application queued for lender review.', 'Proposta enviada para análise da financeira.') : `${text('Unable to queue for lender review', 'Não foi possível enviar para análise da financeira')}: ${response.error}`)
    await loadDeals()
    setUpdatingId(null)
  }

  const recordApplicationDecision = (application: FinanceApplication) => {
    const submission = application.submissions[0]
    if (!submission) { setNotice(text('Queue this application for lender review before recording a decision.', 'Envie esta proposta para análise da financeira antes de registrar uma decisão.')); return }
    openFinanceTask({
      kind: 'lender-decision', application, submission,
      fields: { decision: '', externalReference: '', reasonCodes: '', approvedAmount: '', apr: '', termMonths: '', monthlyPayment: '' },
    })
  }

  const requiredChecks = (deal: Deal) => deal.financeEvidence?.structureType === 'cash' ? ['identity', 'ofac', 'privacy'] : ['identity', 'ofac', 'red-flag', 'privacy']

  const recordCompliance = (deal: Deal, checkType?: string) => openFinanceTask({ kind: 'compliance', deal, fields: { checkType: checkType || requiredChecks(deal)[0], status: 'completed', evidenceReference: '' } })

  const advanceContract = async (deal: Deal) => {
    const current = contractPackages.find(item => item.deal?.id === deal.id)
    if (current?.status === 'preparing') return openFinanceTask({ kind: 'contract-ready', deal, fields: { confirmed: '' } })
    const restart = !current || ['declined', 'void'].includes(current.status)
    if (!restart && current.status !== 'ready') return openFinanceTask({ kind: 'contract-provider', deal, fields: { providerStatus: 'signed', envelopeReference: '', evidenceReference: '' } })
    const action = !restart && current.status === 'ready' ? 'request-handoff' : 'prepare'
    const requiredDocuments = ['buyers-order', 'retail-installment-contract', 'privacy-disclosure', 'product-menu']
    setUpdatingId(deal.id)
    const response = await manageFinanceContractPackage({
      dealId: deal.id,
      expectedUpdatedAt: deal.updatedAt,
      action,
      providerKey: 'operator-recorded',
      ...(action === 'prepare' ? { requiredDocuments, documentChecklist: [] } : {}),
      idempotencyKey: `finance-contract:${deal.id}:${action}:${crypto.randomUUID()}`,
    })
    setNotice(response.success ? (action === 'prepare' ? text('Contract package prepared.', 'Pacote de contrato preparado.') : text('Contract handoff requested.', 'Envio do pacote de contrato solicitado.')) : `${text('Unable to update contract package', 'Não foi possível atualizar o pacote de contrato')}: ${response.error}`)
    await loadDeals(); setUpdatingId(null)
  }

  const updateFunding = (deal: Deal, status = 'funded') => openFinanceTask({ kind: 'funding', deal, fields: { status, fundingReference: '', exceptionNotes: '', attestChecklist: '' } })

  const recordPayment = (deal: Deal) => {
    const remaining = deal.financeEvidence?.payment?.remainingCents
    openFinanceTask({ kind: 'payment', deal, fields: { amount: remaining != null && remaining >= 0 ? centsToDollarInput(remaining, locale) : '', paymentMethod: '', receiptReference: '', attestPayment: '' } })
  }

  const recordDeposit = (deal: Deal) => openFinanceTask({ kind: 'deposit', deal, fields: { amount: '', paymentMethod: '', receiptReference: '' } })

  const openPrerequisiteReview = (deal: Deal) => openFinanceTask({
    kind: 'prerequisite-review',
    deal,
    fields: { reviewReference: '', policyReference: '', policyVersion: '', reviewerAuthorityReference: '' },
  })

  /** Runs the action for one server step; the step list and the highlighted next action both use it. */
  const runStep = (deal: Deal, code: FinanceStepCode) => {
    if (code === 'approve') return recordApprovalAndStatus(deal, 'approved', 'approved')
    if (code === 'quotes' || code === 'present-menu' || code === 'decide-menu') return setMenuRequest({ kind: code, nonce: Date.now() })
    if (code.startsWith('check:')) return recordCompliance(deal, code.slice('check:'.length))
    if (code === 'contract') {
      if (deal.financeEvidence?.structureType === 'cash') return openFinanceTask({ kind: 'buyers-order', deal, fields: { reference: '' } })
      return advanceContract(deal)
    }
    if (code === 'review') return openPrerequisiteReview(deal)
    if (code === 'funding') return updateFunding(deal)
    if (code === 'payment') return recordPayment(deal)
    if (code === 'mark-financed') return updateDealStatus(deal, 'financed')
  }

  const taskFields: OperatorActionField[] = !task ? [] : task.kind === 'deal-approval' ? [
    { name: 'notes', label: pt ? 'Observações da aprovação (opcional)' : 'Approval notes (optional)', type: 'textarea', required: false, maxLength: 1000 },
  ] : task.kind === 'lender-decision' ? [
    { name: 'decision', label: pt ? 'Decisão da financeira' : 'Lender decision', type: 'select', options: ['approved', 'conditional', 'declined', 'expired', 'cancelled'].map(value => ({ value, label: pt ? ({ approved: 'Aprovada', conditional: 'Condicional', declined: 'Recusada', expired: 'Expirada', cancelled: 'Cancelada' } as Record<string, string>)[value] : decisionLabels[value] })) },
    { name: 'externalReference', label: pt ? 'Protocolo da financeira' : 'Lender reference', maxLength: 200 },
    ...(task.fields.decision === 'declined' ? [{ name: 'reasonCodes', label: pt ? 'Códigos do motivo (separados por vírgula)' : 'Decline reason codes (comma separated)', required: true }] : []),
    ...(['approved', 'conditional'].includes(task.fields.decision || '') ? [
      { name: 'approvedAmount', label: pt ? 'Valor aprovado (BRL)' : 'Approved amount (USD)', type: 'number' as const, min: 0.01, step: 0.01 },
      { name: 'apr', label: pt ? 'Taxa anual aprovada (%)' : 'Approved APR (%)', type: 'number' as const, min: 0, max: 100, step: 0.01 },
      { name: 'termMonths', label: pt ? 'Prazo aprovado (meses)' : 'Approved term (months)', type: 'number' as const, min: 1, max: 120, step: 1 },
      { name: 'monthlyPayment', label: pt ? 'Parcela mensal aprovada (BRL)' : 'Approved monthly payment (USD)', type: 'number' as const, min: 0, step: 0.01 },
    ] : []),
  ] : task.kind === 'compliance' ? [
    { name: 'checkType', label: pt ? 'Tipo de verificação' : 'Check type', type: 'select', options: (task.deal ? requiredChecks(task.deal) : ['identity', 'ofac', 'red-flag', 'privacy']).map(value => ({ value, label: checkLabels[value] || value })) },
    { name: 'status', label: pt ? 'Situação da verificação' : 'Check status', type: 'select', options: ['requested', 'completed', 'failed', 'manual-review'].map(value => ({ value, label: pt ? ({ requested: 'Solicitada', completed: 'Concluída', failed: 'Falhou', 'manual-review': 'Revisão manual' } as Record<string, string>)[value] : checkStatusLabels[value] })) },
    ...(task.fields.status === 'completed' ? [{ name: 'evidenceReference', label: pt ? 'Protocolo da verificação' : 'Check reference', maxLength: 200 }] : []),
  ] : task.kind === 'contract-ready' ? [
    { name: 'confirmed', label: pt ? 'Revisei todos os documentos obrigatórios' : 'I reviewed each required document', type: 'checkbox' },
  ] : task.kind === 'contract-provider' ? [
    { name: 'providerStatus', label: pt ? 'Situação do contrato' : 'Contract status', type: 'select', options: ['sent', 'viewed', 'signed', 'declined', 'void'].map(value => ({ value, label: pt ? ({ sent: 'Enviado', viewed: 'Visualizado', signed: 'Assinado', declined: 'Recusado', void: 'Anulado' } as Record<string, string>)[value] : contractStatusLabels[value] })) },
    { name: 'envelopeReference', label: pt ? 'Protocolo do envelope' : 'Envelope reference', maxLength: 200 }, { name: 'evidenceReference', label: pt ? 'Protocolo do contrato' : 'Contract reference', maxLength: 200 },
  ] : task.kind === 'buyers-order' ? [
    { name: 'reference', label: pt ? 'Protocolo do pedido de compra assinado' : 'Signed buyer\'s order reference', maxLength: 200 },
  ] : task.kind === 'prerequisite-review' ? [
    { name: 'reviewReference', label: pt ? 'Protocolo da análise' : 'Review reference', maxLength: 200 },
    { name: 'policyReference', label: pt ? 'Protocolo da política' : 'Policy reference', maxLength: 200 },
    { name: 'policyVersion', label: pt ? 'Versão da política' : 'Policy version', maxLength: 200 },
    { name: 'reviewerAuthorityReference', label: pt ? 'Protocolo de aprovação do responsável' : 'Reviewer approval reference', maxLength: 200 },
  ] : task.kind === 'funding' ? [
    { name: 'status', label: pt ? 'Situação da liberação' : 'Funding state', type: 'select', options: ['pending', 'exception', 'clear-to-fund', 'funded', 'cancelled'].map(value => ({ value, label: pt ? financeLabel(locale, fundingLabels[value]) : fundingLabels[value] })) },
    ...(['clear-to-fund', 'funded'].includes(task.fields.status || '') ? [{ name: 'attestChecklist', label: pt ? 'Revisei o contrato assinado, as exigências, a aprovação da financeira e o seguro' : 'I reviewed the signed contract, stipulations, lender approval, and insurance', type: 'checkbox' as const }] : []),
    ...(task.fields.status === 'funded' ? [{ name: 'fundingReference', label: `${pt ? 'Protocolo da liberação' : 'Funding reference'} · ${pt ? 'resumo' : 'worksheet'} ${task.deal?.worksheetVersion}`, maxLength: 200 }] : []),
    ...(task.fields.status === 'exception' ? [{ name: 'exceptionNotes', label: pt ? 'Detalhes da pendência de liberação' : 'Funding exception details', type: 'textarea' as const, maxLength: 1000 }] : []),
  ] : task.kind === 'payment' ? [
    { name: 'amount', label: pt ? 'Saldo recebido (R$)' : 'Balance received ($)', maxLength: 20, description: task.deal?.financeEvidence?.payment ? `${pt ? 'Saldo devido' : 'Balance due'} ${formatCurrencyCents(task.deal.financeEvidence.payment.remainingCents, locale)}` : undefined },
    ...(task.fields.amount && parseDollarsSafe(task.fields.amount, locale) === 0 ? [] : [{ name: 'paymentMethod', label: pt ? 'Forma de pagamento' : 'Payment method', type: 'select' as const, options: paymentMethodOptions }]),
    { name: 'receiptReference', label: pt ? 'Protocolo do comprovante' : 'Receipt reference', maxLength: 200 },
    { name: 'attestPayment', label: pt ? 'Quitado' : 'Paid in full', type: 'checkbox' as const, description: pt ? 'O saldo foi recebido e a negociação está quitada' : 'The balance is received and the deal is paid in full' },
  ] : task.kind === 'deposit' ? [
    { name: 'amount', label: pt ? 'Valor recebido (R$)' : 'Amount received ($)', maxLength: 20, description: task.deal?.financeEvidence?.payment ? `${pt ? 'Até' : 'Up to'} ${formatCurrencyCents(task.deal.financeEvidence.payment.remainingCents, locale)}` : undefined },
    { name: 'paymentMethod', label: 'Payment method', type: 'select' as const, options: paymentMethodOptions },
    { name: 'receiptReference', label: pt ? 'Protocolo do comprovante' : 'Receipt reference', maxLength: 200 },
  ] : []
  const taskTitles: Record<string, string> = {
    'deal-approval': task?.decision === 'approved' ? 'Approve deal' : 'Review deal',
    'lender-decision': 'Record lender decision',
    'buyers-order': 'Record signed buyer\'s order',
    payment: 'Record payment',
    deposit: 'Record deposit',
    compliance: 'Record compliance check',
    'contract-ready': 'Mark contract package ready',
    'contract-provider': 'Record contract status',
    'prerequisite-review': 'Review funding prerequisites',
    funding: 'Update funding case',
  }
  const taskTitlesPt: Record<string, string> = {
    'deal-approval': task?.decision === 'approved' ? 'Aprovar negociação' : 'Revisar negociação',
    'lender-decision': 'Registrar decisão da financeira',
    'buyers-order': 'Registrar pedido de compra assinado',
    payment: 'Registrar pagamento', deposit: 'Registrar entrada', compliance: 'Registrar verificação de conformidade',
    'contract-ready': 'Marcar pacote de contrato como pronto', 'contract-provider': 'Registrar situação do contrato',
    'prerequisite-review': 'Revisar pré-requisitos para liberação', funding: 'Atualizar processo de liberação',
  }
  const taskTitle = (task && (pt ? taskTitlesPt[task.kind] : taskTitles[task.kind])) || (pt ? 'Tarefa financeira' : 'Finance task')

  const submitFinanceTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!task) return
    const value = (name: string) => task.fields[name]?.trim() || ''
    // Accept the active locale's number separators and store the resulting cents.
    const centsFromDollars = (name: string, label: string) => parseDollarsToCents(value(name), pt ? ({ 'Approved amount': 'Valor aprovado', 'Monthly payment': 'Parcela mensal', 'Amount received': 'Valor recebido' } as Record<string, string>)[label] || label : label, locale)
    const { deal, application, submission } = task
    setTaskError(null)
    setUpdatingId(deal?.id || application?.id || 'finance-task')
    try {
      let response: { success: boolean; error?: string } | undefined
      if (task.kind === 'deal-approval' && deal) {
        if (!task.nextStatus) throw new Error(pt ? 'Selecione a próxima situação da negociação.' : 'Choose the next deal status.')
        response = await transitionDeal({ id: deal.id, toStatus: task.nextStatus, notes: value('notes'), idempotencyKey: task.idempotencyKey })
      } else if (task.kind === 'lender-decision' && application && submission) {
        const decision = value('decision')
        if (!['approved', 'conditional', 'declined', 'expired', 'cancelled'].includes(decision)) throw new Error(pt ? 'Selecione a decisão da financeira.' : 'Select a lender decision.')
        const reasonCodes = value('reasonCodes').split(',').map(code => code.trim()).filter(Boolean)
        if (decision === 'declined' && !reasonCodes.length) throw new Error(pt ? 'Uma decisão de recusa exige ao menos um código de motivo.' : 'A declined decision requires at least one reason code.')
        const hasTerms = ['approved', 'conditional'].includes(decision)
        const approvedAmountCents = hasTerms ? centsFromDollars('approvedAmount', 'Approved amount') : null
        const apr = hasTerms ? Number(pt ? value('apr').replace(',', '.') : value('apr')) : null
        const termMonths = hasTerms ? Number(value('termMonths')) : null
        const monthlyPaymentCents = hasTerms ? centsFromDollars('monthlyPayment', 'Monthly payment') : null
        if (hasTerms && (approvedAmountCents! <= 0 || apr == null || !Number.isFinite(apr) || apr < 0 || apr > 100 || !Number.isInteger(termMonths) || termMonths! < 1 || termMonths! > 120)) throw new Error(pt ? 'Informe um valor aprovado, uma taxa anual, um prazo em meses inteiros e uma parcela mensal válidos.' : 'Enter valid approved amount, APR, whole-month term, and monthly payment.')
        response = await recordLenderDecision({
          applicationId: application.id,
          submissionId: submission.id,
          providerKey: submission.providerKey,
          idempotencyKey: task.idempotencyKey,
          externalReference: value('externalReference'),
          decision,
          approvedAmountCents,
          aprBasisPoints: hasTerms ? Math.round(apr! * 100) : null,
          termMonths,
          monthlyPaymentCents,
          reasonCodes,
        })
      } else if (task.kind === 'compliance' && deal) {
        const status = value('status')
        if (status === 'completed' && !value('evidenceReference')) throw new Error(pt ? 'Verificações concluídas exigem um protocolo.' : 'Completed checks require a check reference.')
        response = await recordFinanceComplianceCheck({
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt,
          checkType: value('checkType'),
          status,
          providerKey: 'operator-recorded',
          resultCode: status === 'completed' ? 'operator-reviewed' : null,
          evidenceReference: value('evidenceReference') || undefined,
          idempotencyKey: task.idempotencyKey,
        })
      } else if (task.kind === 'contract-ready' && deal) {
        if (value('confirmed') !== 'yes') throw new Error(pt ? 'Confirme que os documentos obrigatórios foram recebidos e revisados.' : 'Confirm the required documents were received and reviewed.')
        const requiredDocuments = ['buyers-order', 'retail-installment-contract', 'privacy-disclosure', 'product-menu']
        response = await manageFinanceContractPackage({
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt,
          action: 'mark-ready',
          providerKey: 'operator-recorded',
          requiredDocuments,
          documentChecklist: requiredDocuments.map(code => ({ code, status: 'complete' })),
          idempotencyKey: task.idempotencyKey,
        })
      } else if (task.kind === 'contract-provider' && deal) {
        response = await manageFinanceContractPackage({
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt,
          action: 'record-provider-status',
          providerKey: 'operator-recorded',
          providerStatus: value('providerStatus'),
          envelopeReference: value('envelopeReference'),
          evidenceReference: value('evidenceReference'),
          evidenceSource: 'operator-recorded',
          idempotencyKey: task.idempotencyKey,
        })
      } else if (task.kind === 'buyers-order' && deal) {
        const reference = value('reference')
        if (!reference) throw new Error(pt ? 'Informe o protocolo do pedido de compra assinado.' : 'Enter the signed buyer\'s order reference.')
        // A cash sale's contract is the signed buyer's order: one record, no lender handoff.
        response = await manageFinanceContractPackage({
          dealId: deal.id,
          expectedUpdatedAt: deal.updatedAt,
          action: 'record-provider-status',
          providerKey: 'operator-recorded',
          requiredDocuments: ['buyers-order'],
          documentChecklist: [{ code: 'buyers-order', status: 'complete' }],
          providerStatus: 'signed',
          envelopeReference: reference,
          evidenceReference: reference,
          evidenceSource: 'operator-recorded',
          idempotencyKey: task.idempotencyKey,
        })
      } else if (task.kind === 'deposit' && deal) {
        const amount = centsFromDollars('amount', 'Amount received')
        const remaining = deal.financeEvidence?.payment?.remainingCents
        if (amount <= 0) throw new Error(pt ? 'Informe um valor maior que R$ 0,00.' : 'Enter an amount greater than $0.')
        if (remaining != null && amount > remaining) throw new Error(pt ? `O depósito não pode exceder o saldo de ${formatCurrencyCents(remaining, locale)}.` : `The deposit can't be more than the ${formatCurrencyCents(remaining, locale)} still due.`)
        if (!value('paymentMethod')) throw new Error(pt ? 'Selecione a forma de pagamento.' : 'Choose the payment method.')
        if (!value('receiptReference')) throw new Error(pt ? 'Informe o protocolo do comprovante.' : 'Enter the receipt reference.')
        response = await recordCashDealDeposit({
          dealId: deal.id,
          amountCents: amount,
          paymentMethod: value('paymentMethod'),
          receiptReference: value('receiptReference'),
          idempotencyKey: task.idempotencyKey,
        })
      } else if (task.kind === 'payment' && deal) {
        const amount = centsFromDollars('amount', 'Amount received')
        if (amount > 0 && !value('paymentMethod')) throw new Error(pt ? 'Selecione a forma de pagamento.' : 'Choose the payment method.')
        if (!value('receiptReference')) throw new Error(pt ? 'Informe o protocolo do comprovante.' : 'Enter the receipt reference.')
        if (value('attestPayment') !== 'yes') throw new Error(pt ? 'Confirme que a negociação está quitada.' : 'Confirm the deal is paid in full.')
        response = await manageFinanceFundingCase({
          dealId: deal.id,
          worksheetVersion: deal.worksheetVersion,
          expectedUpdatedAt: deal.updatedAt,
          expectedFundingUpdatedAt: deal.financeEvidence?.fundingUpdatedAt ?? null,
          status: 'funded',
          checklist: [{ code: 'payment-received', status: 'complete' }],
          exceptions: [],
          fundingReference: value('receiptReference'),
          paymentAmountCents: amount,
          ...(amount > 0 ? { paymentMethod: value('paymentMethod') } : {}),
          idempotencyKey: task.idempotencyKey,
        })
      } else if (task.kind === 'prerequisite-review' && deal) {
        const digest = deal.financeEvidence?.prerequisites?.digest
        if (!digest) throw new Error(stepFor(deal, 'review')?.blockedReason || (pt ? 'Registre primeiro a decisão do menu, as verificações e o contrato assinado.' : 'Record the menu decision, checks and signed contract first.'))
        response = await reviewFinancePrerequisites({
          dealId: deal.id,
          worksheetVersion: deal.worksheetVersion,
          expectedUpdatedAt: deal.updatedAt,
          expectedPrerequisiteDigest: digest,
          providerKey: 'operator-recorded',
          reviewReference: value('reviewReference'),
          policyReference: value('policyReference'),
          policyVersion: value('policyVersion'),
          reviewerAuthorityReference: value('reviewerAuthorityReference'),
          idempotencyKey: task.idempotencyKey,
        })
      } else if (task.kind === 'funding' && deal) {
        const status = value('status')
        if (status === 'funded' && !value('fundingReference')) throw new Error(pt ? 'Informe o protocolo de liberação para marcar a negociação como liberada.' : 'A funding reference is required to mark the deal funded.')
        if (status === 'exception' && !value('exceptionNotes')) throw new Error(pt ? 'Descreva a pendência de liberação.' : 'Describe the funding exception.')
        const complete = ['clear-to-fund', 'funded'].includes(status)
        if (complete && !deal.financeEvidence?.prerequisites?.current) throw new Error(pt ? 'Revise os pré-requisitos primeiro.' : 'Review prerequisites first.')
        if (complete && value('attestChecklist') !== 'yes') throw new Error(pt ? 'Confirme o contrato assinado, as exigências, a aprovação da financeira e o seguro antes de liberar o crédito.' : 'Confirm the signed contract, stipulations, lender approval, and insurance before clearing funding.')
        response = await manageFinanceFundingCase({
          dealId: deal.id,
          worksheetVersion: deal.worksheetVersion,
          expectedUpdatedAt: deal.updatedAt,
          expectedFundingUpdatedAt: deal.financeEvidence?.fundingUpdatedAt ?? null,
          status,
          checklist: ['signed-contract', 'stipulations', 'lender-approval', 'insurance'].map(code => ({ code, status: complete ? 'complete' : 'open' })),
          exceptions: value('exceptionNotes') ? [{ code: 'operator-exception', status: 'open', notes: value('exceptionNotes') }] : [],
          fundingReference: value('fundingReference') || undefined,
          idempotencyKey: task.idempotencyKey,
        })
      }
      if (response && !response.success) { setTaskError(pt ? `${financeLabel(locale, response.error || 'Unable to save')}. Os dados digitados foram preservados.` : response.error || 'Unable to save. Your entries are preserved.'); return }
      if (!response) throw new Error(pt ? 'Ocorreu um erro. Feche e reabra esta tarefa.' : 'Something went wrong. Close and reopen this task.')
      setTask(null)
      setNotice(pt ? (task.kind === 'lender-decision' ? 'Decisão da financeira registrada.' : task.kind === 'payment' ? 'Pagamento registrado.' : task.kind === 'deposit' ? 'Entrada registrada.' : task.kind.startsWith('contract') || task.kind === 'buyers-order' ? 'Contrato atualizado.' : 'Salvo.') : task.kind === 'lender-decision' ? 'Lender decision recorded.' : task.kind === 'payment' ? 'Payment recorded.' : task.kind === 'deposit' ? 'Deposit recorded.' : task.kind.startsWith('contract') || task.kind === 'buyers-order' ? 'Contract updated.' : 'Saved.')
      await loadDeals()
    } catch (error) {
      setTaskError(pt ? (error instanceof Error ? financeLabel(locale, error.message) : 'Não foi possível salvar.') : error instanceof Error ? error.message : 'Unable to save.')
    } finally {
      setUpdatingId(null)
    }
  }

  const filteredDeals = useMemo(() => {
    const queued = filter === 'active' ? deals.filter(deal => ['submitted', 'approved', 'financed'].includes(deal.status || ''))
      : filter === 'all' ? deals
        : deals.filter(deal => deal.status === filter)
    const term = search.trim().toLowerCase()
    return queued.filter(deal => !term || `${getCustomerName(deal, pt)} ${getVehicleName(deal, pt)} ${deal.vehicle?.stockNumber || ''} ${deal.vehicle?.vin || ''}`.toLowerCase().includes(term)).sort((a, b) => {
      if (sortOrder === 'amount-desc') return (b.financingAmount || 0) - (a.financingAmount || 0)
      if (sortOrder === 'oldest') return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
      return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
    })
  }, [deals, filter, search, sortOrder, pt])

  const openFinanceRequests = applications.filter(application => {
    if (['declined', 'expired', 'cancelled'].includes(application.status)) return false
    const term = search.trim().toLowerCase()
    return !term || `${application.applicantName || ''} ${application.reference || ''} ${application.vehicle?.stockNumber || ''} ${application.lead?.firstName || ''} ${application.lead?.lastName || ''}`.toLowerCase().includes(term)
  })



  const searchTerm = search.trim()
  const resetFilters = () => {
    setSearch('')
    setFilter('active')
  }

  const stageCounts = useMemo(() => {
    const count = (status: string) => deals.filter(deal => deal.status === status).length
    return {
      active: deals.filter(deal => ['submitted', 'approved', 'financed'].includes(deal.status || '')).length,
      submitted: count('submitted'),
      approved: count('approved'),
      financed: count('financed'),
      all: deals.length,
    } as Record<string, number>
  }, [deals])

  // The deal panel opens only once a deal is chosen, from the queue or the table.
  const selectedDeal = selectedId ? deals.find(deal => deal.id === selectedId) ?? null : null
  const detailRef = useRef<HTMLDivElement>(null)
  const [scrollToDetail, setScrollToDetail] = useState(0)
  const selectDeal = (id: string) => {
    setSelectedId(id)
    setScrollToDetail(value => value + 1)
  }
  useEffect(() => {
    if (!scrollToDetail || !detailRef.current) return
    detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    detailRef.current.focus({ preventScroll: true })
  }, [scrollToDetail])

  // F&I queue: approvals waiting, deals in F&I, contracts in transit or unfunded, and applications waiting on a lender.
  const queue = useMemo<QueueItem[]>(() => {
    const now = Date.now()
    const items: QueueItem[] = []
    for (const deal of deals) {
      const status = deal.status || 'pencil'
      if (!['submitted', 'approved', 'financed'].includes(status)) continue
      const evidence = deal.financeEvidence
      const next = nextStepFor(deal)
      const cash = isCashDeal(deal)
      const contract = contractPackages.find(item => item.deal?.id === deal.id)
      const fundingCase = fundingCases.find(item => item.deal?.id === deal.id)
      const openExceptions = (fundingCase?.exceptions || []).filter(item => item.status === 'open').length
      const funded = Boolean(evidence?.fundingCurrent)
      if (status === 'financed' && funded && (!next || next.code === 'delivery')) continue
      const inTransit = !cash && !funded && contract != null && ['sent', 'viewed', 'signed'].includes(contract.status)
      const exception = fundingCase?.status === 'exception' || openExceptions > 0
      const stage = status === 'submitted' ? 'Waiting approval'
        : exception ? 'Funding exception'
          : inTransit ? (contract!.status === 'signed' ? 'Signed, unfunded' : 'Contract in transit')
            : status === 'financed' && !funded ? 'Unfunded'
              : 'In F&I'
      const tone: DeskTone = exception ? 'bad' : status === 'submitted' || inTransit || (status === 'financed' && !funded) ? 'warn' : 'info'
      const since = exception || inTransit ? fundingCase?.updatedAt || deal.updatedAt || deal.createdAt : deal.updatedAt || deal.createdAt
      const amount = cash
        ? evidence?.payment ? formatCurrencyCents(Math.max(0, evidence.payment.remainingCents), locale) : formatCurrency(deal.totalPrice, locale)
        : formatCurrency(deal.financingAmount, locale)
      items.push({
        key: `deal:${deal.id}`,
        who: getCustomerName(deal, pt),
        vehicle: getVehicleName(deal, pt),
        stock: deal.vehicle?.stockNumber || null,
        stage: financeLabel(locale, stage),
        tone,
        waitingOn: status === 'submitted' ? (pt ? 'Aprovação do gerente' : 'Manager approval') : next ? (next.available ? financeLabel(locale, next.label) : `${financeLabel(locale, next.label)}: ${pt ? 'bloqueado' : (next.blockedReason || 'blocked')}`) : contract ? label(contractStatusLabels, contract.status, locale) : '-',
        attention: exception,
        attentionWord: exception ? (pt ? `${openExceptions || 1} ${openExceptions === 1 ? 'pendência' : 'pendências'}` : `${openExceptions || 1} exception${openExceptions > 1 ? 's' : ''}`) : null,
        ageDays: daysSince(since, now),
        amount,
        deal,
      })
    }
    for (const application of applications) {
      if (!['submitted', 'under-review'].includes(application.status)) continue
      const lead = application.lead
      const submission = application.submissions[0]
      const openTask = lead?.tasks?.find(task => !task.completed)
      const overdue = Boolean(openTask?.dueDate && new Date(openTask.dueDate).getTime() < now)
      const vehicle = application.vehicle || lead?.interestedVehicle
      items.push({
        key: `application:${application.id}`,
        who: application.applicantName || [lead?.firstName, lead?.lastName].filter(Boolean).join(' ') || (pt ? 'Solicitante de financiamento' : 'Finance applicant'),
        vehicle: vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || (pt ? 'Nenhum veículo selecionado' : 'No vehicle selected') : (pt ? 'Nenhum veículo selecionado' : 'No vehicle selected'),
        stock: vehicle?.stockNumber || null,
        stage: submission ? (pt ? 'Aguardando decisão' : 'Pending decision') : (pt ? 'Não enviado' : 'Not queued'),
        tone: 'warn',
        waitingOn: submission ? `${pt ? 'Decisão da financeira' : 'Lender decision'} · ${label(providerLabels, submission.providerKey, locale)}` : openTask ? openTask.title || (pt ? 'Tarefa em aberto' : 'Open task') : (pt ? 'Enviar para análise da financeira' : 'Queue for lender review'),
        attention: overdue,
        attentionWord: overdue ? (pt ? 'Tarefa atrasada' : 'Task overdue') : null,
        ageDays: daysSince(submission?.queuedAt || application.submittedAt, now),
        amount: application.requestedAmountCents != null ? formatCurrency(application.requestedAmountCents / 100, locale) : '-',
        application,
      })
    }
    // Marked items first, then oldest first.
    return items.sort((a, b) => Number(b.attention) - Number(a.attention) || (b.ageDays ?? -1) - (a.ageDays ?? -1))
  }, [deals, applications, contractPackages, fundingCases, locale])
  const activeFinanced = deals.filter(deal => ['submitted', 'approved', 'financed'].includes(deal.status || '')).reduce((sum, deal) => sum + (deal.financingAmount || 0), 0)
  const presentedMenus = menus.filter(menu => menu.status === 'presented').length
  const fundingExceptions = fundingCases.filter(item => item.status === 'exception').length

  const breadcrumbs = [
    { type: 'link' as const, label: pt ? 'Painel' : 'Dashboard', href: basePath },
    { type: 'page' as const, label: pt ? 'Plataforma' : 'Platform' },
    { type: 'page' as const, label: pt ? 'Financeiro' : 'Finance' },
  ]

  const deskStatus = financeDeskStatus({
    error: Boolean(error),
    approvalsWaiting: stageCounts.submitted,
    applicationsWaiting: applications.filter(application => ['submitted', 'under-review'].includes(application.status)).length,
  })

  const header = (
    <DeskHeader
      title={pt ? 'Financeiro' : 'Finance'}
      tone={deskStatus.tone}
      status={financeLabel(locale, deskStatus.label)}
      meta={error ? (pt ? 'Indisponível' : 'Unavailable') : pt ? `${queue.length} aguardando · ${stageCounts.active} em financiamento · ${countLabel(openFinanceRequests.length, 'proposta', 'propostas')} · ${countLabel(products.length, 'produto', 'produtos')}` : `${queue.length} waiting · ${stageCounts.active} in finance · ${countLabel(openFinanceRequests.length, 'application')} · ${countLabel(products.length, 'product')}`}
      actions={
        <>
          <Pill variant="plain" onClick={loadDeals} disabled={loading} aria-label={pt ? 'Atualizar' : 'Refresh'}>
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            {pt ? 'Atualizar' : 'Refresh'}
          </Pill>
          <Pill asChild>
            <Link href={`${basePath}/platform/finance/products`}>{pt ? 'Produtos' : 'Products'}</Link>
          </Pill>
          <Pill asChild>
            <Link href={`${basePath}/platform/finance/cancellations`}>{pt ? 'Cancelamentos' : 'Cancellations'}</Link>
          </Pill>
          <Pill asChild variant="primary">
            <Link href={`${basePath}/platform/deals/create`}>
              <Plus />
              New deal
            </Link>
          </Pill>
        </>
      }
    />
  )

  if (error) {
    return (
      <PageContainer title={pt ? 'Financeiro' : 'Finance'} header={header} breadcrumbs={breadcrumbs}>
        <div className="space-y-3 px-4 pb-24 md:px-6">
          <Notice tone="bad">
            <p className="font-medium">{pt ? 'Financeiro indisponível' : 'Finance is unavailable'}</p>
            <p className="mt-0.5 text-muted-foreground">{error}</p>
          </Notice>
          <Track>
            <Pill onClick={loadDeals}>{pt ? 'Tentar novamente' : 'Retry'}</Pill>
          </Track>
        </div>
      </PageContainer>
    )
  }

  const renderDealDetail = (deal: Deal) => {
    const warnings = getDealWarnings(deal)
    const fundingCase = fundingCases.find(item => item.deal?.id === deal.id)
    const evidence = deal.financeEvidence
    const dealHref = `${basePath}/platform/deals/${deal.id}`
    const cash = isCashDeal(deal)
    const payment = cash ? evidence?.payment ?? null : null
    const canRecordDeposit = cash && deal.status === 'approved' && payment != null && payment.remainingCents > 0
    const next = nextStepFor(deal)
    const steps = evidence?.steps || []
    const primaryNext = next && next.available && next.code !== 'delivery' ? next : null
    const approvals = visibleApprovals(deal.approvals)
    const fundingStatusOpen = ['approved', 'financed'].includes(deal.status || '') && Boolean(evidence?.prerequisites?.current)
    const hasAcceptedMenu = menus.some(item => item.deal?.id === deal.id && item.status === 'accepted')
    const dealCancellations = productCancellations.filter(item => item.deal?.id === deal.id)
    const dealChecks = complianceChecks.filter(item => item.deal?.id === deal.id)
    const contract = contractPackages.find(item => item.deal?.id === deal.id)
    const lenderApplications = deal.lead ? applications.filter(application => application.lead?.id === deal.lead?.id) : []
    const busy = updatingId === deal.id
    const status = deal.status || 'pencil'
    const openFundingExceptions = (fundingCase?.exceptions || []).filter(item => item.status === 'open').length

    return (
      <div className="min-w-0 space-y-6">
        <div className="min-w-0 space-y-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <TitleLine as="h2" tone={statusTones[status] || 'idle'} status={financeLabel(locale, statusLabels[status] || status)} className="text-lg font-semibold tracking-tight">
                {getCustomerName(deal, pt)} · {getVehicleName(deal, pt)}
              </TitleLine>
              <p className="mt-0.5 flex flex-wrap gap-x-2 pl-4 text-xs text-muted-foreground">
                <span>{financeLabel(locale, statusLabels[status] || status)}</span>
                <span>·</span>
                <Code>#{deal.vehicle?.stockNumber || '-'}</Code>
                {deal.vehicle?.vin && (<><span>·</span><Code>{deal.vehicle.vin}</Code></>)}
                <span>·</span>
                <span>{pt ? 'Proposta' : 'Worksheet'} {deal.worksheetVersion}</span>
                {deal.salesperson?.name && (<><span>·</span><span>{deal.salesperson.name}</span></>)}
                {deal.rooftop?.name && (<><span>·</span><span>{deal.rooftop.name}</span></>)}
              </p>
            </div>
            <Track className="shrink-0">
              <Pill size="sm" className="max-md:h-10" asChild>
                <Link href={dealHref}>{pt ? 'Abrir' : 'Open'}</Link>
              </Pill>
            </Track>
          </div>

          {/* One step at a time: the server's next required step is the primary action. */}
          {(primaryNext || canRecordDeposit || deal.status === 'submitted' || deal.status === 'financed' || (!cash && fundingStatusOpen) || hasAcceptedMenu) && (
          <Track aria-label={pt ? 'Ações da negociação' : 'Deal actions'}>
            {primaryNext && (
              <Pill size="sm" className="max-md:h-10" variant="primary" onClick={() => runStep(deal, primaryNext.code)} disabled={busy}>
                {primaryNext.label}
              </Pill>
            )}
            {canRecordDeposit && (
              <Pill size="sm" className="max-md:h-10" variant={primaryNext ? 'raised' : 'primary'} onClick={() => recordDeposit(deal)} disabled={busy}>
                Record deposit
              </Pill>
            )}
            {deal.status === 'submitted' && (
              <Pill size="sm" className="max-md:h-10" variant="danger" onClick={() => recordApprovalAndStatus(deal, 'rejected', 'cancelled')} disabled={busy}>
                Reject
              </Pill>
            )}
            {deal.status === 'financed' && (
              <Pill size="sm" className="max-md:h-10" variant={next?.code === 'delivery' ? 'primary' : 'raised'} asChild>
                <Link href={`${basePath}/platform/delivery`}>{pt ? 'Abrir entrega' : 'Open delivery'}</Link>
              </Pill>
            )}
            {!cash && fundingStatusOpen && (
              <Pill size="sm" className="max-md:h-10" onClick={() => updateFunding(deal, 'pending')} disabled={busy}>{pt ? 'Atualizar liberação' : 'Update funding'}</Pill>
            )}
            {hasAcceptedMenu && (
              <Pill size="sm" className="max-md:h-10" asChild>
                <Link href={`${basePath}/platform/finance/cancellations?deal=${deal.id}`}>{pt ? 'Cancelamento de produto' : 'Product cancellation'}</Link>
              </Pill>
            )}
          </Track>
          )}
          {next && !next.available && next.blockedReason && (
            <p className="pl-4 text-xs text-muted-foreground" role="status">{financeLabel(locale, next.label)}: {financeLabel(locale, next.blockedReason)}</p>
          )}
          {payment?.form8300Required && <Notice tone="warn">{FORM_8300_STATE}</Notice>}
          {warnings.length > 0 && <Notice tone="warn">{warnings.map(warning => financeLabel(locale, warning)).join(' · ')}</Notice>}
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-8 xl:grid-cols-2">
        <div className="min-w-0 space-y-6">
        {steps.length > 0 && (
          <DeskSection title={cash ? 'Cash sale steps' : 'Finance steps'}>
            <ol className="divide-y text-sm">
              {steps.map(step => {
                const isNext = step.code === next?.code
                const reasonId = `finance-step-${deal.id}-${step.code}`
                const fundingStep = step.code === 'funding' || step.code === 'payment'
                const stale = fundingStep && step.state !== 'done' && evidence?.fundingStatus === 'funded'
                const stateText = step.state === 'done'
                  ? fundingStep && evidence?.fundingReference ? `Done · ${evidence.fundingReference}` : 'Done'
                  : stale ? 'Recorded for an earlier worksheet; record again'
                    : step.available ? (isNext ? 'Next' : step.state === 'optional' ? 'Optional' : 'To do')
                      : (step.blockedReason ? financeLabel(locale, step.blockedReason) : step.state === 'optional' ? (pt ? 'Opcional' : 'Optional') : (pt ? 'Aguardando' : 'Waiting'))
                const showAction = step.state !== 'done' && step.code !== 'delivery' && (step.available || Boolean(step.blockedReason))
                return (
                  <li key={step.code} className="flex min-w-0 flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <TitleLine as="p" tone={stepTone(step, isNext)} status={step.state === 'done' ? 'Done' : isNext ? 'Next' : step.state} className={cn('font-medium', step.state === 'done' && 'text-muted-foreground')}>
                        {financeLabel(locale, step.label)}
                      </TitleLine>
                      <p id={reasonId} className="break-words pl-4 text-xs text-muted-foreground">
                        {stateText}{step.detail ? ` · ${step.detail}` : ''}
                      </p>
                    </div>
                    {showAction && (
                      <Track className="shrink-0 self-start pl-4 sm:self-auto sm:pl-0">
                        <Pill size="sm" className="max-md:h-10" disabled={busy || !step.available} aria-describedby={reasonId} onClick={() => runStep(deal, step.code)}>
                          {financeLabel(locale, step.label)}
                        </Pill>
                      </Track>
                    )}
                  </li>
                )
              })}
            </ol>
          </DeskSection>
        )}

        <DeskSection title={pt ? 'Resumo da negociação' : 'Worksheet'}>
          <Facts
            items={[
              { label: pt ? 'Contato' : 'Contact', value: contactLine(deal, pt) },
              { label: pt ? 'Modalidade' : 'Structure', value: cash ? (pt ? 'À vista' : 'Cash') : deal.structureType === 'lease' ? (pt ? 'Arrendamento' : 'Lease') : (pt ? 'Financiamento' : 'Finance') },
              { label: pt ? 'Preço do veículo' : 'Vehicle price', value: formatCurrency(deal.vehiclePrice, locale) },
              { label: pt ? 'Veículo na troca' : 'Trade-in', value: formatCurrency(deal.tradeInValue, locale) },
              cash ? null : { label: pt ? 'Entrada' : 'Down payment', value: formatCurrency(deal.downPayment, locale) },
              { label: pt ? 'Impostos' : 'Tax', value: formatCurrency(deal.taxAmount, locale) },
              { label: pt ? 'Total' : 'Total', value: formatCurrency(deal.totalPrice, locale) },
              ...(cash ? [
                payment ? { label: pt ? 'Valor devido' : 'Amount due', value: formatCurrencyCents(payment.amountDueCents, locale) } : null,
                payment ? { label: pt ? 'Saldo' : 'Balance', value: formatCurrencyCents(Math.max(0, payment.remainingCents), locale) } : null,
              ] : [
                { label: pt ? 'Valor financiado' : 'Amount financed', value: formatCurrency(deal.financingAmount, locale) },
                { label: pt ? 'Taxa anual · prazo' : 'APR · term', value: `${deal.apr || 0}% · ${deal.loanTerm || 0} ${pt ? 'meses' : 'mo'}` },
                { label: pt ? 'Parcela' : 'Payment', value: formatCurrency(deal.monthlyPayment, locale) },
              ]),
              { label: pt ? 'Lucro bruto' : 'Gross', value: formatCurrency(deal.profit, locale) },
              { label: pt ? 'Alertas' : 'Flags', value: warnings.length > 0 ? `${warnings.length}` : (pt ? 'Nenhum alerta' : 'No flags') },
            ]}
          />
        </DeskSection>

        </div>
        <div className="min-w-0 space-y-6">
        <DeskSection title={pt ? 'Financeira' : 'Lender'} count={lenderApplications.length}>
          <Ledger empty={pt ? 'Nenhuma proposta' : 'No applications'}>
            {lenderApplications.flatMap(application => [
              ...application.submissions.map(submission => (
                <li key={submission.id} className="flex min-w-0 items-start justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <TitleLine as="p" tone={stateTone(submission.status)} status={label({}, submission.status, locale)} className="font-medium">
                      {pt ? 'Enviado' : 'Submitted'} · {label(providerLabels, submission.providerKey, locale)}
                    </TitleLine>
                    <p className="truncate pl-4 text-xs text-muted-foreground">
                      {label({}, submission.status, locale)}{submission.externalReference ? ` · ${submission.externalReference}` : ''}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">{formatDate(submission.queuedAt, timeZone, locale)}</p>
                </li>
              )),
              ...application.decisions.map(decision => (
                <li key={decision.id} className="flex min-w-0 items-start justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <TitleLine as="p" tone={stateTone(decision.decision)} status={label(decisionLabels, decision.decision, locale)} className="font-medium">
                      {label(decisionLabels, decision.decision, locale)} · {label(providerLabels, decision.providerKey, locale)}
                    </TitleLine>
                    <p className="truncate pl-4 text-xs text-muted-foreground">
                      {formatDate(decision.decidedAt, timeZone, locale)}{decision.reasonCodes.length > 0 ? ` · ${decision.reasonCodes.join(', ')}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium tabular-nums">{decision.approvedAmountCents != null ? formatCurrency(decision.approvedAmountCents / 100, locale) : '-'}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {decision.aprBasisPoints != null ? `${(decision.aprBasisPoints / 100).toFixed(2)}%` : '-'} · {decision.termMonths ?? '-'} mo
                      {decision.monthlyPaymentCents != null ? ` · ${formatCurrency(decision.monthlyPaymentCents / 100, locale)}` : ''}
                    </p>
                  </div>
                </li>
              )),
            ])}
          </Ledger>
        </DeskSection>

        <DeskSection title={pt ? 'Aprovações' : 'Approvals'} count={approvals.length}>
          <Ledger empty={pt ? 'Nenhuma' : 'None'}>
            {approvals.map(approval => {
              const { by, note } = approvalSummary(approval, locale)
              return (
                <li key={approval.id} className="flex min-w-0 items-start justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <TitleLine as="p" tone={stateTone(approval.decision)} status={approval.decision || undefined} className="font-medium">
                      {by}
                    </TitleLine>
                    {note && <p className="pl-4 text-xs text-muted-foreground">{note}</p>}
                  </div>
                  <p className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDate(approval.approvalDate, timeZone, locale)}</p>
                </li>
              )
            })}
          </Ledger>
        </DeskSection>

        <DealMenuPanel
          key={deal.id}
          deal={deal}
          timeZone={timeZone}
          request={menuRequest}
          presentStep={stepFor(deal, 'present-menu')}
          decideStep={stepFor(deal, 'decide-menu')}
          onChanged={async message => { setNotice(message); await loadDeals() }}
        />

        {dealCancellations.length > 0 && (
          <DeskSection
            title={pt ? 'Cancelamentos' : 'Cancellations'}
            count={dealCancellations.length}
            actions={<Track><Pill size="sm" asChild><Link href={`${basePath}/platform/finance/cancellations?deal=${deal.id}`}>{pt ? 'Abrir' : 'Open'}</Link></Pill></Track>}
          >
            <Ledger empty={pt ? 'Nenhum' : 'None'}>
              {dealCancellations.map(cancellation => (
                <li key={cancellation.id} className="flex min-w-0 items-center justify-between gap-4 py-2">
                  <TitleLine as="p" tone={stateTone(cancellation.status)} status={cancellation.status}>
                    <Code>{cancellation.productCode}</Code>
                  </TitleLine>
                  <p className="shrink-0 text-xs text-muted-foreground">{label({}, cancellation.status, locale)}</p>
                </li>
              ))}
            </Ledger>
          </DeskSection>
        )}

        <DeskSection title={pt ? 'Conformidade' : 'Compliance'} count={dealChecks.length}>
          <Ledger empty={pt ? 'Nenhuma verificação' : 'No checks'}>
            {dealChecks.map(check => (
              <li key={check.id} className="flex min-w-0 items-center justify-between gap-4 py-2">
                <TitleLine as="p" tone={stateTone(check.status)} status={label(checkStatusLabels, check.status, locale)}>
                  {label(checkLabels, check.checkType, locale)}
                </TitleLine>
                <p className="shrink-0 text-xs text-muted-foreground">{label(checkStatusLabels, check.status, locale)}</p>
              </li>
            ))}
          </Ledger>
        </DeskSection>

        <DeskSection title={pt ? 'Contrato' : 'Contract'}>
          {contract ? (
            <div className="space-y-2">
              <TitleLine as="p" tone={stateTone(contract.status)} status={label(contractStatusLabels, contract.status, locale)} className="text-sm font-medium">
                {label(contractStatusLabels, contract.status, locale)}
              </TitleLine>
              <Ledger empty={pt ? 'Nenhum documento' : 'No documents'}>
                {(contract.documentChecklist || []).map(item => (
                  <li key={item.code} className="flex min-w-0 items-center justify-between gap-4 py-2">
                    <span className="min-w-0 break-words">{label(documentLabels, item.code, locale)}</span>
                    <TitleLine as="span" tone={stateTone(item.status)} className="shrink-0 text-xs text-muted-foreground">{pt ? ({ open: 'Em aberto', complete: 'Concluído', waived: 'Dispensado', resolved: 'Resolvido' } as Record<string, string>)[item.status] || label(itemStatusLabels, item.status, locale) : label(itemStatusLabels, item.status, locale)}</TitleLine>
                  </li>
                ))}
              </Ledger>
            </div>
          ) : (
            <p className="py-3 text-sm text-muted-foreground">{pt ? 'Nenhum pacote de contrato' : 'No contract package'}</p>
          )}
        </DeskSection>

        <DeskSection title={cash ? (pt ? 'Pagamento' : 'Payment') : (pt ? 'Liberação do financiamento' : 'Funding')}>
          <div className="space-y-3">
            <Facts
              items={[
                { label: cash ? (pt ? 'Pagamento' : 'Payment') : (pt ? 'Financiamento' : 'Funding'), value: <TitleLine as="span" tone={evidence?.fundingCurrent ? 'ok' : stateTone(evidence?.fundingStatus)}>{evidence?.fundingCurrent ? (cash ? (pt ? 'Quitado' : 'Paid in full') : (pt ? 'Liberado' : 'Funded')) : evidence?.fundingStatus ? label(fundingLabels, evidence.fundingStatus, locale) : cash && payment && payment.receivedCents > 0 ? (pt ? 'Parcialmente pago' : 'Partly paid') : (pt ? 'Não iniciado' : 'Not started')}</TitleLine> },
                evidence?.fundingStatus ? { label: pt ? 'Resumo' : 'Worksheet', value: evidence.fundingCurrent ? (pt ? 'atual' : 'current') : (pt ? 'versão anterior' : 'earlier version') } : null,
                evidence?.fundingReference ? { label: cash ? (pt ? 'Comprovante' : 'Receipt') : (pt ? 'Referência' : 'Reference'), value: evidence.fundingReference, mono: true } : null,
                payment ? { label: pt ? 'Valor devido' : 'Amount due', value: formatCurrencyCents(payment.amountDueCents, locale) } : null,
                payment ? { label: pt ? 'Recebido' : 'Received', value: formatCurrencyCents(payment.receivedCents, locale) } : null,
                payment ? { label: pt ? 'Saldo' : 'Balance', value: formatCurrencyCents(Math.max(0, payment.remainingCents), locale) } : null,
                payment && payment.cashReceivedCents > 0 ? { label: pt ? 'Valor em dinheiro recebido' : 'Cash received', value: formatCurrencyCents(payment.cashReceivedCents, locale) } : null,
                payment?.form8300Required ? { label: pt ? 'Regra fiscal dos EUA' : 'Compliance', value: <TitleLine as="span" tone="warn">{pt ? 'Pagamento em espécie acima de US$ 10.000: exige o formulário fiscal dos EUA 8300' : FORM_8300_STATE}</TitleLine> } : null,
                { label: pt ? 'Pré-requisitos' : 'Prerequisites', value: evidence?.prerequisites?.current ? (cash ? (pt ? 'Confirmados com o pagamento' : 'Confirmed with payment') : (pt ? 'Revisados' : 'Reviewed')) : (pt ? 'Ainda não' : 'Not yet') },
                fundingCase ? { label: pt ? 'Processo de liberação' : 'Funding case', value: label(fundingLabels, fundingCase.status, locale) } : null,
                fundingCase ? { label: pt ? 'Pendências em aberto' : 'Open exceptions', value: openFundingExceptions } : null,
              ]}
            />
            {payment && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{pt ? 'Pagamentos recebidos' : 'Payments received'}</p>
                <Ledger empty={pt ? 'Nenhum pagamento' : 'No payments'}>
                  {payment.payments.map(record => (
                    <li key={record.id} className="flex min-w-0 items-start justify-between gap-4 py-2">
                      <div className="min-w-0">
                        <TitleLine as="p" tone={record.status === 'captured' ? 'ok' : 'idle'} status={label({ captured: 'Received', 'partially-refunded': 'Partly refunded', refunded: 'Refunded' }, record.status, locale)} className="font-medium">
                          {paymentMethodLabel(record.method, record.providerKey, locale)}
                        </TitleLine>
                        <p className="break-words pl-4 text-xs text-muted-foreground">
                          {formatDate(record.receivedAt, timeZone, locale)}
                          {record.reference ? <> · <Code>{record.reference}</Code></> : null}
                          {record.refundedCents > 0 ? ` · ${pt ? 'Reembolsado' : 'Refunded'} ${formatCurrencyCents(record.refundedCents, locale)}` : ''}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-medium tabular-nums">{formatCurrencyCents(record.netCents, locale)}</p>
                    </li>
                  ))}
                </Ledger>
              </div>
            )}
            <div className="space-y-1 text-xs text-muted-foreground [&_summary]:cursor-pointer [&_summary]:font-medium [&_summary]:text-foreground">
              {evidence?.prerequisites?.snapshot && (
                <details>
                  <summary>{pt ? 'Detalhes dos pré-requisitos' : 'Prerequisite details'}</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 font-mono text-xs">
                    {JSON.stringify(evidence.prerequisites.snapshot, null, 2)}
                  </pre>
                </details>
              )}
              <FinanceEvidenceHistory dealId={deal.id} aggregateType="FinanceFundingCase" label={pt ? 'Histórico da liberação' : 'Funding history'} timeZone={timeZone} />
              {fundingCase?.immutableEvidence != null && (
                <details className="mt-2">
                  <summary>{pt ? 'Detalhes da liberação' : 'Funding details'}</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 font-mono text-xs">
                    {JSON.stringify(fundingCase.immutableEvidence, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </DeskSection>
        </div>
        </div>
      </div>
    )
  }

  return (
    <PageContainer title={pt ? 'Financeiro' : 'Finance'} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {notice && (
          <Notice tone={notice.startsWith('Unable') ? 'bad' : 'info'}>
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0">{notice}</p>
              <Track>
              <Pill size="sm" variant="plain" onClick={() => setNotice(null)}>{pt ? 'Dispensar' : 'Dismiss'}</Pill>
              </Track>
            </div>
          </Notice>
        )}

        <DeskSection title={pt ? 'Aguardando sua ação' : 'Needs you'} count={queue.length} id="finance-queue">
          {queue.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">{pt ? 'Nada aguardando no setor financeiro' : 'Nothing waiting in F&I'}</p>
          ) : (
            <DeskTable aria-labelledby="finance-queue">
              <thead>
                <tr>
                  <Th>{pt ? 'Cliente · veículo' : 'Customer · vehicle'}</Th>
                  <Th>{pt ? 'Etapa' : 'Stage'}</Th>
                  <Th priority={2}>{pt ? 'Aguardando' : 'Waiting on'}</Th>
                  <Th align="right">{pt ? 'Há quanto tempo' : 'Age'}</Th>
                  <Th priority={2} align="right">{pt ? 'Valor' : 'Amount'}</Th>
                  <Th align="right"><span className="sr-only">{pt ? 'Ações' : 'Actions'}</span></Th>
                </tr>
              </thead>
              <tbody>
                {queue.map(item => (
                  <Tr key={item.key} className={cn(item.deal && selectedDeal?.id === item.deal.id && 'bg-muted/60')}>
                    <Td>
                      <p className="font-medium text-foreground">{item.who}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.vehicle}
                        {item.stock && <> · <Code>#{item.stock}</Code></>}
                      </p>
                    </Td>
                    <Td><Status tone={item.tone}>{item.stage}</Status></Td>
                    <Td priority={2} className="text-muted-foreground">
                      <span className="flex min-w-0 flex-wrap items-baseline gap-1.5">
                        {item.attentionWord && <Attention>{item.attentionWord}</Attention>}
                        <span className="min-w-0 break-words">{item.waitingOn}</span>
                      </span>
                    </Td>
                    <Td align="right"><Figure size="sm" attention={item.attention}>{pt && item.ageDays === 0 ? 'Hoje' : formatAge(item.ageDays)}</Figure></Td>
                    <Td priority={2} align="right">{item.amount}</Td>
                    <Td align="right">
                      <span className="inline-flex flex-wrap justify-end gap-2">
                        {item.deal ? (
                          <Pill size="sm" className="max-md:h-10" variant={selectedDeal?.id === item.deal.id ? 'primary' : 'raised'} aria-pressed={selectedDeal?.id === item.deal.id} onClick={() => selectDeal(item.deal!.id)}>
                            Work deal
                          </Pill>
                        ) : item.application ? (
                          <>
                            {item.application.submissions[0] && ['under-review', 'submitted'].includes(item.application.status) ? (
                              <Pill size="sm" className="max-md:h-10" onClick={() => recordApplicationDecision(item.application!)} disabled={updatingId === item.application.id}>{pt ? 'Registrar decisão' : 'Record decision'}</Pill>
                            ) : !item.application.submissions[0] ? (
                              <Pill size="sm" className="max-md:h-10" onClick={() => queueApplication(item.application!)} disabled={updatingId === item.application.id}>{pt ? 'Enviar para análise da financeira' : 'Queue for lender review'}</Pill>
                            ) : null}
                            <Pill size="sm" variant="plain" className="max-md:h-10" asChild>
                              <Link href={`${basePath}/platform/finance/applications/${item.application.id}`}>{pt ? 'Abrir' : 'Open'}</Link>
                            </Pill>
                          </>
                        ) : null}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>

        {selectedDeal ? (
          <div ref={detailRef} tabIndex={-1} aria-label={pt ? 'Negociação selecionada' : 'Selected deal'} role="region" className="min-w-0 scroll-mt-4 rounded-md border bg-card p-4 focus:outline-none md:p-5">
            <div className="mb-3 flex justify-end">
              <Pill size="sm" variant="plain" className="max-md:h-10" onClick={() => setSelectedId(null)}><X />{pt ? 'Fechar' : 'Close'}</Pill>
            </div>
            {renderDealDetail(selectedDeal)}
          </div>
        ) : deals.length > 0 ? (
          <p className="text-[13px] text-muted-foreground">{pt ? 'Escolha uma negociação para acompanhar as etapas do financiamento.' : 'Choose a deal to work its finance steps.'}</p>
        ) : null}

        <DeskSection title={pt ? 'Negociações' : 'Deals'} count={filteredDeals.length}>
          <div className="mb-3 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
            <Segmented
              label={pt ? 'Filtrar negociações' : 'Filter deals'}
              value={filter}
              onChange={setFilter}
              options={filterOptions.map(option => ({
                value: option.value,
                label: financeLabel(locale, option.label),
                count: stageCounts[option.value],
                tone: option.value === 'all' || option.value === 'active' ? undefined : statusTones[option.value],
              }))}
            />
            <div className="relative min-w-0 flex-1 lg:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 rounded-[4px] pl-9 text-[13px]"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder={pt ? 'Buscar solicitante, veículo, estoque ou protocolo' : 'Search applicant, vehicle, stock, or reference'}
                aria-label={pt ? 'Buscar no financeiro' : 'Search finance'}
              />
            </div>
            <Select value={sortOrder} onValueChange={setSortOrder}>
              <SelectTrigger className="text-[13px] h-10 w-full rounded-[4px] lg:w-[180px]" aria-label={pt ? 'Ordenar negociações' : 'Sort deals'}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">{pt ? 'Atividade mais recente' : 'Recently active'}</SelectItem>
                <SelectItem value="oldest">{pt ? 'Mais antigas primeiro' : 'Oldest first'}</SelectItem>
                <SelectItem value="amount-desc">{pt ? 'Maior saldo' : 'Highest balance'}</SelectItem>
              </SelectContent>
            </Select>
            {loading && (
              <span className="text-sm text-muted-foreground" role="status">
                {pt ? 'Atualizando…' : 'Refreshing…'}
              </span>
            )}
          </div>
          {filteredDeals.length === 0 ? (
            searchTerm || filter !== 'active' ? <Empty label={pt ? 'Nenhuma negociação encontrada' : 'No matching deals'} onReset={resetFilters} resetLabel={pt ? 'Limpar filtros' : 'Reset filters'} /> : <Empty label={pt ? 'Nenhuma negociação no financeiro' : 'No deals in finance'} />
          ) : (
            <DeskTable>
              <thead>
                <tr>
                  <Th>{pt ? 'Cliente · veículo' : 'Customer · vehicle'}</Th>
                  <Th>{pt ? 'Situação' : 'Status'}</Th>
                  <Th priority={2}>{pt ? 'Próxima etapa' : 'Next step'}</Th>
                  <Th priority={3}>{pt ? 'Alertas' : 'Flags'}</Th>
                  <Th priority={3}>{pt ? 'Atualizado em' : 'Updated'}</Th>
                  <Th align="right">{pt ? 'Valor' : 'Amount'}</Th>
                  <Th priority={2} align="right">{pt ? 'Condições' : 'Terms'}</Th>
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map(deal => {
                  const warnings = getDealWarnings(deal)
                  const status = deal.status || 'pencil'
                  const selected = selectedDeal?.id === deal.id
                  const cash = isCashDeal(deal)
                  const payment = deal.financeEvidence?.payment
                  const flags = [...warnings, ...(payment?.form8300Required ? ['Form 8300 required'] : [])].map(flag => financeLabel(locale, flag))
                  return (
                    <Tr key={deal.id} className={cn('cursor-pointer', selected && 'bg-muted/60')} onClick={() => selectDeal(deal.id)}>
                      <Td>
                        <button
                          type="button"
                          onClick={event => { event.stopPropagation(); selectDeal(deal.id) }}
                          aria-pressed={selected}
                          className="flex min-h-10 min-w-0 flex-col items-start justify-center text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="font-medium text-foreground hover:underline">{getCustomerName(deal, pt)}</span>
                          <span className="text-xs text-muted-foreground">{getVehicleName(deal, pt)} · <Code>#{deal.vehicle?.stockNumber || '-'}</Code></span>
                        </button>
                      </Td>
                      <Td><Status tone={statusTones[status] || 'idle'}>{financeLabel(locale, statusLabels[status] || status)}</Status></Td>
                      <Td priority={2} className="text-muted-foreground">{nextStepFor(deal)?.label || '-'}</Td>
                      <Td priority={3} className="text-muted-foreground">{flags.length ? flags.join(', ') : '-'}</Td>
                      <Td priority={3} className="whitespace-nowrap text-muted-foreground">{formatDate(deal.updatedAt || deal.createdAt, timeZone, locale)}</Td>
                      <Td align="right">
                        <Figure size="sm">
                          {cash
                            ? payment && payment.remainingCents > 0 ? formatCurrencyCents(payment.remainingCents, locale) : payment ? formatCurrencyCents(payment.amountDueCents, locale) : formatCurrency(deal.totalPrice, locale)
                            : formatCurrency(deal.financingAmount, locale)}
                        </Figure>
                        {cash && <p className="text-xs text-muted-foreground">{payment && payment.remainingCents > 0 ? 'Cash · due' : payment ? 'Cash · paid' : 'Cash · total'}</p>}
                      </Td>
                      <Td priority={2} align="right" className="whitespace-nowrap text-muted-foreground">
                        {cash ? (pt ? 'À vista' : 'Cash') : <>{deal.apr || 0}% · {deal.loanTerm || 0} {pt ? 'meses' : 'mo'} · {formatCurrency(deal.monthlyPayment, locale)}/{pt ? 'mês' : 'mo'}</>}
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>

        <DeskSection title={pt ? 'Propostas de financiamento' : 'Applications'} count={openFinanceRequests.length}>
          {openFinanceRequests.length === 0 ? (
            searchTerm ? <Empty label={pt ? 'Nenhuma proposta encontrada' : 'No matching applications'} onReset={resetFilters} resetLabel={pt ? 'Limpar filtros' : 'Reset filters'} /> : <Empty label={pt ? 'Nenhuma proposta de financiamento' : 'No finance applications'} />
          ) : (
            <DeskTable>
              <thead>
                <tr>
                  <Th>{pt ? 'Solicitante · veículo' : 'Applicant · vehicle'}</Th>
                  <Th>{pt ? 'Situação' : 'Status'}</Th>
                  <Th priority={2}>{pt ? 'Financeira' : 'Lender'}</Th>
                  <Th priority={3}>{pt ? 'Enviada em' : 'Submitted'}</Th>
                  <Th align="right">{pt ? 'Valor solicitado' : 'Requested'}</Th>
                  <Th priority={3} align="right">{pt ? 'Condições aprovadas' : 'Decision terms'}</Th>
                  <Th align="right"><span className="sr-only">{pt ? 'Ações' : 'Actions'}</span></Th>
                </tr>
              </thead>
              <tbody>
                {openFinanceRequests.map(application => {
                  const lead = application.lead
                  const openTask = lead?.tasks?.find(task => !task.completed)
                  const applicantName = application.applicantName || [lead?.firstName, lead?.lastName].filter(Boolean).join(' ') || 'Finance applicant'
                  const vehicle = application.vehicle || lead?.interestedVehicle
                  const vehicleName = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : 'No vehicle selected'
                  const submission = application.submissions[0]
                  const decision = application.decisions[0]
                  const busy = updatingId === application.id
                  const lenderState = submission ? submission.status : openTask ? `${openTask.title || (pt ? 'Tarefa em aberto' : 'Open task')} · ${formatDate(openTask.dueDate, timeZone, locale)}` : (pt ? 'Não enviado' : 'Not queued')
                  return (
                    <Tr key={application.id}>
                      <Td>
                        <Link href={`${basePath}/platform/finance/applications/${application.id}`} className="font-medium text-foreground hover:underline">
                          {applicantName}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {vehicleName} · <Code>#{vehicle?.stockNumber || '-'}</Code> · <Code>{application.reference || application.id}</Code>
                        </p>
                      </Td>
                      <Td>
                        <Status tone={stateTone(application.status)}>{label({}, application.status, locale)}</Status>
                        {decision && <p className="mt-0.5 text-xs text-muted-foreground">{pt ? 'Mais recente:' : 'Latest:'} {label(decisionLabels, decision.decision, locale)}</p>}
                      </Td>
                      <Td priority={2} className="text-muted-foreground">
                        {submission ? `${label(providerLabels, submission.providerKey, locale)} · ${label({}, lenderState, locale)}` : label({}, lenderState, locale)}
                      </Td>
                      <Td priority={3} className="whitespace-nowrap text-muted-foreground">{formatDate(application.submittedAt, timeZone, locale)}</Td>
                      <Td align="right">
                        <Figure size="sm">{application.requestedAmountCents != null ? formatCurrency(application.requestedAmountCents / 100, locale) : '-'}</Figure>
                        <p className="text-xs text-muted-foreground">{pt ? 'Veículo' : 'Vehicle'} {formatCurrency((vehicle?.priceCents || 0) / 100, locale)}</p>
                      </Td>
                      <Td priority={3} align="right" className="whitespace-nowrap text-muted-foreground">
                        {decision ? `${decision.aprBasisPoints != null ? `${(decision.aprBasisPoints / 100).toFixed(2)}%` : '-'} · ${decision.termMonths ?? '-'} mo` : '-'}
                      </Td>
                      <Td align="right">
                        <span className="inline-flex flex-wrap justify-end gap-2">
                          {lead && !openTask && (
                            <Pill size="sm" className="max-md:h-10" onClick={() => startFinanceFollowUp(lead)} disabled={updatingId === lead.id}>
                              Create task
                            </Pill>
                          )}
                          {!submission && (
                            <Pill size="sm" className="max-md:h-10" onClick={() => queueApplication(application)} disabled={busy}>
                              Queue for lender review
                            </Pill>
                          )}
                          {submission && ['under-review', 'submitted'].includes(application.status) && (
                            <Pill size="sm" className="max-md:h-10" variant="primary" onClick={() => recordApplicationDecision(application)} disabled={busy}>
                              Record decision
                            </Pill>
                          )}
                          <Pill size="sm" className="max-md:h-10" asChild>
                            <Link href={`${basePath}/platform/finance/applications/${application.id}`}>{pt ? 'Abrir' : 'Open'}</Link>
                          </Pill>
                          {lead && (
                            <Pill size="sm" className="max-md:h-10" variant="plain" asChild>
                              <Link href={`${basePath}/platform/crm/${lead.id}`}>{pt ? 'Abrir lead' : 'Open lead'}</Link>
                            </Pill>
                          )}
                        </span>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>

        <ReadoutStrip>
          <Readout label={pt ? 'Em financiamento' : 'In finance'} value={stageCounts.active} sub={`${stageCounts.submitted} ${pt ? 'enviadas' : 'submitted'}`} />
          <Readout label={pt ? 'Valor financiado' : 'Amount financed'} value={formatCurrency(activeFinanced, locale)} />
          <Readout label={pt ? 'Propostas' : 'Applications'} value={openFinanceRequests.length} />
          <Readout label={pt ? 'Menus apresentados' : 'Menus presented'} value={presentedMenus} />
          <Readout label={pt ? 'Pendências de liberação' : 'Funding exceptions'} value={fundingExceptions} tone={fundingExceptions > 0 ? 'bad' : undefined} sub={fundingExceptions > 0 ? (pt ? 'Pendências em aberto' : 'Open exceptions') : undefined} />
        </ReadoutStrip>

        <OperatorActionDialog
          open={Boolean(task)}
          title={taskTitle}
          fields={taskFields}
          values={task?.fields || {}}
          error={taskError}
          busy={Boolean(task && updatingId)}
          submitLabel={pt ? 'Salvar' : 'Save'}
          onValuesChange={values => setTask(current => (current ? { ...current, fields: values } : current))}
          onSubmit={submitFinanceTask}
          onOpenChange={open => {
            if (!open) {
              setTask(null)
              setTaskError(null)
            }
          }}
        />
      </div>
    </PageContainer>
  )
}
