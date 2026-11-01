import { permissions } from '../access'
import { assertSessionRooftopPermission } from '../tenantRecords'
import { recordDomainEventInTransaction } from '../lifecycle/domainEvents'
import { resolveFinancingProviderAdapter } from '../../integrations/financing'
import { assertDecisionTerms, assertFinancingTransition, decisionNeedsLenderReference, statusForDecision, type FinancingDecision } from '../lifecycle/financingLifecycle'
import { financingIdempotencyKey } from './financingUtils'

export async function recordLenderDecision(_root: unknown, { data }: { data: any }, context: any) {
  if (!context.session || !permissions.canManageFinancing({ session: context.session })) {
    throw new Error('Access denied: financing permission required')
  }
  const adapter = resolveFinancingProviderAdapter(String(data.providerKey || '').trim())
  const decision = String(data.decision || '') as FinancingDecision
  if (!['approved', 'declined', 'conditional', 'expired', 'cancelled'].includes(decision)) {
    throw new Error('Invalid lender decision')
  }
  const approvedAmountCents = data.approvedAmountCents == null ? null : Number(data.approvedAmountCents)
  const aprBasisPoints = data.aprBasisPoints == null ? null : Number(data.aprBasisPoints)
  const termMonths = data.termMonths == null ? null : Number(data.termMonths)
  const monthlyPaymentCents = data.monthlyPaymentCents == null ? null : Number(data.monthlyPaymentCents)
  const externalReference = String(data.externalReference || '').trim() || null
  const reasonCodes = Array.isArray(data.reasonCodes) ? data.reasonCodes.map(String).map((value: string) => value.trim()).filter(Boolean).slice(0, 20) : []
  assertDecisionTerms(decision, { approvedAmountCents, aprBasisPoints, termMonths })
  if (monthlyPaymentCents != null && (!Number.isInteger(monthlyPaymentCents) || monthlyPaymentCents < 0)) throw new Error('Monthly payment must be non-negative integer cents')
  if (adapter.key === 'operator-recorded' && !externalReference && decisionNeedsLenderReference(decision, data.submissionId)) throw new Error('Operator-recorded lender decisions require an evidence reference')
  if (decision === 'declined' && reasonCodes.length === 0) throw new Error('Declined decisions require at least one reason code')
  const idempotencyKey = financingIdempotencyKey(data.idempotencyKey, 'lender-decision')
  const targetStatus = statusForDecision(decision)
  const eventEvidence = {
    applicationId: String(data.applicationId || ''),
    submissionId: data.submissionId ? String(data.submissionId) : null,
    providerKey: adapter.key,
    externalReference,
    decision,
    approvedAmountCents,
    aprBasisPoints,
    termMonths,
    monthlyPaymentCents,
    reasonCodes,
  }
  const accessibleApplication = await context.query.FinancingApplication.findOne({
    where: { id: String(data.applicationId || '') },
    query: 'id rooftop { id }',
  })
  if (!accessibleApplication?.rooftop?.id) throw new Error('Financing application not found')
  await assertSessionRooftopPermission(context, accessibleApplication.rooftop.id, 'canManageFinancing')

  const decisionId = await context.transaction(async (tx: any) => {
    await tx.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))`
    const existing = await tx.prisma.lenderDecision.findUnique({
      where: { idempotencyKey },
      select: { id: true, rooftopId: true, applicationId: true },
    })
    if (existing) {
      if (existing.applicationId !== accessibleApplication.id || existing.rooftopId !== accessibleApplication.rooftop.id) throw new Error('Lender decision idempotency key belongs to another application')
      await recordDomainEventInTransaction(tx, {
        eventKey: `lender-decision:${idempotencyKey}`,
        rooftopId: existing.rooftopId,
        aggregateType: 'LenderDecision',
        aggregateId: existing.id,
        action: `recorded:${decision}`,
        topic: 'lender-decision.recorded',
        actorId: context.session.itemId,
        afterSnapshot: eventEvidence,
        payload: { decisionId: existing.id, applicationId: existing.applicationId, rooftopId: existing.rooftopId, decision },
      })
      return existing.id
    }
    const application = await tx.prisma.financingApplication.findUnique({
      where: { id: data.applicationId },
      select: { id: true, reference: true, status: true, rooftopId: true },
    })
    if (!application) throw new Error('Financing application not found')
    if (decision === 'conditional' && application.status === 'under-review') {
      // A condition is append-only evidence while review remains open.
    } else {
      assertFinancingTransition(application.status, targetStatus)
      const changed = await tx.prisma.financingApplication.updateMany({
        where: { id: application.id, status: application.status },
        data: { status: targetStatus },
      })
      if (changed.count !== 1) throw new Error('Financing application changed; refresh and retry')
    }
    if (data.submissionId) {
      const submission = await tx.prisma.lenderSubmission.findFirst({ where: { id: data.submissionId, applicationId: application.id }, select: { id: true } })
      if (!submission) throw new Error('Lender submission does not belong to this application')
    }
    const now = new Date()
    const created = await tx.prisma.lenderDecision.create({
      data: {
        rooftopId: application.rooftopId,
        applicationId: application.id,
        submissionId: data.submissionId || null,
        idempotencyKey,
        providerKey: adapter.key,
        externalReference,
        decision,
        approvedAmountCents,
        aprBasisPoints,
        termMonths,
        monthlyPaymentCents,
        reasonCodes,
        decidedAt: now,
        recordedById: context.session.itemId,
        immutableSnapshot: {
          version: 1,
          applicationReference: application.reference,
          providerKey: adapter.key,
          externalReference,
          decision,
          approvedAmountCents,
          aprBasisPoints,
          termMonths,
          monthlyPaymentCents,
          reasonCodes,
          decidedAt: now.toISOString(),
          recordedById: context.session.itemId,
        },
      },
      select: { id: true },
    })
    await recordDomainEventInTransaction(tx, {
      eventKey: `lender-decision:${idempotencyKey}`,
      rooftopId: application.rooftopId,
      aggregateType: 'LenderDecision',
      aggregateId: created.id,
      action: `recorded:${decision}`,
      topic: 'lender-decision.recorded',
      actorId: context.session.itemId,
      afterSnapshot: eventEvidence,
      payload: { decisionId: created.id, applicationId: application.id, rooftopId: application.rooftopId, decision },
    })
    return created.id
  }, { timeout: 30_000 })

  return context.db.LenderDecision.findOne({ where: { id: decisionId } })
}
