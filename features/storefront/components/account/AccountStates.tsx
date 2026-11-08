import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'

import type { Tone } from '../../lib/accountRecords'
import { useLocale } from '@/features/i18n/LocaleProvider'

export function AccountBack({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="sf-link -ml-1 inline-flex min-h-11 items-center gap-1 text-[length:var(--sf-text-sm)]">
      <ChevronLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  )
}

// `reference` is a record identifier (request reference, invoice number); it reads below the title.
export function AccountHeader({ reference, title, tone, status, meta }: { reference?: string | null; title: string; tone?: Tone; status?: string; meta?: ReactNode }) {
  return (
    <header className="border-b pb-[var(--sf-space-md)]" style={{ borderColor: 'var(--sf-rule)' }}>
      <h1 className="sf-title-line flex-wrap">
        {tone && <span className="sf-dot" data-tone={tone} aria-hidden="true" />}
        <span className="sf-display text-[length:var(--sf-text-2xl)] sm:text-[length:var(--sf-text-display)]">{title}</span>
        {status && <span className="sf-muted text-[length:var(--sf-text-sm)]">{status}</span>}
      </h1>
      {reference && <p className="sf-figure mt-2 text-[length:var(--sf-text-sm)] font-semibold">{reference}</p>}
      {meta && <div className="sf-muted mt-2 text-[length:var(--sf-text-sm)]">{meta}</div>}
    </header>
  )
}

export function AccountError({ title, retryHref }: { title: string; retryHref: string }) {
  const { locale } = useLocale()
  return (
    <div role="alert" className="sf-well space-y-4 p-5">
      <p className="sf-title-line">
        <span className="sf-dot" data-tone="bad" aria-hidden="true" />
        <span className="sf-heading text-[length:var(--sf-text-md)]">{title}</span>
      </p>
      <Link href={retryHref} prefetch={false} className="sf-btn sf-btn-ghost sf-btn-sm min-h-10">{locale === 'pt-BR' ? 'Tentar novamente' : 'Retry'}</Link>
    </div>
  )
}

export function AccountEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="sf-well p-6">
      <p className="sf-muted text-[length:var(--sf-text-sm)]">{children}</p>
    </div>
  )
}

export function AccountSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mt-[var(--sf-space-xl)]">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="sf-heading text-[length:var(--sf-text-xl)]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
