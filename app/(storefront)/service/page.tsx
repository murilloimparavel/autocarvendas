import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export { ServicePage as default } from '@/features/storefront/screens/ServicePage'

export async function generateMetadata(): Promise<Metadata> {
  const { getRequestLocale } = await import('@/features/i18n/server')
  return { title: (await getRequestLocale()) === 'pt-BR' ? 'Oficina' : 'Service' }
}
