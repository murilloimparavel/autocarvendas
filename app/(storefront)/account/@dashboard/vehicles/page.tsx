import type { Metadata } from 'next'

export { AccountVehiclesPage as default } from '@/features/storefront/screens/AccountVehiclesPage'

export async function generateMetadata(): Promise<Metadata> {
  const { getRequestLocale } = await import('@/features/i18n/server')
  return { title: (await getRequestLocale()) === 'pt-BR' ? 'Meus veículos' : 'My vehicles' }
}
