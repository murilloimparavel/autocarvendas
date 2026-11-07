'use client'

import { Fragment, useMemo, useState, type FormEvent } from 'react'
import { useLocale } from '@/features/i18n/LocaleProvider'
import Link from 'next/link'
import { CalendarClock, Check, ChevronRight, Pencil, Plus, RefreshCw, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import {
  Attention,
  Code,
  DeskHeader,
  DeskSection,
  DeskTable,
  Figure,
  Meter,
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
import { readDeskFinanceEvidence, type DeskFinanceEvidence } from '@/features/platform/finance/lib/financeEvidence'
import { FinanceEvidenceHistory } from '@/features/platform/deals/components/FinanceEvidenceHistory'
import { buildDeliveryChecklistEntry, buildDeliveryWaiverEntry, DELIVERY_CHECKLIST_ITEMS, DELIVERY_FUNDING_ITEM } from '../lib/checklistEvidence'
import { MoneyInput } from '@/features/platform/deals/components/MoneyInput'
import { formatUsd } from '@/features/platform/deals/lib/formatMoney'
import { fromZonedInput, zonedInputValue } from '../lib/zonedTime'
import {
  type DeliveryCase,
  type DeliveryRecord,
  type DeliveryWorkspace,
  type WeOwe,
  completeDealDelivery,
  getDeliveryStaff,
  getDeliveryWorkspace,
  manageDeliveryCase,
  manageWeOweItem,
} from '../actions'

type Delivery = Omit<DeliveryRecord, 'financeEvidence'> & { financeEvidence: DeskFinanceEvidence | null }
type DeliveryTaskKind = 'schedule' | 'checklist' | 'waive' | 'acknowledge' | 'cancel' | 'we-owe' | 'edit-we-owe' | 'close-we-owe' | 'complete'
type DeliveryTask = {
  idempotencyKey: string
  deliveryCaseUpdatedAt: string | null
  kind: DeliveryTaskKind
  delivery: Delivery
  item?: WeOwe
  action?: 'fulfill' | 'waive'
  fields: Record<string, string>
}
type CommandResult = { success: boolean; error?: string }

function readDeliveries(workspace: DeliveryWorkspace | null): Delivery[] {
  return (workspace?.deliveries || []).map(delivery => ({ ...delivery, financeEvidence: readDeskFinanceEvidence(delivery.financeEvidence) }))
}

const caseTone: Record<string, DeskTone> = {
  scheduled: 'info',
  arrived: 'info',
  ready: 'ok',
  delivered: 'ok',
  cancelled: 'bad',
}

const fieldLabel = 'text-[12px] font-medium text-muted-foreground'
const controlClass = 'h-10 rounded-[4px] text-[13px] shadow-none'

function deliveryTone(delivery: Delivery, deliveryCase: DeliveryCase | undefined): DeskTone {
  if (delivery.status === 'delivered') return 'ok'
  if (!deliveryCase) return delivery.status === 'financed' ? 'warn' : 'idle'
  return caseTone[deliveryCase.status] ?? 'idle'
}

function deliveryStatusLabel(delivery: Delivery, deliveryCase: DeliveryCase | undefined) {
  const status = deliveryCase?.status || delivery.status
  return !deliveryCase && delivery.status === 'financed' ? 'Not scheduled' : status.charAt(0).toUpperCase() + status.slice(1)
}

function deliveryLabel(locale: 'pt-BR' | 'en-US', value: string) {
  if (locale === 'en-US') return value
  const labels: Record<string, string> = {
    'Not scheduled': 'Não agendado', Scheduled: 'Agendado', Arrived: 'Cliente chegou', Ready: 'Pronto para entrega',
    Delivered: 'Entregue', Cancelled: 'Cancelado', Identity: 'Identificação', Insurance: 'Seguro',
    Registration: 'Documentação do veículo', 'Title handoff': 'Entrega dos documentos', Funding: 'Financiamento',
    Payment: 'Pagamento', Complete: 'Concluído', Missing: 'Pendente', Recorded: 'Registrado',
    'Reference recorded': 'Referência registrada', 'Customer acknowledgment': 'Confirmação do cliente',
    Received: 'Recebido', Funded: 'Financiado', 'Recorded for an earlier worksheet': 'Registrado em uma versão anterior da proposta',
    'Waiting on payment': 'Aguardando pagamento', 'Waiting on funding': 'Aguardando liberação do financiamento',
    complete: 'Concluído', waived: 'Dispensado', missing: 'Pendente',
  }
  return labels[value] || value
}

function customerName(delivery: Delivery) {
  return [delivery.lead?.firstName, delivery.lead?.lastName].filter(Boolean).join(' ') || 'Customer not linked'
}

function vehicleName(delivery: Delivery) {
  return delivery.vehicle ? `${delivery.vehicle.year} ${delivery.vehicle.make} ${delivery.vehicle.model}` : 'Vehicle unavailable'
}

// Dealership time zone, so the server render and the browser agree.
function formatDate(value: string | null | undefined, timeZone: string, locale: 'pt-BR' | 'en-US') {
  return value
    ? new Date(value).toLocaleString(locale, { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Not scheduled'
}

/** Staff-recorded checklist items that are complete or waived. */
function recordedChecklist(deliveryCase: DeliveryCase | undefined) {
  return DELIVERY_CHECKLIST_ITEMS.filter(({ code }) => deliveryCase?.checklist?.some(item => item.code === code && ['complete', 'waived'].includes(item.status)))
}

/** Funding comes from the funding case; a delivered case keeps the funding entry it was delivered with. */
function fundingItem(delivery: Delivery, deliveryCase: DeliveryCase | undefined, locale: 'pt-BR' | 'en-US') {
  const finance = delivery.financeEvidence
  const cash = finance?.structureType === 'cash'
  const label = deliveryLabel(locale, cash ? 'Payment' : DELIVERY_FUNDING_ITEM.label)
  const recorded = deliveryCase?.checklist?.find(item => item.code === DELIVERY_FUNDING_ITEM.code)
  if (finance?.fundingCurrent) return { label, done: true, text: `${deliveryLabel(locale, cash ? 'Received' : 'Funded')}${finance.fundingReference ? ` · ${finance.fundingReference}` : ''}` }
  if (delivery.status === 'delivered' && recorded) return { label, done: true, text: `${deliveryLabel(locale, 'Complete')}${recorded.evidenceReference ? ` · ${recorded.evidenceReference}` : ''}` }
  return { label, done: false, text: deliveryLabel(locale, finance?.fundingStatus === 'funded' ? 'Recorded for an earlier worksheet' : cash ? 'Waiting on payment' : 'Waiting on funding') }
}

export function DeliveryDeskPageClient({
  initialWorkspace,
  initialError,
  timeZone,
  currencyCode,
}: {
  initialWorkspace: DeliveryWorkspace | null
  initialError: string | null
  timeZone: string
  currencyCode: string
}) {
  const { locale } = useLocale()
  const [deliveries, setDeliveries] = useState<Delivery[]>(() => readDeliveries(initialWorkspace))
  const [cases, setCases] = useState<DeliveryCase[]>(initialWorkspace?.cases || [])
  const [rooftopByDeal, setRooftopByDeal] = useState<Record<string, string>>(initialWorkspace?.rooftopByDeal || {})
  const [staffByRooftop, setStaffByRooftop] = useState<Record<string, Array<{ id: string; name: string }>>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // One clock reading per load decides what is today and what is overdue.
  const [now] = useState(() => Date.now())
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('active')
  const [sort, setSort] = useState('appointment')
  const [task, setTask] = useState<DeliveryTask | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    const response = await getDeliveryWorkspace()
    if (response.success && response.data) {
      setDeliveries(readDeliveries(response.data.deliveryWorkspace))
      setCases(response.data.deliveryWorkspace.cases || [])
      setRooftopByDeal(response.data.deliveryWorkspace.rooftopByDeal || {})
    } else {
      setError(response.error || 'Unable to load deliveries.')
    }
    setLoading(false)
  }

  const caseFor = (dealId: string) => cases.find(item => item.deal?.id === dealId)

  const loadStaff = async (delivery: Delivery) => {
    const rooftopId = rooftopByDeal[delivery.id]
    if (!rooftopId || staffByRooftop[rooftopId]) return
    const response = await getDeliveryStaff(rooftopId)
    if (response.success) setStaffByRooftop(current => ({ ...current, [rooftopId]: response.data.users || [] }))
    else setTaskError(response.error || 'Unable to load staff.')
  }

  const staffFor = (delivery: Delivery) => {
    const staff = staffByRooftop[rooftopByDeal[delivery.id] || ''] || []
    // The salesperson is always offered, even before the rooftop staff list loads.
    return delivery.salesperson && !staff.some(user => user.id === delivery.salesperson?.id) ? [delivery.salesperson, ...staff] : staff
  }

  const openTask = (kind: DeliveryTaskKind, delivery: Delivery, item?: WeOwe, action?: 'fulfill' | 'waive') => {
    setTaskError(null)
    setNotice(null)
    if (kind === 'we-owe' || kind === 'edit-we-owe') void loadStaff(delivery)
    const existingCase = caseFor(delivery.id)
    setTask({
      kind,
      delivery,
      item,
      action,
      idempotencyKey: `delivery-task:${crypto.randomUUID()}`,
      deliveryCaseUpdatedAt: caseFor(delivery.id)?.updatedAt ?? null,
      fields:
        kind === 'schedule'
          ? { appointmentAt: zonedInputValue(existingCase?.appointmentAt && new Date(existingCase.appointmentAt).getTime() > Date.now() ? new Date(existingCase.appointmentAt) : new Date(Date.now() + 86_400_000), timeZone) }
          : kind === 'we-owe'
            ? { description: '', promisedAt: zonedInputValue(new Date(Date.now() + 7 * 86_400_000), timeZone), ownerId: delivery.salesperson?.id || '', estimatedCostCents: '0' }
            : kind === 'edit-we-owe'
              ? { ownerId: item?.owner?.id || '', estimatedCostCents: String(item?.estimatedCostCents ?? 0), promisedAt: item?.promisedAt ? zonedInputValue(new Date(item.promisedAt), timeZone) : '' }
            : kind === 'cancel'
              ? { reason: '' }
            : kind === 'waive'
              ? { code: (DELIVERY_CHECKLIST_ITEMS.find(entry => !recordedChecklist(existingCase).includes(entry)) ?? DELIVERY_CHECKLIST_ITEMS[0]).code, reason: '' }
            : kind === 'checklist'
              ? { code: (DELIVERY_CHECKLIST_ITEMS.find(item => !recordedChecklist(caseFor(delivery.id)).includes(item)) ?? DELIVERY_CHECKLIST_ITEMS[0]).code, reference: '' }
              : kind === 'acknowledge'
                ? { acknowledgment: '' }
                : kind === 'close-we-owe'
                  ? { fulfillmentEvidence: '', customerAcknowledgment: '' }
                  : { confirmed: '' },
    })
  }

  const manageCase = async (delivery: Delivery, action: 'schedule' | 'arrive' | 'record-checklist' | 'acknowledge') => {
    if (action === 'schedule') return openTask('schedule', delivery)
    if (action === 'record-checklist') return openTask('checklist', delivery)
    if (action === 'acknowledge') return openTask('acknowledge', delivery)
    setActiveId(delivery.id)
    const response = await manageDeliveryCase({
      dealId: delivery.id,
      action,
      idempotencyKey: `delivery-case:${delivery.id}:${action}:${crypto.randomUUID()}`,
    })
    setNotice(response.success ? 'Arrival recorded.' : `Unable to update delivery: ${response.error}`)
    await load()
    setActiveId(null)
  }

  const addWeOwe = (delivery: Delivery) => openTask('we-owe', delivery)
  const closeWeOwe = (delivery: Delivery, item: WeOwe, action: 'fulfill' | 'waive') => openTask('close-we-owe', delivery, item, action)
  const complete = (delivery: Delivery) => openTask('complete', delivery)

  const updateTaskField = (name: string, value: string) =>
    setTask(current => (current ? { ...current, fields: { ...current.fields, [name]: value } } : current))

  const submitTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!task) return
    const field = (name: string) => task.fields[name]?.trim() || ''
    let response: CommandResult | undefined
    const { delivery, kind, item } = task
    setTaskError(null)
    setActiveId(delivery.id)
    try {
      if (kind === 'complete') {
        if (field('confirmed') !== 'yes') throw new Error('Confirm the vehicle is ready for delivery.')
        const fundingUpdatedAt = delivery.financeEvidence?.fundingUpdatedAt
        if (!delivery.financeEvidence?.fundingCurrent || !fundingUpdatedAt || !task.deliveryCaseUpdatedAt) {
          throw new Error(delivery.financeEvidence?.structureType === 'cash' ? 'Record payment on the finance desk first.' : 'Record funding on the finance desk first.')
        }
        response = await completeDealDelivery({
          dealId: delivery.id,
          expectedUpdatedAt: delivery.updatedAt,
          expectedFundingUpdatedAt: fundingUpdatedAt,
          expectedDeliveryCaseUpdatedAt: task.deliveryCaseUpdatedAt,
          idempotencyKey: task.idempotencyKey,
        })
      } else if (kind === 'schedule') {
        const appointmentAt = fromZonedInput(field('appointmentAt'), timeZone)
        if (!appointmentAt) throw new Error('Choose a valid delivery appointment time.')
        response = await manageDeliveryCase({
          dealId: delivery.id,
          action: 'schedule',
          appointmentAt: appointmentAt.toISOString(),
          idempotencyKey: task.idempotencyKey,
        })
      } else if (kind === 'checklist') {
        const reference = field('reference')
        if (!reference) throw new Error('A reference is required.')
        const checklist = [buildDeliveryChecklistEntry(field('code'), reference)]
        response = await manageDeliveryCase({
          dealId: delivery.id,
          action: 'record-checklist',
          checklist,
          idempotencyKey: task.idempotencyKey,
        })
      } else if (kind === 'acknowledge') {
        const customerAcknowledgment = field('acknowledgment')
        if (!customerAcknowledgment) throw new Error('Customer acknowledgment reference is required.')
        response = await manageDeliveryCase({
          dealId: delivery.id,
          action: 'acknowledge',
          customerAcknowledgment,
          idempotencyKey: task.idempotencyKey,
        })
      } else if (kind === 'cancel') {
        const reason = field('reason')
        if (!reason) throw new Error('A cancellation reason is required.')
        response = await manageDeliveryCase({ dealId: delivery.id, action: 'cancel', reason, idempotencyKey: task.idempotencyKey })
      } else if (kind === 'waive') {
        const checklist = [buildDeliveryWaiverEntry(field('code'), field('reason'))]
        response = await manageDeliveryCase({ dealId: delivery.id, action: 'record-checklist', checklist, idempotencyKey: task.idempotencyKey })
      } else if (kind === 'we-owe') {
        const description = field('description')
        const promisedAt = fromZonedInput(field('promisedAt'), timeZone)
        const ownerId = field('ownerId')
        if (!description) throw new Error('Description is required.')
        if (!promisedAt) throw new Error('Choose a valid promised date.')
        if (!ownerId) throw new Error('Select an owner.')
        response = await manageWeOweItem({
          dealId: delivery.id,
          action: 'create',
          description,
          promisedAt: promisedAt.toISOString(),
          ownerId,
          estimatedCostCents: Number(field('estimatedCostCents')) || 0,
          idempotencyKey: task.idempotencyKey,
        })
      } else if (kind === 'edit-we-owe' && item) {
        const promisedAt = fromZonedInput(field('promisedAt'), timeZone)
        if (!field('ownerId')) throw new Error('Select an owner.')
        if (!promisedAt) throw new Error('Choose a valid promised date.')
        response = await manageWeOweItem({
          dealId: delivery.id,
          itemId: item.id,
          action: 'update',
          ownerId: field('ownerId'),
          estimatedCostCents: Number(field('estimatedCostCents')) || 0,
          promisedAt: promisedAt.toISOString(),
          idempotencyKey: task.idempotencyKey,
        })
      } else if (kind === 'close-we-owe' && item) {
        const fulfillmentEvidence = field('fulfillmentEvidence')
        const customerAcknowledgment = field('customerAcknowledgment')
        if (!fulfillmentEvidence || !customerAcknowledgment) {
          throw new Error(`${task.action === 'waive' ? 'Waiver' : 'Fulfillment'} and customer acknowledgment references are required.`)
        }
        response = await manageWeOweItem({
          dealId: delivery.id,
          itemId: item.id,
          action: task.action || 'fulfill',
          fulfillmentEvidence,
          customerAcknowledgment,
          idempotencyKey: task.idempotencyKey,
        })
      }
      if (!response?.success) {
        setTaskError(response?.error || 'Unable to save. Your entries are kept; try again.')
        return
      }
      setTask(null)
      setNotice(kind === 'complete' ? 'Delivery completed.' : kind === 'cancel' ? 'Delivery cancelled.' : kind === 'schedule' && caseFor(delivery.id) ? 'Delivery rescheduled.' : 'Delivery updated.')
      await load()
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : 'Unable to update delivery.')
    } finally {
      setActiveId(null)
    }
  }

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    const caseByDeal = (dealId: string) => cases.find(item => item.deal?.id === dealId)
    const rows = deliveries.filter(delivery => {
      const deliveryCase = caseByDeal(delivery.id)
      if (filter === 'active' && delivery.status === 'delivered') return false
      if (filter === 'ready' && deliveryCase?.status !== 'ready') return false
      if (filter === 'we-owe' && !deliveryCase?.weOweItems.some(item => item.status === 'open')) return false
      if (filter === 'delivered' && delivery.status !== 'delivered') return false
      return (
        !term ||
        `${vehicleName(delivery)} ${delivery.vehicle?.stockNumber || ''} ${delivery.vehicle?.vin || ''} ${customerName(delivery)}`.toLowerCase().includes(term)
      )
    })
    return rows.sort((a, b) =>
      sort === 'updated'
        ? new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        : new Date(caseByDeal(a.id)?.appointmentAt || '9999-12-31').getTime() -
          new Date(caseByDeal(b.id)?.appointmentAt || '9999-12-31').getTime()
    )
  }, [deliveries, cases, filter, search, sort])

  const openPromises = cases.flatMap(item => item.weOweItems || []).filter(item => item.status === 'open')
  const ready = deliveries.filter(delivery => caseFor(delivery.id)?.status === 'ready')
  const scheduled = cases.filter(item => item.status === 'scheduled')
  const completed = deliveries.filter(delivery => delivery.status === 'delivered')

  const isFiltered = Boolean(search.trim()) || filter !== 'all'
  const resetFilters = () => {
    setSearch('')
    setFilter('all')
  }

  const taskTitle =
    task?.kind === 'schedule'
      ? caseFor(task.delivery.id) ? 'Reschedule delivery' : 'Schedule delivery'
      : task?.kind === 'cancel'
        ? 'Cancel delivery'
      : task?.kind === 'waive'
        ? 'Waive checklist item'
      : task?.kind === 'edit-we-owe'
        ? 'Edit we-owe'
      : task?.kind === 'checklist'
        ? 'Record checklist item'
        : task?.kind === 'acknowledge'
          ? 'Record customer acknowledgment'
          : task?.kind === 'we-owe'
            ? 'Add we-owe'
            : task?.kind === 'close-we-owe'
              ? `${task.action === 'waive' ? 'Waive' : 'Fulfill'} we-owe`
              : 'Complete delivery'

  const taskDescription =
    task?.kind === 'close-we-owe' || task?.kind === 'edit-we-owe'
      ? task.item?.description || 'We-owe item'
      : task?.kind === 'schedule'
          ? `Dealership time (${timeZone.replace(/_/g, ' ')}).`
          : task
            ? vehicleName(task.delivery)
            : ''

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Delivery' },
  ]

  /** Where one delivery stands: checklist progress, funding and the next step the server accepts. */
  const stateFor = (delivery: Delivery) => {
    const deliveryCase = caseFor(delivery.id)
    const recorded = recordedChecklist(deliveryCase)
    const funding = fundingItem(delivery, deliveryCase, locale)
    const totalChecks = DELIVERY_CHECKLIST_ITEMS.length + 1
    const completedChecks = recorded.length + (funding.done ? 1 : 0)
    const openWeOwe = deliveryCase?.weOweItems.filter(item => item.status === 'open') || []
    const finance = delivery.financeEvidence
    const busy = activeId === delivery.id
    const allChecked = completedChecks === totalChecks
    const missingItem = DELIVERY_CHECKLIST_ITEMS.find(item => !recorded.includes(item))
    // One step at a time, in the order the server accepts them.
    const cancelled = deliveryCase?.status === 'cancelled'
    const activeCase = deliveryCase && !cancelled ? deliveryCase : undefined
    const next = !deliveryCase || cancelled ? 'schedule'
      : deliveryCase.status === 'ready' ? 'complete'
        : deliveryCase.status === 'scheduled' ? 'arrive'
          : missingItem ? 'checklist'
            : funding.done ? 'acknowledge' : null
    const acknowledgeBlocked = missingItem ? `Record ${missingItem.label.toLowerCase()} first` : !funding.done ? (finance?.structureType === 'cash' ? 'Record payment on the finance desk first' : 'Record funding on the finance desk first') : null
    const missing = [
      ...DELIVERY_CHECKLIST_ITEMS.filter(item => !recorded.includes(item)).map(item => item.label),
      ...(funding.done ? [] : [funding.label]),
      ...(deliveryCase?.customerAcknowledgment ? [] : ['Acknowledgment']),
    ]
    return { deliveryCase, recorded, funding, totalChecks, completedChecks, openWeOwe, finance, busy, allChecked, missingItem, cancelled, activeCase, next, acknowledgeBlocked, missing }
  }

  const todayKey = zonedInputValue(new Date(now), timeZone).slice(0, 10)
  const dayKey = (value: string) => zonedInputValue(new Date(value), timeZone).slice(0, 10)
  /** A scheduled appointment that has passed with no arrival, or any active appointment from an earlier day. */
  const isOverdue = (deliveryCase: DeliveryCase | undefined) => {
    if (!deliveryCase?.appointmentAt || deliveryCase.status === 'cancelled' || deliveryCase.status === 'delivered') return false
    const at = new Date(deliveryCase.appointmentAt).getTime()
    return dayKey(deliveryCase.appointmentAt) < todayKey || (deliveryCase.status === 'scheduled' && at < now)
  }

  // Today's desk: financed deals with an appointment today or earlier, then financed deals still waiting for one.
  const todayQueue = deliveries
    .filter(delivery => delivery.status === 'financed')
    .map(delivery => ({ delivery, deliveryCase: caseFor(delivery.id) }))
    .filter(({ deliveryCase }) => !deliveryCase?.appointmentAt || deliveryCase.status === 'cancelled' || dayKey(deliveryCase.appointmentAt) <= todayKey)
    .sort((a, b) => {
      const at = (item: { deliveryCase: DeliveryCase | undefined }) =>
        item.deliveryCase?.appointmentAt && item.deliveryCase.status !== 'cancelled' ? new Date(item.deliveryCase.appointmentAt).getTime() : Number.MAX_SAFE_INTEGER
      return at(a) - at(b) || new Date(a.delivery.updatedAt).getTime() - new Date(b.delivery.updatedAt).getTime()
    })
  const todayScheduled = todayQueue.filter(({ deliveryCase }) => deliveryCase?.appointmentAt && deliveryCase.status !== 'cancelled')
  const overdueCount = todayQueue.filter(({ deliveryCase }) => isOverdue(deliveryCase)).length
  const unscheduledCount = todayQueue.length - todayScheduled.length
  const overduePromise = (item: WeOwe) => item.status === 'open' && Boolean(item.promisedAt) && new Date(item.promisedAt as string).getTime() < now

  const openDetails = (dealId: string) => {
    setSearch('')
    setFilter('all')
    setExpandedId(dealId)
    requestAnimationFrame(() => document.getElementById(`delivery-row-${dealId}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  /** The one next step for a row, as the queue's primary button. */
  const nextAction = (delivery: Delivery) => {
    const { next, busy, missingItem, funding, acknowledgeBlocked } = stateFor(delivery)
    if (delivery.status !== 'financed' || !next) return null
    if (next === 'schedule') return <Pill size="sm" variant="primary" className="h-10 sm:h-7" onClick={() => manageCase(delivery, 'schedule')} disabled={busy}><CalendarClock />Schedule</Pill>
    if (next === 'arrive') return <Pill size="sm" variant="primary" className="h-10 sm:h-7" onClick={() => manageCase(delivery, 'arrive')} disabled={busy}>Record arrival</Pill>
    if (next === 'checklist' && missingItem) return <Pill size="sm" variant="primary" className="h-10 sm:h-7" onClick={() => manageCase(delivery, 'record-checklist')} disabled={busy}>Record {missingItem.label.toLowerCase()}</Pill>
    if (next === 'acknowledge') return <Pill size="sm" variant="primary" className="h-10 sm:h-7" onClick={() => manageCase(delivery, 'acknowledge')} disabled={busy || Boolean(acknowledgeBlocked)}>Record acknowledgment</Pill>
    return <Pill size="sm" variant="primary" className="h-10 sm:h-7" onClick={() => complete(delivery)} disabled={busy || !funding.done}><Check />Complete delivery</Pill>
  }

  const header = (
    <DeskHeader
      title="Delivery"
      status={error ? 'Unavailable' : `${ready.length} ready`}
      meta={error ? 'Deliveries unavailable' : [
        todayScheduled.length ? `${todayScheduled.length} due today` : 'Nothing due today',
        overdueCount ? `${overdueCount} overdue` : null,
        `${ready.length} ready`,
        `${openPromises.length} open we-owes`,
      ].filter(Boolean).join(' · ')}
      actions={
        <Pill variant="plain" onClick={load} disabled={loading} aria-label="Refresh deliveries">
          <RefreshCw className={loading ? 'animate-spin' : undefined} />
          Refresh
        </Pill>
      }
    />
  )

  const filterOptions = [
    { value: 'active', label: 'Active', count: deliveries.filter(delivery => delivery.status !== 'delivered').length },
    { value: 'ready', label: 'Ready', tone: 'ok' as const, count: ready.length },
    { value: 'we-owe', label: 'Open we-owes', tone: 'warn' as const, count: deliveries.filter(delivery => caseFor(delivery.id)?.weOweItems.some(item => item.status === 'open')).length },
    { value: 'delivered', label: 'Delivered', count: completed.length },
    { value: 'all', label: 'All', count: deliveries.length },
  ]

  const renderDetail = (delivery: Delivery) => {
    const { deliveryCase, recorded, funding, totalChecks, completedChecks, openWeOwe, finance, busy, allChecked, missingItem, cancelled, activeCase, next, acknowledgeBlocked } = stateFor(delivery)
    return (
      <div className="min-w-0 space-y-4">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
          {delivery.lead ? (
            <Link className="text-foreground hover:underline" href={`${basePath}/platform/crm/${delivery.lead.id}`}>
              {customerName(delivery)}
            </Link>
          ) : (
            <span>{customerName(delivery)}</span>
          )}
          {delivery.salesperson?.name && <span>{delivery.salesperson.name}</span>}
          <Code>Stock {delivery.vehicle?.stockNumber || '—'}</Code>
          <Code className="break-all">VIN {delivery.vehicle?.vin || '—'}</Code>
          <Link className="hover:text-foreground hover:underline" href={`${basePath}/platform/deals/${delivery.id}`}>Open deal</Link>
        </p>
                        <div className="min-w-0 space-y-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                            <span className={fieldLabel}>Checklist</span>
                            <Meter value={completedChecks / totalChecks} segments={totalChecks} tone={allChecked ? 'ok' : 'warn'} label={`${vehicleName(delivery)} checklist progress`} />
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {completedChecks}/{totalChecks} complete
                            </span>
                          </div>
                          <ul className="grid min-w-0 gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
                            {DELIVERY_CHECKLIST_ITEMS.map(({ code, label }) => {
                              const item = deliveryCase?.checklist?.find(value => value.code === code)
                              const done = recorded.some(value => value.code === code)
                              return (
                                <li key={code} className="min-w-0 text-xs">
                                  <TitleLine as="span" tone={done ? 'ok' : 'idle'} className="text-foreground">
                                    {deliveryLabel(locale, label)}
                                    <span className="break-words text-muted-foreground"> · {deliveryLabel(locale, item?.status || 'Missing')}{item?.status === 'waived' && item.evidenceReference ? ` · ${item.evidenceReference}` : item?.evidenceReference ? ` · ${deliveryLabel(locale, 'Reference recorded')}` : ''}</span>
                                  </TitleLine>
                                </li>
                              )
                            })}
                            <li className="min-w-0 text-xs">
                              <TitleLine as="span" tone={funding.done ? 'ok' : 'idle'} className="text-foreground">
                                {funding.label}
                                <span className="break-all text-muted-foreground"> · {funding.text}</span>
                              </TitleLine>
                            </li>
                            <li className="min-w-0 text-xs">
                              <TitleLine as="span" tone={deliveryCase?.customerAcknowledgment ? 'ok' : 'idle'} className="text-foreground">
                                {deliveryLabel(locale, 'Customer acknowledgment')}
                                <span className="text-muted-foreground"> · {deliveryLabel(locale, deliveryCase?.customerAcknowledgment ? 'Recorded' : 'Missing')}</span>
                              </TitleLine>
                            </li>
                          </ul>
                        </div>

                        <div className="min-w-0 space-y-1.5 text-sm">
                          {delivery.status !== 'delivered' && !finance?.prerequisites?.current && (
                            <TitleLine as="p" tone="idle" className="text-foreground">
                              {finance?.structureType === 'cash' ? 'Documents and checks' : 'Contract, menu, and compliance'}
                              <span className="text-muted-foreground"> · {finance?.structureType === 'cash' ? 'confirmed when payment is recorded' : 'not yet reviewed'} · </span>
                              <Link className="text-muted-foreground underline hover:text-foreground" href={`${basePath}/platform/finance`}>
                                Open finance
                              </Link>
                            </TitleLine>
                          )}
                          {delivery.status === 'delivered' && (
                            <p className="text-sm text-muted-foreground">{locale === 'pt-BR' ? 'Entregue em' : 'Delivered'} {formatDate(delivery.saleDate, timeZone, locale)}.</p>
                          )}
                        </div>

                        {delivery.status === 'financed' && (
                          <div className="min-w-0 space-y-1.5">
                            <Track aria-label={`${vehicleName(delivery)} actions`} className="flex-wrap max-sm:[&>button]:h-10">
                              {!deliveryCase && (
                                <Pill size="sm" variant="primary" onClick={() => manageCase(delivery, 'schedule')} disabled={busy}>
                                  Schedule
                                </Pill>
                              )}
                              {cancelled && (
                                <Pill size="sm" variant="primary" onClick={() => manageCase(delivery, 'schedule')} disabled={busy}>
                                  <CalendarClock />
                                  Reschedule
                                </Pill>
                              )}
                              {deliveryCase?.status === 'ready' && (
                                <Pill size="sm" variant="primary" onClick={() => complete(delivery)} disabled={busy || !funding.done}>
                                  <Check />
                                  Complete delivery
                                </Pill>
                              )}
                              {deliveryCase?.status === 'scheduled' && (
                                <Pill size="sm" variant={next === 'arrive' ? 'primary' : 'raised'} onClick={() => manageCase(delivery, 'arrive')} disabled={busy}>
                                  Record arrival
                                </Pill>
                              )}
                              {activeCase && missingItem && (
                                <Pill size="sm" variant={next === 'checklist' ? 'primary' : 'raised'} onClick={() => manageCase(delivery, 'record-checklist')} disabled={busy}>
                                  Record {missingItem.label.toLowerCase()}
                                </Pill>
                              )}
                              {activeCase && missingItem && (
                                <Pill size="sm" onClick={() => openTask('waive', delivery)} disabled={busy}>
                                  Waive item
                                </Pill>
                              )}
                              {activeCase && activeCase.status !== 'ready' && (
                                <Pill size="sm" variant={next === 'acknowledge' ? 'primary' : 'raised'} onClick={() => manageCase(delivery, 'acknowledge')} disabled={busy || Boolean(acknowledgeBlocked)} aria-describedby={acknowledgeBlocked ? `delivery-ack-${delivery.id}` : undefined}>
                                  Record acknowledgment
                                </Pill>
                              )}
                              {activeCase && !missingItem && (
                                <Pill size="sm" onClick={() => manageCase(delivery, 'record-checklist')} disabled={busy}>
                                  Update checklist item
                                </Pill>
                              )}
                              {activeCase && (
                                <Pill size="sm" onClick={() => addWeOwe(delivery)} disabled={busy}>
                                  <Plus />
                                  Add we-owe
                                </Pill>
                              )}
                              {activeCase && (
                                <Pill size="sm" onClick={() => manageCase(delivery, 'schedule')} disabled={busy}>
                                  <CalendarClock />
                                  Reschedule
                                </Pill>
                              )}
                              {activeCase && (
                                <Pill size="sm" variant="plain" onClick={() => openTask('cancel', delivery)} disabled={busy}>
                                  <X />
                                  Cancel delivery
                                </Pill>
                              )}
                            </Track>
                            {activeCase && activeCase.status !== 'ready' && acknowledgeBlocked && (
                              <p id={`delivery-ack-${delivery.id}`} className="pl-4 text-xs text-muted-foreground">
                                Acknowledgment: {acknowledgeBlocked}
                                {!funding.done && !missingItem && (
                                  <>
                                    {' · '}
                                    <Link className="underline hover:text-foreground" href={`${basePath}/platform/finance`}>Open finance</Link>
                                  </>
                                )}
                              </p>
                            )}
                          </div>
                        )}

                        {(deliveryCase?.weOweItems.length || 0) > 0 && (
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-2 border-b pb-1.5">
                              <span className={fieldLabel}>We-owe items</span>
                              {openWeOwe.length > 0 && (
                                <span className="text-xs tabular-nums text-muted-foreground">
                                  {openWeOwe.length} open
                                </span>
                              )}
                            </div>
                            <ul className="divide-y">
                              {deliveryCase?.weOweItems.map(item => (
                                <li key={item.id} className="flex min-w-0 flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="min-w-0">
                                    <TitleLine as="p" tone={item.status === 'open' ? 'warn' : item.status === 'waived' ? 'idle' : 'ok'} status={item.status} className="text-sm text-foreground">
                                      {item.description}
                                    </TitleLine>
                                    <p className="pl-4 text-xs text-muted-foreground">
                                      {item.status} · {locale === 'pt-BR' ? 'prometido para' : 'promised'} {formatDate(item.promisedAt, timeZone, locale)}{overduePromise(item) ? (locale === 'pt-BR' ? ' · em atraso' : ' · overdue') : ''} · {item.owner?.name || (locale === 'pt-BR' ? 'Sem responsável' : 'Unassigned')}
                                      {item.estimatedCostCents != null ? ` · ${locale === 'pt-BR' ? 'custo estimado' : 'est'} ${formatUsd(item.estimatedCostCents / 100, { currencyCode, locale })}` : ''}
                                    </p>
                                  </div>
                                  {item.status === 'open' && (
                                    <Track className="shrink-0 self-start max-sm:[&>button]:h-10 sm:self-auto">
                                      <Pill size="sm" variant="plain" onClick={() => openTask('edit-we-owe', delivery, item)} disabled={busy} aria-label={`Edit ${item.description}`}>
                                        <Pencil />
                                        Edit
                                      </Pill>
                                      <Pill size="sm" onClick={() => closeWeOwe(delivery, item, 'fulfill')} disabled={busy}>
                                        Fulfill
                                      </Pill>
                                      <Pill size="sm" variant="plain" onClick={() => closeWeOwe(delivery, item, 'waive')} disabled={busy}>
                                        Waive
                                      </Pill>
                                    </Track>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="min-w-0 divide-y border-t">
                          <FinanceEvidenceHistory dealId={delivery.id} aggregateType="DeliveryCase" label="Delivery history" timeZone={timeZone} />
                          <FinanceEvidenceHistory dealId={delivery.id} aggregateType="Deal" label="Deal history" timeZone={timeZone} />
                          {deliveryCase?.deliverySnapshot != null && (
                            <details className="group min-w-0 text-sm">
                              <summary className="flex cursor-pointer list-none items-center gap-2 py-1.5 font-medium text-foreground [&::-webkit-details-marker]:hidden">
                                <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                                Delivery record
                              </summary>
                              <pre className="mb-2 ml-5 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-[4px] bg-muted/50 p-2 font-mono text-xs text-muted-foreground">
                                {JSON.stringify(deliveryCase.deliverySnapshot, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
      </div>
    )
  }

  return (
    <PageContainer title="Delivery" header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {notice && <Notice tone={notice.startsWith('Unable') ? 'bad' : 'ok'} role="status">{notice}</Notice>}

        <DeskSection
          id="delivery-today"
          title="Today"
          count={todayQueue.length}
          actions={
            overdueCount || unscheduledCount ? (
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {overdueCount > 0 && <Attention>{overdueCount} overdue</Attention>}
                {unscheduledCount > 0 && <span>{unscheduledCount} not scheduled</span>}
              </span>
            ) : undefined
          }
        >
          {error ? (
            <p className="py-4 text-[13px] text-muted-foreground">{locale === 'pt-BR' ? 'As entregas de hoje estarão disponíveis quando o painel carregar.' : 'Today&apos;s deliveries are unavailable until the desk loads.'}</p>
          ) : todayQueue.length === 0 ? (
            <p className="py-4 text-[13px] text-muted-foreground">No deliveries due today and none waiting to be scheduled.</p>
          ) : (
            <ul className="divide-y rounded-md border bg-card">
              {todayQueue.map(({ delivery, deliveryCase }) => {
                const { completedChecks, totalChecks, allChecked, missing } = stateFor(delivery)
                const scheduledAt = deliveryCase?.appointmentAt && deliveryCase.status !== 'cancelled' ? deliveryCase.appointmentAt : null
                const overdue = isOverdue(deliveryCase)
                return (
                  <li key={delivery.id} className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-center">
                    <div className="min-w-0">
                      {scheduledAt ? (
                        <time dateTime={scheduledAt} className="block">
                          <Figure size="md" attention={overdue}>
                            {new Date(scheduledAt).toLocaleTimeString(locale, { timeZone, hour: 'numeric', minute: '2-digit' })}
                          </Figure>
                          <span className="mt-1 block text-[12px] text-muted-foreground">
                            {overdue ? (locale === 'pt-BR' ? 'Atrasado' : 'Overdue') : (locale === 'pt-BR' ? 'Hoje' : 'Today')}{dayKey(scheduledAt) < todayKey ? ` · ${new Date(scheduledAt).toLocaleDateString(locale, { timeZone, month: 'short', day: 'numeric' })}` : ''}
                          </span>
                        </time>
                      ) : (
                        <span className="block text-[12px] font-medium text-muted-foreground">Not scheduled</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-foreground">{vehicleName(delivery)}</p>
                      <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[12px] text-muted-foreground">
                        <Status tone={deliveryTone(delivery, deliveryCase)} className="text-[12px]">{deliveryLabel(locale, deliveryStatusLabel(delivery, deliveryCase))}</Status>
                        <span className="truncate">{customerName(delivery)}</span>
                        {delivery.vehicle?.stockNumber && <Code>#{delivery.vehicle.stockNumber}</Code>}
                      </p>
                    </div>
                    <div className="col-start-2 min-w-0 md:col-start-auto">
                      <p className="flex items-center gap-2 text-[12px]">
                        <Meter value={completedChecks / totalChecks} segments={totalChecks} tone={allChecked ? 'ok' : 'warn'} label={`${vehicleName(delivery)} readiness`} />
                        <span className="tabular-nums text-foreground">{completedChecks}/{totalChecks} checklist</span>
                      </p>
                      <p className="mt-0.5 break-words text-[12px] text-muted-foreground">
                        {missing.length ? `Missing: ${missing.join(', ')}` : 'Ready to hand over'}
                      </p>
                    </div>
                    <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-2 md:col-start-auto md:justify-end">
                      {nextAction(delivery)}
                      <Pill size="sm" variant="plain" className="h-10 sm:h-7" onClick={() => openDetails(delivery.id)} aria-label={`Details for ${vehicleName(delivery)}`}>
                        Details
                        <ChevronRight />
                      </Pill>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </DeskSection>

        <DeskSection
          id="delivery-board"
          title="All deliveries"
          count={visible.length}
          actions={loading ? <span className="text-xs text-muted-foreground" role="status">Refreshing…</span> : undefined}
        >
          <div className="space-y-3">
            <Segmented label="Filter deliveries" value={filter} onChange={setFilter} options={filterOptions} size="sm" className="w-full" />
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1 sm:max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className={`${controlClass} pl-9`}
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Customer, stock, vehicle or VIN"
                  aria-label="Search deliveries"
                />
              </div>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className={`${controlClass} w-full sm:w-[180px]`} aria-label="Sort deliveries">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="appointment">Appointment first</SelectItem>
                  <SelectItem value="updated">Recently updated</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error ? (
              <Notice tone="bad">
                <p className="font-medium">Deliveries are unavailable</p>
                <p className="mt-0.5 text-muted-foreground">{error}</p>
                <Track className="mt-2">
                  <Pill size="sm" onClick={load}>Retry</Pill>
                </Track>
              </Notice>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
                <p>{deliveries.length > 0 && isFiltered ? 'No matching deliveries' : 'No deliveries'}</p>
                {deliveries.length > 0 && isFiltered && (
                  <Track>
                    <Pill size="sm" onClick={resetFilters}>Reset filters</Pill>
                  </Track>
                )}
              </div>
            ) : (
              <DeskTable>
                <thead>
                  <tr>
                    <Th>Status</Th>
                    <Th>Appointment</Th>
                    <Th>Vehicle</Th>
                    <Th priority={2}>Stock #</Th>
                    <Th priority={2}>Customer</Th>
                    <Th align="right" priority={3}>Checklist</Th>
                    <Th align="right" priority={3}>We-owes</Th>
                    <Th className="w-10"><span className="sr-only">Details</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(delivery => {
                    const { deliveryCase, completedChecks, totalChecks, openWeOwe } = stateFor(delivery)
                    const expanded = expandedId === delivery.id
                    const scheduledAt = deliveryCase?.appointmentAt && deliveryCase.status !== 'cancelled' ? deliveryCase.appointmentAt : null
                    const lateWeOwes = openWeOwe.filter(overduePromise).length
                    const toggle = () => setExpandedId(current => (current === delivery.id ? null : delivery.id))
                    return (
                      <Fragment key={delivery.id}>
                        <Tr id={`delivery-row-${delivery.id}`} className={`cursor-pointer scroll-mt-4 ${expanded ? 'bg-muted/40' : ''}`} onClick={toggle}>
                          <Td className="w-[1%]">
                            <Status tone={deliveryTone(delivery, deliveryCase)}>{deliveryLabel(locale, deliveryStatusLabel(delivery, deliveryCase))}</Status>
                          </Td>
                          <Td className="whitespace-nowrap">
                            {scheduledAt ? (
                              <span className={isOverdue(deliveryCase) ? 'font-medium text-foreground' : 'text-foreground'}>
                                {formatDate(scheduledAt, timeZone, locale)}
                                {isOverdue(deliveryCase) && <Attention className="ml-2">Overdue</Attention>}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">{delivery.status === 'delivered' ? formatDate(delivery.saleDate, timeZone, locale) : (locale === 'pt-BR' ? 'Não agendado' : 'Not scheduled')}</span>
                            )}
                          </Td>
                          <Td className="min-w-0 max-w-[16rem]">
                            <button
                              type="button"
                              aria-expanded={expanded}
                              aria-controls={`delivery-detail-${delivery.id}`}
                              onClick={event => { event.stopPropagation(); toggle() }}
                              className="block max-w-full truncate text-left font-medium text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
                            >
                              {vehicleName(delivery)}
                            </button>
                            <span className="block truncate text-[12px] text-muted-foreground md:hidden">{customerName(delivery)}</span>
                          </Td>
                          <Td priority={2} className="whitespace-nowrap">{delivery.vehicle?.stockNumber ? <Code>#{delivery.vehicle.stockNumber}</Code> : <span className="text-muted-foreground">-</span>}</Td>
                          <Td priority={2} className="max-w-[12rem] truncate">{customerName(delivery)}</Td>
                          <Td align="right" priority={3} className="whitespace-nowrap">{completedChecks}/{totalChecks}</Td>
                          <Td align="right" priority={3} className="whitespace-nowrap">
                            {openWeOwe.length === 0 ? <span className="text-muted-foreground">None</span> : lateWeOwes > 0 ? <Attention>{openWeOwe.length} open · {lateWeOwes} late</Attention> : `${openWeOwe.length} open`}
                          </Td>
                          <Td className="w-10 text-muted-foreground">
                            <ChevronRight aria-hidden="true" className={`size-4 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} />
                          </Td>
                        </Tr>
                        {expanded && (
                          <tr id={`delivery-detail-${delivery.id}`} className="border-b bg-muted/20 last:border-b-0">
                            <td colSpan={8} className="px-4 py-4">
                              {renderDetail(delivery)}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </DeskTable>
            )}
          </div>
        </DeskSection>

        {deliveries.length > 0 && (
          <ReadoutStrip>
            <Readout label="Scheduled" value={scheduled.length} />
            <Readout label="Ready" value={ready.length} />
            <Readout label="Open we-owes" value={openPromises.length} />
            <Readout label="Delivered" value={completed.length} />
          </ReadoutStrip>
        )}

        <Dialog
          open={Boolean(task)}
          onOpenChange={open => {
            if (!open && !activeId) {
              setTask(null)
              setTaskError(null)
            }
          }}
        >
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{taskTitle}</DialogTitle>
              <DialogDescription>{taskDescription}</DialogDescription>
            </DialogHeader>
            <form onSubmit={submitTask} className="space-y-4">
              {task?.kind === 'schedule' && (
                <label htmlFor="delivery-appointment" className="grid gap-1.5 text-sm">
                  <span className={fieldLabel}>Appointment</span>
                  <Input
                    id="delivery-appointment"
                    className={controlClass}
                    type="datetime-local"
                    required
                    min={zonedInputValue(new Date(Date.now() - 300_000), timeZone)}
                    value={task.fields.appointmentAt || ''}
                    onChange={event => updateTaskField('appointmentAt', event.target.value)}
                  />
                </label>
              )}
              {task?.kind === 'checklist' && (
                <>
                  <div className="grid gap-1.5 text-sm">
                    <span className={fieldLabel} id="delivery-checklist-code-label">
                      Checklist item
                    </span>
                    <Select value={task.fields.code || ''} onValueChange={value => updateTaskField('code', value)}>
                      <SelectTrigger id="delivery-checklist-code" className={controlClass} aria-labelledby="delivery-checklist-code-label">
                        <SelectValue placeholder="Select an item" />
                      </SelectTrigger>
                      <SelectContent>
                        {DELIVERY_CHECKLIST_ITEMS.map(item => (
                          <SelectItem key={item.code} value={item.code}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <label htmlFor="delivery-reference" className="grid gap-1.5 text-sm">
                    <span className={fieldLabel}>Reference</span>
                    <Input
                      id="delivery-reference"
                    className={controlClass}
                      required
                      maxLength={200}
                      value={task.fields.reference || ''}
                      onChange={event => updateTaskField('reference', event.target.value)}
                      placeholder="Document or record number"
                    />
                  </label>
                </>
              )}
              {task?.kind === 'acknowledge' && (
                <label htmlFor="delivery-acknowledgment" className="grid gap-1.5 text-sm">
                  <span className={fieldLabel}>Customer acknowledgment reference</span>
                  <Input
                    id="delivery-acknowledgment"
                    className={controlClass}
                    required
                    value={task.fields.acknowledgment || ''}
                    onChange={event => updateTaskField('acknowledgment', event.target.value)}
                  />
                </label>
              )}
              {task?.kind === 'cancel' && (
                <label htmlFor="delivery-cancel-reason" className="grid gap-1.5 text-sm">
                  <span className={fieldLabel}>Cancellation reason</span>
                  <Textarea className="rounded-[4px] text-[13px] shadow-none" id="delivery-cancel-reason" required maxLength={500} rows={3} value={task.fields.reason || ''} onChange={event => updateTaskField('reason', event.target.value)} />
                </label>
              )}
              {task?.kind === 'waive' && (
                <>
                  <div className="grid gap-1.5 text-sm">
                    <span className={fieldLabel} id="delivery-waive-code-label">Checklist item</span>
                    <Select value={task.fields.code || ''} onValueChange={value => updateTaskField('code', value)}>
                      <SelectTrigger id="delivery-waive-code" className={controlClass} aria-labelledby="delivery-waive-code-label"><SelectValue placeholder="Select an item" /></SelectTrigger>
                      <SelectContent>
                        {DELIVERY_CHECKLIST_ITEMS.map(item => <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <label htmlFor="delivery-waive-reason" className="grid gap-1.5 text-sm">
                    <span className={fieldLabel}>Waiver reason</span>
                    <Textarea className="rounded-[4px] text-[13px] shadow-none" id="delivery-waive-reason" required maxLength={200} rows={2} value={task.fields.reason || ''} onChange={event => updateTaskField('reason', event.target.value)} />
                  </label>
                </>
              )}
              {(task?.kind === 'we-owe' || task?.kind === 'edit-we-owe') && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5 text-sm">
                    <span className={fieldLabel} id="we-owe-owner-label">Owner</span>
                    <Select value={task.fields.ownerId || ''} onValueChange={value => updateTaskField('ownerId', value)}>
                      <SelectTrigger id="we-owe-owner" className={controlClass} aria-labelledby="we-owe-owner-label"><SelectValue placeholder="Select owner" /></SelectTrigger>
                      <SelectContent>
                        {staffFor(task.delivery).map(user => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}
                        {task.item?.owner && !staffFor(task.delivery).some(user => user.id === task.item?.owner?.id) && <SelectItem value={task.item.owner.id}>{task.item.owner.name}</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>
                  <label htmlFor="we-owe-cost" className="grid gap-1.5 text-sm">
                    <span className={fieldLabel}>Estimated cost</span>
                    <MoneyInput id="we-owe-cost" className="h-10 text-[13px]" cents={Number(task.fields.estimatedCostCents) || 0} onCentsChange={cents => updateTaskField('estimatedCostCents', String(cents))} />
                  </label>
                  {task.kind === 'edit-we-owe' && (
                    <label htmlFor="we-owe-edit-promised-at" className="grid gap-1.5 text-sm sm:col-span-2">
                      <span className={fieldLabel}>Promised by (dealership time)</span>
                      <Input id="we-owe-edit-promised-at" className={controlClass} type="datetime-local" required value={task.fields.promisedAt || ''} onChange={event => updateTaskField('promisedAt', event.target.value)} />
                    </label>
                  )}
                </div>
              )}
              {task?.kind === 'we-owe' && (
                <>
                  <label htmlFor="we-owe-description" className="grid gap-1.5 text-sm">
                    <span className={fieldLabel}>Description</span>
                    <Textarea
                      className="rounded-[4px] text-[13px] shadow-none"
                      id="we-owe-description"
                      required
                      maxLength={1000}
                      rows={3}
                      value={task.fields.description || ''}
                      onChange={event => updateTaskField('description', event.target.value)}
                    />
                  </label>
                  <label htmlFor="we-owe-promised-at" className="grid gap-1.5 text-sm">
                    <span className={fieldLabel}>Promised by (dealership time)</span>
                    <Input
                      id="we-owe-promised-at"
                    className={controlClass}
                      type="datetime-local"
                      required
                      value={task.fields.promisedAt || ''}
                      onChange={event => updateTaskField('promisedAt', event.target.value)}
                    />
                  </label>
                </>
              )}
              {task?.kind === 'close-we-owe' && (
                <>
                  <label htmlFor="we-owe-fulfillment" className="grid gap-1.5 text-sm">
                    <span className={fieldLabel}>{task.action === 'waive' ? 'Waiver' : 'Fulfillment'} reference</span>
                    <Input
                      id="we-owe-fulfillment"
                    className={controlClass}
                      required
                      value={task.fields.fulfillmentEvidence || ''}
                      onChange={event => updateTaskField('fulfillmentEvidence', event.target.value)}
                    />
                  </label>
                  <label htmlFor="we-owe-ack" className="grid gap-1.5 text-sm">
                    <span className={fieldLabel}>Customer acknowledgment reference</span>
                    <Input
                      id="we-owe-ack"
                    className={controlClass}
                      required
                      value={task.fields.customerAcknowledgment || ''}
                      onChange={event => updateTaskField('customerAcknowledgment', event.target.value)}
                    />
                  </label>
                </>
              )}
              {task?.kind === 'complete' && (
                <label className="flex min-h-10 items-start gap-2 rounded-[4px] border bg-muted/50 p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={task.fields.confirmed === 'yes'}
                    onChange={event => updateTaskField('confirmed', event.target.checked ? 'yes' : '')}
                  />
                  <span>The vehicle is ready for delivery.</span>
                </label>
              )}
              {taskError && <Notice tone="bad">{taskError}</Notice>}
              <DialogFooter className="sm:justify-end">
                <Track>
                  <Pill
                    variant="plain"
                    disabled={Boolean(activeId)}
                    onClick={() => {
                      setTask(null)
                      setTaskError(null)
                    }}
                  >
                    Cancel
                  </Pill>
                  <Pill type="submit" variant="primary" disabled={Boolean(activeId)}>
                    {activeId ? 'Saving…' : task?.kind === 'complete' ? 'Complete delivery' : task?.kind === 'cancel' ? 'Cancel delivery' : task?.kind === 'waive' ? 'Waive item' : 'Save'}
                  </Pill>
                </Track>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </PageContainer>
  )
}
