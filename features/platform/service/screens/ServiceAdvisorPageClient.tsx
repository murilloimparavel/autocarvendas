'use client'

import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useLocale } from '@/features/i18n/LocaleProvider'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, RefreshCw, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { OperatorActionDialog } from '@/features/platform/components/OperatorActionDialog'
import {
  Attention,
  Code,
  DeskHeader,
  DeskSection,
  DeskTable,
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
import { dayKey, formatPhone, countLabel } from '@/features/platform/lib/format'
import { bookServiceAppointment, getFixedOpsWorkspace, openServiceOrder, transitionServiceAppointment } from '../actions'
import { createAttemptKeys } from '../lib/attemptKeys'
import { formatAge, formatCents as formatCentsBase, formatDateTime as formatDateTimeBase, formatTime as formatTimeBase } from '../lib/serviceFormat'
import {
  APPOINTMENT_ACTION_LABELS,
  APPOINTMENT_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  STATUS_TONES,
  appointmentTransitions,
  customerName,
  roReference,
  serviceLabel,
} from '../lib/serviceStatus'
import { EMPTY_BOOKING, bookingFields, repairOrderTotalsCheck, splitLocalDateTime } from '../lib/serviceTasks'
import type { FixedOpsAppointment, FixedOpsOrder, FixedOpsPart, FixedOpsWorkspace } from '../lib/types'

const appointmentFilters = [
  { value: 'open', label: 'Open' },
  { value: 'today', label: 'Today' },
  { value: 'waiting-parts', label: 'Waiting parts' },
  { value: 'all', label: 'All' },
]

const orderFilters = ['all', ...ORDER_STATUSES] as const

/** What a repair order is waiting on, from its own status and its appointment's status. */
type WaitReason = 'parts' | 'approval' | 'pickup'
const WAIT_LABELS: Record<WaitReason, string> = { parts: 'Parts', approval: 'Approval', pickup: 'Pickup' }
const WAIT_TONES: Record<WaitReason, DeskTone> = { parts: 'warn', approval: 'info', pickup: 'ok' }

function waitReason(order: FixedOpsOrder, appointment: FixedOpsAppointment | undefined): WaitReason | null {
  const status = order.status || 'estimate'
  if (appointment?.status === 'waiting-parts' && ['estimate', 'approved', 'in-progress'].includes(status)) return 'parts'
  if (status === 'estimate') return 'approval'
  if (status === 'completed' || status === 'invoiced') return 'pickup'
  return null
}

function isToday(value: string | null, timeZone: string) {
  if (!value) return false
  return dayKey(value, timeZone) === dayKey(Date.now(), timeZone)
}

/** Waiting since before today: carried over from a previous day. */
function carriedOver(value: string | null | undefined, timeZone: string) {
  if (!value) return false
  return dayKey(value, timeZone) < dayKey(Date.now(), timeZone)
}

const ROW_BUTTON = 'max-sm:h-10'

function Empty({ label, onReset }: { label: string; onReset?: () => void }) {
  const { locale } = useLocale()
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed py-8 text-center text-[13px] text-muted-foreground">
      <p>{label}</p>
      {onReset && (
        <Pill size="sm" className={ROW_BUTTON} onClick={onReset}>{locale === 'pt-BR' ? 'Limpar filtros' : 'Reset filters'}</Pill>
      )}
    </div>
  )
}

