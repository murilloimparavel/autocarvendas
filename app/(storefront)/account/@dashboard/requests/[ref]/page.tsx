import type { Metadata } from 'next'

import { AccountRequestDetailPage } from '@/features/storefront/screens/AccountRequestDetailPage'

export async function generateMetadata(): Promise<Metadata> {
  const { getRequestLocale } = await import('@/features/i18n/server')
  return { title: (await getRequestLocale()) === 'pt-BR' ? 'Solicitação' : 'Request' }
}

type Props = { params: Promise<{ ref: string }> }

export default async function Page({ params }: Props) {
  const { ref } = await params
  return <AccountRequestDetailPage refParam={ref} />
}
