'use client'

import { useState } from 'react'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { basePath } from '@/features/dashboard/lib/config'
import { Attention, DeskHeader, DeskSection, Pill, Segmented, Status, type DeskTone } from '@/features/platform/components/desk'
import { TAP } from '@/features/platform/catalog/components/formKit'
import { type ReportRun, type ReportsData, getReportsData } from '../actions'
import { AuditPanel } from '../components/AuditPanel'
import { OutboxPanel } from '../components/OutboxPanel'
import { RunsPanel, type RunStatusFilter } from '../components/RunsPanel'
import { SavedReportsPanel } from '../components/SavedReportsPanel'
import { effectiveRunStatus, reportTypeLabel } from '../lib/reportOptions'
import { formatDateTime } from '../lib/time'
import { countLabel } from '@/features/platform/lib/format'

export type ReportsTab = 'saved' | 'runs' | 'audit' | 'outbox'

type QueueItem = {
  key: string
  status: string
  tone: DeskTone
  title: string
  detail: string
  attention?: string
  action: string
  reportId: string
  runStatus: RunStatusFilter
}

export function ReportsPageClient({ initialData, initialTab, timeZone }: { initialData: ReportsData; initialTab: ReportsTab; timeZone: string }) {
  const { locale } = useLocale()
  const [data, setData] = useState(initialData)
  const [tab, setTab] = useState<ReportsTab>(initialTab)
  const [runReportFilter, setRunReportFilter] = useState('all')
  const [runStatusFilter, setRunStatusFilter] = useState<RunStatusFilter>('all')
  const [runsKey, setRunsKey] = useState(0)
  const [loading, setLoading] = useState(false)

  const reload = async () => {
    setLoading(true)
    try { setData(await getReportsData()) } finally { setLoading(false) }
  }

  const changeTab = (next: ReportsTab) => {
    setTab(next)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', next)
    window.history.replaceState(null, '', url)
  }

  const openRuns = (reportId: string, status: RunStatusFilter) => {
    setRunReportFilter(reportId)
    setRunStatusFilter(status)
    setRunsKey(current => current + 1)
    changeTab('runs')
  }

  const activeReports = data.savedReports.data.filter(report => report.active).length
  const queuedRuns = data.runs.data.filter(run => effectiveRunStatus(run) === 'queued')
  const failedRuns = data.runs.data.filter(run => effectiveRunStatus(run) === 'failed').length
  const error = data.savedReports.error || data.runs.error

  // Needs you: reports whose latest run failed, runs still queued, and scheduled reports past their due time with nothing queued.
  const latestRun = new Map<string, ReportRun>()
  for (const run of data.runs.data) if (run.savedReport && !latestRun.has(run.savedReport.id)) latestRun.set(run.savedReport.id, run)
  const queuedReportIds = new Set(queuedRuns.map(run => run.savedReport?.id).filter(Boolean))
  const now = Date.now()
  const queue: QueueItem[] = [
    ...[...latestRun.values()]
      .filter(run => effectiveRunStatus(run) === 'failed')
      .map(run => ({
        key: `failed-${run.id}`,
        status: 'Failed',
        tone: 'bad' as DeskTone,
        title: run.savedReport?.name || 'Deleted report',
        detail: [run.errorCode, `${locale === 'pt-BR' ? 'Última execução' : 'Last run'} ${formatDateTime(run.completedAt || run.createdAt, timeZone, locale)}`].filter(Boolean).join(' · '),
        action: 'View runs',
        reportId: run.savedReport?.id || 'all',
        runStatus: 'failed' as RunStatusFilter,
      })),
    ...queuedRuns.map(run => ({
      key: `queued-${run.id}`,
      status: 'Queued',
      tone: 'info' as DeskTone,
      title: run.savedReport?.name || 'Deleted report',
      detail: `${locale === 'pt-BR' ? 'Na fila' : 'Queued'} ${formatDateTime(run.createdAt, timeZone, locale)}`,
      action: 'Process',
      reportId: run.savedReport?.id || 'all',
      runStatus: 'queued' as RunStatusFilter,
    })),
    ...data.savedReports.data
      .filter(report => report.active && report.schedule !== 'manual' && report.nextRunAt && new Date(report.nextRunAt).getTime() <= now && !queuedReportIds.has(report.id))
      .map(report => ({
        key: `due-${report.id}`,
        status: 'Due',
        tone: 'warn' as DeskTone,
        title: report.name,
        detail: `${reportTypeLabel(report.reportType)} · ${locale === 'pt-BR' ? 'previsto para' : 'due'} ${formatDateTime(report.nextRunAt, timeZone, locale)}`,
        attention: 'Overdue',
        action: 'Queue',
        reportId: 'all',
        runStatus: 'all' as RunStatusFilter,
      })),
  ]

  const stateWords = error
    ? 'Unavailable'
    : queue.length
      ? `${queue.length} need${queue.length === 1 ? 's' : ''} you`
      : 'Up to date'

  const header = (
    <DeskHeader
      title="Reports"
      tone={error ? 'bad' : failedRuns ? 'bad' : queuedRuns.length ? 'info' : 'idle'}
      status={stateWords}
      meta={
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-medium text-foreground">{stateWords}</span>
          <span>{countLabel(activeReports, 'active saved report')} · {countLabel(data.runs.data.length, 'run')} · {queuedRuns.length} queued</span>
        </span>
      }
      actions={
        <Pill variant="plain" className={TAP} onClick={reload} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : undefined} />
          Refresh
        </Pill>
      }
    />
  )

  return (
    <PageContainer
      title="Reports"
      header={header}
      breadcrumbs={[
        { type: 'link', label: 'Dashboard', href: basePath },
        { type: 'page', label: 'Platform' },
        { type: 'page', label: 'Reports' },
      ]}
    >
      <div className="min-w-0 max-w-full space-y-6 px-4 pb-24 md:px-6">
        {queue.length > 0 && (
          <DeskSection id="reports-needs-you" title="Needs you" count={queue.length}>
            <ul className="divide-y rounded-md border bg-card">
              {queue.map(item => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => openRuns(item.reportId, item.runStatus)}
                    className="grid min-h-12 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-4 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:grid-cols-[6.5rem_minmax(0,1fr)_auto_6.5rem]"
                  >
                    <span className="max-sm:hidden"><Status tone={item.tone}>{item.status}</Status></span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-foreground">{item.title}</span>
                      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[12px] text-muted-foreground">
                        <span className="sm:hidden"><Status tone={item.tone} className="text-[12px]">{item.status}</Status></span>
                        <span className="truncate">{item.detail}</span>
                      </span>
                    </span>
                    <span className="text-right">{item.attention && <Attention>{item.attention}</Attention>}</span>
                    <span className="inline-flex items-center justify-end gap-1 text-[12px] font-medium text-foreground max-sm:hidden">
                      {item.action}
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </DeskSection>
        )}

        <div className="space-y-4">
          <Segmented<ReportsTab>
            label="Reports section"
            value={tab}
            onChange={changeTab}
            options={[
              { value: 'saved', label: 'Saved reports', count: data.savedReports.data.length },
              { value: 'runs', label: 'Runs', count: data.runs.data.length, tone: failedRuns ? 'bad' : queuedRuns.length ? 'info' : undefined },
              { value: 'audit', label: 'Audit' },
              { value: 'outbox', label: 'Outbox' },
            ]}
          />
          {tab === 'saved' && (
            <SavedReportsPanel
              reports={data.savedReports.data}
              runs={data.runs.data}
              rooftops={data.rooftops}
              error={data.savedReports.error}
              timeZone={timeZone}
              onReload={reload}
              onShowRuns={reportId => openRuns(reportId, 'all')}
            />
          )}
          {tab === 'runs' && (
            <RunsPanel
              key={runsKey}
              runs={data.runs.data}
              reports={data.savedReports.data}
              error={data.runs.error}
              timeZone={timeZone}
              reportFilter={runReportFilter}
              onReportFilterChange={setRunReportFilter}
              onReload={reload}
              initialStatusFilter={runStatusFilter}
            />
          )}
          {tab === 'audit' && <AuditPanel rooftops={data.rooftops} timeZone={timeZone} />}
          {tab === 'outbox' && <OutboxPanel timeZone={timeZone} />}
        </div>
      </div>
    </PageContainer>
  )
}