export function ServiceAdvisorPageClient({
  initialWorkspace,
  initialError,
  timeZone,
  currencyCode,
}: {
  initialWorkspace: FixedOpsWorkspace | null
  initialError: string | null
  timeZone: string
  currencyCode: string
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const formatCents = (value: number | null | undefined) => formatCentsBase(value, currencyCode, locale)
  const formatDateTime = (value: string | null | undefined, zone: string, empty?: string) => formatDateTimeBase(value, zone, empty, locale)
  const formatTime = (value: string | null | undefined, zone: string, empty?: string) => formatTimeBase(value, zone, empty, locale)
  const router = useRouter()
  const [workspace, setWorkspace] = useState<FixedOpsWorkspace | null>(initialWorkspace)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [appointmentFilter, setAppointmentFilter] = useState('open')
  const [orderFilter, setOrderFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [sortOrder, setSortOrder] = useState('appointment')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [booking, setBooking] = useState<{ values: Record<string, string>; idempotencyKey: string } | null>(null)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [bookingBusy, setBookingBusy] = useState(false)
  // Clock for ages and lateness; advances on each refresh.
  const [now, setNow] = useState(() => Date.now())
  const attemptKeys = useRef(createAttemptKeys('service-appointment')).current

  const appointments: FixedOpsAppointment[] = useMemo(() => workspace?.appointments || [], [workspace])
  const orders: FixedOpsOrder[] = useMemo(() => workspace?.orders || [], [workspace])
  const parts: FixedOpsPart[] = workspace?.parts || []
  const serviceRooftops = workspace?.serviceRooftops || []

  const loadServiceData = async () => {
    setLoading(true)
    const response = await getFixedOpsWorkspace()
    if (response.success && response.data) {
      setWorkspace(response.data.fixedOpsWorkspace)
      setError(null)
    } else {
      setError(response.error || (pt ? 'Não foi possível carregar a oficina.' : 'Unable to load service.'))
    }
    setNow(Date.now())
    setLoading(false)
  }

  const openBooking = () => {
    setBookingError(null)
    setBooking({ values: { ...EMPTY_BOOKING }, idempotencyKey: `desk-service:${crypto.randomUUID()}` })
  }
  const submitBooking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!booking) return
    setBookingBusy(true)
    setBookingError(null)
    try {
      const values = booking.values
      const { date, time } = splitLocalDateTime(values.appointmentAt || '')
      const response = await bookServiceAppointment({
        customerName: values.customerName.trim(),
        customerEmail: values.customerEmail.trim(),
        customerPhone: values.customerPhone.trim(),
        appointmentDate: date,
        appointmentTime: time,
        serviceType: values.serviceType,
        vehicleYear: Number(values.vehicleYear),
        vehicleMake: values.vehicleMake.trim(),
        vehicleModel: values.vehicleModel.trim(),
        description: values.description.trim() || undefined,
        idempotencyKey: booking.idempotencyKey,
      })
      if (!response.success) throw new Error(response.error)
      setBooking(null)
      setNotice({ tone: 'ok', text: pt ? 'Agendamento criado.' : 'Appointment booked' })
      await loadServiceData()
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : (pt ? 'Não foi possível criar o agendamento.' : 'Unable to book appointment'))
    } finally {
      setBookingBusy(false)
    }
  }

  const updateAppointmentStatus = async (appointmentId: string, status: string) => {
    const scope = `${appointmentId}:${status}`
    setUpdatingId(appointmentId)
    const response = await transitionServiceAppointment({ id: appointmentId, toStatus: status, idempotencyKey: attemptKeys.key(scope) })
    attemptKeys.settle(scope, response)
    setNotice(response.success ? { tone: 'ok', text: serviceLabel(locale, APPOINTMENT_STATUS_LABELS[status] || (pt ? 'Salvo' : 'Saved')) } : { tone: 'bad', text: `${pt ? 'Não foi possível atualizar o agendamento' : 'Unable to update appointment'}: ${response.error}` })
    await loadServiceData()
    setUpdatingId(null)
  }

  const createRepairOrder = async (appointment: FixedOpsAppointment) => {
    setUpdatingId(appointment.id)
    const response = await openServiceOrder({
      appointmentId: appointment.id,
      // One RO per appointment, so the appointment id makes the key replay-safe.
      idempotencyKey: `service-order:${appointment.id}`,
      diagnosis: appointment.description || '',
      laborTotalCents: 0,
      partsTotalCents: 0,
      taxCents: 0,
      grandTotalCents: 0,
    })
    if (!response.success) {
      setNotice({ tone: 'bad', text: `${pt ? 'Não foi possível abrir a ordem de serviço' : 'Unable to open repair order'}: ${response.error}` })
      setUpdatingId(null)
      return
    }
    if (appointment.status === 'scheduled') {
      const scope = `${appointment.id}:checked-in`
      const checkIn = await transitionServiceAppointment({ id: appointment.id, toStatus: 'checked-in', idempotencyKey: attemptKeys.key(scope) })
      attemptKeys.settle(scope, checkIn)
    }
    router.push(`${basePath}/platform/service/orders/${response.data.openServiceOrder.id}`)
  }

  const term = search.trim().toLowerCase()
  const filteredAppointments = useMemo(() => {
    const queued = appointmentFilter === 'today' ? appointments.filter(item => isToday(item.appointmentDate, timeZone))
      : appointmentFilter === 'open' ? appointments.filter(item => !['completed', 'cancelled'].includes(item.status || ''))
        : appointmentFilter === 'waiting-parts' ? appointments.filter(item => item.status === 'waiting-parts')
          : appointments
    return queued
      .filter(item => !term || `${item.customerVehicleDescription || ''} ${item.description || ''} ${item.lead?.firstName || ''} ${item.lead?.lastName || ''} ${item.lead?.phone || ''}`.toLowerCase().includes(term))
      .sort((a, b) => sortOrder === 'recent'
        ? new Date(b.appointmentDate || 0).getTime() - new Date(a.appointmentDate || 0).getTime()
        : new Date(a.appointmentDate || '9999-12-31').getTime() - new Date(b.appointmentDate || '9999-12-31').getTime())
  }, [appointments, appointmentFilter, term, sortOrder, timeZone])

  const appointmentByOrder = useMemo(() => new Map(appointments.filter(item => item.serviceOrder).map(item => [item.serviceOrder!.id, item])), [appointments])
  const visibleOrders = useMemo(() => orders.filter(order => {
    const lead = appointmentByOrder.get(order.id)?.lead
    return !term || `${order.id} ${roReference(order.id)} ${order.invoiceNumber || ''} ${order.appointment?.customerVehicleDescription || ''} ${order.concern || ''} ${lead?.firstName || ''} ${lead?.lastName || ''}`.toLowerCase().includes(term)
  }), [orders, term, appointmentByOrder])

  // Today's lane: every appointment on today's calendar, in time order.
  const todaysLane = useMemo(
    () => appointments
      .filter(item => isToday(item.appointmentDate, timeZone) && item.status !== 'cancelled')
      .sort((a, b) => new Date(a.appointmentDate || 0).getTime() - new Date(b.appointmentDate || 0).getTime()),
    [appointments, timeZone],
  )

  // ROs waiting on parts, approval or pickup, oldest first by last update.
  const waitingOrders = useMemo(
    () => orders
      .map(order => ({ order, appointment: appointmentByOrder.get(order.id), reason: waitReason(order, appointmentByOrder.get(order.id)) }))
      .filter((row): row is { order: FixedOpsOrder; appointment: FixedOpsAppointment | undefined; reason: WaitReason } => row.reason !== null)
      .sort((a, b) => new Date(a.order.updatedAt).getTime() - new Date(b.order.updatedAt).getTime()),
    [orders, appointmentByOrder],
  )

  const resetFilters = () => {
    setSearch('')
    setAppointmentFilter('open')
    setOrderFilter('all')
  }

  const breadcrumbs = [
    { type: 'link' as const, label: pt ? 'Painel' : 'Dashboard', href: basePath },
    { type: 'page' as const, label: pt ? 'Plataforma' : 'Platform' },
    { type: 'page' as const, label: pt ? 'Oficina' : 'Service' },
  ]

  const orderCounts: Record<string, number> = { all: visibleOrders.length }
  for (const order of visibleOrders) orderCounts[order.status || ''] = (orderCounts[order.status || ''] || 0) + 1
  const shownOrders = orderFilter === 'all' ? visibleOrders : visibleOrders.filter(order => order.status === orderFilter)

  const appointmentCounts: Record<string, number> = {
    open: appointments.filter(item => !['completed', 'cancelled'].includes(item.status || '')).length,
    today: appointments.filter(item => isToday(item.appointmentDate, timeZone)).length,
    'waiting-parts': appointments.filter(item => item.status === 'waiting-parts').length,
    all: appointments.length,
  }
  const workingOrders = orders.filter(order => ['estimate', 'approved', 'in-progress', 'completed'].includes(order.status || ''))
  const workingValue = workingOrders.reduce((sum, order) => sum + (order.grandTotalCents || 0), 0)
  const lowParts = parts.filter(part => (part.minimumQuantity ?? 0) > 0 && (part.quantity ?? 0) <= (part.minimumQuantity ?? 0))

  const header = (
    <DeskHeader
      title={pt ? 'Oficina' : 'Service'}
      tone={error ? 'bad' : appointmentCounts['waiting-parts'] > 0 ? 'warn' : 'ok'}
      status={error ? (pt ? 'Indisponível' : 'Unavailable') : `${appointmentCounts['waiting-parts']} ${pt ? 'aguardando peças' : 'waiting parts'}`}
      meta={error ? (pt ? 'Indisponível' : 'Unavailable') : pt ? `${appointmentCounts.today} ${appointmentCounts.today === 1 ? 'agendamento hoje' : 'agendamentos hoje'} · ${waitingOrders.length} ${waitingOrders.length === 1 ? 'ordem aguardando' : 'ordens aguardando'} · ${workingOrders.length} ${workingOrders.length === 1 ? 'ordem em aberto' : 'ordens em aberto'}` : `${countLabel(appointmentCounts.today, 'appointment')} today · ${countLabel(waitingOrders.length, 'RO')} waiting · ${countLabel(workingOrders.length, 'open RO')}`}
      actions={
        <>
          <Pill variant="plain" className="max-sm:h-11" onClick={loadServiceData} disabled={loading} aria-label={pt ? 'Atualizar' : 'Refresh'}>
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            {pt ? 'Atualizar' : 'Refresh'}
          </Pill>
          <Pill className="max-sm:h-11" variant="primary" onClick={openBooking} disabled={!serviceRooftops.length} title={serviceRooftops.length ? undefined : (pt ? 'Nenhuma oficina ativa cadastrada' : 'No active service locations')}>
            <Plus />
            {pt ? 'Novo agendamento' : 'New appointment'}
          </Pill>
        </>
      }
    />
  )

  if (error && !workspace) {
    return (
      <PageContainer title={pt ? 'Oficina' : 'Service'} header={header} breadcrumbs={breadcrumbs}>
        <div className="space-y-3 px-4 pb-24 md:px-6">
          <Notice tone="bad">
            <p className="font-medium">{pt ? 'Oficina indisponível' : 'Service is unavailable'}</p>
            <p className="mt-0.5 text-muted-foreground">{error}</p>
          </Notice>
          <Track>
            <Pill className="max-sm:h-11" onClick={loadServiceData} disabled={loading}>{pt ? 'Tentar novamente' : 'Retry'}</Pill>
          </Track>
        </div>
      </PageContainer>
    )
  }

  const appointmentActions = (appointment: FixedOpsAppointment) => {
    const status = appointment.status || 'scheduled'
    const transitions = appointmentTransitions(status).filter(next => next !== 'cancelled')
    const closed = ['completed', 'cancelled'].includes(status)
    const busy = updatingId === appointment.id
    if (!(!appointment.serviceOrder && !closed) && transitions.length === 0) return null
    return (
      <div className="flex flex-wrap justify-end gap-1.5">
        {!appointment.serviceOrder && !closed && (
          <Pill size="sm" variant="primary" className={ROW_BUTTON} onClick={() => createRepairOrder(appointment)} disabled={busy}>
          {pt ? 'Abrir ordem de serviço' : 'Open RO'}
          </Pill>
        )}
        {transitions.map(next => (
          <Pill key={next} size="sm" className={ROW_BUTTON} onClick={() => updateAppointmentStatus(appointment.id, next)} disabled={busy}>
            {serviceLabel(locale, APPOINTMENT_ACTION_LABELS[next])}
          </Pill>
        ))}
      </div>
    )
  }

  const appointmentHref = (appointment: FixedOpsAppointment) => `${basePath}/platform/service/appointments/${appointment.id}`
  const orderHref = (order: { id: string }) => `${basePath}/platform/service/orders/${order.id}`

  return (
    <PageContainer title={pt ? 'Oficina' : 'Service'} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {(notice || error || !serviceRooftops.length) && (
          <div className="space-y-2">
            {notice && (
              <Notice tone={notice.tone}>
                <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                  <p className="min-w-0">{notice.text}</p>
                  <Pill size="sm" variant="plain" className="max-sm:h-11" onClick={() => setNotice(null)}>{pt ? 'Fechar' : 'Dismiss'}</Pill>
                </div>
              </Notice>
            )}
            {error && <Notice tone="bad">{error}</Notice>}
            {!serviceRooftops.length && <Notice tone="warn">{pt ? 'Nenhuma oficina ativa cadastrada' : 'No active service locations'}</Notice>}
          </div>
        )}

        <DeskSection title={pt ? 'Agenda de hoje' : "Today's lane"} count={todaysLane.length} id="service-today">
          {todaysLane.length === 0 ? (
            <Empty label={pt ? 'Nenhum agendamento para hoje' : 'No appointments today'} />
          ) : (
            <DeskTable aria-labelledby="service-today">
              <thead>
                <tr>
                  <Th>{pt ? 'Horário' : 'Time'}</Th>
                  <Th>{pt ? 'Cliente' : 'Customer'}</Th>
                  <Th priority={2}>{pt ? 'Veículo' : 'Vehicle'}</Th>
                  <Th priority={3}>{pt ? 'Solicitação' : 'Concern'}</Th>
                  <Th priority={3}>{pt ? 'Mecânico' : 'Tech'}</Th>
                  <Th>{pt ? 'Situação' : 'Status'}</Th>
                  <Th align="right" priority={2}><span className="sr-only">{pt ? 'Ações' : 'Actions'}</span></Th>
                </tr>
              </thead>
              <tbody>
                {todaysLane.map(appointment => {
                  const status = appointment.status || 'scheduled'
                  const name = customerName(appointment.lead)
                  // Past its time and still not checked in.
                  const late = status === 'scheduled' && new Date(appointment.appointmentDate || 0).getTime() < now
                  return (
                    <Tr key={appointment.id}>
                      <Td className="w-[1%] whitespace-nowrap">
                        <Figure size="sm" attention={late}>{formatTime(appointment.appointmentDate, timeZone)}</Figure>
                      </Td>
                      <Td className="max-w-[16rem]">
                        <Link href={appointmentHref(appointment)} className="block truncate font-medium text-foreground hover:underline">
                          {name || (pt ? 'Cliente sem cadastro' : 'Walk-in')}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground md:hidden">{appointment.customerVehicleDescription || (pt ? 'Veículo não informado' : 'Vehicle not set')}</p>
                        {appointment.lead?.phone && <p className="truncate text-xs text-muted-foreground max-md:hidden">{formatPhone(appointment.lead.phone)}</p>}
                        <div className="mt-2 md:hidden [&>div]:justify-start">{appointmentActions(appointment)}</div>
                      </Td>
                      <Td priority={2} className="max-w-[14rem] truncate">{appointment.customerVehicleDescription || (pt ? 'Veículo não informado' : 'Vehicle not set')}</Td>
                      <Td priority={3} className="max-w-[18rem]">
                        <p className="line-clamp-2 text-muted-foreground">{appointment.description || appointment.servicePackage?.name || appointment.serviceType || '—'}</p>
                      </Td>
                      <Td priority={3} className="whitespace-nowrap text-muted-foreground">{appointment.assignedTech?.name || (pt ? 'Não atribuído' : 'Unassigned')}</Td>
                      <Td>
                        <div className="flex flex-col items-start gap-1">
                          <Status tone={STATUS_TONES[status] || 'idle'}>{serviceLabel(locale, APPOINTMENT_STATUS_LABELS[status] || status)}</Status>
                          {late && <Attention>{pt ? 'Atrasado' : 'Late'}</Attention>}
                          {appointment.serviceOrder && (
                            <Link href={orderHref(appointment.serviceOrder)} className="hover:underline">
                              <Code>{roReference(appointment.serviceOrder.id)}</Code>
                            </Link>
                          )}
                        </div>
                      </Td>
                      <Td priority={2} align="right">{appointmentActions(appointment)}</Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>

        <DeskSection title={pt ? 'Ordens de serviço aguardando' : 'ROs waiting'} count={waitingOrders.length} id="service-waiting">
          {waitingOrders.length === 0 ? (
            <Empty label={pt ? 'Nenhuma ordem aguardando peças, aprovação ou retirada' : 'No repair orders waiting on parts, approval or pickup'} />
          ) : (
            <DeskTable aria-labelledby="service-waiting">
              <thead>
                <tr>
                  <Th>{pt ? 'Aguardando' : 'Waiting on'}</Th>
                  <Th>{pt ? 'OS' : 'RO'}</Th>
                  <Th priority={2}>{pt ? 'Cliente · veículo' : 'Customer · vehicle'}</Th>
                  <Th priority={3}>{pt ? 'Situação' : 'Status'}</Th>
                  <Th align="right" priority={2}>{pt ? 'Valor total' : 'Total'}</Th>
                  <Th align="right">{pt ? 'Tempo' : 'Age'}</Th>
                </tr>
              </thead>
              <tbody>
                {waitingOrders.map(({ order, appointment, reason }) => {
                  const name = customerName(appointment?.lead)
                  const status = order.status || 'estimate'
                  const stale = carriedOver(order.updatedAt, timeZone)
                  return (
                    <Tr key={order.id} className="cursor-pointer" onClick={() => router.push(orderHref(order))}>
                      <Td><Status tone={WAIT_TONES[reason]}>{WAIT_LABELS[reason]}</Status></Td>
                      <Td className="whitespace-nowrap">
                        <Link href={orderHref(order)} onClick={event => event.stopPropagation()} className="hover:underline">
                          <Code className="text-foreground">{roReference(order.id)}</Code>
                        </Link>
                      </Td>
                      <Td priority={2} className="max-w-[20rem] truncate">
                        {name ? `${name} · ` : ''}{order.appointment?.customerVehicleDescription || 'Vehicle not set'}
                      </Td>
                      <Td priority={3}>
                        <Status tone={STATUS_TONES[status] || 'idle'}>{serviceLabel(locale, ORDER_STATUS_LABELS[status] || status)}</Status>
                      </Td>
                      <Td priority={2} align="right">{formatCents(order.grandTotalCents)}</Td>
                      <Td align="right" className="whitespace-nowrap">
                        <Figure size="sm" attention={stale}>{formatAge(order.updatedAt, now)}</Figure>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>


        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={pt ? 'Buscar registros da oficina' : 'Search service records'}
              className="h-11 rounded-[4px] pl-9 text-[13px] sm:h-9"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={pt ? 'Buscar cliente, veículo, solicitação, OS ou nota fiscal' : 'Search customer, vehicle, concern, RO, or invoice'}
            />
          </div>
          <Select value={sortOrder} onValueChange={setSortOrder}>
            <SelectTrigger aria-label={pt ? 'Ordenar agendamentos' : 'Sort appointments'} className="h-11 w-full rounded-[4px] px-3 text-[13px] sm:h-9 sm:w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="appointment">{pt ? 'Agendamento mais próximo' : 'Appointment first'}</SelectItem>
              <SelectItem value="recent">{pt ? 'Mais recentes primeiro' : 'Most recent first'}</SelectItem>
            </SelectContent>
          </Select>
          {loading && <span className="text-[13px] text-muted-foreground" role="status">{pt ? 'Atualizando…' : 'Refreshing…'}</span>}
        </div>

        <DeskSection title={pt ? 'Ordens de serviço' : 'Repair orders'} count={visibleOrders.length} id="service-orders">
          <Segmented
            label={pt ? 'Filtrar ordens de serviço' : 'Filter repair orders'}
            size="sm"
            className="mb-3"
            value={orderFilter}
            onChange={setOrderFilter}
            options={orderFilters.map(value => ({
              value,
              label: value === 'all' ? (pt ? 'Todas' : 'All') : serviceLabel(locale, ORDER_STATUS_LABELS[value]),
              count: orderCounts[value] || 0,
            }))}
          />
          {shownOrders.length === 0 ? (
            term || orderFilter !== 'all' ? <Empty label={pt ? 'Nenhuma ordem de serviço encontrada' : 'No matching repair orders'} onReset={resetFilters} /> : <Empty label={pt ? 'Nenhuma ordem de serviço' : 'No repair orders'} />
          ) : (
            <DeskTable aria-labelledby="service-orders">
              <thead>
                <tr>
                  <Th>{pt ? 'OS' : 'RO'}</Th>
                  <Th>{pt ? 'Cliente' : 'Customer'}</Th>
                  <Th priority={2}>{pt ? 'Veículo' : 'Vehicle'}</Th>
                  <Th priority={3}>{pt ? 'Agendamento' : 'Appointment'}</Th>
                  <Th priority={3}>{pt ? 'Autorização' : 'Authorization'}</Th>
                  <Th>{pt ? 'Situação' : 'Status'}</Th>
                  <Th align="right" priority={3}>{pt ? 'Itens' : 'Lines'}</Th>
                  <Th align="right">{pt ? 'Valor total' : 'Total'}</Th>
                </tr>
              </thead>
              <tbody>
                {shownOrders.map(order => {
                  const appointment = appointmentByOrder.get(order.id)
                  const name = customerName(appointment?.lead)
                  const status = order.status || 'estimate'
                  const balanced = repairOrderTotalsCheck({ ...order, lineItems: order.lineItems || [] }).matches
                  const openOps = order.laborOperations.filter(operation => !['completed', 'cancelled'].includes(operation.status)).length
                  return (
                    <Tr key={order.id} className="cursor-pointer" onClick={() => router.push(orderHref(order))}>
                      <Td className="whitespace-nowrap">
                        <Link href={orderHref(order)} onClick={event => event.stopPropagation()} className="hover:underline">
                          <Code className="text-foreground">{roReference(order.id)}</Code>
                        </Link>
                      </Td>
                      <Td className="max-w-[14rem]">
                        <p className="truncate font-medium">{name || '—'}</p>
                        <p className="truncate text-xs text-muted-foreground md:hidden">{order.appointment?.customerVehicleDescription || 'Vehicle not set'}</p>
                        {openOps > 0 && <p className="text-xs text-muted-foreground max-md:hidden">{openOps} open ops</p>}
                      </Td>
                      <Td priority={2} className="max-w-[14rem] truncate">{order.appointment?.customerVehicleDescription || 'Vehicle not set'}</Td>
                      <Td priority={3} className="whitespace-nowrap text-muted-foreground">{formatDateTime(order.appointment?.appointmentDate || null, timeZone)}</Td>
                      <Td priority={3} className="capitalize text-muted-foreground">{order.authorizationStatus || 'pending'}</Td>
                      <Td>
                        <div className="flex flex-col items-start gap-1">
                          <Status tone={STATUS_TONES[status] || 'idle'}>{serviceLabel(locale, ORDER_STATUS_LABELS[status] || status)}</Status>
                          {!balanced && <Attention>{pt ? 'Totais divergentes' : 'Totals mismatch'}</Attention>}
                        </div>
                      </Td>
                      <Td priority={3} align="right" className="text-muted-foreground">{order.lineItems.length}</Td>
                      <Td align="right" className="whitespace-nowrap font-medium">{formatCents(order.grandTotalCents)}</Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>

        <DeskSection title={pt ? 'Agendamentos' : 'Appointments'} count={filteredAppointments.length} id="service-appointments">
          <Segmented
            label={pt ? 'Filtrar agendamentos' : 'Filter appointments'}
            size="sm"
            className="mb-3"
            value={appointmentFilter}
            onChange={setAppointmentFilter}
            options={appointmentFilters.map(option => ({ ...option, label: pt ? ({ Open: 'Em aberto', Today: 'Hoje', 'Waiting parts': 'Aguardando peças', All: 'Todos' } as Record<string, string>)[option.label] : option.label, count: appointmentCounts[option.value] }))}
          />
          {filteredAppointments.length === 0 ? (
            term || appointmentFilter !== 'open' ? <Empty label={pt ? 'Nenhum agendamento encontrado' : 'No matching appointments'} onReset={resetFilters} /> : <Empty label={pt ? 'Nenhum agendamento de oficina' : 'No service appointments'} />
          ) : (
            <DeskTable aria-labelledby="service-appointments">
              <thead>
                <tr>
                  <Th>{pt ? 'Quando' : 'When'}</Th>
                  <Th>{pt ? 'Cliente' : 'Customer'}</Th>
                  <Th priority={3}>{pt ? 'Serviço' : 'Service'}</Th>
                  <Th priority={3}>{pt ? 'Mecânico' : 'Tech'}</Th>
                  <Th>{pt ? 'Situação' : 'Status'}</Th>
                  <Th priority={2}>{pt ? 'OS' : 'RO'}</Th>
                  <Th align="right" priority={2}><span className="sr-only">{pt ? 'Ações' : 'Actions'}</span></Th>
                </tr>
              </thead>
              <tbody>
                {filteredAppointments.map(appointment => {
                  const status = appointment.status || 'scheduled'
                  const name = customerName(appointment.lead)
                  return (
                    <Tr key={appointment.id}>
                      <Td className="whitespace-nowrap text-muted-foreground">{formatDateTime(appointment.appointmentDate, timeZone)}</Td>
                      <Td className="max-w-[18rem]">
                        <Link href={appointmentHref(appointment)} className="block truncate font-medium hover:underline">
                          {name || 'Walk-in'}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {appointment.customerVehicleDescription || 'Vehicle not set'}
                          {appointment.lead?.phone ? ` · ${formatPhone(appointment.lead.phone)}` : ''}
                        </p>
                      </Td>
                      <Td priority={3} className="max-w-[16rem]">
                        <p className="truncate capitalize">{appointment.servicePackage?.name || appointment.serviceType || 'Service'}</p>
                        {appointment.description && <p className="line-clamp-1 text-xs text-muted-foreground">{appointment.description}</p>}
                      </Td>
                      <Td priority={3} className="whitespace-nowrap text-muted-foreground">{appointment.assignedTech?.name || 'Unassigned'}</Td>
                      <Td><Status tone={STATUS_TONES[status] || 'idle'}>{serviceLabel(locale, APPOINTMENT_STATUS_LABELS[status] || status)}</Status></Td>
                      <Td priority={2} className="whitespace-nowrap">
                        {appointment.serviceOrder ? (
                          <Link href={orderHref(appointment.serviceOrder)} className="hover:underline">
                            <Code>{roReference(appointment.serviceOrder.id)}</Code>
                            <span className="ml-2 tabular-nums text-muted-foreground">{formatCents(appointment.serviceOrder.grandTotalCents)}</span>
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Td>
                      <Td priority={2} align="right">{appointmentActions(appointment)}</Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>

        <DeskSection
          title={pt ? 'Estoque baixo' : 'Low stock'}
          count={lowParts.length}
          id="service-low-stock"
          actions={
            <Pill size="sm" variant="plain" className="max-sm:h-11" asChild>
              <Link href={`${basePath}/platform/parts`}>{pt ? 'Peças' : 'Parts'}</Link>
            </Pill>
          }
        >
          {lowParts.length === 0 ? (
            <Empty label={parts.length ? (pt ? 'Nenhuma peça abaixo do ponto de reposição' : 'No parts below reorder point') : (pt ? 'Nenhuma peça cadastrada' : 'No parts configured')} />
          ) : (
            <DeskTable aria-labelledby="service-low-stock">
              <thead>
                <tr>
                  <Th>{pt ? 'Peça' : 'Part'}</Th>
                  <Th priority={2}>{pt ? 'Cód. da peça' : 'Part #'}</Th>
                  <Th priority={3}>{pt ? 'Fornecedor' : 'Supplier'}</Th>
                  <Th align="right">{pt ? 'Em estoque' : 'On hand'}</Th>
                  <Th align="right" priority={2}>{pt ? 'Ponto de reposição' : 'Reorder at'}</Th>
                </tr>
              </thead>
              <tbody>
                {lowParts.map(part => (
                  <Tr key={part.id}>
                    <Td className="max-w-[18rem]">
                      <p className="truncate font-medium">{part.description || part.partNumber}</p>
                      <p className="md:hidden"><Code>#{part.partNumber}</Code></p>
                    </Td>
                    <Td priority={2}><Code>#{part.partNumber}</Code></Td>
                    <Td priority={3} className="text-muted-foreground">{part.supplier || (pt ? 'Sem fornecedor' : 'No supplier')}</Td>
                    <Td align="right"><Figure size="sm" attention>{part.quantity ?? 0}</Figure></Td>
                    <Td align="right" priority={2} className="text-muted-foreground">{part.minimumQuantity ?? 0}</Td>
                  </Tr>
                ))}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>

        <OperatorActionDialog
          open={Boolean(booking)}
          title={pt ? 'Novo agendamento' : 'New appointment'}
          fields={bookingFields()}
          values={booking?.values || {}}
          error={bookingError}
          busy={bookingBusy}
          submitLabel={pt ? 'Agendar serviço' : 'Book appointment'}
          onValuesChange={values => setBooking(current => (current ? { ...current, values } : null))}
          onSubmit={submitBooking}
          onOpenChange={open => {
            if (!open) {
              setBooking(null)
              setBookingError(null)
            }
          }}
        />
        <ReadoutStrip>
          <Readout label={pt ? 'Hoje' : 'Today'} value={appointmentCounts.today} sub={pt ? 'Agendamentos' : 'Appointments'} />
          <Readout label={pt ? 'Ordens em aberto' : 'Open ROs'} value={workingOrders.length} />
          <Readout label={pt ? 'Valor das ordens em aberto' : 'Open RO value'} value={formatCents(workingValue)} />
          <Readout label={pt ? 'Aguardando peças' : 'Waiting parts'} value={appointmentCounts['waiting-parts']} tone={appointmentCounts['waiting-parts'] > 0 ? 'warn' : undefined} />
          <Readout label={pt ? 'Estoque baixo' : 'Low stock'} value={lowParts.length} tone={lowParts.length > 0 ? 'bad' : undefined} sub={pt ? `${parts.length} peças` : countLabel(parts.length, 'part')} />
        </ReadoutStrip>
      </div>
    </PageContainer>
  )
}
