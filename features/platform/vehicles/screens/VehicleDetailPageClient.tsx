'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Pencil, Plus, RefreshCw } from 'lucide-react'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import {
  Attention,
  Code,
  DeskHeader,
  DeskSection,
  DeskTable,
  Facts,
  Notice,
  Panel,
  Pill,
  Status,
  Td,
  Th,
  TitleLine,
  Tr,
  Track,
  type DeskTone,
} from '@/features/platform/components/desk'
import { formatCentsForInput, parseDollarsToCents } from '@/features/platform/deals/lib/moneyInput'
import { recordReference, countLabel } from '@/features/platform/lib/format'
import {
  decideInventoryMerchandising,
  moveInventoryStock,
  openInventoryReconWorkItem,
  recordInventoryCost,
  submitInventoryMerchandising,
  transitionInventoryAcquisition,
  transitionInventoryReconWorkItem,
} from '../actions'
import {
  getInventoryVehicleDetail,
  saveConditionReport,
  saveVehicleHistory,
  updateInventoryVehicleDetails,
  type ConditionReport,
  type ReconWorkItem,
  type Section,
  type StaffOption,
  type VehicleDetail,
} from '../actions/detail'
import { LiveVehiclePhotos } from '../components/VehiclePhotos'
import { Windshield, WindshieldFigure } from '../components/Windshield'
import { InventoryFormDialog, type FieldErrors, type InventoryFormField } from '../components/InventoryFormDialog'
import {
  COST_TYPES,
  CONDITIONS,
  RATINGS,
  RECON_CATEGORIES,
  VIN_PATTERN,
  acquisitionSourceLabels,
  acquisitionStatusLabels,
  acquisitionStatusTones,
  conditionLabels,
  costTypeLabels,
  dealStatusLabels,
  eventTypeLabel,
  feedStatusLabels,
  feedStatusTones,
  formatDate,
  formatDateTime,
  formatMoneyCents,
  merchandisingStatusLabels,
  merchandisingStatusTones,
  personName,
  ratingLabels,
  reconCategoryLabels,
  reconStatusLabels,
  reconStatusTones,
  vehicleStatusLabels,
  vehicleStatusTones,
} from '../lib/inventoryLabels'

type DialogKind = 'details' | 'move' | 'cost' | 'recon-open' | 'recon-complete' | 'recon-cancel' | 'reject' | 'condition' | 'history'
type DialogState = { kind: DialogKind; targetId?: string; idempotencyKey: string }

const VEHICLES_HREF = `${basePath}/platform/vehicles`
const ACTIVE_STATUSES = ['available', 'service']

function key(kind: string) {
  return `vehicle-detail-${kind}:${crypto.randomUUID()}`
}

function lotStage(status: string, frontlineAt: string | null | undefined) {
  return status === 'service' && !frontlineAt ? 'prep' : status
}

function featureLines(value: string) {
  return [...new Set(value.split(/[\n,]/).map(item => item.trim()).filter(Boolean))]
}

function SectionError({ section, children }: { section: Section<unknown>; children: ReactNode }) {
  if (!section.ok) return <Notice tone="warn">Not available: {section.error}</Notice>
  return <>{children}</>
}

function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
}

