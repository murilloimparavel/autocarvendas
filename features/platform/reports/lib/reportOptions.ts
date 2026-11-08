/** Labels and filter definitions for saved reports. Filter keys match REPORT_FILTER_KEYS in features/keystone/mutations/reportingOperations.ts. */

export const REPORT_TYPES = [
  { value: 'operations', label: 'Operations summary' },
  { value: 'audit', label: 'Audit log' },
  { value: 'accounting-exceptions', label: 'Accounting exceptions' },
  { value: 'payment-reconciliation', label: 'Payment reconciliation' },
] as const

export const EXPORT_FORMATS = [
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
] as const

export const SCHEDULES = [
  { value: 'manual', label: 'Manual' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
] as const

export type FilterField =
  | { key: string; label: string; kind: 'text'; maxLength: number }
  | { key: string; label: string; kind: 'days' }
  | { key: string; label: string; kind: 'select'; options: Array<{ value: string; label: string }> }

const SINCE_DAYS: FilterField = { key: 'sinceDays', label: 'Last N days', kind: 'days' }

export const REPORT_FILTER_FIELDS: Record<string, FilterField[]> = {
  operations: [],
  audit: [
    { key: 'aggregateType', label: 'Record type', kind: 'text', maxLength: 100 },
    { key: 'action', label: 'Action contains', kind: 'text', maxLength: 100 },
    SINCE_DAYS,
  ],
  'accounting-exceptions': [
    { key: 'status', label: 'Status', kind: 'select', options: [{ value: 'failed', label: 'Failed' }, { value: 'posting', label: 'Posting' }] },
    SINCE_DAYS,
  ],
  'payment-reconciliation': [
    {
      key: 'status',
      label: 'Status',
      kind: 'select',
      options: ['creating', 'pending', 'authorized', 'captured', 'failed', 'canceled', 'partially-refunded', 'refunded'].map(value => ({ value, label: value.replace(/-/g, ' ').replace(/^./, letter => letter.toUpperCase()) })),
    },
    { key: 'reconciled', label: 'Reconciled', kind: 'select', options: [{ value: 'yes', label: 'Reconciled' }, { value: 'no', label: 'Not reconciled' }] },
    SINCE_DAYS,
  ],
}

const ptLabels: Record<string, string> = {
  'Operations summary': 'Resumo operacional', 'Audit log': 'Registro de auditoria',
  'Accounting exceptions': 'Exceções contábeis', 'Payment reconciliation': 'Conciliação de pagamentos',
  Manual: 'Manual', Daily: 'Diário', Weekly: 'Semanal', Monthly: 'Mensal',
  'Last N days': 'Últimos N dias', 'Record type': 'Tipo de registro', 'Action contains': 'Ação contém',
  Status: 'Situação', Failed: 'Com falha', Posting: 'Em lançamento', Reconciled: 'Conciliado', 'Not reconciled': 'Não conciliado',
}
const localized = (locale: 'pt-BR' | 'en-US', value: string) => locale === 'pt-BR' ? ptLabels[value] || value : value
export const reportOptionLabel = localized

export const reportTypeLabel = (value: string, locale: 'pt-BR' | 'en-US' = 'en-US') => localized(locale, REPORT_TYPES.find(type => type.value === value)?.label || value)
export const scheduleLabel = (value: string, locale: 'pt-BR' | 'en-US' = 'en-US') => localized(locale, SCHEDULES.find(schedule => schedule.value === value)?.label || value)

export function describeFilters(reportType: string, filters: Record<string, string | number> | null | undefined, locale: 'pt-BR' | 'en-US' = 'en-US') {
  const fields = REPORT_FILTER_FIELDS[reportType] || []
  return Object.entries(filters || {})
    .map(([key, value]) => {
      const field = fields.find(item => item.key === key)
      if (!field) return `${key}: ${value}`
      if (field.kind === 'days') return locale === 'pt-BR' ? `Últimos ${value} dias` : `Last ${value} days`
      if (field.kind === 'select') return `${localized(locale, field.label)}: ${localized(locale, field.options.find(option => option.value === value)?.label || String(value))}`
      return `${localized(locale, field.label)}: ${value}`
    })
}

export type RunStatus = 'queued' | 'completed' | 'failed' | 'expired'

/** Completed runs past expiresAt read as expired; the stored status is not rewritten. */
export function effectiveRunStatus(run: { status: string; expiresAt: string | null }, now = Date.now()): RunStatus {
  if (run.status === 'completed' && run.expiresAt && new Date(run.expiresAt).getTime() <= now) return 'expired'
  return (['queued', 'completed', 'failed', 'expired'].includes(run.status) ? run.status : 'failed') as RunStatus
}

export const RUN_STATE: Record<RunStatus, { tone: 'info' | 'ok' | 'bad' | 'idle'; label: string }> = {
  queued: { tone: 'info', label: 'Queued' },
  completed: { tone: 'ok', label: 'Completed' },
  failed: { tone: 'bad', label: 'Failed' },
  expired: { tone: 'idle', label: 'Expired' },
}

export function runStatusLabel(status: RunStatus, locale: 'pt-BR' | 'en-US') {
  if (locale === 'pt-BR') return ({ queued: 'Na fila', completed: 'Concluída', failed: 'Com falha', expired: 'Expirada' } as const)[status]
  return RUN_STATE[status].label
}
