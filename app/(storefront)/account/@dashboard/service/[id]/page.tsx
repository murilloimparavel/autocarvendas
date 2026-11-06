import type { Metadata } from 'next'

import { AccountServiceOrderPage } from '@/features/storefront/screens/AccountServiceOrderPage'

export const metadata: Metadata = { title: 'Repair order' }

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ payError?: string | string[] }> }

export default async function Page({ params, searchParams }: Props) {
  const { id } = await params
  const { payError } = await searchParams
  return <AccountServiceOrderPage id={id} payError={typeof payError === 'string' ? payError.slice(0, 200) : null} />
}
