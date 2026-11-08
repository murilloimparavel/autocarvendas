'use server'

import { revalidatePath } from 'next/cache'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { operatorCommandRequest } from '@/features/platform/lib/operatorCommandClient'

import type { CatalogProduct, CatalogRooftop } from '../lib/catalogTypes'

export async function getFinanceProductCatalog() {
  const response = await keystoneClient<{
    financeProducts: CatalogProduct[]
    rooftops: CatalogRooftop[]
    authenticatedItem: { id: string; rooftopMemberships?: Array<{ rooftop: { id: string } | null }> } | null
    storefrontProfile: { currencyCode: string | null } | null
  }>(`
    query FinanceProductCatalog {
      financeProducts(orderBy: [{ name: asc }], take: 500) {
        id code name category providerKey active retailPriceCents costCents updatedAt quotesCount
        rooftop { id name }
      }
      rooftops(where: { status: { equals: "active" } }, orderBy: [{ name: asc }], take: 100) { id name }
      authenticatedItem {
        ... on User { id rooftopMemberships(where: { status: { equals: "active" } }, take: 1) { rooftop { id } } }
      }
      storefrontProfile { currencyCode }
    }
  `, {}, { cache: 'no-store' })
  if (!response.success) return response
  const { financeProducts, rooftops, authenticatedItem } = response.data
  const memberRooftop = authenticatedItem?.rooftopMemberships?.[0]?.rooftop?.id
  const sessionRooftopId = rooftops.find(rooftop => rooftop.id === memberRooftop)?.id ?? rooftops[0]?.id ?? null
  return { success: true as const, data: { products: financeProducts, rooftops, sessionRooftopId, currencyCode: response.data.storefrontProfile?.currencyCode || 'USD' } }
}

export async function saveFinanceProduct(data: {
  rooftopId: string
  code: string
  name: string
  category: string
  retailPriceCents: number
  costCents: number | null
  active: boolean
  expectNew: boolean
  idempotencyKey: string
}) {
  const response = await operatorCommandRequest<{ configureFinanceProduct: { id: string; code: string; active: boolean } }>(`
    mutation SaveFinanceProduct($data: ConfigureFinanceProductInput!) {
      configureFinanceProduct(data: $data) { id code active }
    }
  `, { data: { ...data, providerKey: 'operator-recorded' } })
  if (response.success) {
    revalidatePath('/dashboard/platform/finance/products')
    revalidatePath('/dashboard/platform/finance')
  }
  return response
}
