'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocale } from '@/features/i18n/LocaleProvider'
import Link from 'next/link'
import { ArrowLeft, Plus, RefreshCw, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { Code, DeskHeader, DeskSection, DeskTable, Facts, Figure, Notice, Pill, Segmented, Status, Td, Th, TitleLine, Tr, Track, type DeskTone } from '@/features/platform/components/desk'
import { parseDollarsToCents } from '@/features/platform/deals/lib/moneyInput'
import { transitionInventoryAcquisition } from '../actions'
import { getAcquisitions, receiveAcquisitionIntoStock, startInventoryAcquisition, type AcquisitionRow } from '../actions/acquisitions'
import { InventoryFormDialog, type FieldErrors, type InventoryFormField } from '../components/InventoryFormDialog'
import {
  ACQUISITION_NEXT,
  ACQUISITION_SOURCES,
  ACQUISITION_STATUSES,
  CONDITIONS,
  VIN_PATTERN,
  acquisitionActionLabels,
  acquisitionSourceLabels,
  acquisitionStatusLabels,
  acquisitionStatusTones,
  conditionLabels,
  formatDate,
  formatDateTime,
  formatMoneyCents,
  personName,
} from '../lib/inventoryLabels'

type Filter = 'active' | 'all' | typeof ACQUISITION_STATUSES[number]
type DialogKind = 'start' | 'purchase' | 'stock' | 'cancel'
type DialogState = { kind: DialogKind; acquisition: AcquisitionRow | null; idempotencyKey: string }

const VEHICLES_HREF = `${basePath}/platform/vehicles`
const ACTIVE = ['appraised', 'approved', 'purchased', 'arrived', 'reconditioning']

/** The single step this acquisition is waiting on, gated the way transitionInventoryAcquisition gates it. */
function nextAction(row: AcquisitionRow, locale: 'pt-BR' | 'en-US'): { kind: 'transition' | 'purchase' | 'stock' | 'open'; label: string; toStatus?: string } | null {
  const actionLabel = (status: string) => locale === 'pt-BR' ? ({ approved: 'Aprovar avaliação', purchased: 'Registrar compra', arrived: 'Registrar chegada', reconditioning: 'Enviar para preparação' } as Record<string, string>)[status] || status : acquisitionActionLabels[status]
  if (row.status === 'appraised') return { kind: 'transition', label: actionLabel('approved'), toStatus: 'approved' }
  if (row.status === 'approved') return { kind: 'purchase', label: actionLabel('purchased') }
  if (row.status === 'purchased') return { kind: 'transition', label: actionLabel('arrived'), toStatus: 'arrived' }
  if (row.status === 'arrived' && !row.stock) return { kind: 'stock', label: locale === 'pt-BR' ? 'Dar entrada no estoque' : 'Stock unit' }
  if (row.status === 'arrived') return { kind: 'transition', label: actionLabel('reconditioning'), toStatus: 'reconditioning' }
  if (row.status === 'reconditioning' && !row.stock) return { kind: 'stock', label: locale === 'pt-BR' ? 'Dar entrada no estoque' : 'Stock unit' }
  if (row.vehicle) return { kind: 'open', label: locale === 'pt-BR' ? 'Abrir veículo' : 'Open vehicle' }
  return null
}

export function AcquisitionsPageClient({
  initialAcquisitions,
  initialCounts,
  initialRooftops,
  initialError,
  timeZone,
  currencyCode,
}: {
  initialAcquisitions: AcquisitionRow[]
  initialCounts: Record<string, number> | null
  initialRooftops: Array<{ id: string; name: string }>
  initialError: string | null
  timeZone: string
  currencyCode: string
}) {
  const { locale, t } = useLocale()
  const pt = locale === 'pt-BR'
  const [rows, setRows] = useState(initialAcquisitions)
  const [counts, setCounts] = useState(initialCounts)
  const [rooftops, setRooftops] = useState(initialRooftops)
  const [error, setError] = useState(initialError)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<Filter>('active')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; tone: DeskTone } | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const firstRun = useRef(true)

  const money = (cents: number | null | undefined) => formatMoneyCents(cents, currencyCode, locale)
  const statusLabel = (status: string) => pt ? ({ appraised: 'Avaliado', approved: 'Aprovado', purchased: 'Comprado', arrived: 'Recebido', reconditioning: 'Em preparação', frontline: 'Pronto para venda', cancelled: 'Cancelado' } as Record<string, string>)[status] || status : acquisitionStatusLabels[status] || status
  const actionLabelForStatus = (status: string) => pt ? ({ approved: 'aprovação da avaliação', purchased: 'compra', arrived: 'chegada do veículo', reconditioning: 'preparação', frontline: 'disponibilização para venda', cancelled: 'cancelamento' } as Record<string, string>)[status] || status : acquisitionActionLabels[status] || status
  const sourceLabel = (source: string) => pt ? ({ 'trade-in': 'Veículo na troca', auction: 'Leilão', wholesale: 'Atacado', 'consumer-purchase': 'Compra de particular', 'oem-distributor': 'Montadora / distribuidor', 'dealer-transfer': 'Transferência entre lojas' } as Record<string, string>)[source] || source : acquisitionSourceLabels[source] || source
  const conditionLabel = (value: string) => pt ? ({ new: 'Novo', used: 'Usado', certified: 'Seminovo certificado' } as Record<string, string>)[value] || value : conditionLabels[value] || value
  const currencyUnit = new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode }).formatToParts(0).find(part => part.type === 'currency')?.value || currencyCode
  const formatInputMoney = (cents: number | null | undefined) => ((Number(cents) || 0) / 100).toLocaleString(locale, { minimumFractionDigits: cents && cents % 100 ? 2 : 0, maximumFractionDigits: 2 })
  const parseMoney = (value: string) => parseDollarsToCents(pt ? value.trim().replace(/\./g, '').replace(',', '.') : value)
  const mileageInput = (value: string) => {
    const raw = value.trim()
    const valid = pt ? /^\d{1,3}(\.\d{3})*$|^\d+$/.test(raw) : /^\d{1,3}(,\d{3})*$|^\d+$/.test(raw)
    return valid ? raw.replace(/[.,]/g, '') : ''
  }
  const milesFromInput = (value: string) => {
    const normalized = mileageInput(value)
    const distance = normalized ? Number(normalized) : Number.NaN
    return Number.isFinite(distance) ? (pt ? Math.round(distance / 1.609344) : distance) : Number.NaN
  }

  const load = async (nextFilter = filter, nextSearch = search) => {
    setLoading(true)
    const response = await getAcquisitions(nextFilter, nextSearch)
    if (response.success) {
      setRows(response.acquisitions)
      setCounts(response.counts)
      setRooftops(response.rooftops)
      setError(null)
    } else {
      setError(response.error)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const timer = setTimeout(() => void load(filter, search), search ? 300 : 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search])

  const selected = rows.find(row => row.id === selectedId) ?? null
  const activeCount = counts ? ACTIVE.reduce((sum, status) => sum + (counts[status] || 0), 0) : undefined
  const allCount = counts ? Object.values(counts).reduce((sum, count) => sum + count, 0) : undefined
  // Rows waiting on a desk step (not just "open vehicle"), oldest update first.
  const waiting = rows
    .filter(row => ACTIVE.includes(row.status) && nextAction(row, locale) && nextAction(row, locale)!.kind !== 'open')
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
  const filterOptions = [
    { value: 'active' as Filter, label: t('active'), count: activeCount },
    ...ACQUISITION_STATUSES.map(status => ({ value: status as Filter, label: statusLabel(status), count: counts ? counts[status] || 0 : undefined, tone: acquisitionStatusTones[status] })),
    { value: 'all' as Filter, label: t('all'), count: allCount },
  ]

  const openDialog = (kind: DialogKind, acquisition: AcquisitionRow | null, initial: Record<string, string>) => {
    setDialog({ kind, acquisition, idempotencyKey: `acquisition-${kind}:${acquisition?.id || 'new'}:${crypto.randomUUID()}` })
    setValues(initial)
    setFieldErrors({})
    setFormError(null)
    setMessage(null)
  }

  const transition = async (row: AcquisitionRow, toStatus: string) => {
    setBusy(row.id)
    setMessage(null)
    try {
      const response = await transitionInventoryAcquisition({ id: row.id, toStatus, expectedUpdatedAt: row.updatedAt, reason: t('acquisitionStepReason').replace('{step}', actionLabelForStatus(toStatus)), idempotencyKey: `acquisition-transition:${row.id}:${crypto.randomUUID()}` })
      setMessage(response.success ? { text: `${row.reference}: ${statusLabel(toStatus)}.`, tone: 'ok' } : { text: response.error, tone: 'bad' })
    } catch {
      setMessage({ text: t('unableSaveReload'), tone: 'bad' })
    } finally {
      await load()
      setBusy(null)
    }
  }

  const runNext = (row: AcquisitionRow) => {
    const action = nextAction(row, locale)
    if (!action) return
    if (action.kind === 'transition' && action.toStatus) return void transition(row, action.toStatus)
    if (action.kind === 'purchase') return openDialog('purchase', row, { purchase: formatInputMoney(row.appraisalCents), reconEstimate: row.reconEstimateCents == null ? '' : formatInputMoney(row.reconEstimateCents) })
    if (action.kind === 'stock') return openDialog('stock', row, { stockNumber: '', locationCode: 'INTAKE', condition: 'used', trim: '', exteriorColor: '', interiorColor: '' })
  }

  const submitDialog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!dialog) return
    const v = (name: string) => (values[name] || '').trim()
    const errors: FieldErrors = {}
    const cents = (name: string, label: string, required: boolean, positive = false) => {
      if (!v(name)) {
        if (required) errors[name] = t('fieldRequired').replace('{label}', label)
        return null
      }
      const parsed = parseMoney(v(name))
      if (parsed == null) errors[name] = t('amountExample').replace('{amount}', formatMoneyCents(1850000, currencyCode, locale))
      else if (positive && parsed <= 0) errors[name] = t('amountPositive').replace('{label}', label)
      return parsed
    }
    let work: (() => Promise<{ success: boolean; error?: string }>) | null = null
    let success = 'Saved.'
    const row = dialog.acquisition

    if (dialog.kind === 'start') {
      const rooftopId = v('rooftopId') || rooftops[0]?.id || ''
      if (!rooftopId) errors.rooftopId = t('chooseRooftop')
      if (!ACQUISITION_SOURCES.includes(v('acquisitionSource') as typeof ACQUISITION_SOURCES[number])) errors.acquisitionSource = t('selectSource')
      const vin = v('vin').toUpperCase()
      if (!VIN_PATTERN.test(vin)) errors.vin = t('vinRule')
      const year = Number(v('year'))
      const maxYear = new Date().getFullYear() + 2
      if (!Number.isInteger(year) || year < 1900 || year > maxYear) errors.year = t('yearRange').replace('{year}', String(maxYear))
      if (!v('make')) errors.make = t('makeRequired')
      if (!v('model')) errors.model = t('modelRequired')
      const odometer = v('odometer') ? milesFromInput(v('odometer')) : null
      if (odometer != null && (!Number.isSafeInteger(odometer) || odometer < 0)) errors.odometer = t('wholeKmOnly')
      const appraisalCents = cents('appraisal', t('appraisal'), true)
      const reconEstimateCents = cents('reconEstimate', t('reconEstimate'), false)
      if (Object.keys(errors).length === 0) {
        work = () => startInventoryAcquisition({
          rooftopId, acquisitionSource: v('acquisitionSource'), sourceReference: v('sourceReference'), vin, year, make: v('make'), model: v('model'),
          odometer, appraisalCents: appraisalCents!, reconEstimateCents, idempotencyKey: dialog.idempotencyKey,
        })
        success = t('appraisalRecordedSuccess')
      }
    } else if (dialog.kind === 'purchase' && row) {
      const purchaseCents = cents('purchase', t('purchaseAmount'), true, true)
      const reconEstimateCents = cents('reconEstimate', t('reconEstimate'), false)
      if (Object.keys(errors).length === 0) {
        work = () => transitionInventoryAcquisition({ id: row.id, toStatus: 'purchased', purchaseCents, reconEstimateCents, expectedUpdatedAt: row.updatedAt, reason: t('purchaseRecordedReason'), idempotencyKey: dialog.idempotencyKey })
        success = t('purchaseRecordedSuccess').replace('{reference}', row.reference)
      }
    } else if (dialog.kind === 'stock' && row) {
      if (!v('stockNumber')) errors.stockNumber = t('stockCodeRequired')
      else if (v('stockNumber').length > 80) errors.stockNumber = t('maxCharacters').replace('{count}', '80')
      if (!v('locationCode')) errors.locationCode = t('locationRequired')
      if (!row.vehicle && !CONDITIONS.includes(v('condition') as typeof CONDITIONS[number])) errors.condition = t('chooseCondition')
      if (Object.keys(errors).length === 0) {
        work = () => receiveAcquisitionIntoStock({
          acquisitionId: row.id, vehicleId: row.vehicle?.id, stockNumber: v('stockNumber').toUpperCase(), locationCode: v('locationCode').toUpperCase(),
          condition: v('condition') || 'used', trim: v('trim'), exteriorColor: v('exteriorColor'), interiorColor: v('interiorColor'), idempotencyKey: dialog.idempotencyKey,
        })
        success = t('stockedAs').replace('{reference}', row.reference).replace('{stock}', v('stockNumber').toUpperCase())
      }
    } else if (dialog.kind === 'cancel' && row) {
      if (!v('reason')) errors.reason = t('reasonRequired')
      if (Object.keys(errors).length === 0) {
        work = () => transitionInventoryAcquisition({ id: row.id, toStatus: 'cancelled', expectedUpdatedAt: row.updatedAt, reason: v('reason'), idempotencyKey: dialog.idempotencyKey })
        success = t('acquisitionCancelledSuccess').replace('{reference}', row.reference)
      }
    }

    setFieldErrors(errors)
    if (!work) return
    setBusy('dialog')
    setFormError(null)
    try {
      const response = await work()
      if (!response.success) {
        setFormError(response.error || t('unableSaveRetry'))
        return
      }
      setDialog(null)
      setMessage({ text: success, tone: 'ok' })
      await load()
    } catch {
      setFormError(t('unableSaveRetry'))
    } finally {
      setBusy(null)
    }
  }

  const dialogConfig: Record<DialogKind, { title: string; fields: InventoryFormField[]; submitLabel: string }> = {
    start: { title: 'Appraise a unit', submitLabel: 'Record appraisal', fields: [
      ...(rooftops.length > 1 ? [{ name: 'rooftopId', label: t('rooftop'), type: 'select' as const, placeholder: t('selectRooftop'), options: rooftops.map(rooftop => ({ value: rooftop.id, label: rooftop.name })), wide: true }] : []),
      { name: 'acquisitionSource', label: t('source'), type: 'select', placeholder: t('selectSource'), options: ACQUISITION_SOURCES.map(value => ({ value, label: sourceLabel(value) })) },
      { name: 'sourceReference', label: t('sourceReference'), maxLength: 200, required: false, placeholder: t('sourceReferencePlaceholder') },
      { name: 'vin', label: t('chassisVin'), maxLength: 17, wide: true },
      { name: 'year', label: t('modelYear'), type: 'number', min: 1900 },
      { name: 'odometer', label: `${t('odometer')} (${pt ? 'km' : 'mi'})`, type: 'number', min: 0, required: false },
      { name: 'make', label: t('make'), maxLength: 100 },
      { name: 'model', label: t('model'), maxLength: 100 },
      { name: 'appraisal', label: `${t('appraisal')} (${currencyUnit})`, type: 'money' },
      { name: 'reconEstimate', label: `${t('reconEstimate')} (${currencyUnit})`, type: 'money', required: false },
    ] },
    purchase: { title: t('recordPurchase'), submitLabel: t('recordPurchase'), fields: [
      { name: 'purchase', label: `${t('purchaseAmount')} (${currencyUnit})`, type: 'money' },
      { name: 'reconEstimate', label: `${t('reconEstimate')} (${currencyUnit})`, type: 'money', required: false },
    ] },
    stock: { title: t('stockUnit'), submitLabel: t('stockUnit'), fields: [
      { name: 'stockNumber', label: t('stockCode'), maxLength: 80 },
      { name: 'locationCode', label: t('lotLocation'), maxLength: 80 },
      ...(dialog?.acquisition?.vehicle ? [] : [
        { name: 'condition', label: t('vehicleCondition'), type: 'select' as const, placeholder: t('chooseCondition'), options: CONDITIONS.map(value => ({ value, label: conditionLabel(value) })) },
        { name: 'trim', label: t('trim'), maxLength: 100, required: false },
        { name: 'exteriorColor', label: t('exteriorColor'), maxLength: 100, required: false },
        { name: 'interiorColor', label: t('interiorColor'), maxLength: 100, required: false },
      ]),
    ] },
    cancel: { title: t('cancelAcquisition'), submitLabel: t('cancelAcquisition'), fields: [{ name: 'reason', label: t('reason'), type: 'textarea', maxLength: 500 }] },
  }
  const config = dialog ? dialogConfig[dialog.kind] : null

  const breadcrumbs = [
    { type: 'link' as const, label: t('dashboard'), href: basePath },
    { type: 'page' as const, label: t('platform') },
    { type: 'link' as const, label: t('inventory'), href: VEHICLES_HREF },
    { type: 'page' as const, label: t('acquisitions') },
  ]
  const header = (
    <DeskHeader
      eyebrow={<Link href={VEHICLES_HREF} className="inline-flex min-h-11 items-center gap-1 hover:text-foreground sm:min-h-0"><ArrowLeft className="size-3" /> {t('inventory')}</Link>}
      title={t('acquisitions')}
      tone={error ? 'bad' : activeCount ? 'info' : 'idle'}
      status={error ? t('unavailable') : t('activeCount').replace('{count}', String(activeCount ?? 0))}
      meta={activeCount !== undefined ? `${t('activeCount').replace('{count}', String(activeCount))} · ${t('waitingOnStep').replace('{count}', String(waiting.length))} · ${t('frontlineCount').replace('{count}', String(counts?.frontline || 0))}` : undefined}
      actions={
        <Track>
          <Pill variant="plain" onClick={() => void load()} disabled={loading} aria-label={t('refresh')}><RefreshCw className={loading ? 'animate-spin' : undefined} /><span className="max-sm:sr-only">{t('refresh')}</span></Pill>
          <Pill variant="primary" disabled={!rooftops.length || Boolean(busy)} title={rooftops.length ? undefined : t('noActiveUnit')} onClick={() => openDialog('start', null, { rooftopId: rooftops[0]?.id || '', acquisitionSource: 'trade-in', sourceReference: '', vin: '', year: String(new Date().getFullYear() - 3), odometer: '', make: '', model: '', appraisal: '', reconEstimate: '' })}>
            <Plus /> {t('appraise')}
          </Pill>
        </Track>
      }
    />
  )

  const renderActions = (row: AcquisitionRow, inSheet = false) => {
    const action = nextAction(row, locale)
    const terminal = row.status === 'frontline' || row.status === 'cancelled'
    return (
      <Track>
        {action && (action.kind === 'open' && row.vehicle
          ? <Pill size={inSheet ? 'md' : 'sm'} variant={inSheet ? 'primary' : undefined} className="max-md:h-10" asChild><Link href={`${VEHICLES_HREF}/${row.vehicle.id}`}>{action.label}</Link></Pill>
          : <Pill size={inSheet ? 'md' : 'sm'} variant={inSheet ? 'primary' : undefined} className="max-md:h-10" disabled={Boolean(busy)} onClick={() => runNext(row)}>{action.label}</Pill>)}
        {row.vehicle && action?.kind !== 'open' && <Pill size={inSheet ? 'md' : 'sm'} variant={inSheet ? undefined : 'plain'} className="max-md:h-10" asChild><Link href={`${VEHICLES_HREF}/${row.vehicle.id}`}>{t('vehicle')}</Link></Pill>}
        {!inSheet && <Pill size="sm" variant="plain" className="max-md:h-10" onClick={() => setSelectedId(row.id)}>{t('details')}</Pill>}
        {inSheet && !terminal && <Pill variant="danger" disabled={Boolean(busy)} onClick={() => openDialog('cancel', row, { reason: '' })}>{t('cancel')}</Pill>}
      </Track>
    )
  }

  return (
    <PageContainer title={t('acquisitions')} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-6 px-4 pb-24 md:px-6">
        {message && <Notice tone={message.tone}>{message.text}</Notice>}

        {!error && !(loading && rows.length === 0) && (
          <DeskSection title={t('needsYou')} count={waiting.length} id="acquisitions-needs-you">
            {waiting.length === 0 ? (
              <p className="py-3 text-[13px] text-muted-foreground">{t('noAcquisitionsWaiting')}</p>
            ) : (
              <DeskTable aria-label={t('noAcquisitionsWaiting')}>
                <thead>
                  <tr>
                    <Th>{t('vehicle')}</Th>
                    <Th priority={2}>{t('status')}</Th>
                    <Th priority={2}>{t('waitingSince')}</Th>
                    <Th align="right"><span className="sr-only">{t('nextStep')}</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {waiting.map(row => (
                    <Tr key={row.id}>
                      <Td className="min-w-0">
                        <p className="break-words font-medium text-foreground">{row.year} {row.make} {row.model}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Code>{row.reference}</Code>
                          <span className="md:hidden"><Status tone={acquisitionStatusTones[row.status]}>{statusLabel(row.status)}</Status></span>
                        </div>
                      </Td>
                      <Td priority={2}><Status tone={acquisitionStatusTones[row.status]}>{statusLabel(row.status)}</Status></Td>
                      <Td priority={2} className="whitespace-nowrap text-muted-foreground">{formatDate(row.updatedAt, timeZone, locale)}</Td>
                      <Td align="right" className="whitespace-nowrap">
                        <Pill size="sm" className="max-md:h-10" disabled={Boolean(busy)} onClick={() => runNext(row)}>{nextAction(row, locale)?.label}</Pill>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </DeskTable>
            )}
          </DeskSection>
        )}

        <DeskSection title={filter === 'active' ? t('pipeline') : filter === 'all' ? t('allAcquisitions') : statusLabel(filter)} count={loading || error ? undefined : rows.length}>
          <div className="mb-3 flex min-w-0 flex-col gap-3">
            <Segmented label={t('filterByStatus')} value={filter} onChange={setFilter} options={filterOptions} className="self-stretch" />
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder={t('acquisitionSearchPlaceholder')} value={search} onChange={event => setSearch(event.target.value)} className="rounded-[4px] pl-9 max-md:h-10" aria-label={t('searchAcquisitions')} />
            </div>
          </div>
          {loading && rows.length === 0 ? (
            <div className="flex justify-center py-12" role="status"><RefreshCw className="size-5 animate-spin text-muted-foreground" aria-hidden="true" /><span className="sr-only">{t('loadingAcquisitions')}</span></div>
          ) : error ? (
            <Notice tone="bad">
              <p className="font-medium">{t('unableLoadAcquisitions')}</p>
              <p className="mt-0.5 text-muted-foreground">{error}</p>
              <Track className="mt-2"><Pill size="sm" onClick={() => void load()}>{t('retry')}</Pill></Track>
            </Notice>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">{search || filter !== 'active' ? t('noMatches') : t('noAcquisitionsInProgress')}</p>
              {(search || filter !== 'active') && <Track><Pill size="sm" onClick={() => { setSearch(''); setFilter('active') }}>{t('resetFilters')}</Pill></Track>}
            </div>
          ) : (
            <DeskTable aria-label={t('acquisitions')}>
              <thead>
                <tr>
                  <Th>{t('vehicle')}</Th>
                  <Th priority={3}>{t('source')}</Th>
                  <Th priority={2}>{t('status')}</Th>
                  <Th align="right" priority={2}>{t('appraisal')}</Th>
                  <Th align="right">{t('purchase')}</Th>
                  <Th priority={3}>{t('updatedAt')}</Th>
                  <Th align="right" priority={2}><span className="sr-only">{t('actions')}</span></Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <Tr key={row.id}>
                    <Td className="min-w-0">
                      <p className="break-words font-medium text-foreground">{row.year} {row.make} {row.model}</p>
                      <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <Code className="text-foreground">{row.reference}</Code>
                        <Code><span title={row.vin}>…{row.vin.slice(-8)}</span></Code>
                        {row.vehicle?.stockNumber && <span>{t('stockCode')} <Code>{row.vehicle.stockNumber}</Code></span>}
                        {rooftops.length > 1 && row.rooftop?.name && <span>{row.rooftop.name}</span>}
                      </p>
                      <div className="mt-1 md:hidden"><Status tone={acquisitionStatusTones[row.status]}>{statusLabel(row.status)}</Status></div>
                      <div className="mt-2 md:hidden">{renderActions(row)}</div>
                    </Td>
                      <Td priority={3} className="whitespace-nowrap text-muted-foreground">{sourceLabel(row.acquisitionSource)}</Td>
                      <Td priority={2}><Status tone={acquisitionStatusTones[row.status]}>{statusLabel(row.status)}</Status></Td>
                    <Td align="right" priority={2} className="whitespace-nowrap text-muted-foreground">{money(row.appraisalCents)}</Td>
                    <Td align="right" className="align-top md:align-middle"><span className="sr-only">{t('purchase')} </span><Figure size="sm">{money(row.purchaseCents)}</Figure></Td>
                    <Td priority={3} className="whitespace-nowrap text-muted-foreground">{formatDate(row.updatedAt, timeZone, locale)}</Td>
                    <Td align="right" priority={2} className="whitespace-nowrap"><div className="flex justify-end">{renderActions(row)}</div></Td>
                  </Tr>
                ))}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>

        <Sheet open={Boolean(selected)} onOpenChange={open => { if (!open) setSelectedId(null) }}>
          <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
            {selected && (
              <>
                <SheetHeader>
                  <SheetTitle>
                      <TitleLine as="span" tone={acquisitionStatusTones[selected.status]} status={statusLabel(selected.status)}>{selected.year} {selected.make} {selected.model}</TitleLine>
                  </SheetTitle>
                  <SheetDescription className="text-[13px]"><Code>{selected.reference}</Code> · {statusLabel(selected.status)}</SheetDescription>
                </SheetHeader>
                <div className="space-y-6 px-4 pb-24">
                  {renderActions(selected, true)}
                  <Facts items={[
                    { label: t('chassisVin'), value: selected.vin, mono: true },
                    { label: t('source'), value: sourceLabel(selected.acquisitionSource) },
                    Boolean(selected.sourceReference) && { label: t('sourceReference'), value: selected.sourceReference, mono: true },
                    { label: t('odometer'), value: selected.odometer == null ? '-' : `${(pt ? Math.round(selected.odometer * 1.609344) : selected.odometer).toLocaleString(locale)} ${pt ? 'km' : 'mi'}`, mono: true },
                    { label: t('appraisal'), value: money(selected.appraisalCents), mono: true },
                    { label: t('purchase'), value: money(selected.purchaseCents), mono: true },
                    { label: t('reconEstimate'), value: money(selected.reconEstimateCents), mono: true },
                    { label: t('purchasedAt'), value: formatDate(selected.purchasedAt, timeZone, locale) },
                    { label: t('arrivedAt'), value: formatDate(selected.arrivedAt, timeZone, locale) },
                    { label: t('readyForSale'), value: formatDate(selected.frontlineAt, timeZone, locale) },
                    { label: t('inventory'), value: selected.vehicle?.stockNumber || (selected.stock ? t('stockStatus') : t('notStocked')), mono: Boolean(selected.vehicle?.stockNumber) },
                    { label: t('requestedBy'), value: personName(selected.requestedBy, locale) },
                    rooftops.length > 1 && { label: t('rooftop'), value: selected.rooftop?.name || '-' },
                  ]} />
                  {ACQUISITION_NEXT[selected.status] === 'frontline' && <Notice tone="idle">{t('reconPendingNotice')}</Notice>}
                  <DeskSection title={t('history')} count={selected.events.length}>
                    <ol className="space-y-3 border-l pl-4">
                      {selected.events.map(event => (
                        <li key={event.id} className="relative text-sm">
                          <span aria-hidden="true" className="absolute -left-[21px] top-1.5 size-2 rounded-[1px] bg-muted-foreground/40" />
                          <p className="font-medium">{event.fromStatus ? `${statusLabel(event.fromStatus)} ${pt ? 'para' : 'to'} ${statusLabel(event.toStatus)}` : statusLabel(event.toStatus)}</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(event.occurredAt, timeZone, locale)} · {personName(event.actor, locale)}</p>
                          <p className="break-words text-xs text-muted-foreground">{event.reason}</p>
                        </li>
                      ))}
                    </ol>
                  </DeskSection>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>

        {dialog && config && (
          <InventoryFormDialog
            open
            title={config.title}
            description={dialog.acquisition ? `${dialog.acquisition.reference} · ${dialog.acquisition.year} ${dialog.acquisition.make} ${dialog.acquisition.model}` : undefined}
            fields={config.fields}
            values={values}
            errors={fieldErrors}
            formError={formError}
            busy={busy === 'dialog'}
            submitLabel={config.submitLabel}
            onValuesChange={setValues}
            onSubmit={submitDialog}
            onOpenChange={open => { if (!open && busy !== 'dialog') setDialog(null) }}
          />
        )}
      </div>
    </PageContainer>
  )
}
