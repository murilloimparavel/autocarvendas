'use server'

import { revalidatePath } from 'next/cache'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { operatorCommandRequest } from '@/features/platform/lib/operatorCommandClient'

import type { AcceptedMenu, CancellationRecord, CancellationsWorkspace, DealPayment, DealRefund } from '../lib/cancellationTypes'

const DEAL_FIELDS = 'id status saleDate rooftop { id name } lead { id firstName lastName } vehicle { id year make model stockNumber }'

export async function getCancellationsWorkspace(): Promise<{ success: true; data: CancellationsWorkspace } | { success: false; error: string }> {
  const response = await keystoneClient<{ financeProductCancellations: CancellationRecord[]; financeMenuVersions: AcceptedMenu[]; storefrontProfile: { currencyCode: string | null } | null }>(`
    query FinanceCancellations {
      financeProductCancellations(orderBy: [{ requestedAt: desc }], take: 500) {
        id productCode status reason refundCents evidence requestedAt completedAt createdAt
        deal { ${DEAL_FIELDS} }
        menu { id version decidedAt optionsSnapshot selectedProductCodes }
      }
      financeMenuVersions(where: { status: { equals: "accepted" } }, orderBy: [{ decidedAt: desc }], take: 300) {
        id version decidedAt optionsSnapshot selectedProductCodes
        deal { ${DEAL_FIELDS} }
      }
      storefrontProfile { currencyCode }
    }
  `, {}, { cache: 'no-store' })
  if (!response.success) return { success: false, error: response.error }

  // Payments belong to the payments desk; finance staff without payment access still see cancellations.
  const dealIds = [...new Set(response.data.financeProductCancellations.map(item => item.deal?.id).filter((id): id is string => Boolean(id)))]
  let payments: DealPayment[] | null = []
  let refunds: DealRefund[] | null = []
  if (dealIds.length) {
    const money = await keystoneClient<{ paymentTransactions: DealPayment[] | null; paymentRefunds: DealRefund[] | null }>(`
      query FinanceCancellationRefunds($dealIds: [ID!]!) {
        paymentTransactions(where: { deal: { id: { in: $dealIds } } }, orderBy: [{ createdAt: desc }], take: 500) { id status amountCents capturedCents refundedCents deal { id } }
        paymentRefunds(where: { transaction: { deal: { id: { in: $dealIds } } } }, orderBy: [{ createdAt: desc }], take: 500) { id amountCents reason status createdAt transaction { id deal { id } } }
      }
    `, { dealIds }, { cache: 'no-store' })
    payments = money.success ? money.data.paymentTransactions ?? null : null
    refunds = money.success ? money.data.paymentRefunds ?? null : null
  }
  return {
    success: true,
    data: {
      cancellations: response.data.financeProductCancellations,
      acceptedMenus: response.data.financeMenuVersions,
      payments,
      refunds,
      currencyCode: response.data.storefrontProfile?.currencyCode || 'USD',
    },
  }
}

export async function recordProductCancellation(data: {
  dealId: string
  menuId: string
  productCode: string
  status: 'requested' | 'completed' | 'denied'
  reason: string
  refundCents: number
  refundBasis: { method: 'pro-rata-months' | 'flat'; retailPriceCents: number; termMonths: number; monthsUsed: number; cancellationFeeCents: number } | null
  evidenceReference?: string
  idempotencyKey: string
}) {
  const response = await operatorCommandRequest<{ recordFinanceProductCancellation: { id: string; status: string } }>(`
    mutation RecordProductCancellation($data: RecordFinanceProductCancellationInput!) {
      recordFinanceProductCancellation(data: $data) { id status }
    }
  `, { data })
  if (response.success) {
    revalidatePath('/dashboard/platform/finance/cancellations')
    revalidatePath('/dashboard/platform/finance')
  }
  return response
}
