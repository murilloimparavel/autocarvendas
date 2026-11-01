'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { Code, DeskHeader, DeskSection, DeskTable, Facts, Figure, Notice, Pill, Readout, ReadoutStrip, Status, Td, Th, TitleLine, Tr, Track } from '@/features/platform/components/desk'
import { formatPhone } from '@/features/platform/lib/format'
import { decisionNeedsLenderReference, type FinancingDecision } from '@/features/keystone/lifecycle/financingLifecycle'
import { parseDollarsToCents, parsePercentToBps } from '@/features/platform/deals/lib/moneyInput'
import { getFinancingApplication, openApplicationFollowUp, queueApplicationToLender, recordApplicationDecision, recordSubmissionStatus } from '../actions/applications'
import { FinanceFormDialog, type FieldErrors, type FinanceFormField } from '../components/FinanceFormDialog'
import type { ApplicationDetail, ApplicationSubmission } from '../lib/applicationTypes'
import { creditTierLabel, employmentLabel, formatApr, formatCents, formatDateTime, formatDay, newIdempotencyKey, personName, stateTone, vehicleName } from '../lib/display'

type DialogState =
  | { kind: 'queue'; values: Record<string, string>; idempotencyKey: string }
  | { kind: 'sent' | 'failed'; submission: ApplicationSubmission; values: Record<string, string>; idempotencyKey: string }
  | { kind: 'decision'; values: Record<string, string>; idempotencyKey: string }
  | { kind: 'follow-up'; values: Record<string, string>; idempotencyKey: string }

const statusLabels: Record<string, string> = {
  submitted: 'Submitted',
  'under-review': 'Under review',
  approved: 'Approved',
  declined: 'Declined',
  expired: 'Expired',
  cancelled: 'Cancelled',
}

const decisionLabels: Record<string, string> = { approved: 'Approved', conditional: 'Conditional', declined: 'Declined', expired: 'Expired', cancelled: 'Cancelled' }

/** Decisions the server accepts from each application status (financingLifecycle). */
const decisionsByStatus: Record<string, string[]> = {
  submitted: ['cancelled'],
  'under-review': ['approved', 'conditional', 'declined', 'expired', 'cancelled'],
  approved: ['expired', 'cancelled'],
}

const providerLabels: Record<string, string> = { 'operator-recorded': 'Operator-recorded lender' }

