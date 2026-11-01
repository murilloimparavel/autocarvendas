'use client'

import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, Link2, Pencil, RefreshCw, Truck, Unlink } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { Attention, Code, DeskHeader, DeskSection, Facts, Figure, Notice, Panel, Pill, Status, TitleLine, Track } from '@/features/platform/components/desk'
import { formatPhone } from '@/features/platform/lib/format'
import { MoneyInput } from '@/features/platform/deals/components/MoneyInput'
import { labelForDeal, toneForDeal } from '@/features/platform/deals/lib/dealStatus'
import {
  acquireTradeIn,
  getPencilDealsForTradeIn,
  getTradeIn,
  recordTradeInAppraisal,
  setDealTradeIn,
  updateTradeInDetails,
  type PencilDealOption,
  type TradeIn,
  type TradeInAcquisition,
  type TradeInTimelineEntry,
} from '../actions'
import { TradeInFormDialog, tradeInDetailsPayload, type TradeInFormValues } from '../components/TradeInFormDialog'
import {
  conditionLabel,
  conditionNotes,
  conditionTone,
  formatMileage,
  formatWholeUsd,
  preliminaryWholesaleEstimate,
  tradeInCustomer,
  tradeInState,
  tradeInReference,
  tradeInVehicleLabel,
  VIN_PATTERN,
} from '../lib/tradeInState'

type DetailData = { tradeIn: TradeIn | null; acquisition: TradeInAcquisition | null; canSeeAcquisitions: boolean; timeline: TradeInTimelineEntry[] }
type DialogKind = 'edit' | 'appraise' | 'attach' | 'detach' | 'acquire' | null

const fieldLabel = 'text-[12px] font-medium text-muted-foreground'

const timelineLabel: Record<string, string> = {
  created: 'Created',
  submitted: 'Submitted online',
  appraised: 'Appraised',
  'attached-to-deal': 'Attached to deal',
  'detached-from-deal': 'Detached from deal',
  'released-from-deal': 'Released by cancelled deal',
}

