import { Suspense } from 'react'
import type { Metadata } from 'next'

import { loadStorefrontBusiness } from '@/features/storefront/lib/data/storefront-business'
import { pageMetadata } from '@/features/storefront/lib/seo'
import { getRequestLocale } from '@/features/i18n/server'
import { loadInitialInventory } from '@/features/storefront/lib/data/inventory-initial'
import { PageFallback } from '@/features/storefront/components/PageFallback'
import { InventoryPage } from '@/features/storefront/screens/InventoryPage'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const settings = await loadStorefrontBusiness()
  const locale = await getRequestLocale()
  return settings.status === 'ready' ? pageMetadata(settings.business, 'inventory', locale === 'pt-BR' ? 'Estoque' : 'Inventory', locale) : { title: locale === 'pt-BR' ? 'Estoque' : 'Inventory' }
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function Page({ searchParams }: Props) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value == null ? [] : [value]) params.append(key, item)
  }
  const initial = await loadInitialInventory(params.toString())
  return <Suspense fallback={<PageFallback />}><InventoryPage initial={initial} /></Suspense>
}
