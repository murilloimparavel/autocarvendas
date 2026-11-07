'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Container } from './Container'
import OpenfrontCTA from './OpenfrontCTA'
import { BrandMark } from './BrandMark'
import { useStorefrontBusiness } from './StorefrontBusinessProvider'
import { useLocale } from '@/features/i18n/LocaleProvider'

const SHOP = [
  { href: '/inventory', key: 'inventory' },
  { href: '/compare', key: 'compare' },
  { href: '/financing', key: 'financing' },
  { href: '/trade-in', key: 'tradeIn' },
] as const

const VISIT = [
  { href: '/test-drive', key: 'testDrive' },
  { href: '/service', key: 'service' },
  { href: '/contact', key: 'contact' },
  { href: '/account', key: 'account' },
] as const

export function Footer({ branding = true }: { branding?: boolean }) {
  const year = new Date().getFullYear()
  const business = useStorefrontBusiness()
  const { t } = useLocale()
  const hours = [
    { label: t('weekdays'), value: business.hoursMonFri },
    { label: t('saturday'), value: business.hoursSaturday },
    { label: t('sunday'), value: business.hoursSunday },
  ].filter((row) => row.value)
  const hasAddress = business.addressLine1 || business.addressLine2

  return (
    <footer className="sf-band border-t" style={{ borderColor: 'var(--sf-rule-dark)' }}>
      <Container className="py-[var(--sf-space-xl)] md:py-[var(--sf-space-2xl)]">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-[1.5fr_1fr_1fr_1.2fr]">
          <div className="col-span-2 min-w-0 md:col-span-1">
            <BrandMark size="lg" />
            {hasAddress && (
              <address className="mt-5 text-[length:var(--sf-text-sm)] not-italic" style={{ color: 'var(--sf-on-dark-2)' }}>
                {business.addressLine1 && <div>{business.addressLine1}</div>}
                {business.addressLine2 && <div>{business.addressLine2}</div>}
              </address>
            )}
            {(business.phoneDisplay || business.directionsHref) && (
              <div className="mt-5 flex flex-wrap gap-2">
                {business.phoneHref && business.phoneDisplay && (
                  <a href={business.phoneHref} className="sf-btn sf-btn-primary sf-btn-sm">
                    <span className="sf-figure">{business.phoneDisplay}</span>
                  </a>
                )}
                {business.directionsHref && (
                  <a href={business.directionsHref} target="_blank" rel="noreferrer" className="sf-btn sf-btn-ghost sf-btn-sm">
                    {t('directions')}
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </a>
                )}
              </div>
            )}
          </div>

          <nav aria-label={t('shop')} className="min-w-0">
            <p className="sf-eyebrow mb-4">{t('shop')}</p>
            <ul className="text-[length:var(--sf-text-sm)] md:space-y-2.5">
              {SHOP.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="inline-flex min-h-10 items-center transition-opacity hover:opacity-70 md:min-h-0">{t(link.key)}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label={t('visit')} className="min-w-0">
            <p className="sf-eyebrow mb-4">{t('visit')}</p>
            <ul className="text-[length:var(--sf-text-sm)] md:space-y-2.5">
              {VISIT.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="inline-flex min-h-10 items-center transition-opacity hover:opacity-70 md:min-h-0">{t(link.key)}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="col-span-2 min-w-0 md:col-span-1">
            <p className="sf-eyebrow mb-4">{t('hours')}</p>
            {hours.length > 0 ? (
              <dl className="space-y-2 text-[length:var(--sf-text-sm)]">
                {hours.map((row) => (
                  <div key={row.label} className="flex gap-4">
                    <dt className="sf-figure w-16 shrink-0" style={{ color: 'var(--sf-on-dark-2)' }}>{row.label}</dt>
                    <dd className="min-w-0 tabular-nums">{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-[length:var(--sf-text-sm)]" style={{ color: 'var(--sf-on-dark-2)' }}>{t('hoursNotListed')}</p>
            )}
            {business.salesEmail && (
              <a href={`mailto:${business.salesEmail}`} className="mt-4 block break-all text-[length:var(--sf-text-sm)] underline-offset-4 hover:underline">
                {business.salesEmail}
              </a>
            )}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t pt-6 text-[length:var(--sf-text-xs)] sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--sf-rule-dark)', color: 'var(--sf-on-dark-2)' }}>
          <p>© {year} {business.fullName}</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/photo-credits" className="inline-flex min-h-11 items-center transition-opacity hover:opacity-70">{t('photoCredits')}</Link>
            {branding && <OpenfrontCTA />}
          </div>
        </div>
      </Container>
    </footer>
  )
}
