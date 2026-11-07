import { Suspense } from 'react'
import type { Metadata } from 'next'

import { loadStorefrontBusiness } from '@/features/storefront/lib/data/storefront-business'
import { pageMetadata } from '@/features/storefront/lib/seo'
import { getRequestLocale } from '@/features/i18n/server'
import { PageFallback } from '@/features/storefront/components/PageFallback'
import { FinancingPage } from '@/features/storefront/screens/FinancingPage'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const settings = await loadStorefrontBusiness()
  const locale = await getRequestLocale()
  return settings.status === 'ready' ? pageMetadata(settings.business, 'financing', locale === 'pt-BR' ? 'Financiamento' : 'Financing', locale) : { title: locale === 'pt-BR' ? 'Financiamento' : 'Financing' }
}

export default function Page() {
  return <Suspense fallback={<PageFallback />}><FinancingPage /></Suspense>
}
