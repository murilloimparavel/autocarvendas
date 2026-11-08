'use client'

import { useMemo, useRef, useState } from 'react'
import { useLocale } from '@/features/i18n/LocaleProvider'
import Link from 'next/link'
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import {
  Code,
  DeskHeader,
  DeskSection,
  DeskTable,
  Facts,
  Figure,
  Notice,
  Pill,
  Status,
  Td,
  Th,
  Tr,
  Track,
} from '@/features/platform/components/desk'
import { formatCentsForInput, parseDollarsToCents } from '@/features/platform/deals/lib/moneyInput'
import { formatPhone } from '@/features/platform/lib/format'
import {
  addServiceOrderLineItem,
  getRooftopStaff,
  getServiceOrderDetail,
  getServicePartOptions,
  manageLaborOperation,
  recordServiceOrderEvidence,
  removeServiceOrderLineItem,
  setServiceOrderTax,
  transitionServiceOrder,
  updateServiceOrderLineItem,
} from '../actions'
import { ServiceFormDialog, type ServiceFormField } from '../components/ServiceFormDialog'
import { createAttemptKeys } from '../lib/attemptKeys'
import { formatCents as formatCentsBase, formatDateTime as formatDateTimeBase, formatMileage, formatQuantity, parseQuantity, parseWhole } from '../lib/serviceFormat'
import { repairOrderTotalsCheck } from '../lib/serviceTasks'
import {
  APPOINTMENT_STATUS_LABELS,
  LABOR_ACTION_LABELS,
  LABOR_STATUS_LABELS,
  LABOR_TONES,
  LINE_TYPE_LABELS,
  NEXT_ORDER_STATUS,
  ORDER_ACTION_LABELS,
  ORDER_EDITABLE_STATUSES,
  ORDER_STATUS_LABELS,
  STATUS_TONES,
  customerName,
  laborActions,
  orderTransitionBlock,
  roReference,
  settledNetCents,
  type LaborAction,
  serviceLabel,
} from '../lib/serviceStatus'
import type { FixedOpsLineItem, ServiceLaborOperationDetail, ServiceOrderDetail, ServicePartOption } from '../lib/types'

type FormKind =
  | 'evidence'
  | 'line'
  | 'line-remove'
  | 'tax'
  | 'labor-create'
  | 'labor-dispatch'
  | 'labor-complete'
  | 'labor-cancel'
  | 'invoice'
  | 'confirm-transition'

type FormState = {
  kind: FormKind
  title: string
  key: string
  values: Record<string, string>
  errors: Record<string, string>
  formError: string | null
  lineId?: string
  operationId?: string
  toStatus?: string
  submitLabel?: string
  variant?: 'primary' | 'danger'
}

type CommandResponse = { success: boolean; error?: string; rejected?: boolean }

const PAY_TYPES = [
  { value: 'customer', en: 'Customer', pt: 'Cliente' },
  { value: 'warranty', en: 'Warranty', pt: 'Garantia' },
  { value: 'internal', en: 'Internal', pt: 'Interno' },
]
const AUTHORIZATION_STATUSES = [
  { value: 'pending', en: 'Pending', pt: 'Pendente' },
  { value: 'authorized', en: 'Authorized', pt: 'Autorizado' },
  { value: 'declined', en: 'Declined', pt: 'Recusado' },
]
const LINE_TYPES = [
  { value: 'labor', en: 'Labor', pt: 'Mão de obra' },
  { value: 'part', en: 'Part', pt: 'Peça' },
  { value: 'sublet', en: 'Sublet', pt: 'Serviço terceirizado' },
]
const PAYMENT_LABELS: Record<string, string> = {
  creating: 'Creating', pending: 'Pending', authorized: 'Authorized', captured: 'Captured',
  failed: 'Failed', canceled: 'Canceled', 'partially-refunded': 'Partially refunded', refunded: 'Refunded',
}
const PAYMENT_LABELS_PT: Record<string, string> = {
  creating: 'Criando', pending: 'Pendente', authorized: 'Autorizado', captured: 'Capturado',
  failed: 'Falhou', canceled: 'Cancelado', 'partially-refunded': 'Parcialmente estornado', refunded: 'Estornado',
}
const chooseText = (pt: boolean, en: string, ptText: string) => pt ? ptText : en

