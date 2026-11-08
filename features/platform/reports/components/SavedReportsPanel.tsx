'use client'

import { useMemo, useState } from 'react'
import { Download, History, Pencil, Play, Plus, Power, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { DeskTable, Notice, Panel, Pill, Segmented, Status, Td, Th, Tr, Track } from '@/features/platform/components/desk'
import { EmptyRow, Field, FormDialog, TAP, TAP_INPUT, TAP_SM } from '@/features/platform/catalog/components/formKit'
import { cn } from '@/lib/utils'
import { type ReportRooftop, type ReportRun, type SavedReport, runReport, saveReport } from '../actions'
import { downloadReportRun } from '../lib/downloadRun'
import { EXPORT_FORMATS, REPORT_FILTER_FIELDS, REPORT_TYPES, RUN_STATE, SCHEDULES, describeFilters, effectiveRunStatus, reportOptionLabel, reportTypeLabel, runStatusLabel, scheduleLabel } from '../lib/reportOptions'
import { formatDateTime } from '../lib/time'

type StateFilter = 'active' | 'inactive' | 'all'
type Draft = {
  reportId?: string
  expectedUpdatedAt?: string
  rooftopId: string
  name: string
  reportType: string
  exportFormat: string
  schedule: string
  active: boolean
  filters: Record<string, string>
}

export function SavedReportsPanel({
  reports,
  runs,
  rooftops,
  error,
  timeZone,
  onReload,
  onShowRuns,
}: {
  reports: SavedReport[]
  runs: ReportRun[]
  rooftops: ReportRooftop[]
  error: string | null
  timeZone: string
  onReload: () => Promise<void>
  onShowRuns: (reportId: string) => void
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const [stateFilter, setStateFilter] = useState<StateFilter>('active')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string; runId?: string } | null>(null)

  const lastRun = useMemo(() => {
    const map = new Map<string, ReportRun>()
    for (const run of runs) if (run.savedReport && !map.has(run.savedReport.id)) map.set(run.savedReport.id, run)
    return map
  }, [runs])
  const counts = { active: reports.filter(report => report.active).length, inactive: reports.filter(report => !report.active).length, all: reports.length }
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return reports
      .filter(report => stateFilter === 'all' || (stateFilter === 'active' ? report.active : !report.active))
      .filter(report => typeFilter === 'all' || report.reportType === typeFilter)
      .filter(report => !term || report.name.toLowerCase().includes(term))
  }, [reports, stateFilter, typeFilter, search])

  const open = (report?: SavedReport) => {
    setFieldErrors({}); setFormError(null)
    setIdempotencyKey(`desk-report:${crypto.randomUUID()}`)
    setDraft(report
      ? {
          reportId: report.id,
          expectedUpdatedAt: report.updatedAt,
          rooftopId: report.rooftop?.id || '',
          name: report.name,
          reportType: report.reportType,
          exportFormat: report.exportFormat,
          schedule: report.schedule,
          active: report.active,
          filters: Object.fromEntries(Object.entries(report.filters || {}).map(([key, value]) => [key, String(value)])),
        }
      : { rooftopId: rooftops[0]?.id || '', name: '', reportType: 'operations', exportFormat: 'csv', schedule: 'manual', active: true, filters: {} })
  }

  const submit = async () => {
    if (!draft) return
    const errors: Record<string, string> = {}
    const name = draft.name.trim()
    if (!draft.rooftopId) errors.rooftopId = pt ? 'Selecione uma unidade' : 'Choose a rooftop'
    if (!name) errors.name = pt ? 'Informe o nome' : 'Name is required'
    else if (name.length > 100) errors.name = pt ? 'O nome é muito longo' : 'Name is too long'
    const filters: Record<string, string | number> = {}
    for (const field of REPORT_FILTER_FIELDS[draft.reportType] || []) {
      const value = (draft.filters[field.key] || '').trim()
      if (!value || value === 'any') continue
      if (field.kind === 'days') {
        const days = Number(value)
        if (!Number.isInteger(days) || days < 1 || days > 366) { errors[`filter-${field.key}`] = pt ? 'Informe um número inteiro de 1 a 366' : 'Whole number from 1 to 366'; continue }
        filters[field.key] = days
      } else {
        if (field.kind === 'text' && value.length > field.maxLength) { errors[`filter-${field.key}`] = pt ? 'Texto muito longo' : 'Too long'; continue }
        filters[field.key] = value
      }
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    setBusy(true); setFormError(null)
    const response = await saveReport({
      reportId: draft.reportId,
      expectedUpdatedAt: draft.expectedUpdatedAt,
      rooftopId: draft.rooftopId,
      name,
      reportType: draft.reportType,
      exportFormat: draft.exportFormat,
      schedule: draft.schedule,
      filters,
      active: draft.active,
      idempotencyKey,
    })
    setBusy(false)
    if (!response.success) { setFormError(response.error); return }
    setNotice({ tone: 'ok', text: draft.reportId ? (pt ? `${name} salvo` : `Saved ${name}`) : (pt ? `${name} criado` : `Created ${name}`) })
    setDraft(null)
    await onReload()
  }

  const toggle = async (report: SavedReport) => {
    if (!report.rooftop) return
    setWorkingId(report.id); setNotice(null)
    const response = await saveReport({
      reportId: report.id,
      expectedUpdatedAt: report.updatedAt,
      rooftopId: report.rooftop.id,
      name: report.name,
      reportType: report.reportType,
      exportFormat: report.exportFormat,
      schedule: report.schedule,
      filters: report.filters || {},
      active: !report.active,
      idempotencyKey: `desk-report:${report.id}:${report.active ? 'off' : 'on'}:${report.updatedAt}`,
    })
    setWorkingId(null)
    if (!response.success) { setNotice({ tone: 'bad', text: response.error }); return }
    setNotice({ tone: 'ok', text: `${report.name} ${report.active ? (pt ? 'pausado' : 'paused') : (pt ? 'retomado' : 'resumed')}` })
    await onReload()
  }

  const run = async (report: SavedReport) => {
    setWorkingId(report.id); setNotice(null)
    const response = await runReport({ reportId: report.id, idempotencyKey: `desk-run:${crypto.randomUUID()}` })
    setWorkingId(null)
    if (!response.success) { setNotice({ tone: 'bad', text: response.error }); return }
    setNotice({ tone: 'ok', text: pt ? `Relatório ${report.name} executado` : `${report.name} ran`, runId: response.data?.id })
    await onReload()
  }

  const download = async (runId: string) => {
    const failure = await downloadReportRun(runId)
    if (failure) setNotice({ tone: 'bad', text: failure })
  }

  const filterFields = draft ? REPORT_FILTER_FIELDS[draft.reportType] || [] : []

  return (
    <div className="space-y-4">
      {error && <Notice tone="bad">{error}</Notice>}
      {notice && (
        <Notice tone={notice.tone}>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <span>{notice.text}</span>
            {notice.runId && (
              <Track>
                <Pill size="sm" className={TAP_SM} onClick={() => download(notice.runId as string)}>
                  <Download />
                  {pt ? 'Baixar' : 'Download'}
                </Pill>
              </Track>
            )}
          </div>
        </Notice>
      )}
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Segmented<StateFilter>
          label={pt ? 'Filtrar relatórios salvos' : 'Filter saved reports'}
          value={stateFilter}
          onChange={setStateFilter}
          size="sm"
          options={[
            { value: 'active', label: pt ? 'Ativos' : 'Active', count: counts.active, tone: 'ok' },
            { value: 'inactive', label: pt ? 'Pausados' : 'Paused', count: counts.inactive, tone: 'idle' },
            { value: 'all', label: pt ? 'Todos' : 'All', count: counts.all },
          ]}
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className={`${TAP_INPUT} w-full sm:w-56`} aria-label={pt ? 'Tipo de relatório' : 'Report type'}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{pt ? 'Todos os tipos de relatório' : 'All report types'}</SelectItem>
            {REPORT_TYPES.map(type => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative min-w-0 sm:max-w-xs sm:flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className={cn('pl-9', TAP_INPUT)} value={search} onChange={event => setSearch(event.target.value)} placeholder={pt ? 'Nome do relatório' : 'Report name'} aria-label={pt ? 'Buscar relatórios salvos' : 'Search saved reports'} />
        </div>
        <Track className="sm:ml-auto">
          <Pill variant="primary" className={TAP} disabled={rooftops.length === 0} onClick={() => open()}>
            <Plus />
            {pt ? 'Novo relatório' : 'New report'}
          </Pill>
        </Track>
      </div>

      {visible.length === 0 ? (
        <Panel>
          <EmptyRow>{pt ? (reports.length === 0 ? 'Nenhum relatório salvo' : 'Nenhum relatório corresponde à busca') : reports.length === 0 ? 'No saved reports yet' : 'No reports match'}</EmptyRow>
        </Panel>
      ) : (
        <DeskTable>
          <thead>
            <tr>
              <Th>{pt ? 'Situação' : 'Status'}</Th>
              <Th>{pt ? 'Relatório' : 'Report'}</Th>
              <Th priority={3}>{pt ? 'Tipo' : 'Type'}</Th>
              <Th priority={2}>{pt ? 'Frequência' : 'Schedule'}</Th>
              <Th priority={2}>{pt ? 'Última execução' : 'Last run'}</Th>
              <Th align="right" priority={3}><span className="sr-only">{pt ? 'Ações' : 'Actions'}</span></Th>
            </tr>
          </thead>
          <tbody>
            {visible.map(report => {
              const latest = lastRun.get(report.id)
              const latestStatus = latest ? effectiveRunStatus(latest) : null
              const filters = describeFilters(report.reportType, report.filters, locale)
              const nextDue = report.active && report.schedule !== 'manual' && report.nextRunAt ? formatDateTime(report.nextRunAt, timeZone, locale) : null
              const actions = (
                <Track className="flex-wrap justify-start lg:justify-end">
                  <Pill size="sm" className={TAP_SM} disabled={workingId === report.id} onClick={() => run(report)}>
                    <Play />
                    {workingId === report.id ? (pt ? 'Executando…' : 'Working…') : (pt ? 'Executar agora' : 'Run now')}
                  </Pill>
                  {latest && latestStatus === 'completed' && (
                    <Pill size="sm" variant="plain" className={TAP_SM} aria-label={pt ? `Baixar última execução de ${report.name}` : `Download last ${report.name} run`} onClick={() => download(latest.id)}>
                      <Download />
                    </Pill>
                  )}
                  <Pill size="sm" variant="plain" className={TAP_SM} aria-label={pt ? `Histórico de execução de ${report.name}` : `Run history for ${report.name}`} onClick={() => onShowRuns(report.id)}>
                    <History />
                  </Pill>
                  <Pill size="sm" variant="plain" className={TAP_SM} onClick={() => open(report)}>
                    <Pencil />
                    {pt ? 'Editar' : 'Edit'}
                  </Pill>
                  <Pill size="sm" variant="plain" className={TAP_SM} disabled={workingId === report.id} onClick={() => toggle(report)}>
                    <Power />
                    {report.active ? (pt ? 'Pausar' : 'Pause') : (pt ? 'Retomar' : 'Resume')}
                  </Pill>
                </Track>
              )
              return (
                <Tr key={report.id}>
                  <Td className="w-[1%] align-top md:align-middle">
                    <Status tone={report.active ? 'ok' : 'idle'}>{report.active ? (pt ? 'Ativo' : 'Active') : (pt ? 'Pausado' : 'Paused')}</Status>
                  </Td>
                  <Td className="min-w-0 max-w-[22rem]">
                    <span className="block break-words font-medium text-foreground">{report.name}</span>
                    <span className="block text-[12px] text-muted-foreground">
                      {[report.exportFormat.toUpperCase(), filters.length ? filters.join(' · ') : null, rooftops.length > 1 ? report.rooftop?.name : null].filter(Boolean).join(' · ')}
                    </span>
                    <span className="block text-[12px] text-muted-foreground md:hidden">
                      {[reportTypeLabel(report.reportType, locale), scheduleLabel(report.schedule, locale), nextDue ? `${pt ? 'Próxima execução' : 'Next due'} ${nextDue}` : null].filter(Boolean).join(' · ')}
                    </span>
                    <span className="block text-[12px] text-muted-foreground md:hidden">
                      {latest && latestStatus ? `${locale === 'pt-BR' ? 'Última execução' : 'Last run'} ${runStatusLabel(latestStatus, locale).toLowerCase()} ${formatDateTime(latest.completedAt || latest.createdAt, timeZone, locale)}` : locale === 'pt-BR' ? 'Nunca executado' : 'Never run'}
                    </span>
                    <div className="mt-2 lg:hidden">{actions}</div>
                  </Td>
                  <Td priority={3} className="whitespace-nowrap text-muted-foreground">{reportTypeLabel(report.reportType, locale)}</Td>
                  <Td priority={2} className="whitespace-nowrap">
                    <span className="block">{scheduleLabel(report.schedule, locale)}</span>
                    {nextDue && <span className="block text-[12px] text-muted-foreground">{pt ? 'Próxima' : 'Next'} {nextDue}</span>}
                  </Td>
                  <Td priority={2} className="whitespace-nowrap">
                    {latest && latestStatus ? (
                      <>
                        <Status tone={RUN_STATE[latestStatus].tone} className="text-[12px]">{runStatusLabel(latestStatus, locale)}</Status>
                        <span className="block text-[12px] text-muted-foreground">{formatDateTime(latest.completedAt || latest.createdAt, timeZone, locale)}</span>
                      </>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">{pt ? 'Nunca executado' : 'Never run'}</span>
                    )}
                  </Td>
                  <Td align="right" priority={3} className="w-[1%] whitespace-nowrap">{actions}</Td>
                </Tr>
              )
            })}
          </tbody>
        </DeskTable>
      )}

      <FormDialog
        open={draft !== null}
        title={pt ? (draft?.reportId ? 'Editar relatório salvo' : 'Novo relatório salvo') : draft?.reportId ? 'Edit saved report' : 'New saved report'}
        busy={busy}
        error={formError}
        onSubmit={submit}
        onOpenChange={value => { if (!value) setDraft(null) }}
        wide
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {!draft?.reportId && rooftops.length > 1 && (
            <Field id="report-rooftop" label={pt ? 'Loja' : 'Rooftop'} error={fieldErrors.rooftopId} className="sm:col-span-2">
              <Select value={draft?.rooftopId || ''} onValueChange={value => setDraft(current => current && { ...current, rooftopId: value })}>
                <SelectTrigger id="report-rooftop" className={TAP_INPUT}><SelectValue placeholder={pt ? 'Selecione uma loja' : 'Select rooftop'} /></SelectTrigger>
                <SelectContent>{rooftops.map(rooftop => <SelectItem key={rooftop.id} value={rooftop.id}>{rooftop.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
          <Field id="report-name" label={pt ? 'Nome' : 'Name'} error={fieldErrors.name} className="sm:col-span-2">
            <Input id="report-name" className={TAP_INPUT} maxLength={100} value={draft?.name || ''} aria-invalid={Boolean(fieldErrors.name)} onChange={event => setDraft(current => current && { ...current, name: event.target.value })} />
          </Field>
          <Field id="report-type" label={pt ? 'Tipo de relatório' : 'Report type'}>
            <Select value={draft?.reportType || 'operations'} onValueChange={value => setDraft(current => current && { ...current, reportType: value, filters: {} })}>
              <SelectTrigger id="report-type" className={TAP_INPUT}><SelectValue /></SelectTrigger>
              <SelectContent>{REPORT_TYPES.map(type => <SelectItem key={type.value} value={type.value}>{reportTypeLabel(type.value, locale)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field id="report-format" label={pt ? 'Formato de exportação' : 'Export format'}>
            <Select value={draft?.exportFormat || 'csv'} onValueChange={value => setDraft(current => current && { ...current, exportFormat: value })}>
              <SelectTrigger id="report-format" className={TAP_INPUT}><SelectValue /></SelectTrigger>
              <SelectContent>{EXPORT_FORMATS.map(format => <SelectItem key={format.value} value={format.value}>{reportOptionLabel(locale, format.label)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field id="report-schedule" label={pt ? 'Frequência' : 'Schedule'}>
            <Select value={draft?.schedule || 'manual'} onValueChange={value => setDraft(current => current && { ...current, schedule: value })}>
              <SelectTrigger id="report-schedule" className={TAP_INPUT}><SelectValue /></SelectTrigger>
              <SelectContent>{SCHEDULES.map(schedule => <SelectItem key={schedule.value} value={schedule.value}>{scheduleLabel(schedule.value, locale)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          {draft?.reportId && (
            <label htmlFor="report-active" className="flex min-h-11 items-center gap-3 self-end text-sm">
              <Switch id="report-active" checked={draft.active} onCheckedChange={checked => setDraft(current => current && { ...current, active: checked })} />
              {pt ? 'Ativo' : 'Active'}
            </label>
          )}
          {filterFields.length > 0 && <p className="text-[12px] font-medium text-muted-foreground sm:col-span-2">{pt ? 'Filtros' : 'Filters'}</p>}
          {filterFields.map(field => {
            const id = `report-filter-${field.key}`
            const value = draft?.filters[field.key] || ''
            const set = (next: string) => setDraft(current => current && { ...current, filters: { ...current.filters, [field.key]: next } })
            return (
              <Field key={field.key} id={id} label={reportOptionLabel(locale, field.label)} error={fieldErrors[`filter-${field.key}`]}>
                {field.kind === 'select' ? (
                  <Select value={value || 'any'} onValueChange={set}>
                    <SelectTrigger id={id} className={TAP_INPUT}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">{pt ? 'Qualquer' : 'Any'}</SelectItem>
                      {field.options.map(option => <SelectItem key={option.value} value={option.value}>{reportOptionLabel(locale, option.label)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input id={id} className={TAP_INPUT} inputMode={field.kind === 'days' ? 'numeric' : undefined} maxLength={field.kind === 'text' ? field.maxLength : 3} value={value} aria-invalid={Boolean(fieldErrors[`filter-${field.key}`])} onChange={event => set(event.target.value)} />
                )}
              </Field>
            )
          })}
        </div>
      </FormDialog>
    </div>
  )
}
