import type { Metadata } from 'next'

import { StorefrontShell } from '@/features/storefront'
import { loadStorefrontBusiness } from '@/features/storefront/lib/data/storefront-business'
import { getBaseUrl } from '@/features/storefront/lib/getBaseUrl'
import { storefrontMetadata } from '@/features/storefront/lib/seo'
import { getRequestLocale } from '@/features/i18n/server'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const [settings, locale] = await Promise.all([loadStorefrontBusiness(), getRequestLocale()])

  if (settings.status === 'error') {
    return { title: locale === 'pt-BR' ? 'Não foi possível carregar esta página' : "We couldn't load this page", robots: { index: false, follow: false } }
  }

  return storefrontMetadata(settings.business, (await getBaseUrl()) || null, locale)
}

export default async function StorefrontLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const settings = await loadStorefrontBusiness()
  return <StorefrontShell settings={settings}>{children}</StorefrontShell>
}
