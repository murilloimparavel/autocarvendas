'use client'

import { useLocale } from './LocaleProvider'

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useLocale()
  return (
    <label className={`inline-flex items-center gap-2 text-sm ${className}`}>
      <span>{t('language')}</span>
      <select aria-label={t('language')} value={locale} onChange={(event) => setLocale(event.target.value as 'pt-BR' | 'en-US')} className="rounded-md border border-current/20 bg-background px-2 py-1.5 text-foreground">
        <option value="pt-BR">{t('portuguese')}</option>
        <option value="en-US">{t('english')}</option>
      </select>
    </label>
  )
}
