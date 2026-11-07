import Link from 'next/link'
import { Container } from './Container'
import { useLocale } from '@/features/i18n/LocaleProvider'

export function PageNotFound() {
  const { t } = useLocale()
  return (
    <Container className="py-[var(--sf-space-2xl)]">
      <div className="sf-well flex flex-col items-start gap-5 p-6 md:p-8">
        <h1 className="sf-title-line sf-heading text-[length:var(--sf-text-xl)]">
          <span className="sf-dot" aria-hidden="true" />
          {t('pageNotFound')}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/" className="sf-btn sf-btn-primary">{t('home')}</Link>
          <Link href="/inventory" className="sf-btn sf-btn-ghost">{t('inventory')}</Link>
        </div>
      </div>
    </Container>
  )
}
