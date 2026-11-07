import { createHmac, timingSafeEqual } from 'node:crypto'

import { recordDomainEventInTransaction } from '../lifecycle/domainEvents'
import { sendCustomerEmailVerification, storefrontBaseUrl } from '../lib/customerVerificationMail'
import { localeFromCookieHeader } from '@/features/i18n/server'
import { normalizeCustomerEmail } from './customerIdentity'
import { requireCustomerAccount } from './customerOwnership'

// Links CRM Customer records to the storefront login that proves it owns their email.
//
// Registration does not verify email, so the account's email alone is never enough to
// claim anything. The account requests a token that is mailed to its own current email
// (never an address from the request); the token is an HMAC over (account, email, expiry)
// keyed with the existing SESSION_SECRET. Confirming requires the same signed-in account
// and an unchanged account email, then links the active Customers whose normalizedEmail
// is exactly that address. customerOwnership then claims only those Customers' leads
// whose own email is that address.

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const PURPOSE = 'customer-email-verification'

function secret() {
  const value = process.env.SESSION_SECRET
  if (!value || value.length < 32) throw new Error('Email verification is unavailable')
  return value
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(`${PURPOSE}:${payload}`).digest('base64url')
}

export function customerVerificationToken(accountId: string, email: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ u: accountId, e: email, x: now + TOKEN_TTL_MS })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

function readToken(token: unknown) {
  const [payload, signature, extra] = String(token || '').trim().split('.')
  if (!payload || !signature || extra !== undefined) return null
  const expected = Buffer.from(sign(payload))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof data?.u !== 'string' || typeof data?.e !== 'string' || typeof data?.x !== 'number') return null
    return { accountId: data.u as string, email: data.e as string, expiresAt: data.x as number }
  } catch {
    return null
  }
}

async function accountEmail(context: any, accountId: string) {
  const user = await context.prisma.user.findUnique({ where: { id: accountId }, select: { id: true, email: true } })
  const email = normalizeCustomerEmail(user?.email)
  if (!user || !email) throw new Error('Account not found')
  return email
}

export async function requestCustomerEmailVerification(_root: unknown, _args: unknown, context: any) {
  const accountId = requireCustomerAccount(context)
  const email = await accountEmail(context, accountId)
  const base = storefrontBaseUrl()
  if (!base) throw new Error('Email verification is unavailable')
  const url = `${base.replace(/\/$/, '')}/account/verify?token=${encodeURIComponent(customerVerificationToken(accountId, email))}`
  try {
    await sendCustomerEmailVerification(email, url, localeFromCookieHeader(context?.req?.headers?.cookie))
  } catch {
    throw new Error('The verification email could not be sent. Try again later.')
  }
  return { sent: true, email }
}

export async function customerEmailLinkStatus(_root: unknown, _args: unknown, context: any) {
  const accountId = requireCustomerAccount(context)
  const email = await accountEmail(context, accountId)
  const linked = await context.prisma.customer.count({ where: { accountId, status: 'active', normalizedEmail: email } })
  return { email, linkedCustomerCount: linked, verified: linked > 0 }
}

export async function confirmCustomerEmailVerification(_root: unknown, { token }: { token: string }, context: any) {
  const accountId = requireCustomerAccount(context)
  const claim = readToken(token)
  if (!claim || claim.accountId !== accountId) throw new Error('This verification link is invalid for this account.')
  if (claim.expiresAt < Date.now()) throw new Error('This verification link has expired. Send a new one.')
  const email = await accountEmail(context, accountId)
  if (normalizeCustomerEmail(claim.email) !== email) throw new Error('Your account email changed. Send a new verification link.')

  return context.transaction(async (tx: any) => {
    const candidates = await tx.prisma.customer.findMany({
      where: { normalizedEmail: email, status: 'active' },
      take: 200,
      select: { id: true, rooftopId: true, accountId: true },
    })
    // A Customer stays with an earlier account only while that account still owns the address.
    const otherAccountIds = [...new Set(candidates.map((customer: any) => customer.accountId).filter((id: any) => id && id !== accountId))]
    const others = otherAccountIds.length
      ? await tx.prisma.user.findMany({ where: { id: { in: otherAccountIds } }, select: { id: true, email: true } })
      : []
    const stillOwned = new Set(others.filter((user: any) => normalizeCustomerEmail(user.email) === email).map((user: any) => user.id))
    const claimable = candidates.filter((customer: any) => customer.accountId !== accountId && !stillOwned.has(customer.accountId))
    let newlyLinkedCount = 0
    for (const customer of claimable) {
      const changed = await tx.prisma.customer.updateMany({
        where: { id: customer.id, normalizedEmail: email, status: 'active', accountId: customer.accountId ?? null },
        data: { accountId },
      })
      if (changed.count !== 1) continue
      newlyLinkedCount += 1
      await recordDomainEventInTransaction(tx, {
        eventKey: `customer-account-link:${customer.id}:${accountId}:${claim.expiresAt}`,
        rooftopId: customer.rooftopId,
        aggregateType: 'Customer',
        aggregateId: customer.id,
        action: 'account-linked',
        topic: 'customer.account-linked',
        actorId: accountId,
        afterSnapshot: { customerId: customer.id, accountId, previousAccountId: customer.accountId ?? null, evidence: 'email-verification' },
        payload: { customerId: customer.id, rooftopId: customer.rooftopId, accountId },
      })
    }
    const linked = await tx.prisma.customer.count({ where: { accountId, status: 'active', normalizedEmail: email } })
    return { email, linkedCustomerCount: linked, newlyLinkedCount, verified: true }
  }, { timeout: 30_000 })
}
