import { Suspense } from 'react'
import type { Metadata } from 'next'

import { PageFallback } from '@/features/storefront/components/PageFallback'
import { TradeInPage } from '@/features/storefront/screens/TradeInPage'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const { getRequestLocale } = await import('@/features/i18n/server')
  return { title: (await getRequestLocale()) === 'pt-BR' ? 'Veículo na troca' : 'Trade-in' }
}

export default function Page() {
  return <Suspense fallback={<PageFallback />}><TradeInPage /></Suspense>
}
