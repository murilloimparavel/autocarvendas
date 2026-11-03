import { ClientError, GraphQLClient } from 'graphql-request'

import { getAuthHeaders } from '@/features/dashboard/lib/cookies'
import { getServerGraphQLTarget } from '@/features/dashboard/lib/getBaseUrl'
import { PUBLIC_REQUEST_ERROR, safeErrorSummary } from '@/features/dashboard/lib/security'

/** Matches `INVENTORY_COMMAND_REJECTED` in features/keystone/mutations/inventoryCommandErrors.ts. */
const INVENTORY_COMMAND_REJECTED = 'INVENTORY_COMMAND_REJECTED'

/**
 * `rejected` means the server refused the command with a staff-facing reason, so nothing was applied
 * and the message can be shown as-is. Any other failure keeps the generic message and is unconfirmed.
 */
export type InventoryCommandResponse<T> =
  | { success: true; data: T; error?: never; rejected?: never }
  | { success: false; error: string; rejected: boolean; data?: never }

function rejectionMessage(error: unknown) {
  if (!(error instanceof ClientError)) return null
  const errors = Array.isArray(error.response?.errors) ? error.response.errors : []
  const rejected = errors.find(entry => entry?.extensions?.code === INVENTORY_COMMAND_REJECTED)
  return rejected && typeof rejected.message === 'string' && rejected.message.trim() ? rejected.message.trim() : null
}

export async function inventoryCommandRequest<T>(query: string, variables: Record<string, unknown>): Promise<InventoryCommandResponse<T>> {
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
    console.error('Inventory command failed:', safeErrorSummary(error))
    return { success: false, error: PUBLIC_REQUEST_ERROR, rejected: false }
  }
}

/**
 * Sends one file with a command as a GraphQL multipart request (the spec `pages/api/graphql.ts` parses
 * with graphql-upload). `filePath` is the variable path the file fills, for example `data.photo.upload`.
 */
export async function inventoryCommandUpload<T>(query: string, variables: Record<string, unknown>, filePath: string, file: File): Promise<InventoryCommandResponse<T>> {
  try {
    const form = new FormData()
    form.append('operations', JSON.stringify({ query, variables }))
    form.append('map', JSON.stringify({ 1: [`variables.${filePath}`] }))
    form.append('1', file, file.name)
    const target = await getServerGraphQLTarget()
    const response = await (target.fetch ?? fetch)(target.endpoint, {
      method: 'POST',
      headers: (await getAuthHeaders()) || {},
      body: form,
      redirect: 'error',
      cache: 'no-store',
    })
    const json = await response.json().catch(() => null) as { data?: T; errors?: Array<{ message?: string; extensions?: { code?: string } }> } | null
    const errors = Array.isArray(json?.errors) ? json.errors : []
    const rejected = errors.find(entry => entry?.extensions?.code === INVENTORY_COMMAND_REJECTED)
    if (rejected && typeof rejected.message === 'string' && rejected.message.trim()) return { success: false, error: rejected.message.trim(), rejected: true }
    if (!response.ok || errors.length || !json?.data) {
      console.error('Inventory upload failed:', safeErrorSummary({ response: { status: response.status, errors } }))
      return { success: false, error: PUBLIC_REQUEST_ERROR, rejected: false }
    }
    return { success: true, data: json.data }
  } catch (error) {
    console.error('Inventory upload failed:', safeErrorSummary(error))
    return { success: false, error: PUBLIC_REQUEST_ERROR, rejected: false }
  }
}
