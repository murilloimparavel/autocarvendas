import { domainEventRequestHash, recordDomainEventInTransaction } from '../lifecycle/domainEvents'
import { assertStorefrontRooftopSlug, resolvePublicRooftopId } from '../tenantRecords'
import { SubmissionError } from './submissionErrors'

export type PublicSubmissionWorkflow =
  | 'inquiry'
  | 'test-drive'
  | 'trade-in'
  | 'financing'
  | 'service'
  | 'reservation'

type SubmissionContext = {
  rooftopId: string
  reused: boolean
}

type PublicSubmissionOptions<T extends Record<string, unknown>> = {
  context: any
  workflow: PublicSubmissionWorkflow
  rooftopSlug: unknown
  idempotencyKey: unknown
  honeypot?: unknown
  requestEvidence: unknown
  aggregateType: string
  topic: string
  handler: (transactionContext: any, submission: SubmissionContext) => Promise<T>
  aggregateId: (result: T) => string
}

export function publicSubmissionIdempotencyKey(value: unknown) {
  const key = String(value || '').trim()
  if (key.length < 8 || key.length > 180 || !/^[a-zA-Z0-9:_-]+$/.test(key)) {
    throw new SubmissionError('A valid idempotency key is required.', 400, 'INVALID_IDEMPOTENCY_KEY')
  }
  return key
}

export async function publicSubmissionRooftopSlug(context: any, value?: unknown) {
  const slug = String(value ?? '').trim().toLowerCase()
  if (slug && (slug.length < 2 || slug.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))) {
    throw new SubmissionError('A valid dealership location is required.', 400, 'INVALID_ROOFTOP')
  }
  try {
    return await assertStorefrontRooftopSlug(context, slug)
  } catch {
    throw new SubmissionError('This dealership location is unavailable.', 404, 'INVALID_ROOFTOP')
  }
}

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

async function lockCurrentPublicRooftop(context: any, publicSlug: string, expectedRooftopId: string) {
  const candidates = await context.prisma.rooftop.findMany({
    where: { publicSlug, status: 'active', dealerGroup: { is: { status: 'active' } } },
    select: { id: true, publicSlug: true, status: true, dealerGroupId: true },
    take: 2,
  })
  if (candidates.length !== 1 || candidates[0].id !== expectedRooftopId || !candidates[0].dealerGroupId) {
    throw new SubmissionError('This dealership location is unavailable.', 404, 'INVALID_ROOFTOP')
  }

  const candidate = candidates[0]
  await context.prisma.$queryRaw`SELECT "id" FROM "Rooftop" WHERE "id" = ${candidate.id} FOR SHARE`
  await context.prisma.$queryRaw`SELECT "id" FROM "DealerGroup" WHERE "id" = ${candidate.dealerGroupId} FOR SHARE`

  const current = await context.prisma.rooftop.findUnique({
    where: { id: candidate.id },
    select: { id: true, publicSlug: true, status: true, dealerGroupId: true, dealerGroup: { select: { id: true, status: true } } },
  })
  if (
    current?.id !== expectedRooftopId || current.publicSlug !== publicSlug || current.status !== 'active' ||
    current.dealerGroupId !== candidate.dealerGroupId || current.dealerGroup?.id !== candidate.dealerGroupId ||
    current.dealerGroup?.status !== 'active'
  ) {
    throw new SubmissionError('This dealership location is unavailable.', 404, 'INVALID_ROOFTOP')
  }
}

export async function runPublicSubmission<T extends Record<string, unknown>>(
  options: PublicSubmissionOptions<T>
): Promise<T & { reused: boolean }> {
  const rooftopSlug = await publicSubmissionRooftopSlug(options.context, options.rooftopSlug)
  const idempotencyKey = publicSubmissionIdempotencyKey(options.idempotencyKey)
  if (String(options.honeypot || '').trim()) {
    throw new SubmissionError('Unable to process this request.', 400, 'INVALID_SUBMISSION')
  }

  const rooftopId = await resolvePublicRooftopId(options.context, rooftopSlug)

  const eventKey = `public-submission:${options.workflow}:${idempotencyKey}`
  const submissionRequestHash = domainEventRequestHash({
    workflow: options.workflow,
    rooftopId,
    requestEvidence: options.requestEvidence,
    // Prevent an idempotency-key replay from transferring another account's request.
    requestingAccountId: options.context.session?.listKey === 'User' ? options.context.session.itemId : null,
  })

  return options.context.transaction(async (transactionContext: any) => {
    await transactionContext.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${eventKey}, 0))`
    const existing = await transactionContext.prisma.domainAuditEvent.findUnique({
      where: { eventKey },
      select: { metadata: true },
    })
    if (existing) {
      const metadata = existing.metadata as Record<string, unknown> | null
      if (metadata?.submissionRequestHash !== submissionRequestHash) {
        throw new SubmissionError(
          'The idempotency key was already used for a different request.',
          409,
          'IDEMPOTENCY_CONFLICT'
        )
      }
      const response = metadata?.response
      if (!response || typeof response !== 'object' || Array.isArray(response)) {
        throw new Error('Public submission replay evidence is incomplete')
      }
      return { ...(response as T), reused: true }
    }

    await lockCurrentPublicRooftop(transactionContext, rooftopSlug, rooftopId)
    const result = await options.handler(transactionContext, { rooftopId, reused: false })
    const response = jsonSafe(result)
    await recordDomainEventInTransaction(transactionContext, {
      eventKey,
      rooftopId,
      aggregateType: options.aggregateType,
      aggregateId: options.aggregateId(result),
      action: 'submitted',
      topic: options.topic,
      // Binds the submission to the signed-in customer for account request history.
      actorId: options.context.session?.listKey === 'User' ? options.context.session.itemId : null,
      afterSnapshot: { workflow: options.workflow, accepted: true, response },
      metadata: { submissionRequestHash, response },
      payload: { workflow: options.workflow, rooftopId, response },
    })
    return { ...result, reused: false }
  }, { timeout: 30_000 })
}
