'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { Code, Notice, Panel, Pill, Readout, ReadoutStrip, Segmented, TitleLine, Track, type DeskTone } from '@/features/platform/components/desk'
import { EmptyRow, TAP, TAP_INPUT } from '@/features/platform/catalog/components/formKit'
import { cn } from '@/lib/utils'
import { type OutboxCounts, type OutboxEvent, getOutbox } from '../actions'
import { formatAge, formatDateTime } from '../lib/time'

type StatusFilter = 'pending' | 'processing' | 'failed' | 'delivered' | 'all'
const STATUS_TONE: Record<string, DeskTone> = { pending: 'warn', processing: 'info', failed: 'bad', delivered: 'ok' }
const STATUS_LABEL: Record<string, string> = { pending: 'Pending', processing: 'Processing', failed: 'Failed', delivered: 'Delivered' }

export function OutboxPanel({ timeZone }: { timeZone: string }) {
  const { locale } = useLocale()
  const [status, setStatus] = useState<StatusFilter>('pending')
  const [topic, setTopic] = useState('')
  const [events, setEvents] = useState<OutboxEvent[]>([])
  const [counts, setCounts] = useState<OutboxCounts | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const topicRef = useRef('')

  const load = useCallback(async (nextStatus: StatusFilter, nextTopic: string) => {
    setLoading(true); setError(null)
    const response = await getOutbox(nextStatus, nextTopic)
    setLoading(false)
    if (!response.success || !response.data) { setError(response.success ? 'Outbox unavailable' : response.error); return }
    setEvents(response.data.events)
    setCounts(response.data.counts)
  }, [])

  useEffect(() => { void load(status, topicRef.current) }, [status, load])

  const total = counts ? counts.pending + counts.processing + counts.failed + counts.delivered : 0
  const oldestAge = formatAge(counts?.oldestPending)
  const tone: DeskTone = !counts ? 'idle' : counts.failed ? 'bad' : counts.pending ? 'warn' : 'ok'

  return (
    <div className="space-y-4">
      {error && <Notice tone="bad">{error}</Notice>}
      {counts && (
        <Notice tone={tone}>
          {counts.pending > 0 && counts.delivered === 0 && counts.processing === 0
            ? 'Dispatcher: not running. Events stay pending.'
            : counts.failed > 0
              ? `${counts.failed} failed ${counts.failed === 1 ? 'delivery' : 'deliveries'}`
              : counts.pending > 0
                ? `${counts.pending} awaiting delivery`
                : 'All events delivered'}
        </Notice>
      )}

      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Segmented<StatusFilter>
          label="Filter outbox"
          value={status}
          onChange={setStatus}
          size="sm"
          options={[
            { value: 'pending', label: 'Pending', count: counts?.pending, tone: counts?.pending ? 'warn' : undefined },
            { value: 'processing', label: 'Processing', count: counts?.processing },
            { value: 'failed', label: 'Failed', count: counts?.failed, tone: counts?.failed ? 'bad' : undefined },
            { value: 'delivered', label: 'Delivered', count: counts?.delivered },
            { value: 'all', label: 'All', count: counts ? total : undefined },
          ]}
        />
        <form
          className="flex min-w-0 gap-2 sm:flex-1"
          onSubmit={event => { event.preventDefault(); topicRef.current = topic; void load(status, topic) }}
        >
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className={cn('pl-9', TAP_INPUT)} value={topic} onChange={event => setTopic(event.target.value)} placeholder="Topic, e.g. deal." aria-label="Search by topic" />
          </div>
          <Track>
            <Pill type="submit" className={TAP} disabled={loading}>
              <RefreshCw className={loading ? 'animate-spin' : undefined} />
              {loading ? 'Loading…' : 'Apply'}
            </Pill>
          </Track>
        </form>
      </div>

      <Panel className="overflow-hidden">
        {loading && events.length === 0 ? (
          <EmptyRow>Loading…</EmptyRow>
        ) : events.length === 0 ? (
          <EmptyRow>No outbox events match</EmptyRow>
        ) : (
          <ul className="divide-y">
            {events.map(event => (
              <li key={event.id} className="min-w-0 px-4 py-3">
                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <TitleLine as="p" tone={STATUS_TONE[event.status] || 'idle'} status={STATUS_LABEL[event.status] || event.status} className="break-all text-sm font-medium">{event.topic}</TitleLine>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(event.availableAt, timeZone, locale)}</span>
                </div>
                <p className="mt-0.5 break-words text-xs text-muted-foreground">
                  {[STATUS_LABEL[event.status] || event.status, `${event.aggregateType} ${event.aggregateId.slice(-10)}`, `${event.attemptCount} ${event.attemptCount === 1 ? 'attempt' : 'attempts'}`, event.processedAt ? `Processed ${formatDateTime(event.processedAt, timeZone, locale)}` : null].filter(Boolean).join(' · ')}
                </p>
                {event.lastError && <p className="mt-1 break-words text-xs text-red-600 dark:text-red-400">{event.lastError}</p>}
                <p className="mt-0.5 break-all"><Code>{event.deliveryKey}</Code></p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <ReadoutStrip>
        <Readout label="Pending" value={counts?.pending ?? '-'} tone={counts?.pending ? 'warn' : undefined} sub={oldestAge ? `Oldest ${oldestAge}` : undefined} />
        <Readout label="Processing" value={counts?.processing ?? '-'} />
        <Readout label="Failed" value={counts?.failed ?? '-'} tone={counts?.failed ? 'bad' : undefined} />
        <Readout label="Delivered" value={counts?.delivered ?? '-'} tone={counts?.delivered ? 'ok' : undefined} />
      </ReadoutStrip>
    </div>
  )
}
