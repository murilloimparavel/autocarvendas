'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowUpRight, Menu, Phone, Search, SquareStack, UserRound, X } from 'lucide-react'
import { getComparisonVehicles } from '@/features/storefront/lib/comparison'
import { isEscapeKey, restoreFocusAfterClose } from '../lib/dialogAccessibility'
import { BrandMark } from './BrandMark'
import { Container } from './Container'
import { useStorefrontBusiness } from './StorefrontBusinessProvider'
import { LanguageSwitcher } from '@/features/i18n/LanguageSwitcher'
import { useLocale } from '@/features/i18n/LocaleProvider'

const NAV = [
  { href: '/inventory', key: 'inventory' },
  { href: '/financing', key: 'financing' },
  { href: '/trade-in', key: 'tradeIn' },
  { href: '/service', key: 'service' },
  { href: '/contact', key: 'contact' },
]

const MENU = [
  { href: '/inventory', key: 'inventory' },
  { href: '/test-drive', key: 'testDrive' },
  { href: '/financing', key: 'financing' },
  { href: '/trade-in', key: 'tradeIn' },
  { href: '/service', key: 'service' },
  { href: '/compare', key: 'compare' },
  { href: '/contact', key: 'contact' },
  { href: '/account', key: 'account' },
]

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function Header() {
  const { t } = useLocale()
  const router = useRouter()
  const pathname = usePathname() || '/'
  const business = useStorefrontBusiness()
  const [savedCount, setSavedCount] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const sync = () => setSavedCount(getComparisonVehicles().length)
    sync()
    window.addEventListener('comparison-updated', sync)
    return () => window.removeEventListener('comparison-updated', sync)
  }, [])

  // Close the menu when the route changes (state-during-render, not an effect).
  const [menuPath, setMenuPath] = useState(pathname)
  if (menuPath !== pathname) {
    setMenuPath(pathname)
    setMenuOpen(false)
  }

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    router.push(`/inventory?search=${encodeURIComponent(q)}`)
    setQuery('')
    setMenuOpen(false)
  }

  const closeMenuFromKeyboard = () => {
    setMenuOpen(false)
    restoreFocusAfterClose(menuButtonRef.current)
  }

  const handleHeaderKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!menuOpen || !isEscapeKey(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    closeMenuFromKeyboard()
  }

  const hasPhone = Boolean(business.phoneHref && business.phoneDisplay)

  return (
    <header className="sticky top-0 z-50" onKeyDown={handleHeaderKeyDown}>
      <div className="sf-band border-b" style={{ borderColor: 'var(--sf-rule-dark)' }}>
        <Container className="sf-header-container flex h-16 items-center gap-2.5 sm:gap-3">
          <BrandMark className="flex-1 lg:flex-none lg:shrink-0" />

          <nav className="mx-2 hidden min-w-0 flex-1 items-center justify-center gap-0 2xl:flex" aria-label={t('menu')}>
            {NAV.map((item) => {
              const active = isActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className="sf-caps relative whitespace-nowrap px-2 py-2 text-[0.6875rem] font-medium transition-colors hover:text-[var(--sf-accent)] 2xl:px-2.5"
                  style={{ color: active ? 'var(--sf-accent)' : 'var(--sf-ink)' }}
                >
                  {t(item.key as import('@/features/i18n/messages').MessageKey)}
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1.5 lg:ml-0">
            <LanguageSwitcher compact className="hidden sm:inline-flex" />
            {/* On phones Compare lives in the menu (and the compare bar) until something is selected. */}
            <Link
              href="/compare"
              className={`relative size-11 place-items-center rounded-[3px] transition-colors hover:text-[var(--sf-accent)] ${savedCount > 0 ? 'grid' : 'hidden sm:grid lg:hidden'}`}
              aria-label={`${t('comparison')}${savedCount ? `, ${savedCount}` : ''}`}
            >
              <SquareStack className="size-5" aria-hidden="true" />
              {savedCount > 0 && (
                <span
                  className="sf-figure absolute right-1 top-1 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-[2px] px-1 text-xs font-bold"
                  style={{ background: 'var(--sf-accent-fill)', color: 'var(--sf-accent-ink)' }}
                >
                  {savedCount}
                </span>
              )}
            </Link>

            <Link
              href="/account"
              aria-current={isActive(pathname, '/account') ? 'page' : undefined}
              className="hidden size-10 place-items-center rounded-[3px] transition-colors hover:text-[var(--sf-accent)] sm:grid"
              aria-label={t('myAccount')}
            >
              <UserRound className="size-5" aria-hidden="true" />
            </Link>

            <Link href="/test-drive" className="sf-btn sf-btn-primary ml-1 hidden min-h-[2rem] px-4 py-1 text-[0.6875rem] xl:inline-flex">
              {t('testDrive')}
            </Link>

            <button
              ref={menuButtonRef}
              type="button"
              className="grid size-11 place-items-center rounded-[3px] transition-colors hover:text-[var(--sf-accent)] 2xl:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="storefront-mobile-menu"
              aria-label={menuOpen ? t('closeMenu') : t('openMenu')}
            >
              {menuOpen ? <X className="size-6" aria-hidden="true" /> : <Menu className="size-7" strokeWidth={1.5} aria-hidden="true" />}
            </button>
          </div>
        </Container>
      </div>

      {menuOpen && (
        <div
          id="storefront-mobile-menu"
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-b lg:hidden"
          style={{ background: 'var(--sf-sign)', borderColor: 'var(--sf-rule)', boxShadow: 'var(--sf-shadow-float)' }}
        >
          <Container className="flex flex-col py-4">
            <form onSubmit={onSearch} className="relative mb-3" role="search">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" style={{ color: 'var(--sf-ink-3)' }} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('makeModelStock')}
                className="sf-input sf-input-icon"
                aria-label={t('searchInventory')}
              />
            </form>
            <nav aria-label={t('menu')}>
              {MENU.map((item) => {
                const active = isActive(pathname, item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className="sf-heading sf-caps flex min-h-12 items-center justify-between border-b text-[length:var(--sf-text-lg)] last:border-0"
                    style={{ borderColor: 'var(--sf-rule)', color: active ? 'var(--sf-accent)' : 'var(--sf-ink)' }}
                  >
                    {t(item.key as import('@/features/i18n/messages').MessageKey)}
                  </Link>
                )
              })}
            </nav>
            <LanguageSwitcher className="mt-4 sm:hidden" />
            {(hasPhone || business.directionsHref) && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {hasPhone && (
                  <a href={business.phoneHref} className="sf-btn sf-btn-ghost">
                    <Phone className="size-4" aria-hidden="true" />
                    {t('call')}
                  </a>
                )}
                {business.directionsHref && (
                  <a href={business.directionsHref} target="_blank" rel="noreferrer" className="sf-btn sf-btn-ghost">
                    {t('directions')}
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </a>
                )}
              </div>
            )}
          </Container>
        </div>
      )}
    </header>
  )
}