function label(value: string) {
  const words = value.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function FinancingApplicationPageClient({
  id,
  initial,
  initialError,
  timeZone,
}: {
  id: string
  initial: ApplicationDetail | null
  initialError: string | null
  timeZone: string
}) {
  const router = useRouter()
  const [application, setApplication] = useState<ApplicationDetail | null>(initial)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const reload = async () => {
    setLoading(true)
    const response = await getFinancingApplication(id)
    if (response.success && response.data.financingApplication) { setApplication(response.data.financingApplication); setError(null) }
    else setError(response.success ? 'Application not found or not accessible.' : response.error)
    setLoading(false)
    router.refresh()
  }

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'page' as const, label: 'Platform' },
    { type: 'link' as const, label: 'Finance', href: `${basePath}/platform/finance` },
    { type: 'page' as const, label: application?.reference || 'Application' },
  ]

  if (!application) {
    return (
      <PageContainer title="Financing application" breadcrumbs={breadcrumbs} header={<DeskHeader title="Financing application" tone="bad" status="Unavailable" />}>
        <div className="space-y-3 px-4 pb-24 md:px-6">
          <Notice tone="bad"><p className="font-medium">Application is unavailable</p><p className="mt-0.5 text-muted-foreground">{error}</p></Notice>
          <Track>
            <Pill onClick={reload} disabled={loading}>Retry</Pill>
            <Pill asChild variant="plain"><Link href={`${basePath}/platform/finance`}>Finance</Link></Pill>
          </Track>
        </div>
      </PageContainer>
    )
  }

  const app = application
  const applicant = app.applicantName || personName(app.lead, 'Finance applicant')
  const allowedDecisions = decisionsByStatus[app.status] || []
  const canQueue = ['submitted', 'under-review'].includes(app.status)
  const openTask = app.lead?.tasks.find(task => !task.completed) || null
  const queueReason = canQueue ? null : `Application is ${statusLabels[app.status]?.toLowerCase() || app.status}`
  const decisionReason = allowedDecisions.length ? null : `Application is ${statusLabels[app.status]?.toLowerCase() || app.status}`
  const followUpReason = !app.lead ? 'No lead on this application' : openTask ? `Open task: ${openTask.title || 'follow-up'}` : null
  const latestApproval = app.decisions.find(decision => ['approved', 'conditional'].includes(decision.decision)) || null

  const start = (next: DialogState) => { setFieldErrors({}); setFormError(null); setNotice(null); setDialog(next) }

  const submit = async () => {
    if (!dialog) return
    const v = dialog.values
    const errors: FieldErrors = {}
    let run: (() => Promise<{ success: boolean; error?: string }>) | null = null
    let message = 'Saved.'
    if (dialog.kind === 'queue') {
      if (!providerLabels[v.providerKey]) errors.providerKey = 'Select a lender channel.'
      run = () => queueApplicationToLender({ applicationId: app.id, providerKey: v.providerKey, idempotencyKey: dialog.idempotencyKey })
      message = 'Queued to lender.'
    } else if (dialog.kind === 'sent') {
      const reference = (v.reference || '').trim()
      if (!reference) errors.reference = 'Enter the lender or portal reference.'
      else if (reference.length > 200) errors.reference = 'Use 200 characters or fewer.'
      run = () => recordSubmissionStatus(app.id, { submissionId: dialog.submission.id, status: 'submitted', externalReference: reference, idempotencyKey: dialog.idempotencyKey })
      message = 'Submission recorded as sent.'
    } else if (dialog.kind === 'failed') {
      const reason = (v.reason || '').trim()
      if (!reason) errors.reason = 'Enter why it could not be sent.'
      else if (reason.length > 200) errors.reason = 'Use 200 characters or fewer.'
      run = () => recordSubmissionStatus(app.id, { submissionId: dialog.submission.id, status: 'failed', errorCode: reason, idempotencyKey: dialog.idempotencyKey })
      message = 'Submission recorded as failed.'
    } else if (dialog.kind === 'follow-up') {
      const reason = (v.reason || '').trim()
      if (!reason) errors.reason = 'Enter what to follow up on.'
      if (app.lead) run = () => openApplicationFollowUp(app.id, { leadId: app.lead!.id, reason, idempotencyKey: dialog.idempotencyKey })
      message = 'Follow-up task created.'
    } else {
      const decision = v.decision
      if (!allowedDecisions.includes(decision)) errors.decision = 'Select a decision.'
      const reference = (v.reference || '').trim()
      const submission = app.submissions.find(item => item.id === v.submissionId)
      if (!reference && decisionNeedsLenderReference(decision as FinancingDecision, submission?.id)) errors.reference = 'Enter the lender decision reference.'
      const reasonCodes = (v.reasonCodes || '').split(',').map(code => code.trim()).filter(Boolean)
      if (decision === 'declined' && !reasonCodes.length) errors.reasonCodes = 'Enter at least one reason code.'
      const hasTerms = ['approved', 'conditional'].includes(decision)
      let approvedAmountCents: number | null = null
      let aprBasisPoints: number | null = null
      let termMonths: number | null = null
      let monthlyPaymentCents: number | null = null
      if (hasTerms) {
        approvedAmountCents = (v.amount || '').trim() ? parseDollarsToCents(v.amount) : null
        if (!approvedAmountCents) errors.amount = 'Enter the approved amount.'
        aprBasisPoints = (v.apr || '').trim() ? parsePercentToBps(v.apr) : null
        if (aprBasisPoints == null) errors.apr = 'Enter the APR, for example 6.49.'
        termMonths = Number(v.term)
        if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 120) errors.term = 'Enter 1 to 120 months.'
        monthlyPaymentCents = (v.payment || '').trim() ? parseDollarsToCents(v.payment) : null
        if ((v.payment || '').trim() && monthlyPaymentCents == null) errors.payment = 'Enter a dollar amount.'
      }
      if (app.submissions.length && !submission && decision !== 'cancelled') errors.submissionId = 'Select the submission this decision answers.'
      run = () => recordApplicationDecision({
        applicationId: app.id,
        submissionId: submission?.id,
        providerKey: submission?.providerKey || 'operator-recorded',
        idempotencyKey: dialog.idempotencyKey,
        externalReference: reference,
        decision,
        approvedAmountCents,
        aprBasisPoints,
        termMonths: hasTerms ? termMonths : null,
        monthlyPaymentCents,
        reasonCodes,
      })
      message = `Decision recorded: ${decisionLabels[decision] || decision}.`
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length || !run) return
    setBusy(true); setFormError(null)
    const response = await run()
    setBusy(false)
    if (!response.success) { setFormError(response.error || 'Unable to save.'); return }
    setDialog(null)
    setNotice(message)
    await reload()
  }

  const decisionValue = dialog?.kind === 'decision' ? dialog.values.decision : ''
  const fields: FinanceFormField[] = !dialog ? [] : dialog.kind === 'queue' ? [
    { name: 'providerKey', label: 'Lender channel', type: 'select', options: Object.entries(providerLabels).map(([value, label]) => ({ value, label })), wide: true },
  ] : dialog.kind === 'sent' ? [
    { name: 'reference', label: 'Lender reference', placeholder: 'Portal or lender application number', maxLength: 200, wide: true },
  ] : dialog.kind === 'failed' ? [
    { name: 'reason', label: 'Failure reason', maxLength: 200, wide: true },
  ] : dialog.kind === 'follow-up' ? [
    { name: 'reason', label: 'Follow-up', type: 'textarea', maxLength: 500 },
  ] : [
    ...(app.submissions.length ? [{ name: 'submissionId', label: 'Submission', type: 'select' as const, wide: true, options: app.submissions.map(item => ({ value: item.id, label: `${providerLabels[item.providerKey] || item.providerKey} · ${item.status}${item.externalReference ? ` · ${item.externalReference}` : ''} · ${formatDay(item.queuedAt, timeZone)}` })) }] : []),
    { name: 'decision', label: 'Decision', type: 'select', options: allowedDecisions.map(value => ({ value, label: decisionLabels[value] })) },
    ...(decisionValue === 'cancelled' && !app.submissions.length
      ? [{ name: 'reference', label: 'Note', maxLength: 200, placeholder: 'Optional', description: 'Not sent to a lender, so no lender reference is needed.' }]
      : [{ name: 'reference', label: 'Decision reference', maxLength: 200 }]),
    ...(decisionValue === 'declined' ? [{ name: 'reasonCodes', label: 'Reason codes', placeholder: 'DTI, THIN-FILE', wide: true, description: 'Comma separated' }] : []),
    ...(['approved', 'conditional'].includes(decisionValue) ? [
      { name: 'amount', label: 'Approved amount', type: 'money' as const },
      { name: 'apr', label: 'APR (%)', placeholder: '6.49' },
      { name: 'term', label: 'Term (months)', type: 'number' as const, placeholder: '72' },
      { name: 'payment', label: 'Monthly payment (optional)', type: 'money' as const },
    ] : []),
  ]
  const dialogTitles: Record<DialogState['kind'], string> = {
    queue: 'Queue to lender', sent: 'Record sent to lender', failed: 'Record submission failed', decision: 'Record lender decision', 'follow-up': 'Create follow-up task',
  }

  const reasons = [queueReason ? `Queue: ${queueReason}` : null, decisionReason ? `Decision: ${decisionReason}` : null, followUpReason ? `Follow-up: ${followUpReason}` : null].filter(Boolean)
  const queuePrimary = canQueue && !app.submissions.length
  const decisionPrimary = !queuePrimary && app.status === 'under-review'

  const header = (
    <DeskHeader
      title={applicant}
      tone={stateTone(app.status)}
      status={statusLabels[app.status] || app.status}
      meta={
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <Status tone={stateTone(app.status)}>{statusLabels[app.status] || app.status}</Status>
          <Code>{app.reference}</Code>
          <span>{vehicleName(app.vehicle, 'No vehicle selected')}</span>
          <span>Submitted {formatDay(app.submittedAt, timeZone)}</span>
          {app.rooftop && <span>{app.rooftop.name}</span>}
        </span>
      }
      actions={
        <>
          <Pill asChild variant="plain"><Link href={`${basePath}/platform/finance`}><ArrowLeft />Finance</Link></Pill>
          <Pill variant="plain" onClick={reload} disabled={loading} aria-label="Refresh"><RefreshCw className={loading ? 'animate-spin' : undefined} />Refresh</Pill>
        </>
      }
    />
  )

  return (
    <PageContainer title={`Application ${app.reference}`} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {notice && (
          <Notice tone="ok">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0">{notice}</p>
              <Track><Pill size="sm" variant="plain" onClick={() => setNotice(null)}>Dismiss</Pill></Track>
            </div>
          </Notice>
        )}
        {error && <Notice tone="bad">{error}</Notice>}

        <div className="space-y-2">
          <Track aria-label="Application actions" className="flex-wrap">
            <Pill variant={queuePrimary ? 'primary' : 'raised'} disabled={!canQueue || busy} onClick={() => start({ kind: 'queue', values: { providerKey: 'operator-recorded' }, idempotencyKey: newIdempotencyKey(`lender-queue:${app.id}`) })}>
              {app.submissions.length ? 'Queue to another lender' : 'Queue to lender'}
            </Pill>
            <Pill variant={decisionPrimary ? 'primary' : 'raised'} disabled={!allowedDecisions.length || busy} onClick={() => start({ kind: 'decision', values: { submissionId: app.submissions[0]?.id || '', decision: '', reference: '', reasonCodes: '', amount: '', apr: '', term: '', payment: '' }, idempotencyKey: newIdempotencyKey(`lender-decision:${app.id}`) })}>
              Record decision
            </Pill>
            <Pill disabled={Boolean(followUpReason) || busy} onClick={() => start({ kind: 'follow-up', values: { reason: 'Review the finance application and decide the next step.' }, idempotencyKey: newIdempotencyKey(`finance-follow-up:${app.lead?.id}`) })}>
              Create follow-up
            </Pill>
          </Track>
          {reasons.length > 0 && <p className="text-xs text-muted-foreground">{reasons.join(' · ')}</p>}
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-2">
          <DeskSection title="Applicant">
            <Facts items={[
              { label: 'Name', value: app.applicantName || '-' },
              { label: 'Email', value: app.applicantEmail || '-' },
              { label: 'Phone', value: app.applicantPhone ? formatPhone(app.applicantPhone) : '-' },
              { label: 'Employment', value: employmentLabel(app.employmentStatus) },
              { label: 'Annual income', value: formatCents(app.annualIncomeCents) },
              { label: 'Credit (self-reported)', value: creditTierLabel(app.selfReportedCreditTier) },
              { label: 'Consent', value: formatDateTime(app.consentAt, timeZone) },
              { label: 'Locked', value: formatDateTime(app.lockedAt, timeZone) },
            ]} />
          </DeskSection>

          <DeskSection title="Request">
            <Facts items={[
              { label: 'Vehicle', value: app.vehicle ? <Link className="hover:underline" href={`${basePath}/platform/vehicles`}>{vehicleName(app.vehicle)}{app.vehicle.trim ? ` ${app.vehicle.trim}` : ''}</Link> : 'Not selected' },
              app.vehicle?.stockNumber ? { label: 'Stock', value: <Code className="text-foreground">#{app.vehicle.stockNumber}</Code> } : null,
              app.vehicle?.vin ? { label: 'VIN', value: <Code className="text-foreground">{app.vehicle.vin}</Code> } : null,
              { label: 'Vehicle price', value: formatCents(app.vehicle?.priceCents ?? null) },
              { label: 'Amount requested', value: formatCents(app.requestedAmountCents) },
              { label: 'Down payment', value: formatCents(app.plannedDownPaymentCents) },
              { label: 'Trade-in', value: formatCents(app.tradeInValueCents) },
              { label: 'Planned payment', value: formatCents(app.plannedMonthlyPaymentCents) },
              { label: 'APR · term', value: `${formatApr(app.aprBasisPoints)} · ${app.loanTermMonths ?? '-'} mo` },
            ]} />
          </DeskSection>
        </div>

        <ReadoutStrip>
          <Readout label="Requested" value={formatCents(app.requestedAmountCents)} />
          <Readout label="Down payment" value={formatCents(app.plannedDownPaymentCents)} />
          <Readout label="Submissions" value={app.submissions.length} tone={app.submissions.some(item => item.status === 'queued') ? 'warn' : 'idle'} />
          <Readout label="Latest approval" value={latestApproval ? formatCents(latestApproval.approvedAmountCents) : '-'} tone={latestApproval ? 'ok' : 'idle'} sub={latestApproval ? `${formatApr(latestApproval.aprBasisPoints)} · ${latestApproval.termMonths ?? '-'} mo` : undefined} />
        </ReadoutStrip>

        <DeskSection title="Lender submissions" count={app.submissions.length}>
          {app.submissions.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">Not queued to a lender</p>
          ) : (
            <DeskTable>
              <thead>
                <tr>
                  <Th>Lender</Th>
                  <Th>Status</Th>
                  <Th priority={2}>Queued</Th>
                  <Th priority={3}>Sent</Th>
                  <Th priority={2}>Reference</Th>
                  <Th priority={3} align="right">Decisions</Th>
                  <Th align="right"><span className="sr-only">Actions</span></Th>
                </tr>
              </thead>
              <tbody>
                {app.submissions.map(submission => {
                  const decided = app.decisions.filter(decision => decision.submission?.id === submission.id)
                  const manual = submission.providerKey === 'operator-recorded' && submission.status === 'queued'
                  return (
                    <Tr key={submission.id}>
                      <Td className="font-medium">{providerLabels[submission.providerKey] || submission.providerKey}</Td>
                      <Td>
                        <Status tone={submission.status === 'submitted' ? 'ok' : stateTone(submission.status)}>{submission.status === 'submitted' ? 'Sent' : label(submission.status)}</Status>
                        {submission.errorCode && <p className="mt-0.5 break-words text-xs text-muted-foreground">{submission.errorCode}</p>}
                      </Td>
                      <Td priority={2} className="whitespace-nowrap text-muted-foreground">{formatDateTime(submission.queuedAt, timeZone)}</Td>
                      <Td priority={3} className="whitespace-nowrap text-muted-foreground">{submission.submittedAt ? formatDateTime(submission.submittedAt, timeZone) : '-'}</Td>
                      <Td priority={2}>{submission.externalReference ? <Code>{submission.externalReference}</Code> : '-'}</Td>
                      <Td priority={3} align="right">{decided.length}</Td>
                      <Td align="right">
                        {manual && (
                          <span className="inline-flex flex-wrap justify-end gap-2">
                            <Pill size="sm" variant="primary" className="max-md:h-10" disabled={busy} onClick={() => start({ kind: 'sent', submission, values: { reference: '' }, idempotencyKey: newIdempotencyKey(`lender-sent:${submission.id}`) })}>Mark sent</Pill>
                            <Pill size="sm" className="max-md:h-10" disabled={busy} onClick={() => start({ kind: 'failed', submission, values: { reason: '' }, idempotencyKey: newIdempotencyKey(`lender-failed:${submission.id}`) })}>Mark failed</Pill>
                          </span>
                        )}
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>

        <DeskSection title="Lender decisions" count={app.decisions.length}>
          {app.decisions.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">No decisions</p>
          ) : (
            <DeskTable>
              <thead>
                <tr>
                  <Th>Decision</Th>
                  <Th priority={2}>Decided</Th>
                  <Th priority={3}>Reference</Th>
                  <Th priority={3}>Reasons</Th>
                  <Th align="right">Approved</Th>
                  <Th priority={2} align="right">APR · term</Th>
                  <Th priority={3} align="right">Payment</Th>
                </tr>
              </thead>
              <tbody>
                {app.decisions.map(decision => (
                  <Tr key={decision.id}>
                    <Td>
                      <Status tone={stateTone(decision.decision)}>{decisionLabels[decision.decision] || decision.decision}</Status>
                      {decision.recordedBy?.name && <p className="mt-0.5 text-xs text-muted-foreground">{decision.recordedBy.name}</p>}
                    </Td>
                    <Td priority={2} className="whitespace-nowrap text-muted-foreground">{formatDateTime(decision.decidedAt, timeZone)}</Td>
                    <Td priority={3}>{decision.externalReference ? <Code>{decision.externalReference}</Code> : '-'}</Td>
                    <Td priority={3} className="text-muted-foreground">{decision.reasonCodes?.length ? decision.reasonCodes.join(', ') : '-'}</Td>
                    <Td align="right"><Figure size="sm">{formatCents(decision.approvedAmountCents)}</Figure></Td>
                    <Td priority={2} align="right" className="whitespace-nowrap">{formatApr(decision.aprBasisPoints)} · {decision.termMonths ?? '-'} mo</Td>
                    <Td priority={3} align="right">{formatCents(decision.monthlyPaymentCents)}</Td>
                  </Tr>
                ))}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>

        <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-2">
          <DeskSection
            title="Lead"
            actions={app.lead ? <Track><Pill size="sm" asChild><Link href={`${basePath}/platform/crm/${app.lead.id}`}>Open lead</Link></Pill></Track> : undefined}
          >
            {app.lead ? (
              <ul className="divide-y text-sm">
                {app.lead.tasks.length === 0 && <li className="py-2 text-muted-foreground">No tasks</li>}
                {app.lead.tasks.map(task => (
                  <li key={task.id} className="flex min-w-0 items-center justify-between gap-4 py-2">
                    <TitleLine as="p" tone={task.completed ? 'ok' : 'warn'} status={task.completed ? 'Done' : 'Open'}>{task.title || 'Task'}</TitleLine>
                    <p className="shrink-0 text-xs tabular-nums text-muted-foreground">{task.completed ? 'Done' : formatDay(task.dueDate, timeZone)}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="py-3 text-sm text-muted-foreground">No lead</p>}
          </DeskSection>

          <DeskSection
            title="Deals"
            count={app.lead?.deals.length ?? 0}
            actions={<Track><Pill size="sm" asChild><Link href={`${basePath}/platform/deals/create`}>New deal</Link></Pill></Track>}
          >
            {(app.lead?.deals || []).length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">No deals for this lead</p>
            ) : (
              <ul className="divide-y text-sm">
                {app.lead!.deals.map(deal => (
                  <li key={deal.id} className="flex min-w-0 items-center justify-between gap-4 py-2">
                    <TitleLine as="p" tone={stateTone(deal.status)} status={deal.status || undefined} className="capitalize">{deal.status || 'pencil'}</TitleLine>
                    <Track className="shrink-0"><Pill size="sm" asChild><Link href={`${basePath}/platform/deals/${deal.id}`}>Open</Link></Pill></Track>
                  </li>
                ))}
              </ul>
            )}
          </DeskSection>
        </div>

        <FinanceFormDialog
          open={Boolean(dialog)}
          title={dialog ? dialogTitles[dialog.kind] : ''}
          fields={fields}
          values={dialog?.values || {}}
          errors={fieldErrors}
          error={formError}
          busy={busy}
          onValuesChange={values => setDialog(current => current ? { ...current, values } as DialogState : current)}
          onSubmit={submit}
          onOpenChange={open => { if (!open && !busy) setDialog(null) }}
        />
      </div>
    </PageContainer>
  )
}
