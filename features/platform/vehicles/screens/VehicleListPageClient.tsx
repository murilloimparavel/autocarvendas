'use client'

import { isRepresentativePhoto } from '@/features/storefront/lib/photoAttribution'
import { useLocale } from '@/features/i18n/LocaleProvider'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ClipboardList, History, MoreHorizontal, Plus, RefreshCw, Search, Upload } from 'lucide-react'
import { LiveVehiclePhotos, reorderPhotoIds, uploadVehiclePhoto, VehiclePhotoEditor } from '../components/VehiclePhotos'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
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
  Tr,
  Track,
  type DeskTone,
} from '@/features/platform/components/desk'
import {
  type InventoryMake,
  type InventoryVehicle,
  type IntakeRooftop,
  decideInventoryMerchandising,
  getInventoryWorkspace,
  intakeInventoryVehicle,
  moveInventoryStock,
  openInventoryReconWorkItem,
  recordInventoryCost,
  recordInventoryFeedRun,
  submitInventoryMerchandising,
  transitionInventoryAcquisition,
  transitionInventoryReconWorkItem,
  updateInventoryMerchandisingDraft,
} from '../actions'
import { selectPublicFeedRunCandidates } from '../lib/publicFeedCandidates'
import { ACQUISITION_SOURCES, COST_TYPES, RECON_CATEGORIES, acquisitionSourceLabels, costTypeLabels, reconCategoryLabels } from '../lib/inventoryLabels'
import {
  createMerchandisingCommandAttempt,
  resolveMerchandisingCommandAttempt,
  resolveMerchandisingCommandResponse,
  type MerchandisingCommandAttempt,
} from '../lib/merchandisingCommandOutcome'
import {
  createReconStartAttempt,
  normalizeReconStartResult,
  resolveReconStartAttempt,
  type ReconStartAttempt,
} from '../lib/reconStartOutcome'
import {
  createReconCompletionAttempt,
  normalizeReconCompletionResult,
  resolveReconCompletionAttempt,
  type ReconCompletionAttempt,
} from '../lib/reconCompletionOutcome'
import {
  normalizePublicFeedRunResult,
  resolvePublicFeedRunAttempt,
  type PublicFeedRunAttempt,
} from '../lib/publicFeedRunOutcome'

type Vehicle = InventoryVehicle

type InventoryTaskType = 'intake' | 'edit' | 'photos' | 'move' | 'cost' | 'recon-open' | 'recon-complete'
type StagedPhoto = { id: string; file: File | null; url: string; name: string }
type InventoryTask = { type: InventoryTaskType; vehicle: Vehicle | null; reconWorkItem?: Vehicle['reconWorkItems'][number]; idempotencyKey: string; fields: Record<string, string>; reconCompletionAttempt?: ReconCompletionAttempt }

/** Accept locale formatted currency values while preserving the stored currency. */
function moneyInputCents(value: string, locale: 'pt-BR' | 'en-US' = 'en-US') {
  const trimmed = value.trim().replace(/^(?:R\$|US\$|\$)\s*/, '')
  const valid = locale === 'pt-BR'
    ? /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(trimmed)
    : /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(trimmed)
  if (!valid) return null
  const normalized = locale === 'pt-BR' ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed.replace(/,/g, '')
  const [whole, fraction = ''] = normalized.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents <= 2_147_483_647 ? cents : null
}

const statusTones: Record<string, DeskTone> = {
  available: 'ok',
  prep: 'info',
  pending: 'warn',
  hold: 'info',
  service: 'idle',
  sold: 'accent',
}

const statusLabels: Record<string, string> = {
  available: 'Available',
  prep: 'In prep',
  pending: 'Pending',
  hold: 'On hold',
  service: 'In service',
  sold: 'Sold',
}

const LOT_STATUSES = ['available', 'prep', 'pending', 'hold', 'service', 'sold'] as const

/** Intake stocks a unit as Vehicle.status `service` until it is marked frontline; that is prep, not a repair. */
function lotStage(vehicle: Vehicle) {
  return vehicle.status === 'service' && !vehicle.frontlineAt ? 'prep' : vehicle.status
}

/** The workspace filters on Vehicle.status; prep and service share `service`. */
function serverStatusFilter(stage: string) {
  return stage === 'prep' ? 'service' : stage
}

const acquisitionLabels: Record<string, string> = {
  appraised: 'Appraised',
  approved: 'Acquisition approved',
  purchased: 'Purchased',
  arrived: 'Arrived',
  reconditioning: 'Sent to recon',
  frontline: 'Frontline',
  cancelled: 'Acquisition cancelled',
}

const reconLabels: Record<string, string> = {
  'not-started': 'Recon not started',
  'in-progress': 'Recon in progress',
  completed: 'Recon done',
}

const listingLabels: Record<string, string> = {
  draft: 'Listing draft',
  submitted: 'Listing awaiting approval',
  approved: 'Listing approved',
  rejected: 'Listing rejected',
}

const conditionLabels: Record<string, string> = {
  new: 'New',
  used: 'Used',
  certified: 'Certified Pre-Owned',
}

const CONDITIONS = ['new', 'used', 'certified'] as const
const OTHER_MAKE = '__other'

function featureList(value: string) {
  return [...new Set(value.split(/[\n,]/).map(feature => feature.trim()).filter(Boolean))].slice(0, 100)
}

const fieldLabelClass = 'text-[12px] font-medium text-muted-foreground'

function countByStage(list: Vehicle[]) {
  return list.reduce<Record<string, number>>((counts, vehicle) => {
    const stage = lotStage(vehicle)
    counts[stage] = (counts[stage] || 0) + 1
    return counts
  }, {})
}

/** Reads the work items first; the stock-level status says "in progress" as soon as an item is opened. */
function reconLabel(vehicle: Vehicle, locale: 'pt-BR' | 'en-US' = 'en-US') {
  const items = vehicle.reconWorkItems
  if (items.some(item => item.status === 'in-progress')) return locale === 'pt-BR' ? 'Preparação em andamento' : 'Recon in progress'
  if (items.some(item => item.status === 'open')) return items.some(item => item.status === 'completed') ? (locale === 'pt-BR' ? 'Preparação em aberto' : 'Recon open') : (locale === 'pt-BR' ? 'Preparação não iniciada' : 'Recon not started')
  if (vehicle.reconStatus === 'completed' || (items.length > 0 && items.every(item => ['completed', 'cancelled'].includes(item.status)))) return locale === 'pt-BR' ? 'Preparação concluída' : 'Recon done'
  return locale === 'pt-BR' ? ({ 'not-started': 'Preparação não iniciada', 'in-progress': 'Preparação em andamento', completed: 'Preparação concluída' } as Record<string, string>)[vehicle.reconStatus] || vehicle.reconStatus : reconLabels[vehicle.reconStatus] || vehicle.reconStatus
}

/** What the merchandising gate (inventoryPublication.ts) will refuse, as the next step to take. */
function listingNeeds(vehicle: Vehicle): 'photos' | 'details' | null {
  if (!vehicle.images.length) return 'photos'
  if (!vehicle.description.trim() || vehicle.price <= 0) return 'details'
  return null
}

/** Listing, photo, recon and frontline work run only on lot inventory (the server refuses the rest). */
function isActiveInventory(vehicle: Vehicle) {
  return vehicle.status === 'available' || vehicle.status === 'service'
}

function inactiveReason(vehicle: Vehicle, locale: 'pt-BR' | 'en-US') {
  const label = locale === 'pt-BR' ? ({ available: 'disponíveis', prep: 'em preparação', pending: 'pendentes', hold: 'reservados', service: 'em serviço', sold: 'vendidos' } as Record<string, string>)[vehicle.status] || vehicle.status : statusLabels[vehicle.status] || vehicle.status
  return locale === 'pt-BR' ? `Veículos ${label} não podem ter o anúncio alterado.` : `${label} units are closed to listing changes`
}

function hasOpenRecon(vehicle: Vehicle) {
  return vehicle.reconWorkItems.some(item => ['open', 'in-progress'].includes(item.status))
}


