import type { Metadata } from 'next'

export { AccountProfilePage as default } from '@/features/storefront/screens/AccountProfilePage'

export async function generateMetadata(): Promise<Metadata> {
  const { getRequestLocale } = await import('@/features/i18n/server')
  return { title: (await getRequestLocale()) === 'pt-BR' ? 'Meu perfil' : 'Profile' }
}
