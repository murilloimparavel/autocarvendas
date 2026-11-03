import { ClientError, GraphQLClient } from 'graphql-request'

import { getAuthHeaders } from '@/features/dashboard/lib/cookies'
import { getServerGraphQLTarget } from '@/features/dashboard/lib/getBaseUrl'
import { PUBLIC_REQUEST_ERROR, safeErrorSummary } from '@/features/dashboard/lib/security'

/** Matches `OPERATOR_COMMAND_REJECTED` in features/keystone/mutations/operatorCommandErrors.ts. */
const OPERATOR_COMMAND_REJECTED = 'OPERATOR_COMMAND_REJECTED'

/**
 * `rejected` means the server refused the command with a staff-facing reason, so nothing was applied
 * and the message can be shown as-is. Any other failure keeps the generic message and is unconfirmed.
 */
export type OperatorCommandResponse<T> =
  | { success: true; data: T; error?: never; rejected?: never }
  | { success: false; error: string; rejected: boolean; data?: never }

function rejectionMessage(error: unknown) {
  if (!(error instanceof ClientError)) return null
  const errors = Array.isArray(error.response?.errors) ? error.response.errors : []
  const rejected = errors.find(entry => entry?.extensions?.code === OPERATOR_COMMAND_REJECTED)
  return rejected && typeof rejected.message === 'string' && rejected.message.trim() ? rejected.message.trim() : null
}

/** Server-action helper for finance, funding and delivery mutations. */
export async function operatorCommandRequest<T>(query: string, variables: Record<string, unknown>): Promise<OperatorCommandResponse<T>> {
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
    const message = rejectionMessage(error)
    if (message) return { success: false, error: message, rejected: true }
    console.error('Operator command failed:', safeErrorSummary(error))
    return { success: false, error: PUBLIC_REQUEST_ERROR, rejected: false }
  }
}
