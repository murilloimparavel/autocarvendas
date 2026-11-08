'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronDown, ChevronRight, FileOutput, RefreshCw, Upload } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { useLocale } from '@/features/i18n/LocaleProvider'
import type { Locale } from '@/features/i18n/messages'
import { Code, DeskHeader, DeskSection, DeskTable, Figure, Notice, Pill, Readout, ReadoutStrip, Segmented, Status, Td, Th, Tr, Track, type DeskTone } from '@/features/platform/components/desk'
import { getInventoryWorkspace, recordInventoryFeedRun, type InventoryVehicle } from '../actions'
import { getFeedHistory, recordMarketplaceExport, type FeedRun } from '../actions/feed'
import { selectPublicFeedRunCandidates } from '../lib/publicFeedCandidates'
import {
  normalizePublicFeedRunResult,
  publicFeedRunResultMessage,
  resolvePublicFeedRunAttempt,
  UNCONFIRMED_PUBLIC_FEED_RUN_MESSAGE,
  type PublicFeedRunAttempt,
} from '../lib/publicFeedRunOutcome'
import { feedChannelLabels, feedStatusLabels, feedStatusTones, formatDateTime } from '../lib/inventoryLabels'
import { countLabel } from '@/features/platform/lib/format'

type StatusFilter = 'all' | 'succeeded' | 'partial' | 'failed'
type ExportRow = { included: boolean; error: string }

const VEHICLES_HREF = `${basePath}/platform/vehicles`
const runStatusTones: Record<string, DeskTone> = { succeeded: 'ok', partial: 'warn', failed: 'bad' }
const runStatusLabels: Record<string, string> = { succeeded: 'Succeeded', partial: 'Partial', failed: 'Failed' }
const feedHistoryLabelsPt: Record<string, string> = {
  Dashboard: 'Painel', Platform: 'Plataforma', Inventory: 'Estoque', Feed: 'Integração de estoque', Unavailable: 'Indisponível', Succeeded: 'Concluído', Partial: 'Parcial', Failed: 'Falhou',
  'Last run': 'Última execução', 'No runs': 'Nenhuma execução', succeeded: 'concluída', partial: 'parcial', live: 'publicados', 'ready to publish': 'prontos para publicar', Refresh: 'Atualizar', 'No active units': 'Nenhum veículo ativo', 'Record export': 'Registrar exportação',
  'No vehicles are ready to publish.': 'Não há veículos prontos para publicação.', 'Feed already published': 'Estoque já publicado', 'Feed published': 'Estoque publicado', vehicles: 'veículos', vehicle: 'veículo', failed: 'falharam',
  'We couldn’t confirm the feed was published. Retry to finish.': 'Não foi possível confirmar a publicação do estoque. Tente novamente para concluir.',
  'Export recorded:': 'Exportação registrada:', unit: 'veículo', units: 'veículos', refused: 'recusados', 'Select at least one unit': 'Selecione pelo menos um veículo', 'Unable to confirm the export was recorded. Retry to finish.': 'Não foi possível confirmar o registro da exportação. Tente novamente para concluir.',
  'Needs you': 'Aguardando sua ação', Key: 'Chave', Status: 'Situação', Actions: 'Ações', 'Feed failed': 'Falha na integração', 'Partly published': 'Publicado parcialmente', 'Ready, not published': 'Pronto, ainda não publicado', 'No failed or unpublished units.': 'Nenhum veículo com falha ou pendente de publicação.',
  'Units waiting on the feed': 'Veículos aguardando publicação', Vehicle: 'Veículo', 'Stock #': 'Estoque nº', Storefront: 'Vitrine', Live: 'Publicado', 'Not live': 'Não publicado', 'Not available': 'Indisponível', Runs: 'Execuções',
  'Filter by result': 'Filtrar por resultado', All: 'Todas', Channel: 'Canal', 'All channels': 'Todos os canais',
  'Loading feed runs': 'Carregando execuções da integração', 'Unable to load feed runs': 'Não foi possível carregar as execuções', Retry: 'Tentar novamente', 'No matches': 'Nenhum resultado encontrado', 'No feed runs': 'Nenhuma execução registrada', 'Reset filters': 'Limpar filtros',
  Result: 'Resultado', Completed: 'Concluída', 'Recorded by': 'Registrado por', Sent: 'Enviados', OK: 'Sucesso', errors: 'erros', error: 'erro', 'Whole run': 'Execução inteira',
  'Feed status by unit': 'Situação da integração por veículo', 'Ready to publish': 'Prontos para publicar', 'Failed runs': 'Execuções com falha', 'Record marketplace export': 'Registrar exportação para o portal', 'Units sent and any the marketplace refused': 'Veículos enviados e eventuais recusas do portal',
  'Export file or batch reference': 'Arquivo de exportação ou protocolo do lote', 'Refusal reason for': 'Motivo da recusa para', 'Refused? Enter the marketplace error': 'Recusado? Informe a mensagem de erro do portal', Cancel: 'Cancelar', 'Saving…': 'Salvando…',
  'Not published': 'Não publicado', Published: 'Publicado', 'Public inventory feed': 'Integração pública de estoque', 'Marketplace export': 'Exportação para portal', 'Feed runs': 'Execuções da integração', 'No vehicles ready': 'Nenhum veículo pronto para publicar',
  'Publish feed: no units are frontline with recon done and an approved listing.': 'Nenhum veículo está liberado para venda, com preparação concluída e anúncio aprovado.',
}

