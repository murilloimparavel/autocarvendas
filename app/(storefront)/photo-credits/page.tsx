import type { Metadata } from 'next'

export { PhotoCreditsPage as default } from '@/features/storefront/screens/PhotoCreditsPage'

export async function generateMetadata(): Promise<Metadata> {
  const { getRequestLocale } = await import('@/features/i18n/server')
  return { title: (await getRequestLocale()) === 'pt-BR' ? 'Créditos das fotos' : 'Photo credits' }
}

export const dynamic = 'force-dynamic'
