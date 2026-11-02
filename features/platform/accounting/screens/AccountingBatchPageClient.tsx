'use client'

import Link from 'next/link'
import { useCallback, useState } from 'react'
import { ArrowLeft, CheckCircle2, FileLock2, RefreshCw, Send, XCircle, Scale } from 'lucide-react'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { Attention, Code, DeskHeader, DeskSection, DeskTable, Facts, Notice, Panel, Pill, Status, Td, Th, Tr, Track } from '@/features/platform/components/desk'
import { recordReference, countLabel } from '@/features/platform/lib/format'

import { getAccountingBatch, manageAccountingBatch } from '../actions'
import { CommandDialog, type CommandField, type FieldErrors } from '../components/CommandDialog'
import { BATCH_STATUS_LABEL, SOURCE_TYPE_LABEL, batchTone, dateTime, money, nonce } from '../lib/format'
import type { AccountingBatchDetail, AccountingProviderResponseRecord, BatchSourceSummary } from '../lib/types'

type BatchAction = 'queue-post' | 'record-posted' | 'record-failed' | 'reconcile' | 'lock'

const ACTIONS: Array<{
  action: BatchAction
  label: string
  icon: typeof Send
  from: string[]
  requires: string
  field?: CommandField
  primary?: boolean
}> = [
  { action: 'queue-post', label: 'Queue for posting', icon: Send, from: ['staged', 'failed'], requires: 'Needs a staged or failed batch', primary: true },
  { action: 'record-posted', label: 'Record posted', icon: CheckCircle2, from: ['posting'], requires: 'Needs a batch in posting', field: { name: 'externalReference', label: 'GL journal reference', maxLength: 200, wide: true }, primary: true },
  { action: 'record-failed', label: 'Record failed', icon: XCircle, from: ['posting'], requires: 'Needs a batch in posting', field: { name: 'errorCode', label: 'Error code', maxLength: 100, wide: true } },
  { action: 'reconcile', label: 'Reconcile', icon: Scale, from: ['posted'], requires: 'Needs a posted batch', field: { name: 'reconciliationReference', label: 'Reconciliation reference', maxLength: 200, wide: true }, primary: true },
  { action: 'lock', label: 'Lock', icon: FileLock2, from: ['reconciled'], requires: 'Needs a reconciled batch', primary: true },
]

const FIELD_LIMITS: Record<string, { label: string; max: number }> = {
  externalReference: { label: 'GL journal reference', max: 200 },
  errorCode: { label: 'Error code', max: 100 },
  reconciliationReference: { label: 'Reconciliation reference', max: 200 },
}

