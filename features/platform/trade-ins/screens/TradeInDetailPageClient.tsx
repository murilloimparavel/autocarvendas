'use client'

import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { translateSchemaLabel } from '@/features/i18n/messages'
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
  tradeInActions,
  tradeInClosedReason,
  tradeInReference,
  tradeInVehicleLabel,
  VIN_PATTERN,
} from '../lib/tradeInState'

type DetailData = { tradeIn: TradeIn | null; acquisition: TradeInAcquisition | null; canSeeAcquisitions: boolean; timeline: TradeInTimelineEntry[]; currencyCode: string }
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

function ActionDialog({ open, title, description, busy, error, submitLabel, onSubmit, onOpenChange, children, locale }: {
  open: boolean
  title: string
  description?: string
  busy: boolean
  error: string | null
  submitLabel: string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onOpenChange: (open: boolean) => void
  children: ReactNode
  locale: 'pt-BR' | 'en-US'
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
              <Pill variant="plain" disabled={busy} onClick={() => onOpenChange(false)}>{locale === 'pt-BR' ? 'Cancelar' : 'Cancel'}</Pill>
              <Pill type="submit" variant="primary" disabled={busy}>{busy ? (locale === 'pt-BR' ? 'Salvando…' : 'Saving…') : submitLabel}</Pill>
            </Track>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function dealLabel(deal: { vehicle: { year: number | null; make: string | null; model: string | null; stockNumber?: string | null } | null }, locale: 'pt-BR' | 'en-US') {
  return deal.vehicle ? [deal.vehicle.year, deal.vehicle.make, deal.vehicle.model].filter(Boolean).join(' ') : (locale === 'pt-BR' ? 'Venda' : 'Deal')
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
  const { locale, t } = useLocale()
  const schemaLabel = (value: string) => translateSchemaLabel(locale, value)
  const mileageFromStored = (miles: number) => locale === 'pt-BR' ? Math.round(miles * 1.609344) : miles
  const normalizeMileageInput = (value: string) => value.trim().replace(/[.,]/g, '')
  const mileageToStored = (value: string) => {
    const parsed = Number(normalizeMileageInput(value))
    return Number.isFinite(parsed) ? (locale === 'pt-BR' ? parsed / 1.609344 : parsed) : null
  }
  const [data, setData] = useState<DetailData | null>(initialData)
  const currencyCode = data?.currencyCode || initialData?.currencyCode || 'USD'
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
      setError(response.error || t('tradeInMissing'))
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
        odometer: tradeIn.mileage == null ? '' : String(mileageFromStored(tradeIn.mileage)),
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
        setDialogError(response.error || t('tradeInMissing'))
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
    const response = await updateTradeInDetails(tradeIn.id, tradeInDetailsPayload(values, locale))
    setBusy(false)
    if (!response.success) return setDialogError(response.error || t('tradeInSaveFailed'))
    await finish(t('tradeInUpdated'))
  }

  const offerError = offerCents <= 0 ? t('enterOffer') : null

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
    await finish(t('appraisalRecorded'))
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
    await finish(t('attachTradeInSuccess'))
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
    await finish(t('detachTradeInSuccess'))
  }

  const acquireErrors = {
    vin: VIN_PATTERN.test(acquire.vin.trim().toUpperCase()) ? null : t('enterVin17'),
    year: /^\d{4}$/.test(acquire.year.trim()) ? null : t('enterFourDigitYear'),
    make: acquire.make.trim() ? null : t('makeRequired'),
    model: acquire.model.trim() ? null : t('modelRequired'),
    odometer: !acquire.odometer.trim() || /^\d+$/.test(normalizeMileageInput(acquire.odometer)) ? null : t('enterWholeKm'),
    appraisalCents: acquire.appraisalCents > 0 ? null : t('appraisalRequired'),
    reason: acquire.reason.trim() ? null : t('reasonRequired'),
  }

  const submitAcquire = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!tradeIn?.rooftop?.id) return
    setShowErrors(true)
    if (Object.values(acquireErrors).some(Boolean)) return
    setBusy(true)
    setDialogError(null)
    const odometer = mileageToStored(acquire.odometer)
    const response = await acquireTradeIn({
      tradeInId: tradeIn.id,
      rooftopId: tradeIn.rooftop.id,
      vin: acquire.vin.trim().toUpperCase(),
      year: Number(acquire.year),
      make: acquire.make.trim(),
      model: acquire.model.trim(),
      odometer,
      appraisalCents: acquire.appraisalCents,
      reconEstimateCents: acquire.reconEstimateCents || null,
      reason: acquire.reason.trim(),
    })
    setBusy(false)
    if (!response.success) return setDialogError(response.error)
    await finish(t('acquisitionStarted').replace('{reference}', response.data.startInventoryAcquisition?.reference || '').replace(/\s+/g, ' ').trim())
  }

  const breadcrumbs = (label: string) => [
    { type: 'link' as const, label: t('dashboard'), href: basePath },
    { type: 'page' as const, label: t('platform') },
    { type: 'link' as const, label: t('tradeIns'), href: `${basePath}/platform/trade-ins` },
    { type: 'page' as const, label },
  ]

  if (!tradeIn) {
    return (
      <PageContainer
        title={t('tradeIn')}
        breadcrumbs={breadcrumbs(t('tradeIn'))}
        header={<DeskHeader title={t('tradeInDetailUnavailable')} tone="bad" status={t('unavailable')} actions={<Pill asChild className="max-md:h-10"><Link href={`${basePath}/platform/trade-ins`}>{t('backToTradeIns')}</Link></Pill>} />}
      >
        <div className="space-y-3 px-4 pb-24 md:px-6">
          <Notice tone="bad">{error || t('tradeInNotFound')}</Notice>
          <Track><Pill size="sm" onClick={load} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : undefined} />{t('retry')}</Pill></Track>
        </div>
      </PageContainer>
    )
  }

  const state = tradeInState(tradeIn, acquisition, locale)
  const title = tradeInVehicleLabel(tradeIn, locale)
  const customer = tradeInCustomer(tradeIn, locale)
  const deal = tradeIn.deal
  const dealIsPencil = deal?.status === 'pencil'
  const estimate = preliminaryWholesaleEstimate(tradeIn.referenceValue || 0, tradeIn.condition, tradeIn.mileage)
  const spread = tradeIn.referenceValue != null && tradeIn.offerAmount != null ? tradeIn.referenceValue - tradeIn.offerAmount : null

  const appraiseBlocked = deal ? t('detachToReappraise') : null
  const attachBlocked = tradeIn.offerAmount == null ? t('recordOfferFirst') : null
  const detachBlocked = deal && !dealIsPencil ? t('dealIsStatus').replace('{status}', schemaLabel(labelForDeal(deal.status || '').toLowerCase())) : null
  const editBlocked = deal && !dealIsPencil ? t('onDealStatus').replace('{status}', schemaLabel(labelForDeal(deal.status || '').toLowerCase())) : null
  const allowed = tradeInActions(tradeIn, acquisition)
  const closed = allowed.closed
  const blockers = closed ? [] : [
    appraiseBlocked && `${t('appraise')}: ${appraiseBlocked}`,
    !deal && attachBlocked && `${t('attachToDeal')}: ${attachBlocked}`,
    detachBlocked && `${t('detach')}: ${detachBlocked}`,
    editBlocked && `${t('edit')}: ${editBlocked}`,
  ].filter(Boolean) as string[]

  const primary = closed ? null : tradeIn.offerAmount == null ? 'appraise' : !deal ? 'attach' : !acquisition && data?.canSeeAcquisitions ? 'acquire' : null

  const actions = (
    <div role="group" aria-label={t('tradeInActions')} className="flex flex-wrap items-center gap-2 max-md:[&>button]:h-10">
      {allowed.appraise && (
        <Pill variant={primary === 'appraise' ? 'primary' : 'raised'} onClick={() => openDialog('appraise')} disabled={Boolean(appraiseBlocked)} aria-describedby={appraiseBlocked ? 'trade-in-blockers' : undefined}>
          {tradeIn.offerAmount == null ? t('appraise') : t('reappraise')}
        </Pill>
      )}
      {closed ? null : deal ? (
        <Pill onClick={() => openDialog('detach')} disabled={Boolean(detachBlocked)} aria-describedby={detachBlocked ? 'trade-in-blockers' : undefined}>
          <Unlink />
          {t('detach')}
        </Pill>
      ) : (
        <Pill variant={primary === 'attach' ? 'primary' : 'raised'} onClick={() => openDialog('attach')} disabled={Boolean(attachBlocked)} aria-describedby={attachBlocked ? 'trade-in-blockers' : undefined}>
          <Link2 />
          {t('attachToDeal')}
        </Pill>
      )}
      {data?.canSeeAcquisitions && allowed.acquire && (
        <Pill variant={primary === 'acquire' ? 'primary' : 'raised'} onClick={() => openDialog('acquire')}>
          <Truck />
          {t('acquireIntoInventory')}
        </Pill>
      )}
      {!closed && (
        <Pill onClick={() => openDialog('edit')} disabled={Boolean(editBlocked)} aria-describedby={editBlocked ? 'trade-in-blockers' : undefined}>
          <Pencil />
          {t('edit')}
        </Pill>
      )}
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
          <span>· {t('tradeIn')} <Code>{tradeInReference(tradeIn)}</Code></span>
          <span>· {customer || t('noCustomer')}</span>
          {tradeIn.rooftop?.name && <span>· {tradeIn.rooftop.name}</span>}
        </span>
      }
      actions={closed ? undefined : actions}
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
    mileage: tradeIn.mileage == null ? '' : String(mileageFromStored(tradeIn.mileage)),
    condition: tradeIn.condition || '',
    exteriorCondition: tradeIn.exteriorCondition || '',
    interiorCondition: tradeIn.interiorCondition || '',
    mechanicalIssues: tradeIn.mechanicalIssues || '',
  }

  const formatDateTime = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleString(locale, { timeZone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-'

  return (
    <PageContainer title={title} header={header} breadcrumbs={breadcrumbs(title)}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {(notice || error || closed || blockers.length > 0) && (
          <div className="space-y-2">
            {notice && <Notice tone="ok">{notice}</Notice>}
            {error && <Notice tone="bad">{error}</Notice>}
            {closed && (
                <Notice tone="idle">{(locale === 'pt-BR' ? 'Encerrada: {reason}' : 'Closed: {reason}').replace('{reason}', tradeInClosedReason(tradeIn, locale))}</Notice>
            )}
            {blockers.length > 0 && <p id="trade-in-blockers" className="text-xs text-muted-foreground">{blockers.join(' · ')}</p>}
          </div>
        )}


        <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-8">
            <DeskSection title={t('appraisal')} id="trade-in-appraisal">
              <div className="flex min-w-0 flex-wrap items-end gap-x-6 gap-y-2 pb-3">
                <div>
                  <p className="text-[12px] font-medium text-muted-foreground">{t('offer')}</p>
                  <p className="mt-1">
                    {tradeIn.offerAmount != null ? <Figure size="lg">{formatWholeUsd(tradeIn.offerAmount, locale, currencyCode)}</Figure> : closed ? <span className="text-sm text-muted-foreground">{t('noOffer')}</span> : <Attention>{t('needsAppraisal')}</Attention>}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">{tradeIn.appraisedBy?.name ? t('appraisedBy').replace('{name}', tradeIn.appraisedBy.name) : t('notAppraised')}</p>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-x-8 md:grid-cols-2">
                <Facts items={[
                  { label: t('reference'), value: tradeIn.referenceValue != null ? formatWholeUsd(tradeIn.referenceValue, locale, currencyCode) : '-' },
                  { label: t('estimate'), value: formatWholeUsd(estimate, locale, currencyCode) },
                ]} />
                <Facts items={[
                  { label: t('spread'), value: spread != null ? <span className={spread < 0 ? 'text-red-700 dark:text-red-300' : undefined}>{formatWholeUsd(spread, locale, currencyCode)}{spread < 0 ? ` · ${t('offerAboveReference')}` : ''}</span> : '-' },
                  { label: t('condition'), value: tradeIn.condition ? <Status tone={conditionTone[tradeIn.condition] ?? 'idle'}>{conditionLabel(tradeIn.condition, locale)}</Status> : t('notGraded') },
                ]} />
              </div>
            </DeskSection>

            <DeskSection title={t('vehicle')}>
              <Facts items={[
                { label: t('vehicle'), value: title },
                { label: 'VIN', value: <Code className="break-all text-foreground">{tradeIn.vin || t('notEntered')}</Code> },
                { label: t('mileageShort'), value: <span className="tabular-nums">{formatMileage(tradeIn.mileage, locale)}</span> },
                { label: t('condition'), value: conditionLabel(tradeIn.condition, locale) },
                { label: t('createdAt'), value: formatDateTime(tradeIn.createdAt) },
              ]} />
            </DeskSection>

            <DeskSection title={t('vehicleCondition')}>
              {tradeIn.exteriorCondition || tradeIn.interiorCondition || tradeIn.mechanicalIssues ? (
                <Facts items={[
                  tradeIn.exteriorCondition ? { label: t('exterior'), value: <span className="whitespace-pre-wrap text-left">{tradeIn.exteriorCondition}</span> } : null,
                  tradeIn.interiorCondition ? { label: t('interior'), value: <span className="whitespace-pre-wrap text-left">{conditionNotes(tradeIn.interiorCondition, locale)}</span> } : null,
                  tradeIn.mechanicalIssues ? { label: t('mechanical'), value: <span className="whitespace-pre-wrap text-left text-amber-700 dark:text-amber-300">{tradeIn.mechanicalIssues}</span> } : null,
                ]} />
              ) : (
                <p className="py-2 text-sm text-muted-foreground">{t('noNotes')}</p>
              )}
            </DeskSection>

            <DeskSection title={t('history')} count={data?.timeline.length}>
              {data?.timeline.length ? (
                <Panel className="divide-y">
                  {data.timeline.map(entry => (
                    <div key={entry.id} className="flex min-w-0 items-baseline justify-between gap-4 px-4 py-2.5 text-sm">
                  <span className="min-w-0 break-words">{schemaLabel(timelineLabel[entry.action] ?? entry.action)}{entry.actor?.name ? ` · ${entry.actor.name}` : ''}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDateTime(entry.occurredAt)}</span>
                    </div>
                  ))}
                </Panel>
              ) : (
                  <p className="py-2 text-sm text-muted-foreground">{t('noHistory')}</p>
              )}
            </DeskSection>
          </div>

          <aside className="min-w-0 space-y-8 lg:sticky lg:top-6 lg:self-start">
            <DeskSection title={t('customer')} actions={tradeIn.lead ? <Link href={`${basePath}/platform/crm/${tradeIn.lead.id}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">{t('openLead')}</Link> : undefined}>
              {tradeIn.lead ? (
                <Facts items={[
                  { label: t('fullName'), value: customer },
                  { label: t('contact'), value: formatPhone(tradeIn.lead.phone) || '-' },
                  { label: t('email'), value: <span className="break-all">{tradeIn.lead.email || '-'}</span> },
                ]} />
              ) : (
                <p className="py-2 text-sm text-muted-foreground">{t('noCustomerLead')}</p>
              )}
            </DeskSection>

            <DeskSection title={t('deals')} actions={deal ? <Link href={`${basePath}/platform/deals/${deal.id}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">{t('openDeal')}</Link> : undefined}>
              {deal ? (
                <div className="space-y-2">
                  <TitleLine as="p" tone={toneForDeal(deal.status || '')} status={schemaLabel(labelForDeal(deal.status || ''))} className="text-sm font-medium">{dealLabel(deal, locale)}</TitleLine>
                  <Facts items={[
                    { label: t('status'), value: schemaLabel(labelForDeal(deal.status || '')) },
                    deal.vehicle?.stockNumber ? { label: t('stockNumber'), value: <Code className="text-foreground">{deal.vehicle.stockNumber}</Code> } : null,
                    { label: t('tradeCredit'), value: formatWholeUsd((deal.tradeInValueCents || 0) / 100, locale, currencyCode) },
                  ]} />
                </div>
              ) : (
                <p className="py-2 text-sm text-muted-foreground">{t('notOnDeal')}</p>
              )}
            </DeskSection>

            {data?.canSeeAcquisitions && (
              <DeskSection title={t('inventoryAcquisition')} actions={acquisition ? <Link href={`${basePath}/platform/vehicles`} className="text-xs font-medium text-muted-foreground hover:text-foreground">{t('openInventory')}</Link> : undefined}>
                {acquisition ? (
                  <Facts items={[
                    { label: t('reference'), value: <Code className="text-foreground">{acquisition.reference}</Code> },
                    { label: t('status'), value: <span className="capitalize">{schemaLabel(acquisition.status.replace(/-/g, ' '))}</span> },
                    { label: t('stockNumber'), value: acquisition.vehicle?.stockNumber ? <Code className="text-foreground">{acquisition.vehicle.stockNumber}</Code> : t('notIntaken') },
                  ]} />
                ) : (
                  <p className="py-2 text-sm text-muted-foreground">{t('notAcquired')}</p>
                )}
              </DeskSection>
            )}
          </aside>
        </div>
      </div>

      <TradeInFormDialog open={dialog === 'edit'} mode="edit" initialValues={editInitial} busy={busy} error={dialogError} onSubmit={submitEdit} onOpenChange={closeDialog} />

      <ActionDialog open={dialog === 'appraise'} title={t('recordAppraisal')} description={title} busy={busy} error={dialogError} submitLabel={t('saveAppraisal')} onSubmit={submitAppraisal} onOpenChange={closeDialog} locale={locale}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow label={t('referenceValue')} htmlFor="appraisal-reference">
            <MoneyInput id="appraisal-reference" cents={referenceCents} onCentsChange={setReferenceCents} disabled={busy} />
          </FieldRow>
          <FieldRow label={t('offer')} htmlFor="appraisal-offer" error={showErrors ? offerError : null}>
            <MoneyInput id="appraisal-offer" cents={offerCents} onCentsChange={setOfferCents} disabled={busy} aria-invalid={showErrors && offerError ? true : undefined} aria-describedby={showErrors && offerError ? 'appraisal-offer-error' : undefined} />
          </FieldRow>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">{t('estimate')} {formatWholeUsd(preliminaryWholesaleEstimate(referenceCents / 100, tradeIn.condition, tradeIn.mileage), locale, currencyCode)} · {t('spread')} {formatWholeUsd((referenceCents - offerCents) / 100, locale, currencyCode)}</span>
          <Track>
            <Pill size="sm" disabled={busy || referenceCents <= 0} onClick={() => setOfferCents(preliminaryWholesaleEstimate(referenceCents / 100, tradeIn.condition, tradeIn.mileage) * 100)}>{t('useEstimate')}</Pill>
          </Track>
        </div>
      </ActionDialog>

      <ActionDialog open={dialog === 'attach'} title={t('attachToDeal')} description={locale === 'pt-BR' ? `${t('offer')} ${formatWholeUsd(tradeIn.offerAmount, locale, currencyCode)} passa a compor o ${t('tradeCredit').toLowerCase()}.` : `Offer ${formatWholeUsd(tradeIn.offerAmount, locale, currencyCode)} becomes the trade credit.`} busy={busy} error={dialogError} submitLabel={t('attachToDeal')} onSubmit={submitAttach} onOpenChange={closeDialog} locale={locale}>
        <FieldRow label={locale === 'pt-BR' ? 'Prévia de venda' : 'Pencil deal'} htmlFor="attach-deal" error={showErrors && !selectedDeal ? t('selectDeal') : null}>
          <Select value={dealId} onValueChange={setDealId} disabled={busy || pencilDeals === null || eligibleDeals.length === 0}>
            <SelectTrigger id="attach-deal" className="rounded-[4px]" aria-invalid={showErrors && !selectedDeal ? true : undefined}>
              <SelectValue placeholder={pencilDeals === null ? t('loadingDeals') : eligibleDeals.length === 0 ? t('noEligibleDeals') : t('selectDeal')} />
            </SelectTrigger>
            <SelectContent>
              {eligibleDeals.map(option => (
                <SelectItem key={option.id} value={option.id}>
                  {dealLabel(option, locale)}{option.vehicle?.stockNumber ? ` · #${option.vehicle.stockNumber}` : ''}{option.lead ? ` · ${[option.lead.firstName, option.lead.lastName].filter(Boolean).join(' ')}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
        {selectedDeal && (
          <Facts items={[
            { label: t('currentTradeCredit'), value: formatWholeUsd((selectedDeal.tradeInValueCents || 0) / 100, locale, currencyCode) },
            { label: t('newTradeCredit'), value: formatWholeUsd(tradeIn.offerAmount, locale, currencyCode) },
          ]} />
        )}
        <FieldRow label={t('noteOptional')} htmlFor="attach-reason">
          <Textarea className="rounded-[4px]" id="attach-reason" rows={2} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} />
        </FieldRow>
        {pencilDeals !== null && (
          <Link href={`${basePath}/platform/deals/create${tradeIn.lead ? `?leadId=${tradeIn.lead.id}` : ''}`} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            {t('newDeal')}
            <ArrowRight className="size-3.5" />
          </Link>
        )}
      </ActionDialog>

      <ActionDialog open={dialog === 'detach'} title={locale === 'pt-BR' ? 'Desvincular veículo da venda' : 'Detach from deal'} description={deal ? locale === 'pt-BR' ? `${dealLabel(deal, locale)} · ${t('tradeCredit').toLowerCase()} volta a ${formatWholeUsd(0, locale)}` : `${dealLabel(deal, locale)} · trade credit returns to ${formatWholeUsd(0, locale)}` : undefined} busy={busy} error={dialogError} submitLabel={t('detach')} onSubmit={submitDetach} onOpenChange={closeDialog} locale={locale}>
        <FieldRow label={t('reason')} htmlFor="detach-reason" error={showErrors && !reason.trim() ? t('reasonRequired') : null}>
          <Textarea className="rounded-[4px]" id="detach-reason" rows={2} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} aria-invalid={showErrors && !reason.trim() ? true : undefined} />
        </FieldRow>
      </ActionDialog>

      <ActionDialog open={dialog === 'acquire'} title={t('acquireIntoInventory')} description={t('sourceTradeIn')} busy={busy} error={dialogError} submitLabel={t('startAcquisition')} onSubmit={submitAcquire} onOpenChange={closeDialog} locale={locale}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldRow label="VIN" htmlFor="acquire-vin" error={showErrors ? acquireErrors.vin : null}>
              <Input id="acquire-vin" maxLength={17} className="rounded-[4px] font-mono uppercase" value={acquire.vin} onChange={event => setAcquire(current => ({ ...current, vin: event.target.value }))} disabled={busy} aria-invalid={showErrors && acquireErrors.vin ? true : undefined} />
            </FieldRow>
          </div>
          <FieldRow label={t('year')} htmlFor="acquire-year" error={showErrors ? acquireErrors.year : null}>
            <Input className="rounded-[4px]" id="acquire-year" inputMode="numeric" maxLength={4} value={acquire.year} onChange={event => setAcquire(current => ({ ...current, year: event.target.value }))} disabled={busy} />
          </FieldRow>
          <FieldRow label={t('odometer')} htmlFor="acquire-odometer" error={showErrors ? acquireErrors.odometer : null}>
            <Input className="rounded-[4px]" id="acquire-odometer" inputMode="numeric" value={acquire.odometer} onChange={event => setAcquire(current => ({ ...current, odometer: event.target.value }))} disabled={busy} />
          </FieldRow>
          <FieldRow label={t('make')} htmlFor="acquire-make" error={showErrors ? acquireErrors.make : null}>
            <Input className="rounded-[4px]" id="acquire-make" value={acquire.make} onChange={event => setAcquire(current => ({ ...current, make: event.target.value }))} disabled={busy} />
          </FieldRow>
          <FieldRow label={t('model')} htmlFor="acquire-model" error={showErrors ? acquireErrors.model : null}>
            <Input className="rounded-[4px]" id="acquire-model" value={acquire.model} onChange={event => setAcquire(current => ({ ...current, model: event.target.value }))} disabled={busy} />
          </FieldRow>
          <FieldRow label={t('acquisitionValue')} htmlFor="acquire-appraisal" error={showErrors ? acquireErrors.appraisalCents : null}>
            <MoneyInput id="acquire-appraisal" cents={acquire.appraisalCents} onCentsChange={cents => setAcquire(current => ({ ...current, appraisalCents: cents }))} disabled={busy} />
          </FieldRow>
          <FieldRow label={t('reconEstimate')} htmlFor="acquire-recon">
            <MoneyInput id="acquire-recon" cents={acquire.reconEstimateCents} onCentsChange={cents => setAcquire(current => ({ ...current, reconEstimateCents: cents }))} disabled={busy} />
          </FieldRow>
          <div className="sm:col-span-2">
            <FieldRow label={t('reason')} htmlFor="acquire-reason" error={showErrors ? acquireErrors.reason : null}>
              <Textarea className="rounded-[4px]" id="acquire-reason" rows={2} maxLength={500} value={acquire.reason} onChange={event => setAcquire(current => ({ ...current, reason: event.target.value }))} disabled={busy} />
            </FieldRow>
          </div>
        </div>
      </ActionDialog>
    </PageContainer>
  )
}
