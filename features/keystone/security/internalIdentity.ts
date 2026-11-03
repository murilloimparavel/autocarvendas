import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Dependency-free signer for the loopback-only forwarded client identity.
 * graphqlSecurity re-exports it and verifies it (loopback socket + fresh HMAC).
 */
export function signInternalClientIdentity(source: string, secret: string, now = Date.now()) {
  if (!source || secret.length < 32) return null
  const identity = createHash('sha256').update(source).digest('hex')
  const timestamp = String(Math.floor(now / 1_000))
  const signature = createHmac('sha256', secret).update(`${timestamp}:${identity}`).digest('hex')
  return { identity, timestamp, signature }
}

const INTERNAL_IDENTITY_MAX_AGE_MS = 90_000

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

/**
 * Verifier for the forwarded end-user identity (hospital 861591a pattern). Accepted only from a LOOPBACK socket
 * with a fresh (<= 90s) valid HMAC of SESSION_SECRET (>= 32 chars). Any rate limiter must use this first.
 */
export function verifiedInternalIdentity(
  headers: Record<string, string | string[] | undefined>,
  socketAddress: string | null | undefined,
  secret: string = String(process.env.SESSION_SECRET || ''),
  now: number = Date.now(),
) {
  const loopback = /^(?:127\.|::1$|::ffff:127\.)/.test(String(socketAddress || ''))
  if (!loopback || secret.length < 32) return null
  const identity = String(headers['x-openfront-client-identity'] || '')
  const timestamp = String(headers['x-openfront-client-timestamp'] || '')
  const signature = String(headers['x-openfront-client-signature'] || '')
  if (!/^[a-f0-9]{64}$/.test(identity) || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature)) return null
  const age = Math.abs(now - Number(timestamp) * 1_000)
  if (!Number.isFinite(age) || age > INTERNAL_IDENTITY_MAX_AGE_MS) return null
  const expected = createHmac('sha256', secret).update(`${timestamp}:${identity}`).digest('hex')
  return safeEqual(signature, expected) ? `forwarded:${identity}` : null
}