function FieldRow({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string | null; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1.5 text-sm">
      <label htmlFor={htmlFor} className={fieldLabel}>{label}</label>
      {children}
      {error && <p id={`${htmlFor}-error`} className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

function ActionDialog({ open, title, description, busy, error, submitLabel, onSubmit, onOpenChange, children }: {
  open: boolean
  title: string
  description?: string
  busy: boolean
  error: string | null
  submitLabel: string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value) }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {children}
          {error && <Notice tone="bad">{error}</Notice>}
          <DialogFooter className="sm:justify-end">
            <Track>
              <Pill variant="plain" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Pill>
              <Pill type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</Pill>
            </Track>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function dealLabel(deal: { vehicle: { year: number | null; make: string | null; model: string | null; stockNumber?: string | null } | null }) {
  return deal.vehicle ? [deal.vehicle.year, deal.vehicle.make, deal.vehicle.model].filter(Boolean).join(' ') : 'Deal'
}

export function TradeInDetailPageClient({
  id,
  initialData,
  initialError,
  timeZone,
}: {
  id: string
  initialData: DetailData | null
  initialError: string | null
  timeZone: string
}) {
  const [data, setData] = useState<DetailData | null>(initialData)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const commandKeyRef = useRef('')

  // Appraisal
  const [referenceCents, setReferenceCents] = useState(0)
  const [offerCents, setOfferCents] = useState(0)
  // Attach / detach
  const [pencilDeals, setPencilDeals] = useState<PencilDealOption[] | null>(null)
  const [dealId, setDealId] = useState('')
  const [reason, setReason] = useState('')
  // Acquire
  const [acquire, setAcquire] = useState({ vin: '', year: '', make: '', model: '', odometer: '', appraisalCents: 0, reconEstimateCents: 0, reason: '' })

  const tradeIn = data?.tradeIn ?? null
  const acquisition = data?.acquisition ?? null

  const load = async () => {
    setLoading(true)
    const response = await getTradeIn(id)
    if (response.success) {
      setData(response.data)
      setError(null)
    } else {
      setError(response.error || 'Unable to load the trade-in.')
    }
    setLoading(false)
  }

  const openDialog = async (kind: Exclude<DialogKind, null>) => {
    if (!tradeIn) return
    setDialogError(null)
    setShowErrors(false)
    setNotice(null)
    commandKeyRef.current = `trade-in:${kind}:${tradeIn.id}:${crypto.randomUUID()}`
    if (kind === 'appraise') {
      setReferenceCents(Math.round((tradeIn.referenceValue || 0) * 100))
      setOfferCents(Math.round((tradeIn.offerAmount || 0) * 100))
    }
    if (kind === 'attach' || kind === 'detach') {
      setDealId('')
      setReason('')
    }
    if (kind === 'acquire') {
      setAcquire({
        vin: tradeIn.vin || '',
        year: tradeIn.year || '',
        make: tradeIn.make || '',
        model: tradeIn.model || '',
        odometer: tradeIn.mileage == null ? '' : String(tradeIn.mileage),
        appraisalCents: Math.round((tradeIn.offerAmount || 0) * 100),
        reconEstimateCents: 0,
        reason: '',
      })
    }
    setDialog(kind)
    if (kind === 'attach') {
      setPencilDeals(null)
      const response = await getPencilDealsForTradeIn()
      if (response.success) setPencilDeals(response.data.deals || [])
      else {
        setPencilDeals([])
        setDialogError(response.error || 'Unable to load pencil deals.')
      }
    }
  }

  const closeDialog = (open: boolean) => {
    if (open) return
    setDialog(null)
    setDialogError(null)
  }

  const finish = async (message: string) => {
    setDialog(null)
    setNotice(message)
    await load()
  }

  const submitEdit = async (values: TradeInFormValues) => {
    if (!tradeIn) return
    setBusy(true)
    setDialogError(null)
    const response = await updateTradeInDetails(tradeIn.id, tradeInDetailsPayload(values))
    setBusy(false)
    if (!response.success) return setDialogError(response.error || 'Unable to save the trade-in.')
    await finish('Trade-in updated')
  }

  const offerError = offerCents <= 0 ? 'Enter the offer' : null

  const submitAppraisal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!tradeIn) return
    setShowErrors(true)
    if (offerError) return
    setBusy(true)
    setDialogError(null)
    const response = await recordTradeInAppraisal({ id: tradeIn.id, referenceValueCents: referenceCents, offerAmountCents: offerCents, idempotencyKey: commandKeyRef.current })
    setBusy(false)
    if (!response.success) return setDialogError(response.error)
    await finish('Appraisal recorded')
  }

  const eligibleDeals = (pencilDeals || []).filter(deal =>
    deal.rooftop?.id === tradeIn?.rooftop?.id && (!tradeIn?.lead || !deal.lead || deal.lead.id === tradeIn.lead.id)
  )
  const selectedDeal = eligibleDeals.find(deal => deal.id === dealId)

  const submitAttach = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!tradeIn) return
    setShowErrors(true)
    if (!selectedDeal) return
    setBusy(true)
    setDialogError(null)
    const response = await setDealTradeIn({ dealId: selectedDeal.id, tradeInId: tradeIn.id, expectedUpdatedAt: selectedDeal.updatedAt, reason: reason.trim() || undefined, idempotencyKey: commandKeyRef.current })
    setBusy(false)
    if (!response.success) return setDialogError(response.error)
    await finish('Attached to the deal; trade credit repriced')
  }

  const submitDetach = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!tradeIn?.deal?.updatedAt) return
    setShowErrors(true)
    if (!reason.trim()) return
    setBusy(true)
    setDialogError(null)
    const response = await setDealTradeIn({ dealId: tradeIn.deal.id, tradeInId: null, expectedUpdatedAt: tradeIn.deal.updatedAt, reason: reason.trim(), idempotencyKey: commandKeyRef.current })
    setBusy(false)
    if (!response.success) return setDialogError(response.error)
    await finish('Detached from the deal; trade credit removed')
  }

  const acquireErrors = {
    vin: VIN_PATTERN.test(acquire.vin.trim().toUpperCase()) ? null : 'Enter the 17-character VIN',
    year: /^\d{4}$/.test(acquire.year.trim()) ? null : 'Enter a 4-digit year',
    make: acquire.make.trim() ? null : 'Make is required',
    model: acquire.model.trim() ? null : 'Model is required',
    odometer: !acquire.odometer.trim() || /^\d+$/.test(acquire.odometer.trim().replace(/,/g, '')) ? null : 'Enter whole miles',
    appraisalCents: acquire.appraisalCents > 0 ? null : 'Enter the appraisal',
    reason: acquire.reason.trim() ? null : 'Reason is required',
  }

  const submitAcquire = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!tradeIn?.rooftop?.id) return
    setShowErrors(true)
    if (Object.values(acquireErrors).some(Boolean)) return
    setBusy(true)
    setDialogError(null)
    const odometer = acquire.odometer.trim().replace(/,/g, '')
    const response = await acquireTradeIn({
      tradeInId: tradeIn.id,
      rooftopId: tradeIn.rooftop.id,
      vin: acquire.vin.trim().toUpperCase(),
      year: Number(acquire.year),
      make: acquire.make.trim(),
      model: acquire.model.trim(),
      odometer: odometer ? Number(odometer) : null,
      appraisalCents: acquire.appraisalCents,
      reconEstimateCents: acquire.reconEstimateCents || null,
      reason: acquire.reason.trim(),
    })
    setBusy(false)
    if (!response.success) return setDialogError(response.error)
    await finish(`Acquisition ${response.data.startInventoryAcquisition?.reference || ''} started`.replace('  ', ' '))
  }

  const breadcrumbs = (label: string) => [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'page' as const, label: 'Platform' },
    { type: 'link' as const, label: 'Trade-Ins', href: `${basePath}/platform/trade-ins` },
    { type: 'page' as const, label },
  ]

  if (!tradeIn) {
    return (
      <PageContainer
        title="Trade-in"
        breadcrumbs={breadcrumbs('Trade-in')}
        header={<DeskHeader title="Trade-in unavailable" tone="bad" status="Unavailable" actions={<Pill asChild className="max-md:h-10"><Link href={`${basePath}/platform/trade-ins`}>Back to trade-ins</Link></Pill>} />}
      >
        <div className="space-y-3 px-4 pb-24 md:px-6">
          <Notice tone="bad">{error || 'Trade-in not found'}</Notice>
          <Track><Pill size="sm" onClick={load} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : undefined} />Retry</Pill></Track>
        </div>
      </PageContainer>
    )
  }

  const state = tradeInState(tradeIn, acquisition)
  const title = tradeInVehicleLabel(tradeIn)
  const customer = tradeInCustomer(tradeIn)
  const deal = tradeIn.deal
  const dealIsPencil = deal?.status === 'pencil'
  const estimate = preliminaryWholesaleEstimate(tradeIn.referenceValue || 0, tradeIn.condition, tradeIn.mileage)
  const spread = tradeIn.referenceValue != null && tradeIn.offerAmount != null ? tradeIn.referenceValue - tradeIn.offerAmount : null

  const appraiseBlocked = deal ? 'Detach from the deal to re-appraise' : null
  const attachBlocked = tradeIn.offerAmount == null ? 'Record an offer first' : null
  const detachBlocked = deal && !dealIsPencil ? `The deal is ${labelForDeal(deal.status || '').toLowerCase()}` : null
  const editBlocked = deal && !dealIsPencil ? `On a ${labelForDeal(deal.status || '').toLowerCase()} deal` : null
  const blockers = [
    appraiseBlocked && `Appraise: ${appraiseBlocked}`,
    !deal && attachBlocked && `Attach: ${attachBlocked}`,
    detachBlocked && `Detach: ${detachBlocked}`,
    editBlocked && `Edit: ${editBlocked}`,
  ].filter(Boolean) as string[]

  const closed = state.label === 'Closed'
  const primary = closed ? null : tradeIn.offerAmount == null ? 'appraise' : !deal ? 'attach' : !acquisition && data?.canSeeAcquisitions ? 'acquire' : null

  const actions = (
    <div role="group" aria-label="Trade-in actions" className="flex flex-wrap items-center gap-2 max-md:[&>button]:h-10">
      <Pill variant={primary === 'appraise' ? 'primary' : 'raised'} onClick={() => openDialog('appraise')} disabled={Boolean(appraiseBlocked)} aria-describedby={appraiseBlocked ? 'trade-in-blockers' : undefined}>
        {tradeIn.offerAmount == null ? 'Appraise' : 'Re-appraise'}
      </Pill>
      {deal ? (
        <Pill onClick={() => openDialog('detach')} disabled={Boolean(detachBlocked)} aria-describedby={detachBlocked ? 'trade-in-blockers' : undefined}>
          <Unlink />
          Detach
        </Pill>
      ) : (
        <Pill variant={primary === 'attach' ? 'primary' : 'raised'} onClick={() => openDialog('attach')} disabled={Boolean(attachBlocked)} aria-describedby={attachBlocked ? 'trade-in-blockers' : undefined}>
          <Link2 />
          Attach to deal
        </Pill>
      )}
      {data?.canSeeAcquisitions && !acquisition && (
        <Pill variant={primary === 'acquire' ? 'primary' : 'raised'} onClick={() => openDialog('acquire')}>
          <Truck />
          Acquire into inventory
        </Pill>
      )}
      <Pill onClick={() => openDialog('edit')} disabled={Boolean(editBlocked)} aria-describedby={editBlocked ? 'trade-in-blockers' : undefined}>
        <Pencil />
        Edit
      </Pill>
    </div>
  )

  const header = (
    <DeskHeader
      title={title}
      tone={state.tone}
      status={state.label}
      meta={
        <span className="flex flex-wrap gap-x-2">
          <span className="text-foreground">{state.label}</span>
          <span>· Trade-in <Code>{tradeInReference(tradeIn)}</Code></span>
          <span>· {customer || 'No customer'}</span>
          {tradeIn.rooftop?.name && <span>· {tradeIn.rooftop.name}</span>}
        </span>
      }
      actions={actions}
    />
  )

  const editInitial: TradeInFormValues = {
    rooftopId: tradeIn.rooftop?.id || '',
    leadId: tradeIn.lead?.id || '',
    vin: tradeIn.vin || '',
    year: tradeIn.year || '',
    make: tradeIn.make || '',
    model: tradeIn.model || '',
    trim: tradeIn.trim || '',
    mileage: tradeIn.mileage == null ? '' : String(tradeIn.mileage),
    condition: tradeIn.condition || '',
    exteriorCondition: tradeIn.exteriorCondition || '',
    interiorCondition: tradeIn.interiorCondition || '',
    mechanicalIssues: tradeIn.mechanicalIssues || '',
  }

  const formatDateTime = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleString('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-'

  return (
    <PageContainer title={title} header={header} breadcrumbs={breadcrumbs(title)}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {(notice || error || blockers.length > 0) && (
          <div className="space-y-2">
            {notice && <Notice tone="ok">{notice}</Notice>}
            {error && <Notice tone="bad">{error}</Notice>}
            {blockers.length > 0 && <p id="trade-in-blockers" className="text-xs text-muted-foreground">{blockers.join(' · ')}</p>}
          </div>
        )}


        <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-8">
            <DeskSection title="Appraisal" id="trade-in-appraisal">
              <div className="flex min-w-0 flex-wrap items-end gap-x-6 gap-y-2 pb-3">
                <div>
                  <p className="text-[12px] font-medium text-muted-foreground">Offer</p>
                  <p className="mt-1">
                    {tradeIn.offerAmount != null ? <Figure size="lg">{formatWholeUsd(tradeIn.offerAmount)}</Figure> : <Attention>Needs appraisal</Attention>}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">{tradeIn.appraisedBy?.name ? `By ${tradeIn.appraisedBy.name}` : 'Not appraised'}</p>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-x-8 md:grid-cols-2">
                <Facts items={[
                  { label: 'Reference', value: tradeIn.referenceValue != null ? formatWholeUsd(tradeIn.referenceValue) : '-' },
                  { label: 'Estimate', value: formatWholeUsd(estimate) },
                ]} />
                <Facts items={[
                  { label: 'Spread', value: spread != null ? <span className={spread < 0 ? 'text-red-700 dark:text-red-300' : undefined}>{formatWholeUsd(spread)}{spread < 0 ? ' · offer above reference' : ''}</span> : '-' },
                  { label: 'Condition', value: tradeIn.condition ? <Status tone={conditionTone[tradeIn.condition] ?? 'idle'}>{conditionLabel(tradeIn.condition)}</Status> : 'Not graded' },
                ]} />
              </div>
            </DeskSection>

            <DeskSection title="Vehicle">
              <Facts items={[
                { label: 'Vehicle', value: title },
                { label: 'VIN', value: <Code className="break-all text-foreground">{tradeIn.vin || 'Not entered'}</Code> },
                { label: 'Mileage', value: <span className="tabular-nums">{formatMileage(tradeIn.mileage)}</span> },
                { label: 'Condition', value: conditionLabel(tradeIn.condition) },
                { label: 'Created', value: formatDateTime(tradeIn.createdAt) },
              ]} />
            </DeskSection>

            <DeskSection title="Condition notes">
              {tradeIn.exteriorCondition || tradeIn.interiorCondition || tradeIn.mechanicalIssues ? (
                <Facts items={[
                  tradeIn.exteriorCondition ? { label: 'Exterior', value: <span className="whitespace-pre-wrap text-left">{tradeIn.exteriorCondition}</span> } : null,
                  tradeIn.interiorCondition ? { label: 'Interior', value: <span className="whitespace-pre-wrap text-left">{conditionNotes(tradeIn.interiorCondition)}</span> } : null,
                  tradeIn.mechanicalIssues ? { label: 'Mechanical', value: <span className="whitespace-pre-wrap text-left text-amber-700 dark:text-amber-300">{tradeIn.mechanicalIssues}</span> } : null,
                ]} />
              ) : (
                <p className="py-2 text-sm text-muted-foreground">No notes</p>
              )}
            </DeskSection>

            <DeskSection title="History" count={data?.timeline.length}>
              {data?.timeline.length ? (
                <Panel className="divide-y">
                  {data.timeline.map(entry => (
                    <div key={entry.id} className="flex min-w-0 items-baseline justify-between gap-4 px-4 py-2.5 text-sm">
                      <span className="min-w-0 break-words">{timelineLabel[entry.action] ?? entry.action}{entry.actor?.name ? ` · ${entry.actor.name}` : ''}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDateTime(entry.occurredAt)}</span>
                    </div>
                  ))}
                </Panel>
              ) : (
                <p className="py-2 text-sm text-muted-foreground">No history</p>
              )}
            </DeskSection>
          </div>

          <aside className="min-w-0 space-y-8 lg:sticky lg:top-6 lg:self-start">
            <DeskSection title="Customer" actions={tradeIn.lead ? <Link href={`${basePath}/platform/crm/${tradeIn.lead.id}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">Open lead</Link> : undefined}>
              {tradeIn.lead ? (
                <Facts items={[
                  { label: 'Name', value: customer },
                  { label: 'Phone', value: formatPhone(tradeIn.lead.phone) || '-' },
                  { label: 'Email', value: <span className="break-all">{tradeIn.lead.email || '-'}</span> },
                ]} />
              ) : (
                <p className="py-2 text-sm text-muted-foreground">No customer lead</p>
              )}
            </DeskSection>

            <DeskSection title="Deal" actions={deal ? <Link href={`${basePath}/platform/deals/${deal.id}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">Open deal</Link> : undefined}>
              {deal ? (
                <div className="space-y-2">
                  <TitleLine as="p" tone={toneForDeal(deal.status || '')} status={labelForDeal(deal.status || '')} className="text-sm font-medium">{dealLabel(deal)}</TitleLine>
                  <Facts items={[
                    { label: 'Status', value: labelForDeal(deal.status || '') },
                    deal.vehicle?.stockNumber ? { label: 'Stock #', value: <Code className="text-foreground">{deal.vehicle.stockNumber}</Code> } : null,
                    { label: 'Trade credit', value: formatWholeUsd((deal.tradeInValueCents || 0) / 100) },
                  ]} />
                </div>
              ) : (
                <p className="py-2 text-sm text-muted-foreground">Not on a deal</p>
              )}
            </DeskSection>

            {data?.canSeeAcquisitions && (
              <DeskSection title="Inventory acquisition" actions={acquisition ? <Link href={`${basePath}/platform/vehicles`} className="text-xs font-medium text-muted-foreground hover:text-foreground">Open inventory</Link> : undefined}>
                {acquisition ? (
                  <Facts items={[
                    { label: 'Reference', value: <Code className="text-foreground">{acquisition.reference}</Code> },
                    { label: 'Status', value: <span className="capitalize">{acquisition.status.replace(/-/g, ' ')}</span> },
                    { label: 'Stock #', value: acquisition.vehicle?.stockNumber ? <Code className="text-foreground">{acquisition.vehicle.stockNumber}</Code> : 'Not intaken' },
                  ]} />
                ) : (
                  <p className="py-2 text-sm text-muted-foreground">Not acquired</p>
                )}
              </DeskSection>
            )}
          </aside>
        </div>
      </div>

      <TradeInFormDialog open={dialog === 'edit'} mode="edit" initialValues={editInitial} busy={busy} error={dialogError} onSubmit={submitEdit} onOpenChange={closeDialog} />

      <ActionDialog open={dialog === 'appraise'} title="Record appraisal" description={title} busy={busy} error={dialogError} submitLabel="Save appraisal" onSubmit={submitAppraisal} onOpenChange={closeDialog}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow label="Reference value" htmlFor="appraisal-reference">
            <MoneyInput id="appraisal-reference" cents={referenceCents} onCentsChange={setReferenceCents} disabled={busy} />
          </FieldRow>
          <FieldRow label="Offer" htmlFor="appraisal-offer" error={showErrors ? offerError : null}>
            <MoneyInput id="appraisal-offer" cents={offerCents} onCentsChange={setOfferCents} disabled={busy} aria-invalid={showErrors && offerError ? true : undefined} aria-describedby={showErrors && offerError ? 'appraisal-offer-error' : undefined} />
          </FieldRow>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">Estimate {formatWholeUsd(preliminaryWholesaleEstimate(referenceCents / 100, tradeIn.condition, tradeIn.mileage))} · Spread {formatWholeUsd((referenceCents - offerCents) / 100)}</span>
          <Track>
            <Pill size="sm" disabled={busy || referenceCents <= 0} onClick={() => setOfferCents(preliminaryWholesaleEstimate(referenceCents / 100, tradeIn.condition, tradeIn.mileage) * 100)}>Use estimate</Pill>
          </Track>
        </div>
      </ActionDialog>

      <ActionDialog open={dialog === 'attach'} title="Attach to deal" description={`Offer ${formatWholeUsd(tradeIn.offerAmount)} becomes the trade credit`} busy={busy} error={dialogError} submitLabel="Attach" onSubmit={submitAttach} onOpenChange={closeDialog}>
        <FieldRow label="Pencil deal" htmlFor="attach-deal" error={showErrors && !selectedDeal ? 'Select a deal' : null}>
          <Select value={dealId} onValueChange={setDealId} disabled={busy || pencilDeals === null || eligibleDeals.length === 0}>
            <SelectTrigger id="attach-deal" className="rounded-[4px]" aria-invalid={showErrors && !selectedDeal ? true : undefined}>
              <SelectValue placeholder={pencilDeals === null ? 'Loading deals' : eligibleDeals.length === 0 ? 'No pencil deals without a trade-in' : 'Select deal'} />
            </SelectTrigger>
            <SelectContent>
              {eligibleDeals.map(option => (
                <SelectItem key={option.id} value={option.id}>
                  {dealLabel(option)}{option.vehicle?.stockNumber ? ` · #${option.vehicle.stockNumber}` : ''}{option.lead ? ` · ${[option.lead.firstName, option.lead.lastName].filter(Boolean).join(' ')}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
        {selectedDeal && (
          <Facts items={[
            { label: 'Current trade credit', value: formatWholeUsd((selectedDeal.tradeInValueCents || 0) / 100) },
            { label: 'New trade credit', value: formatWholeUsd(tradeIn.offerAmount) },
          ]} />
        )}
        <FieldRow label="Note (optional)" htmlFor="attach-reason">
          <Textarea className="rounded-[4px]" id="attach-reason" rows={2} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} />
        </FieldRow>
        {pencilDeals !== null && (
          <Link href={`${basePath}/platform/deals/create${tradeIn.lead ? `?leadId=${tradeIn.lead.id}` : ''}`} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            New deal
            <ArrowRight className="size-3.5" />
          </Link>
        )}
      </ActionDialog>

      <ActionDialog open={dialog === 'detach'} title="Detach from deal" description={deal ? `${dealLabel(deal)} · trade credit returns to $0` : undefined} busy={busy} error={dialogError} submitLabel="Detach" onSubmit={submitDetach} onOpenChange={closeDialog}>
        <FieldRow label="Reason" htmlFor="detach-reason" error={showErrors && !reason.trim() ? 'Reason is required' : null}>
          <Textarea className="rounded-[4px]" id="detach-reason" rows={2} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} aria-invalid={showErrors && !reason.trim() ? true : undefined} />
        </FieldRow>
      </ActionDialog>

      <ActionDialog open={dialog === 'acquire'} title="Acquire into inventory" description="Source: trade-in" busy={busy} error={dialogError} submitLabel="Start acquisition" onSubmit={submitAcquire} onOpenChange={closeDialog}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldRow label="VIN" htmlFor="acquire-vin" error={showErrors ? acquireErrors.vin : null}>
              <Input id="acquire-vin" maxLength={17} className="rounded-[4px] font-mono uppercase" value={acquire.vin} onChange={event => setAcquire(current => ({ ...current, vin: event.target.value }))} disabled={busy} aria-invalid={showErrors && acquireErrors.vin ? true : undefined} />
            </FieldRow>
          </div>
          <FieldRow label="Year" htmlFor="acquire-year" error={showErrors ? acquireErrors.year : null}>
            <Input className="rounded-[4px]" id="acquire-year" inputMode="numeric" maxLength={4} value={acquire.year} onChange={event => setAcquire(current => ({ ...current, year: event.target.value }))} disabled={busy} />
          </FieldRow>
          <FieldRow label="Odometer" htmlFor="acquire-odometer" error={showErrors ? acquireErrors.odometer : null}>
            <Input className="rounded-[4px]" id="acquire-odometer" inputMode="numeric" value={acquire.odometer} onChange={event => setAcquire(current => ({ ...current, odometer: event.target.value }))} disabled={busy} />
          </FieldRow>
          <FieldRow label="Make" htmlFor="acquire-make" error={showErrors ? acquireErrors.make : null}>
            <Input className="rounded-[4px]" id="acquire-make" value={acquire.make} onChange={event => setAcquire(current => ({ ...current, make: event.target.value }))} disabled={busy} />
          </FieldRow>
          <FieldRow label="Model" htmlFor="acquire-model" error={showErrors ? acquireErrors.model : null}>
            <Input className="rounded-[4px]" id="acquire-model" value={acquire.model} onChange={event => setAcquire(current => ({ ...current, model: event.target.value }))} disabled={busy} />
          </FieldRow>
          <FieldRow label="Appraisal" htmlFor="acquire-appraisal" error={showErrors ? acquireErrors.appraisalCents : null}>
            <MoneyInput id="acquire-appraisal" cents={acquire.appraisalCents} onCentsChange={cents => setAcquire(current => ({ ...current, appraisalCents: cents }))} disabled={busy} />
          </FieldRow>
          <FieldRow label="Recon estimate" htmlFor="acquire-recon">
            <MoneyInput id="acquire-recon" cents={acquire.reconEstimateCents} onCentsChange={cents => setAcquire(current => ({ ...current, reconEstimateCents: cents }))} disabled={busy} />
          </FieldRow>
          <div className="sm:col-span-2">
            <FieldRow label="Reason" htmlFor="acquire-reason" error={showErrors ? acquireErrors.reason : null}>
              <Textarea className="rounded-[4px]" id="acquire-reason" rows={2} maxLength={500} value={acquire.reason} onChange={event => setAcquire(current => ({ ...current, reason: event.target.value }))} disabled={busy} />
            </FieldRow>
          </div>
        </div>
      </ActionDialog>
    </PageContainer>
  )
}
