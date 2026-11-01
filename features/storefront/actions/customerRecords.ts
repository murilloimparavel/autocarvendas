'use server'

import { revalidatePath } from 'next/cache'

import { openfrontClient } from '../lib/config'
import { getAuthHeaders } from '../lib/data/cookies'
import type {
  CustomerEmailLink,
  CustomerPayment,
  CustomerPurchase,
  CustomerRequestRow,
  CustomerServiceOrder,
  CustomerServiceVisit,
} from '../lib/accountRecords'

// Every read and write here runs as the signed-in session. The server resolves
// ownership; nothing in these calls names a customer, email or account.

async function request<T>(document: string, variables: Record<string, unknown> = {}): Promise<T> {
  return openfrontClient.request<T>(document, variables, await getAuthHeaders())
}

function errorMessage(error: unknown, fallback: string) {
  const message = (error as any)?.response?.errors?.[0]?.message
  return typeof message === 'string' && message && message !== 'Unexpected error.' ? message : fallback
}

export async function getCustomerRequestHistory(): Promise<CustomerRequestRow[] | null> {
  try {
    const data = await request<{ customerRequestHistory: CustomerRequestRow[] }>(
      `query CustomerHistory { customerRequestHistory { id kind kindKey scheduledAt status timezone vehicle amountCents reference } }`
    )
    return data.customerRequestHistory ?? []
  } catch {
    return null
  }
}

export async function getCustomerRequestDetail(kind: string, id: string): Promise<{ ok: true; detail: Record<string, any> | null } | { ok: false }> {
  try {
    const data = await request<{ customerRequestDetail: Record<string, any> | null }>(
      `query CustomerRequestDetail($kind: String!, $id: ID!) { customerRequestDetail(kind: $kind, id: $id) }`,
      { kind, id }
    )
    return { ok: true, detail: data.customerRequestDetail ?? null }
  } catch {
    return { ok: false }
  }
}

export async function getCustomerPurchases(): Promise<CustomerPurchase[] | null> {
  try {
    const data = await request<{ customerPurchases: CustomerPurchase[] }>(`query CustomerPurchases { customerPurchases }`)
    return data.customerPurchases ?? []
  } catch {
    return null
  }
}

export async function getCustomerPayments(): Promise<CustomerPayment[] | null> {
  try {
    const data = await request<{ customerPayments: CustomerPayment[] }>(`query CustomerPayments { customerPayments }`)
    return data.customerPayments ?? []
  } catch {
    return null
  }
}

export async function getCustomerServiceHistory(): Promise<CustomerServiceVisit[] | null> {
  try {
    const data = await request<{ customerServiceHistory: CustomerServiceVisit[] }>(`query CustomerServiceHistory { customerServiceHistory }`)
    return data.customerServiceHistory ?? []
  } catch {
    return null
  }
}

export async function getCustomerServiceOrder(id: string): Promise<{ ok: true; order: CustomerServiceOrder | null } | { ok: false }> {
  try {
    const data = await request<{ customerServiceOrder: CustomerServiceOrder | null }>(
      `query CustomerServiceOrder($id: ID!) { customerServiceOrder(id: $id) }`,
      { id }
    )
    return { ok: true, order: data.customerServiceOrder ?? null }
  } catch {
    return { ok: false }
  }
}

export async function getCustomerEmailLink(): Promise<CustomerEmailLink | null> {
  try {
    const data = await request<{ customerEmailLinkStatus: CustomerEmailLink }>(
      `query CustomerEmailLink { customerEmailLinkStatus { email linkedCustomerCount verified } }`
    )
    return data.customerEmailLinkStatus ?? null
  } catch {
    return null
  }
}

export type AccountActionResult = { ok: true; message?: string } | { ok: false; error: string }

export async function sendCustomerEmailVerification(): Promise<AccountActionResult> {
  try {
    const data = await request<{ requestCustomerEmailVerification: { sent: boolean; email: string } }>(
      `mutation RequestCustomerEmailVerification { requestCustomerEmailVerification { sent email } }`
    )
    return { ok: true, message: `Verification email sent to ${data.requestCustomerEmailVerification.email}.` }
  } catch (error) {
    return { ok: false, error: errorMessage(error, 'The verification email could not be sent.') }
  }
}

export async function confirmCustomerEmail(token: string): Promise<{ ok: true; link: CustomerEmailLink } | { ok: false; error: string }> {
  try {
    const data = await request<{ confirmCustomerEmailVerification: CustomerEmailLink }>(
      `mutation ConfirmCustomerEmail($token: String!) { confirmCustomerEmailVerification(token: $token) { email linkedCustomerCount newlyLinkedCount verified } }`,
      { token }
    )
    revalidatePath('/account', 'layout')
    return { ok: true, link: data.confirmCustomerEmailVerification }
  } catch (error) {
    return { ok: false, error: errorMessage(error, 'This verification link could not be confirmed.') }
  }
}

export async function cancelCustomerBooking(input: { kind: 'test-drive' | 'service'; id: string; idempotencyKey: string }): Promise<AccountActionResult> {
  try {
    await request(
      `mutation CancelCustomerBooking($kind: String!, $id: ID!, $idempotencyKey: String!) {
        cancelCustomerBooking(kind: $kind, id: $id, idempotencyKey: $idempotencyKey) { id status }
      }`,
      input
    )
    revalidatePath('/account', 'layout')
    return { ok: true, message: 'Cancelled' }
  } catch (error) {
    return { ok: false, error: errorMessage(error, 'This booking could not be cancelled.') }
  }
}

export async function rescheduleCustomerBooking(input: { kind: 'test-drive' | 'service'; id: string; date: string; time: string; idempotencyKey: string }): Promise<AccountActionResult> {
  try {
    await request(
      `mutation RescheduleCustomerBooking($kind: String!, $id: ID!, $date: String!, $time: String!, $idempotencyKey: String!) {
        rescheduleCustomerBooking(kind: $kind, id: $id, date: $date, time: $time, idempotencyKey: $idempotencyKey) { id status scheduledAt }
      }`,
      input
    )
    revalidatePath('/account', 'layout')
    return { ok: true, message: 'Rescheduled' }
  } catch (error) {
    return { ok: false, error: errorMessage(error, 'This booking could not be rescheduled.') }
  }
}
