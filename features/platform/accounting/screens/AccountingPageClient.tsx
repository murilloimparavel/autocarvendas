'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { Attention, Code, DeskHeader, DeskSection, DeskTable, Figure, Notice, Panel, Pill, Readout, ReadoutStrip, Segmented, Status, Td, Th, Tr, Track } from '@/features/platform/components/desk'
import { recordReference, countLabel } from '@/features/platform/lib/format'

import {
  configureAccountingMapping,
  deleteAccountingMapping,
  getAccountingBatches,
  getAccountingMappings,
  getStageSources,
  stageAccountingBatch,
} from '../actions'
import { CommandDialog, type CommandField, type FieldErrors } from '../components/CommandDialog'
import {
  ACCOUNTING_PROVIDER,
  BATCH_STATUSES,
  BATCH_STATUS_LABEL,
  SOURCE_CODES,
  SOURCE_TYPES,
  SOURCE_TYPE_LABEL,
  batchTone,
  dateTime,
  money,
  nonce,
  type AccountingSourceType,
} from '../lib/format'
import type { AccountingBatchListItem, AccountingMappingRecord, BatchCounts, RooftopOption, StageSourceOption } from '../lib/types'

type View = 'batches' | 'mappings'
type MappingForm = { mode: 'create' | 'edit'; values: Record<string, string> }

const EMPTY_COUNTS: BatchCounts = { all: 0, staged: 0, posting: 0, failed: 0, posted: 0, reconciled: 0, locked: 0 }
const ALL_FILTERS = { status: 'all', sourceType: 'all', search: '' }
const QUEUE_RANK: Record<string, number> = { failed: 0, staged: 1, posting: 2 }
const DAY_MS = 86_400_000

function ageDays(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / DAY_MS))
}

/** What the office has to do with an unposted batch. */
function nextStepLabel(batch: AccountingBatchListItem) {
  if (batch.status === 'failed') return 'Fix and queue again'
  if (batch.status === 'staged') return 'Queue for posting'
  return 'Record posting result'
}

