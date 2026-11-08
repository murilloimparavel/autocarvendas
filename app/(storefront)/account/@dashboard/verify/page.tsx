import type { Metadata } from 'next'

import { AccountVerifyEmailPage } from '@/features/storefront/screens/AccountVerifyEmailPage'

export async function generateMetadata(): Promise<Metadata> {
  const { getRequestLocale } = await import('@/features/i18n/server')
  return { title: (await getRequestLocale()) === 'pt-BR' ? 'Confirmar e-mail' : 'Verify email' }
}

type Props = { searchParams: Promise<{ token?: string | string[] }> }

export default async function Page({ searchParams }: Props) {
  const { token } = await searchParams
  return <AccountVerifyEmailPage token={typeof token === 'string' && token ? token : null} />
}
