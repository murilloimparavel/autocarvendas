import type { Metadata } from 'next'

export { AccountServicePage as default } from '@/features/storefront/screens/AccountServicePage'

export async function generateMetadata(): Promise<Metadata> {
  const { getRequestLocale } = await import('@/features/i18n/server')
  return { title: (await getRequestLocale()) === 'pt-BR' ? 'Histórico da oficina' : 'Service history' }
}
