'use client'

import { Fragment, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Plus, RefreshCw, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { OperatorActionDialog, type OperatorActionField } from '@/features/platform/components/OperatorActionDialog'
import { Attention, Code, DeskHeader, DeskSection, DeskTable, Figure, Notice, Panel, Pill, Segmented, Status, Td, Th, Tr, Track, type DeskTone } from '@/features/platform/components/desk'
import { dayKey, formatPhone } from '@/features/platform/lib/format'
import { useLocale } from '@/features/i18n/LocaleProvider'
import {
  type TestDrive,
  completeTestDrive,
  getTestDriveVehicles,
  getTestDrives,
  markTestDriveNoShow,
  cancelTestDrive,
  scheduleTestDrive,
  verifyTestDriveLicense,
} from '../actions'

const EMPTY_SCHEDULE = { customerName: '', customerPhone: '', customerEmail: '', scheduledAt: '', vehicleId: '' }

function scheduleFields(vehicles: Array<{ value: string; label: string }>, pt: boolean): OperatorActionField[] {
  return [
    { name: 'customerName', label: pt ? 'Nome do cliente' : 'Customer name', maxLength: 200 },
    { name: 'customerPhone', label: pt ? 'Telefone' : 'Phone', maxLength: 50, placeholder: pt ? '(64) 99999-9999' : '(202) 555-0147' },
    { name: 'customerEmail', label: pt ? 'E-mail' : 'Email', type: 'email', maxLength: 320 },
    { name: 'scheduledAt', label: pt ? 'Data e horário' : 'Date and time', type: 'datetime-local', description: pt ? 'Horário local da loja' : 'Dealership time' },
    { name: 'vehicleId', label: pt ? 'Veículo' : 'Vehicle', type: 'select', options: vehicles, placeholder: vehicles.length ? (pt ? 'Selecione o veículo' : 'Select vehicle') : (pt ? 'Nenhum veículo disponível' : 'No available vehicles') },
  ]
}

type QueueFilter = 'today' | 'upcoming' | 'past-due' | 'completed' | 'no-show' | 'cancelled' | 'all'

function formatDateTime(value: string | null | undefined, timeZone: string, locale: 'pt-BR' | 'en-US') {
  if (!value) return locale === 'pt-BR' ? 'Sem horário definido' : 'Unscheduled'
  return new Date(value).toLocaleString(locale, {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatCurrency(value: number, locale: 'pt-BR' | 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: locale === 'pt-BR' ? 'BRL' : 'USD', maximumFractionDigits: 0 }).format(value)
}

function leadName(testDrive: TestDrive, pt: boolean) {
  if (!testDrive.lead) return pt ? 'Cliente sem cadastro' : 'Walk-in guest'
  return [testDrive.lead.firstName, testDrive.lead.lastName].filter(Boolean).join(' ') || (pt ? 'Lead sem nome' : 'Unnamed lead')
}

function vehicleName(testDrive: TestDrive, pt: boolean) {
  if (!testDrive.vehicle) return pt ? 'Nenhum veículo escolhido' : 'No vehicle chosen'
  return [testDrive.vehicle.year, testDrive.vehicle.make, testDrive.vehicle.model].filter(Boolean).join(' ')
}

function isToday(value: string | null | undefined, timeZone: string) {
  if (!value) return false
  return dayKey(value, timeZone) === dayKey(Date.now(), timeZone)
}

function isUpcoming(value: string | null | undefined) {
  if (!value) return false
  return new Date(value).getTime() >= Date.now()
}

/** A no-show or customer cancellation closes the drive but is not a completed drive. */
function isNoShow(testDrive: TestDrive) {
  return Boolean(testDrive.noShow) && !testDrive.cancelledAt
}

function isCancelled(testDrive: TestDrive) {
  return Boolean(testDrive.cancelledAt)
}

function isCompleted(testDrive: TestDrive) {
  return Boolean(testDrive.completed) && !testDrive.noShow && !testDrive.cancelledAt
}

function isOpen(testDrive: TestDrive) {
  return !testDrive.completed && !testDrive.noShow && !testDrive.cancelledAt
}

/** Open drives whose scheduled time has passed; they stay here until completed or marked no-show. */
function isPastDue(testDrive: TestDrive) {
  return isOpen(testDrive) && Boolean(testDrive.scheduledTime) && !isUpcoming(testDrive.scheduledTime)
}

function formatTime(value: string | null | undefined, timeZone: string, locale: 'pt-BR' | 'en-US') {
  if (!value) return '--:--'
  return new Date(value).toLocaleTimeString(locale, { timeZone, hour: 'numeric', minute: '2-digit' })
}

/** Time since a past moment as a short figure: "35m", "4h", "3d". */
function formatElapsedSince(value: string, nowMs: number) {
  const minutes = Math.max(0, Math.floor((nowMs - new Date(value).getTime()) / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`
}

function formatDay(value: string | null | undefined, timeZone: string, locale: 'pt-BR' | 'en-US') {
  if (!value) return locale === 'pt-BR' ? 'Sem horário definido' : 'Unscheduled'
  if (isToday(value, timeZone)) return locale === 'pt-BR' ? 'Hoje' : 'Today'
  return new Date(value).toLocaleDateString(locale, { timeZone, weekday: 'short', month: 'short', day: 'numeric' })
}

function driveState(testDrive: TestDrive, pt: boolean): { tone: DeskTone; label: string } {
  if (testDrive.cancelledAt) return { tone: 'idle', label: pt ? 'Cancelado' : 'Cancelled' }
  if (testDrive.noShow) return { tone: 'idle', label: pt ? 'Não compareceu' : 'No-show' }
  if (testDrive.completed) return { tone: 'ok', label: pt ? 'Concluído' : 'Completed' }
  if (isPastDue(testDrive)) return { tone: 'bad', label: pt ? 'Atrasado' : 'Past due' }
  if (!testDrive.driverLicenseVerified) return { tone: 'warn', label: pt ? 'Agendado' : 'Upcoming' }
  return { tone: 'info', label: pt ? 'Agendado' : 'Upcoming' }
}

const interestLabels: Record<string, string> = {
  'not-interested': 'Not interested',
  maybe: 'Maybe',
  'very-interested': 'Very interested',
}

function feedbackDraftsFor(testDrives: TestDrive[]) {
  return Object.fromEntries(testDrives.map(testDrive => [testDrive.id, testDrive.feedback || '']))
}

function interestDraftsFor(testDrives: TestDrive[]) {
  return Object.fromEntries(testDrives.map(testDrive => [testDrive.id, testDrive.interestedLevel || 'maybe']))
}

export function TestDriveDeskPageClient({
  initialTestDrives,
  initialError,
  timeZone,
}: {
  initialTestDrives: TestDrive[]
  initialError: string | null
  timeZone: string
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const text = (en: string, br: string) => pt ? br : en
  const [testDrives, setTestDrives] = useState<TestDrive[]>(initialTestDrives)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [search, setSearch] = useState('')
  const [sortOrder, setSortOrder] = useState('scheduled')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<QueueFilter>('upcoming')
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>(() => feedbackDraftsFor(initialTestDrives))
  const [interestDrafts, setInterestDrafts] = useState<Record<string, string>>(() => interestDraftsFor(initialTestDrives))
  const [schedule, setSchedule] = useState<{ values: Record<string, string>; idempotencyKey: string } | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [scheduleBusy, setScheduleBusy] = useState(false)
  const [vehicleOptions, setVehicleOptions] = useState<Array<{ value: string; label: string }>>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [noShowTarget, setNoShowTarget] = useState<TestDrive | null>(null)
  const [cancelTarget, setCancelTarget] = useState<TestDrive | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [noShowError, setNoShowError] = useState<string | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const openSchedule = async () => {
    setScheduleError(null)
    setSchedule({ values: { ...EMPTY_SCHEDULE }, idempotencyKey: `desk-test-drive:${crypto.randomUUID()}` })
    const response = await getTestDriveVehicles()
    if (response.success && response.data) {
      const options = response.data.vehicles.map(vehicle => ({
        value: vehicle.id,
        label: [[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || text('Vehicle', 'Veículo'), vehicle.stockNumber ? `#${vehicle.stockNumber}` : null].filter(Boolean).join(' · '),
      }))
      setVehicleOptions(options)
      if (!options.length) setScheduleError(text('No available vehicles', 'Nenhum veículo disponível'))
    } else {
      setVehicleOptions([])
      setScheduleError(response.error || text('Unable to load vehicles', 'Não foi possível carregar os veículos'))
    }
  }

  const submitSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!schedule) return
    const values = schedule.values
    const match = (values.scheduledAt || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
    if (!match) { setScheduleError(text('Date and time are required', 'Informe a data e o horário')); return }
    if (!values.vehicleId) { setScheduleError(text('Vehicle is required', 'Selecione um veículo')); return }
    setScheduleBusy(true)
    setScheduleError(null)
    const response = await scheduleTestDrive({
      customerName: values.customerName.trim(),
      customerEmail: values.customerEmail.trim(),
      customerPhone: values.customerPhone.trim(),
      preferredDate: match[1],
      preferredTime: match[2],
      vehicleId: values.vehicleId,
      idempotencyKey: schedule.idempotencyKey,
    })
    setScheduleBusy(false)
    if (!response.success) {
      setScheduleError(response.error || text('Unable to schedule test drive', 'Não foi possível agendar o test-drive'))
      return
    }
    setSchedule(null)
    setNotice(text('Test drive scheduled', 'Test-drive agendado'))
    await loadTestDrives()
  }

  const loadTestDrives = async () => {
    setLoading(true)
    setError(null)

    const response = await getTestDrives()

    if (response.success && response.data) {
      const loaded = response.data.testDrives || []
      setTestDrives(loaded)
      setFeedbackDrafts(feedbackDraftsFor(loaded))
      setInterestDrafts(interestDraftsFor(loaded))
    } else {
      setError(response.error || text('Unable to load test drives.', 'Não foi possível carregar os test-drives.'))
    }

    setLoading(false)
  }

  const filteredTestDrives = useMemo(() => {
    const queued =
      filter === 'today'
        ? testDrives.filter(testDrive => isToday(testDrive.scheduledTime, timeZone))
        : filter === 'upcoming'
          ? testDrives.filter(testDrive => isOpen(testDrive) && isUpcoming(testDrive.scheduledTime))
          : filter === 'completed'
            ? testDrives.filter(isCompleted)
            : filter === 'no-show'
              ? testDrives.filter(isNoShow)
              : filter === 'cancelled'
                ? testDrives.filter(isCancelled)
                : filter === 'past-due'
                  ? testDrives.filter(isPastDue)
                  : testDrives
    const term = search.trim().toLowerCase()
    const visible = !term
      ? queued
      : queued.filter(item =>
          `${leadName(item, pt)} ${vehicleName(item, pt)} ${item.vehicle?.stockNumber || ''} ${item.vehicle?.vin || ''}`.toLowerCase().includes(term)
        )
    return [...visible].sort((a, b) =>
      sortOrder === 'recent'
        ? new Date(b.scheduledTime || 0).getTime() - new Date(a.scheduledTime || 0).getTime()
        : new Date(a.scheduledTime || '9999-12-31').getTime() - new Date(b.scheduledTime || '9999-12-31').getTime()
    )
  }, [testDrives, filter, search, sortOrder])

  const verifyLicense = async (testDrive: TestDrive) => {
    setUpdatingId(testDrive.id)
    const response = await verifyTestDriveLicense(testDrive.id)

    if (!response.success) alert(`${text('Unable to verify license', 'Não foi possível validar a habilitação')}: ${response.error}`)
    await loadTestDrives()
    setUpdatingId(null)
  }

  const completeDrive = async (testDrive: TestDrive) => {
    setUpdatingId(testDrive.id)
    const updateDrive = await completeTestDrive({
      id: testDrive.id,
      interestedLevel: interestDrafts[testDrive.id] || 'maybe',
      feedback: feedbackDrafts[testDrive.id] || '',
    })

    if (!updateDrive.success) {
      alert(`${text('Unable to complete test drive', 'Não foi possível concluir o test-drive')}: ${updateDrive.error}`)
      setUpdatingId(null)
      return
    }

    await loadTestDrives()
    setUpdatingId(null)
  }

  const markNoShow = async () => {
    const testDrive = noShowTarget
    if (!testDrive) return
    setUpdatingId(testDrive.id)
    setNoShowError(null)
    const response = await markTestDriveNoShow(testDrive.id)

    if (!response.success) {
      setNoShowError(response.error || text('Unable to mark no-show.', 'Não foi possível registrar o não comparecimento.'))
      setUpdatingId(null)
      return
    }
    setNoShowTarget(null)
    await loadTestDrives()
    setUpdatingId(null)
  }

  const confirmCancel = async () => {
    const testDrive = cancelTarget
    if (!testDrive) return
    setUpdatingId(testDrive.id)
    setCancelError(null)
    const response = await cancelTestDrive(testDrive.id)

    if (!response.success) {
      setCancelError(response.error || text('Unable to cancel this test drive.', 'Não foi possível cancelar este test-drive.'))
      setUpdatingId(null)
      return
    }
    setCancelTarget(null)
    await loadTestDrives()
    setUpdatingId(null)
  }

  const isFiltered = Boolean(search.trim()) || filter !== 'all'
  const resetFilters = () => {
    setSearch('')
    setFilter('all')
  }

  const counts = {
    pastDue: testDrives.filter(isPastDue).length,
    today: testDrives.filter(testDrive => isToday(testDrive.scheduledTime, timeZone)).length,
    upcoming: testDrives.filter(testDrive => isOpen(testDrive) && isUpcoming(testDrive.scheduledTime)).length,
    completed: testDrives.filter(isCompleted).length,
    noShow: testDrives.filter(isNoShow).length,
    cancelled: testDrives.filter(isCancelled).length,
    all: testDrives.length,
  }

  const now = Date.now()
  // Today's open drives and any past-due drive still open (out, or waiting on a no-show call), earliest first.
  const onDeck = testDrives
    .filter(testDrive => isOpen(testDrive) && (isPastDue(testDrive) || isToday(testDrive.scheduledTime, timeZone)))
    .sort((a, b) => new Date(a.scheduledTime || '9999-12-31').getTime() - new Date(b.scheduledTime || '9999-12-31').getTime())

  const breadcrumbs = [
    { type: 'link' as const, label: text('Dashboard', 'Painel'), href: basePath },
    { type: 'page' as const, label: text('Platform', 'Plataforma') },
    { type: 'page' as const, label: text('Test Drives', 'Test-drives') },
  ]

  const header = (
    <DeskHeader
      title={text('Test drives', 'Test-drives')}
      tone={error ? 'bad' : counts.pastDue > 0 ? 'warn' : counts.today > 0 ? 'info' : 'idle'}
      status={error ? text('Unavailable', 'Indisponível') : counts.pastDue > 0 ? `${counts.pastDue} ${text('past due', 'em atraso')}` : `${counts.today} ${text('today', 'hoje')}`}
      meta={`${counts.today} ${text('today', 'hoje')} · ${counts.upcoming} ${text('upcoming', 'agendados')} · ${counts.pastDue} ${text('past due', 'em atraso')}`}
      actions={
        <>
          <Pill variant="plain" className="max-md:h-10" onClick={loadTestDrives} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            {text('Refresh', 'Atualizar')}
          </Pill>
          <Pill variant="primary" className="max-md:h-10" onClick={openSchedule}>
            <Plus />
            {text('Schedule test drive', 'Agendar test-drive')}
          </Pill>
        </>
      }
    />
  )

  const customerCell = (testDrive: TestDrive) => (
    testDrive.lead ? (
      <Link href={`${basePath}/platform/crm/${testDrive.lead.id}`} className="font-medium text-foreground hover:underline">
        {leadName(testDrive, pt)}
      </Link>
    ) : <span className="font-medium text-foreground">{leadName(testDrive, pt)}</span>
  )

  const vehicleCell = (testDrive: TestDrive) => (
    testDrive.vehicle ? (
      <Link href={`/inventory/${testDrive.vehicle.id}`} className="text-foreground hover:underline">{vehicleName(testDrive, pt)}</Link>
    ) : <span className="text-muted-foreground">{vehicleName(testDrive, pt)}</span>
  )

  const licenseStatus = (testDrive: TestDrive) => (
    testDrive.driverLicenseVerified
      ? <Status tone="ok">{text('License verified', 'CNH conferida')}</Status>
      : <Status tone="warn">{text('License needs check', 'Conferir CNH')}</Status>
  )

  const driveActions = (testDrive: TestDrive, section: string, align: 'start' | 'end' = 'end') => {
    if (!isOpen(testDrive)) return null
    const busy = updatingId === testDrive.id
    const key = `${section}:${testDrive.id}`
    return (
      <div className={`flex flex-wrap gap-2 ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
        {isPastDue(testDrive) && (
          <Pill size="sm" className="h-10 md:h-7" onClick={() => { setNoShowError(null); setNoShowTarget(testDrive) }} disabled={busy}>
            {text('No-show', 'Não compareceu')}
          </Pill>
        )}
        {!testDrive.driverLicenseVerified && (
          <Pill size="sm" className="h-10 md:h-7" onClick={() => verifyLicense(testDrive)} disabled={busy}>
            {text('Verify license', 'Conferir CNH')}
          </Pill>
        )}
        <Pill
          size="sm"
          variant={testDrive.driverLicenseVerified ? 'primary' : 'raised'}
          className="h-10 md:h-7"
          aria-expanded={expandedKey === key}
          aria-controls={`complete-${key}`}
          onClick={() => setExpandedKey(current => (current === key ? null : key))}
          disabled={busy || !testDrive.driverLicenseVerified}
          title={testDrive.driverLicenseVerified ? undefined : text('Verify the license first', 'Confira a CNH primeiro')}
        >
          {text('Complete', 'Concluir')}
        </Pill>
        {isUpcoming(testDrive.scheduledTime) && (
            <Pill size="sm" variant="plain" className="h-10 md:h-7" onClick={() => { setCancelError(null); setCancelTarget(testDrive) }} disabled={busy}>
            {text('Cancel', 'Cancelar')}
          </Pill>
        )}
      </div>
    )
  }

  const completionRow = (testDrive: TestDrive, section: string, colSpan: number) => {
    const key = `${section}:${testDrive.id}`
    if (expandedKey !== key || !isOpen(testDrive)) return null
    const busy = updatingId === testDrive.id
    return (
      <tr id={`complete-${key}`} className="border-b bg-muted/30 last:border-b-0">
        <td colSpan={colSpan} className="px-4 py-3">
          <div className="grid min-w-0 gap-2 md:grid-cols-[12rem_minmax(0,1fr)_auto] md:items-start">
            <Select
              value={interestDrafts[testDrive.id] || 'maybe'}
              onValueChange={value => setInterestDrafts(prev => ({ ...prev, [testDrive.id]: value }))}
              disabled={Boolean(testDrive.completed)}
            >
              <SelectTrigger className="h-10 rounded-[4px] text-[13px] md:h-9" aria-label={pt ? `Interesse de ${leadName(testDrive, pt)}` : `Interest level for ${leadName(testDrive, pt)}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="not-interested">{text('Not interested', 'Sem interesse')}</SelectItem>
                <SelectItem value="maybe">{text('Maybe', 'Talvez')}</SelectItem>
                <SelectItem value="very-interested">{text('Very interested', 'Muito interessado')}</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              value={feedbackDrafts[testDrive.id] || ''}
              onChange={event => setFeedbackDrafts(prev => ({ ...prev, [testDrive.id]: event.target.value }))}
              placeholder={text('Feedback', 'Observações')}
              aria-label={pt ? `Observações sobre ${leadName(testDrive, pt)}` : `Feedback for ${leadName(testDrive, pt)}`}
              disabled={Boolean(testDrive.completed)}
              className="min-h-14 rounded-[4px] text-sm"
            />
            <div className="flex justify-end gap-2">
              <Pill variant="plain" className="h-10 md:h-8" onClick={() => setExpandedKey(null)} disabled={busy}>{text('Cancel', 'Cancelar')}</Pill>
              <Pill
                variant="primary"
                className="h-10 md:h-8"
                onClick={async () => { await completeDrive(testDrive); setExpandedKey(null) }}
                disabled={busy || !testDrive.driverLicenseVerified}
              >
                {busy ? text('Saving…', 'Salvando…') : text('Complete drive', 'Concluir test-drive')}
              </Pill>
            </div>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <PageContainer title={text('Test Drives', 'Test-drives')} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {notice && (
          <Notice tone="ok">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0">{notice}</p>
              <Track>
                <Pill size="sm" variant="plain" onClick={() => setNotice(null)}>{text('Dismiss', 'Dispensar')}</Pill>
              </Track>
            </div>
          </Notice>
        )}

        <DeskSection id="test-drives-today" title={text('Today and past due', 'Hoje e em atraso')} count={error ? undefined : onDeck.length}>
          {error ? (
            <Notice tone="bad">
              <p className="font-medium">{text('Test drives unavailable', 'Test-drives indisponíveis')}</p>
              <p className="mt-0.5 text-muted-foreground">{error}</p>
              <Track className="mt-2">
                <Pill size="sm" onClick={loadTestDrives}>{text('Retry', 'Tentar novamente')}</Pill>
              </Track>
            </Notice>
          ) : onDeck.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{text('No drives today', 'Nenhum test-drive hoje')}</p>
          ) : (
            <DeskTable aria-label={text('Test drives today and past due', 'Test-drives de hoje e em atraso')}>
              <thead>
                <tr>
                  <Th align="right" className="w-24">{text('Time', 'Horário')}</Th>
                  <Th>{text('Customer', 'Cliente')}</Th>
                  <Th priority={2}>{text('Vehicle', 'Veículo')}</Th>
                  <Th priority={3}>{text('License', 'CNH')}</Th>
                  <Th className="w-0 max-md:hidden"><span className="sr-only">{text('Actions', 'Ações')}</span></Th>
                </tr>
              </thead>
              <tbody>
                {onDeck.map(testDrive => {
                  const pastDue = isPastDue(testDrive)
                  return (
                    <Fragment key={testDrive.id}>
                      <Tr>
                        <Td align="right" className="whitespace-nowrap">
                          <Figure size="sm">{formatTime(testDrive.scheduledTime, timeZone, locale)}</Figure>
                          {pastDue && testDrive.scheduledTime && (
                            <span className="mt-1 block"><Attention>{pt ? `há ${formatElapsedSince(testDrive.scheduledTime, now)}` : `${formatElapsedSince(testDrive.scheduledTime, now)} past`}</Attention></span>
                          )}
                          {pastDue && !isToday(testDrive.scheduledTime, timeZone) && (
                            <span className="block text-xs text-muted-foreground">{formatDay(testDrive.scheduledTime, timeZone, locale)}</span>
                          )}
                        </Td>
                        <Td className="min-w-0">
                          {customerCell(testDrive)}
                          <p className="break-words text-xs text-muted-foreground">
                            {pastDue ? text('Past due', 'Em atraso') : text('Today', 'Hoje')}
                            {' · '}
                            {formatPhone(testDrive.lead?.phone) || testDrive.lead?.email || text('No contact', 'Sem contato')}
                            {testDrive.salesperson?.name ? ` · ${testDrive.salesperson.name}` : ''}
                          </p>
                          <p className="break-words text-xs md:hidden">{vehicleCell(testDrive)}</p>
                          <div className="mt-2 md:hidden">{driveActions(testDrive, 'today', 'start')}</div>
                          <p className="text-xs lg:hidden">{testDrive.driverLicenseVerified ? <span className="text-muted-foreground">{pt ? 'CNH verificada' : 'License verified'}</span> : <span className="text-amber-700 dark:text-amber-300">{pt ? 'CNH precisa ser conferida' : 'License needs check'}</span>}</p>
                        </Td>
                        <Td priority={2} className="min-w-0">
                          {vehicleCell(testDrive)}
                          {testDrive.vehicle?.stockNumber && <p><Code>#{testDrive.vehicle.stockNumber}</Code></p>}
                        </Td>
                        <Td priority={3}>{licenseStatus(testDrive)}</Td>
                        <Td className="max-md:hidden">{driveActions(testDrive, 'today')}</Td>
                      </Tr>
                      {completionRow(testDrive, 'today', 5)}
                    </Fragment>
                  )
                })}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>

        <section aria-labelledby="test-drives-all" className="min-w-0 space-y-3">
          <h2 id="test-drives-all" className="text-[15px] font-semibold text-foreground">{text('All test drives', 'Todos os test-drives')}</h2>
          <Segmented<QueueFilter>
            label={text('Filter test drives', 'Filtrar test-drives')}
            value={filter}
            onChange={setFilter}
            className="max-md:[&_button]:h-10"
            options={[
              { value: 'today', label: text('Today', 'Hoje'), count: counts.today },
              { value: 'upcoming', label: text('Upcoming', 'Agendados'), count: counts.upcoming },
              { value: 'past-due', label: text('Past due', 'Em atraso'), count: counts.pastDue },
              { value: 'completed', label: text('Completed', 'Concluídos'), count: counts.completed },
              { value: 'no-show', label: text('No-show', 'Não compareceram'), count: counts.noShow },
              { value: 'cancelled', label: text('Cancelled', 'Cancelados'), count: counts.cancelled },
              { value: 'all', label: text('All', 'Todos'), count: counts.all },
            ]}
          />
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 rounded-[4px] pl-9 text-[13px] sm:h-9"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder={text('Customer, stock or VIN', 'Cliente, estoque ou chassi')}
                aria-label={text('Search test drives', 'Buscar test-drives')}
              />
            </div>
            <Select value={sortOrder} onValueChange={setSortOrder}>
              <SelectTrigger className="h-10 w-[9.5rem] shrink-0 rounded-[4px] px-2.5 text-[13px] sm:h-9" aria-label={text('Sort test drives', 'Ordenar test-drives')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">{text('Soonest first', 'Mais próximos')}</SelectItem>
                <SelectItem value="recent">{text('Latest first', 'Mais recentes')}</SelectItem>
              </SelectContent>
            </Select>
            {loading && (
              <span className="text-xs text-muted-foreground" role="status">
                Refreshing…
              </span>
            )}
          </div>

          {error ? null : filteredTestDrives.length === 0 ? (
            <Panel className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {testDrives.length > 0 && isFiltered ? text('No matching test drives', 'Nenhum test-drive corresponde à busca') : text('No test drives', 'Nenhum test-drive cadastrado')}
              </p>
              {testDrives.length > 0 && isFiltered && (
                <Track>
                  <Pill size="sm" className="max-md:h-10" onClick={resetFilters}>{text('Reset filters', 'Limpar filtros')}</Pill>
                </Track>
              )}
            </Panel>
          ) : (
            <DeskTable aria-label={text('Test drives', 'Test-drives')}>
              <thead>
                <tr>
                  <Th className="w-28">{text('When', 'Quando')}</Th>
                  <Th>{text('Customer', 'Cliente')}</Th>
                  <Th priority={2}>{text('Vehicle', 'Veículo')}</Th>
                  <Th priority={3}>{text('License', 'CNH')}</Th>
                  <Th>{text('Status', 'Status')}</Th>
                  <Th className="w-0 max-md:hidden"><span className="sr-only">{text('Actions', 'Ações')}</span></Th>
                </tr>
              </thead>
              <tbody>
                {filteredTestDrives.map(testDrive => {
                  const state = driveState(testDrive, pt)
                  return (
                    <Fragment key={testDrive.id}>
                      <Tr>
                        <Td className="whitespace-nowrap">
                          <p className="font-medium tabular-nums text-foreground">{formatTime(testDrive.scheduledTime, timeZone, locale)}</p>
                          <p className="text-[12px] text-muted-foreground" title={formatDateTime(testDrive.scheduledTime, timeZone, locale)}>{formatDay(testDrive.scheduledTime, timeZone, locale)}</p>
                        </Td>
                        <Td className="min-w-0">
                          {customerCell(testDrive)}
                          <p className="break-words text-xs text-muted-foreground">
                            {formatPhone(testDrive.lead?.phone) || testDrive.lead?.email || text('No contact', 'Sem contato')}
                            {testDrive.salesperson?.name ? ` · ${testDrive.salesperson.name}` : ''}
                          </p>
                          <p className="break-words text-xs md:hidden">{vehicleCell(testDrive)}</p>
                          <div className="mt-2 md:hidden">{driveActions(testDrive, 'all', 'start')}</div>
                          {testDrive.completed && !testDrive.noShow && !testDrive.cancelledAt && (
                            <p className="mt-0.5 break-words text-xs">
                              <span className="font-medium text-foreground">{pt ? ({ 'Not interested': 'Sem interesse', Maybe: 'Talvez', 'Very interested': 'Muito interessado' } as Record<string, string>)[interestLabels[testDrive.interestedLevel || '']] || testDrive.interestedLevel || '-' : interestLabels[testDrive.interestedLevel || ''] || testDrive.interestedLevel || '-'}</span>
                              {testDrive.feedback && <span className="whitespace-pre-line text-muted-foreground"> · {testDrive.feedback}</span>}
                            </p>
                          )}
                          {(testDrive.cancelledAt || testDrive.noShow) && (
                            <p className="text-xs text-muted-foreground">{testDrive.cancelledAt ? text('Cancelled', 'Cancelado') : text('No-show', 'Não compareceu')}</p>
                          )}
                        </Td>
                        <Td priority={2} className="min-w-0">
                          {vehicleCell(testDrive)}
                          <p className="text-xs text-muted-foreground">
                            {testDrive.vehicle?.stockNumber && <Code>#{testDrive.vehicle.stockNumber}</Code>}
                            {testDrive.vehicle?.price != null && testDrive.vehicle.price > 0 && (
                              <span className="tabular-nums">{testDrive.vehicle?.stockNumber ? ' · ' : ''}{formatCurrency(testDrive.vehicle.price, locale)}</span>
                            )}
                          </p>
                        </Td>
                        <Td priority={3}>{isOpen(testDrive) ? licenseStatus(testDrive) : <span className="text-muted-foreground">-</span>}</Td>
                        <Td><Status tone={state.tone}>{state.label}</Status></Td>
                        <Td className="max-md:hidden">{driveActions(testDrive, 'all')}</Td>
                      </Tr>
                      {completionRow(testDrive, 'all', 6)}
                    </Fragment>
                  )
                })}
              </tbody>
            </DeskTable>
          )}
        </section>

        <Dialog
          open={Boolean(noShowTarget)}
          onOpenChange={open => { if (!open && !updatingId) { setNoShowTarget(null); setNoShowError(null) } }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{text('Mark no-show?', 'Marcar falta?')}</DialogTitle>
              <DialogDescription>
                {noShowTarget ? `${leadName(noShowTarget, pt)} · ${vehicleName(noShowTarget, pt)} · ${formatDateTime(noShowTarget.scheduledTime, timeZone, locale)}` : null}
              </DialogDescription>
            </DialogHeader>
            {noShowError && <Notice tone="bad">{noShowError}</Notice>}
            <DialogFooter>
              <Track>
                <Pill variant="plain" className="max-sm:h-11" onClick={() => { setNoShowTarget(null); setNoShowError(null) }} disabled={Boolean(updatingId)}>
                  Cancel
                </Pill>
                <Pill variant="primary" className="max-sm:h-11" onClick={markNoShow} disabled={Boolean(updatingId)}>
                  {updatingId && updatingId === noShowTarget?.id ? text('Saving', 'Salvando') : text('Mark no-show', 'Marcar falta')}
                </Pill>
              </Track>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(cancelTarget)}
          onOpenChange={open => { if (!open && !updatingId) { setCancelTarget(null); setCancelError(null) } }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{text('Cancel this test drive?', 'Cancelar este test-drive?')}</DialogTitle>
              <DialogDescription>
                {cancelTarget ? `${leadName(cancelTarget, pt)} · ${vehicleName(cancelTarget, pt)} · ${formatDateTime(cancelTarget.scheduledTime, timeZone, locale)}. ${text("The time goes back on the vehicle's schedule. This can't be undone.", 'O horário voltará à agenda do veículo. Esta ação não pode ser desfeita.')}` : null}
              </DialogDescription>
            </DialogHeader>
            {cancelError && <Notice tone="bad">{cancelError}</Notice>}
            <DialogFooter>
              <Track>
                <Pill variant="plain" className="max-sm:h-11" onClick={() => { setCancelTarget(null); setCancelError(null) }} disabled={Boolean(updatingId)}>
                  {text('Keep it', 'Manter agendamento')}
                </Pill>
                <Pill variant="primary" className="max-sm:h-11" onClick={confirmCancel} disabled={Boolean(updatingId)}>
                  {updatingId && updatingId === cancelTarget?.id ? text('Cancelling', 'Cancelando') : text('Cancel test drive', 'Cancelar test-drive')}
                </Pill>
              </Track>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <OperatorActionDialog
          open={Boolean(schedule)}
          title={text('Schedule test drive', 'Agendar test-drive')}
          fields={scheduleFields(vehicleOptions, pt)}
          values={schedule?.values || {}}
          error={scheduleError}
          busy={scheduleBusy}
          submitLabel={text('Schedule', 'Agendar')}
          onValuesChange={values => setSchedule(current => (current ? { ...current, values } : null))}
          onSubmit={submitSchedule}
          onOpenChange={open => {
            if (!open) {
              setSchedule(null)
              setScheduleError(null)
            }
          }}
        />
      </div>
    </PageContainer>
  )
}
