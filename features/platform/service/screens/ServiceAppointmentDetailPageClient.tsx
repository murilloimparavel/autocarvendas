'use client'

import { useRef, useState } from 'react'
import { useLocale } from '@/features/i18n/LocaleProvider'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, RefreshCw } from 'lucide-react'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { Attention, Code, DeskHeader, DeskSection, Facts, Figure, Notice, Pill, Status, Track } from '@/features/platform/components/desk'
import { fromZonedInput, zonedInputValue } from '@/features/platform/delivery/lib/zonedTime'
import { formatPhone } from '@/features/platform/lib/format'
import {
  getRooftopStaff,
  getServiceAppointmentDetail,
  openServiceOrder,
  transitionServiceAppointment,
  updateServiceAppointment,
} from '../actions'
import { ServiceFormDialog, type ServiceFormField } from '../components/ServiceFormDialog'
import { createAttemptKeys } from '../lib/attemptKeys'
import { formatCents as formatCentsBase, formatDateTime as formatDateTimeBase, formatMileage, mileageToStoredMiles, parseWhole } from '../lib/serviceFormat'
import {
  APPOINTMENT_ACTION_LABELS,
  APPOINTMENT_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  SERVICE_TYPE_OPTIONS,
  STATUS_TONES,
  TRANSPORTATION_OPTIONS,
  appointmentTransitions,
  customerName,
  roReference,
  serviceLabel,
} from '../lib/serviceStatus'
import type { ServiceAppointmentDetail } from '../lib/types'

type FormState = { kind: 'edit' | 'cancel'; values: Record<string, string>; errors: Record<string, string>; formError: string | null }

const UNASSIGNED = 'unassigned'

