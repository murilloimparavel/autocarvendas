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
import { countLabel, daysSince, financeDeskStatus, formatAge } from '../lib/display'
import { centsToDollarInput, parseDollarsToCents, readDeskFinanceEvidence, type FinanceStep, type FinanceStepCode } from '../lib/financeEvidence'
import { FinanceEvidenceHistory } from '@/features/platform/deals/components/FinanceEvidenceHistory'
import { formatPhone } from '@/features/platform/lib/format'
import { DEAL_PAYMENT_METHODS, DEAL_PAYMENT_METHOD_LABELS } from '@/features/keystone/lifecycle/paymentMethods'
import { cn } from '@/lib/utils'
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

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

// Dealership time zone, so the server render and the browser agree.
function formatDate(value: string | null | undefined, timeZone: string) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' })
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

function approvalSummary(approval: Deal['approvals'][number]) {
  const label = approvalLabels[approval.decision || ''] || approval.decision || 'Recorded'
  const by = approval.approver?.name ? `${label} by ${approval.approver.name}` : label
  const note = approval.notes && !boilerplateApprovalNote.test(approval.notes.trim()) ? approval.notes.trim() : null
  return { by, note }
}

const stepTone = (step: FinanceStep, next: boolean): DeskTone => step.state === 'done' ? 'ok' : next ? 'info' : step.state === 'optional' ? 'idle' : step.available ? 'warn' : 'idle'

