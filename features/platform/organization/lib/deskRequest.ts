import { ClientError, GraphQLClient } from 'graphql-request'

import { getAuthHeaders } from '@/features/dashboard/lib/cookies'
import { getServerGraphQLTarget } from '@/features/dashboard/lib/getBaseUrl'
import { PUBLIC_REQUEST_ERROR, safeErrorSummary } from '@/features/dashboard/lib/security'

/** Matches `OPERATOR_COMMAND_REJECTED` in features/keystone/mutations/operatorCommandErrors.ts. */
const OPERATOR_COMMAND_REJECTED = 'OPERATOR_COMMAND_REJECTED'

export type DeskResult<T> =
  | { success: true; data: T; error?: never; fieldErrors?: never }
  | { success: false; error: string; fieldErrors?: Record<string, string>; data?: never }

type GraphQLErrorEntry = { message?: string; extensions?: { code?: string } }

/**
 * Turns the staff-safe parts of a GraphQL failure into a message and per-field errors:
 * operator command rejections, Keystone validation messages, unique-constraint hits and
 * access denials. Anything else keeps the generic public message.
 */
function describeFailure(error: unknown): { error: string; fieldErrors?: Record<string, string> } | null {
  if (!(error instanceof ClientError)) return null
  const errors: GraphQLErrorEntry[] = Array.isArray(error.response?.errors) ? (error.response.errors as GraphQLErrorEntry[]) : []
  for (const entry of errors) {
    const code = entry?.extensions?.code
    const message = typeof entry?.message === 'string' ? entry.message.trim() : ''
    if (code === OPERATOR_COMMAND_REJECTED && message) return { error: message }
    if (code === 'KS_VALIDATION_FAILURE' && message) {
      const details = message.split('\n').map(line => line.trim()).filter(line => line.startsWith('- ')).map(line => line.slice(2))
      const fieldErrors: Record<string, string> = {}
      for (const detail of details) {
        const match = detail.match(/^[A-Za-z]+\.([A-Za-z]+):\s*(.+)$/)
        if (match) fieldErrors[match[1]] = match[2]
      }
      return { error: details.length ? details.map(detail => detail.replace(/^[A-Za-z]+(?:\.[A-Za-z]+)?:\s*/, '')).join('. ') : 'Check the highlighted fields', fieldErrors }
    }
    if (code === 'KS_PRISMA_ERROR' && /Unique constraint/i.test(message)) {
      const field = message.match(/\(`([A-Za-z]+)`\)/)?.[1]
      return { error: field ? `That ${field} is already in use` : 'That value is already in use', fieldErrors: field ? { [field]: 'Already in use' } : undefined }
    }
    if (code === 'KS_ACCESS_DENIED') return { error: 'You do not have permission for this change' }
  }
  return null
}

export async function deskRequest<T>(query: string, variables: Record<string, unknown> = {}): Promise<DeskResult<T>> {
  try {
    const target = await getServerGraphQLTarget()
    const client = new GraphQLClient(target.endpoint, {
      credentials: 'include',
      redirect: 'error',
      ...(target.fetch ? { fetch: target.fetch } : {}),
      headers: (await getAuthHeaders()) || {},
    })
    return { success: true, data: await client.request<T>(query, variables) }
  } catch (error) {
    const described = describeFailure(error)
    if (described) return { success: false, ...described }
    console.error('Desk request failed:', safeErrorSummary(error))
    return { success: false, error: PUBLIC_REQUEST_ERROR }
  }
}
