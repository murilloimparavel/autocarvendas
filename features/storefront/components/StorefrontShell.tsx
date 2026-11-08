import { Archivo } from 'next/font/google'
import type { CSSProperties, ReactNode } from 'react'
import '@/features/storefront/styles/signage.css'
import { ComparisonBar } from './ComparisonBar'
import { Footer } from './Footer'
import { Header } from './Header'
import { StorefrontBusinessProvider } from './StorefrontBusinessProvider'
import type { StorefrontSettingsState } from '../lib/business'
import { getRequestLocale } from '@/features/i18n/server'

// Archivo carries the whole showroom: expanded and black for headlines, normal width for text.
const display = Archivo({
  variable: '--font-storefront-display',
  subsets: ['latin'],
  axes: ['wdth'],
})

type StorefrontBrandStyle = CSSProperties & {
  '--sf-logo-hue': string
}

async function StorefrontUnavailable() {
  const pt = (await getRequestLocale()) === 'pt-BR'
  return (
    <div className={`storefront ${display.variable} min-h-screen`}>
      <main className="sf-container flex min-h-screen items-center justify-center py-16">
        <section className="max-w-md text-center" aria-live="polite">
          <h1 className="sf-display text-[length:var(--sf-text-2xl)]">{pt ? 'Não foi possível carregar esta página.' : 'We couldn\'t load this page.'}</h1>
          <div className="sf-track mt-6">
            <a href="" className="sf-pill sf-pill-primary">{pt ? 'Tentar novamente' : 'Retry'}</a>
          </div>
        </section>
      </main>
    </div>
  )
}

export function StorefrontShell({
  children,
  settings,
}: {
  children: ReactNode
  settings: StorefrontSettingsState
}) {
  if (settings.status === 'error') {
    return <StorefrontUnavailable />
  }

  const { business } = settings
  const brandStyle: StorefrontBrandStyle = { '--sf-logo-hue': business.logoColor }
  const hideBranding = process.env.HIDE_OPENFRONT_BRANDING === 'true'

  return (
    <StorefrontBusinessProvider business={business}>
      <div
        className={`storefront ${display.variable} min-h-screen flex flex-col`}
        style={brandStyle}
      >
        <Header />
        <main className="sf-main flex-1">{children}</main>
        <Footer branding={!hideBranding} />
        <ComparisonBar />
      </div>
    </StorefrontBusinessProvider>
  )
}
