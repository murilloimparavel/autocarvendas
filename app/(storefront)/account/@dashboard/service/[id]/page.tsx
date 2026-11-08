import type { Metadata } from 'next'

import { AccountServiceOrderPage } from '@/features/storefront/screens/AccountServiceOrderPage'

export async function generateMetadata(): Promise<Metadata> {
  const { getRequestLocale } = await import('@/features/i18n/server')
  return { title: (await getRequestLocale()) === 'pt-BR' ? 'Ordem de serviço' : 'Repair order' }
}

type Props = { params: Promise<{ id: string }> }

export default async function Page({ params }: Props) {
  const { id } = await params
  return <AccountServiceOrderPage id={id} />
}
