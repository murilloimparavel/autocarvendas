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
import { useLocale } from '@/features/i18n/LocaleProvider'
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

function SectionError({ section, children, locale = 'en-US' }: { section: Section<unknown>; children: ReactNode; locale?: string }) {
  if (!section.ok) return <Notice tone="warn">{locale === 'pt-BR' ? 'Indisponível:' : 'Not available:'} {section.error}</Notice>
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
  const { locale, t } = useLocale()
  const [detail, setDetail] = useState<VehicleDetail | null>(initialDetail)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; tone: DeskTone } | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  const money = (cents: number | null | undefined) => formatMoneyCents(cents, currencyCode, locale)
  const label = (en: string, pt: string) => locale === 'pt-BR' ? pt : en
  const domainLabel = (value: string) => {
    if (locale !== 'pt-BR') return value
    const labels: Record<string, string> = {
      'Used': 'Usado', 'New': 'Novo', 'Certified': 'Certificado', 'Available': 'Disponível', 'In prep': 'Em preparação', 'In service': 'Em preparação', 'On hold': 'Em espera',
      'In recon': 'Em preparação', 'Open': 'Aberto', 'In progress': 'Em andamento', 'Completed': 'Concluído', 'Cancelled': 'Cancelado',
      'Draft': 'Rascunho', 'Submitted': 'Enviado para revisão', 'Awaiting approval': 'Aguardando aprovação', 'Approved': 'Aprovado', 'Rejected': 'Reprovado',
      'Not submitted': 'Não enviado', 'Pending': 'Pendente', 'Ready': 'Pronto', 'Live': 'Publicado', 'Not live': 'Não publicado', 'Published': 'Publicado', 'Partly published': 'Publicado parcialmente', 'Failed': 'Falhou',
      'Mechanical': 'Mecânica', 'Body': 'Lataria', 'Detail': 'Estética', 'Tires': 'Pneus', 'Inspection': 'Vistoria', 'Other': 'Outro', 'Cost': 'Custo',
      'Excellent': 'Excelente', 'Good': 'Bom', 'Fair': 'Regular', 'Poor': 'Ruim', 'Unrated': 'Não avaliado', 'Certified Pre-Owned': 'Seminovo certificado', 'Reconditioning': 'Preparação', 'Auction fee': 'Taxa de leilão', 'Transport': 'Transporte', 'Pencil': 'Pré-negociação', 'Financed': 'Financiado', 'Delivered': 'Entregue', 'Arrived': 'Recebido', 'Frontline': 'Pronto para venda', 'Appraised': 'Avaliado', 'Purchased': 'Comprado', 'Bought from consumer': 'Compra de particular', 'OEM / distributor': 'Montadora / distribuidor', 'Dealer transfer': 'Transferência entre lojas', 'Trade-in': 'Veículo na troca', 'Wholesale': 'Atacado', 'Auction': 'Leilão',
      'Cost: reconditioning': 'Custo: preparação', 'Cost: transport': 'Custo: transporte', 'Cost: auction fee': 'Custo: taxa de leilão', 'Cost: detail': 'Custo: estética', 'Cost: other': 'Custo: outros',
      'Merchandising draft updated': 'Rascunho do anúncio atualizado', 'Stock moved': 'Veículo transferido', 'Stock created': 'Veículo incluído no estoque', 'Stock sold': 'Veículo vendido',
      'Send to recon': 'Enviar para preparação', 'Mark frontline': 'Marcar como pronto para venda', 'Add work item': 'Adicionar tarefa',
      'Finish work': 'Concluir tarefa', 'Start work': 'Iniciar tarefa', 'Submit listing': 'Enviar anúncio',
      'Re-approve listing': 'Aprovar anúncio novamente', 'Approve listing': 'Aprovar anúncio', 'Add photos': 'Adicionar fotos',
      'Add description': 'Adicionar descrição', 'Resubmit listing': 'Enviar anúncio novamente',
    }
    return labels[value] || value
  }
  const moneyInput = (cents: number) => {
    const value = formatCentsForInput(cents)
    if (locale !== 'pt-BR') return value
    const [whole, fraction] = value.replace(/,/g, '').split('.')
    return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${fraction ? `,${fraction}` : ''}`
  }
  const mileageDisplay = (miles: number | null | undefined) => {
    if (miles == null) return '-'
    const amount = locale === 'pt-BR' ? Math.round(miles * 1.609344) : miles
    return `${amount.toLocaleString(locale)} ${locale === 'pt-BR' ? 'km' : 'mi'}`
  }

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
    { type: 'link' as const, label: t('dashboard'), href: basePath },
    { type: 'page' as const, label: t('platform') },
    { type: 'link' as const, label: t('inventory'), href: VEHICLES_HREF },
    { type: 'page' as const, label: detail ? detail.vehicle.stockNumber || label('Vehicle', 'Veículo') : label('Vehicle', 'Veículo') },
  ]

  if (!detail) {
    return (
      <PageContainer title={label('Vehicle', 'Veículo')} breadcrumbs={breadcrumbs} header={<DeskHeader title={label('Vehicle', 'Veículo')} tone="bad" status={label('Unavailable', 'Indisponível')} />}>
        <div className="space-y-4 px-4 pb-24 md:px-6">
          <Notice tone="bad">{error || label('Vehicle not found', 'Veículo não encontrado')}</Notice>
          <Track>
            <Pill onClick={reload} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : undefined} />{label('Retry', 'Tentar novamente')}</Pill>
            <Pill asChild variant="plain"><Link href={VEHICLES_HREF}><ArrowLeft /> {label('Inventory', 'Estoque')}</Link></Pill>
          </Track>
        </div>
      </PageContainer>
    )
  }

  const { vehicle, stock } = detail
  const stage = lotStage(vehicle.status, stock?.frontlineAt)
  const editable = Boolean(stock) && ACTIVE_STATUSES.includes(vehicle.status)
  const notEditableReason = !stock ? label('Not stocked', 'Fora do estoque') : `${domainLabel(vehicleStatusLabels[vehicle.status] || vehicle.status)} ${label('units cannot be edited', 'não podem ser editadas')}`
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

  const run = async (busyKey: string, work: () => Promise<{ success: boolean; error?: string }>, success: string) => {
    setBusy(busyKey)
    setMessage(null)
    try {
      const response = await work()
      if (response.success) setMessage({ text: success, tone: 'ok' })
      else setMessage({ text: response.error || label('Unable to save.', 'Não foi possível salvar.'), tone: 'bad' })
    } catch {
      setMessage({ text: label('Unable to save. Reload to check the current state.', 'Não foi possível salvar. Atualize a página para conferir o estado atual.'), tone: 'bad' })
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

  const submitListing = () => stock && run('listing', () => submitInventoryMerchandising({ stockId: stock.id, reason: 'Submitted from the vehicle page', idempotencyKey: key('submit') }), label('Listing submitted for approval.', 'Anúncio enviado para aprovação.'))
  const approveVersion = (versionId: string, updatedAt: string, reapprove = false) => run('listing', () => decideInventoryMerchandising({
    id: versionId, decision: 'approved', reason: reapprove ? 'Re-approved from the vehicle page' : 'Approved from the vehicle page', expectedUpdatedAt: updatedAt, idempotencyKey: key('approve'),
  }), reapprove ? label('Listing re-approved.', 'Anúncio aprovado novamente.') : label('Listing approved.', 'Anúncio aprovado.'))
  const startRecon = (item: ReconWorkItem) => run(item.id, () => transitionInventoryReconWorkItem({ id: item.id, toStatus: 'in-progress', expectedUpdatedAt: item.updatedAt, reason: 'Started from the vehicle page', idempotencyKey: key('recon-start') }), label('Work started.', 'Tarefa iniciada.'))
  const advanceAcquisition = (toStatus: 'reconditioning' | 'frontline') => acquisition && run('acquisition', () => transitionInventoryAcquisition({
    id: acquisition.id, toStatus, expectedUpdatedAt: acquisition.updatedAt, reason: toStatus === 'frontline' ? 'Marked frontline from the vehicle page' : 'Sent to recon from the vehicle page', idempotencyKey: key('acquisition'),
  }), toStatus === 'frontline' ? label('Marked frontline.', 'Veículo marcado como pronto para venda.') : label('Sent to recon.', 'Veículo enviado para preparação.'))

  const openDetails = () => openDialog('details', {
    vin: vehicle.vin, year: String(vehicle.year), condition: vehicle.condition || 'used', make: vehicle.make, model: vehicle.model, trim: vehicle.trim,
    exteriorColor: vehicle.exteriorColor, interiorColor: vehicle.interiorColor, mileage: vehicle.mileage == null ? '' : String(locale === 'pt-BR' ? Math.round(vehicle.mileage * 1.609344) : vehicle.mileage),
    retail: vehicle.priceCents == null ? '' : moneyInput(vehicle.priceCents), list: vehicle.listPriceCents == null ? '' : moneyInput(vehicle.listPriceCents),
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
        if (required) errors[name] = locale === 'pt-BR' ? `Informe ${label.toLowerCase()}.` : `${label} is required`
        return null
      }
      const moneyText = locale === 'pt-BR' ? v(name).replace(/^R\$\s*/, '').replace(/\./g, '').replace(',', '.') : v(name)
      const parsed = parseDollarsToCents(moneyText)
      if (parsed == null) errors[name] = locale === 'pt-BR' ? 'Informe um valor, por exemplo, 33.450,00' : 'Enter an amount such as $33,450'
      else if (positive && parsed <= 0) errors[name] = locale === 'pt-BR' ? `${label} deve ser maior que zero` : `${label} must be more than zero`
      return parsed
    }
    const whole = (name: string, label: string, { required = false, max = 2_000_000 } = {}) => {
      if (!v(name)) {
        if (required) errors[name] = locale === 'pt-BR' ? `Informe ${label.toLowerCase()}.` : `${label} is required`
        return null
      }
      const parsed = Number(v(name).replace(/,/g, ''))
      if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > max) {
        errors[name] = locale === 'pt-BR' ? `${label} deve ser um número inteiro` : `${label} must be a whole number`
        return null
      }
      return parsed
    }
    const requireText = (name: string, label: string) => { if (!v(name)) errors[name] = locale === 'pt-BR' ? `Informe ${label.toLowerCase()}.` : `${label} is required` }

    let work: (() => Promise<{ success: boolean; error?: string; rejected?: boolean }>) | null = null
    let success = label('Saved.', 'Salvo.')
    if (dialog.kind === 'details' && stock) {
      const vin = v('vin').toUpperCase()
      if (!VIN_PATTERN.test(vin)) errors.vin = locale === 'pt-BR' ? 'Informe 17 caracteres, sem as letras I, O ou Q.' : '17 characters, no I, O or Q'
      const year = whole('year', label('Model year', 'Ano do modelo'), { required: true, max: 9999 })
      const maxYear = new Date().getFullYear() + 2
      if (year != null && (year < 1900 || year > maxYear)) errors.year = locale === 'pt-BR' ? `Informe um ano entre 1900 e ${maxYear}.` : `Between 1900 and ${maxYear}`
      requireText('make', label('Make', 'Marca'))
      requireText('model', label('Model', 'Modelo'))
      const mileageInput = whole('mileage', label('Odometer', 'Quilometragem'))
      const mileage = mileageInput == null ? null : locale === 'pt-BR' ? Math.round(mileageInput / 1.609344) : mileageInput
      const priceCents = cents('retail', label('Retail price', 'Preço de venda'), { required: true, positive: true })
      const listPriceCents = cents('list', label('List price', 'Preço anunciado'))
      const features = featureLines(values.features || '')
      if (features.some(feature => feature.length > 200)) errors.features = locale === 'pt-BR' ? 'Cada item pode ter no máximo 200 caracteres.' : 'Each feature must be at most 200 characters'
      if (features.length > 100) errors.features = locale === 'pt-BR' ? 'Informe no máximo 100 itens.' : 'At most 100 features'
      if (Object.keys(errors).length === 0) {
        work = () => updateInventoryVehicleDetails({
          stockId: stock.id, vehicleId: vehicle.id, vin, year: year!, make: v('make'), model: v('model'), trim: v('trim'),
          exteriorColor: v('exteriorColor'), interiorColor: v('interiorColor'), condition: v('condition') || 'used', mileage,
          features, priceCents: priceCents!, listPriceCents: listPriceCents ?? priceCents!, description: values.description || '',
          priceChangeReason: v('priceChangeReason'), expectedUpdatedAt: stock.updatedAt, idempotencyKey: dialog.idempotencyKey,
        })
        success = stock.merchandisingStatus === 'draft' ? label('Details saved.', 'Dados salvos.') : label('Details saved. The listing is back in draft.', 'Dados salvos. O anúncio voltou para rascunho.')
      }
    } else if (dialog.kind === 'move' && stock) {
      requireText('locationCode', 'Location')
      if (Object.keys(errors).length === 0) {
        work = () => moveInventoryStock({ stockId: stock.id, locationCode: v('locationCode').toUpperCase(), locationLabel: v('locationLabel') || v('locationCode').toUpperCase(), expectedUpdatedAt: stock.updatedAt, reason: 'Moved from the vehicle page', idempotencyKey: dialog.idempotencyKey })
        success = label('Unit moved.', 'Veículo transferido.')
      }
    } else if (dialog.kind === 'cost' && stock) {
      if (!COST_TYPES.includes(v('costType') as typeof COST_TYPES[number])) errors.costType = label('Choose a cost type', 'Selecione o tipo de custo.')
      const amountCents = cents('amount', label('Amount', 'Valor'), { required: true, positive: true })
      if (Object.keys(errors).length === 0) {
        work = () => recordInventoryCost({ stockId: stock.id, costType: v('costType'), amountCents: amountCents!, reference: v('reference') || undefined, reason: 'Cost recorded from the vehicle page', idempotencyKey: dialog.idempotencyKey })
        success = label('Cost recorded.', 'Custo registrado.')
      }
    } else if (dialog.kind === 'recon-open' && stock) {
      requireText('title', 'Work item')
      if (!RECON_CATEGORIES.includes(v('category') as typeof RECON_CATEGORIES[number])) errors.category = label('Choose a category', 'Selecione a categoria.')
      const estimatedCostCents = cents('estimate', label('Estimate', 'Estimativa'))
      if (v('dueAt') && Number.isNaN(new Date(`${v('dueAt')}T12:00:00`).getTime())) errors.dueAt = label('Enter a valid date', 'Informe uma data válida.')
      if (Object.keys(errors).length === 0) {
        work = () => openInventoryReconWorkItem({
          stockId: stock.id, title: v('title'), category: v('category'), estimatedCostCents: estimatedCostCents ?? 0, vendorName: v('vendorName'),
          assignedToId: v('assignedToId') || null, dueAt: v('dueAt') ? new Date(`${v('dueAt')}T12:00:00`).toISOString() : null,
          reason: 'Opened from the vehicle page', idempotencyKey: dialog.idempotencyKey,
        })
        success = label('Work item added.', 'Tarefa adicionada.')
      }
    } else if (dialog.kind === 'recon-complete' || dialog.kind === 'recon-cancel') {
      const item = reconItems.find(entry => entry.id === dialog.targetId)
      const actualCostCents = dialog.kind === 'recon-complete' ? cents('actual', label('Actual cost', 'Custo realizado'), { required: true }) : null
      if (dialog.kind === 'recon-cancel') requireText('reason', 'Reason')
      if (item && Object.keys(errors).length === 0) {
        work = () => transitionInventoryReconWorkItem({
          id: item.id, toStatus: dialog.kind === 'recon-complete' ? 'completed' : 'cancelled', actualCostCents: actualCostCents ?? undefined,
          expectedUpdatedAt: item.updatedAt, reason: dialog.kind === 'recon-complete' ? 'Completed from the vehicle page' : v('reason'), idempotencyKey: dialog.idempotencyKey,
        })
        success = dialog.kind === 'recon-complete' ? label('Work completed.', 'Tarefa concluída.') : label('Work item cancelled.', 'Tarefa cancelada.')
      }
    } else if (dialog.kind === 'reject') {
      const version = versions.find(entry => entry.id === dialog.targetId)
      requireText('reason', 'Reason')
      if (version && Object.keys(errors).length === 0) {
        work = () => decideInventoryMerchandising({ id: version.id, decision: 'rejected', reason: v('reason'), expectedUpdatedAt: version.updatedAt, idempotencyKey: dialog.idempotencyKey })
        success = label('Listing rejected.', 'Anúncio reprovado.')
      }
    } else if (dialog.kind === 'condition') {
      if (!v('reportDate') || Number.isNaN(new Date(`${v('reportDate')}T12:00:00`).getTime())) errors.reportDate = label('Enter a valid date', 'Informe uma data válida.')
      const estimatedRepairs = whole('estimatedRepairs', label('Estimated repairs', 'Reparos estimados'), { max: 10_000_000 })
      if (!v('overallCondition')) errors.overallCondition = label('Choose an overall rating', 'Selecione uma avaliação geral.')
      if (Object.keys(errors).length === 0) {
        work = () => saveConditionReport({
          id: dialog.targetId, vehicleId: vehicle.id, rooftopId: vehicle.rooftopId, reportDate: new Date(`${v('reportDate')}T12:00:00`).toISOString(),
          inspector: v('inspector'), overallCondition: v('overallCondition'), mechanicalRating: v('mechanicalRating'), bodyRating: v('bodyRating'),
          interiorRating: v('interiorRating'), issues: (values.issues || '').split('\n'), estimatedRepairs, notes: values.notes || '',
        })
        success = label('Condition report saved.', 'Laudo de vistoria salvo.')
      }
    } else if (dialog.kind === 'history') {
      if (v('acquisitionDate') && Number.isNaN(new Date(`${v('acquisitionDate')}T12:00:00`).getTime())) errors.acquisitionDate = label('Enter a valid date', 'Informe uma data válida.')
      const previousOwners = whole('previousOwners', label('Previous owners', 'Proprietários anteriores'), { max: 99 })
      if (values.hasAccidents === 'yes' && !v('accidentDetails')) errors.accidentDetails = label('Describe the accident history', 'Descreva o histórico de acidentes.')
      if (Object.keys(errors).length === 0) {
        work = () => saveVehicleHistory({
          id: dialog.targetId, vehicleId: vehicle.id, rooftopId: vehicle.rooftopId,
          acquisitionDate: v('acquisitionDate') ? new Date(`${v('acquisitionDate')}T12:00:00`).toISOString() : '',
          acquisitionSource: v('acquisitionSource'), previousOwners, hasAccidents: values.hasAccidents === 'yes', accidentDetails: values.accidentDetails || '',
          serviceRecords: values.serviceRecords || '', titleStatus: v('titleStatus'), notes: values.notes || '',
        })
        success = label('Vehicle history saved.', 'Histórico do veículo salvo.')
      }
    }

    setFieldErrors(errors)
    if (!work) return
    setBusy('dialog')
    setFormError(null)
    try {
      const response = await work()
      if (!response.success) {
        setFormError(response.error || label('Unable to save.', 'Não foi possível salvar.'))
        return
      }
      setDialog(null)
      setMessage({ text: success, tone: 'ok' })
      await reload()
    } catch {
      setFormError(label('Unable to save. Your entries are kept so you can retry.', 'Não foi possível salvar. Os dados preenchidos foram mantidos para você tentar novamente.'))
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
    domainLabel(vehicleStatusLabels[stage] || stage),
    stock ? (stock.publicListing.live ? label('live on storefront', 'publicado na vitrine') : label('not live', 'não publicado')) : label('not stocked', 'fora do estoque'),
    nextStep ? `${label('next:', 'próxima ação:')} ${domainLabel(nextStep.label).toLowerCase()}` : null,
  ].filter(Boolean).join(' · ')
  const header = (
    <DeskHeader
      eyebrow={<Link href={VEHICLES_HREF} className="inline-flex min-h-11 items-center gap-1 hover:text-foreground sm:min-h-0"><ArrowLeft className="size-3" /> {label('Inventory', 'Estoque')}</Link>}
      title={title}
      tone={vehicleStatusTones[stage] || 'idle'}
      status={domainLabel(vehicleStatusLabels[stage] || stage)}
      meta={<span className="flex flex-wrap gap-x-3 gap-y-1"><span className="font-medium text-foreground">{stateLine}</span><Code>{vehicle.vin}</Code>{vehicle.rooftopName && <span>{vehicle.rooftopName}</span>}</span>}
      actions={
        <Track>
          <Pill variant="plain" onClick={reload} disabled={loading} aria-label={label('Refresh', 'Atualizar')}><RefreshCw className={loading ? 'animate-spin' : undefined} /><span className="max-sm:sr-only">{label('Refresh', 'Atualizar')}</span></Pill>
          <Pill onClick={openDetails} disabled={!editable || Boolean(busy)} title={editable ? undefined : notEditableReason}><Pencil /> {label('Edit', 'Editar')}</Pill>
      {nextStep && <Pill variant="primary" onClick={nextStep.onClick} disabled={Boolean(busy)}>{domainLabel(nextStep.label)}</Pill>}
        </Track>
      }
    />
  )

  const detailsFields: InventoryFormField[] = [
    { name: 'vin', label: label('VIN', 'Chassi (VIN)'), maxLength: 17, wide: true },
    { name: 'year', label: label('Model year', 'Ano do modelo'), type: 'number', min: 1900 },
    { name: 'condition', label: label('Condition', 'Condição'), type: 'select', options: CONDITIONS.map(value => ({ value, label: domainLabel(conditionLabels[value]) })) },
    { name: 'make', label: label('Make', 'Marca'), maxLength: 100 },
    { name: 'model', label: label('Model', 'Modelo'), maxLength: 100 },
    { name: 'trim', label: label('Trim', 'Versão'), maxLength: 100, required: false },
    { name: 'mileage', label: label('Odometer (mi)', 'Quilometragem (km)'), type: 'number', min: 0, required: false },
    { name: 'exteriorColor', label: label('Exterior colour', 'Cor externa'), maxLength: 100, required: false },
    { name: 'interiorColor', label: label('Interior colour', 'Cor interna'), maxLength: 100, required: false },
    { name: 'retail', label: label(`Retail price (${currencyCode})`, `Preço de venda (${currencyCode})`), type: 'money' },
    { name: 'list', label: label(`List price (${currencyCode})`, `Preço anunciado (${currencyCode})`), type: 'money', required: false, hint: label('Blank uses the retail price', 'Em branco, usa o preço de venda') },
    { name: 'priceChangeReason', label: label('Price change reason', 'Motivo da alteração de preço'), maxLength: 500, required: false, wide: true },
    { name: 'features', label: label('Features (one per line)', 'Itens e equipamentos (um por linha)'), type: 'textarea', required: false },
    { name: 'description', label: label('Description', 'Descrição'), type: 'textarea', maxLength: 4000, required: false },
  ]
  const ratingOptions = RATINGS.map(value => ({ value, label: ratingLabels[value] }))
  const dialogConfig: Record<DialogKind, { title: string; fields: InventoryFormField[]; submitLabel?: string }> = {
    details: { title: label('Edit vehicle details', 'Editar dados do veículo'), fields: detailsFields },
    move: { title: label('Move unit', 'Transferir veículo'), fields: [{ name: 'locationCode', label: label('Location code', 'Código da localização'), maxLength: 80 }, { name: 'locationLabel', label: label('Location name', 'Nome da localização'), maxLength: 200, required: false }], submitLabel: label('Move', 'Transferir') },
    cost: { title: label('Record cost', 'Registrar custo'), fields: [
      { name: 'costType', label: label('Cost type', 'Tipo de custo'), type: 'select', options: COST_TYPES.map(value => ({ value, label: domainLabel(costTypeLabels[value]) })) },
      { name: 'amount', label: label(`Amount (${currencyCode})`, `Valor (${currencyCode})`), type: 'money' },
      { name: 'reference', label: label('Invoice or reference', 'Nota fiscal ou referência'), maxLength: 200, required: false, wide: true },
    ], submitLabel: label('Record', 'Registrar') },
    'recon-open': { title: label('Add work item', 'Adicionar tarefa de preparação'), fields: [
      { name: 'title', label: label('Work item', 'Tarefa'), maxLength: 200, wide: true },
      { name: 'category', label: label('Category', 'Categoria'), type: 'select', options: RECON_CATEGORIES.map(value => ({ value, label: domainLabel(reconCategoryLabels[value]) })) },
      { name: 'estimate', label: label(`Estimate (${currencyCode})`, `Estimativa (${currencyCode})`), type: 'money', required: false },
      { name: 'vendorName', label: label('Vendor', 'Fornecedor'), maxLength: 200, required: false },
      { name: 'assignedToId', label: label('Assigned to', 'Responsável'), type: 'select', required: false, options: staff.map(person => ({ value: person.id, label: person.name })) },
      { name: 'dueAt', label: label('Due date', 'Prazo'), type: 'date', required: false },
    ], submitLabel: label('Add', 'Adicionar') },
    'recon-complete': { title: label('Finish work item', 'Concluir tarefa'), fields: [{ name: 'actual', label: label(`Actual cost (${currencyCode})`, `Custo realizado (${currencyCode})`), type: 'money' }], submitLabel: label('Complete', 'Concluir') },
    'recon-cancel': { title: label('Cancel work item', 'Cancelar tarefa'), fields: [{ name: 'reason', label: label('Reason', 'Motivo'), type: 'textarea', maxLength: 500 }], submitLabel: label('Cancel work item', 'Cancelar tarefa') },
    reject: { title: label('Reject listing', 'Reprovar anúncio'), fields: [{ name: 'reason', label: label('Reason', 'Motivo'), type: 'textarea', maxLength: 500 }], submitLabel: label('Reject', 'Reprovar') },
    condition: { title: dialog?.targetId ? label('Edit condition report', 'Editar laudo de vistoria') : label('New condition report', 'Novo laudo de vistoria'), fields: [
      { name: 'reportDate', label: label('Inspection date', 'Data da vistoria'), type: 'date' },
      { name: 'inspector', label: label('Inspector', 'Vistoriador'), maxLength: 200, required: false },
      { name: 'overallCondition', label: label('Overall', 'Geral'), type: 'select', options: ratingOptions },
      { name: 'mechanicalRating', label: label('Mechanical', 'Mecânica'), type: 'select', required: false, options: ratingOptions },
      { name: 'bodyRating', label: label('Body', 'Lataria'), type: 'select', required: false, options: ratingOptions },
      { name: 'interiorRating', label: label('Interior', 'Interior'), type: 'select', required: false, options: ratingOptions },
      { name: 'estimatedRepairs', label: label('Estimated repairs ($)', 'Reparos estimados (R$)'), type: 'number', min: 0, required: false },
      { name: 'issues', label: label('Issues (one per line)', 'Itens a reparar (um por linha)'), type: 'textarea', required: false },
      { name: 'notes', label: label('Notes', 'Observações'), type: 'textarea', maxLength: 4000, required: false },
    ] },
    history: { title: label('Vehicle history', 'Histórico do veículo'), fields: [
      { name: 'acquisitionDate', label: label('Acquired on', 'Data da aquisição'), type: 'date', required: false },
      { name: 'acquisitionSource', label: label('Acquired from', 'Origem da aquisição'), maxLength: 200, required: false },
      { name: 'previousOwners', label: label('Previous owners', 'Proprietários anteriores'), type: 'number', min: 0, max: 99, required: false },
      { name: 'titleStatus', label: label('Title status', 'Situação documental'), maxLength: 100, required: false, placeholder: 'Clean' },
      { name: 'hasAccidents', label: label('Accident history', 'Histórico de acidentes'), type: 'checkbox', wide: true },
      ...(values.hasAccidents === 'yes' ? [{ name: 'accidentDetails', label: label('Accident details', 'Detalhes dos acidentes'), type: 'textarea' as const, maxLength: 4000 }] : []),
      { name: 'serviceRecords', label: label('Service records', 'Registros de manutenção'), type: 'textarea', maxLength: 4000, required: false },
      { name: 'notes', label: label('Notes', 'Observações'), type: 'textarea', maxLength: 4000, required: false },
    ] },
  }
  const config = dialog ? dialogConfig[dialog.kind] : null

  const listingLive = stock?.publicListing.live
  return (
    <PageContainer title={title} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {error && <Notice tone="warn">{label('Reload failed:', 'Falha ao atualizar:')} {error}</Notice>}
        {!editable && <Notice tone="idle">{notEditableReason}</Notice>}

        <div className="min-w-0 space-y-3">
          <Windshield label={label('Price, stock and days', 'Preço, estoque e permanência')}>
            <WindshieldFigure label={label('Price', 'Preço')} value={money(vehicle.priceCents)} sub={vehicle.listPriceCents != null && vehicle.listPriceCents !== vehicle.priceCents ? `${label('List', 'Anunciado')} ${money(vehicle.listPriceCents)}` : undefined} />
            <WindshieldFigure label={label('Stock #', 'Código do estoque')} value={vehicle.stockNumber || '-'} />
            {stock && (
              <WindshieldFigure
                label={label('Days in stock', 'Dias no estoque')}
                value={stock.daysInStock ?? label('Sold', 'Vendido')}
                attention={aged}
                sub={stock.soldAt ? `${label('Sold', 'Vendido')} ${formatDate(stock.soldAt, timeZone, locale)}` : aged ? label('Aged 60+ days', 'Há 60 dias ou mais no estoque') : undefined}
              />
            )}
            {stock?.cost && <WindshieldFigure label={label('Total cost', 'Custo total')} value={money(stock.cost.totalCostCents)} sub={vehicle.priceCents ? `${label('Margin', 'Margem')} ${money(vehicle.priceCents - stock.cost.totalCostCents)}` : undefined} />}
          </Windshield>
          {stock && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
              <span className="inline-flex min-w-0 items-center gap-2"><span className="text-muted-foreground">{label('Storefront', 'Vitrine')}</span><Status tone={listingLive ? 'ok' : publicAction ? 'warn' : 'idle'}>{listingLive ? label('Live', 'Publicado') : label('Not live', 'Não publicado')}</Status>{!listingLive && stock.publicListing.reason && <span className="min-w-0 truncate text-muted-foreground">{stock.publicListing.reason}</span>}</span>
              <span className="inline-flex items-center gap-2"><span className="text-muted-foreground">{label('Listing', 'Anúncio')}</span><Status tone={merchandisingStatusTones[stock.merchandisingStatus]}>{domainLabel(merchandisingStatusLabels[stock.merchandisingStatus] || stock.merchandisingStatus)}</Status></span>
              <span className="inline-flex items-center gap-2"><span className="text-muted-foreground">{label('Feed', 'Integração')}</span><Status tone={feedStatusTones[stock.feedStatus]}>{domainLabel(feedStatusLabels[stock.feedStatus] || stock.feedStatus)}</Status></span>
            </div>
          )}
        </div>

        <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-8">
              <DeskSection title={label('Identity and spec', 'Identificação e características')} id="vehicle-identity" actions={<Track><Pill size="sm" onClick={openDetails} disabled={!editable || Boolean(busy)} title={editable ? undefined : notEditableReason}><Pencil /> {label('Edit', 'Editar')}</Pill></Track>}>
              <div className="grid gap-x-8 sm:grid-cols-2">
                <Facts items={[
                  { label: label('VIN', 'Chassi (VIN)'), value: vehicle.vin, mono: true },
                  { label: label('Stock #', 'Código do estoque'), value: vehicle.stockNumber, mono: true },
                  { label: label('Year', 'Ano'), value: vehicle.year, mono: true },
                  { label: label('Make', 'Marca'), value: vehicle.make },
                  { label: label('Model', 'Modelo'), value: vehicle.model },
                  { label: label('Trim', 'Versão'), value: vehicle.trim || '-' },
                ]} />
                <Facts items={[
                  { label: label('Condition', 'Condição'), value: vehicle.condition ? domainLabel(conditionLabels[vehicle.condition] || vehicle.condition) : '-' },
                  { label: label('Odometer', 'Quilometragem'), value: mileageDisplay(vehicle.mileage), mono: true },
                  { label: label('Exterior', 'Cor externa'), value: vehicle.exteriorColor || '-' },
                  { label: label('Interior', 'Interior'), value: vehicle.interiorColor || '-' },
                  { label: label('Retail', 'Preço de venda'), value: money(vehicle.priceCents), mono: true },
                  { label: label('List', 'Preço anunciado'), value: money(vehicle.listPriceCents), mono: true },
                ]} />
              </div>
              {vehicle.features.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={label('Features', 'Equipamentos e opcionais')}>
                  {vehicle.features.map(feature => <li key={feature} className="rounded-[4px] border px-2 py-0.5 text-xs">{feature}</li>)}
                </ul>
              )}
              <div className="mt-3 border-t pt-3 text-sm">
                <p className="text-[12px] font-medium text-muted-foreground">{label('Description', 'Descrição')}</p>
                <p className="mt-1 whitespace-pre-line break-words text-muted-foreground">{vehicle.description || label('No description', 'Sem descrição')}</p>
              </div>
            </DeskSection>

            <DeskSection title={label('Photos', 'Fotos')} id="vehicle-photos" count={detail.images.length}>
              {stock && editable ? (
                <LiveVehiclePhotos stockId={stock.id} images={detail.images} label={label('Photos (first is primary)', 'Fotos (a primeira é a principal)')} onChanged={reload} />
              ) : detail.images.length ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {detail.images.map(image => image.url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img key={image.id} src={image.url} alt="" className="aspect-[4/3] w-full rounded-[4px] bg-muted object-cover" />
                    : <div key={image.id} className="aspect-[4/3] rounded-[4px] bg-muted" />)}
                </div>
              ) : <EmptyRow>{label('No photos', 'Nenhuma foto')}</EmptyRow>}
            </DeskSection>

            <DeskSection
              title={label('Recon work', 'Preparação do veículo')}
              id="vehicle-recon"
              count={reconItems.length}
              actions={stock && editable && <Track><Pill size="sm" disabled={Boolean(busy)} onClick={() => openDialog('recon-open', { title: '', category: 'inspection', estimate: '', vendorName: '', assignedToId: '', dueAt: '' })}><Plus /> {label('Add', 'Adicionar')}</Pill></Track>}
            >
              <SectionError locale={locale} section={detail.reconWorkItems}>
                {!stock ? <EmptyRow>{label('Not stocked', 'Fora do estoque')}</EmptyRow> : reconItems.length === 0 ? <EmptyRow>{label('No work items', 'Nenhuma tarefa')}</EmptyRow> : (
                  <DeskTable aria-label={label('Recon work items', 'Serviços de preparação')}>
                    <thead>
                      <tr>
                        <Th>{label('Work item', 'Tarefa')}</Th>
                        <Th>{label('Status', 'Status')}</Th>
                        <Th priority={2}>{label('Due', 'Prazo')}</Th>
                        <Th align="right" priority={3}>{label('Cost', 'Custo')}</Th>
                        <Th align="right"><span className="sr-only">{label('Actions', 'Ações')}</span></Th>
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
                              {item.dueAt && <p className="mt-0.5 text-xs text-muted-foreground md:hidden">{label('Due', 'Prazo')} {formatDate(item.dueAt, timeZone, locale)}{overdue && <> <Attention>{label('Overdue', 'Atrasado')}</Attention></>}</p>}
                            </Td>
                            <Td><Status tone={reconStatusTones[item.status]}>{domainLabel(reconStatusLabels[item.status] || item.status)}</Status></Td>
                            <Td priority={2} className="whitespace-nowrap">
                              {item.dueAt ? <span className="inline-flex items-center gap-2">{formatDate(item.dueAt, timeZone, locale)}{overdue && <Attention>{label('Overdue', 'Atrasado')}</Attention>}</span> : <span className="text-muted-foreground">-</span>}
                              {item.completedAt && <p className="text-xs text-muted-foreground">{label('Done', 'Concluído')} {formatDate(item.completedAt, timeZone, locale)}</p>}
                            </Td>
                            <Td align="right" priority={3} className="whitespace-nowrap text-xs text-muted-foreground">
                              {item.actualCostCents != null ? <span className="text-foreground">{money(item.actualCostCents)}</span> : item.estimatedCostCents != null ? `${label('Est.', 'Estimado:')} ${money(item.estimatedCostCents)}` : '-'}
                            </Td>
                            <Td align="right" className="whitespace-nowrap">
                              {open && editable && (
                                <div className="flex flex-wrap items-center justify-end gap-1">
                                  {item.status === 'open' && <Pill size="sm" className="max-md:h-10" disabled={!editable || Boolean(busy)} onClick={() => startRecon(item)}>{label('Start', 'Iniciar')}</Pill>}
                                  <Pill size="sm" className="max-md:h-10" disabled={!editable || Boolean(busy)} onClick={() => openDialog('recon-complete', { actual: item.estimatedCostCents ? (locale === 'pt-BR' ? moneyInput(item.estimatedCostCents) : formatCentsForInput(item.estimatedCostCents)) : '' }, item.id)}>{label('Complete', 'Concluir')}</Pill>
                                  <Pill size="sm" variant="plain" className="max-md:h-10" disabled={!editable || Boolean(busy)} onClick={() => openDialog('recon-cancel', { reason: '' }, item.id)}>{label('Cancel', 'Cancelar')}</Pill>
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
              title={label('Listing review', 'Revisão do anúncio')}
              id="vehicle-listing"
              count={versions.length}
              actions={stock && editable && (
                <Track>
                  <Pill
                    size="sm"
                    disabled={Boolean(busy) || stock.merchandisingStatus === 'submitted' || needsPhotos || needsDetails}
                    title={stock.merchandisingStatus === 'submitted' ? label('Review already pending', 'Já há uma revisão pendente') : needsPhotos ? label('Add a photo first', 'Adicione uma foto primeiro') : needsDetails ? label('Add a price and description first', 'Informe o preço e a descrição primeiro') : undefined}
                    onClick={() => void submitListing()}
                  >
                    {label('Submit for review', 'Enviar para revisão')}
                  </Pill>
                </Track>
              )}
            >
              <SectionError locale={locale} section={detail.merchandisingVersions}>
                {stock && (
                  <p className="mb-3 flex flex-wrap items-baseline gap-x-2 text-sm">
                    <TitleLine as="span" tone={merchandisingStatusTones[stock.merchandisingStatus]} className="font-medium">{domainLabel(merchandisingStatusLabels[stock.merchandisingStatus] || stock.merchandisingStatus)}</TitleLine>
                    {(stock.merchandisingStatus === 'submitted' && (needsPhotos || needsDetails)) && <span className="text-xs text-muted-foreground">{label('Needs', 'Faltam')} {needsPhotos ? label('photos', 'fotos') : label('price and description', 'preço e descrição')}</span>}
                    {stock.merchandisingStatus !== 'submitted' && (needsPhotos || needsDetails) && <span className="text-xs text-amber-700 dark:text-amber-400">{label('Needs', 'Faltam')} {needsPhotos ? label('photos', 'fotos') : label('price and description', 'preço e descrição')} {label('to submit', 'para enviar')}</span>}
                  </p>
                )}
                {versions.length === 0 ? <EmptyRow>{label('No reviews yet', 'Nenhuma revisão')}</EmptyRow> : (
                  <Panel className="divide-y">
                    {versions.map((version, index) => {
                      const current = index === 0
                      return (
                        <div key={version.id} className="min-w-0 px-4 py-3">
                          <TitleLine tone={merchandisingStatusTones[version.status]} status={domainLabel(merchandisingStatusLabels[version.status])} className="text-sm font-medium">
                            {label('Version', 'Versão')} {version.version}
                            <span className="font-normal text-muted-foreground"> · {domainLabel(merchandisingStatusLabels[version.status] || version.status)}</span>
                          </TitleLine>
                          <p className="mt-0.5 flex flex-wrap gap-x-2 pl-4 text-xs text-muted-foreground">
                            <span>{label('Submitted', 'Enviado')} {formatDateTime(version.submittedAt, timeZone, locale)} {label('by', 'por')} {personName(version.submittedBy, locale)}</span>
                            {version.decidedAt && <span>· {label('Decided', 'Decidido')} {formatDateTime(version.decidedAt, timeZone, locale)} {label('by', 'por')} {personName(version.decidedBy, locale)}</span>}
                            {version.snapshot?.priceCents != null && <span>· {money(version.snapshot.priceCents)}</span>}
                            {Array.isArray(version.snapshot?.images) && <span>· {countLabel(version.snapshot.images.length, locale === 'pt-BR' ? 'foto' : 'photo')}</span>}
                          </p>
                          {version.decisionReason && <p className="mt-1 break-words pl-4 text-xs">{version.decisionReason}</p>}
                          {current && version.status === 'submitted' && stock?.merchandisingStatus === 'submitted' && (
                            <Track className="ml-4 mt-2">
                              {editable && <Pill size="sm" className="max-md:h-10" disabled={Boolean(busy)} onClick={() => approveVersion(version.id, version.updatedAt)}>{label('Approve', 'Aprovar')}</Pill>}
                              {/* Rejecting a stale review stays open on a sold unit; approving would relist it. */}
                              <Pill size="sm" disabled={!stock || Boolean(busy)} onClick={() => openDialog('reject', { reason: '' }, version.id)}>{label('Reject', 'Reprovar')}</Pill>
                            </Track>
                          )}
                          {current && editable && version.status === 'approved' && publicAction === 'reapprove' && (
                            <Track className="ml-4 mt-2">
                              <Pill size="sm" className="max-md:h-10" disabled={!editable || Boolean(busy)} onClick={() => approveVersion(version.id, version.updatedAt, true)}>{label('Re-approve', 'Aprovar novamente')}</Pill>
                            </Track>
                          )}
                        </div>
                      )
                    })}
                  </Panel>
                )}
              </SectionError>
            </DeskSection>

            <DeskSection title={label('Condition reports', 'Laudos de vistoria')} id="vehicle-condition" count={detail.conditionReports.length} actions={<Track><Pill size="sm" disabled={Boolean(busy)} onClick={() => openCondition()}><Plus /> {label('New', 'Novo')}</Pill></Track>}>
              {detail.conditionReports.length === 0 ? <EmptyRow>{label('No condition reports', 'Nenhum laudo de vistoria')}</EmptyRow> : (
                <Panel className="divide-y">
                  {detail.conditionReports.map(report => (
                    <div key={report.id} className="min-w-0 px-4 py-3">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <TitleLine tone={report.overallCondition === 'poor' ? 'bad' : report.overallCondition === 'fair' ? 'warn' : report.overallCondition ? 'ok' : 'idle'} className="text-sm font-medium">
                          {formatDate(report.reportDate, timeZone, locale)}
                          <span className="font-normal text-muted-foreground"> · {report.overallCondition ? domainLabel(ratingLabels[report.overallCondition]) : label('Unrated', 'Não avaliado')}</span>
                        </TitleLine>
                        <Track><Pill size="sm" variant="plain" className="max-sm:h-11" disabled={Boolean(busy)} onClick={() => openCondition(report)}>{label('Edit', 'Editar')}</Pill></Track>
                      </div>
                      <p className="mt-0.5 flex flex-wrap gap-x-2 pl-4 text-xs text-muted-foreground">
                        {report.inspector && <span>{report.inspector}</span>}
                        {report.mechanicalRating && <span>· {label('Mechanical', 'Mecânica')} {domainLabel(ratingLabels[report.mechanicalRating])}</span>}
                        {report.bodyRating && <span>· {label('Body', 'Lataria')} {domainLabel(ratingLabels[report.bodyRating])}</span>}
                        {report.interiorRating && <span>· {label('Interior', 'Interior')} {domainLabel(ratingLabels[report.interiorRating])}</span>}
                        {report.estimatedRepairs != null && <span>· {label('Repairs', 'Reparos')} {new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode }).format(report.estimatedRepairs)}</span>}
                      </p>
                      {report.issues.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-8 text-xs">{report.issues.map((issue, index) => <li key={index} className="break-words">{issue.description}</li>)}</ul>}
                      {report.notes && <p className="mt-1 whitespace-pre-line break-words pl-4 text-xs text-muted-foreground">{report.notes}</p>}
                    </div>
                  ))}
                </Panel>
              )}
            </DeskSection>

            <DeskSection title={label('Vehicle history', 'Histórico do veículo')} id="vehicle-history" actions={<Track><Pill size="sm" disabled={Boolean(busy)} onClick={openHistory}>{detail.history ? <><Pencil /> {label('Edit', 'Editar')}</> : <><Plus /> {label('Add', 'Adicionar')}</>}</Pill></Track>}>
              {!detail.history ? <EmptyRow>{label('No history recorded', 'Nenhum histórico registrado')}</EmptyRow> : (
                <>
                  <Facts items={[
                    { label: label('Acquired on', 'Data da aquisição'), value: formatDate(detail.history.acquisitionDate, timeZone, locale) },
                    { label: label('Acquired from', 'Origem da aquisição'), value: detail.history.acquisitionSource || '-' },
                    { label: label('Previous owners', 'Proprietários anteriores'), value: detail.history.previousOwners ?? '-', mono: true },
                    { label: label('Title status', 'Situação documental'), value: detail.history.titleStatus || '-' },
                    { label: label('Accidents', 'Acidentes'), value: detail.history.hasAccidents ? label('Yes', 'Sim') : label('None reported', 'Nenhum informado') },
                  ]} />
                  {detail.history.hasAccidents && detail.history.accidentDetails && <p className="mt-2 whitespace-pre-line break-words text-sm text-muted-foreground">{detail.history.accidentDetails}</p>}
                  {detail.history.serviceRecords && (
                    <div className="mt-3 border-t pt-3 text-sm">
                      <p className="text-[12px] font-medium text-muted-foreground">{label('Service records', 'Registros de manutenção')}</p>
                      <p className="mt-1 whitespace-pre-line break-words text-muted-foreground">{detail.history.serviceRecords}</p>
                    </div>
                  )}
                  {detail.history.notes && <p className="mt-2 whitespace-pre-line break-words text-sm text-muted-foreground">{detail.history.notes}</p>}
                </>
              )}
            </DeskSection>
          </div>

          <div className="min-w-0 space-y-8">
            <DeskSection title={label('Stock', 'Estoque')} id="vehicle-stock" actions={stock && (
              <Track>
                <Pill size="sm" disabled={!editable || Boolean(busy)} title={editable ? undefined : notEditableReason} onClick={() => openDialog('move', { locationCode: stock.locationCode, locationLabel: stock.locationLabel || '' })}>{label('Move', 'Transferir')}</Pill>
                <Pill size="sm" disabled={Boolean(busy)} onClick={() => openDialog('cost', { costType: 'reconditioning', amount: '', reference: '' })}>{label('Cost', 'Custo')}</Pill>
              </Track>
            )}>
              {!stock ? <EmptyRow>{label('Not stocked', 'Fora do estoque')}</EmptyRow> : (
                <Facts items={[
                  { label: label('Location', 'Localização'), value: stock.locationLabel && stock.locationLabel !== stock.locationCode ? `${stock.locationLabel} (${stock.locationCode})` : stock.locationCode, mono: true },
                  { label: label('Stocked', 'Entrada no estoque'), value: formatDate(stock.stockedAt, timeZone, locale) },
                  { label: label('Frontline', 'Pronto para venda'), value: stock.frontlineAt ? formatDate(stock.frontlineAt, timeZone, locale) : label('Not yet', 'Ainda não') },
                  { label: label('Recon', 'Preparação'), value: domainLabel(stock.reconStatus === 'completed' ? 'Completed' : stock.reconStatus === 'in-progress' ? 'In progress' : 'Not started') },
                  { label: label('Listing', 'Anúncio'), value: domainLabel(merchandisingStatusLabels[stock.merchandisingStatus] || stock.merchandisingStatus) },
                  { label: label('Storefront', 'Vitrine'), value: listingLive ? label('Live', 'Publicado') : `${label('Not live', 'Não publicado')}: ${stock.publicListing.reason || label('Not available', 'Indisponível')}` },
                  stock.cost && { label: label('Purchase', 'Compra'), value: money(stock.cost.purchaseCostCents), mono: true },
                  stock.cost && { label: label('Recon cost', 'Custo de preparação'), value: money(stock.cost.reconCostCents), mono: true },
                  stock.cost && { label: label('Other costs', 'Outros custos'), value: money(stock.cost.otherCostCents), mono: true },
                  stock.cost && { label: label('Total cost', 'Custo total'), value: money(stock.cost.totalCostCents), mono: true },
                ]} />
              )}
            </DeskSection>

            <DeskSection title={label('Current deal', 'Venda atual')} id="vehicle-deal">
              <SectionError locale={locale} section={detail.deals}>
                {!activeDeal ? <EmptyRow>{label('No open deal', 'Nenhuma venda em andamento')}</EmptyRow> : (
                  <Panel className="px-4 py-3">
                    <TitleLine tone={activeDeal.status === 'delivered' ? 'ok' : 'info'} status={domainLabel(dealStatusLabels[activeDeal.status])} className="text-sm font-medium">
                      <Link href={`${basePath}/platform/deals/${activeDeal.id}`} className="inline-flex items-center gap-1 hover:underline">
                        {[activeDeal.lead?.firstName, activeDeal.lead?.lastName].filter(Boolean).join(' ') || recordReference('DEAL', activeDeal.id)}
                        <ExternalLink className="size-3" />
                      </Link>
                    </TitleLine>
                    <p className="mt-0.5 flex flex-wrap gap-x-2 pl-4 text-xs text-muted-foreground">
                      <span>{domainLabel(dealStatusLabels[activeDeal.status] || activeDeal.status)}</span>
                      {activeDeal.vehiclePriceCents != null && <span>· {money(activeDeal.vehiclePriceCents)}</span>}
                      {activeDeal.salesperson?.name && <span>· {activeDeal.salesperson.name}</span>}
                      <span>· {label('Opened', 'Aberta em')} {formatDate(activeDeal.createdAt, timeZone, locale)}</span>
                    </p>
                  </Panel>
                )}
              </SectionError>
            </DeskSection>

            <DeskSection title={label('Acquisition', 'Aquisição')} id="vehicle-acquisition" actions={<Track><Pill size="sm" variant="plain" asChild><Link href={`${VEHICLES_HREF}/acquisitions`}>{label('Acquisitions', 'Aquisições')}</Link></Pill></Track>}>
              <SectionError locale={locale} section={detail.acquisition}>
                {!acquisition ? <EmptyRow>{label('No acquisition record', 'Nenhum registro de aquisição')}</EmptyRow> : (
                  <>
                    <TitleLine tone={acquisitionStatusTones[acquisition.status]} status={domainLabel(acquisitionStatusLabels[acquisition.status])} className="text-sm font-medium">
                      <Code className="text-foreground">{acquisition.reference}</Code>
                      <span className="font-normal text-muted-foreground"> · {domainLabel(acquisitionStatusLabels[acquisition.status] || acquisition.status)}</span>
                    </TitleLine>
                    <Facts className="mt-2" items={[
                      { label: label('Source', 'Origem'), value: domainLabel(acquisitionSourceLabels[acquisition.acquisitionSource] || acquisition.acquisitionSource) },
                      Boolean(acquisition.sourceReference) && { label: label('Source ref', 'Referência da origem'), value: acquisition.sourceReference, mono: true },
                      { label: label('Appraisal', 'Avaliação'), value: money(acquisition.appraisalCents), mono: true },
                      { label: label('Purchase', 'Compra'), value: money(acquisition.purchaseCents), mono: true },
                      acquisition.reconEstimateCents != null && { label: label('Recon estimate', 'Estimativa de preparação'), value: money(acquisition.reconEstimateCents), mono: true },
                    ]} />
                    {(acquisition.status === 'arrived' || acquisition.status === 'reconditioning') && editable && (
                      <Track className="mt-2">
                        {acquisition.status === 'arrived'
                          ? <Pill size="sm" disabled={Boolean(busy)} onClick={() => advanceAcquisition('reconditioning')}>{label('Send to recon', 'Enviar para preparação')}</Pill>
                          : <Pill size="sm" disabled={Boolean(busy) || !reconDone || !listingApproved || Boolean(publicAction)} onClick={() => advanceAcquisition('frontline')}>{label('Mark frontline', 'Marcar como pronto para venda')}</Pill>}
                      </Track>
                    )}
                    {acquisition.status === 'reconditioning' && editable && (!reconDone || !listingApproved || Boolean(publicAction)) && (
                      <p className="mt-1 text-xs text-muted-foreground">{!reconDone ? 'Frontline needs recon finished' : 'Frontline needs the current listing approved'}</p>
                    )}
                    <ol className="mt-3 space-y-2 border-l pl-4">
                      {acquisition.events.map(event => (
                        <li key={event.id} className="relative text-sm">
                          <span aria-hidden="true" className="absolute -left-[21px] top-1.5 size-2 rounded-[1px] bg-muted-foreground/40" />
                          <p className="font-medium">{event.fromStatus ? `${domainLabel(acquisitionStatusLabels[event.fromStatus] || event.fromStatus)} ${label('to', 'para')} ${domainLabel(acquisitionStatusLabels[event.toStatus] || event.toStatus)}` : domainLabel(acquisitionStatusLabels[event.toStatus] || event.toStatus)}</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(event.occurredAt, timeZone, locale)} · {personName(event.actor, locale)}</p>
                          <p className="break-words text-xs text-muted-foreground">{event.reason}</p>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </SectionError>
            </DeskSection>

            <DeskSection title={label('Price history', 'Histórico de preços')} id="vehicle-prices" count={detail.priceHistory.ok ? detail.priceHistory.data.length : undefined}>
              <SectionError locale={locale} section={detail.priceHistory}>
                {detail.priceHistory.ok && detail.priceHistory.data.length === 0 ? <EmptyRow>{label('No price changes', 'Nenhuma alteração de preço')}</EmptyRow> : detail.priceHistory.ok && (
                  <Panel className="divide-y">
                    {detail.priceHistory.data.map(entry => {
                      const down = entry.previousPriceCents != null && entry.newPriceCents < entry.previousPriceCents
                      return (
                        <div key={entry.id} className="min-w-0 px-4 py-2.5 text-sm">
                          <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <span className="tabular-nums">{entry.previousPriceCents == null ? label('Set', 'Definido') : money(entry.previousPriceCents)} {label('to', 'para')} <span className="font-medium text-foreground">{money(entry.newPriceCents)}</span>{down && <span className="text-xs text-muted-foreground"> ({label('reduced', 'reduzido')})</span>}</span>
                            <span className="text-xs text-muted-foreground">{formatDateTime(entry.effectiveDate, timeZone, locale)}</span>
                          </p>
                          <p className="break-words text-xs text-muted-foreground">{[entry.changeReason, personName(entry.changedBy, locale)].filter(Boolean).join(' · ')}</p>
                        </div>
                      )
                    })}
                  </Panel>
                )}
              </SectionError>
            </DeskSection>

            <DeskSection title={label('Stock ledger', 'Movimentações do estoque')} id="vehicle-ledger" count={detail.stockEvents.ok ? detail.stockEvents.data.length : undefined}>
              <SectionError locale={locale} section={detail.stockEvents}>
                {!stock ? <EmptyRow>{label('Not stocked', 'Fora do estoque')}</EmptyRow> : detail.stockEvents.ok && detail.stockEvents.data.length === 0 ? <EmptyRow>{label('No events', 'Nenhuma movimentação')}</EmptyRow> : detail.stockEvents.ok && (
                  <Panel className="max-h-[32rem] divide-y overflow-y-auto">
                    {detail.stockEvents.data.map(entry => (
                      <div key={entry.id} className="min-w-0 px-4 py-2.5 text-sm">
                        <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="font-medium">{domainLabel(eventTypeLabel(entry.eventType))}</span>
                          {entry.amountCents != null && <span className="text-xs tabular-nums">{money(entry.amountCents)}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(entry.occurredAt, timeZone, locale)} · {personName(entry.actor, locale)}</p>
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
