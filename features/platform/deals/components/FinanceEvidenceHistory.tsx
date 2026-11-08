'use client'

import { useState } from 'react'
import { ChevronRight, RefreshCw } from 'lucide-react'
import { Notice, Pill, Track } from '@/features/platform/components/desk'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { getDealTimeline, type DomainTimelineEntry } from '../actions'

export function FinanceEvidenceHistory({ dealId, aggregateType, label, timeZone }: {
  dealId: string
  aggregateType: 'Deal' | 'FinanceFundingCase' | 'DeliveryCase'
  label: string
  timeZone?: string
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const [entries, setEntries] = useState<DomainTimelineEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await getDealTimeline(aggregateType, dealId)
      if (!result.success || !result.data) throw new Error(result.error || (pt ? 'A solicitação falhou' : 'Request failed'))
      setEntries(result.data.domainTimeline)
    } catch (error) {
      setError(pt ? `Histórico indisponível: ${error instanceof Error ? error.message : 'A solicitação falhou'}` : `History is unavailable: ${error instanceof Error ? error.message : 'Request failed'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <details
      className="group min-w-0 text-sm"
      onToggle={event => {
        if (event.currentTarget.open && entries === null && !busy) void load()
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 py-1.5 text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      <span className="shrink-0 text-[12px] text-muted-foreground">{pt ? '20 mais recentes' : 'Latest 20'}</span>
      </summary>
      <div className="space-y-2 pb-2 pl-5 pt-1">
        <Track>
          <Pill size="sm" disabled={busy} onClick={() => void load()}>
            <RefreshCw className={busy ? 'animate-spin' : undefined} />
            {busy ? (pt ? 'Carregando…' : 'Loading…') : (pt ? 'Atualizar histórico' : 'Refresh history')}
          </Pill>
        </Track>
        {error && <Notice tone="warn" role="status">{error}</Notice>}
        {entries?.length === 0 && <p className="text-xs text-muted-foreground">{pt ? 'Nenhum histórico disponível' : 'No history'}</p>}
        {entries && entries.length > 0 && (
          <ol className="divide-y rounded-md border">
            {entries.map(entry => (
              <li key={entry.id} className="min-w-0">
                <details className="group/entry">
                  <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 break-words font-mono text-xs text-foreground">{entry.action}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{new Date(entry.occurredAt).toLocaleString(locale, { timeZone, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-xs text-muted-foreground">{entry.actor?.name || (pt ? 'Desconhecido' : 'Unknown')}</span>
                  </summary>
                  <pre className="mx-3 mb-3 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 font-mono text-xs text-muted-foreground">
                    {JSON.stringify(entry.afterSnapshot, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  )
}
