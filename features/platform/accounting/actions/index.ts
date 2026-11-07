'use server'

import { revalidatePath } from 'next/cache'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { operatorCommandRequest } from '@/features/platform/lib/operatorCommandClient'

import type {
  AccountingBatchDetail,
  AccountingBatchListItem,
  AccountingMappingRecord,
  AccountingProviderResponseRecord,
  BatchCounts,
  BatchSourceSummary,
  RooftopOption,
  StageSourceOption,
} from '../lib/types'

const ACCOUNTING_PATH = '/dashboard/platform/accounting'

export async function getAccountingCurrencyCode() {
  const response = await keystoneClient<{ storefrontProfile: { currencyCode: string | null } | null }>(`
    query AccountingCurrency { storefrontProfile { currencyCode } }
  `, {}, { cache: 'no-store' })
  return response.success ? response.data.storefrontProfile?.currencyCode || 'USD' : 'USD'
}

async function command<T = unknown>(query: string, variables: Record<string, unknown>, batchId?: string) {
  const response = await operatorCommandRequest<T>(query, variables)
  if (response.success) {
    revalidatePath(ACCOUNTING_PATH)
    if (batchId) revalidatePath(`${ACCOUNTING_PATH}/${batchId}`)
  }
  return response
}

const BATCH_FIELDS = 'id rooftop { id name } sourceType sourceId status providerKey totalDebitCents totalCreditCents attemptCount externalReference lastErrorCode postedAt reconciledAt lockedAt createdAt updatedAt'

export async function getAccountingBatches(filters: { status: string; search: string; sourceType: string }) {
  const base: Record<string, unknown>[] = []
  const term = String(filters.search || '').trim()
  if (term) {
    base.push({
      OR: [
        { id: { equals: term } },
        { sourceId: { contains: term, mode: 'insensitive' } },
        { externalReference: { contains: term, mode: 'insensitive' } },
        { lastErrorCode: { contains: term, mode: 'insensitive' } },
      ],
    })
  }
  if (filters.sourceType && filters.sourceType !== 'all') base.push({ sourceType: { equals: filters.sourceType } })
  const baseWhere = { AND: base }
  const where = filters.status && filters.status !== 'all' ? { AND: [...base, { status: { equals: filters.status } }] } : baseWhere
  const response = await keystoneClient<{ accountingBatches: AccountingBatchListItem[] } & Record<string, number>>(`
    query AccountingBatches($where: AccountingBatchWhereInput!, $base: AccountingBatchWhereInput!) {
      accountingBatches(where: $where, orderBy: [{ updatedAt: desc }], take: 200) { ${BATCH_FIELDS} }
      all: accountingBatchesCount(where: $base)
      staged: accountingBatchesCount(where: { AND: [$base, { status: { equals: "staged" } }] })
      posting: accountingBatchesCount(where: { AND: [$base, { status: { equals: "posting" } }] })
      failed: accountingBatchesCount(where: { AND: [$base, { status: { equals: "failed" } }] })
      posted: accountingBatchesCount(where: { AND: [$base, { status: { equals: "posted" } }] })
      reconciled: accountingBatchesCount(where: { AND: [$base, { status: { equals: "reconciled" } }] })
      locked: accountingBatchesCount(where: { AND: [$base, { status: { equals: "locked" } }] })
    }
  `, { where, base: baseWhere }, { cache: 'no-store' })
  if (!response.success) return response
  const { accountingBatches, ...rest } = response.data
  const counts: BatchCounts = {
    all: rest.all || 0,
    staged: rest.staged || 0,
    posting: rest.posting || 0,
    failed: rest.failed || 0,
    posted: rest.posted || 0,
    reconciled: rest.reconciled || 0,
    locked: rest.locked || 0,
  }
  return { success: true as const, data: { batches: accountingBatches || [], counts } }
}

