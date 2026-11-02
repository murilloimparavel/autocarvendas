import type { Metadata } from 'next'

import { PaymentReturnPage } from '@/features/storefront/screens/PaymentReturnPage'

export const dynamic = 'force-dynamic'

// Reached from the payment provider's checkout with a signed reference; never indexed.
export const metadata: Metadata = { title: 'Payment received', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default async function Page({ searchParams }: { searchParams: Promise<{ ref?: string | string[] }> }) {
  const { ref } = await searchParams
  return <PaymentReturnPage outcome="success" reference={typeof ref === 'string' ? ref : null} />
}
