import type { Metadata } from 'next'
import { getRequestLocale } from '@/features/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  return { title: locale === 'pt-BR' ? 'Página não encontrada' : 'Page not found', robots: { index: false, follow: false } }
}

export { PageNotFound as default } from '@/features/storefront/components/PageNotFound'
