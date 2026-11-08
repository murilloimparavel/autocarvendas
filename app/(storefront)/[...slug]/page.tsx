import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

// The page segment carries the 404 title itself; otherwise the layout's default (homepage) title
// replaces the not-found title once the client hydrates.
export async function generateMetadata(): Promise<Metadata> {
  const { getRequestLocale } = await import('@/features/i18n/server')
  return { title: (await getRequestLocale()) === 'pt-BR' ? 'Página não encontrada' : 'Page not found', robots: { index: false, follow: false } }
}

// Unmatched storefront URLs 404 inside the storefront layout instead of the bare root 404.
export default function Page() {
  notFound()
}