export function VehicleDetailPageClient({
  id,
  initialDetail,
  initialError,
  timeZone,
  currencyCode,
  staff,
}: {
  id: string
  initialDetail: VehicleDetail | null
  initialError: string | null
  timeZone: string
  currencyCode: string
  staff: StaffOption[]
}) {
  const [detail, setDetail] = useState<VehicleDetail | null>(initialDetail)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; tone: DeskTone } | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  const money = (cents: number | null | undefined) => formatMoneyCents(cents, currencyCode)

  const reload = async () => {
    setLoading(true)
    const response = await getInventoryVehicleDetail(id)
    if (response.success) {
      setDetail(response.detail)
      setError(null)
    } else {
      setError(response.error)
    }
    setLoading(false)
  }

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'page' as const, label: 'Platform' },
    { type: 'link' as const, label: 'Inventory', href: VEHICLES_HREF },
    { type: 'page' as const, label: detail ? detail.vehicle.stockNumber || 'Vehicle' : 'Vehicle' },
  ]

  if (!detail) {
    return (
      <PageContainer title="Vehicle" breadcrumbs={breadcrumbs} header={<DeskHeader title="Vehicle" tone="bad" status="Unavailable" />}>
        <div className="space-y-4 px-4 pb-24 md:px-6">
          <Notice tone="bad">{error || 'Vehicle not found'}</Notice>
          <Track>
            <Pill onClick={reload} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : undefined} /> Retry</Pill>
            <Pill asChild variant="plain"><Link href={VEHICLES_HREF}><ArrowLeft /> Inventory</Link></Pill>
          </Track>
        </div>
      </PageContainer>
    )
  }

  const { vehicle, stock } = detail
  const stage = lotStage(vehicle.status, stock?.frontlineAt)
  const editable = Boolean(stock) && ACTIVE_STATUSES.includes(vehicle.status)
  const notEditableReason = !stock ? 'Not stocked' : `${vehicleStatusLabels[vehicle.status] || vehicle.status} units cannot be edited`
  const reconItems = detail.reconWorkItems.ok ? detail.reconWorkItems.data : []
  const versions = detail.merchandisingVersions.ok ? detail.merchandisingVersions.data : []
  const latestVersion = versions[0] ?? null
  const acquisition = detail.acquisition.ok ? detail.acquisition.data : null
  const activeDeal = detail.deals.ok ? detail.deals.data.find(deal => deal.status !== 'cancelled') ?? null : null
  const reconDone = stock?.reconStatus === 'completed'
  const listingApproved = stock?.merchandisingStatus === 'approved'
  const needsPhotos = detail.images.length === 0
  const needsDetails = !vehicle.description.trim() || !(Number(vehicle.priceCents) > 0)
  const publicAction = stock?.publicListing.action ?? null

  const run = async (label: string, work: () => Promise<{ success: boolean; error?: string }>, success: string) => {
    setBusy(label)
    setMessage(null)
    try {
      const response = await work()
      if (response.success) setMessage({ text: success, tone: 'ok' })
      else setMessage({ text: response.error || 'Unable to save.', tone: 'bad' })
    } catch {
      setMessage({ text: 'Unable to save. Reload to check the current state.', tone: 'bad' })
    } finally {
      await reload()
      setBusy(null)
    }
  }

  const openDialog = (kind: DialogKind, initial: Record<string, string>, targetId?: string) => {
    setDialog({ kind, targetId, idempotencyKey: key(kind) })
    setValues(initial)
    setFieldErrors({})
    setFormError(null)
    setMessage(null)
  }
  const closeDialog = () => {
    if (busy === 'dialog') return
    setDialog(null)
  }

  // Actions -------------------------------------------------------------------------------------

  const submitListing = () => stock && run('listing', () => submitInventoryMerchandising({ stockId: stock.id, reason: 'Submitted from the vehicle page', idempotencyKey: key('submit') }), 'Listing submitted for approval.')
  const approveVersion = (versionId: string, updatedAt: string, reapprove = false) => run('listing', () => decideInventoryMerchandising({
    id: versionId, decision: 'approved', reason: reapprove ? 'Re-approved from the vehicle page' : 'Approved from the vehicle page', expectedUpdatedAt: updatedAt, idempotencyKey: key('approve'),
  }), reapprove ? 'Listing re-approved.' : 'Listing approved.')
  const startRecon = (item: ReconWorkItem) => run(item.id, () => transitionInventoryReconWorkItem({ id: item.id, toStatus: 'in-progress', expectedUpdatedAt: item.updatedAt, reason: 'Started from the vehicle page', idempotencyKey: key('recon-start') }), 'Work started.')
  const advanceAcquisition = (toStatus: 'reconditioning' | 'frontline') => acquisition && run('acquisition', () => transitionInventoryAcquisition({
    id: acquisition.id, toStatus, expectedUpdatedAt: acquisition.updatedAt, reason: toStatus === 'frontline' ? 'Marked frontline from the vehicle page' : 'Sent to recon from the vehicle page', idempotencyKey: key('acquisition'),
  }), toStatus === 'frontline' ? 'Marked frontline.' : 'Sent to recon.')

  const openDetails = () => openDialog('details', {
    vin: vehicle.vin, year: String(vehicle.year), condition: vehicle.condition || 'used', make: vehicle.make, model: vehicle.model, trim: vehicle.trim,
    exteriorColor: vehicle.exteriorColor, interiorColor: vehicle.interiorColor, mileage: vehicle.mileage == null ? '' : String(vehicle.mileage),
    retail: vehicle.priceCents == null ? '' : formatCentsForInput(vehicle.priceCents), list: vehicle.listPriceCents == null ? '' : formatCentsForInput(vehicle.listPriceCents),
    priceChangeReason: '', features: vehicle.features.join('\n'), description: vehicle.description,
  })
  const openCondition = (report?: ConditionReport) => openDialog('condition', report ? {
    reportDate: new Date(report.reportDate).toLocaleDateString('en-CA', { timeZone }), inspector: report.inspector, overallCondition: report.overallCondition || '',
    mechanicalRating: report.mechanicalRating || '', bodyRating: report.bodyRating || '', interiorRating: report.interiorRating || '',
    issues: report.issues.map(issue => issue.description).join('\n'), estimatedRepairs: report.estimatedRepairs == null ? '' : String(report.estimatedRepairs), notes: report.notes,
  } : { reportDate: new Date().toLocaleDateString('en-CA', { timeZone }), inspector: '', overallCondition: '', mechanicalRating: '', bodyRating: '', interiorRating: '', issues: '', estimatedRepairs: '', notes: '' }, report?.id)
  const openHistory = () => {
    const history = detail.history
    openDialog('history', {
      acquisitionDate: history?.acquisitionDate ? new Date(history.acquisitionDate).toLocaleDateString('en-CA', { timeZone }) : '',
      acquisitionSource: history?.acquisitionSource || (acquisition ? acquisitionSourceLabels[acquisition.acquisitionSource] || acquisition.acquisitionSource : ''),
      previousOwners: history?.previousOwners == null ? '' : String(history.previousOwners), hasAccidents: history?.hasAccidents ? 'yes' : '',
      accidentDetails: history?.accidentDetails || '', serviceRecords: history?.serviceRecords || '', titleStatus: history?.titleStatus || '', notes: history?.notes || '',
    }, history?.id)
  }

  const submitDialog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!dialog) return
    const v = (name: string) => (values[name] || '').trim()
    const errors: FieldErrors = {}
    const cents = (name: string, label: string, { required = false, positive = false } = {}) => {
      if (!v(name)) {
        if (required) errors[name] = `${label} is required`
        return null
      }
      const parsed = parseDollarsToCents(v(name))
      if (parsed == null) errors[name] = `Enter an amount such as $33,450`
      else if (positive && parsed <= 0) errors[name] = `${label} must be more than zero`
      return parsed
    }
    const whole = (name: string, label: string, { required = false, max = 2_000_000 } = {}) => {
      if (!v(name)) {
        if (required) errors[name] = `${label} is required`
        return null
      }
      const parsed = Number(v(name).replace(/,/g, ''))
      if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > max) {
        errors[name] = `${label} must be a whole number`
        return null
      }
      return parsed
    }
    const requireText = (name: string, label: string) => { if (!v(name)) errors[name] = `${label} is required` }

    let work: (() => Promise<{ success: boolean; error?: string; rejected?: boolean }>) | null = null
    let success = 'Saved.'
    if (dialog.kind === 'details' && stock) {
      const vin = v('vin').toUpperCase()
      if (!VIN_PATTERN.test(vin)) errors.vin = '17 characters, no I, O or Q'
      const year = whole('year', 'Model year', { required: true, max: 9999 })
      const maxYear = new Date().getFullYear() + 2
      if (year != null && (year < 1900 || year > maxYear)) errors.year = `Between 1900 and ${maxYear}`
      requireText('make', 'Make')
      requireText('model', 'Model')
      const mileage = whole('mileage', 'Odometer')
      const priceCents = cents('retail', 'Retail price', { required: true, positive: true })
      const listPriceCents = cents('list', 'List price')
      const features = featureLines(values.features || '')
      if (features.some(feature => feature.length > 200)) errors.features = 'Each feature must be at most 200 characters'
      if (features.length > 100) errors.features = 'At most 100 features'
      if (Object.keys(errors).length === 0) {
        work = () => updateInventoryVehicleDetails({
          stockId: stock.id, vehicleId: vehicle.id, vin, year: year!, make: v('make'), model: v('model'), trim: v('trim'),
          exteriorColor: v('exteriorColor'), interiorColor: v('interiorColor'), condition: v('condition') || 'used', mileage,
          features, priceCents: priceCents!, listPriceCents: listPriceCents ?? priceCents!, description: values.description || '',
          priceChangeReason: v('priceChangeReason'), expectedUpdatedAt: stock.updatedAt, idempotencyKey: dialog.idempotencyKey,
        })
        success = stock.merchandisingStatus === 'draft' ? 'Details saved.' : 'Details saved. The listing is back in draft.'
      }
    } else if (dialog.kind === 'move' && stock) {
      requireText('locationCode', 'Location')
      if (Object.keys(errors).length === 0) {
        work = () => moveInventoryStock({ stockId: stock.id, locationCode: v('locationCode').toUpperCase(), locationLabel: v('locationLabel') || v('locationCode').toUpperCase(), expectedUpdatedAt: stock.updatedAt, reason: 'Moved from the vehicle page', idempotencyKey: dialog.idempotencyKey })
        success = 'Unit moved.'
      }
    } else if (dialog.kind === 'cost' && stock) {
      if (!COST_TYPES.includes(v('costType') as typeof COST_TYPES[number])) errors.costType = 'Choose a cost type'
      const amountCents = cents('amount', 'Amount', { required: true, positive: true })
      if (Object.keys(errors).length === 0) {
        work = () => recordInventoryCost({ stockId: stock.id, costType: v('costType'), amountCents: amountCents!, reference: v('reference') || undefined, reason: 'Cost recorded from the vehicle page', idempotencyKey: dialog.idempotencyKey })
        success = 'Cost recorded.'
      }
    } else if (dialog.kind === 'recon-open' && stock) {
      requireText('title', 'Work item')
      if (!RECON_CATEGORIES.includes(v('category') as typeof RECON_CATEGORIES[number])) errors.category = 'Choose a category'
      const estimatedCostCents = cents('estimate', 'Estimate')
      if (v('dueAt') && Number.isNaN(new Date(`${v('dueAt')}T12:00:00`).getTime())) errors.dueAt = 'Enter a valid date'
      if (Object.keys(errors).length === 0) {
        work = () => openInventoryReconWorkItem({
          stockId: stock.id, title: v('title'), category: v('category'), estimatedCostCents: estimatedCostCents ?? 0, vendorName: v('vendorName'),
          assignedToId: v('assignedToId') || null, dueAt: v('dueAt') ? new Date(`${v('dueAt')}T12:00:00`).toISOString() : null,
          reason: 'Opened from the vehicle page', idempotencyKey: dialog.idempotencyKey,
        })
        success = 'Work item added.'
      }
    } else if (dialog.kind === 'recon-complete' || dialog.kind === 'recon-cancel') {
      const item = reconItems.find(entry => entry.id === dialog.targetId)
      const actualCostCents = dialog.kind === 'recon-complete' ? cents('actual', 'Actual cost', { required: true }) : null
      if (dialog.kind === 'recon-cancel') requireText('reason', 'Reason')
      if (item && Object.keys(errors).length === 0) {
        work = () => transitionInventoryReconWorkItem({
          id: item.id, toStatus: dialog.kind === 'recon-complete' ? 'completed' : 'cancelled', actualCostCents: actualCostCents ?? undefined,
          expectedUpdatedAt: item.updatedAt, reason: dialog.kind === 'recon-complete' ? 'Completed from the vehicle page' : v('reason'), idempotencyKey: dialog.idempotencyKey,
        })
        success = dialog.kind === 'recon-complete' ? 'Work completed.' : 'Work item cancelled.'
      }
    } else if (dialog.kind === 'reject') {
      const version = versions.find(entry => entry.id === dialog.targetId)
      requireText('reason', 'Reason')
      if (version && Object.keys(errors).length === 0) {
        work = () => decideInventoryMerchandising({ id: version.id, decision: 'rejected', reason: v('reason'), expectedUpdatedAt: version.updatedAt, idempotencyKey: dialog.idempotencyKey })
        success = 'Listing rejected.'
      }
    } else if (dialog.kind === 'condition') {
      if (!v('reportDate') || Number.isNaN(new Date(`${v('reportDate')}T12:00:00`).getTime())) errors.reportDate = 'Enter a valid date'
      const estimatedRepairs = whole('estimatedRepairs', 'Estimated repairs', { max: 10_000_000 })
      if (!v('overallCondition')) errors.overallCondition = 'Choose an overall rating'
      if (Object.keys(errors).length === 0) {
        work = () => saveConditionReport({
          id: dialog.targetId, vehicleId: vehicle.id, rooftopId: vehicle.rooftopId, reportDate: new Date(`${v('reportDate')}T12:00:00`).toISOString(),
          inspector: v('inspector'), overallCondition: v('overallCondition'), mechanicalRating: v('mechanicalRating'), bodyRating: v('bodyRating'),
          interiorRating: v('interiorRating'), issues: (values.issues || '').split('\n'), estimatedRepairs, notes: values.notes || '',
        })
        success = 'Condition report saved.'
      }
    } else if (dialog.kind === 'history') {
      if (v('acquisitionDate') && Number.isNaN(new Date(`${v('acquisitionDate')}T12:00:00`).getTime())) errors.acquisitionDate = 'Enter a valid date'
      const previousOwners = whole('previousOwners', 'Previous owners', { max: 99 })
      if (values.hasAccidents === 'yes' && !v('accidentDetails')) errors.accidentDetails = 'Describe the accident history'
      if (Object.keys(errors).length === 0) {
        work = () => saveVehicleHistory({
          id: dialog.targetId, vehicleId: vehicle.id, rooftopId: vehicle.rooftopId,
          acquisitionDate: v('acquisitionDate') ? new Date(`${v('acquisitionDate')}T12:00:00`).toISOString() : '',
          acquisitionSource: v('acquisitionSource'), previousOwners, hasAccidents: values.hasAccidents === 'yes', accidentDetails: values.accidentDetails || '',
          serviceRecords: values.serviceRecords || '', titleStatus: v('titleStatus'), notes: values.notes || '',
        })
        success = 'Vehicle history saved.'
      }
    }

    setFieldErrors(errors)
    if (!work) return
    setBusy('dialog')
    setFormError(null)
    try {
      const response = await work()
      if (!response.success) {
        setFormError(response.error || 'Unable to save.')
        return
      }
      setDialog(null)
      setMessage({ text: success, tone: 'ok' })
      await reload()
    } catch {
      setFormError('Unable to save. Your entries are kept so you can retry.')
    } finally {
      setBusy(null)
    }
  }

  // Next step: the same one-action-at-a-time order as the inventory desk -------------------------

  const activeRecon = reconItems.find(item => ['open', 'in-progress'].includes(item.status)) ?? null
  let nextStep: { label: string; onClick: () => void; disabledReason?: string } | null = null
  if (stock && editable) {
    if (acquisition?.status === 'arrived') nextStep = { label: 'Send to recon', onClick: () => advanceAcquisition('reconditioning') }
    else if (!reconDone) {
      nextStep = !activeRecon
        ? { label: 'Add work item', onClick: () => openDialog('recon-open', { title: '', category: 'inspection', estimate: '', vendorName: '', assignedToId: '', dueAt: '' }) }
        : activeRecon.status === 'in-progress'
          ? { label: 'Finish work', onClick: () => openDialog('recon-complete', { actual: '' }, activeRecon.id) }
          : { label: 'Start work', onClick: () => startRecon(activeRecon) }
    } else if (!listingApproved || publicAction) {
      if (publicAction === 'reapprove' && latestVersion) nextStep = { label: 'Re-approve listing', onClick: () => approveVersion(latestVersion.id, latestVersion.updatedAt, true) }
      else if (stock.merchandisingStatus === 'submitted' && latestVersion?.status === 'submitted') nextStep = { label: 'Approve listing', onClick: () => approveVersion(latestVersion.id, latestVersion.updatedAt) }
      else if (needsPhotos) nextStep = { label: 'Add photos', onClick: () => document.getElementById('vehicle-photos')?.scrollIntoView({ behavior: 'smooth' }) }
      else if (needsDetails) nextStep = { label: 'Add description', onClick: openDetails }
      else nextStep = { label: publicAction === 'resubmit' ? 'Resubmit listing' : 'Submit listing', onClick: () => void submitListing() }
    } else if (acquisition?.status === 'reconditioning') nextStep = { label: 'Mark frontline', onClick: () => advanceAcquisition('frontline') }
  }

  // Render ----------------------------------------------------------------------------------------

  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}`
  // Aged per the existing 60-day mark; a sold unit's clock has stopped.
  const aged = Boolean(stock) && vehicle.status !== 'sold' && stock!.daysInStock != null && stock!.daysInStock >= 60
  const stateLine = [
    vehicleStatusLabels[stage] || stage,
    stock ? (stock.publicListing.live ? 'live on storefront' : 'not live') : 'not stocked',
    nextStep ? `next: ${nextStep.label.toLowerCase()}` : null,
  ].filter(Boolean).join(' · ')
  const header = (
    <DeskHeader
      eyebrow={<Link href={VEHICLES_HREF} className="inline-flex min-h-11 items-center gap-1 hover:text-foreground sm:min-h-0"><ArrowLeft className="size-3" /> Inventory</Link>}
      title={title}
      tone={vehicleStatusTones[stage] || 'idle'}
      status={vehicleStatusLabels[stage] || stage}
      meta={<span className="flex flex-wrap gap-x-3 gap-y-1"><span className="font-medium text-foreground">{stateLine}</span><Code>{vehicle.vin}</Code>{vehicle.rooftopName && <span>{vehicle.rooftopName}</span>}</span>}
      actions={
        <Track>
          <Pill variant="plain" onClick={reload} disabled={loading} aria-label="Refresh"><RefreshCw className={loading ? 'animate-spin' : undefined} /><span className="max-sm:sr-only">Refresh</span></Pill>
          <Pill onClick={openDetails} disabled={!editable || Boolean(busy)} title={editable ? undefined : notEditableReason}><Pencil /> Edit</Pill>
          {nextStep && <Pill variant="primary" onClick={nextStep.onClick} disabled={Boolean(busy)}>{nextStep.label}</Pill>}
        </Track>
      }
    />
  )

  const detailsFields: InventoryFormField[] = [
    { name: 'vin', label: 'VIN', maxLength: 17, wide: true },
    { name: 'year', label: 'Model year', type: 'number', min: 1900 },
    { name: 'condition', label: 'Condition', type: 'select', options: CONDITIONS.map(value => ({ value, label: conditionLabels[value] })) },
    { name: 'make', label: 'Make', maxLength: 100 },
    { name: 'model', label: 'Model', maxLength: 100 },
    { name: 'trim', label: 'Trim', maxLength: 100, required: false },
    { name: 'mileage', label: 'Odometer (mi)', type: 'number', min: 0, required: false },
    { name: 'exteriorColor', label: 'Exterior colour', maxLength: 100, required: false },
    { name: 'interiorColor', label: 'Interior colour', maxLength: 100, required: false },
    { name: 'retail', label: `Retail price (${currencyCode})`, type: 'money' },
    { name: 'list', label: `List price (${currencyCode})`, type: 'money', required: false, hint: 'Blank uses the retail price' },
    { name: 'priceChangeReason', label: 'Price change reason', maxLength: 500, required: false, wide: true },
    { name: 'features', label: 'Features (one per line)', type: 'textarea', required: false },
    { name: 'description', label: 'Description', type: 'textarea', maxLength: 4000, required: false },
  ]
  const ratingOptions = RATINGS.map(value => ({ value, label: ratingLabels[value] }))
  const dialogConfig: Record<DialogKind, { title: string; fields: InventoryFormField[]; submitLabel?: string }> = {
    details: { title: 'Edit vehicle details', fields: detailsFields },
    move: { title: 'Move unit', fields: [{ name: 'locationCode', label: 'Location code', maxLength: 80 }, { name: 'locationLabel', label: 'Location name', maxLength: 200, required: false }], submitLabel: 'Move' },
    cost: { title: 'Record cost', fields: [
      { name: 'costType', label: 'Cost type', type: 'select', options: COST_TYPES.map(value => ({ value, label: costTypeLabels[value] })) },
      { name: 'amount', label: `Amount (${currencyCode})`, type: 'money' },
      { name: 'reference', label: 'Invoice or reference', maxLength: 200, required: false, wide: true },
    ], submitLabel: 'Record' },
    'recon-open': { title: 'Add work item', fields: [
      { name: 'title', label: 'Work item', maxLength: 200, wide: true },
      { name: 'category', label: 'Category', type: 'select', options: RECON_CATEGORIES.map(value => ({ value, label: reconCategoryLabels[value] })) },
      { name: 'estimate', label: `Estimate (${currencyCode})`, type: 'money', required: false },
      { name: 'vendorName', label: 'Vendor', maxLength: 200, required: false },
      { name: 'assignedToId', label: 'Assigned to', type: 'select', required: false, options: staff.map(person => ({ value: person.id, label: person.name })) },
      { name: 'dueAt', label: 'Due date', type: 'date', required: false },
    ], submitLabel: 'Add' },
    'recon-complete': { title: 'Finish work item', fields: [{ name: 'actual', label: `Actual cost (${currencyCode})`, type: 'money' }], submitLabel: 'Complete' },
    'recon-cancel': { title: 'Cancel work item', fields: [{ name: 'reason', label: 'Reason', type: 'textarea', maxLength: 500 }], submitLabel: 'Cancel work item' },
    reject: { title: 'Reject listing', fields: [{ name: 'reason', label: 'Reason', type: 'textarea', maxLength: 500 }], submitLabel: 'Reject' },
    condition: { title: dialog?.targetId ? 'Edit condition report' : 'New condition report', fields: [
      { name: 'reportDate', label: 'Inspection date', type: 'date' },
      { name: 'inspector', label: 'Inspector', maxLength: 200, required: false },
      { name: 'overallCondition', label: 'Overall', type: 'select', options: ratingOptions },
      { name: 'mechanicalRating', label: 'Mechanical', type: 'select', required: false, options: ratingOptions },
      { name: 'bodyRating', label: 'Body', type: 'select', required: false, options: ratingOptions },
      { name: 'interiorRating', label: 'Interior', type: 'select', required: false, options: ratingOptions },
      { name: 'estimatedRepairs', label: 'Estimated repairs ($)', type: 'number', min: 0, required: false },
      { name: 'issues', label: 'Issues (one per line)', type: 'textarea', required: false },
      { name: 'notes', label: 'Notes', type: 'textarea', maxLength: 4000, required: false },
    ] },
    history: { title: 'Vehicle history', fields: [
      { name: 'acquisitionDate', label: 'Acquired on', type: 'date', required: false },
      { name: 'acquisitionSource', label: 'Acquired from', maxLength: 200, required: false },
      { name: 'previousOwners', label: 'Previous owners', type: 'number', min: 0, max: 99, required: false },
      { name: 'titleStatus', label: 'Title status', maxLength: 100, required: false, placeholder: 'Clean' },
      { name: 'hasAccidents', label: 'Accident history', type: 'checkbox', wide: true },
      ...(values.hasAccidents === 'yes' ? [{ name: 'accidentDetails', label: 'Accident details', type: 'textarea' as const, maxLength: 4000 }] : []),
      { name: 'serviceRecords', label: 'Service records', type: 'textarea', maxLength: 4000, required: false },
      { name: 'notes', label: 'Notes', type: 'textarea', maxLength: 4000, required: false },
    ] },
  }
  const config = dialog ? dialogConfig[dialog.kind] : null

  const listingLive = stock?.publicListing.live
  return (
    <PageContainer title={title} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {error && <Notice tone="warn">Reload failed: {error}</Notice>}
        {!editable && <Notice tone="idle">{notEditableReason}</Notice>}

        <div className="min-w-0 space-y-3">
          <Windshield label="Price, stock and days">
            <WindshieldFigure label="Price" value={money(vehicle.priceCents)} sub={vehicle.listPriceCents != null && vehicle.listPriceCents !== vehicle.priceCents ? `List ${money(vehicle.listPriceCents)}` : undefined} />
            <WindshieldFigure label="Stock #" value={vehicle.stockNumber || '-'} />
            {stock && (
              <WindshieldFigure
                label="Days in stock"
                value={stock.daysInStock ?? 'Sold'}
                attention={aged}
                sub={stock.soldAt ? `Sold ${formatDate(stock.soldAt, timeZone)}` : aged ? 'Aged 60+ days' : undefined}
              />
            )}
            {stock?.cost && <WindshieldFigure label="Total cost" value={money(stock.cost.totalCostCents)} sub={vehicle.priceCents ? `Margin ${money(vehicle.priceCents - stock.cost.totalCostCents)}` : undefined} />}
          </Windshield>
          {stock && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
              <span className="inline-flex min-w-0 items-center gap-2"><span className="text-muted-foreground">Storefront</span><Status tone={listingLive ? 'ok' : publicAction ? 'warn' : 'idle'}>{listingLive ? 'Live' : 'Not live'}</Status>{!listingLive && stock.publicListing.reason && <span className="min-w-0 truncate text-muted-foreground">{stock.publicListing.reason}</span>}</span>
              <span className="inline-flex items-center gap-2"><span className="text-muted-foreground">Listing</span><Status tone={merchandisingStatusTones[stock.merchandisingStatus]}>{merchandisingStatusLabels[stock.merchandisingStatus] || stock.merchandisingStatus}</Status></span>
              <span className="inline-flex items-center gap-2"><span className="text-muted-foreground">Feed</span><Status tone={feedStatusTones[stock.feedStatus]}>{feedStatusLabels[stock.feedStatus] || stock.feedStatus}</Status></span>
            </div>
          )}
        </div>

        <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-8">
            <DeskSection title="Identity and spec" id="vehicle-identity" actions={<Track><Pill size="sm" onClick={openDetails} disabled={!editable || Boolean(busy)} title={editable ? undefined : notEditableReason}><Pencil /> Edit</Pill></Track>}>
              <div className="grid gap-x-8 sm:grid-cols-2">
                <Facts items={[
                  { label: 'VIN', value: vehicle.vin, mono: true },
                  { label: 'Stock #', value: vehicle.stockNumber, mono: true },
                  { label: 'Year', value: vehicle.year, mono: true },
                  { label: 'Make', value: vehicle.make },
                  { label: 'Model', value: vehicle.model },
                  { label: 'Trim', value: vehicle.trim || '-' },
                ]} />
                <Facts items={[
                  { label: 'Condition', value: vehicle.condition ? conditionLabels[vehicle.condition] || vehicle.condition : '-' },
                  { label: 'Odometer', value: vehicle.mileage == null ? '-' : `${vehicle.mileage.toLocaleString('en-US')} mi`, mono: true },
                  { label: 'Exterior', value: vehicle.exteriorColor || '-' },
                  { label: 'Interior', value: vehicle.interiorColor || '-' },
                  { label: 'Retail', value: money(vehicle.priceCents), mono: true },
                  { label: 'List', value: money(vehicle.listPriceCents), mono: true },
                ]} />
              </div>
              {vehicle.features.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Features">
                  {vehicle.features.map(feature => <li key={feature} className="rounded-[4px] border px-2 py-0.5 text-xs">{feature}</li>)}
                </ul>
              )}
              <div className="mt-3 border-t pt-3 text-sm">
                <p className="text-[12px] font-medium text-muted-foreground">Description</p>
                <p className="mt-1 whitespace-pre-line break-words text-muted-foreground">{vehicle.description || 'No description'}</p>
              </div>
            </DeskSection>

            <DeskSection title="Photos" id="vehicle-photos" count={detail.images.length}>
              {stock && editable ? (
                <LiveVehiclePhotos stockId={stock.id} images={detail.images} label="Photos (first is primary)" onChanged={reload} />
              ) : detail.images.length ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {detail.images.map(image => image.url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img key={image.id} src={image.url} alt="" className="aspect-[4/3] w-full rounded-[4px] bg-muted object-cover" />
                    : <div key={image.id} className="aspect-[4/3] rounded-[4px] bg-muted" />)}
                </div>
              ) : <EmptyRow>No photos</EmptyRow>}
            </DeskSection>

            <DeskSection
              title="Recon work"
              id="vehicle-recon"
              count={reconItems.length}
              actions={stock && editable && <Track><Pill size="sm" disabled={Boolean(busy)} onClick={() => openDialog('recon-open', { title: '', category: 'inspection', estimate: '', vendorName: '', assignedToId: '', dueAt: '' })}><Plus /> Add</Pill></Track>}
            >
              <SectionError section={detail.reconWorkItems}>
                {!stock ? <EmptyRow>Not stocked</EmptyRow> : reconItems.length === 0 ? <EmptyRow>No work items</EmptyRow> : (
                  <DeskTable aria-label="Recon work items">
                    <thead>
                      <tr>
                        <Th>Work item</Th>
                        <Th>Status</Th>
                        <Th priority={2}>Due</Th>
                        <Th align="right" priority={3}>Cost</Th>
                        <Th align="right"><span className="sr-only">Actions</span></Th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconItems.map(item => {
                        const open = ['open', 'in-progress'].includes(item.status)
                        const overdue = open && item.dueAt && new Date(item.dueAt).getTime() < Date.now()
                        return (
                          <Tr key={item.id}>
                            <Td className="min-w-0">
                              <p className="break-words font-medium text-foreground">{item.title}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">{[reconCategoryLabels[item.category] || item.category, item.vendorName, item.assignedTo?.name].filter(Boolean).join(' · ')}</p>
                              {item.dueAt && <p className="mt-0.5 text-xs text-muted-foreground md:hidden">Due {formatDate(item.dueAt, timeZone)}{overdue && <> <Attention>Overdue</Attention></>}</p>}
                            </Td>
                            <Td><Status tone={reconStatusTones[item.status]}>{reconStatusLabels[item.status] || item.status}</Status></Td>
                            <Td priority={2} className="whitespace-nowrap">
                              {item.dueAt ? <span className="inline-flex items-center gap-2">{formatDate(item.dueAt, timeZone)}{overdue && <Attention>Overdue</Attention>}</span> : <span className="text-muted-foreground">-</span>}
                              {item.completedAt && <p className="text-xs text-muted-foreground">Done {formatDate(item.completedAt, timeZone)}</p>}
                            </Td>
                            <Td align="right" priority={3} className="whitespace-nowrap text-xs text-muted-foreground">
                              {item.actualCostCents != null ? <span className="text-foreground">{money(item.actualCostCents)}</span> : item.estimatedCostCents != null ? `Est. ${money(item.estimatedCostCents)}` : '-'}
                            </Td>
                            <Td align="right" className="whitespace-nowrap">
                              {open && editable && (
                                <div className="flex flex-wrap items-center justify-end gap-1">
                                  {item.status === 'open' && <Pill size="sm" className="max-md:h-10" disabled={!editable || Boolean(busy)} onClick={() => startRecon(item)}>Start</Pill>}
                                  <Pill size="sm" className="max-md:h-10" disabled={!editable || Boolean(busy)} onClick={() => openDialog('recon-complete', { actual: item.estimatedCostCents ? formatCentsForInput(item.estimatedCostCents) : '' }, item.id)}>Complete</Pill>
                                  <Pill size="sm" variant="plain" className="max-md:h-10" disabled={!editable || Boolean(busy)} onClick={() => openDialog('recon-cancel', { reason: '' }, item.id)}>Cancel</Pill>
                                </div>
                              )}
                            </Td>
                          </Tr>
                        )
                      })}
                    </tbody>
                  </DeskTable>
                )}
              </SectionError>
            </DeskSection>

            <DeskSection
              title="Listing review"
              id="vehicle-listing"
              count={versions.length}
              actions={stock && editable && (
                <Track>
                  <Pill
                    size="sm"
                    disabled={Boolean(busy) || stock.merchandisingStatus === 'submitted' || needsPhotos || needsDetails}
                    title={stock.merchandisingStatus === 'submitted' ? 'Review already pending' : needsPhotos ? 'Add a photo first' : needsDetails ? 'Add a price and description first' : undefined}
                    onClick={() => void submitListing()}
                  >
                    Submit for review
                  </Pill>
                </Track>
              )}
            >
              <SectionError section={detail.merchandisingVersions}>
                {stock && (
                  <p className="mb-3 flex flex-wrap items-baseline gap-x-2 text-sm">
                    <TitleLine as="span" tone={merchandisingStatusTones[stock.merchandisingStatus]} className="font-medium">{merchandisingStatusLabels[stock.merchandisingStatus] || stock.merchandisingStatus}</TitleLine>
                    {(stock.merchandisingStatus === 'submitted' && (needsPhotos || needsDetails)) && <span className="text-xs text-muted-foreground">Needs {needsPhotos ? 'photos' : 'price and description'}</span>}
                    {stock.merchandisingStatus !== 'submitted' && (needsPhotos || needsDetails) && <span className="text-xs text-amber-700 dark:text-amber-400">Needs {needsPhotos ? 'photos' : 'price and description'} to submit</span>}
                  </p>
                )}
                {versions.length === 0 ? <EmptyRow>No reviews yet</EmptyRow> : (
                  <Panel className="divide-y">
                    {versions.map((version, index) => {
                      const current = index === 0
                      return (
                        <div key={version.id} className="min-w-0 px-4 py-3">
                          <TitleLine tone={merchandisingStatusTones[version.status]} status={merchandisingStatusLabels[version.status]} className="text-sm font-medium">
                            Version {version.version}
                            <span className="font-normal text-muted-foreground"> · {merchandisingStatusLabels[version.status] || version.status}</span>
                          </TitleLine>
                          <p className="mt-0.5 flex flex-wrap gap-x-2 pl-4 text-xs text-muted-foreground">
                            <span>Submitted {formatDateTime(version.submittedAt, timeZone)} by {personName(version.submittedBy)}</span>
                            {version.decidedAt && <span>· Decided {formatDateTime(version.decidedAt, timeZone)} by {personName(version.decidedBy)}</span>}
                            {version.snapshot?.priceCents != null && <span>· {money(version.snapshot.priceCents)}</span>}
                            {Array.isArray(version.snapshot?.images) && <span>· {countLabel(version.snapshot.images.length, 'photo')}</span>}
                          </p>
                          {version.decisionReason && <p className="mt-1 break-words pl-4 text-xs">{version.decisionReason}</p>}
                          {current && version.status === 'submitted' && stock?.merchandisingStatus === 'submitted' && (
                            <Track className="ml-4 mt-2">
                              {editable && <Pill size="sm" className="max-md:h-10" disabled={Boolean(busy)} onClick={() => approveVersion(version.id, version.updatedAt)}>Approve</Pill>}
                              {/* Rejecting a stale review stays open on a sold unit; approving would relist it. */}
                              <Pill size="sm" disabled={!stock || Boolean(busy)} onClick={() => openDialog('reject', { reason: '' }, version.id)}>Reject</Pill>
                            </Track>
                          )}
                          {current && editable && version.status === 'approved' && publicAction === 'reapprove' && (
                            <Track className="ml-4 mt-2">
                              <Pill size="sm" className="max-md:h-10" disabled={!editable || Boolean(busy)} onClick={() => approveVersion(version.id, version.updatedAt, true)}>Re-approve</Pill>
                            </Track>
                          )}
                        </div>
                      )
                    })}
                  </Panel>
                )}
              </SectionError>
            </DeskSection>

            <DeskSection title="Condition reports" id="vehicle-condition" count={detail.conditionReports.length} actions={<Track><Pill size="sm" disabled={Boolean(busy)} onClick={() => openCondition()}><Plus /> New</Pill></Track>}>
              {detail.conditionReports.length === 0 ? <EmptyRow>No condition reports</EmptyRow> : (
                <Panel className="divide-y">
                  {detail.conditionReports.map(report => (
                    <div key={report.id} className="min-w-0 px-4 py-3">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <TitleLine tone={report.overallCondition === 'poor' ? 'bad' : report.overallCondition === 'fair' ? 'warn' : report.overallCondition ? 'ok' : 'idle'} className="text-sm font-medium">
                          {formatDate(report.reportDate, timeZone)}
                          <span className="font-normal text-muted-foreground"> · {report.overallCondition ? ratingLabels[report.overallCondition] : 'Unrated'}</span>
                        </TitleLine>
                        <Track><Pill size="sm" variant="plain" className="max-sm:h-11" disabled={Boolean(busy)} onClick={() => openCondition(report)}>Edit</Pill></Track>
                      </div>
                      <p className="mt-0.5 flex flex-wrap gap-x-2 pl-4 text-xs text-muted-foreground">
                        {report.inspector && <span>{report.inspector}</span>}
                        {report.mechanicalRating && <span>· Mechanical {ratingLabels[report.mechanicalRating]}</span>}
                        {report.bodyRating && <span>· Body {ratingLabels[report.bodyRating]}</span>}
                        {report.interiorRating && <span>· Interior {ratingLabels[report.interiorRating]}</span>}
                        {report.estimatedRepairs != null && <span>· Repairs ${report.estimatedRepairs.toLocaleString('en-US')}</span>}
                      </p>
                      {report.issues.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-8 text-xs">{report.issues.map((issue, index) => <li key={index} className="break-words">{issue.description}</li>)}</ul>}
                      {report.notes && <p className="mt-1 whitespace-pre-line break-words pl-4 text-xs text-muted-foreground">{report.notes}</p>}
                    </div>
                  ))}
                </Panel>
              )}
            </DeskSection>

            <DeskSection title="Vehicle history" id="vehicle-history" actions={<Track><Pill size="sm" disabled={Boolean(busy)} onClick={openHistory}>{detail.history ? <><Pencil /> Edit</> : <><Plus /> Add</>}</Pill></Track>}>
              {!detail.history ? <EmptyRow>No history recorded</EmptyRow> : (
                <>
                  <Facts items={[
                    { label: 'Acquired on', value: formatDate(detail.history.acquisitionDate, timeZone) },
                    { label: 'Acquired from', value: detail.history.acquisitionSource || '-' },
                    { label: 'Previous owners', value: detail.history.previousOwners ?? '-', mono: true },
                    { label: 'Title', value: detail.history.titleStatus || '-' },
                    { label: 'Accidents', value: detail.history.hasAccidents ? 'Yes' : 'None reported' },
                  ]} />
                  {detail.history.hasAccidents && detail.history.accidentDetails && <p className="mt-2 whitespace-pre-line break-words text-sm text-muted-foreground">{detail.history.accidentDetails}</p>}
                  {detail.history.serviceRecords && (
                    <div className="mt-3 border-t pt-3 text-sm">
                      <p className="text-[12px] font-medium text-muted-foreground">Service records</p>
                      <p className="mt-1 whitespace-pre-line break-words text-muted-foreground">{detail.history.serviceRecords}</p>
                    </div>
                  )}
                  {detail.history.notes && <p className="mt-2 whitespace-pre-line break-words text-sm text-muted-foreground">{detail.history.notes}</p>}
                </>
              )}
            </DeskSection>
          </div>

          <div className="min-w-0 space-y-8">
            <DeskSection title="Stock" id="vehicle-stock" actions={stock && (
              <Track>
                <Pill size="sm" disabled={!editable || Boolean(busy)} title={editable ? undefined : notEditableReason} onClick={() => openDialog('move', { locationCode: stock.locationCode, locationLabel: stock.locationLabel || '' })}>Move</Pill>
                <Pill size="sm" disabled={Boolean(busy)} onClick={() => openDialog('cost', { costType: 'reconditioning', amount: '', reference: '' })}>Cost</Pill>
              </Track>
            )}>
              {!stock ? <EmptyRow>Not stocked</EmptyRow> : (
                <Facts items={[
                  { label: 'Location', value: stock.locationLabel && stock.locationLabel !== stock.locationCode ? `${stock.locationLabel} (${stock.locationCode})` : stock.locationCode, mono: true },
                  { label: 'Stocked', value: formatDate(stock.stockedAt, timeZone) },
                  { label: 'Frontline', value: stock.frontlineAt ? formatDate(stock.frontlineAt, timeZone) : 'Not yet' },
                  { label: 'Recon', value: stock.reconStatus === 'completed' ? 'Done' : stock.reconStatus === 'in-progress' ? 'In progress' : 'Not started' },
                  { label: 'Listing', value: merchandisingStatusLabels[stock.merchandisingStatus] || stock.merchandisingStatus },
                  { label: 'Storefront', value: listingLive ? 'Live' : `Not live: ${stock.publicListing.reason || 'Not available'}` },
                  stock.cost && { label: 'Purchase', value: money(stock.cost.purchaseCostCents), mono: true },
                  stock.cost && { label: 'Recon cost', value: money(stock.cost.reconCostCents), mono: true },
                  stock.cost && { label: 'Other costs', value: money(stock.cost.otherCostCents), mono: true },
                  stock.cost && { label: 'Total cost', value: money(stock.cost.totalCostCents), mono: true },
                ]} />
              )}
            </DeskSection>

            <DeskSection title="Current deal" id="vehicle-deal">
              <SectionError section={detail.deals}>
                {!activeDeal ? <EmptyRow>No open deal</EmptyRow> : (
                  <Panel className="px-4 py-3">
                    <TitleLine tone={activeDeal.status === 'delivered' ? 'ok' : 'info'} status={dealStatusLabels[activeDeal.status]} className="text-sm font-medium">
                      <Link href={`${basePath}/platform/deals/${activeDeal.id}`} className="inline-flex items-center gap-1 hover:underline">
                        {[activeDeal.lead?.firstName, activeDeal.lead?.lastName].filter(Boolean).join(' ') || recordReference('DEAL', activeDeal.id)}
                        <ExternalLink className="size-3" />
                      </Link>
                    </TitleLine>
                    <p className="mt-0.5 flex flex-wrap gap-x-2 pl-4 text-xs text-muted-foreground">
                      <span>{dealStatusLabels[activeDeal.status] || activeDeal.status}</span>
                      {activeDeal.vehiclePriceCents != null && <span>· {money(activeDeal.vehiclePriceCents)}</span>}
                      {activeDeal.salesperson?.name && <span>· {activeDeal.salesperson.name}</span>}
                      <span>· Opened {formatDate(activeDeal.createdAt, timeZone)}</span>
                    </p>
                  </Panel>
                )}
              </SectionError>
            </DeskSection>

            <DeskSection title="Acquisition" id="vehicle-acquisition" actions={<Track><Pill size="sm" variant="plain" asChild><Link href={`${VEHICLES_HREF}/acquisitions`}>Acquisitions</Link></Pill></Track>}>
              <SectionError section={detail.acquisition}>
                {!acquisition ? <EmptyRow>No acquisition record</EmptyRow> : (
                  <>
                    <TitleLine tone={acquisitionStatusTones[acquisition.status]} status={acquisitionStatusLabels[acquisition.status]} className="text-sm font-medium">
                      <Code className="text-foreground">{acquisition.reference}</Code>
                      <span className="font-normal text-muted-foreground"> · {acquisitionStatusLabels[acquisition.status] || acquisition.status}</span>
                    </TitleLine>
                    <Facts className="mt-2" items={[
                      { label: 'Source', value: acquisitionSourceLabels[acquisition.acquisitionSource] || acquisition.acquisitionSource },
                      Boolean(acquisition.sourceReference) && { label: 'Source ref', value: acquisition.sourceReference, mono: true },
                      { label: 'Appraisal', value: money(acquisition.appraisalCents), mono: true },
                      { label: 'Purchase', value: money(acquisition.purchaseCents), mono: true },
                      acquisition.reconEstimateCents != null && { label: 'Recon estimate', value: money(acquisition.reconEstimateCents), mono: true },
                    ]} />
                    {(acquisition.status === 'arrived' || acquisition.status === 'reconditioning') && editable && (
                      <Track className="mt-2">
                        {acquisition.status === 'arrived'
                          ? <Pill size="sm" disabled={Boolean(busy)} onClick={() => advanceAcquisition('reconditioning')}>Send to recon</Pill>
                          : <Pill size="sm" disabled={Boolean(busy) || !reconDone || !listingApproved || Boolean(publicAction)} onClick={() => advanceAcquisition('frontline')}>Mark frontline</Pill>}
                      </Track>
                    )}
                    {acquisition.status === 'reconditioning' && editable && (!reconDone || !listingApproved || Boolean(publicAction)) && (
                      <p className="mt-1 text-xs text-muted-foreground">{!reconDone ? 'Frontline needs recon finished' : 'Frontline needs the current listing approved'}</p>
                    )}
                    <ol className="mt-3 space-y-2 border-l pl-4">
                      {acquisition.events.map(event => (
                        <li key={event.id} className="relative text-sm">
                          <span aria-hidden="true" className="absolute -left-[21px] top-1.5 size-2 rounded-[1px] bg-muted-foreground/40" />
                          <p className="font-medium">{event.fromStatus ? `${acquisitionStatusLabels[event.fromStatus] || event.fromStatus} to ${acquisitionStatusLabels[event.toStatus] || event.toStatus}` : acquisitionStatusLabels[event.toStatus] || event.toStatus}</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(event.occurredAt, timeZone)} · {personName(event.actor)}</p>
                          <p className="break-words text-xs text-muted-foreground">{event.reason}</p>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </SectionError>
            </DeskSection>

            <DeskSection title="Price history" id="vehicle-prices" count={detail.priceHistory.ok ? detail.priceHistory.data.length : undefined}>
              <SectionError section={detail.priceHistory}>
                {detail.priceHistory.ok && detail.priceHistory.data.length === 0 ? <EmptyRow>No price changes</EmptyRow> : detail.priceHistory.ok && (
                  <Panel className="divide-y">
                    {detail.priceHistory.data.map(entry => {
                      const down = entry.previousPriceCents != null && entry.newPriceCents < entry.previousPriceCents
                      return (
                        <div key={entry.id} className="min-w-0 px-4 py-2.5 text-sm">
                          <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <span className="tabular-nums">{entry.previousPriceCents == null ? 'Set' : money(entry.previousPriceCents)} to <span className="font-medium text-foreground">{money(entry.newPriceCents)}</span>{down && <span className="text-xs text-muted-foreground"> (reduced)</span>}</span>
                            <span className="text-xs text-muted-foreground">{formatDateTime(entry.effectiveDate, timeZone)}</span>
                          </p>
                          <p className="break-words text-xs text-muted-foreground">{[entry.changeReason, personName(entry.changedBy)].filter(Boolean).join(' · ')}</p>
                        </div>
                      )
                    })}
                  </Panel>
                )}
              </SectionError>
            </DeskSection>

            <DeskSection title="Stock ledger" id="vehicle-ledger" count={detail.stockEvents.ok ? detail.stockEvents.data.length : undefined}>
              <SectionError section={detail.stockEvents}>
                {!stock ? <EmptyRow>Not stocked</EmptyRow> : detail.stockEvents.ok && detail.stockEvents.data.length === 0 ? <EmptyRow>No events</EmptyRow> : detail.stockEvents.ok && (
                  <Panel className="max-h-[32rem] divide-y overflow-y-auto">
                    {detail.stockEvents.data.map(entry => (
                      <div key={entry.id} className="min-w-0 px-4 py-2.5 text-sm">
                        <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="font-medium">{eventTypeLabel(entry.eventType)}</span>
                          {entry.amountCents != null && <span className="text-xs tabular-nums">{money(entry.amountCents)}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(entry.occurredAt, timeZone)} · {personName(entry.actor)}</p>
                        <p className="break-words text-xs text-muted-foreground">{entry.reason}</p>
                      </div>
                    ))}
                  </Panel>
                )}
              </SectionError>
            </DeskSection>
          </div>
        </div>

        {dialog && config && (
          <InventoryFormDialog
            open
            title={config.title}
            description={`${vehicle.stockNumber} · ${title}`}
            fields={config.fields}
            values={values}
            errors={fieldErrors}
            formError={formError}
            busy={busy === 'dialog'}
            submitLabel={config.submitLabel}
            onValuesChange={setValues}
            onSubmit={submitDialog}
            onOpenChange={open => { if (!open) closeDialog() }}
          />
        )}
      </div>
    </PageContainer>
  )
}
