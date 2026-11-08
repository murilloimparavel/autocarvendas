import type { Metadata } from 'next'

import { LoginPage } from '@/features/storefront/screens/LoginPage'

export async function generateMetadata(): Promise<Metadata> {
  const { getRequestLocale } = await import('@/features/i18n/server')
  return { title: (await getRequestLocale()) === 'pt-BR' ? 'Entrar' : 'Sign in' }
}

export default function Page() {
  return <LoginPage />
}
