export const FINANCING_APPLICATION_STATUSES = [
  'submitted',
  'under-review',
  'approved',
  'declined',
  'expired',
  'cancelled',
] as const

export type FinancingApplicationStatus = typeof FINANCING_APPLICATION_STATUSES[number]
export type FinancingDecision = 'approved' | 'declined' | 'conditional' | 'expired' | 'cancelled'

const APPLICATION_TRANSITIONS: Record<FinancingApplicationStatus, readonly FinancingApplicationStatus[]> = {
  submitted: ['under-review', 'cancelled'],
  'under-review': ['approved', 'declined', 'expired', 'cancelled'],
  approved: ['expired', 'cancelled'],
  declined: [],
  expired: [],
  cancelled: [],
}

export function isFinancingApplicationStatus(value: unknown): value is FinancingApplicationStatus {
  return typeof value === 'string' && FINANCING_APPLICATION_STATUSES.includes(value as FinancingApplicationStatus)
}

export function assertFinancingTransition(current: unknown, next: unknown) {
  if (!isFinancingApplicationStatus(current) || !isFinancingApplicationStatus(next)) {
    throw new Error('Invalid financing application status')
  }
  if (!APPLICATION_TRANSITIONS[current].includes(next)) {
    throw new Error(`Financing application cannot transition from ${current} to ${next}`)
  }
}

export function statusForDecision(decision: FinancingDecision): FinancingApplicationStatus {
  if (decision === 'conditional') return 'under-review'
  return decision
}

/**
 * Operator-recorded decisions need the lender's reference as evidence. A dealership cancelling an
 * application before it went to any lender has no lender reference to give.
 */
export function decisionNeedsLenderReference(decision: FinancingDecision, submissionId: string | null | undefined) {
  return !(decision === 'cancelled' && !submissionId)
}

export function assertDecisionTerms(
  decision: FinancingDecision,
  terms: { approvedAmountCents?: number | null; aprBasisPoints?: number | null; termMonths?: number | null }
) {
  if (decision !== 'approved' && decision !== 'conditional') return
  if (!Number.isInteger(terms.approvedAmountCents) || Number(terms.approvedAmountCents) <= 0) {
    throw new Error('Approved or conditional decisions require an approved amount')
  }
  if (!Number.isInteger(terms.aprBasisPoints) || Number(terms.aprBasisPoints) < 0) {
    throw new Error('Approved or conditional decisions require APR basis points')
  }
  if (!Number.isInteger(terms.termMonths) || Number(terms.termMonths) <= 0) {
    throw new Error('Approved or conditional decisions require a term')
  }
}
