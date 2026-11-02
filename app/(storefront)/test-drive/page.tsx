import { Suspense } from 'react'
import type { Metadata } from 'next'

import { PageFallback } from '@/features/storefront/components/PageFallback'
import { TestDrivePage } from '@/features/storefront/screens/TestDrivePage'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Test drive' }

export default function Page() {
  return <Suspense fallback={<PageFallback />}><TestDrivePage /></Suspense>
}
