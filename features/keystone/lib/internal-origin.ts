import { signInternalClientIdentity } from '../security/internalIdentity'

/**
 * Server-side GraphQL calls go to this process over loopback instead of the public host, so they
 * stop sharing the platform's egress IP rate-limit bucket. Request Host/forwarded headers are
 * never inputs to the origin.
 */
export function loopbackOrigin(port: string | undefined = process.env.PORT): string | null {
  const value = String(port ?? '').trim()
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) return null
  return `http://127.0.0.1:${value}`
}

export function internalGraphqlEndpoint(port?: string): string | null {
  const origin = loopbackOrigin(port)
  return origin ? `${origin}/api/graphql` : null
}

type HeaderReader = { get(name: string): string | null }

/**
 * The END user's real client address from the incoming request (x-real-ip on Railway), so every
 * visitor keeps their own bucket. Never a constant shared by all visitors.
 */
export function clientSourceFromHeaders(headers: HeaderReader | null | undefined): string | null {
  if (!headers) return null
  const realIp = (headers.get('x-real-ip') || '').split(',')[0]?.trim()
  if (realIp) return realIp
  const forwarded = (headers.get('x-forwarded-for') || '').split(',')[0]?.trim()
  return forwarded || null
}

/** Signed identity headers, or {} (unsigned, today's behaviour) when no source/secret. Never throws. */
export function internalIdentityHeaders(
  source: string | null | undefined,
  secret: string = String(process.env.SESSION_SECRET || ''),
  now = Date.now(),
): Record<string, string> {
  try {
    if (!source) return {}
    const signed = signInternalClientIdentity(source, secret, now)
    if (!signed) return {}
    return {
      'x-openfront-client-identity': signed.identity,
      'x-openfront-client-timestamp': signed.timestamp,
      'x-openfront-client-signature': signed.signature,
    }
  } catch {
    return {}
  }
}

/**
 * The visitor's PUBLIC host and protocol, so a loopback GraphQL call still builds customer-facing
 * links (payment success/cancel URLs, receipt links) on the public domain rather than 127.0.0.1.
 * Only well-formed host names are kept; anything else is dropped.
 */
export function publicForwardHeaders(headers: HeaderReader | null | undefined): Record<string, string> {
  if (!headers) return {}
  const first = (value: string | null) => String(value || '').split(',')[0].trim()
  const host = first(headers.get('x-forwarded-host')) || first(headers.get('host'))
  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host) || /^(127\.|localhost(?::|$)|0\.0\.0\.0)/i.test(host)) return {}
  const proto = first(headers.get('x-forwarded-proto')).toLowerCase()
  return { 'x-forwarded-host': host, 'x-forwarded-proto': proto === 'http' ? 'http' : 'https' }
}

const INTERNAL_GRAPHQL_TIMEOUT_MS = 10_000

/** A fetch for loopback GraphQL: same endpoint only, no redirects, timeout, fresh signature per call. */
export function createInternalGraphqlFetch(
  source: string | null | undefined,
  endpoint: string,
  forwarded: Record<string, string> = {},
): typeof fetch {
  const target = new URL(endpoint)
  return async (input, init) => {
    const rawUrl = input instanceof Request ? input.url : String(input)
    const url = new URL(rawUrl, target)
    if (url.origin !== target.origin || url.pathname !== target.pathname || url.username || url.password) {
      throw new Error('Internal GraphQL requests must target the loopback GraphQL endpoint')
    }
    const headers = new Headers(init?.headers)
    for (const [name, value] of Object.entries(forwarded)) headers.set(name, value)
    for (const [name, value] of Object.entries(internalIdentityHeaders(source))) headers.set(name, value)
    const controller = new AbortController()
    const callerSignal = init?.signal
    const abortWithCaller = () => controller.abort(callerSignal?.reason)
    if (callerSignal?.aborted) abortWithCaller()
    else callerSignal?.addEventListener('abort', abortWithCaller, { once: true })
    const timeout = setTimeout(() => controller.abort(new Error('Internal GraphQL request timed out')), INTERNAL_GRAPHQL_TIMEOUT_MS)
    try {
      return await fetch(url, { ...init, headers, signal: controller.signal, redirect: 'error' })
    } finally {
      clearTimeout(timeout)
      callerSignal?.removeEventListener('abort', abortWithCaller)
    }
  }
}