export function AccountingBatchPageClient({
  id,
  timeZone,
  initialBatch,
  initialResponses,
  initialSource,
  initialError,
}: {
  id: string
  timeZone: string
  initialBatch: AccountingBatchDetail | null
  initialResponses: AccountingProviderResponseRecord[]
  initialSource: BatchSourceSummary | null
  initialError: string | null
}) {
  const [batch, setBatch] = useState(initialBatch)
  const [responses, setResponses] = useState(initialResponses)
  const [source, setSource] = useState(initialSource)
  const [error, setError] = useState(initialError)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState<(typeof ACTIONS)[number] | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getAccountingBatch(id)
    if (result.success) {
      setBatch(result.data.batch)
      setResponses(result.data.responses)
      setSource(result.data.source)
      setError(null)
    } else {
      setError(result.error)
    }
    setLoading(false)
  }, [id])

  const openAction = (item: (typeof ACTIONS)[number]) => {
    setPending(item)
    setValues({})
    setFieldErrors({})
    setSubmitError(null)
  }

  const submit = async () => {
    if (!pending || !batch) return
    const errors: FieldErrors = {}
    const field = pending.field?.name
    const value = field ? (values[field] || '').trim() : ''
    if (field) {
      const limit = FIELD_LIMITS[field]
      if (!value) errors[field] = `${limit.label} is required`
      else if (value.length > limit.max) errors[field] = `Up to ${limit.max} characters`
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    setBusy(true)
    setSubmitError(null)
    const result = await manageAccountingBatch({
      batchId: batch.id,
      action: pending.action,
      ...(field ? { [field]: value } : {}),
      idempotencyKey: nonce(`accounting-${pending.action}`),
    })
    setBusy(false)
    if (!result.success) {
      setSubmitError(result.error)
      return
    }
    setPending(null)
    setMessage(`${pending.label}: ${BATCH_STATUS_LABEL[result.data.manageAccountingBatch.status] || result.data.manageAccountingBatch.status}`)
    await load()
  }

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'page' as const, label: 'Platform' },
    { type: 'link' as const, label: 'Accounting', href: `${basePath}/platform/accounting` },
    { type: 'page' as const, label: recordReference('BAT', id) || 'Batch' },
  ]

  const back = (
    <Track>
      <Pill asChild className="h-11 sm:h-8">
        <Link href={`${basePath}/platform/accounting`}>
          <ArrowLeft />
          Accounting
        </Link>
      </Pill>
    </Track>
  )

  if (!batch) {
    return (
      <PageContainer title="Accounting batch" header={<DeskHeader title="Accounting batch" tone="bad" status="Unavailable" meta={error ? "Unavailable" : "Not found"} actions={back} />} breadcrumbs={breadcrumbs}>
        <div className="min-w-0 max-w-full space-y-3 px-4 pb-24 md:px-6">
          <Notice tone="bad">
            <p className="font-medium">{error ? 'Batch is unavailable' : 'Batch not found'}</p>
            {error && <p className="mt-0.5 text-muted-foreground">{error}</p>}
          </Notice>
          <Track>
            <Pill onClick={load} disabled={loading} className="h-10 sm:h-8">Retry</Pill>
          </Track>
        </div>
      </PageContainer>
    )
  }

  const lines = Array.isArray(batch.lines) ? batch.lines : []
  const balanced = batch.totalDebitCents === batch.totalCreditCents
  const statusLabel = BATCH_STATUS_LABEL[batch.status] || batch.status

  const allowedActions = ACTIONS.filter(item => item.from.includes(batch.status))
  const blockedActions = ACTIONS.filter(item => !item.from.includes(batch.status))
  const nextAction = allowedActions.find(item => item.primary) ?? null
  const stateWords = [statusLabel, balanced ? 'balanced' : 'out of balance', batch.status === 'failed' && batch.attemptCount ? countLabel(batch.attemptCount, 'attempt') : ''].filter(Boolean).join(', ')

  const header = (
    <DeskHeader
      title={`${SOURCE_TYPE_LABEL[batch.sourceType] || batch.sourceType} batch · ${money(batch.totalDebitCents)}`}
      tone={batchTone(batch.status)}
      status={statusLabel}
      meta={
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <Code>{recordReference('BAT', batch.id)}</Code>
          <span>{stateWords}</span>
          {[batch.rooftop?.name, batch.providerKey].filter(Boolean).map(part => (
            <span key={part as string}>· {part}</span>
          ))}
        </span>
      }
      actions={
        <>
          <Pill asChild variant="plain" className="h-11 sm:h-8">
            <Link href={`${basePath}/platform/accounting`}>
              <ArrowLeft />
              Accounting
            </Link>
          </Pill>
          <Pill variant="plain" onClick={load} disabled={loading} aria-label="Refresh" className="h-11 sm:h-8">
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            Refresh
          </Pill>
          {allowedActions.map(item => {
            const Icon = item.icon
            return (
              <Pill
                key={item.action}
                variant={item === nextAction ? 'primary' : 'raised'}
                onClick={() => openAction(item)}
                className="h-11 sm:h-8"
              >
                <Icon />
                {item.label}
              </Pill>
            )
          })}
        </>
      }
    />
  )

  return (
    <PageContainer title="Accounting batch" header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
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
        {error && <Notice tone="bad">{error}</Notice>}
        {batch.status === 'failed' && batch.lastErrorCode && (
          <Notice tone="bad">
            Last error: <Code className="text-inherit">{batch.lastErrorCode}</Code>
          </Notice>
        )}
        {!balanced && <Notice tone="bad">Debits and credits differ by {money(Math.abs(batch.totalDebitCents - batch.totalCreditCents))}</Notice>}

        {blockedActions.length > 0 && (
          <ul className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground" aria-label="Unavailable actions">
            {blockedActions.map(item => (
              <li key={item.action} id={`why-${item.action}`}>
                <span className="font-medium text-foreground/80">{item.label}</span>: {item.requires.charAt(0).toLowerCase() + item.requires.slice(1)}
              </li>
            ))}
          </ul>
        )}

        <Panel className="grid min-w-0 gap-x-8 px-4 py-1 lg:grid-cols-2">
          <Facts
            items={[
              { label: 'Status', value: <Status tone={batchTone(batch.status)}>{statusLabel}</Status> },
              { label: 'Balance', value: balanced ? <Status tone="ok">Balanced</Status> : <Attention>Out of balance</Attention> },
              { label: 'Type', value: SOURCE_TYPE_LABEL[batch.sourceType] || batch.sourceType },
              {
                label: 'Record',
                value: source ? (
                  source.href ? (
                    <Link href={`${basePath}${source.href}`} className="underline underline-offset-2">{source.label}</Link>
                  ) : (
                    source.label
                  )
                ) : (
                  <Code>{batch.sourceId}</Code>
                ),
              },
              source?.detail ? { label: 'Detail', value: source.detail } : null,
              { label: 'Source ID', value: batch.sourceId, mono: true },
              { label: 'Attempts', value: batch.attemptCount },
            ]}
          />
          <Facts
            className="max-lg:border-t"
            items={[
              { label: 'Staged', value: dateTime(batch.createdAt, timeZone) },
              { label: 'Posted', value: batch.postedAt ? dateTime(batch.postedAt, timeZone) : 'Not posted' },
              batch.externalReference ? { label: 'GL reference', value: batch.externalReference, mono: true } : null,
              { label: 'Reconciled', value: batch.reconciledAt ? dateTime(batch.reconciledAt, timeZone) : 'Not reconciled' },
              { label: 'Locked', value: batch.lockedAt ? dateTime(batch.lockedAt, timeZone) : 'Not locked' },
              { label: 'Updated', value: dateTime(batch.updatedAt, timeZone) },
            ]}
          />
        </Panel>

        <DeskSection title="Journal lines" count={lines.length}>
          {lines.length === 0 ? (
            <Panel>
              <p className="py-8 text-center text-sm text-muted-foreground">No lines</p>
            </Panel>
          ) : (
            <DeskTable>
              <thead>
                <tr>
                  <Th>Account</Th>
                  <Th priority={2}>Source code</Th>
                  <Th align="right">Debit</Th>
                  <Th align="right">Credit</Th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <Tr key={`${line.sourceCode}-${line.direction}-${index}`}>
                    <Td className="min-w-0 py-2">
                      <p className="break-words text-foreground">{line.account}</p>
                      <Code className="md:hidden">{line.sourceCode}</Code>
                    </Td>
                    <Td priority={2} className="py-2"><Code>{line.sourceCode}</Code></Td>
                    <Td align="right" className="whitespace-nowrap py-2">{line.direction === 'debit' ? money(line.amountCents) : ''}</Td>
                    <Td align="right" className="whitespace-nowrap py-2">{line.direction === 'credit' ? money(line.amountCents) : ''}</Td>
                  </Tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-foreground/15 font-semibold">
                <tr>
                  <Td>Total</Td>
                  <Td priority={2} className="text-[12px] font-medium text-muted-foreground">{balanced ? 'Balanced' : 'Out of balance'}</Td>
                  <Td align="right" className="whitespace-nowrap">{money(batch.totalDebitCents)}</Td>
                  <Td align="right" className="whitespace-nowrap">{money(batch.totalCreditCents)}</Td>
                </tr>
              </tfoot>
            </DeskTable>
          )}
        </DeskSection>

        <DeskSection title="Provider responses" count={responses.length}>
          {responses.length === 0 ? (
            <Panel>
              <p className="py-8 text-center text-sm text-muted-foreground">No responses recorded</p>
            </Panel>
          ) : (
            <DeskTable className="table-fixed">
              <thead>
                <tr>
                  <Th>Result</Th>
                  <Th priority={2}>Received</Th>
                  <Th priority={3}>Details</Th>
                  <Th priority={3}>Request fingerprint</Th>
                </tr>
              </thead>
              <tbody>
                {responses.map(response => {
                  const evidence = (response.immutableResponse || {}) as Record<string, unknown>
                  const failed = response.responseCode === 'failed'
                  return (
                    <Tr key={response.id}>
                      <Td className="min-w-0">
                        <Status tone={failed ? 'bad' : 'ok'}>{failed ? 'Failed' : response.responseCode === 'posted' ? 'Posted' : response.responseCode}</Status>
                        {response.externalReference && <p className="mt-0.5 break-all"><Code>{response.externalReference}</Code></p>}
                        <p className="mt-0.5 text-xs text-muted-foreground md:hidden">{dateTime(response.receivedAt, timeZone)}</p>
                      </Td>
                      <Td priority={2} className="text-muted-foreground">{dateTime(response.receivedAt, timeZone)}</Td>
                      <Td priority={3} className="break-words text-muted-foreground">
                        {[evidence.lastErrorCode ? String(evidence.lastErrorCode) : '', evidence.attemptCount != null ? `Attempt ${evidence.attemptCount}` : '', response.providerKey].filter(Boolean).join(' · ')}
                      </Td>
                      <Td priority={3}><p className="truncate font-mono text-[12px] text-muted-foreground" title={response.requestFingerprint}>{response.requestFingerprint}</p></Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>

        <CommandDialog
          open={Boolean(pending)}
          title={pending?.label || ''}
          description={pending?.action === 'lock' ? 'Locked batches cannot change.' : undefined}
          fields={pending?.field ? [pending.field] : []}
          values={values}
          fieldErrors={fieldErrors}
          error={submitError}
          busy={busy}
          danger={pending?.action === 'record-failed'}
          submitLabel={pending?.label || 'Save'}
          onValuesChange={next => { setValues(next); setFieldErrors({}) }}
          onSubmit={submit}
          onOpenChange={open => { if (!open) setPending(null) }}
        />
      </div>
    </PageContainer>
  )
}
