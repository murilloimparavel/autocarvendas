import { Suspense } from 'react'
import type { Metadata } from 'next'

import { ResetPasswordPage } from '@/features/storefront/screens/ResetPasswordPage'

export async function generateMetadata(): Promise<Metadata> {
  const { getRequestLocale } = await import('@/features/i18n/server')
  return { title: (await getRequestLocale()) === 'pt-BR' ? 'Redefinir senha' : 'Reset password' }
}

export default function Page() {
  return <Suspense fallback={null}><ResetPasswordPage /></Suspense>
}
