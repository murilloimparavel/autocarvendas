import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export { ComparePage as default } from '@/features/storefront/screens/ComparePage'

export async function generateMetadata(): Promise<Metadata> {
  const { getRequestLocale } = await import('@/features/i18n/server')
  return { title: (await getRequestLocale()) === 'pt-BR' ? 'Comparar veículos' : 'Compare' }
}