function feedHistoryLabel(locale: Locale, value: string) {
  return locale === 'pt-BR' ? feedHistoryLabelsPt[value] || value : value
}

export function FeedHistoryPageClient({
  initialRuns,
  initialCounts,
  initialVehicles,
  initialError,
  timeZone,
}: {
  initialRuns: FeedRun[]
  initialCounts: Record<string, number> | null
  initialVehicles: InventoryVehicle[]
  initialError: string | null
  timeZone: string
}) {
  const { locale } = useLocale()
  const text = (value: string) => feedHistoryLabel(locale, value)
  const [runs, setRuns] = useState(initialRuns)
  const [counts, setCounts] = useState(initialCounts)
  const [vehicles, setVehicles] = useState(initialVehicles)
  const [error, setError] = useState(initialError)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [channel, setChannel] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; tone: DeskTone } | null>(null)
  const [pendingFeedRun, setPendingFeedRun] = useState<PublicFeedRunAttempt | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportRows, setExportRows] = useState<Record<string, ExportRow>>({})
  const [exportKey, setExportKey] = useState('')
  const [exportReference, setExportReference] = useState('')
  const [exportError, setExportError] = useState<string | null>(null)
  const firstRun = useRef(true)

  const load = async (nextStatus = status, nextChannel = channel) => {
    setLoading(true)
    const [history, workspace] = await Promise.all([getFeedHistory(nextStatus, nextChannel), getInventoryWorkspace('all')])
    if (history.success) {
      setRuns(history.runs)
      setCounts(history.counts)
      setError(null)
    } else {
      setError(history.error)
    }
    if (workspace.success) setVehicles(workspace.vehicles)
    setLoading(false)
  }

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    void load(status, channel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, channel])

  const candidates = selectPublicFeedRunCandidates(vehicles)
  const liveCount = vehicles.filter(vehicle => vehicle.publicListing.live).length
  const exportable = vehicles.filter(vehicle => ['available', 'service'].includes(vehicle.status))
  const lastRun = runs[0]
  // Units the feed is holding up: a failed or partial push, or ready for the storefront but never published.
  const candidateIds = new Set(candidates.map(vehicle => vehicle.inventoryStockId))
  const feedWaiting = exportable
    .map(vehicle => ({
      vehicle,
      reason: vehicle.feedStatus === 'failed' ? text('Feed failed') : vehicle.feedStatus === 'partial' ? text('Partly published') : candidateIds.has(vehicle.inventoryStockId) && vehicle.feedStatus === 'not-published' ? text('Ready, not published') : null,
    }))
    .filter((entry): entry is { vehicle: InventoryVehicle; reason: string } => Boolean(entry.reason))
    .sort((a, b) => Number(b.vehicle.feedStatus === 'failed') - Number(a.vehicle.feedStatus === 'failed'))

  const publish = async () => {
    const attempt = resolvePublicFeedRunAttempt(pendingFeedRun, candidates.map(vehicle => vehicle.inventoryStockId), () => `public-feed:${crypto.randomUUID()}`)
    if (!attempt) {
      setMessage({ text: text('No vehicles are ready to publish.'), tone: 'idle' })
      return
    }
    setPendingFeedRun(attempt)
    setBusy('publish')
    setMessage(null)
    try {
      const response = await recordInventoryFeedRun({ channelKey: 'public-inventory-feed', stockIds: attempt.stockIds, errors: [], idempotencyKey: attempt.idempotencyKey })
      if (!response.success && response.rejected) {
        setPendingFeedRun(null)
        setMessage({ text: text(response.error), tone: 'bad' })
        return
      }
      const result = response.success ? normalizePublicFeedRunResult(response.data.recordInventoryFeedRun, attempt.stockIds.length) : null
      if (!result) {
        setMessage({ text: text(UNCONFIRMED_PUBLIC_FEED_RUN_MESSAGE), tone: 'warn' })
        return
      }
      setPendingFeedRun(null)
      const prefix = text(result.reused ? 'Feed already published' : 'Feed published')
      const runMessage = locale === 'pt-BR'
        ? `${prefix}: ${result.attemptedCount} ${text('vehicles')}, ${result.failedCount} ${text('failed')}.`
        : publicFeedRunResultMessage(result)
      setMessage({ text: runMessage, tone: result.failedCount ? 'warn' : 'ok' })
    } catch {
      setMessage({ text: text(UNCONFIRMED_PUBLIC_FEED_RUN_MESSAGE), tone: 'warn' })
    } finally {
      await load()
      setBusy(null)
    }
  }

  const openExport = () => {
    setExportRows(Object.fromEntries(exportable.map(vehicle => [vehicle.inventoryStockId, { included: vehicle.publicListing.live, error: '' }])))
    setExportKey(`marketplace-export:${crypto.randomUUID()}`)
    setExportReference('')
    setExportError(null)
    setMessage(null)
    setExportOpen(true)
  }

  const submitExport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const included = exportable.filter(vehicle => exportRows[vehicle.inventoryStockId]?.included)
    if (!included.length) {
      setExportError(text('Select at least one unit'))
      return
    }
    const errors = included.flatMap(vehicle => {
      const text = exportRows[vehicle.inventoryStockId]?.error.trim()
      return text ? [{ stockId: vehicle.inventoryStockId, errorCode: 'marketplace-rejected', message: text.slice(0, 1000), rowReference: exportReference.trim().slice(0, 200) || undefined }] : []
    })
    setBusy('export')
    setExportError(null)
    try {
      const response = await recordMarketplaceExport({ stockIds: included.map(vehicle => vehicle.inventoryStockId), errors, idempotencyKey: exportKey })
      if (!response.success) {
        setExportError(text(response.error))
        return
      }
      const run = response.data.recordInventoryFeedRun
      setExportOpen(false)
      const exportMessage = locale === 'pt-BR'
        ? `${text('Export recorded:')} ${run.attemptedCount} ${text(run.attemptedCount === 1 ? 'unit' : 'units')}, ${run.failedCount} ${text('refused')}.`
        : `Export recorded: ${countLabel(run.attemptedCount, 'unit')}, ${run.failedCount} refused.`
      setMessage({ text: exportMessage, tone: run.failedCount ? 'warn' : 'ok' })
      await load()
    } catch {
      setExportError(text('Unable to confirm the export was recorded. Retry to finish.'))
    } finally {
      setBusy(null)
    }
  }

  const breadcrumbs = [
    { type: 'link' as const, label: text('Dashboard'), href: basePath },
    { type: 'page' as const, label: text('Platform') },
    { type: 'link' as const, label: text('Inventory'), href: VEHICLES_HREF },
    { type: 'page' as const, label: text('Feed') },
  ]
  const header = (
    <DeskHeader
      eyebrow={<Link href={VEHICLES_HREF} className="inline-flex min-h-11 items-center gap-1 hover:text-foreground sm:min-h-0"><ArrowLeft className="size-3" /> {text('Inventory')}</Link>}
      title={text('Feed')}
      tone={error ? 'bad' : lastRun ? runStatusTones[lastRun.status] : 'idle'}
      status={error ? text('Unavailable') : lastRun ? `${text('Last run')} ${text(runStatusLabels[lastRun.status])}` : text('No runs')}
      meta={[error ? text('Unavailable') : lastRun ? `${text('Last run')} ${text((runStatusLabels[lastRun.status] || lastRun.status).toLowerCase())}` : text('No runs'), `${liveCount} ${text('live')}`, `${candidates.length} ${text('ready to publish')}`].join(' · ')}
      actions={
        <Track>
          <Pill variant="plain" onClick={() => void load()} disabled={loading} aria-label={text('Refresh')}><RefreshCw className={loading ? 'animate-spin' : undefined} /><span className="max-sm:sr-only">{text('Refresh')}</span></Pill>
          <Pill onClick={openExport} disabled={Boolean(busy) || !exportable.length} title={exportable.length ? undefined : text('No active units')}><FileOutput /> {text('Record export')}</Pill>
          <Pill variant="primary" onClick={publish} disabled={Boolean(busy) || (!candidates.length && !pendingFeedRun)} title={candidates.length || pendingFeedRun ? undefined : text('No vehicles ready')}>
            <Upload /> {text(pendingFeedRun ? 'Retry publishing' : 'Publish feed')}
          </Pill>
        </Track>
      }
    />
  )

  const statusOptions = [
    { value: 'all' as StatusFilter, label: text('All'), count: counts?.all },
    { value: 'succeeded' as StatusFilter, label: text('Succeeded'), count: counts?.succeeded, tone: 'ok' as DeskTone },
    { value: 'partial' as StatusFilter, label: text('Partial'), count: counts?.partial, tone: 'warn' as DeskTone },
    { value: 'failed' as StatusFilter, label: text('Failed'), count: counts?.failed, tone: 'bad' as DeskTone },
  ]

  return (
    <PageContainer title={text('Feed')} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-6 px-4 pb-24 md:px-6">
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {!candidates.length && !pendingFeedRun && <Notice tone="idle">{text('Publish feed: no units are frontline with recon done and an approved listing.')}</Notice>}

        {!error && (
          <DeskSection title={text('Needs you')} count={feedWaiting.length} id="feed-needs-you">
            {feedWaiting.length === 0 ? (
              <p className="py-3 text-[13px] text-muted-foreground">{text('No failed or unpublished units.')}</p>
            ) : (
              <DeskTable aria-label={text('Units waiting on the feed')}>
                <thead>
                  <tr>
                    <Th>{text('Vehicle')}</Th>
                    <Th priority={2}>{text('Stock #')}</Th>
                    <Th>{text('Feed')}</Th>
                    <Th priority={3}>{text('Storefront')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {feedWaiting.map(({ vehicle, reason }) => (
                    <Tr key={vehicle.inventoryStockId}>
                      <Td className="min-w-0">
                        <Link href={`${VEHICLES_HREF}/${vehicle.id}`} className="font-medium text-foreground hover:underline">{vehicle.year} {vehicle.make} {vehicle.model}</Link>
                        <div className="mt-0.5 md:hidden"><Code>{vehicle.stockNumber}</Code></div>
                      </Td>
                      <Td priority={2}><Code className="text-foreground">{vehicle.stockNumber}</Code></Td>
                      <Td><Status tone={feedStatusTones[vehicle.feedStatus] === 'idle' ? 'warn' : feedStatusTones[vehicle.feedStatus]}>{reason}</Status></Td>
                      <Td priority={3} className="text-muted-foreground">{vehicle.publicListing.live ? text('Live') : `${text('Not live')}: ${vehicle.publicListing.reason || text('Not available')}`}</Td>
                    </Tr>
                  ))}
                </tbody>
              </DeskTable>
            )}
          </DeskSection>
        )}

        <DeskSection title={text('Runs')} count={loading || error ? undefined : runs.length}>
          <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Segmented label={text('Filter by result')} value={status} onChange={setStatus} options={statusOptions} className="min-w-0 self-stretch sm:self-auto" />
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="w-full rounded-[4px] max-md:h-10 sm:w-[220px]" aria-label={text('Channel')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{text('All channels')}</SelectItem>
                {Object.entries(feedChannelLabels).map(([value, label]) => <SelectItem key={value} value={value}>{text(label)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {loading && runs.length === 0 ? (
            <div className="flex justify-center py-12" role="status"><RefreshCw className="size-5 animate-spin text-muted-foreground" aria-hidden="true" /><span className="sr-only">{text('Loading feed runs')}</span></div>
          ) : error ? (
            <Notice tone="bad">
              <p className="font-medium">{text('Unable to load feed runs')}</p>
              <p className="mt-0.5 text-muted-foreground">{text(error)}</p>
              <Track className="mt-2"><Pill size="sm" onClick={() => void load()}>{text('Retry')}</Pill></Track>
            </Notice>
          ) : runs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">{text(status !== 'all' || channel !== 'all' ? 'No matches' : 'No feed runs')}</p>
              {(status !== 'all' || channel !== 'all') && <Track><Pill size="sm" onClick={() => { setStatus('all'); setChannel('all') }}>{text('Reset filters')}</Pill></Track>}
            </div>
          ) : (
            <DeskTable aria-label={text('Feed runs')}>
              <thead>
                <tr>
                  <Th>{text('Channel')}</Th>
                  <Th>{text('Result')}</Th>
                  <Th priority={2}>{text('Completed')}</Th>
                  <Th priority={3}>{text('Recorded by')}</Th>
                  <Th align="right" priority={2}>{text('Sent')}</Th>
                  <Th align="right" priority={3}>{text('OK')}</Th>
                  <Th align="right">{text('Failed')}</Th>
                </tr>
              </thead>
              <tbody>
                {runs.map(run => {
                  const open = expanded === run.id
                  return [
                    <Tr key={run.id} className={open ? 'border-b-0' : undefined}>
                      <Td className="min-w-0">
                        <p className="font-medium text-foreground">{text(feedChannelLabels[run.channelKey] || run.channelKey)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground md:hidden">{formatDateTime(run.completedAt, timeZone, locale)} · {run.attemptedCount} {text('Sent').toLowerCase()}</p>
                        {run.errors.length > 0 && (
                          <Pill size="sm" variant="plain" className="-ml-2.5 mt-1 max-md:h-10" aria-expanded={open} onClick={() => setExpanded(open ? null : run.id)}>
                            {open ? <ChevronDown /> : <ChevronRight />} {run.errors.length} {text(run.errors.length === 1 ? 'error' : 'errors')}
                          </Pill>
                        )}
                      </Td>
                      <Td><Status tone={runStatusTones[run.status]}>{text(runStatusLabels[run.status] || run.status)}</Status></Td>
                      <Td priority={2} className="whitespace-nowrap text-muted-foreground">{formatDateTime(run.completedAt, timeZone, locale)}</Td>
                      <Td priority={3} className="text-muted-foreground">{run.recordedBy?.name || '-'}</Td>
                      <Td align="right" priority={2}>{run.attemptedCount}</Td>
                      <Td align="right" priority={3}>{run.succeededCount}</Td>
                      <Td align="right"><span className="sr-only">{text('Failed')} </span><Figure size="sm" className={run.failedCount ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground'}>{run.failedCount}</Figure></Td>
                    </Tr>,
                    open ? (
                      <tr key={`${run.id}-errors`} className="border-b">
                        <td colSpan={7} className="px-4 pb-3">
                          <ul className="divide-y rounded-md border">
                            {run.errors.map(item => (
                              <li key={item.id} className="min-w-0 px-3 py-2 text-sm">
                                <p className="flex flex-wrap items-baseline gap-x-2">
                                  <Code className="text-foreground">{item.errorCode}</Code>
                                  {item.stock?.vehicle ? (
                                    <Link href={`${VEHICLES_HREF}/${item.stock.vehicle.id}`} className="hover:underline">
                                      {item.stock.stockNumber} · {item.stock.vehicle.year} {item.stock.vehicle.make} {item.stock.vehicle.model}
                                    </Link>
                                  ) : <span className="text-muted-foreground">{text('Whole run')}</span>}
                                  {item.rowReference && <Code>{item.rowReference}</Code>}
                                </p>
                                <p className="break-words text-xs text-muted-foreground">{item.message}</p>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null,
                  ]
                })}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>

        <DeskSection title={text('Feed status by unit')} count={exportable.length}>
          {exportable.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{text('No active units')}</p> : (
            <DeskTable aria-label={text('Feed status by unit')}>
              <thead>
                <tr>
                  <Th>{text('Vehicle')}</Th>
                  <Th priority={2}>{text('Stock #')}</Th>
                  <Th>{text('Feed')}</Th>
                  <Th priority={2}>{text('Storefront')}</Th>
                </tr>
              </thead>
              <tbody>
                {exportable.map(vehicle => (
                  <Tr key={vehicle.inventoryStockId}>
                    <Td className="min-w-0">
                      <Link href={`${VEHICLES_HREF}/${vehicle.id}`} className="font-medium text-foreground hover:underline">{vehicle.year} {vehicle.make} {vehicle.model}</Link>
                      <div className="mt-0.5 md:hidden"><Code>{vehicle.stockNumber}</Code></div>
                    </Td>
                    <Td priority={2}><Code className="text-foreground">{vehicle.stockNumber}</Code></Td>
                    <Td><Status tone={feedStatusTones[vehicle.feedStatus]}>{text(feedStatusLabels[vehicle.feedStatus] || vehicle.feedStatus)}</Status></Td>
                    <Td priority={2}>
                      {vehicle.publicListing.live ? <Status tone="ok">{text('Live')}</Status> : <span className="text-muted-foreground">{text('Not live')}: {vehicle.publicListing.reason || text('Not available')}</span>}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>

        <ReadoutStrip>
          <Readout label={text('Live')} value={liveCount} tone={liveCount ? 'ok' : undefined} />
          <Readout label={text('Ready to publish')} value={candidates.length} />
          <Readout label={text('Runs')} value={counts?.all ?? '-'} />
          <Readout label={text('Failed runs')} value={counts ? (counts.failed || 0) + (counts.partial || 0) : '-'} tone={counts && (counts.failed || counts.partial) ? 'warn' : undefined} />
        </ReadoutStrip>

        <Dialog open={exportOpen} onOpenChange={open => { if (!open && busy !== 'export') setExportOpen(false) }}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{text('Record marketplace export')}</DialogTitle>
              <DialogDescription>{text('Units sent and any the marketplace refused')}</DialogDescription>
            </DialogHeader>
            <form onSubmit={submitExport} className="space-y-4">
              <label htmlFor="export-reference" className="grid gap-1.5 text-sm">
                <span className="text-[12px] font-medium text-muted-foreground">{text('Export file or batch reference')}</span>
                <Input id="export-reference" maxLength={200} value={exportReference} onChange={event => setExportReference(event.target.value)} className="max-sm:h-11" />
              </label>
              <ul className="divide-y rounded-md border">
                {exportable.map(vehicle => {
                  const row = exportRows[vehicle.inventoryStockId] || { included: false, error: '' }
                  const update = (patch: Partial<ExportRow>) => setExportRows(current => ({ ...current, [vehicle.inventoryStockId]: { ...row, ...patch } }))
                  return (
                    <li key={vehicle.inventoryStockId} className="grid gap-2 px-3 py-2">
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <input type="checkbox" className="size-4" checked={row.included} disabled={busy === 'export'} onChange={event => update({ included: event.target.checked })} />
                        <span className="min-w-0 break-words">{vehicle.stockNumber} · {vehicle.year} {vehicle.make} {vehicle.model}</span>
                      </label>
                      {row.included && (
                        <Input aria-label={`${text('Refusal reason for')} ${vehicle.stockNumber}`} placeholder={text('Refused? Enter the marketplace error')} maxLength={1000} value={row.error} disabled={busy === 'export'} onChange={event => update({ error: event.target.value })} className="max-sm:h-11" />
                      )}
                    </li>
                  )
                })}
              </ul>
              {exportError && <Notice tone="bad">{text(exportError)}</Notice>}
              <DialogFooter className="sm:justify-end">
                <Track>
                  <Pill variant="plain" className="max-sm:h-11" disabled={busy === 'export'} onClick={() => setExportOpen(false)}>{text('Cancel')}</Pill>
                  <Pill type="submit" variant="primary" className="max-sm:h-11" disabled={busy === 'export'}>{busy === 'export' ? text('Saving…') : text('Record export')}</Pill>
                </Track>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </PageContainer>
  )
}