export function ServiceAppointmentDetailPageClient({
  id,
  initialAppointment,
  initialError,
  timeZone,
  currencyCode,
}: {
  id: string
  initialAppointment: ServiceAppointmentDetail | null
  initialError: string | null
  timeZone: string
  currencyCode: string
}) {
  const { locale } = useLocale()
  const formatCents = (value: number | null | undefined) => formatCentsBase(value, currencyCode, locale)
  const formatDateTime = (value: string | null | undefined, zone: string, empty?: string) => formatDateTimeBase(value, zone, empty, locale)
  const router = useRouter()
  const [appointment, setAppointment] = useState<ServiceAppointmentDetail | null>(initialAppointment)
  const [loadError, setLoadError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [staff, setStaff] = useState<Array<{ value: string; label: string }>>([])
  // Clock for ages and lateness; advances on each refresh.
  const [now, setNow] = useState(() => Date.now())
  const attemptKeys = useRef(createAttemptKeys('service-appointment')).current

  const reload = async () => {
    setLoading(true)
    const response = await getServiceAppointmentDetail(id)
    if (response.success) {
      setAppointment(response.data)
      setLoadError(null)
    } else {
      setLoadError(response.error)
    }
    setNow(new Date().getTime())
    setLoading(false)
  }

  const breadcrumbs = (label: string) => [
    { type: 'link' as const, label: locale === 'pt-BR' ? 'Painel' : 'Dashboard', href: basePath },
    { type: 'page' as const, label: locale === 'pt-BR' ? 'Plataforma' : 'Platform' },
    { type: 'link' as const, label: locale === 'pt-BR' ? 'Oficina' : 'Service', href: `${basePath}/platform/service` },
    { type: 'page' as const, label },
  ]

  if (!appointment) {
    return (
      <PageContainer title={locale === 'pt-BR' ? 'Agendamento' : 'Appointment'} header={<DeskHeader eyebrow={locale === 'pt-BR' ? 'Agendamento da oficina' : 'Service appointment'} title={locale === 'pt-BR' ? 'Agendamento indisponível' : 'Appointment unavailable'} tone="bad" status={locale === 'pt-BR' ? 'Indisponível' : 'Unavailable'} />} breadcrumbs={breadcrumbs(locale === 'pt-BR' ? 'Agendamento' : 'Appointment')}>
        <div className="space-y-3 px-4 pb-24 md:px-6">
          <Notice tone="bad">{loadError || (locale === 'pt-BR' ? 'Agendamento não encontrado' : 'Appointment not found')}</Notice>
          <Track>
            <Pill className="max-sm:h-11" onClick={reload} disabled={loading}>{loading ? (locale === 'pt-BR' ? 'Carregando…' : 'Loading…') : (locale === 'pt-BR' ? 'Tentar novamente' : 'Retry')}</Pill>
            <Pill className="max-sm:h-11" asChild>
              <Link href={`${basePath}/platform/service`}>{locale === 'pt-BR' ? 'Oficina' : 'Service desk'}</Link>
            </Pill>
          </Track>
        </div>
      </PageContainer>
    )
  }

  const status = appointment.status || 'scheduled'
  const closed = ['completed', 'cancelled'].includes(status)
  const lead = appointment.lead
  const name = customerName(lead)
  const vehicle = appointment.customerVehicleDescription || (locale === 'pt-BR' ? 'Veículo não informado' : 'Vehicle not set')
  const transitions = appointmentTransitions(status)
  const order = appointment.serviceOrder

  const moveTo = async (toStatus: string) => {
    const scope = `transition:${toStatus}`
    setBusy(scope)
    setNotice(null)
    const response = await transitionServiceAppointment({ id: appointment.id, toStatus, idempotencyKey: attemptKeys.key(scope) })
    attemptKeys.settle(scope, response)
    setBusy(null)
    if (!response.success) {
      setNotice({ tone: 'bad', text: response.error })
      return response.error
    }
    setNotice({ tone: 'ok', text: serviceLabel(locale, APPOINTMENT_STATUS_LABELS[toStatus] || 'Saved') })
    await reload()
    return null
  }

  const openRepairOrder = async () => {
    setBusy('open-ro')
    setNotice(null)
    // One RO per appointment, so the appointment id makes the key replay-safe.
    const response = await openServiceOrder({
      appointmentId: appointment.id,
      idempotencyKey: `service-order:${appointment.id}`,
      diagnosis: appointment.description || '',
      laborTotalCents: 0,
      partsTotalCents: 0,
      taxCents: 0,
      grandTotalCents: 0,
    })
    if (!response.success) {
      setBusy(null)
      setNotice({ tone: 'bad', text: response.error })
      return
    }
    if (status === 'scheduled') {
      const scope = 'transition:checked-in'
      const checkIn = await transitionServiceAppointment({ id: appointment.id, toStatus: 'checked-in', idempotencyKey: attemptKeys.key(scope) })
      attemptKeys.settle(scope, checkIn)
    }
    router.push(`${basePath}/platform/service/orders/${response.data.openServiceOrder.id}`)
  }

  const openEdit = async () => {
    setForm({
      kind: 'edit',
      errors: {},
      formError: null,
      values: {
        appointmentAt: appointment.appointmentDate ? zonedInputValue(new Date(appointment.appointmentDate), timeZone) : '',
        serviceType: appointment.serviceType || '',
        description: appointment.description || '',
        estimatedDuration: appointment.estimatedDuration != null ? String(appointment.estimatedDuration) : '',
        assignedTechId: appointment.assignedTech?.id || UNASSIGNED,
        mileageIn: appointment.mileageIn != null ? String(locale === 'pt-BR' ? Math.round(appointment.mileageIn * 1.609344) : appointment.mileageIn) : '',
        transportationNeed: appointment.transportationNeed || 'none',
        customerVehicleDescription: appointment.customerVehicleDescription || '',
        vehicleVin: appointment.vehicleVin || '',
        advisorNotes: appointment.advisorNotes || '',
      },
    })
    if (!appointment.rooftop?.id) return
    const response = await getRooftopStaff(appointment.rooftop.id)
    if (response.success) setStaff(response.data.users.map(user => ({ value: user.id, label: user.name })))
    else setForm(current => (current ? { ...current, formError: response.error || (locale === 'pt-BR' ? 'Não foi possível carregar a equipe' : 'Unable to load staff') } : current))
  }

  const fields: ServiceFormField[] = form?.kind === 'edit'
    ? [
        { name: 'appointmentAt', label: locale === 'pt-BR' ? 'Data e horário' : 'Date and time', type: 'datetime-local', hint: timeZone },
        { name: 'serviceType', label: locale === 'pt-BR' ? 'Serviço' : 'Service', type: 'select', options: SERVICE_TYPE_OPTIONS.map(option => ({ ...option, label: serviceLabel(locale, option.label) })) },
        { name: 'description', label: locale === 'pt-BR' ? 'Relato do cliente' : 'Concern', type: 'textarea' },
        { name: 'assignedTechId', label: locale === 'pt-BR' ? 'Técnico responsável' : 'Technician', type: 'select', options: [{ value: UNASSIGNED, label: locale === 'pt-BR' ? 'Sem responsável' : 'Unassigned' }, ...staff] },
        { name: 'estimatedDuration', label: locale === 'pt-BR' ? 'Duração (minutos)' : 'Duration (minutes)', inputMode: 'numeric' },
        { name: 'mileageIn', label: locale === 'pt-BR' ? 'Quilometragem de entrada (km)' : 'Mileage in (mi)', inputMode: 'numeric' },
        { name: 'transportationNeed', label: locale === 'pt-BR' ? 'Transporte' : 'Transportation', type: 'select', options: TRANSPORTATION_OPTIONS.map(option => ({ ...option, label: serviceLabel(locale, option.label) })) },
        { name: 'customerVehicleDescription', label: locale === 'pt-BR' ? 'Veículo' : 'Vehicle', placeholder: '2021 Honda Accord' },
        { name: 'vehicleVin', label: locale === 'pt-BR' ? 'Chassi (VIN)' : 'VIN' },
        { name: 'advisorNotes', label: locale === 'pt-BR' ? 'Observações do consultor' : 'Advisor notes', type: 'textarea' },
      ]
    : []

  const submit = async () => {
    if (!form) return
    if (form.kind === 'cancel') {
      setBusy('form')
      const error = await moveTo('cancelled')
      setBusy(null)
      if (!error) setForm(null)
      else setForm(current => (current ? { ...current, formError: error } : current))
      return
    }
    const values = form.values
    const errors: Record<string, string> = {}
    const at = fromZonedInput(values.appointmentAt || '', timeZone)
    if (!at) errors.appointmentAt = locale === 'pt-BR' ? 'Selecione uma data e um horário válidos' : 'Choose a date and time'
    if (!SERVICE_TYPE_OPTIONS.some(option => option.value === values.serviceType)) errors.serviceType = locale === 'pt-BR' ? 'Selecione um serviço' : 'Choose a service'
    if ((values.description || '').length > 4000) errors.description = locale === 'pt-BR' ? 'Máximo de 4.000 caracteres' : 'At most 4,000 characters'
    const duration = values.estimatedDuration?.trim() ? parseWhole(values.estimatedDuration, 24 * 60) : undefined
    if (duration === null) errors.estimatedDuration = locale === 'pt-BR' ? 'Informe a duração em minutos inteiros, até 1.440' : 'Whole minutes, up to 1,440'
    const mileage = values.mileageIn?.trim() ? parseWhole(values.mileageIn, 2_000_000) : undefined
    if (mileage === null) errors.mileageIn = locale === 'pt-BR' ? 'Informe um número inteiro de quilômetros' : 'Enter whole miles'
    const vin = (values.vehicleVin || '').trim().toUpperCase()
    if (vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) errors.vehicleVin = locale === 'pt-BR' ? 'O chassi (VIN) deve ter 17 letras e números' : 'VIN is 17 letters and digits'
    if (Object.keys(errors).length) {
      setForm({ ...form, errors, formError: null })
      return
    }
    const techId = values.assignedTechId && values.assignedTechId !== UNASSIGNED ? values.assignedTechId : null
    const data: Record<string, unknown> = {
      appointmentDate: at!.toISOString(),
      serviceType: values.serviceType,
      description: (values.description || '').trim(),
      estimatedDuration: duration ?? null,
      mileageIn: mileage != null ? mileageToStoredMiles(mileage, locale) : null,
      transportationNeed: values.transportationNeed || 'none',
      customerVehicleDescription: (values.customerVehicleDescription || '').trim(),
      vehicleVin: vin,
      advisorNotes: (values.advisorNotes || '').trim(),
    }
    if (techId) data.assignedTech = { connect: { id: techId } }
    else if (appointment.assignedTech) data.assignedTech = { disconnect: true }
    setForm({ ...form, errors: {}, formError: null })
    setBusy('form')
    const response = await updateServiceAppointment(appointment.id, data)
    setBusy(null)
    if (!response.success) {
      setForm(current => (current ? { ...current, formError: response.error } : current))
      return
    }
    setForm(null)
    setNotice({ tone: 'ok', text: locale === 'pt-BR' ? 'Agendamento salvo' : 'Appointment saved' })
    await reload()
  }

  const header = (
    <DeskHeader
      title={name ? `${name} · ${vehicle}` : vehicle}
      tone={STATUS_TONES[status] || 'idle'}
      status={serviceLabel(locale, APPOINTMENT_STATUS_LABELS[status] || status)}
      meta={
        <span className="flex flex-wrap items-baseline gap-x-2">
          <Status tone={STATUS_TONES[status] || 'idle'}>{serviceLabel(locale, APPOINTMENT_STATUS_LABELS[status] || status)}</Status>
          <span>· {formatDateTime(appointment.appointmentDate, timeZone)}</span>
          {appointment.rooftop?.name && <span>· {appointment.rooftop.name}</span>}
          <span>· {appointment.assignedTech?.name || 'Unassigned'}</span>
        </span>
      }
      actions={
        <>
          <Pill variant="plain" className="max-sm:h-11" onClick={reload} disabled={loading} aria-label={locale === 'pt-BR' ? 'Atualizar' : 'Refresh'}>
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            {locale === 'pt-BR' ? 'Atualizar' : 'Refresh'}
          </Pill>
          <Pill className="max-sm:h-11" onClick={openEdit} disabled={Boolean(busy)}>
            <Pencil />
            {locale === 'pt-BR' ? 'Editar' : 'Edit'}
          </Pill>
          {order ? (
            <Pill className="max-sm:h-11" variant="primary" asChild>
              <Link href={`${basePath}/platform/service/orders/${order.id}`}>{locale === 'pt-BR' ? 'Abrir' : 'Open'} {roReference(order.id)}</Link>
            </Pill>
          ) : (
            <Pill className="max-sm:h-11" variant="primary" onClick={openRepairOrder} disabled={closed || Boolean(busy)} title={closed ? (locale === 'pt-BR' ? 'Agendamentos encerrados não podem gerar ordens de serviço' : 'Closed appointments cannot open repair orders') : undefined}>
              {busy === 'open-ro' ? (locale === 'pt-BR' ? 'Abrindo…' : 'Opening…') : (locale === 'pt-BR' ? 'Abrir ordem de serviço' : 'Open RO')}
            </Pill>
          )}
        </>
      }
    />
  )
  const late = status === 'scheduled' && Boolean(appointment.appointmentDate) && new Date(appointment.appointmentDate || 0).getTime() < now

  return (
    <PageContainer title={name ? `${name} · ${vehicle}` : vehicle} header={header} breadcrumbs={breadcrumbs('Appointment')}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {(notice || loadError || (!order && closed)) && (
          <div className="space-y-2">
            {notice && (
              <Notice tone={notice.tone}>
                <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                  <p className="min-w-0">{notice.text}</p>
                  <Pill size="sm" variant="plain" className="max-sm:h-11" onClick={() => setNotice(null)}>{locale === 'pt-BR' ? 'Fechar' : 'Dismiss'}</Pill>
                </div>
              </Notice>
            )}
            {loadError && <Notice tone="bad">{loadError}</Notice>}
            {!order && closed && <Notice tone="idle">{locale === 'pt-BR' ? 'Agendamentos encerrados não podem gerar ordens de serviço' : 'Open RO: closed appointments cannot open repair orders'}</Notice>}
          </div>
        )}

        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-md border bg-card px-4 py-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <Figure size="md" attention={late}>{formatDateTime(appointment.appointmentDate, timeZone)}</Figure>
            <Status tone={STATUS_TONES[status] || 'idle'}>{serviceLabel(locale, APPOINTMENT_STATUS_LABELS[status] || status)}</Status>
            {late && <Attention>{locale === 'pt-BR' ? 'Atrasado' : 'Late'}</Attention>}
          </div>
          {transitions.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{locale === 'pt-BR' ? 'Nenhuma mudança de situação disponível' : 'No status changes available'}</p>
          ) : (
            <Track className="flex-wrap">
              {transitions.map(next => (
                <Pill
                  key={next}
                  className="max-sm:h-11"
                  variant={next === 'cancelled' ? 'plain' : undefined}
                  disabled={Boolean(busy)}
                  onClick={() => (next === 'cancelled' ? setForm({ kind: 'cancel', values: {}, errors: {}, formError: null }) : void moveTo(next))}
                >
                  {busy === `transition:${next}` ? (locale === 'pt-BR' ? 'Salvando…' : 'Saving…') : serviceLabel(locale, APPOINTMENT_ACTION_LABELS[next])}
                </Pill>
              ))}
            </Track>
          )}
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-2">
          <DeskSection title={locale === 'pt-BR' ? 'Agendamento' : 'Appointment'}>
            <Facts
              items={[
                { label: locale === 'pt-BR' ? 'Data e horário' : 'Date', value: formatDateTime(appointment.appointmentDate, timeZone) },
                { label: locale === 'pt-BR' ? 'Serviço' : 'Service', value: <span className="capitalize">{appointment.servicePackage?.name || appointment.serviceType || (locale === 'pt-BR' ? 'Serviço' : 'Service')}</span> },
                { label: locale === 'pt-BR' ? 'Relato do cliente' : 'Concern', value: appointment.description || '-' },
                appointment.estimatedDuration != null ? { label: locale === 'pt-BR' ? 'Duração' : 'Duration', value: `${appointment.estimatedDuration} min`, mono: true } : null,
                { label: locale === 'pt-BR' ? 'Técnico responsável' : 'Technician', value: appointment.assignedTech?.name || (locale === 'pt-BR' ? 'Sem responsável' : 'Unassigned') },
                { label: locale === 'pt-BR' ? 'Transporte' : 'Transportation', value: <span className="capitalize">{appointment.transportationNeed || (locale === 'pt-BR' ? 'Nenhum' : 'none')}</span> },
                appointment.advisorNotes ? { label: locale === 'pt-BR' ? 'Observações do consultor' : 'Advisor notes', value: appointment.advisorNotes } : null,
              ]}
            />
          </DeskSection>

          <div className="min-w-0 space-y-8">
            <DeskSection title={locale === 'pt-BR' ? 'Cliente e veículo' : 'Customer and vehicle'}>
              <Facts
                items={[
                  { label: locale === 'pt-BR' ? 'Cliente' : 'Customer', value: lead ? <Link className="hover:underline" href={`${basePath}/platform/crm/${lead.id}`}>{name}</Link> : (locale === 'pt-BR' ? 'Não vinculado' : 'Not linked') },
                  lead?.phone ? { label: locale === 'pt-BR' ? 'Telefone' : 'Phone', value: <a className="hover:underline" href={`tel:${lead.phone}`}>{formatPhone(lead.phone)}</a>, mono: true } : null,
                  lead?.email ? { label: 'E-mail', value: lead.email } : null,
                  { label: locale === 'pt-BR' ? 'Veículo' : 'Vehicle', value: vehicle },
                  appointment.vehicleVin ? { label: locale === 'pt-BR' ? 'Chassi (VIN)' : 'VIN', value: appointment.vehicleVin, mono: true } : null,
                  appointment.mileageIn != null ? { label: locale === 'pt-BR' ? 'Quilometragem de entrada' : 'Mileage in', value: formatMileage(appointment.mileageIn, locale), mono: true } : null,
                ]}
              />
            </DeskSection>

            <DeskSection title={locale === 'pt-BR' ? 'Ordem de serviço' : 'Repair order'}>
              {order ? (
                <Link href={`${basePath}/platform/service/orders/${order.id}`} className="flex min-h-11 min-w-0 items-center justify-between gap-4 rounded-md border bg-card px-4 py-2.5 transition-colors hover:bg-muted/40">
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                    <Code className="text-foreground">{roReference(order.id)}</Code>
                    <Status tone={STATUS_TONES[order.status || ''] || 'idle'}>{serviceLabel(locale, ORDER_STATUS_LABELS[order.status || ''] || order.status || '')}</Status>
                    <span className="text-[13px] capitalize text-muted-foreground">{order.authorizationStatus || 'pending'}</span>
                  </span>
                  <Figure size="sm" className="shrink-0">{formatCents(order.grandTotalCents)}</Figure>
                </Link>
              ) : (
                <p className="py-3 text-[13px] text-muted-foreground">{locale === 'pt-BR' ? 'Nenhuma ordem de serviço vinculada' : 'No repair order'}</p>
              )}
            </DeskSection>
          </div>
        </div>

        <ServiceFormDialog
          open={Boolean(form)}
          title={form?.kind === 'cancel' ? (locale === 'pt-BR' ? 'Cancelar agendamento' : 'Cancel appointment') : (locale === 'pt-BR' ? 'Editar agendamento' : 'Edit appointment')}
          fields={fields}
          values={form?.values || {}}
          errors={form?.errors || {}}
          formError={form?.formError}
          busy={busy === 'form'}
          submitLabel={form?.kind === 'cancel' ? (locale === 'pt-BR' ? 'Cancelar agendamento' : 'Cancel appointment') : (locale === 'pt-BR' ? 'Salvar' : 'Save')}
          submitVariant={form?.kind === 'cancel' ? 'danger' : 'primary'}
          extra={form?.kind === 'cancel' ? <p className="text-[13px]">{name ? `${name} · ` : ''}{vehicle} · {formatDateTime(appointment.appointmentDate, timeZone)}</p> : null}
          onValuesChange={values => setForm(current => (current ? { ...current, values } : current))}
          onSubmit={submit}
          onOpenChange={open => { if (!open) setForm(null) }}
        />
      </div>
    </PageContainer>
  )
}