async function batchSource(sourceType: string, sourceId: string): Promise<BatchSourceSummary | null> {
  if (sourceType === 'deal') {
    const response = await keystoneClient<{ deal: any }>(`
      query BatchDeal($id: ID!) { deal(where: { id: $id }) { id status totalPrice lead { firstName lastName } vehicle { year make model stockNumber } } }
    `, { id: sourceId }, { cache: 'no-store' })
    const deal = response.success ? response.data.deal : null
    if (!deal) return null
    const vehicle = deal.vehicle ? `${deal.vehicle.year} ${deal.vehicle.make} ${deal.vehicle.model}` : 'Deal'
    const customer = deal.lead ? `${deal.lead.firstName || ''} ${deal.lead.lastName || ''}`.trim() : ''
    return { label: vehicle, detail: [customer, deal.vehicle?.stockNumber ? `Stock ${deal.vehicle.stockNumber}` : '', deal.status].filter(Boolean).join(' · '), href: `/platform/deals/${deal.id}` }
  }
  if (sourceType === 'service') {
    const response = await keystoneClient<{ serviceOrder: any }>(`
      query BatchServiceOrder($id: ID!) { serviceOrder(where: { id: $id }) { id status invoiceNumber grandTotalCents } }
    `, { id: sourceId }, { cache: 'no-store' })
    const order = response.success ? response.data.serviceOrder : null
    if (!order) return null
    return { label: order.invoiceNumber ? `Invoice ${order.invoiceNumber}` : 'Service order', detail: order.status, href: '/platform/service' }
  }
  if (sourceType === 'parts') {
    const response = await keystoneClient<{ partsPurchaseOrder: any }>(`
      query BatchPartsOrder($id: ID!) { partsPurchaseOrder(where: { id: $id }) { id status reference supplier } }
    `, { id: sourceId }, { cache: 'no-store' })
    const order = response.success ? response.data.partsPurchaseOrder : null
    if (!order) return null
    return { label: order.reference ? `PO ${order.reference}` : 'Parts PO', detail: [order.supplier, order.status].filter(Boolean).join(' · '), href: null }
  }
  if (sourceType === 'payment') {
    const response = await keystoneClient<{ paymentTransaction: any }>(`
      query BatchPayment($id: ID!) { paymentTransaction(where: { id: $id }) { id status sourceType providerKey reconciliationReference } }
    `, { id: sourceId }, { cache: 'no-store' })
    const payment = response.success ? response.data.paymentTransaction : null
    if (!payment) return null
    return { label: `Payment ${payment.providerKey}`, detail: [payment.status, payment.reconciliationReference].filter(Boolean).join(' · '), href: `/platform/payments/${payment.id}` }
  }
  return null
}

export async function getAccountingBatch(id: string) {
  const response = await keystoneClient<{ accountingBatch: AccountingBatchDetail | null; accountingProviderResponses: AccountingProviderResponseRecord[] }>(`
    query AccountingBatch($id: ID!) {
      accountingBatch(where: { id: $id }) { ${BATCH_FIELDS} lines }
      accountingProviderResponses(where: { batch: { id: { equals: $id } } }, orderBy: [{ receivedAt: desc }], take: 100) {
        id providerKey responseCode externalReference requestFingerprint immutableResponse receivedAt
      }
    }
  `, { id }, { cache: 'no-store' })
  if (!response.success) return response
  const batch = response.data.accountingBatch
  const source = batch ? await batchSource(batch.sourceType, batch.sourceId) : null
  return { success: true as const, data: { batch, responses: response.data.accountingProviderResponses || [], source } }
}

export async function getAccountingMappings() {
  return keystoneClient<{ accountingMappings: AccountingMappingRecord[]; rooftops: RooftopOption[] }>(`
    query AccountingMappings {
      accountingMappings(orderBy: [{ sourceType: asc }, { sourceCode: asc }], take: 500) {
        id rooftop { id name } sourceType sourceCode debitAccount creditAccount providerKey updatedAt
      }
      rooftops(orderBy: [{ name: asc }], take: 100) { id name }
    }
  `, {}, { cache: 'no-store' })
}

const fullName = (lead: any) => (lead ? `${lead.firstName || ''} ${lead.lastName || ''}`.trim() : '')
const usd = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((Number(cents) || 0) / 100)