export function VehicleListPageClient({
  initialVehicles,
  initialIntakeRooftops,
  initialError,
  currencyCode,
  makes = [],
}: {
  initialVehicles: Vehicle[]
  initialIntakeRooftops: IntakeRooftop[]
  initialError: string | null
  currencyCode: string
  makes?: InventoryMake[]
}) {
  const { locale, t } = useLocale()
  const pt = locale === 'pt-BR'
  const stockStatusLabel = (status: string) => pt ? ({ available: t('lotAvailable'), prep: t('lotPrep'), pending: t('lotPending'), hold: t('lotHold'), service: t('lotService'), sold: t('lotSold') } as Record<string, string>)[status] || status : statusLabels[status] || status
  const acquisitionLabel = (status: string) => pt ? ({ appraised: 'Avaliado', approved: 'Avaliação aprovada', purchased: 'Comprado', arrived: 'Recebido', reconditioning: 'Em preparação', frontline: 'Pronto para venda', cancelled: 'Entrada cancelada' } as Record<string, string>)[status] || status : acquisitionLabels[status] || status
  const conditionLabel = (condition: string) => pt ? ({ new: 'Novo', used: 'Usado', certified: 'Seminovo certificado' } as Record<string, string>)[condition] || condition : conditionLabels[condition] || condition
  const sourceLabel = (source: string) => pt ? ({ 'trade-in': 'Veículo na troca', auction: 'Leilão', wholesale: 'Atacado', 'consumer-purchase': 'Compra de particular', 'oem-distributor': 'Montadora / distribuidor', 'dealer-transfer': 'Transferência entre lojas' } as Record<string, string>)[source] || source : acquisitionSourceLabels[source] || source
  const listingStatusLabel = (status: string) => pt ? ({ draft: 'Rascunho do anúncio', submitted: 'Aguardando aprovação', approved: 'Aprovado', rejected: 'Rejeitado' } as Record<string, string>)[status] || status : listingLabels[status] || status
  const feedStatusLabel = (status: string) => pt ? ({ 'not-published': 'Não publicado', succeeded: 'Publicado', partial: 'Publicado parcialmente', failed: 'Falha na publicação' } as Record<string, string>)[status] || status : status
  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortOrder, setSortOrder] = useState<string>('age-desc')
  const [searchQuery, setSearchQuery] = useState('')
  const [actionId, setActionId] = useState<string | null>(null)
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
  const [intakeRooftops, setIntakeRooftops] = useState<IntakeRooftop[]>(initialIntakeRooftops)
  const [intakeRooftopId, setIntakeRooftopId] = useState(initialIntakeRooftops[0]?.id || '')
  const [task, setTask] = useState<InventoryTask | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [actionMessage, setActionMessageText] = useState<string | null>(null)
  const [actionTone, setActionTone] = useState<DeskTone>('idle')
  const setActionMessage = (message: string | null, tone: DeskTone = 'idle') => {
    setActionMessageText(message)
    setActionTone(tone)
  }
  const [pendingFeedRun, setPendingFeedRun] = useState<PublicFeedRunAttempt | null>(null)
  const [pendingMerchandisingAttempt, setPendingMerchandisingAttempt] = useState<MerchandisingCommandAttempt | null>(null)
  const [pendingReconStart, setPendingReconStart] = useState<ReconStartAttempt | null>(null)
  const [intakePhotos, setIntakePhotos] = useState<StagedPhoto[]>([])
  const [intakePhotoStatus, setIntakePhotoStatus] = useState<string | null>(null)
  const [lotCounts, setLotCounts] = useState<Record<string, number> | null>(() => initialError ? null : countByStage(initialVehicles))

  const isInitialLoad = useRef(true)
  /** The open task's unit as last loaded, so photo changes made in a dialog show straight away. */
  const currentTaskVehicle = task?.vehicle ? vehicles.find(vehicle => vehicle.inventoryStockId === task.vehicle!.inventoryStockId) ?? task.vehicle : null

  const loadVehicles = async () => {
    setLoading(true)
    setError(null)

    const response = await getInventoryWorkspace(serverStatusFilter(statusFilter))
    if (response.success) {
      const rooftops = response.intakeRooftops
      setIntakeRooftops(rooftops)
      setIntakeRooftopId(current => current || rooftops[0]?.id || '')
      setVehicles(statusFilter === 'all' ? response.vehicles : response.vehicles.filter(vehicle => lotStage(vehicle) === statusFilter))
      const counted = countByStage(response.vehicles)
      setLotCounts(current => {
        if (statusFilter === 'all') return counted
        if (!current) return current
        const stages = statusFilter === 'prep' || statusFilter === 'service' ? ['prep', 'service'] : [statusFilter]
        return { ...current, ...Object.fromEntries(stages.map(stage => [stage, counted[stage] || 0])) }
      })
    } else {
      setError(response.error || t('lotUnableLoad'))
    }
    setLoading(false)
  }

  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false
      return
    }
    void loadVehicles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const beginTask = (type: InventoryTaskType, vehicle: Vehicle | null = null, reconWorkItem?: Vehicle['reconWorkItems'][number]) => {
    if (type === 'intake' && !intakeRooftopId) {
      setActionMessage(t('lotNoRooftop'))
      return
    }
    const fields: Record<string, string> = type === 'intake' ? {
      vin: '', stockNumber: '', year: String(new Date().getFullYear()), condition: 'used', makeChoice: '', make: '', model: '', trim: '',
      exteriorColor: '', interiorColor: '', features: '',
      purchaseDollars: '', retailDollars: '', mileage: '0', description: '', locationCode: 'INTAKE', acquisitionSource: 'dealer-transfer', sourceReference: '',
    } : type === 'edit' && vehicle ? {
      retailDollars: (vehicle.price).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), mileage: String(pt ? Math.round(vehicle.mileage * 1.609344) : vehicle.mileage), description: vehicle.description,
    } : type === 'photos' ? {} : type === 'move' && vehicle ? { locationCode: vehicle.locationCode } : type === 'cost' ? { costType: 'other', dollars: '100', reference: '' } :
      type === 'recon-open' ? { title: '', category: 'inspection', estimatedDollars: '0' } : { actualDollars: '0' }
    setTaskError(null)
    setActionMessage(null)
    if (type === 'intake') clearIntakePhotos()
    setTask({ type, vehicle, reconWorkItem, idempotencyKey: `inventory-${type}:${vehicle?.inventoryStockId || crypto.randomUUID()}:${crypto.randomUUID()}`, fields })
  }

  const clearIntakePhotos = () => {
    setIntakePhotos(current => {
      current.forEach(photo => { if (photo.file) URL.revokeObjectURL(photo.url) })
      return []
    })
    setIntakePhotoStatus(null)
  }
  const closeTask = () => {
    setTask(null)
    setTaskError(null)
    clearIntakePhotos()
  }
  const stageIntakeFiles = (files: File[]) => setIntakePhotos(current => [
    ...current,
    ...files.map(file => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), name: file.name })),
  ])
  const stageIntakeUrl = (url: string) => setIntakePhotos(current => [...current, { id: crypto.randomUUID(), file: null, url, name: url.split('/').pop() || 'Photo' }])
  const moveIntakePhoto = (id: string, to: number) => setIntakePhotos(current => {
    const order = reorderPhotoIds(current.map(photo => photo.id), id, to)
    return order.map(photoId => current.find(photo => photo.id === photoId)!)
  })
  const removeIntakePhoto = (id: string) => setIntakePhotos(current => current.filter(photo => {
    if (photo.id === id && photo.file) URL.revokeObjectURL(photo.url)
    return photo.id !== id
  }))

  /** Intake photos go up after the unit is stocked, in the order shown; the first becomes primary. */
  const uploadIntakePhotos = async (stockId: string, idempotencyKey: string) => {
    let failed = 0
    for (const [index, photo] of intakePhotos.entries()) {
      setIntakePhotoStatus(t('lotUploadProgress').replace('{current}', String(index + 1)).replace('{total}', String(intakePhotos.length)))
      try {
        const response = await uploadVehiclePhoto(stockId, photo, `${idempotencyKey}:photo:${photo.id}`)
        if (!response.success) failed += 1
      } catch {
        failed += 1
      }
    }
    setIntakePhotoStatus(null)
    return failed
  }

  const intakeVehicle = () => beginTask('intake')
  const editMerchandisingDraft = (vehicle: Vehicle) => beginTask('edit', vehicle)
  const managePhotos = (vehicle: Vehicle) => beginTask('photos', vehicle)
  const moveStock = (vehicle: Vehicle) => beginTask('move', vehicle)
  const addInventoryCost = (vehicle: Vehicle) => beginTask('cost', vehicle)

  const submitInventoryTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!task) return
    if (task.type === 'photos') {
      closeTask()
      return
    }
    const field = (name: string) => task.fields[name]?.trim() || ''
    const money = (name: string) => {
      const cents = moneyInputCents(field(name), locale)
      if (cents == null) throw new Error(t('lotErrorMoneyExample'))
      return cents
    }
    setTaskError(null)
    setActionMessage(null)
    setActionId(task.vehicle?.inventoryStockId || 'intake')
    let reconCompletionAttempt: ReconCompletionAttempt | null = task.reconCompletionAttempt ?? null
    let taskSuccessMessage = t('lotSaved')
    let taskSuccessTone: DeskTone = 'idle'
    try {
      let response: { success: boolean; error?: string } | undefined
      if (task.type === 'intake') {
        const vin = field('vin').toUpperCase()
        const stockNumber = field('stockNumber').toUpperCase()
        const year = Number(field('year'))
        const enteredMileage = Number(field('mileage'))
        const mileage = pt ? Math.round(enteredMileage / 1.609344) : enteredMileage
        const make = makes.length && field('makeChoice') !== OTHER_MAKE ? field('makeChoice') : field('make')
        const model = field('model')
        const condition = field('condition')
        if (!CONDITIONS.includes(condition as typeof CONDITIONS[number])) throw new Error(t('chooseCondition'))
        const locationCode = field('locationCode').toUpperCase()
        const purchasePriceCents = money('purchaseDollars')
        const priceCents = money('retailDollars')
        taskSuccessMessage = t('lotUnitStocked')
        if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) throw new Error(t('lotValidVin'))
        if (!stockNumber || !make || !model || !locationCode || !Number.isInteger(year) || year < 1886 || year > new Date().getFullYear() + 1 || !Number.isSafeInteger(mileage) || mileage < 0 || priceCents <= 0) {
          throw new Error(t('lotRequiredInventoryFields'))
        }
        const intakeResponse = await intakeInventoryVehicle({
          rooftopId: intakeRooftopId, idempotencyKey: task.idempotencyKey,
          reason: pt ? 'Veículo adquirido e incluído no estoque pela operação' : 'Vehicle acquired and stocked from inventory operations desk', acquisitionSource: ACQUISITION_SOURCES.includes(field('acquisitionSource') as typeof ACQUISITION_SOURCES[number]) ? field('acquisitionSource') : 'dealer-transfer', sourceReference: field('sourceReference') || 'operator-recorded',
          vin, stockNumber, year, make, model, trim: field('trim'), exteriorColor: field('exteriorColor'), interiorColor: field('interiorColor'),
          mileage, purchasePriceCents, listPriceCents: priceCents, priceCents,
          condition, description: field('description'), features: featureList(task.fields.features || ''), imagePath: '', locationCode, locationLabel: locationCode,
        })
        if (intakeResponse.success && intakePhotos.length) {
          const failed = await uploadIntakePhotos(intakeResponse.data.intakeInventoryVehicle.stockId, task.idempotencyKey)
          if (failed) {
            taskSuccessMessage = `${t('lotUnitStocked')} ${t('lotPhotoUploadFailed').replace('{failed}', String(failed)).replace('{total}', String(intakePhotos.length))}`
            taskSuccessTone = 'warn'
          } else {
            taskSuccessMessage = intakePhotos.length === 1 ? t('lotUnitWithOnePhoto') : t('lotUnitWithPhotos').replace('{count}', String(intakePhotos.length))
          }
        }
        response = intakeResponse
      } else if (task.type === 'edit' && task.vehicle) {
        const priceCents = money('retailDollars')
        const enteredMileage = Number(field('mileage'))
        const mileage = pt ? Math.round(enteredMileage / 1.609344) : enteredMileage
        if (priceCents <= 0 || !Number.isSafeInteger(mileage) || mileage < 0 || !field('description')) throw new Error(t('lotPositiveDescription'))
        // Photo changes in this dialog save on their own and move the stock revision forward.
        const current = currentTaskVehicle || task.vehicle
        response = await updateInventoryMerchandisingDraft({
          stockId: current.inventoryStockId, priceCents, listPriceCents: priceCents, mileage, description: field('description'),
          expectedUpdatedAt: current.stockUpdatedAt, reason: pt ? 'Rascunho do anúncio atualizado pela operação de estoque' : 'Listing draft updated from inventory operations desk', idempotencyKey: task.idempotencyKey,
        })
      } else if (task.type === 'move' && task.vehicle) {
        const locationCode = field('locationCode').toUpperCase()
        if (!locationCode) throw new Error(t('lotLocationRequired'))
        response = await moveInventoryStock({ stockId: task.vehicle.inventoryStockId, locationCode, locationLabel: locationCode, expectedUpdatedAt: task.vehicle.stockUpdatedAt, reason: pt ? 'Movido no pátio pela operação de estoque' : 'Moved from inventory operations desk', idempotencyKey: task.idempotencyKey })
      } else if (task.type === 'cost' && task.vehicle) {
        const amountCents = money('dollars')
        if (amountCents <= 0) throw new Error(t('lotCostPositive'))
        response = await recordInventoryCost({ stockId: task.vehicle.inventoryStockId, costType: COST_TYPES.includes(field('costType') as typeof COST_TYPES[number]) ? field('costType') : 'other', amountCents, reference: field('reference') || undefined, reason: pt ? 'Custo registrado pela operação de estoque' : 'Cost recorded from inventory operations desk', idempotencyKey: task.idempotencyKey })
      } else if (task.type === 'recon-open' && task.vehicle) {
        const title = field('title')
        if (!title) throw new Error(t('lotReconWorkRequired'))
        const estimatedCostCents = money('estimatedDollars')
        response = await openInventoryReconWorkItem({ stockId: task.vehicle.inventoryStockId, title, category: RECON_CATEGORIES.includes(field('category') as typeof RECON_CATEGORIES[number]) ? field('category') : 'other', estimatedCostCents, reason: pt ? 'Serviço de preparação aberto pela operação de estoque' : 'Opened from inventory operations desk', idempotencyKey: task.idempotencyKey })
      } else if (task.type === 'recon-complete' && task.vehicle && task.reconWorkItem) {
        const attempt = resolveReconCompletionAttempt(task.reconCompletionAttempt ?? null, () => createReconCompletionAttempt(
          task.reconWorkItem!.id,
          task.vehicle!.inventoryStockId,
          task.reconWorkItem!.updatedAt,
          money('actualDollars'),
          pt ? 'Serviço de preparação concluído pela operação de estoque' : 'Completed from inventory operations desk',
          task.idempotencyKey
        ))
        reconCompletionAttempt = attempt
        setTask(current => current && current.idempotencyKey === task.idempotencyKey ? { ...current, reconCompletionAttempt: attempt } : current)
        const reconResponse = await transitionInventoryReconWorkItem({ id: attempt.workItemId, toStatus: attempt.toStatus, actualCostCents: attempt.actualCostCents, expectedUpdatedAt: attempt.expectedUpdatedAt, reason: attempt.reason, idempotencyKey: attempt.idempotencyKey })
        response = reconResponse
        if (!reconResponse.success && reconResponse.rejected) {
          // Refused before anything was written: show why and let the amount be corrected.
          reconCompletionAttempt = null
          setTask(current => current && current.idempotencyKey === task.idempotencyKey ? { ...current, reconCompletionAttempt: undefined } : current)
          setTaskError(reconResponse.error)
          return
        }
        const result = normalizeReconCompletionResult(
          reconResponse.success,
          reconResponse.success ? reconResponse.data.transitionInventoryReconWorkItem : null,
          attempt
        )
        if (!result) {
          setTaskError(t('lotUnconfirmedReconCompletion'))
          return
        }
        taskSuccessMessage = result.status === 'completed' ? t('lotReconCompleted') : t('lotReconCompletionStatus').replace('{status}', result.status)
      }
      if (!response?.success) {
        setTaskError(response?.error || t('lotUnableSaveRetry'))
        return
      }
      closeTask()
      setActionMessage(taskSuccessMessage, taskSuccessTone)
      await loadVehicles()
    } catch (error) {
      if (task.type === 'recon-complete' && reconCompletionAttempt) {
        setTaskError(t('lotUnconfirmedReconCompletion'))
      } else {
        setTaskError(error instanceof Error ? error.message : t('lotUnableSaveRetry'))
      }
    } finally {
      setActionId(null)
    }
  }

  const advanceAcquisition = async (vehicle: Vehicle) => {
    if (!vehicle.acquisition || !['arrived', 'reconditioning'].includes(vehicle.acquisition.status)) return
    const toStatus = vehicle.acquisition.status === 'arrived' ? 'reconditioning' : 'frontline'
    if (toStatus === 'frontline' && (vehicle.reconStatus !== 'completed' || vehicle.merchandisingStatus !== 'approved')) {
      setActionMessage(t('lotFinishReconApprove'), 'warn')
      return
    }
    setActionId(vehicle.inventoryStockId)
    const response = await transitionInventoryAcquisition({
      id: vehicle.acquisition.id,
      toStatus,
      expectedUpdatedAt: vehicle.acquisition.updatedAt,
      reason: pt ? (toStatus === 'frontline' ? 'Marcado como pronto para venda pela operação de estoque' : 'Enviado para preparação pela operação de estoque') : `${toStatus} from inventory operations desk`,
      idempotencyKey: `acquisition-transition:${vehicle.acquisition.id}:${crypto.randomUUID()}`,
    })
    if (response.success) setActionMessage(toStatus === 'frontline' ? t('lotMarkedReady') : t('lotSentToPrep'))
    else setActionMessage(response.error, 'bad')
    await loadVehicles()
    setActionId(null)
  }

  const executeMerchandisingAttempt = async (attempt: MerchandisingCommandAttempt) => {
    setPendingMerchandisingAttempt(attempt)
    setActionId(attempt.stockId)
    try {
      const response = attempt.kind !== 'submit'
        ? await decideInventoryMerchandising({ id: attempt.versionId, decision: attempt.decision, reason: attempt.reason, expectedUpdatedAt: attempt.expectedUpdatedAt, idempotencyKey: attempt.idempotencyKey })
        : await submitInventoryMerchandising({ stockId: attempt.stockId, reason: attempt.reason, idempotencyKey: attempt.idempotencyKey })
      if (!response.success && response.rejected) {
        setPendingMerchandisingAttempt(null)
        setActionMessage(response.error, 'bad')
        await loadVehicles()
        return
      }
      const result = resolveMerchandisingCommandResponse(
        response.success,
        response.success ? response.data[attempt.kind !== 'submit' ? 'decideInventoryMerchandising' : 'submitInventoryMerchandising'] : null,
        attempt
      )
      if (!result) {
        setPendingMerchandisingAttempt(attempt)
        setActionMessage(t('lotUnconfirmedListing'), 'warn')
        return
      }
      setPendingMerchandisingAttempt(null)
      const expectedStatus = attempt.kind === 'submit' ? 'submitted' : 'approved'
      const outcomeMessage = result.merchandisingStatus === expectedStatus
        ? attempt.kind === 'approve' ? t('lotListingApproved') : attempt.kind === 'reapprove' ? t('lotListingReapproved') : t('lotListingSubmitted')
        : t('lotListingStatus').replace('{status}', result.merchandisingStatus)
      setActionMessage(outcomeMessage)
      await loadVehicles()
    } catch {
      setPendingMerchandisingAttempt(attempt)
      setActionMessage(t('lotUnconfirmedListing'), 'warn')
    } finally {
      setActionId(null)
    }
  }

  const submitOrApproveMerchandising = async (vehicle: Vehicle) => {
    if (pendingMerchandisingAttempt) return
    const attempt = createMerchandisingCommandAttempt(vehicle.inventoryStockId, vehicle.latestMerchandisingVersion, () => crypto.randomUUID(), vehicle.publicListing.action)
    const reason = pt ? attempt.kind === 'submit' ? 'Anúncio enviado pela operação de estoque' : attempt.kind === 'reapprove' ? 'Anúncio aprovado novamente pela operação de estoque' : 'Anúncio aprovado pela operação de estoque' : attempt.reason
    await executeMerchandisingAttempt({ ...attempt, reason })
  }

  const retryMerchandisingAttempt = async () => {
    const attempt = resolveMerchandisingCommandAttempt(pendingMerchandisingAttempt, () => null)
    if (attempt) await executeMerchandisingAttempt(attempt)
  }

  const executeReconStartAttempt = async (attempt: ReconStartAttempt) => {
    setPendingReconStart(attempt)
    setActionId(attempt.stockId)
    try {
      const response = await transitionInventoryReconWorkItem({ id: attempt.workItemId, toStatus: attempt.toStatus, expectedUpdatedAt: attempt.expectedUpdatedAt, reason: attempt.reason, idempotencyKey: attempt.idempotencyKey })
      if (!response.success && response.rejected) {
        setPendingReconStart(null)
        setActionMessage(response.error, 'bad')
        await loadVehicles()
        return
      }
      const result = normalizeReconStartResult(response.success, response.success ? response.data.transitionInventoryReconWorkItem : null, attempt)
      if (!result) {
        setPendingReconStart(attempt)
        setActionMessage(null)
        return
      }
      setPendingReconStart(null)
      setActionMessage(result.status === 'in-progress' ? t('lotReconStarted') : t('lotReconStatus').replace('{status}', result.status))
      await loadVehicles()
    } catch {
      setPendingReconStart(attempt)
      setActionMessage(null)
    } finally {
      setActionId(null)
    }
  }

  const retryReconStart = async () => {
    const attempt = resolveReconStartAttempt(pendingReconStart, () => null)
    if (attempt) await executeReconStartAttempt(attempt)
  }

  const advanceRecon = async (vehicle: Vehicle) => {
    if (pendingReconStart) return
    const active = vehicle.reconWorkItems.find(item => ['open', 'in-progress'].includes(item.status))
    if (!active) return beginTask('recon-open', vehicle)
    if (active.status === 'in-progress') return beginTask('recon-complete', vehicle, active)
    const attempt = createReconStartAttempt(active.id, vehicle.inventoryStockId, active.updatedAt, () => crypto.randomUUID())
    if (pt) attempt.reason = 'Preparação iniciada pela operação de estoque'
    await executeReconStartAttempt(attempt)
  }

  const recordPublicFeed = async () => {
    const candidateStockIds = selectPublicFeedRunCandidates(vehicles).map(vehicle => vehicle.inventoryStockId)
    const attempt = resolvePublicFeedRunAttempt(pendingFeedRun, candidateStockIds, () => `public-feed:${crypto.randomUUID()}`)
    if (!attempt) { setActionMessage(t('lotNoVehiclesReadyFeed')); return }
    setPendingFeedRun(attempt)
    setActionId('feed')
    try {
      const response = await recordInventoryFeedRun({ channelKey: 'public-inventory-feed', stockIds: attempt.stockIds, errors: [], idempotencyKey: attempt.idempotencyKey })
      if (!response.success && response.rejected) {
        setPendingFeedRun(null)
        setActionMessage(response.error, 'bad')
        await loadVehicles()
        return
      }
      const result = response.success ? normalizePublicFeedRunResult(response.data.recordInventoryFeedRun, attempt.stockIds.length) : null
      if (!result) {
        setPendingFeedRun(attempt)
        setActionMessage(t('lotUnconfirmedFeed'), 'warn')
        return
      }
      setActionMessage((result.reused ? t('lotFeedAlreadyPublished') : t('lotFeedPublished')).replace('{attempted}', String(result.attemptedCount)).replace('{failed}', String(result.failedCount)))
      setPendingFeedRun(null)
      await loadVehicles()
    } catch {
      setPendingFeedRun(attempt)
      setActionMessage(t('lotUnconfirmedFeed'), 'warn')
    } finally {
      setActionId(null)
    }
  }

  const filteredVehicles = vehicles.filter(v => {
    if (!searchQuery) return true
    const search = searchQuery.toLowerCase()
    const str = `${v.year} ${v.make} ${v.model} ${v.vin} ${v.stockNumber} ${v.locationCode}`.toLowerCase()
    return str.includes(search)
  }).sort((a, b) => {
    if (sortOrder === 'age-asc') return (calculateDaysInStock(a) ?? -1) - (calculateDaysInStock(b) ?? -1)
    if (sortOrder === 'price-desc') return b.price - a.price
    if (sortOrder === 'price-asc') return a.price - b.price
    if (sortOrder === 'stock') return a.stockNumber.localeCompare(b.stockNumber)
    return (calculateDaysInStock(b) ?? -1) - (calculateDaysInStock(a) ?? -1)
  })

  const formatCurrency = (value: number | null | undefined) => {
    if (value == null) return '-'
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 }).format(value)
  }

  /** Stops at the sale date once sold; null for a sold unit with no recorded sale date. */
  function calculateDaysInStock(vehicle: Vehicle): number | null {
    const date = vehicle.dateAcquired || vehicle.createdAt
    if (vehicle.status === 'sold' && !vehicle.soldAt) return null
    if (!date) return 0
    const end = vehicle.status === 'sold' && vehicle.soldAt ? new Date(vehicle.soldAt).getTime() : Date.now()
    return Math.max(0, Math.floor((end - new Date(date).getTime()) / (1000 * 60 * 60 * 24)))
  }
  const daysLabel = (vehicle: Vehicle) => {
    const days = calculateDaysInStock(vehicle)
    return days == null ? t('lotSold') : days === 1 ? t('lotOneDay') : t('lotDaysCount').replace('{count}', String(days))
  }

  const totalValue = filteredVehicles.filter(v => v.status === 'available').reduce((sum, v) => sum + (v.price || 0), 0)
  const avgDaysInStock = filteredVehicles.filter(v => v.status === 'available').length > 0
    ? Math.round(filteredVehicles.filter(v => v.status === 'available').reduce((sum, v) => sum + (calculateDaysInStock(v) ?? 0), 0) / filteredVehicles.filter(v => v.status === 'available').length)
    : 0
  const agingCount = filteredVehicles.filter(v => v.status === 'available' && (calculateDaysInStock(v) ?? 0) > 60).length
  const updateTaskField = (name: string, value: string) => setTask(current => current ? { ...current, fields: { ...current.fields, [name]: value } } : current)
  const taskInput = (name: string, label: string, options: { type?: string; required?: boolean; min?: number; step?: number; maxLength?: number; inputMode?: 'decimal' | 'numeric' | 'text'; disabled?: boolean; list?: string } = {}) => (
    <label key={name} htmlFor={`inventory-task-${name}`} className="grid gap-1.5 text-sm">
      <span className={fieldLabelClass}>{label}</span>
      <Input id={`inventory-task-${name}`} type={options.type || 'text'} inputMode={options.inputMode} min={options.min} step={options.step} maxLength={options.maxLength} required={options.required ?? true} disabled={options.disabled} list={options.list} value={task?.fields[name] || ''} onChange={event => updateTaskField(name, event.target.value)} />
    </label>
  )
  const taskSelect = (name: string, label: string, options: ReadonlyArray<{ value: string; label: string }>) => (
    <label key={name} htmlFor={`inventory-task-${name}`} className="grid gap-1.5 text-sm">
      <span className={fieldLabelClass}>{label}</span>
      <Select value={task?.fields[name] || ''} onValueChange={value => updateTaskField(name, value)}>
        <SelectTrigger id={`inventory-task-${name}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  )
  const taskTitle = task?.type === 'intake' ? t('lotIntakeVehicle') : task?.type === 'edit' ? t('lotEditListingDraft') : task?.type === 'photos' ? t('lotPhotos') : task?.type === 'move' ? t('lotMoveInventory') : task?.type === 'cost' ? t('lotRecordCost') : task?.type === 'recon-open' ? t('lotAddReconWork') : t('lotFinishReconWork')
  const intakeMakeChoice = task?.type === 'intake' ? task.fields.makeChoice || '' : ''
  const intakeModels = makes.find(make => make.name === intakeMakeChoice)?.models || []
  const currencyUnit = new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode }).formatToParts(0).find(part => part.type === 'currency')?.value || currencyCode
  const taskCurrencyLabel = (label: string) => `${label} (${currencyUnit})`

  const isFiltered = Boolean(searchQuery.trim()) || statusFilter !== 'all'
  const resetFilters = () => {
    setSearchQuery('')
    setStatusFilter('all')
  }

  const breadcrumbs = [
    { type: 'link' as const, label: t('dashboard'), href: basePath },
    { type: 'page' as const, label: t('platform') },
    { type: 'page' as const, label: t('inventory') },
  ]

  const lotTotal = lotCounts ? Object.values(lotCounts).reduce((sum, count) => sum + count, 0) : undefined
  const statusOptions = [
    { value: 'all', label: t('lotAll'), count: lotTotal },
    ...LOT_STATUSES.map(status => ({ value: status, label: stockStatusLabel(status), count: lotCounts ? lotCounts[status] || 0 : undefined, tone: statusTones[status] })),
  ]
  const reconOpenCount = filteredVehicles.filter(hasOpenRecon).length
  const intakeRooftopName = intakeRooftops.find(rooftop => rooftop.id === intakeRooftopId)?.name

  /** Aged per the desk's 60-day threshold: available units only. */
  const isAged = (vehicle: Vehicle) => {
    const days = calculateDaysInStock(vehicle)
    return days != null && days > 60 && vehicle.status === 'available'
  }

  /** One step at a time: send to recon, work the recon items, approve the listing, then frontline. */
  const buildActions = (vehicle: Vehicle) => {
    const active = isActiveInventory(vehicle)
    const acquisitionStatus = vehicle.acquisition?.status
    const activeRecon = vehicle.reconWorkItems.find(item => ['open', 'in-progress'].includes(item.status))
    const reconDone = vehicle.reconStatus === 'completed'
    const listingApproved = vehicle.merchandisingStatus === 'approved'
    const needs = listingNeeds(vehicle)
    const actions: Array<{ key: string; label: string; onClick: () => void; disabled?: boolean }> = []
    // Pending, sold and delivered units are off the lot workflow: no recon, listing or frontline steps.
    if (active && acquisitionStatus === 'arrived' && vehicle.acquisition) {
      actions.push({ key: 'acquisition', label: t('lotSendToPrep'), onClick: () => advanceAcquisition(vehicle) })
    }
    if (active && !reconDone && acquisitionStatus !== 'arrived') {
      actions.push({
        key: 'recon',
        label: !activeRecon ? t('lotAddWork') : activeRecon.status === 'in-progress' ? t('lotFinishWork') : t('lotStartWork'),
        onClick: () => advanceRecon(vehicle),
        disabled: Boolean(pendingReconStart),
      })
    }
    if (active && reconDone && (!listingApproved || vehicle.publicListing.action)) {
      const submits = vehicle.publicListing.action !== 'reapprove' && vehicle.merchandisingStatus !== 'submitted'
      const listingLabel = vehicle.publicListing.action === 'reapprove' ? t('lotReapproveListing')
        : vehicle.publicListing.action === 'resubmit' ? t('lotResubmitListing')
          : vehicle.merchandisingStatus === 'submitted' ? t('lotApproveListing') : t('lotSubmitListing')
      // Submitting needs photos, a description and a price: offer the missing piece as the step.
      if (submits && needs === 'photos') actions.push({ key: 'listing', label: t('lotAddPhotos'), onClick: () => managePhotos(vehicle) })
      else if (submits && needs === 'details') actions.push({ key: 'listing', label: t('lotAddDescription'), onClick: () => editMerchandisingDraft(vehicle) })
      else actions.push({ key: 'listing', label: listingLabel, onClick: () => submitOrApproveMerchandising(vehicle), disabled: Boolean(pendingMerchandisingAttempt) })
    }
    if (active && acquisitionStatus === 'reconditioning' && vehicle.acquisition && reconDone && listingApproved && !vehicle.publicListing.action) {
      actions.push({ key: 'acquisition', label: t('lotMarkReady'), onClick: () => advanceAcquisition(vehicle) })
    }
    return actions
  }

  /** Why a unit is waiting on the desk, from the statuses the workspace already returns. */
  const waitingReasons = (vehicle: Vehicle) => {
    const reasons: Array<{ key: string; label: string; aged?: boolean }> = []
    if (isAged(vehicle)) reasons.push({ key: 'aged', label: pt ? t('lotAgedReason').replace('{count}', String(calculateDaysInStock(vehicle))) : `Aged ${calculateDaysInStock(vehicle)} days`, aged: true })
    if (!isActiveInventory(vehicle)) return reasons
    if (vehicle.acquisition?.status === 'arrived') reasons.push({ key: 'arrived', label: t('lotArrivedNotRecon') })
    if (hasOpenRecon(vehicle)) reasons.push({ key: 'recon', label: reconLabel(vehicle, locale) })
    if (!vehicle.images.length) reasons.push({ key: 'photos', label: t('lotNoPhotos') })
    if (vehicle.reconStatus === 'completed' && (vehicle.merchandisingStatus !== 'approved' || vehicle.publicListing.action)) {
      reasons.push({
        key: 'listing',
        label: vehicle.publicListing.action === 'reapprove' ? t('lotListingNeedsReapproval')
          : vehicle.publicListing.action === 'resubmit' ? t('lotListingNeedsResubmit')
            : listingStatusLabel(vehicle.merchandisingStatus),
      })
    }
    return reasons
  }

  // The queue reads the loaded lot, not the search box: oldest aged units first, then the rest by age.
  const needsYou = vehicles
    .map(vehicle => ({ vehicle, reasons: waitingReasons(vehicle), days: calculateDaysInStock(vehicle) ?? 0 }))
    .filter(entry => entry.reasons.length > 0)
    .sort((a, b) => Number(isAged(b.vehicle)) - Number(isAged(a.vehicle)) || b.days - a.days)

  const thumbFor = (vehicle: Vehicle) => vehicle.images.find(image => image.url)?.url || vehicle.primaryImagePath

  const vehicleName = (vehicle: Vehicle) => (
    <Link href={`${basePath}/platform/vehicles/${vehicle.id}`} className="font-medium text-foreground hover:underline">
      {vehicle.year} {vehicle.make} {vehicle.model}
      {vehicle.trim && <span className="font-normal text-muted-foreground"> {vehicle.trim}</span>}
    </Link>
  )

  const reconCell = (vehicle: Vehicle) => {
    const label = reconLabel(vehicle, locale)
    const tone: DeskTone = vehicle.reconStatus === 'completed' ? 'ok' : label.includes(pt ? 'em andamento' : 'in progress') ? 'info' : hasOpenRecon(vehicle) ? 'warn' : 'idle'
    return <Status tone={tone}>{pt ? label.replace(/^Preparação /, '') : label.replace(/^Recon /, '').replace(/^\w/, c => c.toUpperCase())}</Status>
  }

  const listingCell = (vehicle: Vehicle, stage: string) => {
    const status = vehicle.merchandisingStatus
    const tone: DeskTone = vehicle.publicListing.action ? 'warn' : status === 'approved' ? 'ok' : status === 'submitted' ? 'warn' : status === 'rejected' ? 'bad' : 'idle'
    const word = vehicle.publicListing.action === 'reapprove' ? (pt ? 'Nova aprovação' : 'Re-approve') : vehicle.publicListing.action === 'resubmit' ? (pt ? 'Reenviar' : 'Resubmit')
      : pt ? ({ draft: 'Rascunho', submitted: 'Aguardando aprovação', approved: 'Aprovado', rejected: 'Rejeitado' } as Record<string, string>)[status] || status : (listingLabels[status] || status).replace(/^Listing /, '').replace(/^\w/, c => c.toUpperCase())
    const showLive = stage === 'available' || stage === 'prep'
    return (
      <div className="min-w-0">
        <Status tone={tone}>{word}</Status>
        {showLive && (
          <p className="mt-0.5 max-w-[14rem] truncate text-xs text-muted-foreground" title={vehicle.publicListing.live ? undefined : vehicle.publicListing.reason || undefined}>
            {vehicle.publicListing.live ? t('lotLiveStorefront') : t('lotNotLive').replace('{reason}', vehicle.publicListing.reason || t('lotNotAvailable'))}
          </p>
        )}
      </div>
    )
  }

  const moreMenu = (vehicle: Vehicle, busy: boolean) => {
    const active = isActiveInventory(vehicle)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Pill size="sm" variant="plain" className="w-7 px-0 max-md:size-10" aria-label={t('lotMoreActionsFor').replace('{stock}', vehicle.stockNumber)} disabled={busy}>
            <MoreHorizontal />
          </Pill>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild><Link href={`${basePath}/platform/vehicles/${vehicle.id}`}>{t('lotOpenVehicle')}</Link></DropdownMenuItem>
          {active && <DropdownMenuItem disabled={busy} onClick={() => moveStock(vehicle)}>{t('lotMove')}</DropdownMenuItem>}
          <DropdownMenuItem disabled={busy} onClick={() => addInventoryCost(vehicle)}>{t('lotCost')}</DropdownMenuItem>
          {active ? <>
            <DropdownMenuItem disabled={busy} onClick={() => editMerchandisingDraft(vehicle)}>{t('lotEditListing')}</DropdownMenuItem>
            <DropdownMenuItem disabled={busy} onClick={() => managePhotos(vehicle)}>{t('lotPhotos')}</DropdownMenuItem>
          </> : (
            <DropdownMenuItem disabled>{inactiveReason(vehicle, locale)}</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const header = (
    <DeskHeader
      title={t('inventory')}
      tone={error ? 'bad' : agingCount > 0 ? 'warn' : 'ok'}
      status={error ? t('unavailable') : agingCount === 1 ? t('lotOneAgingUnit') : agingCount > 0 ? t('lotAgingUnits').replace('{count}', String(agingCount)) : t('lotNoAgingUnits')}
      meta={[
        lotTotal !== undefined ? lotTotal === 1 ? t('lotOneUnitCount') : t('lotUnitCount').replace('{count}', String(lotTotal)) : null,
        error ? t('unavailable') : needsYou.length === 1 ? t('lotOneWaitingCount') : needsYou.length ? t('lotWaitingCount').replace('{count}', String(needsYou.length)) : lotTotal !== undefined ? t('lotNothingWaiting') : null,
        intakeRooftopName,
      ].filter(Boolean).join(' · ') || undefined}
      actions={
        <>
          {intakeRooftops.length > 1 && (
            <Select value={intakeRooftopId} onValueChange={setIntakeRooftopId}>
              <SelectTrigger className="text-[13px] h-8 w-full rounded-[4px] sm:w-[180px]" aria-label={t('rooftop')}>
                <SelectValue placeholder={t('rooftop')} />
              </SelectTrigger>
              <SelectContent>
                {intakeRooftops.map(rooftop => (
                  <SelectItem key={rooftop.id} value={rooftop.id}>
                    {rooftop.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Track>
            <Pill variant="plain" onClick={loadVehicles} disabled={loading} aria-label={t('refresh')}>
              <RefreshCw className={loading ? 'animate-spin' : undefined} />
              <span className="max-sm:sr-only">{t('refresh')}</span>
            </Pill>
            <Pill variant="plain" asChild>
              <Link href={`${basePath}/platform/vehicles/acquisitions`}><ClipboardList /><span className="max-sm:sr-only">{t('acquisitions')}</span></Link>
            </Pill>
            <Pill variant="plain" asChild>
              <Link href={`${basePath}/platform/vehicles/feed`}><History /><span className="max-sm:sr-only">{t('lotFeed')}</span></Link>
            </Pill>
            <Pill onClick={recordPublicFeed} disabled={actionId === 'feed'}>
              <Upload />
              {pendingFeedRun ? t('lotRetryListing') : t('lotPublishFeed')}
            </Pill>
            <Pill variant="primary" onClick={intakeVehicle} disabled={actionId === 'intake' || !intakeRooftopId}>
              <Plus /> {t('lotIntakeVehicle')}
            </Pill>
          </Track>
        </>
      }
    />
  )

  const renderDetails = (vehicle: Vehicle) => (
    <div role="region" aria-label={`${t('details')} · ${vehicle.stockNumber}`} className="grid gap-x-8 gap-y-3 lg:grid-cols-2">
      <Facts
        items={[
          { label: t('chassisVin'), value: vehicle.vin, mono: true },
          { label: t('stockCode'), value: vehicle.stockNumber, mono: true },
          { label: t('lotLocation'), value: vehicle.locationLabel || vehicle.locationCode },
          { label: t('lotDaysInStock'), value: daysLabel(vehicle), mono: true },
          { label: t('lotRetailPrice'), value: formatCurrency(vehicle.price), mono: true },
          { label: t('lotCost'), value: vehicle.purchasePrice == null ? t('lotNotRecorded') : formatCurrency(vehicle.purchasePrice), mono: true },
        ]}
      />
      <Facts
        items={[
          { label: t('lotAcquisition'), value: vehicle.acquisition ? acquisitionLabel(vehicle.acquisition.status) : t('lotNone') },
          { label: t('lotRecon'), value: reconLabel(vehicle, locale) },
          { label: t('lotListing'), value: listingStatusLabel(vehicle.merchandisingStatus) },
          { label: t('lotStorefront'), value: vehicle.publicListing.live ? t('lotLiveStorefront') : t('lotNotLive').replace('{reason}', vehicle.publicListing.reason || t('lotNotAvailable')) },
          { label: t('lotFeed'), value: feedStatusLabel(vehicle.feedStatus) },
          { label: t('lotColors'), value: [vehicle.color, vehicle.interiorColor].filter(Boolean).join(' / ') || t('lotNotRecorded') },
          { label: t('lotPhotos'), value: vehicle.images.length || t('lotNone'), mono: vehicle.images.length > 0 },
          { label: t('lotReconItems'), value: vehicle.reconWorkItems.length, mono: true },
        ]}
      />
      <div className="min-w-0 border-t pt-3 text-sm lg:col-span-2">
        <p className={fieldLabelClass}>{t('lotListing')}</p>
        <p className="mt-1 break-words text-muted-foreground">{vehicle.description || t('lotNoDescription')}</p>
      </div>
      <div className="lg:col-span-2">
        <Track>
          <Pill size="sm" className="max-md:h-10" asChild><Link href={`${basePath}/platform/vehicles/${vehicle.id}`}>{t('lotOpenVehicle')}</Link></Pill>
          {isActiveInventory(vehicle) && <Pill size="sm" className="max-md:h-10" onClick={() => managePhotos(vehicle)}>{t('lotPhotos')}</Pill>}
          <Pill size="sm" variant="plain" className="max-md:h-10" onClick={() => setSelectedVehicle(null)}>{t('lotCloseDetails')}</Pill>
        </Track>
      </div>
    </div>
  )

  return (
    <PageContainer title={t('inventory')} header={header} breadcrumbs={breadcrumbs}>
    <div className="min-w-0 max-w-full space-y-6 px-4 pb-24 md:px-6">
      {actionMessage && (
        <Notice tone={actionTone}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span>{actionMessage}</span>
            {pendingMerchandisingAttempt && (
              <Track>
            <Pill size="sm" onClick={retryMerchandisingAttempt} disabled={Boolean(actionId)}>{t('retry')}</Pill>
              </Track>
            )}
          </div>
        </Notice>
      )}
      {pendingReconStart && (
        <Notice tone="warn">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span>{t('lotUnconfirmedReconStart')}</span>
            <Track>
              <Pill size="sm" onClick={retryReconStart} disabled={Boolean(actionId)}>{t('retry')}</Pill>
            </Track>
          </div>
        </Notice>
      )}

      {!loading && !error && (
        <DeskSection title={t('needsYou')} count={needsYou.length} id="inventory-needs-you">
          {needsYou.length === 0 ? (
            <p className="py-3 text-[13px] text-muted-foreground">
              {statusFilter === 'all' ? t('lotNoWaitingWork') : t('lotNothingWaitingIn').replace('{status}', stockStatusLabel(statusFilter))}
            </p>
          ) : (
            <DeskTable aria-label={t('lotUnitsWaitingOnYou')}>
              <thead>
                <tr>
                  <Th>{t('vehicle')}</Th>
                  <Th priority={2}>{t('lotWaitingOn')}</Th>
                  <Th align="right" priority={2}>{t('lotDays')}</Th>
                  <Th align="right"><span className="sr-only">{t('nextStep')}</span></Th>
                </tr>
              </thead>
              <tbody>
                {needsYou.map(({ vehicle, reasons }) => {
                  const next = buildActions(vehicle)[0]
                  const busy = actionId === vehicle.inventoryStockId
                  const reasonList = (
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      {reasons.map(reason => reason.aged
                        ? <Attention key={reason.key}>{reason.label}</Attention>
                        : <span key={reason.key} className="text-[13px] text-foreground">{reason.label}</span>)}
                    </span>
                  )
                  return (
                    <Tr key={vehicle.id}>
                      <Td className="min-w-0">
                        <div className="min-w-0">{vehicleName(vehicle)}</div>
                        <div className="mt-0.5"><Code>{vehicle.stockNumber}</Code></div>
                        <div className="mt-1 md:hidden">{reasonList}</div>
                      </Td>
                      <Td priority={2}>{reasonList}</Td>
                      <Td align="right" priority={2}>
                        <Figure size="sm" attention={isAged(vehicle)}>{daysLabel(vehicle)}</Figure>
                      </Td>
                      <Td align="right" className="whitespace-nowrap">
                        {next ? (
                          <Pill size="sm" className="max-md:h-10" disabled={busy || next.disabled} onClick={next.onClick}>{next.label}</Pill>
                        ) : (
                          <Pill size="sm" variant="plain" className="max-md:h-10" asChild><Link href={`${basePath}/platform/vehicles/${vehicle.id}`}>{t('lotOpenVehicle')}</Link></Pill>
                        )}
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>
      )}

      <DeskSection title={statusFilter === 'all' ? t('lot') : stockStatusLabel(statusFilter)} count={loading || error ? undefined : filteredVehicles.length} id="inventory-lot">
        <div className="mb-3 flex min-w-0 flex-col gap-3">
          <Segmented label={t('filterByStatus')} value={statusFilter} onChange={setStatusFilter} options={statusOptions} className="self-stretch" />
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('lotStockVinMakeModel')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-[4px] pl-9 text-[13px] max-md:h-10"
                aria-label={t('searchInventory')}
              />
            </div>
            <Select value={sortOrder} onValueChange={setSortOrder}>
              <SelectTrigger className="text-[13px] w-full rounded-[4px] max-md:h-10 sm:w-[180px]" aria-label={t('lotSort')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="age-desc">{t('lotOldestFirst')}</SelectItem>
                <SelectItem value="age-asc">{t('lotNewestFirst')}</SelectItem>
                <SelectItem value="price-desc">{t('lotPriceHighLow')}</SelectItem>
                <SelectItem value="price-asc">{t('lotPriceLowHigh')}</SelectItem>
                <SelectItem value="stock">{t('lotStockSort')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12" role="status">
            <RefreshCw className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">{t('lotLoading')}</span>
          </div>
        ) : error ? (
          <Notice tone="bad">
            <p className="font-medium">{t('lotUnableLoad')}</p>
            <p className="mt-0.5 text-muted-foreground">{error}</p>
            <Track className="mt-2">
              <Pill size="sm" onClick={loadVehicles}>{t('retry')}</Pill>
            </Track>
          </Notice>
        ) : filteredVehicles.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">{isFiltered ? t('lotNoMatches') : t('lotNoVehicles')}</p>
            {isFiltered && (
              <Track>
                <Pill size="sm" onClick={resetFilters}>{t('resetFilters')}</Pill>
              </Track>
            )}
          </div>
        ) : (
          <DeskTable aria-label={t('inventory')}>
            <thead>
              <tr>
                <Th priority={2} className="w-14"><span className="sr-only">{t('lotPhotos')}</span></Th>
                <Th>{t('vehicle')}</Th>
                <Th priority={2}>{t('stockCode')}</Th>
                <Th priority={2}>{t('status')}</Th>
                <Th priority={3}>{t('lotRecon')}</Th>
                <Th priority={3}>{t('lotListing')}</Th>
                <Th align="right">{t('lotDays')}</Th>
                <Th align="right">{t('price')}</Th>
                <Th align="right" priority={2}><span className="sr-only">{t('actions')}</span></Th>
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.map((vehicle) => {
                const busy = actionId === vehicle.inventoryStockId
                const stage = lotStage(vehicle)
                const isOpen = selectedVehicle?.id === vehicle.id
                const thumb = thumbFor(vehicle)
                const actions = buildActions(vehicle)
                const subline = [
                  vehicle.color,
                  conditionLabel(vehicle.condition),
                  `${(pt ? Math.round(vehicle.mileage * 1.609344) : vehicle.mileage).toLocaleString(locale)} ${pt ? 'km' : 'mi'}`,
                  vehicle.locationLabel || vehicle.locationCode,
                ].filter(Boolean)
                const rowButtons = (
                  <div className="flex items-center justify-end gap-1">
                    {actions.map(action => (
                      <Pill key={action.key} size="sm" className="max-md:h-10" disabled={busy || action.disabled} onClick={action.onClick}>
                        {action.label}
                      </Pill>
                    ))}
                    <Pill size="sm" variant="plain" className="max-md:h-10" aria-expanded={isOpen} onClick={() => setSelectedVehicle(current => current?.id === vehicle.id ? null : vehicle)}>
                      {t('details')}
                    </Pill>
                    {moreMenu(vehicle, busy)}
                  </div>
                )
                return [
                  <Tr key={vehicle.id} className={isOpen ? 'border-b-0 bg-muted/30' : undefined}>
                    <Td priority={2} className="w-14 py-2">
                      <div className="relative h-9 w-12 overflow-hidden rounded-[4px] bg-muted">
                        {thumb
                          ? <Image src={thumb} alt="" fill unoptimized sizes="48px" className="object-cover" />
                          : null}
                        {thumb && isRepresentativePhoto(thumb, vehicle) && (
                          <span title={t('lotSimilarPhoto')} className="absolute inset-x-0 bottom-0 bg-zinc-950/75 text-center text-[9px] font-medium leading-3 text-white">{pt ? 'Semelhante' : 'Similar'}</span>
                        )}
                        {thumb
                          ? null
                          : <span className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">{t('lotNoPhoto')}</span>}
                      </div>
                    </Td>
                    <Td className="min-w-0 max-w-[22rem] max-md:max-w-[13rem]">
                      <div className="min-w-0 break-words">{vehicleName(vehicle)}</div>
                      <p className="mt-0.5 text-xs text-muted-foreground max-md:line-clamp-2 md:truncate">{subline.join(' · ')}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 md:hidden">
                        <Code>{vehicle.stockNumber}</Code>
                        <Status tone={statusTones[stage] || 'idle'}>{stockStatusLabel(stage)}</Status>
                      </div>
                      <div className="mt-2 md:hidden [&>div]:justify-start [&>div]:flex-wrap">{rowButtons}</div>
                    </Td>
                    <Td priority={2}><Code className="text-foreground">{vehicle.stockNumber}</Code></Td>
                    <Td priority={2}><Status tone={statusTones[stage] || 'idle'}>{stockStatusLabel(stage)}</Status></Td>
                    <Td priority={3}>{reconCell(vehicle)}</Td>
                    <Td priority={3}>{listingCell(vehicle, stage)}</Td>
                    <Td align="right" className="align-top md:align-middle">
                      <span className="sr-only">{t('lotDaysInStock')} </span>
                      <Figure size="sm" attention={isAged(vehicle)}>{daysLabel(vehicle)}</Figure>
                    </Td>
                    <Td align="right" className="align-top md:align-middle">
                      <span className="sr-only">{t('price')} </span>
                      <Figure size="sm">{formatCurrency(vehicle.price)}</Figure>
                    </Td>
                    <Td align="right" priority={2} className="whitespace-nowrap">{rowButtons}</Td>
                  </Tr>,
                  isOpen ? (
                    <tr key={`${vehicle.id}-details`} className="border-b bg-muted/30">
                      <td colSpan={9} className="px-4 pb-4 pt-1">{renderDetails(vehicle)}</td>
                    </tr>
                  ) : null,
                ]
              })}
            </tbody>
          </DeskTable>
        )}
      </DeskSection>

      {!loading && !error && (
        <ReadoutStrip>
          <Readout label={t('lotUnits')} value={filteredVehicles.length} />
          <Readout label={t('lotRetailValue')} value={formatCurrency(totalValue)} sub={t('lotAvailableUnits')} />
          <Readout label={t('lotAverageDays')} value={avgDaysInStock} sub={t('lotAvailableUnits')} />
          <Readout label={t('lotAging60')} value={agingCount} tone={agingCount > 0 ? 'warn' : undefined} />
          <Readout label={t('lotReconOpen')} value={reconOpenCount} tone={reconOpenCount > 0 ? 'info' : undefined} />
        </ReadoutStrip>
      )}

      <Dialog open={Boolean(task)} onOpenChange={open => { if (!open && !actionId && !task?.reconCompletionAttempt) closeTask() }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{taskTitle}</DialogTitle>
            <DialogDescription className="text-[13px]">
              {task?.vehicle
                ? `${task.vehicle.stockNumber} · ${task.vehicle.year} ${task.vehicle.make} ${task.vehicle.model}${task.reconWorkItem ? ` · ${task.reconWorkItem.title}` : ''}`
                : intakeRooftopName || t('lotNewUnit')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitInventoryTask} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {task?.type === 'intake' && <>
                {taskInput('vin', t('lotChassis'), { required: true, maxLength: 17 })}
                {taskInput('stockNumber', t('stockCode'))}
                {taskInput('year', t('lotModelYear'), { type: 'number', min: 1886, step: 1 })}
                <label htmlFor="inventory-task-condition" className="grid gap-1.5 text-sm">
                  <span className={fieldLabelClass}>{t('lotCondition')}</span>
                  <Select value={task.fields.condition || 'used'} onValueChange={value => updateTaskField('condition', value)}>
                    <SelectTrigger id="inventory-task-condition">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONDITIONS.map(condition => (
                        <SelectItem key={condition} value={condition}>{conditionLabel(condition)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                {makes.length > 0 ? (
                  <label htmlFor="inventory-task-makeChoice" className="grid gap-1.5 text-sm">
                    <span className={fieldLabelClass}>{t('lotMake')}</span>
                    <Select value={intakeMakeChoice} onValueChange={value => { updateTaskField('makeChoice', value); updateTaskField('model', '') }}>
                      <SelectTrigger id="inventory-task-makeChoice">
                        <SelectValue placeholder={t('lotChooseMake')} />
                      </SelectTrigger>
                      <SelectContent>
                        {makes.map(make => (
                          <SelectItem key={make.id} value={make.name}>{make.name}</SelectItem>
                        ))}
                        <SelectItem value={OTHER_MAKE}>{t('lotOther')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                ) : taskInput('make', t('lotMake'), { maxLength: 100 })}
                {makes.length > 0 && intakeMakeChoice === OTHER_MAKE && taskInput('make', t('lotOtherMake'), { maxLength: 100 })}
                {taskInput('model', t('lotModel'), { maxLength: 100, list: intakeModels.length ? 'inventory-task-model-options' : undefined })}
                {intakeModels.length > 0 && (
                  <datalist id="inventory-task-model-options">
                    {intakeModels.map(model => <option key={model.id} value={model.name} />)}
                  </datalist>
                )}
                {taskInput('trim', t('lotTrimOptional'), { required: false, maxLength: 100 })}
                {taskInput('exteriorColor', t('lotExteriorColorOptional'), { required: false, maxLength: 100 })}
                {taskInput('interiorColor', t('lotInteriorColorOptional'), { required: false, maxLength: 100 })}
                {taskInput('mileage', t('lotMileage'), { type: 'number', min: 0, step: 1 })}
                {taskInput('purchaseDollars', taskCurrencyLabel(t('lotPurchaseCost')), { inputMode: 'decimal' })}
                {taskInput('retailDollars', taskCurrencyLabel(t('lotRetailPrice')), { inputMode: 'decimal' })}
                {taskInput('locationCode', t('lotLocation'))}
                {taskSelect('acquisitionSource', t('lotAcquiredFrom'), ACQUISITION_SOURCES.map(value => ({ value, label: sourceLabel(value) })))}
                {taskInput('sourceReference', t('lotSourceReferenceOptional'), { required: false, maxLength: 200 })}
              </>}
              {task?.type === 'edit' && <>
                {taskInput('retailDollars', taskCurrencyLabel(t('lotRetailPrice')), { inputMode: 'decimal' })}
                {taskInput('mileage', t('lotMileage'), { type: 'number', min: 0, step: 1 })}
              </>}
              {task?.type === 'move' && taskInput('locationCode', t('lotNewLocation'))}
              {task?.type === 'cost' && <>
                {taskSelect('costType', t('lotCostType'), COST_TYPES.map(value => ({ value, label: pt ? ({ reconditioning: 'Preparação', transport: 'Transporte', 'auction-fee': 'Taxa de leilão', detail: 'Estética', other: 'Outro' } as Record<string, string>)[value] : costTypeLabels[value] })))}
                {taskInput('dollars', taskCurrencyLabel(t('lotCostAmount')), { inputMode: 'decimal' })}
                {taskInput('reference', t('lotInvoiceRef'), { required: false })}
              </>}
              {task?.type === 'recon-open' && <>
                {taskInput('title', t('lotWorkItem'))}
                {taskSelect('category', t('lotCategory'), RECON_CATEGORIES.map(value => ({ value, label: pt ? ({ mechanical: 'Mecânica', body: 'Funilaria', detail: 'Estética', tires: 'Pneus', inspection: 'Inspeção', other: 'Outro' } as Record<string, string>)[value] : reconCategoryLabels[value] })))}
                {taskInput('estimatedDollars', taskCurrencyLabel(t('lotEstimatedCost')), { inputMode: 'decimal' })}
              </>}
              {task?.type === 'recon-complete' && taskInput('actualDollars', taskCurrencyLabel(t('lotActualCost')), { inputMode: 'decimal', disabled: Boolean(task.reconCompletionAttempt) })}
              {task?.type === 'intake' && (
                <label htmlFor="inventory-task-features" className="grid gap-1.5 text-sm sm:col-span-2">
                  <span className={fieldLabelClass}>{t('lotFeatures')}</span>
                  <Textarea id="inventory-task-features" value={task.fields.features || ''} onChange={event => updateTaskField('features', event.target.value)} rows={3} />
                </label>
              )}
              {(task?.type === 'intake' || task?.type === 'edit') && (
                <label htmlFor="inventory-task-description" className="grid gap-1.5 text-sm sm:col-span-2">
                  <span className={fieldLabelClass}>{task.type === 'edit' ? t('lotDescription') : t('lotDescriptionPublish')}</span>
                  <Textarea id="inventory-task-description" required={task.type === 'edit'} value={task.fields.description || ''} onChange={event => updateTaskField('description', event.target.value)} rows={3} />
                </label>
              )}
              {task?.type === 'intake' && (
                <VehiclePhotoEditor
                  label={t('lotPhotosPublish')}
                  tiles={intakePhotos}
                  busy={Boolean(actionId)}
                  status={intakePhotoStatus}
                  onAddFiles={stageIntakeFiles}
                  onAddUrl={stageIntakeUrl}
                  onMove={moveIntakePhoto}
                  onRemove={removeIntakePhoto}
                />
              )}
              {(task?.type === 'edit' || task?.type === 'photos') && currentTaskVehicle && (
                <LiveVehiclePhotos
                  stockId={currentTaskVehicle.inventoryStockId}
                  images={currentTaskVehicle.images}
                  label={task.type === 'edit' ? t('lotPhotosAutosave') : t('lotPhotosPrimary')}
                  onChanged={loadVehicles}
                />
              )}
            </div>
            {taskError && <Notice tone="bad">{taskError}</Notice>}
            <DialogFooter className="sm:justify-end">
              <Track>
                {task?.type === 'photos' ? (
                  <Pill type="submit" variant="primary" className="max-sm:h-11">{t('lotDone')}</Pill>
                ) : <>
                  <Pill variant="plain" className="max-sm:h-11" disabled={Boolean(actionId) || Boolean(task?.reconCompletionAttempt)} onClick={closeTask}>{t('cancel')}</Pill>
                  <Pill type="submit" variant="primary" className="max-sm:h-11" disabled={Boolean(actionId)}>{actionId ? t('saving') : task?.reconCompletionAttempt ? t('retry') : t('save')}</Pill>
                </>}
              </Track>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    </PageContainer>
  )
}
