'use client'

import { useLocale } from './LocaleProvider'

export function LanguageSwitcher({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const { locale, setLocale, t } = useLocale()
  return (
    <label className={`inline-flex items-center gap-2 text-sm ${className}`}>
      <span className={compact ? 'sr-only' : undefined}>{t('language')}</span>
      <select
        aria-label={t('language')}
        value={locale}
        onChange={(event) => setLocale(event.target.value as 'pt-BR' | 'en-US')}
        className={`min-w-0 rounded-[3px] border px-2 py-1.5 font-sans text-sm leading-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${compact ? 'max-w-[11rem] border-[var(--sf-rule-dark)] bg-[var(--sf-sign)] text-[var(--sf-ink)]' : 'border-current/20 bg-background text-foreground'}`}
      >
        <option value="pt-BR">{t('portuguese')}</option>
        <option value="en-US">{t('english')}</option>
      </select>
    </label>
  )
}
