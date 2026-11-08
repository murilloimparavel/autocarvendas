'use client'
import { formatInZone } from '@/features/dashboard/lib/storeTime';

import { useState, useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, Calculator, Check, Link2, Pencil, Save, Unlink, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import {
  Code,
  DeskHeader,
  DeskSection,
  Facts,
  Figure,
  Meter,
  Notice,
  Panel,
  Pill,
  Segmented,
  Status,
  TitleLine,
  Track,
  type DeskTone,
} from '@/features/platform/components/desk'
import {
  acceptDealWorksheet,
  getAttachableTradeIns,
  getDealLenderOffers,
  getDealWorkspace,
  presentDealWorksheet,
  reopenDealWorksheet,
  saveDealWorksheet,
  selectDealLenderOffer,
  setDealTradeIn,
  transitionDeal,
  type DealLenderOffer,
  type DealTradeIn,
  type DealTradeInOption,
  type DealWorksheetVersion,
} from '../actions'
import { applyDealDefaults, calculateDealPrice, assertValidDealPrice, normalizeMoneyLines, repriceRateTaxLines, sumMoneyLines, type MoneyLine } from '@/features/keystone/lifecycle/dealPricing'
import { WorksheetLines } from '../components/WorksheetLines'
import { FourSquare } from '../components/FourSquare'
import { MoneyInput } from '../components/MoneyInput'
import { readFinanceEvidence, type FinanceEvidence } from '../lib/financeEvidence'
import { FinanceEvidenceHistory } from '../components/FinanceEvidenceHistory'
import { labelForDeal, toneForDeal } from '../lib/dealStatus'
import { formatUsd, formatUsdCredit } from '../lib/formatMoney'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { OperatorActionDialog } from '@/features/platform/components/OperatorActionDialog'

type LenderOffer = DealLenderOffer

interface Deal {
  id: string
  vehiclePrice: number
  tradeInValue: number
  downPayment: number
  financingAmount: number
  monthlyPayment: number
  loanTerm: number
  apr: number
  taxAmount: number
  status: string
  structureType: string
  worksheetVersion: number
  financeEvidence: FinanceEvidence | null
  form8300Required?: boolean
  fees: MoneyLine[]
  rebates: MoneyLine[]
  products: MoneyLine[]
  taxLines: MoneyLine[]
  residualValueCents: number | null
  moneyFactorBasisPoints: number | null
  presentedAt: string | null
  acceptedAt: string | null
  saleDate: string | null
  createdAt: string
  updatedAt: string
  totalPrice: number
  profit: number | null
  salesperson: { id: string; name: string; email: string } | null
  lead: { id: string; firstName: string; lastName: string; email: string; phone: string } | null
  vehicle: {
    id: string
    year: number
    make: string
    model: string
    trim: string
    stockNumber: string
    vin: string
    exteriorColor: string | null
    condition?: string | null
    price: number
    purchasePrice: number
  } | null
  approvals: {
    id: string
    decision: string
    approvalDate: string
    notes: string
    approver: { name: string } | null
  }[]
}

const fieldLabel = 'text-[12px] font-medium text-muted-foreground'
const inputClass = 'h-10 rounded-[4px] text-right text-[13px] tabular-nums shadow-none'

/** Rate-based tax lines follow the worksheet; the server reprices them the same way on save. */
function withRepricedTax(deal: Deal): Deal {
  try {
    return { ...deal, taxLines: repriceRateTaxLines(deal.taxLines, { vehiclePriceCents: Math.round(deal.vehiclePrice * 100), tradeInValueCents: Math.round(deal.tradeInValue * 100), fees: deal.fees, rebates: deal.rebates }) }
  } catch {
    // Invalid amounts are reported on save; keep the last priced tax until then.
    return deal
  }
}

function lineCents(line: MoneyLine) {
  const value = Number(line.amountCents ?? Math.round(Number((line as { amount?: unknown }).amount || 0) * 100))
  return Number.isFinite(value) ? value : 0
}

const worksheetLineGroups = [
  ['fees', 'Fee'],
  ['products', 'Product'],
  ['rebates', 'Rebate'],
  ['taxLines', 'Tax'],
] as const

/** Field problems the operator can fix before the worksheet is sent to the server. */
function worksheetFieldErrors(deal: Pick<Deal, 'fees' | 'products' | 'rebates' | 'taxLines'>) {
  const errors: string[] = []
  for (const [field, label] of worksheetLineGroups) {
    const missing = deal[field].flatMap((line, index) => String(line.name || '').trim() ? [] : [index + 1])
    if (missing.length === 0) continue
    const lineNote = deal[field].length > 1 ? ` (linha ${missing.join(', ')})` : ''
    errors.push(`${label} ${label === 'Fee' ? 'é obrigatória' : 'é obrigatório'}${lineNote}`)
  }
  return errors
}

/** Lease rate is stored as APR-equivalent basis points; money factor = APR% / 2400. */
function moneyFactorFromBps(bps: number | null | undefined) {
  return (Number(bps) || 0) / 100 / 2400
}

/** Standard lease payment: depreciation plus rent charge on the net capitalized cost. */
function leasePaymentCents(capCostCents: number, residualCents: number, termMonths: number, rateBps: number) {
  if (!termMonths || termMonths < 1) return 0
  const moneyFactor = moneyFactorFromBps(rateBps)
  const depreciation = (capCostCents - residualCents) / termMonths
  const rent = (capCostCents + residualCents) * moneyFactor
  return Math.max(0, Math.round(depreciation + rent))
}

function tradeInName(tradeIn: Pick<DealTradeIn, 'year' | 'make' | 'model' | 'trim'>) {
  return [tradeIn.year, tradeIn.make, tradeIn.model, tradeIn.trim].filter(Boolean).join(' ') || 'Trade-in'
}

const CANCELLABLE_STATUSES = ['pencil', 'approved', 'financed']

/** Only an optimistic-concurrency rejection means someone else changed the deal. */
function isVersionConflict(message: string) {
  return /changed concurrently|reload and retry/i.test(message)
}

/** One row of the deal jacket ledger. */
function LedgerRow({ label, value, emphasis, sub, indent }: { label: ReactNode; value: ReactNode; emphasis?: 'subtotal' | 'total'; sub?: boolean; indent?: boolean }) {
  return (
    <div
      className={[
        'flex min-w-0 items-baseline justify-between gap-4 px-4',
        emphasis === 'total' ? 'border-t border-foreground/60 py-3 text-base font-semibold text-foreground' : emphasis === 'subtotal' ? 'border-t py-2.5 text-sm font-medium text-foreground' : sub ? 'py-1 text-xs text-muted-foreground' : 'py-2 text-sm text-foreground',
        indent ? 'pl-8' : '',
      ].join(' ')}
    >
      <dt className={`min-w-0 break-words ${emphasis || sub ? '' : 'text-muted-foreground'}`}>{label}</dt>
      <dd className="shrink-0 text-right tabular-nums">{value}</dd>
    </div>
  )
}

export function DealDetailPageClient({ id }: { id: string }) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const copy = (en: string, br: string) => pt ? br : en
  const [deal, setDeal] = useState<Deal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [worksheetDirty, setWorksheetDirty] = useState(false)
  const [showLineErrors, setShowLineErrors] = useState(false)
  const [savedPricing, setSavedPricing] = useState<(ReturnType<typeof calculateDealPrice> & { financingAmountCents: number; monthlyPaymentCents: number; apr: number; loanTerm: number }) | null>(null)
  const [lenderOffers, setLenderOffers] = useState<LenderOffer[]>([])
  const [worksheetHistory, setWorksheetHistory] = useState<DealWorksheetVersion[]>([])
  const [acceptanceDialogOpen, setAcceptanceDialogOpen] = useState(false)
  const [acceptanceValues, setAcceptanceValues] = useState({ acknowledgment: '' })
  const [acceptanceError, setAcceptanceError] = useState<string | null>(null)
  const acceptanceIdempotencyKeyRef = useRef<string | null>(null)
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false)
  const [reopenValues, setReopenValues] = useState({ reason: '' })
  const [reopenError, setReopenError] = useState<string | null>(null)
  const reopenIdempotencyKeyRef = useRef<string | null>(null)
  const [approvalIntent, setApprovalIntent] = useState<{ toStatus: string; notes: string; idempotencyKey: string; title: string; submitLabel: string } | null>(null)
  const [approvalError, setApprovalError] = useState<string | null>(null)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelValues, setCancelValues] = useState({ reason: '' })
  const [cancelError, setCancelError] = useState<string | null>(null)
  const cancelIdempotencyKeyRef = useRef<string | null>(null)
  const [dealTradeIn, setDealTradeInRecord] = useState<DealTradeIn | null>(null)
  const [dealRooftopId, setDealRooftopId] = useState<string | null>(null)
  const [currencyCode, setCurrencyCode] = useState('USD')
  const [tradeInDialog, setTradeInDialog] = useState<'attach' | 'detach' | null>(null)
  const [tradeInOptions, setTradeInOptions] = useState<DealTradeInOption[] | null>(null)
  const [tradeInValues, setTradeInValues] = useState({ tradeInId: '', reason: '' })
  const [tradeInError, setTradeInError] = useState<string | null>(null)
  const tradeInIdempotencyKeyRef = useRef<string | null>(null)

  useEffect(() => {
    loadDeal()
  }, [id])

  const loadDeal = async () => {
    setLoading(true)
    setError(null)
    const response = await getDealWorkspace(id)
    if (response.success && response.data?.dealWorkspace?.deal) {
      const value = response.data.dealWorkspace.deal
      setDealTradeInRecord(response.data.tradeIn)
      setDealRooftopId(response.data.rooftopId)
      setCurrencyCode(response.data.currencyCode)
      value.form8300Required = value.financeEvidence?.payment?.form8300Required === true
      value.financeEvidence = readFinanceEvidence(value.financeEvidence)
      for (const key of ['fees', 'rebates', 'products', 'taxLines']) value[key] = Array.isArray(value[key]) ? value[key] : []
      if (!value.taxLines.length && value.taxAmountCents > 0) value.taxLines = [{ code: 'legacy-tax', name: 'Tax', amountCents: value.taxAmountCents, source: 'operator-recorded' }]
      setShowLineErrors(false)
      setWorksheetHistory(response.data.dealWorkspace.worksheetVersions || [])
      setSavedPricing({ ...calculateDealPrice(value), financingAmountCents: value.financingAmountCents || 0, monthlyPaymentCents: value.monthlyPaymentCents || 0, apr: value.apr || 0, loanTerm: value.loanTerm || 0 })
      // A never-saved pencil with no fee or tax lines starts from the store's doc fee and tax rate.
      let prefilled = false
      if (value.status === 'pencil' && !value.worksheetVersion) {
        try {
          const seeded = applyDealDefaults(value, response.data.dealDefaults)
          if (seeded.changed) {
            value.fees = seeded.fees
            value.taxLines = seeded.taxLines
            prefilled = true
          }
        } catch {
          prefilled = false
        }
      }
      setWorksheetDirty(prefilled)
      const dollars = (cents: number | null | undefined) => (cents ?? 0) / 100
      setDeal({ ...value, vehiclePrice: dollars(value.vehiclePriceCents), tradeInValue: dollars(value.tradeInValueCents), downPayment: dollars(value.downPaymentCents), financingAmount: dollars(value.financingAmountCents), monthlyPayment: dollars(value.monthlyPaymentCents), taxAmount: dollars(value.taxAmountCents), totalPrice: dollars(value.totalPriceCents), profit: null, salesperson: value.salesperson ? { ...value.salesperson, email: '' } : null, lead: value.lead ? { ...value.lead, email: '', phone: '' } : null, vehicle: value.vehicle ? { ...value.vehicle, price: dollars(value.vehicle.priceCents), purchasePrice: 0 } : null })
      const offers = await getDealLenderOffers(id)
      setLenderOffers(offers.success ? offers.data?.dealLenderOffers || [] : [])
    } else {
      setDeal(null)
      setError(response.error || (pt ? 'Venda não encontrada.' : 'The deal was not found.'))
    }
    setLoading(false)
  }

  const editWorksheet = (patch: Partial<Deal>) => {
    setWorksheetDirty(true)
    setDeal(current => current ? withRepricedTax({ ...current, ...patch }) : current)
  }

  const saveWorksheetVersion = async () => {
    if (!deal) return
    setError(null)
    const fieldErrors = worksheetFieldErrors(deal)
    if (fieldErrors.length) {
      setShowLineErrors(true)
      setError(fieldErrors.join('. '))
      return
    }
    let lines: { fees: MoneyLine[]; rebates: MoneyLine[]; products: MoneyLine[]; taxLines: MoneyLine[] }
    const amounts = { vehiclePriceCents: Math.round(deal.vehiclePrice * 100), tradeInValueCents: Math.round(deal.tradeInValue * 100), downPaymentCents: Math.round(deal.downPayment * 100) }
    try {
      lines = { fees: normalizeMoneyLines(deal.fees, 'Fee'), rebates: normalizeMoneyLines(deal.rebates, 'Rebate'), products: normalizeMoneyLines(deal.products, 'Product'), taxLines: normalizeMoneyLines(deal.taxLines, 'Tax') }
      assertValidDealPrice(calculateDealPrice({ ...amounts, ...lines, taxAmountCents: sumMoneyLines(lines.taxLines) }))
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : (pt ? 'Confira os valores da venda.' : 'Check the worksheet amounts'))
      return
    }
    setUpdating(true)
    try {
      const response = await saveDealWorksheet({
        dealId: deal.id,
        structureType: deal.structureType,
        ...amounts,
        ...lines,
        monthlyPaymentCents: Math.round(deal.monthlyPayment * 100),
        loanTerm: deal.structureType === 'cash' ? null : deal.loanTerm,
        apr: deal.structureType === 'finance' ? deal.apr : null,
        residualValueCents: deal.structureType === 'lease' ? deal.residualValueCents : null,
        moneyFactorBasisPoints: deal.structureType === 'lease' ? deal.moneyFactorBasisPoints : null,
        expectedUpdatedAt: deal.updatedAt,
        reason: 'Saved from deal workspace before presentation.',
        idempotencyKey: `deal-worksheet:${deal.id}:${deal.updatedAt}`,
      })
      if (!response.success) throw new Error(response.error || 'Worksheet save failed')
      await loadDeal()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Worksheet save failed'
      setError(isVersionConflict(message)
        ? 'This deal was changed by someone else since you opened it. Your edits have not been lost. Copy your edits before reloading.'
        : `Worksheet not saved: ${message}`)
    } finally {
      setUpdating(false)
    }
  }

  const recordWorksheetDecision = async (action: 'present' | 'accept') => {
    if (!deal) return
    if (action === 'accept') {
      setAcceptanceValues({ acknowledgment: '' })
      setAcceptanceError(null)
      acceptanceIdempotencyKeyRef.current = `deal-accept:${deal.id}:${crypto.randomUUID()}`
      setAcceptanceDialogOpen(true)
      return
    }

    setUpdating(true)
    setError(null)
    const response = await presentDealWorksheet({
      dealId: deal.id,
      expectedUpdatedAt: deal.updatedAt,
      idempotencyKey: `deal-present:${deal.id}:${deal.worksheetVersion}:${deal.updatedAt}`,
    })
    if (!response.success) setError(`${copy(`Unable to ${action} worksheet`, `Não foi possível ${action === 'present' ? 'apresentar' : action === 'accept' ? 'aceitar' : 'enviar'} a proposta`)}: ${response.error}`)
    await loadDeal()
    setUpdating(false)
  }

  const submitWorksheetAcceptance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!deal) return
    const acknowledgment = acceptanceValues.acknowledgment.trim()
    const idempotencyKey = acceptanceIdempotencyKeyRef.current
    if (!acknowledgment) {
      setAcceptanceError(pt ? 'Informe o método de aceite ou o número de referência.' : 'Acceptance method or reference is required.')
      return
    }
    if (!idempotencyKey) {
      setAcceptanceError(pt ? 'Feche e reabra esta janela para tentar novamente.' : 'Close and reopen this dialog to try again.')
      return
    }

    setUpdating(true)
    setAcceptanceError(null)
    try {
      const response = await acceptDealWorksheet({ dealId: deal.id, expectedUpdatedAt: deal.updatedAt, acknowledgment, idempotencyKey })
      if (!response.success) {
        setAcceptanceError(pt ? `Não foi possível registrar o aceite da proposta: ${response.error}` : `Unable to record worksheet acceptance: ${response.error}`)
        return
      }

      acceptanceIdempotencyKeyRef.current = null
      setAcceptanceDialogOpen(false)
      await loadDeal()
    } catch (error) {
      setAcceptanceError(pt ? `Não foi possível registrar o aceite da proposta: ${error instanceof Error ? error.message : 'Falha na solicitação'}` : `Unable to record worksheet acceptance: ${error instanceof Error ? error.message : 'Request failed'}`)
    } finally {
      setUpdating(false)
    }
  }

  const handleAcceptanceDialogOpenChange = (open: boolean) => {
    setAcceptanceDialogOpen(open)
    if (!open) {
      acceptanceIdempotencyKeyRef.current = null
      setAcceptanceValues({ acknowledgment: '' })
      setAcceptanceError(null)
    }
  }

  const selectLenderOffer = async (lenderDecisionId: string) => {
    if (!deal) return
    setUpdating(true)
    setError(null)
    const response = await selectDealLenderOffer({
      dealId: deal.id,
      lenderDecisionId,
      expectedUpdatedAt: deal.updatedAt,
      idempotencyKey: `deal-lender:${deal.id}:${lenderDecisionId}:${deal.worksheetVersion}:${deal.updatedAt}`,
    })
    if (!response.success) setError(`${copy('Unable to select lender offer', 'Não foi possível selecionar a proposta da financeira')}: ${response.error}`)
    await loadDeal()
    setUpdating(false)
  }

  const reopenWorksheet = () => {
    if (!deal) return
    setReopenValues({ reason: '' })
    setReopenError(null)
    reopenIdempotencyKeyRef.current = `deal-reopen:${deal.id}:${crypto.randomUUID()}`
    setReopenDialogOpen(true)
  }

  const submitReopenWorksheet = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!deal) return
    const reason = reopenValues.reason.trim()
    const idempotencyKey = reopenIdempotencyKeyRef.current
    if (!reason) {
      setReopenError(pt ? 'Informe o motivo para reabrir a proposta.' : 'A reason is required to reopen the worksheet.')
      return
    }
    if (reason.length > 1000) {
      setReopenError(pt ? 'O motivo deve ter no máximo 1.000 caracteres.' : 'The reopen reason must be 1,000 characters or fewer.')
      return
    }
    if (!idempotencyKey) {
      setReopenError(pt ? 'Feche e reabra esta janela para tentar novamente.' : 'Close and reopen this dialog to try again.')
      return
    }

    setUpdating(true)
    setReopenError(null)
    try {
      const response = await reopenDealWorksheet({ dealId: deal.id, expectedUpdatedAt: deal.updatedAt, reason, idempotencyKey })
      if (!response.success) {
        setReopenError(pt ? `Não foi possível reabrir a proposta: ${response.error || 'Falha na solicitação'}` : `Unable to reopen worksheet: ${response.error || 'Request failed'}`)
        return
      }

      await loadDeal()
      reopenIdempotencyKeyRef.current = null
      setReopenDialogOpen(false)
    } catch (error) {
      setReopenError(pt ? `Não foi possível reabrir a proposta: ${error instanceof Error ? error.message : 'Falha na solicitação'}` : `Unable to reopen worksheet: ${error instanceof Error ? error.message : 'Request failed'}`)
    } finally {
      setUpdating(false)
    }
  }

  const handleReopenDialogOpenChange = (open: boolean) => {
    setReopenDialogOpen(open)
    if (!open) {
      reopenIdempotencyKeyRef.current = null
      setReopenValues({ reason: '' })
      setReopenError(null)
    }
  }

  const transitionDealStatus = async (newStatus: string, notes: string, idempotencyKey: string) => {
    setUpdating(true)
    try {
      const response = await transitionDeal({ id, toStatus: newStatus, notes, idempotencyKey })
      if (!response.success) return `Failed to update deal: ${response.error || 'Request failed'}`
      await loadDeal()
      return null
    } catch (error) {
      return `Failed to update deal: ${error instanceof Error ? error.message : 'Request failed'}`
    } finally {
      setUpdating(false)
    }
  }

  const updateStatus = async (newStatus: string, approvalDecision?: 'pending' | 'approved' | 'rejected' | 'changes-requested') => {
    const defaultNote = approvalDecision === 'pending'
      ? 'Submitted for approval from the deal page.'
      : approvalDecision === 'approved'
        ? 'Approved from the deal page.'
        : approvalDecision === 'rejected'
          ? 'Rejected from the deal page.'
          : ''

    if (approvalDecision) {
      const title = approvalDecision === 'pending'
        ? 'Submit for approval'
        : approvalDecision === 'approved'
          ? 'Approve deal'
          : approvalDecision === 'rejected'
            ? 'Reject deal'
            : 'Update deal approval'
      setApprovalError(null)
      setApprovalIntent({
        toStatus: newStatus,
        notes: defaultNote,
        idempotencyKey: `deal-transition:${id}:${newStatus}:${deal?.worksheetVersion}:${deal?.updatedAt}`,
        title,
        submitLabel: title,
      })
      return
    }

    setError(null)
    const failure = await transitionDealStatus(newStatus, '', `deal-transition:${id}:${newStatus}:${deal?.worksheetVersion}:${deal?.updatedAt}`)
    if (failure) setError(failure)
  }

  const submitApprovalNotes = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const intent = approvalIntent
    if (!intent) return
    setApprovalError(null)
    const failure = await transitionDealStatus(intent.toStatus, intent.notes, intent.idempotencyKey)
    if (failure) {
      setApprovalError(failure)
      return
    }
    setApprovalIntent(null)
  }

  const handleApprovalNotesOpenChange = (open: boolean) => {
    if (open) return
    setApprovalIntent(null)
    setApprovalError(null)
  }

  const openCancelDeal = () => {
    setCancelValues({ reason: '' })
    setCancelError(null)
    cancelIdempotencyKeyRef.current = `deal-cancel:${id}:${crypto.randomUUID()}`
    setCancelDialogOpen(true)
  }

  const submitCancelDeal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const reason = cancelValues.reason.trim()
    if (!reason) {
      setCancelError(pt ? 'Informe o motivo do cancelamento.' : 'A cancellation reason is required.')
      return
    }
    if (!cancelIdempotencyKeyRef.current) {
      setCancelError(pt ? 'Feche e reabra esta janela para tentar novamente.' : 'Close and reopen this dialog to try again.')
      return
    }
    setCancelError(null)
    const failure = await transitionDealStatus('cancelled', reason, cancelIdempotencyKeyRef.current)
    if (failure) {
      setCancelError(failure)
      return
    }
    cancelIdempotencyKeyRef.current = null
    setCancelDialogOpen(false)
  }

  const openTradeInDialog = async (kind: 'attach' | 'detach') => {
    if (!deal) return
    setTradeInError(null)
    setTradeInValues({ tradeInId: '', reason: '' })
    tradeInIdempotencyKeyRef.current = `deal-trade-in:${deal.id}:${crypto.randomUUID()}`
    setTradeInDialog(kind)
    if (kind === 'attach') {
      setTradeInOptions(null)
      if (!dealRooftopId) {
        setTradeInOptions([])
        return
      }
      const response = await getAttachableTradeIns(dealRooftopId, deal.lead?.id || null)
      if (response.success) setTradeInOptions(response.data.tradeIns)
      else {
        setTradeInOptions([])
        setTradeInError(pt ? `Não foi possível carregar as avaliações de troca: ${response.error || 'Tente novamente.'}` : response.error || 'Unable to load trade-ins.')
      }
    }
  }

  const submitTradeIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!deal || !tradeInDialog) return
    const tradeInId = tradeInDialog === 'attach' ? tradeInValues.tradeInId : null
    const reason = tradeInValues.reason.trim()
    if (tradeInDialog === 'attach' && !tradeInId) return setTradeInError(pt ? 'Selecione uma avaliação de troca.' : 'Select a trade-in.')
    if (tradeInDialog === 'detach' && !reason) return setTradeInError(pt ? 'Informe o motivo.' : 'A reason is required.')
    if (!tradeInIdempotencyKeyRef.current) return setTradeInError(pt ? 'Feche e reabra esta janela para tentar novamente.' : 'Close and reopen this dialog to try again.')
    setUpdating(true)
    setTradeInError(null)
    try {
      const response = await setDealTradeIn({ dealId: deal.id, tradeInId, expectedUpdatedAt: deal.updatedAt, reason: reason || undefined, idempotencyKey: tradeInIdempotencyKeyRef.current })
      if (!response.success) {
        setTradeInError(response.error)
        return
      }
      tradeInIdempotencyKeyRef.current = null
      setTradeInDialog(null)
      await loadDeal()
    } finally {
      setUpdating(false)
    }
  }

  const formatCurrency = (value: number | null | undefined) => formatUsd(value, { currencyCode, locale })

  const formatDate = (date: string | null) => {
    if (!date) return '-'
    return formatInZone(date, undefined, 'datetime', locale)
  }

  const breadcrumbs = (label: string) => [
    { type: 'link' as const, label: pt ? 'Painel' : 'Dashboard', href: basePath },
    { type: 'page' as const, label: pt ? 'Plataforma' : 'Platform' },
    { type: 'link' as const, label: pt ? 'Vendas' : 'Deals', href: `${basePath}/platform/deals` },
    { type: 'page' as const, label },
  ]

  if (loading && !deal) {
    return (
      <PageContainer
        title={pt ? 'Venda' : 'Deal'}
        header={<DeskHeader title={pt ? 'Carregando venda' : 'Loading deal'} meta={pt ? 'Venda' : 'Deal'} />}
        breadcrumbs={breadcrumbs(pt ? 'Venda' : 'Deal')}
      >
        <div className="flex min-h-[320px] items-center justify-center px-4 md:px-6" role="status">
          <span className="text-sm text-muted-foreground">{pt ? 'Carregando venda' : 'Loading deal'}</span>
        </div>
      </PageContainer>
    )
  }

  if (!deal) {
    return (
      <PageContainer
        title={pt ? 'Venda' : 'Deal'}
        header={
          <DeskHeader
            title={pt ? 'Venda indisponível' : 'Deal unavailable'}
            meta={pt ? 'Não foi possível carregar a venda' : 'The deal could not be loaded'}
            actions={
              <Track>
                <Pill asChild>
                  <Link href={`${basePath}/platform/deals`}>{pt ? 'Voltar para vendas' : 'Back to deals'}</Link>
                </Pill>
              </Track>
            }
          />
        }
        breadcrumbs={breadcrumbs('Deal')}
      >
        <div className="px-4 pb-24 md:px-6">
          <Notice tone="bad">{error || 'The deal was not found.'}</Notice>
        </div>
      </PageContainer>
    )
  }

  const dealChecklist = [
    { label: copy('Customer lead attached', 'Cliente vinculado'), complete: Boolean(deal.lead), detail: deal.lead ? `${deal.lead.firstName} ${deal.lead.lastName}` : copy('Attach customer before contracting', 'Vincule um cliente antes de formalizar a venda') },
    { label: copy('Vehicle selected', 'Veículo selecionado'), complete: Boolean(deal.vehicle), detail: deal.vehicle ? `${deal.vehicle.stockNumber} · ${deal.vehicle.vin}` : copy('Attach vehicle and VIN', 'Vincule um veículo e informe o chassi (VIN)') },
    { label: copy('Negotiated price entered', 'Preço negociado informado'), complete: Number(deal.vehiclePrice || 0) > 0, detail: formatCurrency(deal.vehiclePrice) },
    { label: copy('Deal structure complete', 'Condições da venda preenchidas'), complete: deal.structureType === 'cash' ? deal.worksheetVersion > 0 : Number(deal.financingAmount || 0) > 0 && Number(deal.loanTerm || 0) > 0 && Number(deal.monthlyPayment || 0) > 0, detail: deal.structureType === 'cash' ? copy('Cash structure', 'Venda à vista') : `${formatCurrency(deal.financingAmount)} · ${deal.loanTerm || '-'} ${pt ? 'meses' : 'mo'} · ${formatCurrency(deal.monthlyPayment)}${pt ? '/mês' : '/mo'}` },
    { label: copy('Down payment planned', 'Entrada definida'), complete: deal.structureType === 'cash' || Number(deal.downPayment || 0) > 0, detail: deal.structureType === 'cash' ? `${formatCurrency(deal.downPayment)} · ${copy('cash deal, full total due at signing', 'venda à vista, valor integral devido na assinatura')}` : formatCurrency(deal.downPayment) },
    { label: copy('Tax saved', 'Impostos salvos'), complete: deal.worksheetVersion > 0, detail: formatCurrency(deal.taxAmount) },
    { label: copy('Manager/F&I approval recorded', 'Aprovação da gerência/financeiro registrada'), complete: deal.approvals?.some(approval => approval.decision === 'approved'), detail: `${deal.approvals?.length || 0} ${copy('approval event(s)', 'aprovação(ões)')}` },
    { label: copy('Delivery marked complete', 'Entrega concluída'), complete: deal.status === 'delivered', detail: deal.saleDate ? formatDate(deal.saleDate) : copy('Not delivered', 'Ainda não entregue') },
  ]
  const checklistComplete = dealChecklist.filter(item => item.complete).length

  const isCash = deal.structureType !== 'finance' && deal.structureType !== 'lease'
  const worksheetSaved = deal.worksheetVersion > 0
  // Server math: a cash structure finances nothing, so the whole total is due at signing and the
  // down payment is a part of it, not a deduction. Finance: amount financed = total - down payment.
  const downPaymentLabel = pt ? (isCash ? 'Entrada (parte do valor na assinatura)' : 'Entrada planejada') : (isCash ? 'Down payment (part of amount due)' : 'Planned down payment')

  const dealTitle = deal.vehicle ? `${deal.vehicle.year} ${deal.vehicle.make} ${deal.vehicle.model}` : 'Deal'
  const customerName = deal.lead ? `${deal.lead.firstName} ${deal.lead.lastName}` : 'No customer'
  const statusLabel = labelForDeal(deal.status)
  const finance = deal.financeEvidence

  // The one next step a desk manager takes from pencil; it renders as the primary pill.
  const pencilNext = worksheetDirty || deal.worksheetVersion === 0
    ? 'save'
    : !deal.presentedAt
      ? 'present'
      : !deal.acceptedAt
        ? 'accept'
        : 'submit'

  const statusActions = (
    <Track aria-label={pt ? 'Ações da venda' : 'Deal actions'}>
      {deal.status === 'pencil' && (
        <>
          <Pill variant={pencilNext === 'save' ? 'primary' : 'raised'} onClick={saveWorksheetVersion} disabled={updating}>
            <Save />
            {pt ? 'Salvar versão da proposta' : 'Save worksheet version'}
          </Pill>
          {deal.worksheetVersion > 0 && !deal.presentedAt && <Pill variant={pencilNext === 'present' ? 'primary' : 'raised'} onClick={() => recordWorksheetDecision('present')} disabled={updating || worksheetDirty}>{pt ? 'Apresentar proposta' : 'Present structure'}</Pill>}
          {deal.presentedAt && !deal.acceptedAt && <Pill variant={pencilNext === 'accept' ? 'primary' : 'raised'} onClick={() => recordWorksheetDecision('accept')} disabled={updating || worksheetDirty}>{pt ? 'Registrar aceite' : 'Record acceptance'}</Pill>}
          {deal.acceptedAt && <Pill variant={pencilNext === 'submit' ? 'primary' : 'raised'} onClick={() => updateStatus('submitted', 'pending')} disabled={updating || worksheetDirty}>{pt ? 'Enviar para aprovação' : 'Submit for approval'}</Pill>}
        </>
      )}
      {deal.status === 'submitted' && (
        <>
          <Pill variant="primary" onClick={() => updateStatus('approved', 'approved')} disabled={updating}>
            <Check />
            {copy('Approve', 'Aprovar')}
          </Pill>
                <Pill variant="danger" onClick={() => updateStatus('cancelled', 'rejected')} disabled={updating}>
            <X />
            {copy('Reject', 'Recusar')}
          </Pill>
        </>
      )}
      {['submitted', 'approved'].includes(deal.status) && (
        <Pill onClick={reopenWorksheet} disabled={updating}>
          <Pencil />
          {copy('Reopen worksheet', 'Reabrir proposta')}
        </Pill>
      )}
      {deal.status === 'approved' && (
      <Pill asChild variant="primary">
          <Link href={`${basePath}/platform/finance`}>
            {copy('Open finance', 'Abrir financeiro')}
            <ArrowRight />
          </Link>
        </Pill>
      )}
      {deal.status === 'financed' && (
        <Pill asChild variant="primary">
          <Link href={`${basePath}/platform/delivery`}>
            {copy('Open delivery', 'Abrir entrega')}
            <ArrowRight />
          </Link>
        </Pill>
      )}
      {CANCELLABLE_STATUSES.includes(deal.status) && (
        <Pill onClick={openCancelDeal} disabled={updating}>
          <X />
          {copy('Cancel deal', 'Cancelar venda')}
        </Pill>
      )}
    </Track>
  )
  const hasStatusActions = ['pencil', 'submitted', 'approved', 'financed'].includes(deal.status)

  // The deal's stage said in words: where it is and what it is waiting on.
  const stageLineEn = deal.status === 'pencil'
    ? pencilNext === 'save'
      ? worksheetDirty && deal.worksheetVersion > 0 ? 'worksheet has unsaved changes' : 'worksheet not saved yet'
      : pencilNext === 'present'
        ? 'ready to present to the customer'
        : pencilNext === 'accept'
          ? 'presented, waiting on customer acceptance'
          : 'accepted, ready to submit to the desk'
    : deal.status === 'submitted'
      ? 'waiting on desk approval'
      : deal.status === 'approved'
        ? 'approved, waiting on F&I'
        : deal.status === 'financed'
          ? 'financed, waiting on delivery'
          : deal.status === 'delivered'
            ? deal.saleDate ? `delivered ${formatDate(deal.saleDate)}` : 'delivered'
            : deal.status === 'cancelled'
              ? 'closed as cancelled'
              : ''
  const stageLine = pt ? (deal.status === 'pencil'
    ? pencilNext === 'save'
      ? worksheetDirty && deal.worksheetVersion > 0 ? 'proposta com alterações não salvas' : 'proposta ainda não salva'
      : pencilNext === 'present'
        ? 'pronta para apresentar ao cliente'
        : pencilNext === 'accept'
          ? 'apresentada, aguardando aceite do cliente'
          : 'aceita, pronta para enviar à gerência'
    : deal.status === 'submitted' ? 'aguardando aprovação da gerência'
      : deal.status === 'approved' ? 'aprovada, aguardando análise financeira'
        : deal.status === 'financed' ? 'financiada, aguardando entrega'
          : deal.status === 'delivered' ? deal.saleDate ? `entregue em ${formatDate(deal.saleDate)}` : 'entregue'
            : deal.status === 'cancelled' ? 'encerrada como cancelada' : '') : stageLineEn

  const header = (
    <DeskHeader
      title={dealTitle}
      status={statusLabel}
      meta={
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <Status tone={toneForDeal(deal.status)}>{statusLabel}</Status>
          {stageLine && <span className="text-foreground">{stageLine}</span>}
          <span>· {customerName}</span>
          <span>· {deal.salesperson?.name || (pt ? 'Sem responsável' : 'Unassigned')}</span>
          {deal.vehicle && <Code>#{deal.vehicle.stockNumber}</Code>}
          <span>· {pt ? 'Aberta em' : 'Opened'} {formatDate(deal.createdAt)}</span>
        </span>
      }
      actions={hasStatusActions ? statusActions : undefined}
    />
  )

  const lineGroups = ([
    ['fees', 'Fees', 'feesCents', 1],
    ['products', 'Products', 'productsCents', 1],
    ['rebates', 'Rebates', 'rebatesCents', -1],
  ] as const)

  const offerTone = (offer: LenderOffer): DeskTone => (offer.selected && finance?.selectedOfferCurrent ? 'ok' : offer.selected ? 'warn' : offer.decision === 'approved' ? 'info' : 'idle')

  return (
    <PageContainer title={pt ? 'Venda' : dealTitle} header={header} breadcrumbs={breadcrumbs(pt ? 'Venda' : dealTitle)}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {(error || worksheetDirty || deal.form8300Required) && (
          <div className="space-y-2">
            {error && <Notice tone="bad">{error}</Notice>}
            {worksheetDirty && <Notice tone="warn" role="status">{pt ? 'Há alterações não salvas na proposta.' : 'Unsaved worksheet changes'}</Notice>}
            {deal.form8300Required && <Notice tone="warn" role="status">{pt ? 'Esta regra fiscal dos EUA (formulário 8300) está ativa para o pagamento em espécie informado.' : 'Cash over $10,000: IRS Form 8300 required'}</Notice>}
          </div>
        )}

        {savedPricing && (
          <FourSquare
            cells={[
              { label: pt ? 'Preço do veículo' : 'Vehicle price', value: formatCurrency(savedPricing.vehiclePriceCents / 100), sub: deal.vehicle ? `${deal.vehicle.condition === 'new' ? (pt ? 'Preço sugerido' : 'MSRP') : (pt ? 'Anunciado por' : 'Asking')} ${formatCurrency(deal.vehicle.price)}` : undefined },
              { label: locale === 'pt-BR' ? 'Veículo na troca' : 'Trade-in', value: formatUsdCredit(savedPricing.tradeInValueCents / 100, { currencyCode, locale }), sub: dealTradeIn ? tradeInName(dealTradeIn) : (locale === 'pt-BR' ? 'Sem veículo na troca' : 'No trade') },
              { label: pt ? (isCash ? 'Entrada (parte do valor devido)' : 'Entrada') : (isCash ? 'Down (part of amount due)' : 'Down payment'), value: formatCurrency(savedPricing.downPaymentCents / 100) },
              savedPricing.loanTerm > 0
                ? { label: pt ? 'Parcela mensal' : 'Payment', value: `${formatCurrency(savedPricing.monthlyPaymentCents / 100)}${pt ? '/mês' : '/mo'}`, sub: deal.structureType === 'lease' ? `${pt ? 'Arrendamento' : 'Lease'} · ${savedPricing.loanTerm} ${pt ? 'meses' : 'mo'}` : `${savedPricing.apr}% ${pt ? 'a.a.' : 'APR'} · ${savedPricing.loanTerm} ${pt ? 'meses' : 'mo'}` }
                : { label: pt ? 'Valor financiado' : 'Amount financed', value: formatCurrency(savedPricing.financingAmountCents / 100), sub: deal.structureType === 'cash' ? (pt ? 'À vista' : 'Cash') : undefined },
            ]}
            footer={
              <>
                <span className="flex items-baseline gap-2">
                  <span className="text-muted-foreground">{pt ? 'Preço total' : 'Total price'}</span>
                  <Figure size="sm">{formatCurrency(savedPricing.totalPriceCents / 100)}</Figure>
                  <span className="text-xs text-muted-foreground">{worksheetSaved ? `v${deal.worksheetVersion}` : (pt ? 'Não salva' : 'Not saved')}</span>
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="text-muted-foreground">{pt ? 'Valor na assinatura' : 'Due at signing'}</span>
                  <Figure size="sm">{formatCurrency(savedPricing.cashPayableCents / 100)}</Figure>
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="text-muted-foreground">{pt ? 'Resumo da venda' : 'Deal jacket'}</span>
                  <span className="tabular-nums text-foreground">{checklistComplete}/{dealChecklist.length}</span>
                  <span className="text-xs text-muted-foreground">{checklistComplete === dealChecklist.length ? (pt ? 'Concluída' : 'Ready') : (pt ? 'Incompleta' : 'Incomplete')}</span>
                </span>
              </>
            }
          />
        )}

        <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-8">
            <DeskSection
              title={pt ? 'Resumo financeiro da venda' : 'Deal jacket'}
              actions={<span className="text-[12px] text-muted-foreground">{worksheetSaved ? `${pt ? 'Salva' : 'Saved'} v${deal.worksheetVersion}` : (pt ? 'Não salva' : 'Unsaved')}</span>}
            >
              {savedPricing ? (
                <Panel className="overflow-hidden">
                  <dl className="divide-y divide-border/60">
                    <LedgerRow label={pt ? 'Preço do veículo' : 'Vehicle price'} value={formatCurrency(savedPricing.vehiclePriceCents / 100)} />
                    {lineGroups.map(([field, title, key, sign]) => (
                      <div key={field}>
                    <LedgerRow label={pt ? ({ Fees: 'Taxas', Products: 'Produtos e serviços', Rebates: 'Descontos' } as Record<string, string>)[title] : title} value={sign < 0 ? formatUsdCredit(savedPricing[key] / 100, { currencyCode, locale }) : formatCurrency(savedPricing[key] / 100)} />
                        {!worksheetDirty && deal[field].map((line, index) => (
                          <LedgerRow key={`${field}-${index}`} sub indent label={line.name || line.code} value={sign < 0 ? formatUsdCredit(lineCents(line) / 100, { currencyCode, locale }) : formatCurrency(lineCents(line) / 100)} />
                        ))}
                      </div>
                    ))}
                    <LedgerRow emphasis="subtotal" label={pt ? 'Subtotal antes de impostos e troca' : 'Subtotal before tax / trade'} value={formatCurrency(savedPricing.subtotalCents / 100)} />
                    <div>
                      <LedgerRow label={pt ? 'Impostos' : 'Tax'} value={formatCurrency(savedPricing.taxAmountCents / 100)} />
                      {!worksheetDirty && deal.taxLines.map((line, index) => (
                        <LedgerRow key={`tax-${index}`} sub indent label={line.name || line.code} value={formatCurrency(lineCents(line) / 100)} />
                      ))}
                    </div>
                    <LedgerRow label={locale === 'pt-BR' ? 'Crédito do veículo na troca' : 'Trade-in credit'} value={formatUsdCredit(savedPricing.tradeInValueCents / 100, { currencyCode, locale })} />
                    <LedgerRow emphasis="total" label={pt ? 'Preço total' : 'Total price'} value={formatCurrency(savedPricing.totalPriceCents / 100)} />
                    {isCash ? (
                      <LedgerRow sub indent label={downPaymentLabel} value={formatCurrency(savedPricing.downPaymentCents / 100)} />
                    ) : (
                      <>
                        <LedgerRow label={downPaymentLabel} value={formatCurrency(savedPricing.downPaymentCents / 100)} />
                        <LedgerRow label={pt ? 'Valor financiado' : 'Amount financed'} value={formatCurrency(savedPricing.financingAmountCents / 100)} />
                      </>
                    )}
                    <LedgerRow emphasis="subtotal" label={pt ? 'Valor a pagar na assinatura' : 'Cash payable · due at signing'} value={formatCurrency(savedPricing.cashPayableCents / 100)} />
                  </dl>
                  {(savedPricing.loanTerm > 0 || deal.saleDate) && (
                    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t bg-muted/40 px-4 py-3">
                      {savedPricing.loanTerm > 0 && (
                        <>
                          <span className="text-xs text-muted-foreground">{pt ? (deal.structureType === 'lease' ? `Arrendamento · valor residual ${formatCurrency((deal.residualValueCents || 0) / 100)} · fator ${moneyFactorFromBps(deal.moneyFactorBasisPoints).toFixed(5)}` : `${savedPricing.apr}% a.a.`) : (deal.structureType === 'lease' ? `Lease · residual ${formatCurrency((deal.residualValueCents || 0) / 100)} · money factor ${moneyFactorFromBps(deal.moneyFactorBasisPoints).toFixed(5)}` : `${savedPricing.apr}% APR`)} · {savedPricing.loanTerm} {pt ? 'meses' : 'months'} · {pt ? 'parcela estimada' : 'estimated payment'}</span>
                          <Figure>{formatCurrency(savedPricing.monthlyPaymentCents / 100)}{pt ? '/mês' : '/mo'}</Figure>
                        </>
                      )}
                      {deal.saleDate && <span className="w-full text-xs text-muted-foreground">{pt ? 'Venda concluída em' : 'Sale completed'} {formatDate(deal.saleDate)}</span>}
                    </div>
                  )}
                </Panel>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">{pt ? 'Nenhuma proposta salva' : 'No saved worksheet'}</p>
              )}
            </DeskSection>

            {deal.status === 'pencil' && (
              <DeskSection title={pt ? 'Condições da proposta' : 'Worksheet terms'}>
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <p className={fieldLabel}>{pt ? 'Estrutura' : 'Structure'}</p>
                    <Segmented
                      label={pt ? 'Estrutura da venda' : 'Deal structure'}
                      size="sm"
                      value={deal.structureType === 'finance' || deal.structureType === 'lease' ? deal.structureType : 'cash'}
                      onChange={(structureType) => editWorksheet({
                        structureType,
                        ...(structureType === 'cash' ? { loanTerm: 0, apr: 0, financingAmount: 0, monthlyPayment: 0, residualValueCents: null, moneyFactorBasisPoints: null } : {}),
                        ...(structureType === 'finance' ? { residualValueCents: null, moneyFactorBasisPoints: null } : {}),
                        ...(structureType === 'lease' ? { apr: 0, residualValueCents: deal.residualValueCents ?? 0, moneyFactorBasisPoints: deal.moneyFactorBasisPoints ?? 0 } : {}),
                      })}
                      options={[{ value: 'cash', label: pt ? 'À vista' : 'Cash', disabled: updating }, { value: 'finance', label: pt ? 'Financiamento' : 'Finance', disabled: updating }, { value: 'lease', label: pt ? 'Arrendamento' : 'Lease', disabled: updating }]}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {([
                      [pt ? 'Preço negociado do veículo' : 'Negotiated vehicle price', 'vehiclePrice'],
                      [pt ? 'Crédito do veículo na troca' : 'Trade-in credit', 'tradeInValue'],
                      [pt ? (isCash ? 'Entrada (parte do valor devido)' : 'Entrada') : (isCash ? 'Down payment (part of amount due)' : 'Down payment'), 'downPayment'],
                    ] as const).map(([label, field]) => (
                      <label key={field} className="grid min-w-0 gap-1.5">
                        <span className={fieldLabel}>{label}</span>
                        <MoneyInput disabled={updating} aria-label={label} className="h-10 text-[13px]" cents={Math.round(Number(deal[field] || 0) * 100)} onCentsChange={(cents) => editWorksheet({ [field]: cents / 100 })} />
                      </label>
                    ))}
                    {deal.structureType === 'finance' && (
                      <>
                        <label className="grid min-w-0 gap-1.5"><span className={fieldLabel}>{pt ? 'Taxa de juros anual (%)' : 'APR (%)'}</span><Input disabled={updating} aria-label={pt ? 'Taxa de juros anual' : 'APR percentage'} className={inputClass} type="number" min="0" max="100" step="0.01" value={deal.apr || 0} onChange={(event) => editWorksheet({ apr: Number(event.target.value) })} /></label>
                        <label className="grid min-w-0 gap-1.5"><span className={fieldLabel}>{pt ? 'Prazo (meses)' : 'Term (months)'}</span><Input disabled={updating} aria-label={pt ? 'Prazo em meses' : 'Term in months'} className={inputClass} type="number" min="1" max="120" step="1" value={deal.loanTerm || 0} onChange={(event) => editWorksheet({ loanTerm: Number(event.target.value) })} /></label>
                      </>
                    )}
                    {deal.structureType === 'lease' && (
                      <>
                        <label className="grid min-w-0 gap-1.5"><span className={fieldLabel}>{pt ? 'Prazo (meses)' : 'Term (months)'}</span><Input disabled={updating} aria-label={pt ? 'Prazo do arrendamento em meses' : 'Lease term in months'} className={inputClass} type="number" min="1" max="120" step="1" value={deal.loanTerm || 0} onChange={(event) => editWorksheet({ loanTerm: Number(event.target.value) })} /></label>
                        <label className="grid min-w-0 gap-1.5"><span className={fieldLabel}>{pt ? 'Valor residual' : 'Residual value'}</span><MoneyInput disabled={updating} aria-label={pt ? 'Valor residual' : 'Residual value'} className="h-10 text-[13px]" cents={deal.residualValueCents || 0} onCentsChange={(cents) => editWorksheet({ residualValueCents: cents })} /></label>
                        <label className="grid min-w-0 gap-1.5">
                          <span className={fieldLabel}>{pt ? 'Taxa anual equivalente (%)' : 'Lease rate (APR %)'}</span>
                          <Input disabled={updating} aria-label={pt ? 'Taxa anual equivalente' : 'Lease rate as APR percentage'} aria-describedby="lease-money-factor" className={inputClass} type="number" min="0" max="100" step="0.01" value={(deal.moneyFactorBasisPoints || 0) / 100} onChange={(event) => editWorksheet({ moneyFactorBasisPoints: Math.max(0, Math.round(Number(event.target.value) * 100)) })} />
                          <span id="lease-money-factor" className="text-xs tabular-nums text-muted-foreground">{pt ? 'Fator de arrendamento' : 'Money factor'} {moneyFactorFromBps(deal.moneyFactorBasisPoints).toFixed(5)}</span>
                        </label>
                        <label className="grid min-w-0 gap-1.5">
                          <span className={fieldLabel}>{pt ? 'Parcela mensal' : 'Monthly payment'}</span>
                          <MoneyInput disabled={updating} aria-label={pt ? 'Parcela mensal do arrendamento' : 'Lease monthly payment'} className="h-10 text-[13px]" cents={Math.round(Number(deal.monthlyPayment || 0) * 100)} onCentsChange={(cents) => editWorksheet({ monthlyPayment: cents / 100 })} />
                        </label>
                        <div className="flex items-end">
                          <Track>
                            <Pill
                              size="sm"
                              disabled={updating || !deal.loanTerm}
                              onClick={() => {
                                try {
                                  const lines = { fees: deal.fees, rebates: deal.rebates, products: deal.products, taxLines: deal.taxLines }
                                  const price = calculateDealPrice({ vehiclePriceCents: Math.round(deal.vehiclePrice * 100), tradeInValueCents: Math.round(deal.tradeInValue * 100), downPaymentCents: Math.round(deal.downPayment * 100), ...lines, taxAmountCents: sumMoneyLines(deal.taxLines) })
                                  editWorksheet({ monthlyPayment: leasePaymentCents(Math.max(0, price.balanceCents), deal.residualValueCents || 0, deal.loanTerm, deal.moneyFactorBasisPoints || 0) / 100 })
                                } catch {
                                  setError(pt ? 'Confira os valores da venda' : 'Check the worksheet amounts')
                                }
                              }}
                            >
                              <Calculator />
                              {pt ? 'Calcular parcela' : 'Calculate payment'}
                            </Pill>
                          </Track>
                        </div>
                      </>
                    )}
                  </div>
                  <Panel className="space-y-3 p-3">
                    {([['fees', 'Fees', 'fee'], ['products', 'Products', 'product'], ['rebates', 'Rebates', 'rebate'], ['taxLines', 'Tax', 'tax']] as const).map(([field, title, category]) => <WorksheetLines key={field} title={title} category={category} lines={deal[field]} disabled={updating} showErrors={showLineErrors} onChange={lines => editWorksheet({ [field]: lines })} />)}
                  </Panel>
                  <Track>
                    <Pill variant={worksheetDirty ? 'primary' : 'raised'} onClick={saveWorksheetVersion} disabled={updating}>
                      <Save />
                      {pt ? 'Salvar versão da proposta' : 'Save worksheet version'}
                    </Pill>
                  </Track>
                </div>
              </DeskSection>
            )}

            {deal.structureType !== 'cash' && (
              <DeskSection title={worksheetSaved ? (pt ? `Propostas de financeiras · versão ${deal.worksheetVersion}` : `Lender offers · worksheet ${deal.worksheetVersion}`) : (pt ? 'Propostas de financeiras · proposta não salva' : 'Lender offers · unsaved worksheet')} count={lenderOffers.length}>
                <div className="space-y-3">
                  {!finance?.selectedOfferCurrent && <Notice tone="warn" role="status">{finance?.issue || (pt ? 'Selecione ou confirme novamente uma proposta para esta versão salva.' : 'Select or reconfirm an offer for this saved worksheet.')}</Notice>}
                  {lenderOffers.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">{pt ? 'Nenhuma decisão aprovada ou condicional da financeira' : 'No approved or conditional lender decisions'}</p>
                  ) : (
                    <Panel className="divide-y">
                      {lenderOffers.map(offer => (
                        <div key={offer.id} className="flex min-w-0 flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <TitleLine as="p" tone={offerTone(offer)} status={offer.decision} className="text-sm font-medium">
                              {offer.providerKey}
                            </TitleLine>
                            <p className="pl-4 text-xs capitalize text-muted-foreground">{offer.decision}{offer.selected ? ' · selected' : ''}</p>
                          </div>
                          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:justify-end">
                            <dl className="grid grid-cols-3 gap-x-4 text-right text-[13px] tabular-nums">
                              <div><dt className="text-[12px] text-muted-foreground">{pt ? 'Valor aprovado' : 'Amount'}</dt><dd>{formatCurrency((offer.approvedAmountCents || 0) / 100)}</dd></div>
                              <div><dt className="text-[12px] text-muted-foreground">{pt ? 'Taxa · prazo' : 'APR · term'}</dt><dd>{((offer.aprBasisPoints || 0) / 100).toFixed(2)}% · {offer.termMonths || '-'} {pt ? 'meses' : 'mo'}</dd></div>
                              <div><dt className="text-[12px] text-muted-foreground">{pt ? 'Parcela' : 'Payment'}</dt><dd>{formatCurrency((offer.monthlyPaymentCents || 0) / 100)}{pt ? '/mês' : '/mo'}</dd></div>
                            </dl>
                            <Track>
                              <Pill size="sm" variant={offer.selected ? 'primary' : 'raised'} disabled={updating || worksheetDirty || (offer.selected && Boolean(finance?.selectedOfferCurrent)) || deal.status !== 'pencil'} onClick={() => selectLenderOffer(offer.id)}>
                                {offer.selected && finance?.selectedOfferCurrent ? (pt ? 'Selecionada' : 'Current selection') : offer.selected ? (pt ? 'Confirmar novamente' : 'Reconfirm offer') : (pt ? 'Selecionar proposta' : 'Select offer')}
                              </Pill>
                            </Track>
                          </div>
                        </div>
                      ))}
                    </Panel>
                  )}
                </div>
              </DeskSection>
            )}

            <DeskSection
              title={pt ? 'Lista de conferência' : 'Checklist'}
              actions={
                <span className="flex items-center gap-2">
                  <Meter value={checklistComplete / dealChecklist.length} segments={dealChecklist.length} tone={checklistComplete === dealChecklist.length ? 'ok' : 'warn'} label={pt ? 'Progresso da lista de conferência da venda' : 'Deal jacket checklist progress'} />
                  <span className="text-xs tabular-nums text-muted-foreground">{checklistComplete}/{dealChecklist.length} {pt ? 'concluídos' : 'ready'}</span>
                </span>
              }
            >
              <div className="space-y-3">
                <Panel className="divide-y">
                  {dealChecklist.map(item => (
                    <div key={item.label} className="flex min-w-0 items-start justify-between gap-4 px-4 py-2.5">
                      <div className="min-w-0">
                        <TitleLine as="p" tone={item.complete ? 'ok' : 'warn'} status={item.complete ? (pt ? 'Concluído' : 'Complete') : (pt ? 'Em aberto' : 'Open')} className="text-sm font-medium">
                          {item.label}
                        </TitleLine>
                        <p className="break-words pl-4 text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                      <span className="shrink-0 text-[12px] text-muted-foreground">{item.complete ? (pt ? 'Feito' : 'Done') : (pt ? 'Em aberto' : 'Open')}</span>
                    </div>
                  ))}
                </Panel>
                {deal.status !== 'delivered' && checklistComplete < dealChecklist.length && <Notice tone="warn" role="status">{pt ? 'Lista de conferência da venda incompleta' : 'Incomplete deal jacket'}</Notice>}
              </div>
            </DeskSection>
          </div>

          <aside className="min-w-0 space-y-8 lg:sticky lg:top-6 lg:self-start">
            <DeskSection
              title={pt ? 'Cliente' : 'Customer'}
              actions={deal.lead ? <Link href={`${basePath}/platform/crm/${deal.lead.id}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">{pt ? 'Abrir cadastro do cliente' : 'Open customer record'}</Link> : undefined}
            >
              {deal.lead ? (
                <Facts items={[
                  { label: pt ? 'Nome' : 'Name', value: `${deal.lead.firstName} ${deal.lead.lastName}` },
                  { label: pt ? 'Vendedor' : 'Sales rep', value: deal.salesperson?.name || (pt ? 'Sem responsável' : 'Unassigned') },
                ]} />
              ) : (
                <p className="py-2 text-sm text-muted-foreground">{pt ? 'Nenhum cliente vinculado' : 'No customer attached'}</p>
              )}
            </DeskSection>

            <DeskSection
              title={pt ? 'Veículo' : 'Vehicle'}
              actions={<Link href={`${basePath}/platform/vehicles`} className="text-xs font-medium text-muted-foreground hover:text-foreground">{pt ? 'Ver estoque' : 'See inventory'}</Link>}
            >
              {deal.vehicle ? (
                <Facts items={[
                  { label: pt ? 'Veículo' : 'Vehicle', value: `${deal.vehicle.year} ${deal.vehicle.make} ${deal.vehicle.model}` },
                  deal.vehicle.trim ? { label: pt ? 'Versão' : 'Trim', value: deal.vehicle.trim } : null,
                  { label: pt ? 'Cód. estoque' : 'Stock #', value: <Code className="text-foreground">{deal.vehicle.stockNumber}</Code> },
                  { label: pt ? 'Chassi' : 'VIN', value: <Code className="break-all text-foreground">{deal.vehicle.vin}</Code> },
                  { label: pt ? 'Cor' : 'Color', value: deal.vehicle.exteriorColor || '-' },
                  { label: deal.vehicle.condition === 'new' ? (pt ? 'Preço sugerido' : 'MSRP') : (pt ? 'Preço' : 'Price'), value: formatCurrency(deal.vehicle.price), mono: true },
                ]} />
              ) : (
                <p className="py-2 text-sm text-muted-foreground">{pt ? 'Nenhum veículo vinculado' : 'No vehicle attached'}</p>
              )}
            </DeskSection>

            <DeskSection
              title={pt ? 'Troca e entrada' : 'Trade and down'}
              actions={dealTradeIn ? <Link href={`${basePath}/platform/trade-ins/${dealTradeIn.id}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">{pt ? 'Abrir avaliação' : 'Open trade-in'}</Link> : undefined}
            >
              <div className="space-y-3">
                {dealTradeIn ? (
                  <TitleLine as="p" tone="ok" status={pt ? 'Veículo na troca vinculado' : 'Trade-in attached'} className="text-sm font-medium">
                    {tradeInName(dealTradeIn)}
                    <span className="font-normal text-muted-foreground"> · {pt ? 'oferta' : 'offer'} {formatCurrency((dealTradeIn.offerAmountCents || 0) / 100)}</span>
                  </TitleLine>
                ) : (
                  <p className="text-sm text-muted-foreground">{pt ? 'Nenhuma avaliação de troca' : 'No trade-in record'}</p>
                )}
                {savedPricing ? (
                  <Facts items={[
                    { label: pt ? 'Crédito do veículo na troca' : 'Trade-in credit', value: formatCurrency(savedPricing.tradeInValueCents / 100), mono: true },
                    { label: downPaymentLabel, value: formatCurrency(savedPricing.downPaymentCents / 100), mono: true },
                    { label: pt ? 'Forma de pagamento' : 'Structure', value: <span className="capitalize">{deal.structureType === 'cash' && pt ? 'à vista' : deal.structureType || 'cash'}</span> },
                  ]} />
                ) : (
                  <p className="py-2 text-sm text-muted-foreground">{pt ? 'Nenhuma proposta salva' : 'No saved worksheet'}</p>
                )}
                {deal.status === 'pencil' && (
                  <div className="space-y-1">
                    <Track>
                      {dealTradeIn ? (
                        <Pill size="sm" onClick={() => openTradeInDialog('detach')} disabled={updating || worksheetDirty} aria-describedby={worksheetDirty ? 'deal-trade-in-blocked' : undefined}>
                          <Unlink />
                          {pt ? 'Desvincular veículo na troca' : 'Detach trade-in'}
                        </Pill>
                      ) : (
                        <Pill size="sm" onClick={() => openTradeInDialog('attach')} disabled={updating || worksheetDirty} aria-describedby={worksheetDirty ? 'deal-trade-in-blocked' : undefined}>
                          <Link2 />
                          {pt ? 'Vincular veículo na troca' : 'Attach trade-in'}
                        </Pill>
                      )}
                    </Track>
                    {worksheetDirty && <p id="deal-trade-in-blocked" className="text-xs text-muted-foreground">{pt ? 'Salve a proposta primeiro' : 'Save the worksheet first'}</p>}
                  </div>
                )}
              </div>
            </DeskSection>

            <DeskSection
              title={pt ? 'Produtos e serviços financeiros' : 'F&I'}
              actions={<Link href={`${basePath}/platform/finance`} className="text-xs font-medium text-muted-foreground hover:text-foreground">{pt ? 'Abrir financeiro' : 'Open finance'}</Link>}
            >
              <div className="space-y-3">
                <div className="min-w-0 rounded-md border bg-card text-[13px]">
                  <div className="flex items-baseline justify-between gap-3 border-b px-3 py-2">
                    <span className="font-medium text-foreground">{pt ? 'Produtos contratados' : 'Menu'}</span>
                    <span className="text-xs text-muted-foreground">{deal.products.length} {pt ? (deal.products.length === 1 ? 'produto' : 'produtos') : (deal.products.length === 1 ? 'product' : 'products')}</span>
                  </div>
                  {deal.products.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">{pt ? 'Nenhum produto financeiro nesta proposta' : 'No F&I products on the worksheet'}</p>
                  ) : (
                    <ul className="divide-y">
                      {deal.products.map((line, index) => (
                        <li key={`menu-${index}`} className="flex min-w-0 items-baseline justify-between gap-3 px-3 py-1.5">
                          <span className="min-w-0 truncate text-foreground">{line.name || line.code}</span>
                          <span className="shrink-0 tabular-nums text-foreground">{formatCurrency(lineCents(line) / 100)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {savedPricing && (
                    <div className="flex items-baseline justify-between gap-3 border-t bg-muted/40 px-3 py-2">
                      <span className="text-muted-foreground">{pt ? `Total de produtos${worksheetDirty ? ' (salvos)' : ''}` : `Products total${worksheetDirty ? ' (saved)' : ''}`}</span>
                      <Figure size="sm">{formatCurrency(savedPricing.productsCents / 100)}</Figure>
                    </div>
                  )}
                </div>
                <Facts items={[
                  { label: pt ? 'Documentos financeiros' : 'F&I documents', value: <Status tone={finance?.prerequisites?.current ? 'ok' : 'warn'}>{finance?.prerequisites?.current ? (pt ? 'Em dia' : 'Current') : (pt ? 'Revisão necessária' : 'Review required')}</Status> },
                  { label: pt ? 'Liberação do crédito' : 'Funding', value: <Status tone={finance?.fundingCurrent ? 'ok' : 'warn'}>{finance?.fundingCurrent ? (pt ? 'Em dia' : 'Current') : (pt ? 'Confirmação necessária' : 'Reconfirmation required')}</Status> },
                  finance?.fundingStatus ? { label: pt ? 'Situação da liberação' : 'Funding status', value: <span className="capitalize">{finance.fundingStatus}</span> } : null,
                  finance?.fundingReference ? { label: pt ? 'Protocolo da liberação' : 'Funding reference', value: finance.fundingReference, mono: true } : null,
                  { label: pt ? 'Versão da proposta liberada' : 'Funded worksheet', value: finance?.fundingWorksheetVersion ? `v${finance.fundingWorksheetVersion}` : (pt ? 'Nenhuma' : 'None') },
                ]} />
                {finance?.prerequisites?.issue && <p className="break-words text-xs text-muted-foreground">{finance.prerequisites.issue}</p>}
              </div>
            </DeskSection>
          </aside>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-8 border-t pt-8 lg:grid-cols-2">
          <div className="min-w-0 space-y-8">
            {deal.approvals && deal.approvals.length > 0 && (
              <DeskSection title={pt ? 'Histórico de aprovações' : 'Approval history'} count={deal.approvals.length}>
                <Panel className="divide-y">
                  {deal.approvals.map(approval => (
                    <div key={approval.id} className="min-w-0 px-4 py-3">
                      <TitleLine as="p" tone={approval.decision === 'approved' ? 'ok' : 'bad'} className="text-sm font-medium capitalize">
                        {pt ? ({ approved: 'Aprovada', rejected: 'Reprovada', pending: 'Pendente' } as Record<string, string>)[approval.decision] || approval.decision : approval.decision}
                      </TitleLine>
                      <p className="pl-4 text-xs text-muted-foreground">
                        {approval.approver?.name || (pt ? 'Não identificado' : 'Unknown')} · {formatDate(approval.approvalDate)}
                      </p>
                      {approval.notes && <p className="mt-1 break-words pl-4 text-sm">{approval.notes}</p>}
                    </div>
                  ))}
                </Panel>
              </DeskSection>
            )}

            <DeskSection title={pt ? 'Versões da proposta' : 'Worksheet versions'} count={worksheetHistory.length}>
              {worksheetHistory.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{pt ? 'Nenhum histórico da proposta' : 'No worksheet history'}</p>
              ) : (
                <Panel className="divide-y">
                  {worksheetHistory.map(entry => (
                    <details key={entry.id} className="min-w-0 text-sm">
                      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-4 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                        <span className="font-medium">{pt ? 'Versão' : 'Version'} {entry.snapshot?.terms?.worksheetVersion}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">{formatDate(entry.occurredAt)}</span>
                      </summary>
                      <pre className="mx-4 mb-3 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-[4px] bg-muted/50 p-2 font-mono text-xs text-muted-foreground">{JSON.stringify(entry.snapshot, null, 2)}</pre>
                    </details>
                  ))}
                </Panel>
              )}
            </DeskSection>
          </div>
          <DeskSection title={pt ? 'Histórico da venda' : 'Deal history'}>
            <FinanceEvidenceHistory dealId={deal.id} aggregateType="Deal" label={pt ? 'Histórico da venda' : 'Deal history'} />
          </DeskSection>
        </div>

        <OperatorActionDialog
          open={acceptanceDialogOpen}
          title={pt ? 'Registrar aceite do cliente' : 'Record customer acceptance'}
          description={pt ? 'Registre como o cliente aceitou a proposta apresentada.' : 'Record how the customer accepted the presented worksheet.'}
          fields={[{ name: 'acknowledgment', label: pt ? 'Forma de aceite ou referência' : 'Acceptance method or reference', required: true, maxLength: 1000, placeholder: pt ? 'Ex.: aceite verbal presencial ou referência do documento assinado' : 'For example: in-person verbal acknowledgment or signed document reference' }]}
          values={acceptanceValues}
          error={acceptanceError}
          busy={updating}
          submitLabel={pt ? 'Registrar aceite' : 'Record acceptance'}
          onValuesChange={values => setAcceptanceValues({ acknowledgment: values.acknowledgment || '' })}
          onSubmit={submitWorksheetAcceptance}
          onOpenChange={handleAcceptanceDialogOpenChange}
        />
        <OperatorActionDialog
          open={Boolean(approvalIntent)}
          title={approvalIntent?.title || 'Update deal'}
          fields={[{ name: 'notes', label: pt ? 'Observações para aprovação (opcional)' : 'Approval notes (optional)', type: 'textarea', required: false, placeholder: pt ? 'Observações opcionais para o cadastro da venda' : 'Optional notes for the deal record' }]}
          values={{ notes: approvalIntent?.notes || '' }}
          error={approvalError}
          busy={updating}
          submitLabel={approvalIntent?.submitLabel || (pt ? 'Confirmar alteração' : 'Confirm transition')}
          onValuesChange={values => setApprovalIntent(current => current ? { ...current, notes: values.notes || '' } : current)}
          onSubmit={submitApprovalNotes}
          onOpenChange={handleApprovalNotesOpenChange}
        />
        <OperatorActionDialog
          open={reopenDialogOpen}
          title={pt ? 'Reabrir proposta' : 'Reopen worksheet'}
          description={pt ? 'A venda volta para rascunho e a escolha de financeira será removida.' : 'The deal returns to pencil and its lender selection is cleared.'}
          fields={[{ name: 'reason', label: pt ? 'Motivo da reabertura' : 'Reopen reason', required: true, maxLength: 1000, placeholder: pt ? 'Por que esta proposta precisa ser reaberta?' : 'Why does this worksheet need to be reopened?' }]}
          values={reopenValues}
          error={reopenError}
          busy={updating}
          submitLabel={pt ? 'Reabrir proposta' : 'Reopen worksheet'}
          onValuesChange={values => setReopenValues({ reason: values.reason || '' })}
          onSubmit={submitReopenWorksheet}
          onOpenChange={handleReopenDialogOpenChange}
        />
        <OperatorActionDialog
          open={cancelDialogOpen}
          title={pt ? 'Cancelar venda' : 'Cancel deal'}
          description={deal.status === 'pencil' ? (pt ? 'A venda será encerrada como cancelada.' : 'The deal is closed as cancelled.') : (pt ? 'A venda será cancelada, o veículo voltará a ficar disponível e qualquer entrega em aberto será cancelada.' : 'The deal is closed as cancelled, the vehicle is released and any open delivery is cancelled.')}
          fields={[{ name: 'reason', label: pt ? 'Motivo do cancelamento' : 'Cancellation reason', type: 'textarea', required: true, maxLength: 1000 }]}
          values={cancelValues}
          error={cancelError}
          busy={updating}
          submitLabel={pt ? 'Cancelar venda' : 'Cancel deal'}
          onValuesChange={values => setCancelValues({ reason: values.reason || '' })}
          onSubmit={submitCancelDeal}
          onOpenChange={open => {
            setCancelDialogOpen(open)
            if (!open) setCancelError(null)
          }}
        />
        <OperatorActionDialog
          open={tradeInDialog !== null}
          title={tradeInDialog === 'attach' ? 'Attach trade-in' : 'Detach trade-in'}
          description={tradeInDialog === 'attach' ? 'The appraisal offer becomes the trade credit; tax and payment are repriced.' : 'Trade credit returns to $0; tax and payment are repriced.'}
          fields={tradeInDialog === 'attach'
            ? [
                {
                  name: 'tradeInId',
                  label: 'Trade-in',
                  type: 'select',
                  placeholder: tradeInOptions === null ? 'Loading trade-ins' : tradeInOptions.length === 0 ? 'No available trade-ins' : 'Select trade-in',
                  options: (tradeInOptions || []).filter(option => option.offerAmountCents != null).map(option => ({ value: option.id, label: `${tradeInName(option)} · ${formatCurrency((option.offerAmountCents || 0) / 100)}` })),
                },
                { name: 'reason', label: 'Note (optional)', type: 'textarea', required: false, maxLength: 500 },
              ]
            : [{ name: 'reason', label: 'Reason', type: 'textarea', required: true, maxLength: 500 }]}
          values={tradeInValues}
          error={tradeInError}
          busy={updating}
          submitLabel={tradeInDialog === 'attach' ? 'Attach' : 'Detach'}
          onValuesChange={values => setTradeInValues({ tradeInId: values.tradeInId || '', reason: values.reason || '' })}
          onSubmit={submitTradeIn}
          onOpenChange={open => {
            if (open) return
            setTradeInDialog(null)
            setTradeInError(null)
          }}
        />
      </div>
    </PageContainer>
  )
}