function formatCurrencyCents(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function parseDollarsSafe(raw: string) {
  try { return parseDollarsToCents(raw, 'Amount') } catch { return null }
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
function label(map: Record<string, string>, value: string | null | undefined) {
  if (!value) return '-'
  if (map[value]) return map[value]
  const words = value.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function paymentMethodLabel(method: string, providerKey: string) {
  if (method) return label(DEAL_PAYMENT_METHOD_LABELS, method)
  return providerKey === 'operator-recorded' ? 'Method not recorded' : label({ stripe: 'Card (online)' }, providerKey)
}

function isCashDeal(deal: Deal) {
  return (deal.financeEvidence?.structureType ?? deal.structureType) === 'cash'
}

function contactLine(deal: Deal) {
  return [formatPhone(deal.lead?.phone), deal.lead?.email?.trim()].filter(Boolean).join(' · ') || 'No contact'
}

function getCustomerName(deal: Deal) {
  if (!deal.lead) return 'No customer'
  return [deal.lead.firstName, deal.lead.lastName].filter(Boolean).join(' ') || 'Unnamed customer'
}

function getVehicleName(deal: Deal) {
  if (!deal.vehicle) return 'No vehicle'
  return [deal.vehicle.year, deal.vehicle.make, deal.vehicle.model].filter(Boolean).join(' ')
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

function Empty({ label, onReset }: { label: string; onReset?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
      <p>{label}</p>
      {onReset && (
        <Track>
          <Pill size="sm" onClick={onReset}>Reset filters</Pill>
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
      setError(response.error || 'Unable to load finance.')
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

    setNotice(response.success ? 'Deal status updated.' : `Unable to update deal: ${response.error}`)

    await loadDeals()
    setUpdatingId(null)
  }

  const startFinanceFollowUp = async (lead: FinanceLead) => {
    const openTask = lead.tasks?.find(task => !task.completed)
    if (openTask) {
      setNotice('This request already has an open follow-up task.')
      return
    }

    setUpdatingId(lead.id)
    const response = await openFinanceFollowUp({
      leadId: lead.id,
      reason: 'Review the finance request and decide the next step.',
      idempotencyKey: `finance-follow-up:${lead.id}`,
    })

    setNotice(response.success ? 'Follow-up task created.' : `Unable to create follow-up task: ${response.error}`)
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
    setNotice(response.success ? 'Application queued for lender review.' : `Unable to queue for lender review: ${response.error}`)
    await loadDeals()
    setUpdatingId(null)
  }

  const recordApplicationDecision = (application: FinanceApplication) => {
    const submission = application.submissions[0]
    if (!submission) { setNotice('Queue this application for lender review before recording a decision.'); return }
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
    setNotice(response.success ? (action === 'prepare' ? 'Contract package prepared.' : 'Contract handoff requested.') : `Unable to update contract package: ${response.error}`)
    await loadDeals(); setUpdatingId(null)
  }

  const updateFunding = (deal: Deal, status = 'funded') => openFinanceTask({ kind: 'funding', deal, fields: { status, fundingReference: '', exceptionNotes: '', attestChecklist: '' } })

  const recordPayment = (deal: Deal) => {
    const remaining = deal.financeEvidence?.payment?.remainingCents
    openFinanceTask({ kind: 'payment', deal, fields: { amount: remaining != null && remaining >= 0 ? centsToDollarInput(remaining) : '', paymentMethod: '', receiptReference: '', attestPayment: '' } })
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
    { name: 'notes', label: 'Approval notes (optional)', type: 'textarea', required: false, maxLength: 1000 },
  ] : task.kind === 'lender-decision' ? [
    { name: 'decision', label: 'Lender decision', type: 'select', options: ['approved', 'conditional', 'declined', 'expired', 'cancelled'].map(value => ({ value, label: decisionLabels[value] })) },
    { name: 'externalReference', label: 'Lender reference', maxLength: 200 },
    ...(task.fields.decision === 'declined' ? [{ name: 'reasonCodes', label: 'Decline reason codes (comma separated)', required: true }] : []),
    ...(['approved', 'conditional'].includes(task.fields.decision || '') ? [
      { name: 'approvedAmount', label: 'Approved amount (USD)', type: 'number' as const, min: 0.01, step: 0.01 },
      { name: 'apr', label: 'Approved APR (%)', type: 'number' as const, min: 0, max: 100, step: 0.01 },
      { name: 'termMonths', label: 'Approved term (months)', type: 'number' as const, min: 1, max: 120, step: 1 },
      { name: 'monthlyPayment', label: 'Approved monthly payment (USD)', type: 'number' as const, min: 0, step: 0.01 },
    ] : []),
  ] : task.kind === 'compliance' ? [
    { name: 'checkType', label: 'Check type', type: 'select', options: (task.deal ? requiredChecks(task.deal) : ['identity', 'ofac', 'red-flag', 'privacy']).map(value => ({ value, label: checkLabels[value] || value })) },
    { name: 'status', label: 'Check status', type: 'select', options: ['requested', 'completed', 'failed', 'manual-review'].map(value => ({ value, label: checkStatusLabels[value] })) },
    ...(task.fields.status === 'completed' ? [{ name: 'evidenceReference', label: 'Check reference', maxLength: 200 }] : []),
  ] : task.kind === 'contract-ready' ? [
    { name: 'confirmed', label: 'I reviewed each required document', type: 'checkbox' },
  ] : task.kind === 'contract-provider' ? [
    { name: 'providerStatus', label: 'Contract status', type: 'select', options: ['sent', 'viewed', 'signed', 'declined', 'void'].map(value => ({ value, label: contractStatusLabels[value] })) },
    { name: 'envelopeReference', label: 'Envelope reference', maxLength: 200 }, { name: 'evidenceReference', label: 'Contract reference', maxLength: 200 },
  ] : task.kind === 'buyers-order' ? [
    { name: 'reference', label: 'Signed buyer\'s order reference', maxLength: 200 },
  ] : task.kind === 'prerequisite-review' ? [
    { name: 'reviewReference', label: 'Review reference', maxLength: 200 },
    { name: 'policyReference', label: 'Policy reference', maxLength: 200 },
    { name: 'policyVersion', label: 'Policy version', maxLength: 200 },
    { name: 'reviewerAuthorityReference', label: 'Reviewer approval reference', maxLength: 200 },
  ] : task.kind === 'funding' ? [
    { name: 'status', label: 'Funding state', type: 'select', options: ['pending', 'exception', 'clear-to-fund', 'funded', 'cancelled'].map(value => ({ value, label: fundingLabels[value] })) },
    ...(['clear-to-fund', 'funded'].includes(task.fields.status || '') ? [{ name: 'attestChecklist', label: 'I reviewed the signed contract, stipulations, lender approval, and insurance', type: 'checkbox' as const }] : []),
    ...(task.fields.status === 'funded' ? [{ name: 'fundingReference', label: `Funding reference for worksheet ${task.deal?.worksheetVersion}`, maxLength: 200 }] : []),
    ...(task.fields.status === 'exception' ? [{ name: 'exceptionNotes', label: 'Funding exception details', type: 'textarea' as const, maxLength: 1000 }] : []),
  ] : task.kind === 'payment' ? [
    { name: 'amount', label: 'Balance received ($)', maxLength: 20, description: task.deal?.financeEvidence?.payment ? `Balance due ${formatCurrencyCents(task.deal.financeEvidence.payment.remainingCents)}` : undefined },
    ...(task.fields.amount && parseDollarsSafe(task.fields.amount) === 0 ? [] : [{ name: 'paymentMethod', label: 'Payment method', type: 'select' as const, options: paymentMethodOptions }]),
    { name: 'receiptReference', label: 'Receipt reference', maxLength: 200 },
    { name: 'attestPayment', label: 'Paid in full', type: 'checkbox' as const, description: 'The balance is received and the deal is paid in full' },
  ] : task.kind === 'deposit' ? [
    { name: 'amount', label: 'Amount received ($)', maxLength: 20, description: task.deal?.financeEvidence?.payment ? `Up to ${formatCurrencyCents(task.deal.financeEvidence.payment.remainingCents)}` : undefined },
    { name: 'paymentMethod', label: 'Payment method', type: 'select' as const, options: paymentMethodOptions },
    { name: 'receiptReference', label: 'Receipt reference', maxLength: 200 },
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
  const taskTitle = (task && taskTitles[task.kind]) || 'Finance task'

  const submitFinanceTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!task) return
    const value = (name: string) => task.fields[name]?.trim() || ''
    // Dollars, commas allowed ("1,299.50"); converted to cents here.
    const centsFromDollars = (name: string, label: string) => parseDollarsToCents(value(name), label)
    const { deal, application, submission } = task
    setTaskError(null)
    setUpdatingId(deal?.id || application?.id || 'finance-task')
    try {
      let response: { success: boolean; error?: string } | undefined
      if (task.kind === 'deal-approval' && deal) {
        if (!task.nextStatus) throw new Error('Choose the next deal status.')
        response = await transitionDeal({ id: deal.id, toStatus: task.nextStatus, notes: value('notes'), idempotencyKey: task.idempotencyKey })
      } else if (task.kind === 'lender-decision' && application && submission) {
        const decision = value('decision')
        if (!['approved', 'conditional', 'declined', 'expired', 'cancelled'].includes(decision)) throw new Error('Select a lender decision.')
        const reasonCodes = value('reasonCodes').split(',').map(code => code.trim()).filter(Boolean)
        if (decision === 'declined' && !reasonCodes.length) throw new Error('A declined decision requires at least one reason code.')
        const hasTerms = ['approved', 'conditional'].includes(decision)
        const approvedAmountCents = hasTerms ? centsFromDollars('approvedAmount', 'Approved amount') : null
        const apr = hasTerms ? Number(value('apr')) : null
        const termMonths = hasTerms ? Number(value('termMonths')) : null
        const monthlyPaymentCents = hasTerms ? centsFromDollars('monthlyPayment', 'Monthly payment') : null
        if (hasTerms && (approvedAmountCents! <= 0 || apr == null || !Number.isFinite(apr) || apr < 0 || apr > 100 || !Number.isInteger(termMonths) || termMonths! < 1 || termMonths! > 120)) throw new Error('Enter valid approved amount, APR, whole-month term, and monthly payment.')
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
        if (status === 'completed' && !value('evidenceReference')) throw new Error('Completed checks require a check reference.')
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
        if (value('confirmed') !== 'yes') throw new Error('Confirm the required documents were received and reviewed.')
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
        if (!reference) throw new Error('Enter the signed buyer\'s order reference.')
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
        if (amount <= 0) throw new Error('Enter an amount greater than $0.')
        if (remaining != null && amount > remaining) throw new Error(`The deposit can't be more than the ${formatCurrencyCents(remaining)} still due.`)
        if (!value('paymentMethod')) throw new Error('Choose the payment method.')
        if (!value('receiptReference')) throw new Error('Enter the receipt reference.')
        response = await recordCashDealDeposit({
          dealId: deal.id,
          amountCents: amount,
          paymentMethod: value('paymentMethod'),
          receiptReference: value('receiptReference'),
          idempotencyKey: task.idempotencyKey,
        })
      } else if (task.kind === 'payment' && deal) {
        const amount = centsFromDollars('amount', 'Amount received')
        if (amount > 0 && !value('paymentMethod')) throw new Error('Choose the payment method.')
        if (!value('receiptReference')) throw new Error('Enter the receipt reference.')
        if (value('attestPayment') !== 'yes') throw new Error('Confirm the deal is paid in full.')
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
        if (!digest) throw new Error(stepFor(deal, 'review')?.blockedReason || 'Record the menu decision, checks and signed contract first.')
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
        if (status === 'funded' && !value('fundingReference')) throw new Error('A funding reference is required to mark the deal funded.')
        if (status === 'exception' && !value('exceptionNotes')) throw new Error('Describe the funding exception.')
        const complete = ['clear-to-fund', 'funded'].includes(status)
        if (complete && !deal.financeEvidence?.prerequisites?.current) throw new Error('Review prerequisites first.')
        if (complete && value('attestChecklist') !== 'yes') throw new Error('Confirm the signed contract, stipulations, lender approval, and insurance before clearing funding.')
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
      if (response && !response.success) { setTaskError(response.error || 'Unable to save. Your entries are preserved.'); return }
      if (!response) throw new Error('Something went wrong. Close and reopen this task.')
      setTask(null)
      setNotice(task.kind === 'lender-decision' ? 'Lender decision recorded.' : task.kind === 'payment' ? 'Payment recorded.' : task.kind === 'deposit' ? 'Deposit recorded.' : task.kind.startsWith('contract') || task.kind === 'buyers-order' ? 'Contract updated.' : 'Saved.')
      await loadDeals()
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : 'Unable to save.')
    } finally {
      setUpdatingId(null)
    }
  }

  const filteredDeals = useMemo(() => {
    const queued = filter === 'active' ? deals.filter(deal => ['submitted', 'approved', 'financed'].includes(deal.status || ''))
      : filter === 'all' ? deals
        : deals.filter(deal => deal.status === filter)
    const term = search.trim().toLowerCase()
    return queued.filter(deal => !term || `${getCustomerName(deal)} ${getVehicleName(deal)} ${deal.vehicle?.stockNumber || ''} ${deal.vehicle?.vin || ''}`.toLowerCase().includes(term)).sort((a, b) => {
      if (sortOrder === 'amount-desc') return (b.financingAmount || 0) - (a.financingAmount || 0)
      if (sortOrder === 'oldest') return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
      return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
    })
  }, [deals, filter, search, sortOrder])

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
        ? evidence?.payment ? formatCurrencyCents(Math.max(0, evidence.payment.remainingCents)) : formatCurrency(deal.totalPrice)
        : formatCurrency(deal.financingAmount)
      items.push({
        key: `deal:${deal.id}`,
        who: getCustomerName(deal),
        vehicle: getVehicleName(deal),
        stock: deal.vehicle?.stockNumber || null,
        stage,
        tone,
        waitingOn: status === 'submitted' ? 'Manager approval' : next ? (next.available ? next.label : `${next.label}: ${next.blockedReason || 'blocked'}`) : contract ? label(contractStatusLabels, contract.status) : '-',
        attention: exception,
        attentionWord: exception ? `${openExceptions || 1} exception${openExceptions > 1 ? 's' : ''}` : null,
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
        who: application.applicantName || [lead?.firstName, lead?.lastName].filter(Boolean).join(' ') || 'Finance applicant',
        vehicle: vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'No vehicle selected' : 'No vehicle selected',
        stock: vehicle?.stockNumber || null,
        stage: submission ? 'Pending decision' : 'Not queued',
        tone: 'warn',
        waitingOn: submission ? `Lender decision · ${label(providerLabels, submission.providerKey)}` : openTask ? openTask.title || 'Open task' : 'Queue for lender review',
        attention: overdue,
        attentionWord: overdue ? 'Task overdue' : null,
        ageDays: daysSince(submission?.queuedAt || application.submittedAt, now),
        amount: application.requestedAmountCents != null ? formatCurrency(application.requestedAmountCents / 100) : '-',
        application,
      })
    }
    // Marked items first, then oldest first.
    return items.sort((a, b) => Number(b.attention) - Number(a.attention) || (b.ageDays ?? -1) - (a.ageDays ?? -1))
  }, [deals, applications, contractPackages, fundingCases])
  const activeFinanced = deals.filter(deal => ['submitted', 'approved', 'financed'].includes(deal.status || '')).reduce((sum, deal) => sum + (deal.financingAmount || 0), 0)
  const presentedMenus = menus.filter(menu => menu.status === 'presented').length
  const fundingExceptions = fundingCases.filter(item => item.status === 'exception').length

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Finance' },
  ]

  const deskStatus = financeDeskStatus({
    error: Boolean(error),
    approvalsWaiting: stageCounts.submitted,
    applicationsWaiting: applications.filter(application => ['submitted', 'under-review'].includes(application.status)).length,
  })

  const header = (
    <DeskHeader
      title="Finance"
      tone={deskStatus.tone}
      status={deskStatus.label}
      meta={error ? 'Unavailable' : `${queue.length} waiting · ${stageCounts.active} in finance · ${countLabel(openFinanceRequests.length, 'application')} · ${countLabel(products.length, 'product')}`}
      actions={
        <>
          <Pill variant="plain" onClick={loadDeals} disabled={loading} aria-label="Refresh">
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            Refresh
          </Pill>
          <Pill asChild>
            <Link href={`${basePath}/platform/finance/products`}>Products</Link>
          </Pill>
          <Pill asChild>
            <Link href={`${basePath}/platform/finance/cancellations`}>Cancellations</Link>
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
      <PageContainer title="Finance" header={header} breadcrumbs={breadcrumbs}>
        <div className="space-y-3 px-4 pb-24 md:px-6">
          <Notice tone="bad">
            <p className="font-medium">Finance is unavailable</p>
            <p className="mt-0.5 text-muted-foreground">{error}</p>
          </Notice>
          <Track>
            <Pill onClick={loadDeals}>Retry</Pill>
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
              <TitleLine as="h2" tone={statusTones[status] || 'idle'} status={statusLabels[status] || status} className="text-lg font-semibold tracking-tight">
                {getCustomerName(deal)} · {getVehicleName(deal)}
              </TitleLine>
              <p className="mt-0.5 flex flex-wrap gap-x-2 pl-4 text-xs text-muted-foreground">
                <span>{statusLabels[status] || status}</span>
                <span>·</span>
                <Code>#{deal.vehicle?.stockNumber || '-'}</Code>
                {deal.vehicle?.vin && (<><span>·</span><Code>{deal.vehicle.vin}</Code></>)}
                <span>·</span>
                <span>Worksheet {deal.worksheetVersion}</span>
                {deal.salesperson?.name && (<><span>·</span><span>{deal.salesperson.name}</span></>)}
                {deal.rooftop?.name && (<><span>·</span><span>{deal.rooftop.name}</span></>)}
              </p>
            </div>
            <Track className="shrink-0">
              <Pill size="sm" className="max-md:h-10" asChild>
                <Link href={dealHref}>Open</Link>
              </Pill>
            </Track>
          </div>

          {/* One step at a time: the server's next required step is the primary action. */}
          {(primaryNext || canRecordDeposit || deal.status === 'submitted' || deal.status === 'financed' || (!cash && fundingStatusOpen) || hasAcceptedMenu) && (
          <Track aria-label="Deal actions">
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
                <Link href={`${basePath}/platform/delivery`}>Open delivery</Link>
              </Pill>
            )}
            {!cash && fundingStatusOpen && (
              <Pill size="sm" className="max-md:h-10" onClick={() => updateFunding(deal, 'pending')} disabled={busy}>Update funding</Pill>
            )}
            {hasAcceptedMenu && (
              <Pill size="sm" className="max-md:h-10" asChild>
                <Link href={`${basePath}/platform/finance/cancellations?deal=${deal.id}`}>Product cancellation</Link>
              </Pill>
            )}
          </Track>
          )}
          {next && !next.available && next.blockedReason && (
            <p className="pl-4 text-xs text-muted-foreground" role="status">{next.label}: {next.blockedReason}</p>
          )}
          {payment?.form8300Required && <Notice tone="warn">{FORM_8300_STATE}</Notice>}
          {warnings.length > 0 && <Notice tone="warn">{warnings.join(' · ')}</Notice>}
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
                      : step.blockedReason || (step.state === 'optional' ? 'Optional' : 'Waiting')
                const showAction = step.state !== 'done' && step.code !== 'delivery' && (step.available || Boolean(step.blockedReason))
                return (
                  <li key={step.code} className="flex min-w-0 flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <TitleLine as="p" tone={stepTone(step, isNext)} status={step.state === 'done' ? 'Done' : isNext ? 'Next' : step.state} className={cn('font-medium', step.state === 'done' && 'text-muted-foreground')}>
                        {step.label}
                      </TitleLine>
                      <p id={reasonId} className="break-words pl-4 text-xs text-muted-foreground">
                        {stateText}{step.detail ? ` · ${step.detail}` : ''}
                      </p>
                    </div>
                    {showAction && (
                      <Track className="shrink-0 self-start pl-4 sm:self-auto sm:pl-0">
                        <Pill size="sm" className="max-md:h-10" disabled={busy || !step.available} aria-describedby={reasonId} onClick={() => runStep(deal, step.code)}>
                          {step.label}
                        </Pill>
                      </Track>
                    )}
                  </li>
                )
              })}
            </ol>
          </DeskSection>
        )}

        <DeskSection title="Worksheet">
          <Facts
            items={[
              { label: 'Contact', value: contactLine(deal) },
              { label: 'Structure', value: cash ? 'Cash' : deal.structureType === 'lease' ? 'Lease' : 'Finance' },
              { label: 'Vehicle price', value: formatCurrency(deal.vehiclePrice) },
              { label: 'Trade-in', value: formatCurrency(deal.tradeInValue) },
              cash ? null : { label: 'Down payment', value: formatCurrency(deal.downPayment) },
              { label: 'Tax', value: formatCurrency(deal.taxAmount) },
              { label: 'Total', value: formatCurrency(deal.totalPrice) },
              ...(cash ? [
                payment ? { label: 'Amount due', value: formatCurrencyCents(payment.amountDueCents) } : null,
                payment ? { label: 'Balance', value: formatCurrencyCents(Math.max(0, payment.remainingCents)) } : null,
              ] : [
                { label: 'Amount financed', value: formatCurrency(deal.financingAmount) },
                { label: 'APR · term', value: `${deal.apr || 0}% · ${deal.loanTerm || 0} mo` },
                { label: 'Payment', value: formatCurrency(deal.monthlyPayment) },
              ]),
              { label: 'Gross', value: formatCurrency(deal.profit) },
              { label: 'Flags', value: warnings.length > 0 ? `${warnings.length}` : 'No flags' },
            ]}
          />
        </DeskSection>

        </div>
        <div className="min-w-0 space-y-6">
        <DeskSection title="Lender" count={lenderApplications.length}>
          <Ledger empty="No applications">
            {lenderApplications.flatMap(application => [
              ...application.submissions.map(submission => (
                <li key={submission.id} className="flex min-w-0 items-start justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <TitleLine as="p" tone={stateTone(submission.status)} status={label({}, submission.status)} className="font-medium">
                      Submitted · {label(providerLabels, submission.providerKey)}
                    </TitleLine>
                    <p className="truncate pl-4 text-xs text-muted-foreground">
                      {label({}, submission.status)}{submission.externalReference ? ` · ${submission.externalReference}` : ''}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">{formatDate(submission.queuedAt, timeZone)}</p>
                </li>
              )),
              ...application.decisions.map(decision => (
                <li key={decision.id} className="flex min-w-0 items-start justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <TitleLine as="p" tone={stateTone(decision.decision)} status={label(decisionLabels, decision.decision)} className="font-medium">
                      {label(decisionLabels, decision.decision)} · {label(providerLabels, decision.providerKey)}
                    </TitleLine>
                    <p className="truncate pl-4 text-xs text-muted-foreground">
                      {formatDate(decision.decidedAt, timeZone)}{decision.reasonCodes.length > 0 ? ` · ${decision.reasonCodes.join(', ')}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium tabular-nums">{decision.approvedAmountCents != null ? formatCurrency(decision.approvedAmountCents / 100) : '-'}</p>
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {decision.aprBasisPoints != null ? `${(decision.aprBasisPoints / 100).toFixed(2)}%` : '-'} · {decision.termMonths ?? '-'} mo
                      {decision.monthlyPaymentCents != null ? ` · ${formatCurrency(decision.monthlyPaymentCents / 100)}` : ''}
                    </p>
                  </div>
                </li>
              )),
            ])}
          </Ledger>
        </DeskSection>

        <DeskSection title="Approvals" count={approvals.length}>
          <Ledger empty="None">
            {approvals.map(approval => {
              const { by, note } = approvalSummary(approval)
              return (
                <li key={approval.id} className="flex min-w-0 items-start justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <TitleLine as="p" tone={stateTone(approval.decision)} status={approval.decision || undefined} className="font-medium">
                      {by}
                    </TitleLine>
                    {note && <p className="pl-4 text-xs text-muted-foreground">{note}</p>}
                  </div>
                  <p className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDate(approval.approvalDate, timeZone)}</p>
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
            title="Cancellations"
            count={dealCancellations.length}
            actions={<Track><Pill size="sm" asChild><Link href={`${basePath}/platform/finance/cancellations?deal=${deal.id}`}>Open</Link></Pill></Track>}
          >
            <Ledger empty="None">
              {dealCancellations.map(cancellation => (
                <li key={cancellation.id} className="flex min-w-0 items-center justify-between gap-4 py-2">
                  <TitleLine as="p" tone={stateTone(cancellation.status)} status={cancellation.status}>
                    <Code>{cancellation.productCode}</Code>
                  </TitleLine>
                  <p className="shrink-0 text-xs text-muted-foreground">{label({}, cancellation.status)}</p>
                </li>
              ))}
            </Ledger>
          </DeskSection>
        )}

        <DeskSection title="Compliance" count={dealChecks.length}>
          <Ledger empty="No checks">
            {dealChecks.map(check => (
              <li key={check.id} className="flex min-w-0 items-center justify-between gap-4 py-2">
                <TitleLine as="p" tone={stateTone(check.status)} status={label(checkStatusLabels, check.status)}>
                  {label(checkLabels, check.checkType)}
                </TitleLine>
                <p className="shrink-0 text-xs text-muted-foreground">{label(checkStatusLabels, check.status)}</p>
              </li>
            ))}
          </Ledger>
        </DeskSection>

        <DeskSection title="Contract">
          {contract ? (
            <div className="space-y-2">
              <TitleLine as="p" tone={stateTone(contract.status)} status={label(contractStatusLabels, contract.status)} className="text-sm font-medium">
                {label(contractStatusLabels, contract.status)}
              </TitleLine>
              <Ledger empty="No documents">
                {(contract.documentChecklist || []).map(item => (
                  <li key={item.code} className="flex min-w-0 items-center justify-between gap-4 py-2">
                    <span className="min-w-0 break-words">{label(documentLabels, item.code)}</span>
                    <TitleLine as="span" tone={stateTone(item.status)} className="shrink-0 text-xs text-muted-foreground">{label(itemStatusLabels, item.status)}</TitleLine>
                  </li>
                ))}
              </Ledger>
            </div>
          ) : (
            <p className="py-3 text-sm text-muted-foreground">No contract package</p>
          )}
        </DeskSection>

        <DeskSection title={cash ? 'Payment' : 'Funding'}>
          <div className="space-y-3">
            <Facts
              items={[
                { label: cash ? 'Payment' : 'Funding', value: <TitleLine as="span" tone={evidence?.fundingCurrent ? 'ok' : stateTone(evidence?.fundingStatus)}>{evidence?.fundingCurrent ? (cash ? 'Paid in full' : 'Funded') : evidence?.fundingStatus ? label(fundingLabels, evidence.fundingStatus) : cash && payment && payment.receivedCents > 0 ? 'Partly paid' : 'Not started'}</TitleLine> },
                evidence?.fundingStatus ? { label: 'Worksheet', value: evidence.fundingCurrent ? 'current' : 'earlier version' } : null,
                evidence?.fundingReference ? { label: cash ? 'Receipt' : 'Reference', value: evidence.fundingReference, mono: true } : null,
                payment ? { label: 'Amount due', value: formatCurrencyCents(payment.amountDueCents) } : null,
                payment ? { label: 'Received', value: formatCurrencyCents(payment.receivedCents) } : null,
                payment ? { label: 'Balance', value: formatCurrencyCents(Math.max(0, payment.remainingCents)) } : null,
                payment && payment.cashReceivedCents > 0 ? { label: 'Cash received', value: formatCurrencyCents(payment.cashReceivedCents) } : null,
                payment?.form8300Required ? { label: 'Compliance', value: <TitleLine as="span" tone="warn">{FORM_8300_STATE}</TitleLine> } : null,
                { label: 'Prerequisites', value: evidence?.prerequisites?.current ? (cash ? 'Confirmed with payment' : 'Reviewed') : 'Not yet' },
                fundingCase ? { label: 'Funding case', value: label(fundingLabels, fundingCase.status) } : null,
                fundingCase ? { label: 'Open exceptions', value: openFundingExceptions } : null,
              ]}
            />
            {payment && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Payments received</p>
                <Ledger empty="No payments">
                  {payment.payments.map(record => (
                    <li key={record.id} className="flex min-w-0 items-start justify-between gap-4 py-2">
                      <div className="min-w-0">
                        <TitleLine as="p" tone={record.status === 'captured' ? 'ok' : 'idle'} status={label({ captured: 'Received', 'partially-refunded': 'Partly refunded', refunded: 'Refunded' }, record.status)} className="font-medium">
                          {paymentMethodLabel(record.method, record.providerKey)}
                        </TitleLine>
                        <p className="break-words pl-4 text-xs text-muted-foreground">
                          {formatDate(record.receivedAt, timeZone)}
                          {record.reference ? <> · <Code>{record.reference}</Code></> : null}
                          {record.refundedCents > 0 ? ` · Refunded ${formatCurrencyCents(record.refundedCents)}` : ''}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-medium tabular-nums">{formatCurrencyCents(record.netCents)}</p>
                    </li>
                  ))}
                </Ledger>
              </div>
            )}
            <div className="space-y-1 text-xs text-muted-foreground [&_summary]:cursor-pointer [&_summary]:font-medium [&_summary]:text-foreground">
              {evidence?.prerequisites?.snapshot && (
                <details>
                  <summary>Prerequisite details</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 font-mono text-xs">
                    {JSON.stringify(evidence.prerequisites.snapshot, null, 2)}
                  </pre>
                </details>
              )}
              <FinanceEvidenceHistory dealId={deal.id} aggregateType="FinanceFundingCase" label="Funding history" timeZone={timeZone} />
              {fundingCase?.immutableEvidence != null && (
                <details className="mt-2">
                  <summary>Funding details</summary>
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
    <PageContainer title="Finance" header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {notice && (
          <Notice tone={notice.startsWith('Unable') ? 'bad' : 'info'}>
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0">{notice}</p>
              <Track>
                <Pill size="sm" variant="plain" onClick={() => setNotice(null)}>Dismiss</Pill>
              </Track>
            </div>
          </Notice>
        )}

        <DeskSection title="Needs you" count={queue.length} id="finance-queue">
          {queue.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">Nothing waiting in F&I</p>
          ) : (
            <DeskTable aria-labelledby="finance-queue">
              <thead>
                <tr>
                  <Th>Customer · vehicle</Th>
                  <Th>Stage</Th>
                  <Th priority={2}>Waiting on</Th>
                  <Th align="right">Age</Th>
                  <Th priority={2} align="right">Amount</Th>
                  <Th align="right"><span className="sr-only">Actions</span></Th>
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
                    <Td align="right"><Figure size="sm" attention={item.attention}>{formatAge(item.ageDays)}</Figure></Td>
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
                              <Pill size="sm" className="max-md:h-10" onClick={() => recordApplicationDecision(item.application!)} disabled={updatingId === item.application.id}>Record decision</Pill>
                            ) : !item.application.submissions[0] ? (
                              <Pill size="sm" className="max-md:h-10" onClick={() => queueApplication(item.application!)} disabled={updatingId === item.application.id}>Queue for lender review</Pill>
                            ) : null}
                            <Pill size="sm" variant="plain" className="max-md:h-10" asChild>
                              <Link href={`${basePath}/platform/finance/applications/${item.application.id}`}>Open</Link>
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
          <div ref={detailRef} tabIndex={-1} aria-label="Selected deal" role="region" className="min-w-0 scroll-mt-4 rounded-md border bg-card p-4 focus:outline-none md:p-5">
            <div className="mb-3 flex justify-end">
              <Pill size="sm" variant="plain" className="max-md:h-10" onClick={() => setSelectedId(null)}><X />Close</Pill>
            </div>
            {renderDealDetail(selectedDeal)}
          </div>
        ) : deals.length > 0 ? (
          <p className="text-[13px] text-muted-foreground">Choose a deal to work its finance steps.</p>
        ) : null}

        <DeskSection title="Deals" count={filteredDeals.length}>
          <div className="mb-3 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
            <Segmented
              label="Filter deals"
              value={filter}
              onChange={setFilter}
              options={filterOptions.map(option => ({
                value: option.value,
                label: option.label,
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
                placeholder="Search applicant, vehicle, stock, or reference"
                aria-label="Search finance"
              />
            </div>
            <Select value={sortOrder} onValueChange={setSortOrder}>
              <SelectTrigger className="text-[13px] h-10 w-full rounded-[4px] lg:w-[180px]" aria-label="Sort deals">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Recently active</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="amount-desc">Highest balance</SelectItem>
              </SelectContent>
            </Select>
            {loading && (
              <span className="text-sm text-muted-foreground" role="status">
                Refreshing…
              </span>
            )}
          </div>
          {filteredDeals.length === 0 ? (
            searchTerm || filter !== 'active' ? <Empty label="No matching deals" onReset={resetFilters} /> : <Empty label="No deals in finance" />
          ) : (
            <DeskTable>
              <thead>
                <tr>
                  <Th>Customer · vehicle</Th>
                  <Th>Status</Th>
                  <Th priority={2}>Next step</Th>
                  <Th priority={3}>Flags</Th>
                  <Th priority={3}>Updated</Th>
                  <Th align="right">Amount</Th>
                  <Th priority={2} align="right">Terms</Th>
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map(deal => {
                  const warnings = getDealWarnings(deal)
                  const status = deal.status || 'pencil'
                  const selected = selectedDeal?.id === deal.id
                  const cash = isCashDeal(deal)
                  const payment = deal.financeEvidence?.payment
                  const flags = [...warnings, ...(payment?.form8300Required ? ['Form 8300 required'] : [])]
                  return (
                    <Tr key={deal.id} className={cn('cursor-pointer', selected && 'bg-muted/60')} onClick={() => selectDeal(deal.id)}>
                      <Td>
                        <button
                          type="button"
                          onClick={event => { event.stopPropagation(); selectDeal(deal.id) }}
                          aria-pressed={selected}
                          className="flex min-h-10 min-w-0 flex-col items-start justify-center text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="font-medium text-foreground hover:underline">{getCustomerName(deal)}</span>
                          <span className="text-xs text-muted-foreground">{getVehicleName(deal)} · <Code>#{deal.vehicle?.stockNumber || '-'}</Code></span>
                        </button>
                      </Td>
                      <Td><Status tone={statusTones[status] || 'idle'}>{statusLabels[status] || status}</Status></Td>
                      <Td priority={2} className="text-muted-foreground">{nextStepFor(deal)?.label || '-'}</Td>
                      <Td priority={3} className="text-muted-foreground">{flags.length ? flags.join(', ') : '-'}</Td>
                      <Td priority={3} className="whitespace-nowrap text-muted-foreground">{formatDate(deal.updatedAt || deal.createdAt, timeZone)}</Td>
                      <Td align="right">
                        <Figure size="sm">
                          {cash
                            ? payment && payment.remainingCents > 0 ? formatCurrencyCents(payment.remainingCents) : payment ? formatCurrencyCents(payment.amountDueCents) : formatCurrency(deal.totalPrice)
                            : formatCurrency(deal.financingAmount)}
                        </Figure>
                        {cash && <p className="text-[11px] text-muted-foreground">{payment && payment.remainingCents > 0 ? 'Cash · due' : payment ? 'Cash · paid' : 'Cash · total'}</p>}
                      </Td>
                      <Td priority={2} align="right" className="whitespace-nowrap text-muted-foreground">
                        {cash ? 'Cash' : <>{deal.apr || 0}% · {deal.loanTerm || 0} mo · {formatCurrency(deal.monthlyPayment)}/mo</>}
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>

        <DeskSection title="Applications" count={openFinanceRequests.length}>
          {openFinanceRequests.length === 0 ? (
            searchTerm ? <Empty label="No matching applications" onReset={resetFilters} /> : <Empty label="No finance applications" />
          ) : (
            <DeskTable>
              <thead>
                <tr>
                  <Th>Applicant · vehicle</Th>
                  <Th>Status</Th>
                  <Th priority={2}>Lender</Th>
                  <Th priority={3}>Submitted</Th>
                  <Th align="right">Requested</Th>
                  <Th priority={3} align="right">Decision terms</Th>
                  <Th align="right"><span className="sr-only">Actions</span></Th>
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
                  const lenderState = submission ? submission.status : openTask ? `${openTask.title || 'Open task'} · ${formatDate(openTask.dueDate, timeZone)}` : 'Not queued'
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
                        <Status tone={stateTone(application.status)}>{label({}, application.status)}</Status>
                        {decision && <p className="mt-0.5 text-xs text-muted-foreground">Latest: {label(decisionLabels, decision.decision)}</p>}
                      </Td>
                      <Td priority={2} className="text-muted-foreground">
                        {submission ? `${label(providerLabels, submission.providerKey)} · ${label({}, lenderState)}` : lenderState}
                      </Td>
                      <Td priority={3} className="whitespace-nowrap text-muted-foreground">{formatDate(application.submittedAt, timeZone)}</Td>
                      <Td align="right">
                        <Figure size="sm">{application.requestedAmountCents != null ? formatCurrency(application.requestedAmountCents / 100) : '-'}</Figure>
                        <p className="text-[11px] text-muted-foreground">Vehicle {formatCurrency((vehicle?.priceCents || 0) / 100)}</p>
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
                            <Link href={`${basePath}/platform/finance/applications/${application.id}`}>Open</Link>
                          </Pill>
                          {lead && (
                            <Pill size="sm" className="max-md:h-10" variant="plain" asChild>
                              <Link href={`${basePath}/platform/crm/${lead.id}`}>Open lead</Link>
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
          <Readout label="In finance" value={stageCounts.active} sub={`${stageCounts.submitted} submitted`} />
          <Readout label="Amount financed" value={formatCurrency(activeFinanced)} />
          <Readout label="Applications" value={openFinanceRequests.length} />
          <Readout label="Menus presented" value={presentedMenus} />
          <Readout label="Funding exceptions" value={fundingExceptions} tone={fundingExceptions > 0 ? 'bad' : undefined} sub={fundingExceptions > 0 ? 'Open exceptions' : undefined} />
        </ReadoutStrip>

        <OperatorActionDialog
          open={Boolean(task)}
          title={taskTitle}
          fields={taskFields}
          values={task?.fields || {}}
          error={taskError}
          busy={Boolean(task && updatingId)}
          submitLabel="Save"
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
