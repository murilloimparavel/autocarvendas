import { Suspense } from 'react'
import type { Metadata } from 'next'

import { loadStorefrontBusiness } from '@/features/storefront/lib/data/storefront-business'
import { pageMetadata } from '@/features/storefront/lib/seo'
import { FinancingPage } from '@/features/storefront/screens/FinancingPage'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const settings = await loadStorefrontBusiness()
  return settings.status === 'ready' ? pageMetadata(settings.business, 'financing', 'Financing') : { title: 'Financing' }
}

export default function Page() {
  return <Suspense fallback={null}><FinancingPage /></Suspense>
}
