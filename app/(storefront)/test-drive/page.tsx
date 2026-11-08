import { Suspense } from 'react'
import type { Metadata } from 'next'

import { PageFallback } from '@/features/storefront/components/PageFallback'
import { TestDrivePage } from '@/features/storefront/screens/TestDrivePage'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const { getRequestLocale } = await import('@/features/i18n/server')
  return { title: (await getRequestLocale()) === 'pt-BR' ? 'Agendar test-drive' : 'Test drive' }
}

export default function Page() {
  return <Suspense fallback={<PageFallback />}><TestDrivePage /></Suspense>
}