/** Records that can be staged: the same gates as stageAccountingBatch, minus sources that already have an active batch. */
export async function getStageSources(sourceType: string) {
  const queries: Record<string, string> = {
    deal: `deals(where: { status: { equals: "delivered" } }, orderBy: [{ updatedAt: desc }], take: 100) { id saleDate totalPrice rooftop { id name } lead { firstName lastName } vehicle { year make model stockNumber } }`,
    service: `serviceOrders(where: { status: { equals: "paid" } }, orderBy: [{ updatedAt: desc }], take: 100) { id invoiceNumber grandTotalCents rooftop { id name } }`,
    parts: `partsPurchaseOrders(where: { status: { equals: "received" } }, orderBy: [{ updatedAt: desc }], take: 100) { id reference supplier lines rooftop { id name } }`,
    payment: `paymentTransactions(where: { reconciledAt: { not: { equals: null } }, status: { in: ["captured", "partially-refunded", "refunded"] } }, orderBy: [{ updatedAt: desc }], take: 100) { id providerKey capturedCents refundedCents reconciliationReference rooftop { id name } }`,
  }
  const listQuery = queries[sourceType]
  if (!listQuery) return { success: false as const, error: 'Unsupported source type' }
  const response = await keystoneClient<Record<string, any[]>>(`
    query StageSources($sourceType: String!) {
      ${listQuery}
      accountingBatches(where: { sourceType: { equals: $sourceType }, status: { not: { equals: "failed" } } }, take: 1000) { sourceId }
    }
  `, { sourceType }, { cache: 'no-store' })
  if (!response.success) return response
  const taken = new Set((response.data.accountingBatches || []).map((batch: any) => batch.sourceId))
  let options: StageSourceOption[] = []
  if (sourceType === 'deal') {
    options = (response.data.deals || []).map((deal: any) => ({
      id: deal.id,
      label: deal.vehicle ? `${deal.vehicle.year} ${deal.vehicle.make} ${deal.vehicle.model}` : 'Deal',
      detail: [fullName(deal.lead), deal.vehicle?.stockNumber ? `Stock ${deal.vehicle.stockNumber}` : '', deal.totalPrice != null ? usd(Math.round(Number(deal.totalPrice) * 100)) : ''].filter(Boolean).join(' · '),
      rooftop: deal.rooftop?.name || '',
    }))
  } else if (sourceType === 'service') {
    options = (response.data.serviceOrders || []).map((order: any) => ({
      id: order.id,
      label: order.invoiceNumber ? `Invoice ${order.invoiceNumber}` : 'Service order',
      detail: usd(order.grandTotalCents),
      rooftop: order.rooftop?.name || '',
    }))
  } else if (sourceType === 'parts') {
    options = (response.data.partsPurchaseOrders || []).map((order: any) => {
      const amount = Array.isArray(order.lines) ? order.lines.reduce((total: number, line: any) => total + Number(line?.quantity || 0) * Number(line?.unitCostCents || 0), 0) : 0
      return { id: order.id, label: order.reference ? `PO ${order.reference}` : 'Parts PO', detail: [order.supplier, usd(amount)].filter(Boolean).join(' · '), rooftop: order.rooftop?.name || '' }
    })
  } else {
    options = (response.data.paymentTransactions || []).map((payment: any) => ({
      id: payment.id,
      label: `${usd(payment.capturedCents)} ${payment.providerKey}`,
      detail: [payment.refundedCents ? `${usd(payment.refundedCents)} refunded` : '', payment.reconciliationReference].filter(Boolean).join(' · '),
      rooftop: payment.rooftop?.name || '',
    }))
  }
  return { success: true as const, data: options.filter(option => !taken.has(option.id)) }
}

export async function manageAccountingBatch(data: {
  batchId: string
  action: 'queue-post' | 'record-posted' | 'record-failed' | 'reconcile' | 'lock'
  externalReference?: string
  errorCode?: string
  reconciliationReference?: string
  idempotencyKey: string
}) {
  return command<{ manageAccountingBatch: { id: string; status: string } }>(`
    mutation ManageAccountingBatch($data: ManageAccountingBatchInput!) {
      manageAccountingBatch(data: $data) { id status }
    }
  `, { data }, data.batchId)
}

export async function stageAccountingBatch(data: { sourceType: string; sourceId: string; providerKey: string; idempotencyKey: string }) {
  return command<{ stageAccountingBatch: { id: string; status: string } }>(`
    mutation StageAccountingBatch($data: StageAccountingBatchInput!) {
      stageAccountingBatch(data: $data) { id status }
    }
  `, { data })
}

export async function configureAccountingMapping(data: {
  rooftopId: string
  sourceType: string
  sourceCode: string
  debitAccount: string
  creditAccount: string
  providerKey: string
  idempotencyKey: string
}) {
  return command<{ configureAccountingMapping: { id: string } }>(`
    mutation ConfigureAccountingMapping($data: ConfigureAccountingMappingInput!) {
      configureAccountingMapping(data: $data) { id }
    }
  `, { data })
}

export async function deleteAccountingMapping(id: string) {
  const response = await keystoneClient<{ deleteAccountingMapping: { id: string } | null }>(`
    mutation DeleteAccountingMapping($id: ID!) {
      deleteAccountingMapping(where: { id: $id }) { id }
    }
  `, { id })
  if (response.success && !response.data.deleteAccountingMapping) return { success: false as const, error: 'Mapping not found or not permitted' }
  if (response.success) revalidatePath(ACCOUNTING_PATH)
  return response
}
