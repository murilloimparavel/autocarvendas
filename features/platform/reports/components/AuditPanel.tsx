'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Code, Notice, Panel, Pill, Track } from '@/features/platform/components/desk'
import { EmptyRow, Field, TAP, TAP_INPUT } from '@/features/platform/catalog/components/formKit'
import { type AuditEvent, type AuditQuery, type ReportRooftop, searchAudit } from '../actions'
import { formatDateTime, zonedDayStart } from '../lib/time'

type Filters = { aggregateType: string; aggregateId: string; action: string; rooftopId: string; from: string; to: string }
const EMPTY: Filters = { aggregateType: '', aggregateId: '', action: '', rooftopId: 'all', from: '', to: '' }
const LIMIT = 200

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || (typeof value === 'object' && Object.keys(value as object).length === 0)) return null
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-3 font-mono text-xs">{JSON.stringify(value, null, 2)}</pre>
    </div>
  )
}

export function AuditPanel({ rooftops, timeZone }: { rooftops: ReportRooftop[]; timeZone: string }) {
  const { locale } = useLocale()
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [knownTypes, setKnownTypes] = useState<string[]>([])
  const started = useRef(false)

  const run = async (next: Filters) => {
    const errors: Record<string, string> = {}
    const since = next.from ? zonedDayStart(next.from, timeZone) : null
    const until = next.to ? zonedDayStart(next.to, timeZone, 1) : null
    if (next.from && !since) errors.from = 'Date is invalid'
    if (next.to && !until) errors.to = 'Date is invalid'
    if (since && until && since >= until) errors.to = 'To must be on or after From'
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    setLoading(true); setError(null)
    const query: AuditQuery = {
      aggregateType: next.aggregateType,
      aggregateId: next.aggregateId,
      action: next.action,
      rooftopId: next.rooftopId === 'all' ? undefined : next.rooftopId,
      since: since?.toISOString(),
      until: until?.toISOString(),
      limit: LIMIT,
    }
    const response = await searchAudit(query)
    setLoading(false)
    if (!response.success) { setError(response.error); setEvents([]); return }
    const rows = response.data || []
    setEvents(rows)
    setKnownTypes(current => [...new Set([...current, ...rows.map(row => row.aggregateType)])].sort())
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    void run(EMPTY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const set = (key: keyof Filters, value: string) => setFilters(current => ({ ...current, [key]: value }))
  const applied = useMemo(() => Object.entries(filters).some(([key, value]) => (key === 'rooftopId' ? value !== 'all' : Boolean(value))), [filters])
  const drill = (event: AuditEvent) => {
    const next = { ...filters, aggregateType: event.aggregateType, aggregateId: event.aggregateId }
    setFilters(next)
    void run(next)
  }

  return (
    <div className="space-y-4">
      <form noValidate onSubmit={event => { event.preventDefault(); void run(filters) }} className="space-y-3">
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field id="audit-type" label="Record type">
            <Input id="audit-type" className={TAP_INPUT} list="audit-type-options" maxLength={100} placeholder="Deal" value={filters.aggregateType} onChange={event => set('aggregateType', event.target.value)} />
            <datalist id="audit-type-options">{knownTypes.map(type => <option key={type} value={type} />)}</datalist>
          </Field>
          <Field id="audit-id" label="Record ID">
            <Input id="audit-id" className={TAP_INPUT} maxLength={100} value={filters.aggregateId} onChange={event => set('aggregateId', event.target.value)} />
          </Field>
          <Field id="audit-action" label="Action contains">
            <Input id="audit-action" className={TAP_INPUT} maxLength={100} placeholder="submitted" value={filters.action} onChange={event => set('action', event.target.value)} />
          </Field>
          <Field id="audit-from" label="From" error={fieldErrors.from}>
            <Input id="audit-from" type="date" className={TAP_INPUT} value={filters.from} aria-invalid={Boolean(fieldErrors.from)} onChange={event => set('from', event.target.value)} />
          </Field>
          <Field id="audit-to" label="To" error={fieldErrors.to}>
            <Input id="audit-to" type="date" className={TAP_INPUT} value={filters.to} aria-invalid={Boolean(fieldErrors.to)} onChange={event => set('to', event.target.value)} />
          </Field>
          {rooftops.length > 1 && (
            <Field id="audit-rooftop" label="Rooftop">
              <Select value={filters.rooftopId} onValueChange={value => set('rooftopId', value)}>
                <SelectTrigger id="audit-rooftop" className={TAP_INPUT}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All rooftops</SelectItem>
                  {rooftops.map(rooftop => <SelectItem key={rooftop.id} value={rooftop.id}>{rooftop.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
        <Track>
          {applied && (
            <Pill className={TAP} disabled={loading} onClick={() => { setFilters(EMPTY); void run(EMPTY) }}>
              <X />
              Clear
            </Pill>
          )}
          <Pill type="submit" variant="primary" className={TAP} disabled={loading}>
            <Search />
            {loading ? 'Searching…' : 'Search'}
          </Pill>
        </Track>
      </form>

      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex items-baseline justify-between gap-2 border-b pb-2">
        <h2 className="text-[15px] font-semibold">Events <span className="text-[13px] font-normal tabular-nums text-muted-foreground">{events.length}{events.length === LIMIT ? '+' : ''}</span></h2>
        <span className="text-[12px] text-muted-foreground">Newest first</span>
      </div>
      {events.length === LIMIT && <Notice tone="warn">Newest {LIMIT} shown</Notice>}

      <Panel className="overflow-hidden">
        {loading && events.length === 0 ? (
          <EmptyRow>Loading…</EmptyRow>
        ) : events.length === 0 ? (
          <EmptyRow>No audit events match</EmptyRow>
        ) : (
          <ul className="divide-y">
            {events.map(event => {
              const open = expanded === event.id
              return (
                <li key={event.id} className="min-w-0">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : event.id)}
                    className="flex min-h-11 w-full min-w-0 items-start gap-3 px-4 py-3 text-left hover:bg-muted/40"
                  >
                    {open ? <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium">{event.aggregateType} <span className="text-muted-foreground">·</span> {event.action}</p>
                      <p className="mt-0.5 break-words text-xs text-muted-foreground">
                        {[formatDateTime(event.occurredAt, timeZone, locale), event.actor?.name || event.actor?.email || (locale === 'pt-BR' ? 'Sistema' : 'System'), rooftops.length > 1 ? event.rooftop?.name : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <Code className="hidden shrink-0 sm:inline">{event.aggregateId.slice(-10)}</Code>
                  </button>
                  {open && (
                    <div className="space-y-3 border-t bg-muted/20 px-4 py-3">
                      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                        <p className="min-w-0 break-all text-xs">
                          <span className="text-muted-foreground">Record </span><Code>{event.aggregateId}</Code>
                        </p>
                        <Track>
                          <Pill size="sm" className="h-11 sm:h-7" onClick={() => drill(event)}>All events for this record</Pill>
                        </Track>
                      </div>
                      <p className="break-all text-xs"><span className="text-muted-foreground">Event key </span><Code>{event.eventKey}</Code></p>
                      <JsonBlock label="Before" value={event.beforeSnapshot} />
                      <JsonBlock label="After" value={event.afterSnapshot} />
                      <JsonBlock label="Metadata" value={event.metadata} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}
