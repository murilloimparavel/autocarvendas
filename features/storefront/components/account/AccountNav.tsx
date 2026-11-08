'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { useLocale } from '@/features/i18n/LocaleProvider'

const LINKS = [
  { href: '/account', label: 'Requests' },
  { href: '/account/vehicles', label: 'My vehicles' },
  { href: '/account/service', label: 'Service' },
  { href: '/account/profile', label: 'Profile' },
]

function isCurrent(pathname: string | null, href: string) {
  if (!pathname) return false
  if (href === '/account') return pathname === '/account' || pathname.startsWith('/account/requests')
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AccountNav({ children }: { children?: ReactNode }) {
  const pathname = usePathname()
  const { locale } = useLocale()
  const links = locale === 'pt-BR'
    ? [{ href: '/account', label: 'Solicitações' }, { href: '/account/vehicles', label: 'Meus veículos' }, { href: '/account/service', label: 'Oficina' }, { href: '/account/profile', label: 'Perfil' }]
    : LINKS

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <nav aria-label={locale === 'pt-BR' ? 'Conta' : 'Account'} className="sf-track sf-track-block sm:w-auto">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="sf-pill min-h-11 px-3 sm:px-5"
            aria-current={isCurrent(pathname, link.href) ? 'page' : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  )
}
