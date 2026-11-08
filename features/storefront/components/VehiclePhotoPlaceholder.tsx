import { useLocale } from '@/features/i18n/LocaleProvider'

export function VehiclePhotoPlaceholder({ className = '' }: { className?: string }) {
  const { locale } = useLocale()
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center gap-2 ${className}`}
      style={{ color: 'var(--sf-ink-3)', background: 'repeating-linear-gradient(135deg, transparent 0 14px, oklch(0.5 0.01 262 / 0.05) 14px 15px)' }}
    >
      <svg aria-hidden="true" width="88" height="40" viewBox="0 0 96 44" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" className="opacity-60">
        <path d="M6 32v-7c0-1.5 1-2.6 2.4-3l9.6-2.6 9.6-8.1c1-.8 2.2-1.3 3.5-1.3h24.6c1.4 0 2.8.6 3.8 1.6l8.5 8.4 13.7 3c1.6.4 2.7 1.8 2.7 3.4V32" />
        <path d="M6 32h12m16 0h28m16 0h12" />
        <circle cx="26" cy="32" r="7" />
        <circle cx="70" cy="32" r="7" />
      </svg>
      <span className="text-[length:var(--sf-text-xs)] font-semibold">{locale === 'pt-BR' ? 'Sem foto' : 'No photo'}</span>
    </div>
  )
}