export function AccountingPageClient({
  timeZone,
  initialBatches,
  initialCounts,
  initialBatchError,
  initialMappings,
  rooftops,
  initialMappingError,
}: {
  timeZone: string
  initialBatches: AccountingBatchListItem[]
  initialCounts: BatchCounts | null
  initialBatchError: string | null
  initialMappings: AccountingMappingRecord[]
  rooftops: RooftopOption[]
  initialMappingError: string | null
}) {
  const router = useRouter()
  const [view, setView] = useState<View>('batches')
  const [message, setMessage] = useState<string | null>(null)

  // Batches
  const [batches, setBatches] = useState(initialBatches)
  const [counts, setCounts] = useState<BatchCounts>(initialCounts ?? EMPTY_COUNTS)
  const [batchError, setBatchError] = useState(initialBatchError)
  const [batchLoading, setBatchLoading] = useState(false)
  const [status, setStatus] = useState('all')
  const [sourceType, setSourceType] = useState('all')
  const [search, setSearch] = useState('')
  const firstLoad = useRef(true)
  // The queue reads the unfiltered list, so tabs and search below do not hide unposted batches.
  const [queueSource, setQueueSource] = useState(initialBatches)
  const [queueError, setQueueError] = useState(initialBatchError)

  const loadBatches = useCallback(async (filters: { status: string; sourceType: string; search: string }) => {
    setBatchLoading(true)
    const result = await getAccountingBatches(filters)
    if (result.success) {
      setBatches(result.data.batches)
      setCounts(result.data.counts)
      setBatchError(null)
      if (filters.status === 'all' && filters.sourceType === 'all' && !filters.search.trim()) {
        setQueueSource(result.data.batches)
        setQueueError(null)
      }
    } else {
      setBatchError(result.error)
    }
    setBatchLoading(false)
  }, [])

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false
      return
    }
    const timer = setTimeout(() => loadBatches({ status, sourceType, search }), search ? 250 : 0)
    return () => clearTimeout(timer)
  }, [status, sourceType, search, loadBatches])

  // Mappings
  const [mappings, setMappings] = useState(initialMappings)
  const [mappingError, setMappingError] = useState(initialMappingError)
  const [mappingType, setMappingType] = useState<'all' | AccountingSourceType>('all')
  const [mappingRooftop, setMappingRooftop] = useState('all')
  const [mappingForm, setMappingForm] = useState<MappingForm | null>(null)
  const [mappingFieldErrors, setMappingFieldErrors] = useState<FieldErrors>({})
  const [mappingSubmitError, setMappingSubmitError] = useState<string | null>(null)
  const [mappingBusy, setMappingBusy] = useState(false)
  const [deleting, setDeleting] = useState<AccountingMappingRecord | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const loadMappings = useCallback(async () => {
    const result = await getAccountingMappings()
    if (result.success) {
      setMappings(result.data.accountingMappings || [])
      setMappingError(null)
    } else {
      setMappingError(result.error)
    }
  }, [])

  // Stage
  const [stageOpen, setStageOpen] = useState(false)
  const [stageValues, setStageValues] = useState<Record<string, string>>({ sourceType: 'deal', sourceId: '' })
  const [stageOptions, setStageOptions] = useState<StageSourceOption[]>([])
  const [stageOptionsState, setStageOptionsState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [stageFieldErrors, setStageFieldErrors] = useState<FieldErrors>({})
  const [stageError, setStageError] = useState<string | null>(null)
  const [stageBusy, setStageBusy] = useState(false)

  const loadStageOptions = useCallback(async (type: string) => {
    setStageOptionsState('loading')
    setStageOptions([])
    const result = await getStageSources(type)
    if (result.success) {
      setStageOptions(result.data)
      setStageOptionsState('idle')
    } else {
      setStageOptionsState('error')
    }
  }, [])

  const openStage = () => {
    setStageValues({ sourceType: 'deal', sourceId: '' })
    setStageFieldErrors({})
    setStageError(null)
    setStageOpen(true)
    loadStageOptions('deal')
  }

  const changeStage = (values: Record<string, string>) => {
    if (values.sourceType !== stageValues.sourceType) {
      setStageValues({ sourceType: values.sourceType, sourceId: '' })
      loadStageOptions(values.sourceType)
    } else {
      setStageValues(values)
    }
    setStageFieldErrors({})
  }

  const submitStage = async () => {
    const errors: FieldErrors = {}
    if (!stageValues.sourceType) errors.sourceType = 'Choose a source type'
    if (!stageValues.sourceId) errors.sourceId = 'Choose a source record'
    setStageFieldErrors(errors)
    if (Object.keys(errors).length) return
    setStageBusy(true)
    setStageError(null)
    const result = await stageAccountingBatch({ sourceType: stageValues.sourceType, sourceId: stageValues.sourceId, providerKey: ACCOUNTING_PROVIDER, idempotencyKey: nonce('accounting-stage') })
    setStageBusy(false)
    if (!result.success) {
      setStageError(result.error)
      return
    }
    setStageOpen(false)
    router.push(`${basePath}/platform/accounting/${result.data.stageAccountingBatch.id}`)
  }

  const stageFields: CommandField[] = [
    { name: 'sourceType', label: 'Source type', type: 'select', options: SOURCE_TYPES.map(value => ({ value, label: SOURCE_TYPE_LABEL[value] })) },
    {
      name: 'sourceId',
      label: 'Source record',
      type: 'select',
      wide: true,
      disabled: stageOptionsState === 'loading' || stageOptions.length === 0,
      placeholder: stageOptionsState === 'loading' ? 'Loading…' : stageOptionsState === 'error' ? 'Sources unavailable' : stageOptions.length === 0 ? 'No eligible records' : 'Select a record',
      options: stageOptions.map(option => ({ value: option.id, label: [option.label, option.detail, option.rooftop].filter(Boolean).join(' · ') })),
    },
  ]

  // Mapping form
  const openMappingCreate = () => {
    const rooftopId = mappingRooftop !== 'all' ? mappingRooftop : rooftops[0]?.id || ''
    const type = mappingType !== 'all' ? mappingType : 'deal'
    setMappingForm({ mode: 'create', values: { rooftopId, sourceType: type, sourceCode: SOURCE_CODES[type][0], debitAccount: '', creditAccount: '' } })
    setMappingFieldErrors({})
    setMappingSubmitError(null)
  }

  const openMappingEdit = (mapping: AccountingMappingRecord) => {
    setMappingForm({
      mode: 'edit',
      values: { rooftopId: mapping.rooftop?.id || '', sourceType: mapping.sourceType, sourceCode: mapping.sourceCode, debitAccount: mapping.debitAccount, creditAccount: mapping.creditAccount },
    })
    setMappingFieldErrors({})
    setMappingSubmitError(null)
  }

  const changeMapping = (values: Record<string, string>) => {
    setMappingForm(current => {
      if (!current) return current
      const next = { ...values }
      if (values.sourceType !== current.values.sourceType) next.sourceCode = SOURCE_CODES[values.sourceType as AccountingSourceType]?.[0] || ''
      return { ...current, values: next }
    })
    setMappingFieldErrors({})
  }

  const submitMapping = async () => {
    if (!mappingForm) return
    const values = mappingForm.values
    const errors: FieldErrors = {}
    if (!values.rooftopId) errors.rooftopId = 'Choose a rooftop'
    if (!values.sourceType) errors.sourceType = 'Choose a source type'
    if (!values.sourceCode) errors.sourceCode = 'Choose a source code'
    const debit = (values.debitAccount || '').trim()
    const credit = (values.creditAccount || '').trim()
    if (!debit) errors.debitAccount = 'Debit account is required'
    else if (debit.length > 100) errors.debitAccount = 'Up to 100 characters'
    if (!credit) errors.creditAccount = 'Credit account is required'
    else if (credit.length > 100) errors.creditAccount = 'Up to 100 characters'
    if (debit && credit && debit === credit) errors.creditAccount = 'Must differ from the debit account'
    if (mappingForm.mode === 'create' && mappings.some(m => m.rooftop?.id === values.rooftopId && m.sourceType === values.sourceType && m.sourceCode === values.sourceCode)) {
      errors.sourceCode = 'A mapping for this code exists; edit it instead'
    }
    setMappingFieldErrors(errors)
    if (Object.keys(errors).length) return
    setMappingBusy(true)
    setMappingSubmitError(null)
    const result = await configureAccountingMapping({
      rooftopId: values.rooftopId,
      sourceType: values.sourceType,
      sourceCode: values.sourceCode,
      debitAccount: debit,
      creditAccount: credit,
      providerKey: ACCOUNTING_PROVIDER,
      idempotencyKey: nonce('accounting-mapping'),
    })
    setMappingBusy(false)
    if (!result.success) {
      setMappingSubmitError(result.error)
      return
    }
    setMappingForm(null)
    setMessage(mappingForm.mode === 'create' ? 'Mapping added.' : 'Mapping updated.')
    await loadMappings()
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    setDeleteError(null)
    const result = await deleteAccountingMapping(deleting.id)
    setDeleteBusy(false)
    if (!result.success) {
      setDeleteError(result.error)
      return
    }
    setDeleting(null)
    setMessage('Mapping deleted.')
    await loadMappings()
  }

  const mappingFields: CommandField[] = mappingForm
    ? [
        { name: 'rooftopId', label: 'Rooftop', type: 'select', disabled: mappingForm.mode === 'edit', options: rooftops.map(r => ({ value: r.id, label: r.name })), placeholder: rooftops.length ? 'Select a rooftop' : 'No rooftops' },
        { name: 'sourceType', label: 'Source type', type: 'select', disabled: mappingForm.mode === 'edit', options: SOURCE_TYPES.map(value => ({ value, label: SOURCE_TYPE_LABEL[value] })) },
        {
          name: 'sourceCode',
          label: 'Source code',
          type: 'select',
          wide: true,
          disabled: mappingForm.mode === 'edit',
          options: (SOURCE_CODES[mappingForm.values.sourceType as AccountingSourceType] || []).map(code => ({ value: code, label: code })),
        },
        { name: 'debitAccount', label: 'Debit account', maxLength: 100, placeholder: '1010 Cash' },
        { name: 'creditAccount', label: 'Credit account', maxLength: 100, placeholder: '4010 Vehicle sales' },
      ]
    : []

  const filteredMappings = useMemo(
    () => mappings.filter(m => (mappingType === 'all' || m.sourceType === mappingType) && (mappingRooftop === 'all' || m.rooftop?.id === mappingRooftop)),
    [mappings, mappingType, mappingRooftop],
  )

  const missingCodes = useMemo(() => {
    const scope = mappingRooftop !== 'all' ? rooftops.filter(r => r.id === mappingRooftop) : rooftops
    const missing: string[] = []
    for (const rooftop of scope) {
      for (const type of SOURCE_TYPES) {
        if (mappingType !== 'all' && mappingType !== type) continue
        for (const code of SOURCE_CODES[type]) {
          if (!mappings.some(m => m.rooftop?.id === rooftop.id && m.sourceType === type && m.sourceCode === code)) missing.push(`${scope.length > 1 ? `${rooftop.name}: ` : ''}${type}/${code}`)
        }
      }
    }
    return missing
  }, [mappings, rooftops, mappingRooftop, mappingType])

  const loadQueue = useCallback(async () => {
    const result = await getAccountingBatches(ALL_FILTERS)
    if (result.success) {
      setQueueSource(result.data.batches)
      setQueueError(null)
    } else {
      setQueueError(result.error)
    }
  }, [])

  const refresh = async () => {
    await Promise.all([loadBatches({ status, sourceType, search }), loadMappings(), loadQueue()])
  }

  const queue = useMemo(
    () =>
      queueSource
        .filter(batch => batch.status in QUEUE_RANK || batch.totalDebitCents !== batch.totalCreditCents)
        .sort((a, b) => (QUEUE_RANK[a.status] ?? 3) - (QUEUE_RANK[b.status] ?? 3) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [queueSource],
  )
  // Unmapped codes across every rooftop and source; the mapping tab's notice follows its own filters.
  const unmappedCount = useMemo(
    () => rooftops.reduce((total, rooftop) => total + SOURCE_TYPES.reduce((sum, type) => sum + SOURCE_CODES[type].filter(code => !mappings.some(m => m.rooftop?.id === rooftop.id && m.sourceType === type && m.sourceCode === code)).length, 0), 0),
    [mappings, rooftops],
  )

  const needsAction = counts.staged + counts.posting + counts.failed
  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Accounting' },
  ]
  const filtered = Boolean(search.trim()) || status !== 'all' || sourceType !== 'all'

  const header = (
    <DeskHeader
      title="Accounting"
      tone={batchError ? 'bad' : counts.failed > 0 ? 'bad' : needsAction > 0 ? 'warn' : 'ok'}
      status={batchError ? 'Unavailable' : counts.failed > 0 ? `${counts.failed} failed` : needsAction > 0 ? `${needsAction} open` : 'Clear'}
      meta={
        batchError
          ? 'Unavailable'
          : [
              counts.failed > 0 ? `${counts.failed} failed` : '',
              counts.staged + counts.posting > 0 ? `${counts.staged + counts.posting} not posted` : '',
              countLabel(counts.all, 'batch', 'batches'),
              countLabel(mappings.length, 'mapping'),
            ].filter(Boolean).join(' · ')
      }
      actions={
        <>
          <Pill variant="plain" onClick={refresh} disabled={batchLoading} aria-label="Refresh" className="h-11 sm:h-8">
            <RefreshCw className={batchLoading ? 'animate-spin' : undefined} />
            Refresh
          </Pill>
          {view === 'batches' ? (
            <Pill variant="primary" onClick={openStage} className="h-11 sm:h-8">
              <Plus />
              Stage batch
            </Pill>
          ) : (
            <Pill variant="primary" onClick={openMappingCreate} disabled={rooftops.length === 0} className="h-11 sm:h-8">
              <Plus />
              Add mapping
            </Pill>
          )}
        </>
      }
    />
  )

  return (
    <PageContainer title="Accounting" header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-6 px-4 pb-24 md:px-6">
        {message && (
          <Notice tone="ok">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0">{message}</p>
              <Track>
                <Pill size="sm" variant="plain" onClick={() => setMessage(null)} className="h-10 sm:h-7">Dismiss</Pill>
              </Track>
            </div>
          </Notice>
        )}

        <DeskSection title="Needs you" count={queueError ? undefined : queue.length + (unmappedCount > 0 && !mappingError ? 1 : 0)} id="accounting-queue">
          {queueError ? (
            <Notice tone="bad">Queue unavailable: {queueError}</Notice>
          ) : queue.length === 0 && (unmappedCount === 0 || mappingError) ? (
            <p className="py-3 text-sm text-muted-foreground">No unposted batches or exceptions</p>
          ) : (
            <div className="space-y-3">
              {unmappedCount > 0 && !mappingError && (
                <Notice tone="warn">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 font-medium">{unmappedCount} unmapped {unmappedCount === 1 ? 'code' : 'codes'}</p>
                    <Pill size="sm" onClick={() => setView('mappings')} className="h-10 sm:h-7">Open mappings</Pill>
                  </div>
                </Notice>
              )}
              {queue.length > 0 && (
                <DeskTable aria-labelledby="accounting-queue">
                  <thead>
                    <tr>
                      <Th>Batch</Th>
                      <Th>Status</Th>
                      <Th priority={2}>Next step</Th>
                      <Th priority={3} align="right">Attempts</Th>
                      <Th priority={2} align="right">Age</Th>
                      <Th align="right">Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.map(batch => {
                      const days = ageDays(batch.createdAt)
                      const unbalanced = batch.totalDebitCents !== batch.totalCreditCents
                      return (
                        <Tr key={batch.id} className="cursor-pointer" onClick={() => router.push(`${basePath}/platform/accounting/${batch.id}`)}>
                          <Td className="min-w-0">
                            <Link href={`${basePath}/platform/accounting/${batch.id}`} className="block font-medium text-foreground hover:underline" onClick={event => event.stopPropagation()}>
                              {SOURCE_TYPE_LABEL[batch.sourceType] || batch.sourceType}
                            </Link>
                            <p className="mt-0.5 flex min-w-0 flex-wrap gap-x-2 text-xs text-muted-foreground">
                              <Code>{recordReference('SRC', batch.sourceId)}</Code>
                              {batch.rooftop?.name && <span>{batch.rooftop.name}</span>}
                              <span className="md:hidden">{days}d</span>
                            </p>
                          </Td>
                          <Td>
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              <Status tone={batchTone(batch.status)}>{BATCH_STATUS_LABEL[batch.status] || batch.status}</Status>
                              {batch.status === 'failed' && <Attention>Failed</Attention>}
                              {unbalanced && <Attention>Out of balance</Attention>}
                            </span>
                            {batch.status === 'failed' && batch.lastErrorCode && <p className="mt-0.5"><Code>{batch.lastErrorCode}</Code></p>}
                          </Td>
                          <Td priority={2} className="text-muted-foreground">{batch.status in QUEUE_RANK ? nextStepLabel(batch) : 'Review lines'}</Td>
                          <Td priority={3} align="right">{batch.attemptCount}</Td>
                          <Td priority={2} align="right" className="whitespace-nowrap">
                            <Figure size="sm">{days}</Figure>
                            <span className="ml-1 text-xs text-muted-foreground">{days === 1 ? 'day' : 'days'}</span>
                          </Td>
                          <Td align="right" className="whitespace-nowrap">
                            <Figure size="sm">{money(batch.totalDebitCents)}</Figure>
                          </Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </DeskTable>
              )}
            </div>
          )}
        </DeskSection>

        <ReadoutStrip>
          <Readout label="Staged" value={counts.staged} tone={counts.staged ? 'warn' : 'idle'} />
          <Readout label="Posting" value={counts.posting} tone={counts.posting ? 'warn' : 'idle'} />
          <Readout label="Failed" value={counts.failed} tone={counts.failed ? 'bad' : 'idle'} />
          <Readout label="Locked" value={counts.locked} tone={counts.locked ? 'ok' : 'idle'} />
        </ReadoutStrip>

        <Segmented<View>
          label="Accounting view"
          value={view}
          onChange={setView}
          options={[
            { value: 'batches', label: 'Batches', count: counts.all },
            { value: 'mappings', label: 'Mappings', count: mappings.length },
          ]}
        />

        {view === 'batches' ? (
          <div className="space-y-4">

            <div className="flex min-w-0 flex-col gap-3">
              <Segmented
                label="Batch status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'all', label: 'All', count: counts.all },
                  ...BATCH_STATUSES.map(value => ({ value, label: BATCH_STATUS_LABEL[value], count: counts[value], tone: batchTone(value) })),
                ]}
              />
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Source ID, reference or error" aria-label="Search batches" className="h-11 rounded-[4px] pl-9 sm:h-9" />
                </div>
                <Select value={sourceType} onValueChange={setSourceType}>
                  <SelectTrigger className="h-11 w-full rounded-[4px] sm:h-9 sm:w-48" aria-label="Source type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sources</SelectItem>
                    {SOURCE_TYPES.map(value => (
                      <SelectItem key={value} value={value}>{SOURCE_TYPE_LABEL[value]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {batchError ? (
              <div className="space-y-3">
                <Notice tone="bad">
                  <p className="font-medium">Batches are unavailable</p>
                  <p className="mt-0.5 text-muted-foreground">{batchError}</p>
                </Notice>
                <Track>
                  <Pill onClick={() => loadBatches({ status, sourceType, search })} className="h-10 sm:h-8">Retry</Pill>
                </Track>
              </div>
            ) : (
              batches.length === 0 ? (
                <Panel aria-busy={batchLoading}>
                  <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
                    <p>{batchLoading ? 'Loading…' : filtered ? 'No batches match' : 'No batches'}</p>
                    {filtered && !batchLoading && (
                      <Track>
                        <Pill size="sm" className="h-10 sm:h-7" onClick={() => { setSearch(''); setStatus('all'); setSourceType('all') }}>Reset filters</Pill>
                      </Track>
                    )}
                  </div>
                </Panel>
              ) : (
                <div className={batchLoading ? 'opacity-60 transition-opacity' : undefined} aria-busy={batchLoading}>
                  <DeskTable>
                    <thead>
                      <tr>
                        <Th>Batch</Th>
                        <Th>Status</Th>
                        <Th priority={3}>Reference</Th>
                        <Th priority={3} align="right">Attempts</Th>
                        <Th priority={2}>Updated</Th>
                        <Th align="right">Debits</Th>
                        <Th priority={2} align="right">Credits</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {batches.map(batch => (
                        <Tr key={batch.id} className="cursor-pointer" onClick={() => router.push(`${basePath}/platform/accounting/${batch.id}`)}>
                          <Td className="min-w-0">
                            <Link href={`${basePath}/platform/accounting/${batch.id}`} className="block font-medium text-foreground hover:underline" onClick={event => event.stopPropagation()}>
                              {SOURCE_TYPE_LABEL[batch.sourceType] || batch.sourceType}
                            </Link>
                            <p className="mt-0.5 flex min-w-0 flex-wrap gap-x-2 text-xs text-muted-foreground">
                              <Code>{recordReference('SRC', batch.sourceId)}</Code>
                              {batch.rooftop?.name && <span>{batch.rooftop.name}</span>}
                              <span className="md:hidden">{dateTime(batch.updatedAt, timeZone)}</span>
                            </p>
                          </Td>
                          <Td>
                            <Status tone={batchTone(batch.status)}>{BATCH_STATUS_LABEL[batch.status] || batch.status}</Status>
                            {batch.lastErrorCode && batch.status === 'failed' && <p className="mt-0.5"><Code>{batch.lastErrorCode}</Code></p>}
                          </Td>
                          <Td priority={3}>{batch.externalReference ? <Code>{batch.externalReference}</Code> : <span className="text-muted-foreground">-</span>}</Td>
                          <Td priority={3} align="right">{batch.attemptCount}</Td>
                          <Td priority={2} className="whitespace-nowrap text-muted-foreground">{dateTime(batch.updatedAt, timeZone)}</Td>
                          <Td align="right" className="whitespace-nowrap font-medium">{money(batch.totalDebitCents)}</Td>
                          <Td priority={2} align="right" className="whitespace-nowrap">{money(batch.totalCreditCents)}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </DeskTable>
                </div>
              )
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
              <Segmented
                label="Mapping source type"
                value={mappingType}
                onChange={setMappingType}
                options={[
                  { value: 'all' as const, label: 'All', count: mappings.filter(m => mappingRooftop === 'all' || m.rooftop?.id === mappingRooftop).length },
                  ...SOURCE_TYPES.map(value => ({ value, label: SOURCE_TYPE_LABEL[value], count: mappings.filter(m => m.sourceType === value && (mappingRooftop === 'all' || m.rooftop?.id === mappingRooftop)).length })),
                ]}
              />
              {rooftops.length > 1 && (
                <Select value={mappingRooftop} onValueChange={setMappingRooftop}>
                  <SelectTrigger className="h-11 w-full rounded-[4px] sm:h-9 sm:w-56" aria-label="Rooftop">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All rooftops</SelectItem>
                    {rooftops.map(rooftop => (
                      <SelectItem key={rooftop.id} value={rooftop.id}>{rooftop.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {missingCodes.length > 0 && !mappingError && (
              <Notice tone="warn">
                <p className="font-medium">Unmapped codes: {missingCodes.length}</p>
                <p className="mt-0.5 break-words text-muted-foreground">{missingCodes.join(', ')}</p>
              </Notice>
            )}

            {mappingError ? (
              <div className="space-y-3">
                <Notice tone="bad">
                  <p className="font-medium">Mappings are unavailable</p>
                  <p className="mt-0.5 text-muted-foreground">{mappingError}</p>
                </Notice>
                <Track>
                  <Pill onClick={loadMappings} className="h-10 sm:h-8">Retry</Pill>
                </Track>
              </div>
            ) : (
              filteredMappings.length === 0 ? (
                <Panel>
                  <p className="py-10 text-center text-sm text-muted-foreground">No mappings</p>
                </Panel>
              ) : (
                <DeskTable>
                  <thead>
                    <tr>
                      <Th>Source code</Th>
                      <Th>Debit account</Th>
                      <Th priority={2}>Credit account</Th>
                      {rooftops.length > 1 && <Th priority={3}>Rooftop</Th>}
                      <Th align="right"><span className="sr-only">Actions</span></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMappings.map(mapping => (
                      <Tr key={mapping.id}>
                        <Td className="min-w-0">
                          <p className="font-medium text-foreground">{SOURCE_TYPE_LABEL[mapping.sourceType] || mapping.sourceType}</p>
                          <Code>{mapping.sourceCode}</Code>
                        </Td>
                        <Td className="break-words">
                          {mapping.debitAccount}
                          <p className="mt-0.5 break-words text-xs text-muted-foreground md:hidden">Cr {mapping.creditAccount}</p>
                        </Td>
                        <Td priority={2} className="break-words">{mapping.creditAccount}</Td>
                        {rooftops.length > 1 && <Td priority={3} className="text-muted-foreground">{mapping.rooftop?.name || '-'}</Td>}
                        <Td align="right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Pill size="sm" className="h-10 sm:h-7" onClick={() => openMappingEdit(mapping)}>
                              <Pencil />
                              Edit
                            </Pill>
                            <Pill size="sm" className="h-10 sm:h-7" onClick={() => { setDeleting(mapping); setDeleteError(null) }}>
                              <Trash2 />
                              Delete
                            </Pill>
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </DeskTable>
              )
            )}
          </div>
        )}

        <CommandDialog
          open={stageOpen}
          title="Stage accounting batch"
          fields={stageFields}
          values={stageValues}
          fieldErrors={stageFieldErrors}
          error={stageError}
          busy={stageBusy}
          submitLabel="Stage"
          onValuesChange={changeStage}
          onSubmit={submitStage}
          onOpenChange={setStageOpen}
        />

        <CommandDialog
          open={Boolean(mappingForm)}
          title={mappingForm?.mode === 'edit' ? 'Edit mapping' : 'Add mapping'}
          fields={mappingFields}
          values={mappingForm?.values || {}}
          fieldErrors={mappingFieldErrors}
          error={mappingSubmitError}
          busy={mappingBusy}
          submitLabel={mappingForm?.mode === 'edit' ? 'Save' : 'Add'}
          onValuesChange={changeMapping}
          onSubmit={submitMapping}
          onOpenChange={open => { if (!open) setMappingForm(null) }}
        />

        <CommandDialog
          open={Boolean(deleting)}
          title="Delete mapping"
          description={deleting ? `${deleting.sourceType}/${deleting.sourceCode}: Dr ${deleting.debitAccount} · Cr ${deleting.creditAccount}` : undefined}
          fields={[]}
          values={{}}
          error={deleteError}
          busy={deleteBusy}
          danger
          submitLabel="Delete"
          onValuesChange={() => {}}
          onSubmit={confirmDelete}
          onOpenChange={open => { if (!open) setDeleting(null) }}
        />
      </div>
    </PageContainer>
  )
}