function newKey(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`
}

export function ServiceOrderDetailPageClient({
  id,
  initialOrder,
  initialError,
  timeZone,
  taxRateBps,
  currencyCode,
}: {
  id: string
  initialOrder: ServiceOrderDetail | null
  initialError: string | null
  timeZone: string
  taxRateBps: number | null
  currencyCode: string
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const formatCents = (value: number | null | undefined) => formatCentsBase(value, currencyCode, locale)
  const formatDateTime = (value: string | null | undefined, zone: string, empty?: string) => formatDateTimeBase(value, zone, empty, locale)
  const [order, setOrder] = useState<ServiceOrderDetail | null>(initialOrder)
  const [loadError, setLoadError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [staff, setStaff] = useState<Array<{ value: string; label: string }>>([])
  const [parts, setParts] = useState<ServicePartOption[] | null>(null)
  const attemptKeys = useRef(createAttemptKeys('service-order')).current

  const reload = async () => {
    setLoading(true)
    const response = await getServiceOrderDetail(id)
    if (response.success) {
      setOrder(response.data)
      setLoadError(null)
    } else {
      setLoadError(response.error)
    }
    setLoading(false)
  }

  const breadcrumbs = (label: string) => [
    { type: 'link' as const, label: pt ? 'Painel' : 'Dashboard', href: basePath },
    { type: 'page' as const, label: pt ? 'Plataforma' : 'Platform' },
    { type: 'link' as const, label: pt ? 'Oficina' : 'Service', href: `${basePath}/platform/service` },
    { type: 'page' as const, label },
  ]

  const totals = useMemo(() => (order ? repairOrderTotalsCheck({ ...order, lineItems: order.lineItems || [] }) : null), [order])

  if (!order) {
    return (
      <PageContainer title={pt ? 'Ordem de serviço' : 'Repair order'} header={<DeskHeader eyebrow={pt ? 'Ordem de serviço' : 'Repair order'} title={pt ? 'Ordem de serviço indisponível' : 'Repair order unavailable'} tone="bad" status={pt ? 'Indisponível' : 'Unavailable'} />} breadcrumbs={breadcrumbs(pt ? 'Ordem de serviço' : 'Repair order')}>
        <div className="space-y-3 px-4 pb-24 md:px-6">
          <Notice tone="bad">{loadError || (pt ? 'Ordem de serviço não encontrada' : 'Repair order not found')}</Notice>
          <Track>
            <Pill className="max-sm:h-11" onClick={reload} disabled={loading}>{loading ? (pt ? 'Carregando…' : 'Loading…') : (pt ? 'Tentar novamente' : 'Retry')}</Pill>
            <Pill className="max-sm:h-11" asChild>
              <Link href={`${basePath}/platform/service`}>{pt ? 'Oficina' : 'Service desk'}</Link>
            </Pill>
          </Track>
        </div>
      </PageContainer>
    )
  }

  const status = order.status || 'estimate'
  const editable = ORDER_EDITABLE_STATUSES.includes(status)
  const lockedReason = editable ? null : pt ? 'Bloqueado após a conclusão' : 'Locked after completion'
  const appointment = order.appointment
  const lead = appointment?.lead || null
  const name = customerName(lead)
  const reference = roReference(order.id)
  const vehicle = appointment?.customerVehicleDescription || (pt ? 'Veículo não informado' : 'Vehicle not set')
  const nextStatus = NEXT_ORDER_STATUS[status]
  const nextBlock = nextStatus && nextStatus !== 'invoiced' ? orderTransitionBlock(order, nextStatus) : null
  const openOps = order.laborOperations.filter(operation => !['completed', 'cancelled'].includes(operation.status)).length
  const lineSubtotal = (totals?.lineLaborCents ?? 0) + (totals?.linePartsCents ?? 0)

  const run = async (scope: string, action: () => Promise<CommandResponse>, success: string) => {
    setBusy(scope)
    setNotice(null)
    const response = await action()
    attemptKeys.settle(scope, response)
    if (response.success) {
      setNotice({ tone: 'ok', text: success })
      await reload()
    } else {
      setNotice({ tone: 'bad', text: response.error || (pt ? 'Não foi possível salvar' : 'Unable to save') })
    }
    setBusy(null)
  }

  const transition = (toStatus: string, invoiceNumber?: string) => {
    const scope = `transition:${toStatus}`
    return transitionServiceOrder({ id: order.id, toStatus, idempotencyKey: attemptKeys.key(scope), ...(invoiceNumber ? { invoiceNumber } : {}) })
      .then(response => { attemptKeys.settle(scope, response); return response })
  }

  const startTransition = (toStatus: string) => {
    if (toStatus === 'invoiced') {
      openForm({ kind: 'invoice', title: pt ? 'Faturar ordem de serviço' : 'Invoice repair order', values: { invoiceNumber: order.invoiceNumber || '' }, submitLabel: pt ? 'Faturar' : 'Invoice', toStatus })
      return
    }
    if (toStatus === 'completed' || toStatus === 'paid') {
      openForm({ kind: 'confirm-transition', title: toStatus === 'completed' ? chooseText(pt, 'Complete repair and lock lines', 'Concluir serviço e bloquear itens') : chooseText(pt, `Mark ${reference} paid`, `Marcar ${reference} como pago`), values: {}, submitLabel: serviceLabel(locale, ORDER_ACTION_LABELS[toStatus]), toStatus })
      return
    }
    void run(`transition:${toStatus}`, () => transitionServiceOrder({ id: order.id, toStatus, idempotencyKey: attemptKeys.key(`transition:${toStatus}`) }), serviceLabel(locale, ORDER_STATUS_LABELS[toStatus] || toStatus))
  }

  const openForm = (next: Omit<FormState, 'key' | 'errors' | 'formError'>) => {
    setForm({ ...next, key: newKey(`service-${next.kind}`), errors: {}, formError: null })
  }

  const ensureParts = async () => {
    if (parts || !order.rooftop?.id) return
    const response = await getServicePartOptions(order.rooftop.id)
    setParts(response.success ? response.data.partsInventories || [] : [])
  }

  const openLine = (line?: FixedOpsLineItem) => {
    openForm({
      kind: 'line',
      title: line ? (pt ? 'Editar item' : 'Edit line') : (pt ? 'Adicionar item' : 'Add line'),
      lineId: line?.id,
      submitLabel: line ? (pt ? 'Salvar item' : 'Save line') : (pt ? 'Adicionar item' : 'Add line'),
      values: line
        ? { itemType: line.itemType, partId: '', partNumber: line.partNumber || '', description: line.description, quantity: formatQuantity(line.quantity), unitPrice: formatCentsForInput(line.unitPriceCents, locale) }
        : { itemType: 'labor', partId: '', partNumber: '', description: '', quantity: '1', unitPrice: '' },
    })
    if (line?.itemType === 'part') void ensureParts()
  }

  const openDispatch = async (operation: ServiceLaborOperationDetail) => {
    openForm({ kind: 'labor-dispatch', title: `${pt ? 'Designar' : 'Dispatch'} ${operation.operationCode}`, operationId: operation.id, submitLabel: pt ? 'Designar' : 'Dispatch', values: { technicianId: appointmentTechId() } })
    setStaff([])
    if (!order.rooftop?.id) return
    const response = await getRooftopStaff(order.rooftop.id)
    if (response.success) {
      setStaff(response.data.users.map(user => ({ value: user.id, label: user.name })))
      if (!response.data.users.length) setForm(current => (current ? { ...current, formError: pt ? 'Nenhum integrante elegível nesta unidade' : 'No eligible staff at this location' } : current))
    } else {
      setForm(current => (current ? { ...current, formError: response.error || (pt ? 'Não foi possível carregar a equipe' : 'Unable to load staff') } : current))
    }
  }
  const appointmentTechId = () => appointment?.assignedTech?.id || ''

  const laborAction = (operation: ServiceLaborOperationDetail, action: LaborAction) => {
    if (action === 'dispatch') { void openDispatch(operation); return }
    if (action === 'complete') {
      openForm({ kind: 'labor-complete', title: `${pt ? 'Concluir' : 'Complete'} ${operation.operationCode}`, operationId: operation.id, submitLabel: pt ? 'Concluir' : 'Complete', values: { actualMinutes: operation.actualMinutes != null ? String(operation.actualMinutes) : '' } })
      return
    }
    if (action === 'cancel') {
      openForm({ kind: 'labor-cancel', title: `${pt ? 'Cancelar' : 'Cancel'} ${operation.operationCode}`, operationId: operation.id, submitLabel: pt ? 'Cancelar serviço' : 'Cancel operation', variant: 'danger', values: {} })
      return
    }
    const scope = `labor:${operation.id}:${action}`
    void run(scope, () => manageLaborOperation({ serviceOrderId: order.id, operationId: operation.id, action, idempotencyKey: attemptKeys.key(scope) }), `${operation.operationCode} ${serviceLabel(locale, LABOR_STATUS_LABELS[action === 'start' ? 'in-progress' : 'paused']).toLowerCase()}`)
  }

  const formFields = (state: FormState): ServiceFormField[] => {
    switch (state.kind) {
      case 'evidence':
        return [
          { name: 'concern', label: chooseText(pt, 'Concern', 'Reclamação do cliente'), type: 'textarea' },
          { name: 'cause', label: chooseText(pt, 'Cause', 'Causa'), type: 'textarea' },
          { name: 'correction', label: chooseText(pt, 'Correction', 'Correção'), type: 'textarea' },
          { name: 'payType', label: chooseText(pt, 'Pay type', 'Responsável pelo pagamento'), type: 'select', options: PAY_TYPES.map(option => ({ value: option.value, label: pt ? option.pt : option.en })) },
          { name: 'authorizationStatus', label: chooseText(pt, 'Authorization', 'Autorização'), type: 'select', options: AUTHORIZATION_STATUSES.map(option => ({ value: option.value, label: pt ? option.pt : option.en })) },
          { name: 'reference', label: state.values.authorizationStatus === 'pending' ? chooseText(pt, 'Authorization reference (optional)', 'Referência da autorização (opcional)') : chooseText(pt, 'Authorization reference', 'Referência da autorização'), placeholder: chooseText(pt, 'Signed estimate, call log', 'Orçamento assinado, registro da ligação') },
          { name: 'invoiceNumber', label: chooseText(pt, 'Invoice number (optional)', 'Número da nota fiscal (opcional)') },
        ]
      case 'line': {
        const isPart = state.values.itemType === 'part'
        const partOptions = (parts || []).map(part => ({ value: part.id, label: `${part.partNumber || chooseText(pt, 'Part', 'Peça')} · ${part.description || ''} · ${Math.max(0, (part.quantity ?? 0) - (part.committedQuantity ?? 0))} ${chooseText(pt, 'available', 'disponíveis')}` }))
        return [
          { name: 'itemType', label: chooseText(pt, 'Type', 'Tipo'), type: 'select', options: LINE_TYPES.map(option => ({ value: option.value, label: pt ? option.pt : option.en })) },
          ...(isPart && partOptions.length ? [{ name: 'partId', label: chooseText(pt, 'Catalog part', 'Peça do catálogo'), type: 'select' as const, options: partOptions, placeholder: chooseText(pt, 'Select a part', 'Selecione uma peça') }] : []),
          ...(isPart ? [{ name: 'partNumber', label: chooseText(pt, 'Part number', 'Código da peça') }] : []),
          { name: 'description', label: chooseText(pt, 'Description', 'Descrição'), wide: true },
          { name: 'quantity', label: state.values.itemType === 'labor' ? chooseText(pt, 'Hours', 'Horas') : chooseText(pt, 'Quantity', 'Quantidade'), inputMode: 'decimal' },
          { name: 'unitPrice', label: state.values.itemType === 'labor' ? chooseText(pt, 'Rate', 'Valor por hora') : chooseText(pt, 'Unit price', 'Preço unitário'), type: 'money', placeholder: pt ? 'R$ 0,00' : '$0.00' },
        ]
      }
      case 'tax':
        return [{ name: 'tax', label: chooseText(pt, 'Tax', 'Imposto'), type: 'money', placeholder: pt ? 'R$ 0,00' : '$0.00' }]
      case 'labor-create':
        return [
          { name: 'operationCode', label: chooseText(pt, 'Operation code', 'Código do serviço'), placeholder: '01A' },
          { name: 'soldHours', label: chooseText(pt, 'Sold hours', 'Horas vendidas'), inputMode: 'decimal' },
          { name: 'description', label: chooseText(pt, 'Description', 'Descrição'), wide: true },
        ]
      case 'labor-dispatch':
        return [{ name: 'technicianId', label: chooseText(pt, 'Technician', 'Mecânico responsável'), type: 'select', options: staff, placeholder: staff.length ? chooseText(pt, 'Select technician', 'Selecione um mecânico') : chooseText(pt, 'Loading staff', 'Carregando equipe') }]
      case 'labor-complete':
        return [{ name: 'actualMinutes', label: chooseText(pt, 'Actual minutes', 'Minutos trabalhados'), inputMode: 'numeric' }]
      case 'invoice':
        return [{ name: 'invoiceNumber', label: chooseText(pt, 'Invoice number', 'Número da nota fiscal') }]
      default:
        return []
    }
  }

  const changeFormValues = (values: Record<string, string>) => {
    setForm(current => {
      if (!current) return current
      const next = { ...values }
      if (current.kind === 'line') {
        if (next.itemType === 'part' && current.values.itemType !== 'part') void ensureParts()
        if (next.itemType !== 'part') { next.partId = ''; next.partNumber = '' }
        if (next.partId && next.partId !== current.values.partId) {
          const part = parts?.find(item => item.id === next.partId)
          if (part) {
            next.partNumber = part.partNumber || ''
            next.description = part.description || next.description
            next.unitPrice = formatCentsForInput(part.priceCents ?? 0, locale)
          }
        }
      }
      return { ...current, values: next }
    })
  }

  const validate = (state: FormState): { errors: Record<string, string>; data?: Record<string, unknown> } => {
    const values = state.values
    const errors: Record<string, string> = {}
    const text = (key: string) => (values[key] || '').trim()
    if (state.kind === 'evidence') {
      if (!text('concern')) errors.concern = chooseText(pt, 'Concern is required', 'Informe a reclamação do cliente')
      if (!text('cause')) errors.cause = chooseText(pt, 'Cause is required', 'Informe a causa identificada')
      if (!text('correction')) errors.correction = chooseText(pt, 'Correction is required', 'Informe o serviço realizado')
      if (!text('payType')) errors.payType = chooseText(pt, 'Choose a pay type', 'Selecione quem pagará o serviço')
      if (!text('authorizationStatus')) errors.authorizationStatus = chooseText(pt, 'Choose an authorization status', 'Selecione a situação da autorização')
      if (text('authorizationStatus') && text('authorizationStatus') !== 'pending' && !text('reference')) errors.reference = chooseText(pt, 'Reference is required once authorized or declined', 'Informe a referência da autorização ou recusa')
      if (text('reference').length > 200) errors.reference = chooseText(pt, 'At most 200 characters', 'Use até 200 caracteres')
      if (text('invoiceNumber').length > 100) errors.invoiceNumber = chooseText(pt, 'At most 100 characters', 'Use até 100 caracteres')
      return { errors, data: { concern: text('concern'), cause: text('cause'), correction: text('correction'), payType: text('payType'), authorizationStatus: text('authorizationStatus'), authorizationEvidence: { reference: text('reference'), channel: 'operator-recorded' }, invoiceNumber: text('invoiceNumber'), inspectionEvidence: [], declinedWork: [] } }
    }
    if (state.kind === 'line') {
      if (!['labor', 'part', 'sublet'].includes(text('itemType'))) errors.itemType = chooseText(pt, 'Choose a line type', 'Selecione o tipo do item')
      if (!text('description')) errors.description = chooseText(pt, 'Description is required', 'Informe a descrição')
      else if (text('description').length > 500) errors.description = chooseText(pt, 'At most 500 characters', 'Use até 500 caracteres')
      const quantity = parseQuantity(values.quantity || '')
      if (quantity === null) errors.quantity = chooseText(pt, 'Enter a quantity above 0, up to 10,000', 'Informe uma quantidade maior que zero e até 10.000')
      const unitPriceCents = text('unitPrice') ? parseDollarsToCents(values.unitPrice || '', locale) : null
      if (unitPriceCents === null) errors.unitPrice = chooseText(pt, 'Enter an amount like $125.00', 'Informe um valor como R$ 125,00')
      if (text('itemType') === 'part' && text('partNumber').length > 100) errors.partNumber = chooseText(pt, 'At most 100 characters', 'Use até 100 caracteres')
      return { errors, data: { itemType: text('itemType'), description: text('description'), partNumber: text('itemType') === 'part' ? text('partNumber') : '', quantity, unitPriceCents } }
    }
    if (state.kind === 'tax') {
      const taxCents = parseDollarsToCents(values.tax || '', locale)
      if (taxCents === null) errors.tax = chooseText(pt, 'Enter an amount like $42.50', 'Informe um valor como R$ 42,50')
      return { errors, data: { taxCents } }
    }
    if (state.kind === 'labor-create') {
      if (!text('operationCode')) errors.operationCode = chooseText(pt, 'Operation code is required', 'Informe o código do serviço')
      else if (text('operationCode').length > 80) errors.operationCode = chooseText(pt, 'At most 80 characters', 'Use até 80 caracteres')
      if (!text('description')) errors.description = chooseText(pt, 'Description is required', 'Informe a descrição')
      const soldHours = Number(text('soldHours'))
      if (!text('soldHours') || !Number.isFinite(soldHours) || soldHours < 0 || !/^\d*(\.\d{1,2})?$/.test(text('soldHours'))) errors.soldHours = chooseText(pt, 'Enter hours like 1.5', 'Informe as horas como 1,5')
      return { errors, data: { operationCode: text('operationCode'), description: text('description'), soldHours } }
    }
    if (state.kind === 'labor-dispatch') {
      if (!text('technicianId')) errors.technicianId = chooseText(pt, 'Choose a technician', 'Selecione o mecânico responsável')
      return { errors, data: { technicianId: text('technicianId') } }
    }
    if (state.kind === 'labor-complete') {
      const actualMinutes = parseWhole(values.actualMinutes || '')
      if (actualMinutes === null) errors.actualMinutes = chooseText(pt, 'Enter whole minutes', 'Informe os minutos em números inteiros')
      return { errors, data: { actualMinutes } }
    }
    if (state.kind === 'invoice') {
      if (!text('invoiceNumber')) errors.invoiceNumber = chooseText(pt, 'Invoice number is required', 'Informe o número da nota fiscal')
      else if (text('invoiceNumber').length > 100) errors.invoiceNumber = chooseText(pt, 'At most 100 characters', 'Use até 100 caracteres')
      return { errors, data: { invoiceNumber: text('invoiceNumber') } }
    }
    return { errors, data: {} }
  }

  const submitForm = async () => {
    if (!form) return
    const { errors, data = {} } = validate(form)
    if (Object.keys(errors).length) {
      setForm({ ...form, errors, formError: null })
      return
    }
    setForm({ ...form, errors: {}, formError: null })
    setBusy('form')
    const base = { serviceOrderId: order.id, idempotencyKey: form.key }
    const locked = { ...base, expectedUpdatedAt: order.updatedAt }
    let response: CommandResponse
    let success = chooseText(pt, 'Saved', 'Salvo')
    switch (form.kind) {
      case 'evidence':
        response = await recordServiceOrderEvidence({ ...locked, ...data })
        success = chooseText(pt, 'Repair evidence saved', 'Dados do serviço salvos')
        break
      case 'line':
        response = form.lineId
          ? await updateServiceOrderLineItem({ ...locked, lineItemId: form.lineId, ...data })
          : await addServiceOrderLineItem({ ...locked, ...data })
        success = form.lineId ? chooseText(pt, 'Line updated', 'Item atualizado') : chooseText(pt, 'Line added', 'Item adicionado')
        break
      case 'line-remove':
        response = await removeServiceOrderLineItem({ ...locked, lineItemId: form.lineId })
        success = chooseText(pt, 'Line removed', 'Item removido')
        break
      case 'tax':
        response = await setServiceOrderTax({ ...locked, ...data })
        success = chooseText(pt, 'Tax saved', 'Imposto salvo')
        break
      case 'labor-create':
        response = await manageLaborOperation({ ...base, action: 'create', ...data })
        success = chooseText(pt, 'Labor operation added', 'Serviço de mão de obra adicionado')
        break
      case 'labor-dispatch':
        response = await manageLaborOperation({ ...base, action: 'dispatch', operationId: form.operationId, ...data })
        success = chooseText(pt, 'Labor dispatched', 'Serviço designado ao mecânico')
        break
      case 'labor-complete':
        response = await manageLaborOperation({ ...base, action: 'complete', operationId: form.operationId, ...data })
        success = chooseText(pt, 'Labor completed', 'Serviço concluído')
        break
      case 'labor-cancel':
        response = await manageLaborOperation({ ...base, action: 'cancel', operationId: form.operationId })
        success = chooseText(pt, 'Labor cancelled', 'Serviço cancelado')
        break
      case 'invoice':
        response = await transition('invoiced', String(data.invoiceNumber))
        success = chooseText(pt, 'Invoiced', 'Faturado')
        break
      case 'confirm-transition':
        response = await transition(form.toStatus || '')
        success = serviceLabel(locale, ORDER_STATUS_LABELS[form.toStatus || ''] || (locale === 'pt-BR' ? 'Salvo' : 'Saved'))
        break
      default:
        response = { success: false, error: chooseText(pt, 'Unsupported action', 'Ação não suportada') }
    }
    setBusy(null)
    if (!response.success) {
      setForm(current => (current ? { ...current, formError: response.error || chooseText(pt, 'Unable to save', 'Não foi possível salvar') } : current))
      return
    }
    setForm(null)
    setNotice({ tone: 'ok', text: success })
    await reload()
  }

  const formExtra = (() => {
    if (!form) return null
    if (form.kind === 'line') {
      const quantity = parseQuantity(form.values.quantity || '')
      const unit = parseDollarsToCents(form.values.unitPrice || '', locale)
      return (
        <p className="flex items-baseline justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">{pt ? 'Total do item' : 'Line total'}</span>
          <span className="tabular-nums">{quantity !== null && unit !== null ? formatCents(Math.round(unit * quantity)) : '-'}</span>
        </p>
      )
    }
    if (form.kind === 'tax') {
      const suggested = taxRateBps ? Math.round((lineSubtotal * taxRateBps) / 10_000) : null
      return (
        <div className="space-y-2 border-t pt-3 text-sm">
          <p className="flex items-baseline justify-between"><span className="text-muted-foreground">{pt ? 'Subtotal dos itens' : 'Line subtotal'}</span><span className="tabular-nums">{formatCents(lineSubtotal)}</span></p>
          {suggested !== null && (
            <Track>
              <Pill size="sm" className="max-sm:h-11" onClick={() => changeFormValues({ ...form.values, tax: formatCentsForInput(suggested, locale) })}>
                {locale === 'pt-BR' ? 'Aplicar' : 'Apply'} {new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(taxRateBps! / 100)}% · {formatCents(suggested)}
              </Pill>
            </Track>
          )}
        </div>
      )
    }
    if (form.kind === 'line-remove') {
      const line = order.lineItems.find(item => item.id === form.lineId)
      return line ? <p className="text-sm">{line.description} · {formatCents(line.priceCents)}</p> : null
    }
    if (form.kind === 'confirm-transition' && form.toStatus === 'paid') {
      return <p className="text-sm">{formatCents(order.grandTotalCents)} · {pt ? 'líquido conciliado' : 'verified'} {formatCents(settledNetCents(order.payments || []))}</p>
    }
    return null
  })()

  const authTone = order.authorizationStatus === 'authorized' ? 'ok' : order.authorizationStatus === 'declined' ? 'bad' : 'warn'
  const rowButton = 'max-sm:h-10'
  const iconButton = 'w-7 max-sm:h-10 max-sm:w-10 px-0'

  const header = (
    <DeskHeader
      title={
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <span className="font-mono text-[20px] font-semibold tracking-tight">{reference}</span>
          <span className="min-w-0 break-words">{vehicle}</span>
        </span>
      }
      tone={STATUS_TONES[status] || 'idle'}
      status={serviceLabel(locale, ORDER_STATUS_LABELS[status] || status)}
      meta={
        <span className="flex flex-wrap items-baseline gap-x-2">
          <Status tone={STATUS_TONES[status] || 'idle'}>{serviceLabel(locale, ORDER_STATUS_LABELS[status] || status)}</Status>
          {name && <span>· {name}</span>}
          {order.rooftop?.name && <span>· {order.rooftop.name}</span>}
          <span>· {appointment?.assignedTech?.name || (pt ? 'Não atribuído' : 'Unassigned')}</span>
        </span>
      }
      actions={
        <>
          <Pill variant="plain" className="max-sm:h-11" onClick={reload} disabled={loading} aria-label={pt ? 'Atualizar' : 'Refresh'}>
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            {pt ? 'Atualizar' : 'Refresh'}
          </Pill>
          {nextStatus && (
            <Pill className="max-sm:h-11" variant="primary" disabled={Boolean(nextBlock) || Boolean(busy)} onClick={() => startTransition(nextStatus)}>
              {serviceLabel(locale, ORDER_ACTION_LABELS[nextStatus])}
            </Pill>
          )}
        </>
      }
    />
  )

  return (
    <PageContainer title={`${reference} ${vehicle}`} header={header} breadcrumbs={breadcrumbs(reference)}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {(notice || loadError || (nextStatus && nextBlock)) && (
          <div className="space-y-2">
            {notice && (
              <Notice tone={notice.tone}>
                <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                  <p className="min-w-0">{notice.text}</p>
                  <Pill size="sm" variant="plain" className="max-sm:h-11" onClick={() => setNotice(null)}>{pt ? 'Fechar' : 'Dismiss'}</Pill>
                </div>
              </Notice>
            )}
            {loadError && <Notice tone="bad">{loadError}</Notice>}
            {nextStatus && nextBlock && <Notice tone="warn">{serviceLabel(locale, ORDER_ACTION_LABELS[nextStatus])}: {nextBlock}</Notice>}
          </div>
        )}

        <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-8">
            <DeskSection
              title={pt ? 'Itens da ordem de serviço' : 'Line items'}
              count={order.lineItems.length}
              id="ro-lines"
              actions={
                <Pill size="sm" className="max-sm:h-11" disabled={!editable || Boolean(busy)} title={lockedReason || undefined} onClick={() => openLine()}>
                  <Plus />
                  Add line
                </Pill>
              }
            >
              {!editable && <p className="pb-2 text-xs text-muted-foreground">{lockedReason}</p>}
              {order.lineItems.length === 0 ? (
                <p className="rounded-md border border-dashed py-6 text-center text-[13px] text-muted-foreground">{pt ? 'Nenhum item nesta ordem de serviço' : 'No line items'}</p>
              ) : (
                <DeskTable aria-labelledby="ro-lines">
                  <thead>
                    <tr>
                      <Th priority={2}>{pt ? 'Tipo' : 'Type'}</Th>
                      <Th>{pt ? 'Descrição' : 'Description'}</Th>
                      <Th align="right" priority={2}>{pt ? 'Qtd.' : 'Qty'}</Th>
                      <Th align="right" priority={2}>{pt ? 'Unitário' : 'Unit'}</Th>
                      <Th align="right">{pt ? 'Valor' : 'Amount'}</Th>
                      {editable && <Th align="right"><span className="sr-only">{pt ? 'Ações' : 'Actions'}</span></Th>}
                    </tr>
                  </thead>
                  <tbody>
                    {order.lineItems.map(line => (
                      <Tr key={line.id}>
                        <Td priority={2} className="whitespace-nowrap text-muted-foreground">{serviceLabel(locale, LINE_TYPE_LABELS[line.itemType] || line.itemType)}</Td>
                        <Td className="min-w-0">
                          <p className="break-words font-medium">{line.description}</p>
                          {line.partNumber && <Code>#{line.partNumber}</Code>}
                          <p className="text-xs text-muted-foreground md:hidden">
                            {serviceLabel(locale, LINE_TYPE_LABELS[line.itemType] || line.itemType)} · {formatQuantity(line.quantity)} × {formatCents(line.unitPriceCents)}
                          </p>
                        </Td>
                        <Td align="right" priority={2}>{formatQuantity(line.quantity)}</Td>
                        <Td align="right" priority={2} className="whitespace-nowrap text-muted-foreground">{formatCents(line.unitPriceCents)}</Td>
                        <Td align="right" className="whitespace-nowrap font-medium">{formatCents(line.priceCents)}</Td>
                        {editable && (
                          <Td align="right" className="w-[1%] whitespace-nowrap">
                            <div className="flex justify-end gap-0.5">
                              <Pill size="sm" variant="plain" className={iconButton} aria-label={`Edit ${line.description}`} disabled={Boolean(busy)} onClick={() => openLine(line)}>
                                <Pencil />
                              </Pill>
                              <Pill size="sm" variant="plain" className={iconButton} aria-label={`Remove ${line.description}`} disabled={Boolean(busy)} onClick={() => openForm({ kind: 'line-remove', title: 'Remove line', lineId: line.id, submitLabel: 'Remove line', variant: 'danger', values: {} })}>
                                <Trash2 />
                              </Pill>
                            </div>
                          </Td>
                        )}
                      </Tr>
                    ))}
                  </tbody>
                </DeskTable>
              )}
            </DeskSection>

            <DeskSection
              title={pt ? 'Mão de obra' : 'Labor operations'}
              count={order.laborOperations.length}
              id="ro-labor"
              actions={
                <Pill size="sm" className="max-sm:h-11" disabled={!editable || Boolean(busy)} title={lockedReason || undefined} onClick={() => openForm({ kind: 'labor-create', title: pt ? 'Adicionar serviço de mão de obra' : 'Add labor operation', submitLabel: pt ? 'Adicionar serviço' : 'Add operation', values: { operationCode: '', description: '', soldHours: '' } })}>
                  <Plus />
                  Add operation
                </Pill>
              }
            >
              {order.laborOperations.length === 0 ? (
                <p className="rounded-md border border-dashed py-6 text-center text-[13px] text-muted-foreground">{pt ? 'Nenhum serviço de mão de obra cadastrado' : 'No labor operations'}</p>
              ) : (
                <DeskTable aria-labelledby="ro-labor">
                  <thead>
                    <tr>
                      <Th>{pt ? 'Op.' : 'Op'}</Th>
                      <Th>{pt ? 'Descrição' : 'Description'}</Th>
                      <Th priority={3}>{pt ? 'Mecânico' : 'Tech'}</Th>
                      <Th priority={2}>{pt ? 'Situação' : 'Status'}</Th>
                      <Th align="right" priority={2}>{pt ? 'Horas vendidas' : 'Sold h'}</Th>
                      <Th align="right" priority={3}>{pt ? 'Minutos realizados' : 'Actual min'}</Th>
                      <Th align="right"><span className="sr-only">{pt ? 'Ações' : 'Actions'}</span></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.laborOperations.map(operation => {
                      const actions = laborActions(order, operation.status)
                      const blocked = actions.find(item => item.blocked)?.blocked
                      const label = serviceLabel(locale, LABOR_STATUS_LABELS[operation.status] || operation.status)
                      return (
                        <Tr key={operation.id}>
                          <Td className="whitespace-nowrap"><Code className="text-foreground">{operation.operationCode}</Code></Td>
                          <Td className="min-w-0">
                            <p className="break-words">{operation.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {[
                                operation.startedAt ? `Started ${formatDateTime(operation.startedAt, timeZone)}` : null,
                                operation.completedAt ? `Done ${formatDateTime(operation.completedAt, timeZone)}` : null,
                              ].filter(Boolean).join(' · ')}
                            </p>
                            <div className="mt-1 md:hidden"><Status tone={LABOR_TONES[operation.status] || 'idle'}>{label}</Status></div>
                            {blocked && <p className="text-xs text-muted-foreground">{blocked}</p>}
                          </Td>
                          <Td priority={3} className="whitespace-nowrap text-muted-foreground">{operation.technician?.name || 'Unassigned'}</Td>
                          <Td priority={2}><Status tone={LABOR_TONES[operation.status] || 'idle'}>{label}</Status></Td>
                          <Td align="right" priority={2}>{operation.soldHours ?? 0}</Td>
                          <Td align="right" priority={3} className="text-muted-foreground">{operation.actualMinutes ?? '—'}</Td>
                          <Td align="right">
                            {actions.length > 0 && (
                              <div className="flex flex-wrap justify-end gap-1.5">
                                {actions.map(({ action, blocked: reason }) => (
                                  <Pill key={action} size="sm" className={rowButton} disabled={Boolean(reason) || Boolean(busy)} title={reason || undefined} onClick={() => laborAction(operation, action)}>
                                    {serviceLabel(locale, LABOR_ACTION_LABELS[action])}
                                  </Pill>
                                ))}
                              </div>
                            )}
                          </Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </DeskTable>
              )}
            </DeskSection>

            <DeskSection
              title={pt ? 'Totais' : 'Totals'}
              id="ro-totals"
              actions={
                <Pill size="sm" className="max-sm:h-11" disabled={!editable || Boolean(busy)} title={lockedReason || undefined} onClick={() => openForm({ kind: 'tax', title: pt ? 'Definir imposto' : 'Set tax', submitLabel: pt ? 'Salvar imposto' : 'Save tax', values: { tax: formatCentsForInput(order.taxCents ?? 0, locale) } })}>
                  Set tax
                </Pill>
              }
            >
              {totals && !totals.matches && (
            <Notice tone="warn" className="mb-3">
                  <div className="min-w-0">
                    <p className="font-medium">{chooseText(pt, "Totals don't match line items", 'Os totais não correspondem aos itens da ordem')}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {chooseText(pt, 'Lines', 'Itens')}: {chooseText(pt, 'Labor', 'Mão de obra')} {formatCents(totals.lineLaborCents)} · {chooseText(pt, 'Parts', 'Peças')} {formatCents(totals.linePartsCents)}
                    </p>
                  </div>
                </Notice>
              )}
              <DeskTable aria-labelledby="ro-totals">
                <thead>
                  <tr>
                    <Th><span className="sr-only">{pt ? 'Valor total' : 'Total'}</span></Th>
                    <Th align="right">{pt ? 'Itens' : 'Lines'}</Th>
                    <Th align="right">{pt ? 'Registrado' : 'Recorded'}</Th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    [chooseText(pt, 'Labor and sublet', 'Mão de obra e serviços terceirizados'), totals?.lineLaborCents ?? 0, order.laborTotalCents ?? 0],
                    [chooseText(pt, 'Parts', 'Peças'), totals?.linePartsCents ?? 0, order.partsTotalCents ?? 0],
                    [chooseText(pt, 'Tax', 'Imposto'), order.taxCents ?? 0, order.taxCents ?? 0],
                  ] as const).map(([label, line, recorded]) => (
                    <Tr key={label}>
                      <Td className="text-muted-foreground">{label}</Td>
                      <Td align="right" className="text-muted-foreground">{formatCents(line)}</Td>
                      <Td align="right" className={line !== recorded ? 'font-medium text-amber-700 dark:text-amber-300' : undefined}>
                        {formatCents(recorded)}
                        {line !== recorded && <span className="sr-only"> (differs from lines)</span>}
                      </Td>
                    </Tr>
                  ))}
                  <tr className="border-t border-foreground/20">
                    <Td className="font-semibold">{pt ? 'Total' : 'Total'}</Td>
                    <Td align="right" className="text-muted-foreground">{formatCents(lineSubtotal + (order.taxCents ?? 0))}</Td>
                    <Td align="right"><Figure size="md">{formatCents(order.grandTotalCents)}</Figure></Td>
                  </tr>
                </tbody>
              </DeskTable>
            </DeskSection>

            {order.partsMovements.length > 0 && (
              <DeskSection title={pt ? 'Movimentações de peças' : 'Parts movements'} count={order.partsMovements.length} id="ro-movements">
                <DeskTable aria-labelledby="ro-movements">
                  <thead>
                    <tr>
                      <Th>{pt ? 'Peça' : 'Part'}</Th>
                      <Th priority={2}>{pt ? 'Tipo' : 'Type'}</Th>
                      <Th priority={3}>{pt ? 'Referência' : 'Reference'}</Th>
                      <Th priority={2}>{pt ? 'Data' : 'When'}</Th>
                      <Th align="right">{pt ? 'Qtd.' : 'Qty'}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.partsMovements.map(movement => (
                      <Tr key={movement.id}>
                        <Td className="min-w-0">
                          <p className="break-words font-medium">{movement.part?.description || movement.part?.partNumber || 'Part'}</p>
                          {movement.part?.partNumber && <Code>#{movement.part.partNumber}</Code>}
                        </Td>
                        <Td priority={2} className="capitalize text-muted-foreground">{movement.movementType}</Td>
                        <Td priority={3} className="text-muted-foreground">{movement.reference}</Td>
                        <Td priority={2} className="whitespace-nowrap text-muted-foreground">{formatDateTime(movement.occurredAt, timeZone)}</Td>
                        <Td align="right" className="font-medium">{movement.quantityDelta > 0 ? '+' : ''}{movement.quantityDelta}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </DeskTable>
              </DeskSection>
            )}
          </div>

          <div className="min-w-0 space-y-8">
            <DeskSection title={pt ? 'Resumo' : 'Summary'}>
              <Facts
                items={[
                  { label: 'Total', value: <Figure size="md">{formatCents(order.grandTotalCents)}</Figure> },
                  { label: chooseText(pt, 'Tax', 'Imposto'), value: <span className="tabular-nums">{formatCents(order.taxCents)}</span> },
                  { label: chooseText(pt, 'Line sum', 'Subtotal dos itens'), value: <span className="tabular-nums">{formatCents(lineSubtotal)} · {order.lineItems.length} {chooseText(pt, order.lineItems.length === 1 ? 'line' : 'lines', order.lineItems.length === 1 ? 'item' : 'itens')}</span> },
                  { label: chooseText(pt, 'Labor ops closed', 'Serviços concluídos'), value: <span className="tabular-nums">{order.laborOperations.length - openOps} {chooseText(pt, 'of', 'de')} {order.laborOperations.length}</span> },
                  { label: chooseText(pt, 'Authorization', 'Autorização'), value: <Status tone={authTone} className="capitalize">{serviceLabel(locale, order.authorizationStatus || 'pending')}</Status> },
                ]}
              />
            </DeskSection>

            <DeskSection
              title={pt ? 'Autorização e reparo' : 'Authorization and repair'}
              actions={
                <Pill
                  size="sm"
                  className="max-sm:h-11"
                  disabled={!editable || Boolean(busy)}
                  title={lockedReason || undefined}
                  onClick={() => openForm({
                    kind: 'evidence',
                    title: chooseText(pt, 'Concern, cause, correction', 'Reclamação, causa e serviço realizado'),
                    submitLabel: chooseText(pt, 'Save', 'Salvar'),
                    values: {
                      concern: order.concern || appointment?.description || '',
                      cause: order.cause || '',
                      correction: order.correction || '',
                      payType: order.payType || 'customer',
                      authorizationStatus: order.authorizationStatus || 'pending',
                      reference: order.authorizationEvidence?.reference || '',
                      invoiceNumber: order.invoiceNumber || '',
                    },
                  })}
                >
                  <Pencil />
                  {chooseText(pt, 'Edit', 'Editar')}
                </Pill>
              }
            >
              <Facts
                items={[
                  order.authorizationEvidence?.reference ? { label: chooseText(pt, 'Reference', 'Referência'), value: order.authorizationEvidence.reference, mono: true } : null,
                  { label: chooseText(pt, 'Pay type', 'Responsável pelo pagamento'), value: <span className="capitalize">{serviceLabel(locale, PAY_TYPES.find(item => item.value === (order.payType || 'customer'))?.en || order.payType || 'customer')}</span> },
                  { label: chooseText(pt, 'Concern', 'Reclamação do cliente'), value: order.concern || '-' },
                  { label: chooseText(pt, 'Cause', 'Causa'), value: order.cause || '-' },
                  { label: chooseText(pt, 'Correction', 'Serviço realizado'), value: order.correction || '-' },
                  { label: chooseText(pt, 'Invoice', 'Nota fiscal'), value: order.invoiceNumber || '-', mono: Boolean(order.invoiceNumber) },
                  order.completedAt ? { label: chooseText(pt, 'Completed', 'Concluído em'), value: formatDateTime(order.completedAt, timeZone) } : null,
                  order.settledAt ? { label: chooseText(pt, 'Paid', 'Pago em'), value: formatDateTime(order.settledAt, timeZone) } : null,
                ]}
              />
            </DeskSection>

            <DeskSection title={pt ? 'Cliente e veículo' : 'Customer and vehicle'}>
              <Facts
                items={[
                  { label: chooseText(pt, 'Customer', 'Cliente'), value: lead ? <Link className="hover:underline" href={`${basePath}/platform/crm/${lead.id}`}>{name}</Link> : chooseText(pt, 'Not linked', 'Não vinculado') },
                  lead?.phone ? { label: chooseText(pt, 'Phone', 'Telefone'), value: <a className="hover:underline" href={`tel:${lead.phone}`}>{formatPhone(lead.phone)}</a>, mono: true } : null,
                  lead?.email ? { label: 'Email', value: lead.email } : null,
                  { label: chooseText(pt, 'Vehicle', 'Veículo'), value: vehicle },
                  appointment?.vehicleVin ? { label: pt ? 'Chassi (VIN)' : 'VIN', value: appointment.vehicleVin, mono: true } : null,
                  appointment?.mileageIn != null ? { label: locale === 'pt-BR' ? 'Quilometragem de entrada' : 'Mileage in', value: formatMileage(appointment.mileageIn, locale), mono: true } : null,
                  appointment?.transportationNeed && appointment.transportationNeed !== 'none' ? { label: chooseText(pt, 'Transportation', 'Transporte'), value: <span className="capitalize">{serviceLabel(locale, appointment.transportationNeed === 'waiter' ? 'Waiter' : appointment.transportationNeed === 'drop-off' ? 'Drop-off' : appointment.transportationNeed.charAt(0).toUpperCase() + appointment.transportationNeed.slice(1))}</span> } : null,
                ]}
              />
            </DeskSection>

            <DeskSection
              title={pt ? 'Agendamento' : 'Appointment'}
              actions={appointment ? (
                <Pill size="sm" variant="plain" className="max-sm:h-11" asChild>
                  <Link href={`${basePath}/platform/service/appointments/${appointment.id}`}>{pt ? 'Abrir' : 'Open'}</Link>
                </Pill>
              ) : undefined}
            >
              {appointment ? (
                <Facts
                  items={[
                    { label: 'Status', value: <Status tone={STATUS_TONES[appointment.status || ''] || 'idle'}>{serviceLabel(locale, APPOINTMENT_STATUS_LABELS[appointment.status || ''] || appointment.status || '')}</Status> },
                    { label: chooseText(pt, 'Date', 'Data'), value: formatDateTime(appointment.appointmentDate, timeZone) },
                    { label: chooseText(pt, 'Service', 'Serviço'), value: <span className="capitalize">{appointment.servicePackage?.name || serviceLabel(locale, appointment.serviceType || 'Service')}</span> },
                    appointment.description ? { label: chooseText(pt, 'Request', 'Solicitação'), value: appointment.description } : null,
                    appointment.advisorNotes ? { label: chooseText(pt, 'Advisor notes', 'Observações do consultor'), value: appointment.advisorNotes } : null,
                  ]}
                />
              ) : (
                <p className="py-3 text-[13px] text-muted-foreground">{pt ? 'Nenhum agendamento vinculado' : 'No appointment'}</p>
              )}
            </DeskSection>

            <DeskSection
              title={pt ? 'Pagamentos' : 'Payments'}
              count={order.payments?.length}
              actions={
                <Pill size="sm" variant="plain" className="max-sm:h-11" asChild>
                  <Link href={`${basePath}/platform/payments`}>{pt ? 'Pagamentos' : 'Payments'}</Link>
                </Pill>
              }
            >
              {order.payments === null ? (
                <p className="py-3 text-[13px] text-muted-foreground">{pt ? 'É necessária permissão para consultar relatórios' : 'Requires reporting permission'}</p>
              ) : order.payments.length === 0 ? (
                <p className="py-3 text-[13px] text-muted-foreground">{pt ? 'Nenhum pagamento' : 'No payments'}</p>
              ) : (
                <>
                  <ul className="divide-y text-[13px]">
                    {order.payments.map(payment => (
                      <li key={payment.id} className="flex min-w-0 items-start justify-between gap-4 py-2.5">
                        <div className="min-w-0">
                          <Status tone={['captured', 'partially-refunded'].includes(payment.status) && payment.providerTransactionId ? 'ok' : payment.status === 'failed' ? 'bad' : 'idle'}>
                            {(pt ? PAYMENT_LABELS_PT : PAYMENT_LABELS)[payment.status] || payment.status}
                          </Status>
                          <p className="pl-3.5 text-xs text-muted-foreground">{payment.providerKey} · {formatDateTime(payment.createdAt, timeZone, '-')}</p>
                        </div>
                        <div className="shrink-0 text-right tabular-nums">
                          <p className="font-medium">{formatCents(payment.capturedCents)}</p>
                          {payment.refundedCents > 0 && <p className="text-xs text-muted-foreground">-{formatCents(payment.refundedCents)}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="flex items-baseline justify-between border-t pt-2 text-[13px]">
                    <span className="text-muted-foreground">{pt ? 'Líquido conciliado' : 'Verified net'}</span>
                    <span className="tabular-nums">{formatCents(settledNetCents(order.payments))} {chooseText(pt, 'of', 'de')} {formatCents(order.grandTotalCents)}</span>
                  </p>
                </>
              )}
            </DeskSection>
          </div>
        </div>

        <ServiceFormDialog
          open={Boolean(form)}
          title={form?.title || ''}
          fields={form ? formFields(form) : []}
          values={form?.values || {}}
          errors={form?.errors || {}}
          formError={form?.formError}
          busy={busy === 'form'}
          submitLabel={form?.submitLabel}
          submitVariant={form?.variant}
          extra={formExtra}
          onValuesChange={changeFormValues}
          onSubmit={submitForm}
          onOpenChange={open => { if (!open) setForm(null) }}
        />
      </div>
    </PageContainer>
  )
}
