import { permissions } from '../access'
import { recordDomainEventInTransaction, type DomainEventInput } from '../lifecycle/domainEvents'
import { financingProviderKeys } from '../../integrations/financing'
import { assertSessionRooftopPermission } from '../tenantRecords'
import { commandDate } from '../lifecycle/commandDate'
import { domainEventRequestHash, stableJson } from '../lifecycle/domainEvents'
import { currentDealAuthority, fundingBinding, lockDeal, readLockedFunding, worksheetBinding } from '../lifecycle/dealFinanceEvidence'
import { assertReviewedPrerequisites, readCurrentPrerequisites } from '../lifecycle/financePrerequisites'
import { calculateDealPrice } from '../lifecycle/dealPricing'
import { dealReceivedCents, formatUsdCents } from '../lifecycle/cashPayment'
import { dealPaymentMethod } from '../lifecycle/paymentMethods'
import { operatorCommand } from './operatorCommandErrors'
import { assertContractAction } from '../lifecycle/contractPackageLifecycle'
import { financingPrerequisiteCapability } from '../../integrations/financing'

const required=(v:any,n:string,max=500)=>{const s=String(v||'').trim();if(!s||s.length>max)throw new Error(`${n} is required`);return s}
const key=(v:any)=>required(v,'Idempotency key',200)
const codes=(v:any,n:string)=>{if(!Array.isArray(v))throw new Error(`${n} must be an array`);return [...new Set(v.map((x:any)=>required(x,n,80)))].slice(0,50)}
async function dealForFinance(context:any,id:any){if(!context.session?.itemId||!permissions.canManageFinancing({session:context.session}))throw new Error('Financing permission is required');const deal=await context.query.Deal.findOne({where:{id:String(id||'')},query:'id status structureType updatedAt rooftop { id } lead { id } vehicle { id vin stockNumber } selectedLenderDecision { id }'});if(!deal?.rooftop?.id)throw new Error('Deal not found or not accessible');await assertSessionRooftopPermission(context,deal.rooftop.id,'canManageFinancing');return deal}
async function eventTx(context:any,event:DomainEventInput,write:(tx:any,reused:boolean)=>Promise<any>){return context.transaction(async(tx:any)=>{await tx.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${event.eventKey}, 0))`;const recorded=await recordDomainEventInTransaction(tx,event);return write(tx,recorded.reused)},{timeout:30_000})}


async function artifactCommand(context: Parameters<typeof dealForFinance>[0], data: Record<string, unknown>, action: string,
  execute: (tx: Parameters<typeof currentDealAuthority>[0], scoped: Parameters<typeof currentDealAuthority>[0], deal: { id: string; rooftopId: string }) => Promise<{ result: Record<string, unknown>; detail: Record<string, unknown> }>) {
  const expected = commandDate(data.expectedUpdatedAt)
  const actorId = context.session?.itemId
  if (!actorId) throw new Error('Authentication required')
  const dealId = required(data.dealId, 'Deal ID', 100)
  const eventKey = `finance-artifact:${action}:${key(data.idempotencyKey)}`
  const request = { ...data, idempotencyKey: undefined, expectedUpdatedAt: expected.toISOString(), actorId, purpose: action }
  return context.transaction(async (tx: Parameters<typeof currentDealAuthority>[0]) => {
    await lockDeal(tx, dealId)
    const authority = await currentDealAuthority(tx, context.session, dealId, ['canManageFinancing'])
    const deal = await tx.prisma.deal.findUnique({ where: { id: dealId } })
    if (!deal || deal.rooftopId !== authority.rooftopId) throw new Error('Deal authority changed')
    const prior = await tx.prisma.domainAuditEvent.findUnique({ where: { eventKey } })
    if (prior) {
      if (prior.actorId !== actorId || prior.rooftopId !== deal.rooftopId || stableJson(prior.afterSnapshot?.request) !== stableJson(request) ||
          typeof prior.afterSnapshot?.result?.id !== 'string' || typeof prior.afterSnapshot?.result?.status !== 'string') throw new Error('Artifact retry differs from the original authorized request')
      return prior.afterSnapshot.result
    }
    if (!['submitted', 'approved', 'financed'].includes(deal.status) || deal.updatedAt.getTime() !== expected.getTime()) throw new Error('Active accepted worksheet changed; refresh before recording artifacts')
    const binding = await fundingBinding(tx, deal)
    const { result, detail } = await execute(tx, authority.context, deal)
    await recordDomainEventInTransaction(tx, { eventKey, rooftopId: deal.rooftopId, aggregateType: 'Deal', aggregateId: deal.id,
      action: `artifact:${action}`, topic: 'finance-artifact.updated', actorId,
      afterSnapshot: { version: 2, request, binding, result, ...detail },
      payload: { rooftopId: deal.rooftopId, dealId: deal.id, action } })
    return result
  }, { timeout: 30_000, isolationLevel: 'Serializable' })
}

async function configureFinanceProductCommand(_r: unknown, { data }: any, context: any) {
  if (!context.session?.itemId || !permissions.canManageFinancing({ session: context.session })) throw new Error('Financing permission is required')
  const rooftopId = String(data.rooftopId || '')
  await assertSessionRooftopPermission(context, rooftopId, 'canManageFinancing')
  const rooftop = await context.query.Rooftop.findOne({ where: { id: rooftopId }, query: 'id' })
  if (!rooftop) throw new Error('Rooftop not found or not accessible')
  const category = required(data.category, 'Category', 50)
  if (!['service-contract', 'gap', 'maintenance', 'appearance', 'tire-wheel', 'other'].includes(category)) throw new Error('Unsupported product category')
  const providerKey = required(data.providerKey, 'Provider key', 80)
  if (!financingProviderKeys().includes(providerKey)) throw new Error('Unsupported financing provider')
  const code = required(data.code, 'Code', 80).toUpperCase()
  const retailPriceCents = Number(data.retailPriceCents)
  if (!Number.isInteger(retailPriceCents) || retailPriceCents < 0) throw new Error('Retail price is invalid')
  // Dealer cost is hidden from staff without cross-rooftop cost access; an edit without it keeps the stored cost.
  const existing = await context.sudo().prisma.financeProduct.findFirst({ where: { rooftopId: rooftop.id, code }, select: { id: true, costCents: true } })
  const costCents = data.costCents == null ? existing?.costCents ?? null : Number(data.costCents)
  if (costCents == null) throw new Error('Dealer cost is required for a new product')
  if (!Number.isInteger(costCents) || costCents < 0) throw new Error('Dealer cost is invalid')
  if (data.expectNew === true && existing) throw new Error(`Product code ${code} already exists at this rooftop`)
  const evidence = { rooftopId: rooftop.id, code, name: required(data.name, 'Name', 200), category, providerKey, retailPriceCents, costCents, active: data.active !== false }
  const eventKey = `finance-product:${key(data.idempotencyKey)}`
  const id = await eventTx(context, { eventKey, rooftopId: rooftop.id, aggregateType: 'FinanceProduct', aggregateId: `${rooftop.id}:${evidence.code}`, action: 'configured', topic: 'finance-product.configured', actorId: context.session.itemId, afterSnapshot: evidence, payload: evidence }, async (tx, reused) => {
    if (reused) {
      const found = await tx.prisma.financeProduct.findFirst({ where: { rooftopId: rooftop.id, code: evidence.code }, select: { id: true } })
      if (!found) throw new Error('Finance product replay record is missing')
      return found.id
    }
    const current = await tx.prisma.financeProduct.findFirst({ where: { rooftopId: rooftop.id, code: evidence.code }, select: { id: true } })
    const saved = current ? await tx.prisma.financeProduct.update({ where: { id: current.id }, data: evidence, select: { id: true } }) : await tx.prisma.financeProduct.create({ data: evidence, select: { id: true } })
    return saved.id
  })
  return context.db.FinanceProduct.findOne({ where: { id } })
}

async function presentFinanceMenuCommand(_r: unknown, { data }: any, context: any) {
  return artifactCommand(context, data, 'menu-present', async (tx, scoped, deal) => {
    const productCodes = codes(data.productCodes, 'Product codes')
    const products = await scoped.query.FinanceProduct.findMany({ where: { rooftop: { id: { equals: deal.rooftopId } }, code: { in: productCodes }, active: { equals: true } }, take: 50, query: 'id code name category providerKey retailPriceCents' })
    if (products.length !== productCodes.length) throw new Error('Every menu product must be active at this rooftop')
    const quotes = await tx.prisma.financeProductQuote.findMany({ where: { dealId: deal.id, rooftopId: deal.rooftopId, productId: { in: products.map((p: { id: string }) => p.id) }, status: 'quoted' }, orderBy: [{ completedAt: 'desc' }, { id: 'desc' }], take: 101 })
    if (quotes.length > 100) throw new Error('Quote review exceeds bounded projection')
    const latest = new Map<string, typeof quotes[number]>()
    for (const quote of quotes) if (!latest.has(quote.productId)) latest.set(quote.productId, quote)
    const snapshot = products.map((p: { id: string; code: string; name: string; category: string; providerKey: string }) => {
      const quote = latest.get(p.id)
      if (!quote || !quote.evidenceReference) throw new Error('Every menu product requires current operator/provider quote evidence')
      const result = quote.resultSnapshot && typeof quote.resultSnapshot === 'object' ? quote.resultSnapshot as { termMonths?: unknown } : {}
      const termMonths = Number.isInteger(result.termMonths) ? Number(result.termMonths) : null
      return { code: p.code, name: p.name, category: p.category, providerKey: p.providerKey, retailPriceCents: quote.retailPriceCents, termMonths, quoteId: quote.id, quoteEvidenceReference: quote.evidenceReference }
    })
    const previous = await tx.prisma.financeMenuVersion.findFirst({ where: { dealId: deal.id, rooftopId: deal.rooftopId }, orderBy: { version: 'desc' } })
    const version = (previous?.version || 0) + 1
    // Supersede decided menus too: the newest presented version invalidates prior funding.
    await tx.prisma.financeMenuVersion.updateMany({ where: { dealId: deal.id, rooftopId: deal.rooftopId }, data: { status: 'superseded' } })
    const saved = await tx.prisma.financeMenuVersion.create({ data: { rooftopId: deal.rooftopId, dealId: deal.id, version, status: 'presented', optionsSnapshot: snapshot, presentedAt: new Date(), idempotencyKey: key(data.idempotencyKey) } })
    const result = await scoped.query.FinanceMenuVersion.findOne({ where: { id: saved.id }, query: 'id version status optionsSnapshot presentedAt' })
    if (!result) throw new Error('Menu readback denied')
    return { result, detail: { options: snapshot, version } }
  })
}

async function decideFinanceMenuCommand(_r: unknown, { data }: any, context: any) {
  return artifactCommand(context, data, 'menu-decide', async (tx, scoped, deal) => {
    const menu = await tx.prisma.financeMenuVersion.findFirst({ where: { dealId: deal.id, rooftopId: deal.rooftopId }, orderBy: { version: 'desc' } })
    if (!menu || menu.id !== data.menuId || menu.status !== 'presented') throw new Error('Current presented menu not found for this deal')
    const selected = codes(data.selectedProductCodes || [], 'Selected products'), declined = codes(data.declinedProductCodes || [], 'Declined products')
    const options = Array.isArray(menu.optionsSnapshot) ? menu.optionsSnapshot : []
    const available = new Set(options.map((x: { code: string }) => x.code))
    if (available.size !== options.length || [...selected, ...declined].some(c => !available.has(c)) || selected.some(c => declined.includes(c)) || selected.length + declined.length !== available.size) throw new Error('Every distinct presented product requires accept or decline evidence')
    const acknowledgment = required(data.disclosureAcknowledgment, 'Disclosure acknowledgment', 1000)
    const status = selected.length ? 'accepted' : 'declined'
    const changed = await tx.prisma.financeMenuVersion.updateMany({ where: { id: menu.id, dealId: deal.id, rooftopId: deal.rooftopId, status: 'presented', updatedAt: menu.updatedAt },
      data: { status, selectedProductCodes: selected, declinedProductCodes: declined, disclosureAcknowledgment: acknowledgment, decidedAt: new Date() } })
    if (changed.count !== 1) throw new Error('Finance menu changed concurrently')
    const result = await scoped.query.FinanceMenuVersion.findOne({ where: { id: menu.id }, query: 'id version status selectedProductCodes declinedProductCodes disclosureAcknowledgment decidedAt' })
    if (!result) throw new Error('Menu decision readback denied')
    return { result, detail: { menuId: menu.id, selected, declined, acknowledgment } }
  })
}

async function recordFinanceComplianceCheckCommand(_r: unknown, { data }: any, context: any) {
  return artifactCommand(context, data, 'compliance-record', async (tx, scoped, deal) => {
    const checkType = required(data.checkType, 'Check type', 40), status = required(data.status, 'Status', 40)
    if (!['identity', 'ofac', 'red-flag', 'privacy'].includes(checkType) || !['requested', 'completed', 'failed', 'manual-review'].includes(status)) throw new Error('Invalid compliance check evidence')
    const providerKey = required(data.providerKey, 'Provider key', 80)
    financingPrerequisiteCapability(providerKey)
    const evidenceReference = String(data.evidenceReference || '').trim()
    if (status === 'completed') required(evidenceReference, 'Completed check evidence reference', 200)
    const now = new Date()
    const binding = await fundingBinding(tx, await tx.prisma.deal.findUnique({ where: { id: deal.id } }))
    const saved = await tx.prisma.financeComplianceCheck.create({ data: { rooftopId: deal.rooftopId, dealId: deal.id, checkType, providerKey, status,
      resultCode: String(data.resultCode || '').trim(), requestSnapshot: { providerKey, externalRequestSent: false, binding },
      resultSnapshot: { evidenceReference, externalCheckGuaranteed: false }, requestedAt: now, completedAt: status === 'requested' ? null : now, idempotencyKey: key(data.idempotencyKey) } })
    const result = await scoped.query.FinanceComplianceCheck.findOne({ where: { id: saved.id }, query: 'id checkType providerKey status resultCode requestedAt completedAt' })
    if (!result) throw new Error('Compliance readback denied')
    return { result, detail: { checkType, status, evidenceReference, externalCheckGuaranteed: false } }
  })
}

async function manageFinanceContractPackageCommand(_r: unknown, { data }: any, context: any) {
  return artifactCommand(context, data, 'contract-update', async (tx, scoped, deal) => {
    const action = required(data.action, 'Contract action', 50)
    if (!['prepare', 'mark-ready', 'request-handoff', 'record-provider-status'].includes(action)) throw new Error('Invalid contract action')
    const existing = await tx.prisma.financeContractPackage.findFirst({ where: { dealId: deal.id, rooftopId: deal.rooftopId } })
    const requiredDocuments = codes(data.requiredDocuments || existing?.requiredDocuments || [], 'Required documents')
    const documentChecklist = Array.isArray(data.documentChecklist) ? data.documentChecklist.map((x: { code: string; status: string }) => ({ code: required(x.code, 'Document code', 80), status: required(x.status, 'Document status', 30) })) : (existing?.documentChecklist || [])
    if (!Array.isArray(documentChecklist) || documentChecklist.length > 100 || documentChecklist.some((x: { status: string }) => !['missing', 'received', 'reviewed', 'complete'].includes(x.status))) throw new Error('Invalid document checklist')
    const providerKey = String(data.providerKey || existing?.providerKey || 'operator-recorded')
    financingPrerequisiteCapability(providerKey)
    let status = existing?.status || 'preparing'
    const envelopeReference = String(data.envelopeReference || existing?.envelopeReference || '').trim()
    let sentAt = existing?.sentAt || null, signedAt = existing?.signedAt || null
    assertContractAction(existing?.status, action, action === 'record-provider-status' ? String(data.providerStatus || '').trim() : undefined)
    if (action === 'prepare') { status = 'preparing'; sentAt = null; signedAt = null }
    if (action === 'mark-ready') {
      if (!requiredDocuments.length || requiredDocuments.some(code => !documentChecklist.some((x: { code: string; status: string }) => x.code === code && x.status === 'complete'))) throw new Error('Every required document must be complete')
      status = 'ready'; signedAt = null
    }
    if (action === 'request-handoff') {
      if (existing?.status !== 'ready') throw new Error('Ready contract package is required')
      status = 'awaiting-external-handoff'
    }
    if (action === 'record-provider-status') {
      status = required(data.providerStatus, 'Provider status', 40)
      if (!['sent', 'viewed', 'signed', 'declined', 'void'].includes(status) || !envelopeReference) throw new Error('Provider status requires envelope reference')
      required(data.evidenceReference, 'Provider evidence reference', 200)
      if (data.evidenceSource !== 'operator-recorded' || data.webhookEventId) throw new Error('Verified webhook evidence requires a configured signature-verification adapter')
      if (status === 'sent') sentAt = new Date()
      signedAt = status === 'signed' ? new Date() : null
    }
    const binding = await fundingBinding(tx, await tx.prisma.deal.findUnique({ where: { id: deal.id } }))
    const immutableStatusEvidence = { version: 2, action, status, providerKey, binding, evidenceReference: String(data.evidenceReference || '').trim(), evidenceSource: 'operator-recorded', externalHandoffSent: false }
    const values = { status, providerKey, envelopeReference, requiredDocuments, documentChecklist, immutableStatusEvidence, sentAt, signedAt }
    let id: string
    if (existing) {
      const changed = await tx.prisma.financeContractPackage.updateMany({ where: { id: existing.id, dealId: deal.id, rooftopId: deal.rooftopId, updatedAt: existing.updatedAt }, data: values })
      if (changed.count !== 1) throw new Error('Contract changed concurrently')
      id = existing.id
    } else id = (await tx.prisma.financeContractPackage.create({ data: { ...values, rooftopId: deal.rooftopId, dealId: deal.id, idempotencyKey: key(data.idempotencyKey) } })).id
    const result = await scoped.query.FinanceContractPackage.findOne({ where: { id }, query: 'id status providerKey envelopeReference requiredDocuments documentChecklist sentAt signedAt lastWebhookAt updatedAt' })
    if (!result) throw new Error('Contract readback denied')
    return { result, detail: { contractId: id, immutableStatusEvidence } }
  })
}

async function manageFinanceFundingCaseCommand(_root: unknown, { data }: any, context: any) {
  const visible = await dealForFinance(context, data.dealId)
  const status = required(data.status, 'Funding status', 40)
  if (!['pending', 'exception', 'clear-to-fund', 'funded', 'cancelled'].includes(status)) throw new Error('Invalid funding status')
  if (!Array.isArray(data.checklist) || !Array.isArray(data.exceptions) || data.checklist.length > 100 || data.exceptions.length > 100) throw new Error('Bounded funding checklist and exceptions are required')
  const checklist = data.checklist.map((x: any) => ({ code: required(x.code, 'Checklist code', 80), status: required(x.status, 'Checklist status', 30) }))
  const exceptions = data.exceptions.map((x: any) => ({ code: required(x.code, 'Exception code', 80), status: required(x.status, 'Exception status', 30), owner: String(x.owner || '').trim() || null, notes: String(x.notes || '').trim() || null }))
  if (checklist.some((x: any) => !['open', 'complete', 'waived'].includes(x.status)) || exceptions.some((x: any) => !['open', 'resolved', 'waived'].includes(x.status))) throw new Error('Invalid funding checklist evidence')
  if (['clear-to-fund', 'funded'].includes(status) && (!checklist.length || checklist.some((x: any) => x.status === 'open') || exceptions.some((x: any) => x.status === 'open'))) throw new Error('Funding cannot clear with open checklist items or exceptions')
  const fundingReference = String(data.fundingReference || '').trim()
  if (status === 'funded') required(fundingReference, visible.structureType === 'cash' ? 'Receipt reference' : 'Funding/reconfirmation reference for the current worksheet', 200)
  // Cash: funding is "payment received", recorded with the amount actually taken.
  const paymentAmountCents = data.paymentAmountCents == null ? null : Number(data.paymentAmountCents)
  if (paymentAmountCents != null && (!Number.isSafeInteger(paymentAmountCents) || paymentAmountCents < 0 || paymentAmountCents > 2_147_483_647)) throw new Error('Payment amount must be a non-negative amount in cents')
  const paymentMethod = data.paymentMethod == null || String(data.paymentMethod).trim() === '' ? null : dealPaymentMethod(data.paymentMethod)
  const expectedUpdatedAt = commandDate(data.expectedUpdatedAt)
  const expectedFundingUpdatedAt = data.expectedFundingUpdatedAt == null ? null : commandDate(data.expectedFundingUpdatedAt)
  if (!Number.isInteger(data.worksheetVersion) || data.worksheetVersion < 1) throw new Error('Current worksheet version is required')
  const eventKey = `finance-funding:${key(data.idempotencyKey)}`
  const request = { dealId: visible.id, status, checklist, exceptions, fundingReference,
    worksheetVersion: data.worksheetVersion, expectedUpdatedAt: expectedUpdatedAt.toISOString(), expectedFundingUpdatedAt: expectedFundingUpdatedAt?.toISOString() ?? null,
    ...(paymentAmountCents != null ? { paymentAmountCents } : {}), ...(paymentMethod ? { paymentMethod } : {}) }
  return context.transaction(async (tx: any) => {
    await lockDeal(tx, visible.id)
    const authority = await currentDealAuthority(tx, context.session, visible.id, ['canManageFinancing'])
    const deal = await tx.prisma.deal.findUnique({ where: { id: visible.id } })
    const needsCurrentEvidence = ['clear-to-fund', 'funded'].includes(status)
    if (!deal || deal.rooftopId !== authority.rooftopId) throw new Error('Deal authority changed')
    const existing = await readLockedFunding(tx, deal.id)
    if (existing && existing.rooftopId !== deal.rooftopId) throw new Error('Funding case rooftop authority changed')
    // Revocation must remain possible without first blessing stale/legacy authority.
    const currentBinding = () => needsCurrentEvidence ? fundingBinding(tx, deal) : Promise.resolve({ ...worksheetBinding(deal), acceptedHash: domainEventRequestHash(deal.acceptedSnapshot) })
    const header = await tx.prisma.domainAuditEvent.findUnique({ where: { eventKey }, select: { actorId: true, rooftopId: true, aggregateType: true, aggregateId: true, action: true } })
    if (header && (header.actorId !== context.session.itemId || header.rooftopId !== deal.rooftopId || header.aggregateType !== 'FinanceFundingCase' || header.aggregateId !== deal.id || header.action !== `status:${status}`)) throw new Error('Funding receipt is outside original actor/purpose scope')
    const prior = header ? await tx.prisma.domainAuditEvent.findUnique({ where: { eventKey } }) : null
    if (prior) {
      const vehicle = await tx.prisma.vehicle.findUnique({ where: { id: deal.vehicleId }, select: { id: true, rooftopId: true } })
      const lead = await tx.prisma.lead.findUnique({ where: { id: deal.leadId }, select: { id: true, rooftopId: true } })
      if (!vehicle || !lead || vehicle.rooftopId !== deal.rooftopId || lead.rooftopId !== deal.rooftopId || prior.afterSnapshot?.binding?.leadId !== deal.leadId) throw new Error('Committed funding related identity is unavailable in current scope')
      if (prior.actorId !== context.session.itemId || prior.rooftopId !== deal.rooftopId || prior.afterSnapshot?.dealId !== deal.id ||
          stableJson(prior.afterSnapshot?.request) !== stableJson(request) || !existing ||
          prior.afterSnapshot?.version !== 2 || prior.afterSnapshot?.binding?.dealId !== deal.id ||
          prior.afterSnapshot?.binding?.rooftopId !== deal.rooftopId || prior.afterSnapshot?.binding?.vehicleId !== deal.vehicleId) throw new Error('Funding retry is changed or superseded; reload and reconfirm')
      // SAME historical command: return currently scoped readback, never grant funding anew
      // or erase its original durable audit because underlying artifacts later drifted.
      const current = await authority.context.db.FinanceFundingCase.findOne({ where: { id: existing.id } })
      if (!current) throw new Error('Committed funding readback unavailable in current scope; reconcile the original receipt')
      return current
    }
    if (deal.status === 'delivered' || (needsCurrentEvidence && !['approved', 'financed'].includes(deal.status))) throw new Error('Approved or financed deal is required for funding; delivered funding cannot be changed')
    if (deal.worksheetVersion !== data.worksheetVersion || deal.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw new Error('Deal worksheet changed; reload and review funding')
    if ((existing?.updatedAt?.getTime() ?? null) !== (expectedFundingUpdatedAt?.getTime() ?? null)) throw new Error('Funding case changed; reload and review before updating')
    const binding = await currentBinding()
    const now = new Date()
    const cashPayment = deal.structureType === 'cash' && status === 'funded'
      ? await recordCashSalePrerequisites(tx, deal, { binding, fundingReference, paymentAmountCents, actorId: context.session.itemId, idempotencyKey: key(data.idempotencyKey), now })
      : null
    let prerequisites: any = null
    if (needsCurrentEvidence) {
      prerequisites = await assertReviewedPrerequisites(tx, deal)
    }
    const evidence = { version: 2, request, dealId: deal.id, binding, status, checklist, exceptions, fundingReference,
      evidenceSource: 'operator-recorded', prerequisites, fundedAt: status === 'funded' ? now.toISOString() : null,
      previousEvidenceHash: existing ? domainEventRequestHash(existing.immutableEvidence) : null,
      ...(cashPayment ? { payment: { ...cashPayment, paymentMethod } } : {}) }
    const values = { status, checklist, exceptions, fundingReference, fundedAt: status === 'funded' ? now : null, immutableEvidence: evidence }
    let id: string
    if (existing) {
      const changed = await tx.prisma.financeFundingCase.updateMany({ where: { id: existing.id, dealId: deal.id, rooftopId: deal.rooftopId, updatedAt: expectedFundingUpdatedAt }, data: values })
      if (changed.count !== 1) throw new Error('Funding case changed concurrently')
      id = existing.id
    } else {
      id = (await tx.prisma.financeFundingCase.create({ data: { ...values, rooftopId: deal.rooftopId, dealId: deal.id, idempotencyKey: key(data.idempotencyKey) }, select: { id: true } })).id
    }
    if (cashPayment && cashPayment.amountCents > 0) {
      // A cash sale's money is a PaymentTransaction like any other deal payment, so reporting and
      // reconciliation see it. Operator-recorded: no processor was involved.
      if (!paymentMethod) throw new Error('Choose how the payment was made')
      if ((await tx.prisma.paymentTransaction.findFirst({ where: { providerTransactionId: fundingReference }, select: { id: true } }))?.id) throw new Error('That receipt reference is already recorded on another payment')
      const payment = await tx.prisma.paymentTransaction.create({ data: { rooftopId: deal.rooftopId, dealId: deal.id, sourceType: 'deal', amountCents: cashPayment.amountCents,
        currency: 'usd', providerKey: 'operator-recorded', paymentMethod, providerTransactionId: fundingReference, status: 'captured', capturedCents: cashPayment.amountCents,
        idempotencyKey: cashPayment.paymentIdempotencyKey }, select: { id: true } })
      // Keystone's Prisma extension resolves failed queries to an error object instead of throwing.
      if (!payment?.id || payment instanceof Error) throw new Error('Nothing was saved: the payment could not be recorded')
    }
    await recordDomainEventInTransaction(tx, { eventKey, rooftopId: deal.rooftopId, aggregateType: 'FinanceFundingCase', aggregateId: deal.id, action: `status:${status}`, topic: 'finance-funding.updated', actorId: context.session.itemId, beforeSnapshot: undefined, afterSnapshot: evidence, payload: { rooftopId: deal.rooftopId, dealId: deal.id, status } })
    return authority.context.db.FinanceFundingCase.findOne({ where: { id } })
  }, { timeout: 30_000, isolationLevel: 'Serializable' })
}

/**
 * Cash sale: recording payment received is the funding event. In the same transaction it
 * - checks the amount against what the buyer still owes (server pricing, minus recorded payments),
 * - declines F&I when no menu was presented (the menu is optional on cash; an undecided one blocks),
 * - confirms the current documents and checks as the prerequisite review, bound to this receipt.
 * The full lender path (separate review, funding checklist) stays for finance and lease deals.
 */
async function recordCashSalePrerequisites(tx: any, deal: any, input: { binding: unknown; fundingReference: string; paymentAmountCents: number | null; actorId: string; idempotencyKey: string; now: Date }) {
  const latestMenu = await tx.prisma.financeMenuVersion.findFirst({ where: { dealId: deal.id, rooftopId: deal.rooftopId }, orderBy: [{ version: 'desc' }, { id: 'desc' }] })
  if (latestMenu?.status === 'presented') throw new Error('Record the customer\'s F&I menu decision first')
  if (!latestMenu) {
    await tx.prisma.financeMenuVersion.create({ data: { rooftopId: deal.rooftopId, dealId: deal.id, version: 1, status: 'declined',
      optionsSnapshot: [], selectedProductCodes: [], declinedProductCodes: [], disclosureAcknowledgment: 'Cash sale: no F&I products presented',
      presentedAt: input.now, decidedAt: input.now, idempotencyKey: `${input.idempotencyKey}:cash-menu` } })
  }
  // Documents and checks first (rolls back the auto-declined menu if any are missing), then the money.
  const current = await readCurrentPrerequisites(tx, deal)
  const amountDueCents = calculateDealPrice(deal).cashPayableCents
  const previouslyReceivedCents = await dealReceivedCents(tx, deal)
  const remainingCents = amountDueCents - previouslyReceivedCents
  if (input.paymentAmountCents == null) throw new Error('Enter the payment amount received')
  if (remainingCents < 0) throw new Error(`Recorded payments exceed the amount due by ${formatUsdCents(-remainingCents)}; refund the difference first`)
  if (input.paymentAmountCents !== remainingCents) {
    throw new Error(remainingCents === 0 ? 'This deal is already paid in full; enter 0 to reconfirm the payment' : `Payment must equal the ${formatUsdCents(remainingCents)} still due`)
  }
  const purpose = 'funding-delivery-prerequisite-review'
  const policy = { policyReference: 'cash-sale-payment', policyVersion: '1', reviewerAuthorityReference: `user:${input.actorId}`, reviewReference: input.fundingReference }
  await recordDomainEventInTransaction(tx, { eventKey: `finance-prerequisite-review:cash-payment:${input.idempotencyKey}`, rooftopId: deal.rooftopId,
    aggregateType: 'Deal', aggregateId: deal.id, action: 'prerequisites-reviewed', topic: 'finance-prerequisites.reviewed', actorId: input.actorId, occurredAt: input.now,
    afterSnapshot: { version: 1, purpose, actorId: input.actorId, request: { dealId: deal.id, worksheetVersion: deal.worksheetVersion, purpose, source: 'cash-payment' },
      ...current, binding: input.binding, ...policy, capability: financingPrerequisiteCapability('operator-recorded'), acceptedTermsHash: domainEventRequestHash(deal.acceptedSnapshot) },
    payload: { dealId: deal.id, rooftopId: deal.rooftopId, worksheetVersion: deal.worksheetVersion } })
  return { amountCents: input.paymentAmountCents, amountDueCents, previouslyReceivedCents, receiptReference: input.fundingReference,
    paymentIdempotencyKey: `cash-payment:${input.idempotencyKey}` }
}

async function recordFinanceProductQuoteCommand(_r:unknown,{data}:any,context:any){const deal=await dealForFinance(context,data.dealId);const product=await context.query.FinanceProduct.findOne({where:{id:String(data.productId||'')},query:'id code providerKey rooftop { id }'});if(!product||product.rooftop?.id!==deal.rooftop.id)throw new Error('Finance product not found at this rooftop');const status=required(data.status,'Quote status',30);if(!['requested','quoted','failed'].includes(status))throw new Error('Invalid quote status');const providerKey=product.providerKey;if(!financingProviderKeys().includes(providerKey))throw new Error('Unsupported product provider');const retailPriceCents=data.retailPriceCents==null?null:Number(data.retailPriceCents),costCents=data.costCents==null?null:Number(data.costCents),evidenceReference=String(data.evidenceReference||'').trim(),termMonths=data.termMonths==null?null:Number(data.termMonths);if(termMonths!=null&&(!Number.isInteger(termMonths)||termMonths<1||termMonths>240))throw new Error('Term must be 1 to 240 months');if(status==='quoted'&&(!Number.isInteger(retailPriceCents)||Number(retailPriceCents)<0||!Number.isInteger(costCents)||Number(costCents)<0||!evidenceReference))throw new Error('Quoted products require integer prices and provider/operator evidence');const now=new Date(),eventKey=`finance-product-quote:${key(data.idempotencyKey)}`,evidence={dealId:deal.id,productId:product.id,productCode:product.code,providerKey,status,retailPriceCents,costCents,evidenceReference:evidenceReference||null,termMonths,externalRateGuaranteed:false,recordedAt:now.toISOString()};const id=await eventTx(context,{eventKey,rooftopId:deal.rooftop.id,aggregateType:'FinanceProductQuote',aggregateId:deal.id,action:`recorded:${status}`,topic:'finance-product-quote.recorded',actorId:context.session.itemId,afterSnapshot:evidence,payload:{rooftopId:deal.rooftop.id,dealId:deal.id,productId:product.id,status}},async(tx,reused)=>{if(reused){const found=await tx.prisma.financeProductQuote.findUnique({where:{idempotencyKey:key(data.idempotencyKey)},select:{id:true}});if(!found)throw new Error('Quote replay record missing');return found.id}return(await tx.prisma.financeProductQuote.create({data:{rooftopId:deal.rooftop.id,dealId:deal.id,productId:product.id,providerKey,status,retailPriceCents,costCents,evidenceReference,requestSnapshot:{externalRequestSent:false},resultSnapshot:{evidenceReference:evidenceReference||null,termMonths,externalRateGuaranteed:false},requestedAt:now,completedAt:status==='requested'?null:now,idempotencyKey:key(data.idempotencyKey)},select:{id:true}})).id});return context.db.FinanceProductQuote.findOne({ where: {id} })}

/** Pro-rata refund inputs the operator confirmed; stored as evidence beside the refund amount. */
function cancellationRefundBasis(value: unknown) {
  if (value == null) return null
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Refund basis is invalid')
  const input = value as Record<string, unknown>
  const int = (name: string, max: number) => {
    const n = Number(input[name])
    if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`Refund basis ${name} is invalid`)
    return n
  }
  const method = String(input.method || '')
  if (!['pro-rata-months', 'flat'].includes(method)) throw new Error('Refund basis method is invalid')
  return { method, retailPriceCents: int('retailPriceCents', 2_147_483_647), termMonths: int('termMonths', 240), monthsUsed: int('monthsUsed', 240), cancellationFeeCents: int('cancellationFeeCents', 2_147_483_647) }
}

async function recordFinanceProductCancellationCommand(_r:unknown,{data}:any,context:any){const deal=await dealForFinance(context,data.dealId);const menu=await context.query.FinanceMenuVersion.findOne({where:{id:String(data.menuId||'')},query:'id status selectedProductCodes deal { id } rooftop { id }'});const productCode=required(data.productCode,'Product code',80);if(!menu||menu.deal?.id!==deal.id||menu.status!=='accepted'||!Array.isArray(menu.selectedProductCodes)||!menu.selectedProductCodes.includes(productCode))throw new Error('Cancellation must reference an accepted menu product');const status=required(data.status,'Cancellation status',30);if(!['requested','completed','denied'].includes(status))throw new Error('Invalid cancellation status');const reason=required(data.reason,'Cancellation reason',1000),refundCents=data.refundCents==null?0:Number(data.refundCents);if(!Number.isInteger(refundCents)||refundCents<0||status==='completed'&&!required(data.evidenceReference,'Cancellation evidence reference',200))throw new Error('Invalid cancellation evidence');const refundBasis=cancellationRefundBasis(data.refundBasis);const now=new Date(),eventKey=`finance-product-cancellation:${key(data.idempotencyKey)}`,evidence={dealId:deal.id,menuId:menu.id,productCode,status,reason,refundCents,refundBasis,evidenceReference:String(data.evidenceReference||'').trim()||null,recordedAt:now.toISOString()};const id=await eventTx(context,{eventKey,rooftopId:deal.rooftop.id,aggregateType:'FinanceProductCancellation',aggregateId:deal.id,action:`recorded:${status}`,topic:'finance-product-cancellation.recorded',actorId:context.session.itemId,afterSnapshot:evidence,payload:{rooftopId:deal.rooftop.id,dealId:deal.id,productCode,status,refundCents}},async(tx,reused)=>{if(reused){const found=await tx.prisma.financeProductCancellation.findUnique({where:{idempotencyKey:key(data.idempotencyKey)},select:{id:true}});if(!found)throw new Error('Cancellation replay record missing');return found.id}return(await tx.prisma.financeProductCancellation.create({data:{rooftopId:deal.rooftop.id,dealId:deal.id,menuId:menu.id,productCode,status,reason,refundCents,evidence:{evidenceReference:evidence.evidenceReference,refundBasis},requestedAt:now,completedAt:status==='requested'?null:now,idempotencyKey:key(data.idempotencyKey)},select:{id:true}})).id});return context.db.FinanceProductCancellation.findOne({ where: {id} })}

// Each finance command's own validation ("Record product quotes first") reaches the desk verbatim.
export const configureFinanceProduct = operatorCommand(configureFinanceProductCommand)
export const presentFinanceMenu = operatorCommand(presentFinanceMenuCommand)
export const decideFinanceMenu = operatorCommand(decideFinanceMenuCommand)
export const recordFinanceComplianceCheck = operatorCommand(recordFinanceComplianceCheckCommand)
export const manageFinanceContractPackage = operatorCommand(manageFinanceContractPackageCommand)
export const manageFinanceFundingCase = operatorCommand(manageFinanceFundingCaseCommand)
export const recordFinanceProductQuote = operatorCommand(recordFinanceProductQuoteCommand)
export const recordFinanceProductCancellation = operatorCommand(recordFinanceProductCancellationCommand)
