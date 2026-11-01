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

const NAV = [
  { href: '/inventory', label: 'Inventory' },
  { href: '/financing', label: 'Financing' },
  { href: '/trade-in', label: 'Trade-in' },
  { href: '/service', label: 'Service' },
  { href: '/contact', label: 'Contact' },
]

const MENU = [
  { href: '/inventory', label: 'Inventory' },
  { href: '/test-drive', label: 'Test drive' },
  { href: '/financing', label: 'Financing' },
  { href: '/trade-in', label: 'Trade-in' },
  { href: '/service', label: 'Service' },
  { href: '/compare', label: 'Compare' },
  { href: '/contact', label: 'Contact' },
  { href: '/account', label: 'Account' },
]

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function Header() {
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
        <Container className="flex h-16 items-center gap-3">
          <BrandMark className="flex-1 lg:flex-none lg:shrink-0" />

          <nav className="mx-auto hidden min-w-0 items-center gap-0 lg:flex xl:gap-2" aria-label="Primary">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className="sf-caps relative whitespace-nowrap px-2.5 py-2 text-[0.75rem] font-medium xl:px-3.5 transition-colors hover:text-[var(--sf-accent)]"
                  style={{ color: active ? 'var(--sf-accent)' : 'var(--sf-ink)' }}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1.5 lg:ml-0">
            {/* On phones Compare lives in the menu (and the compare bar) until something is selected. */}
            <Link
              href="/compare"
              className={`relative size-11 place-items-center rounded-[3px] transition-colors hover:text-[var(--sf-accent)] ${savedCount > 0 ? 'grid' : 'hidden sm:grid lg:hidden'}`}
              aria-label={`Compare vehicles${savedCount ? `, ${savedCount} selected` : ''}`}
            >
              <SquareStack className="size-5" aria-hidden="true" />
              {savedCount > 0 && (
                <span
                  className="sf-figure absolute right-1 top-1 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-[2px] px-1 text-[10px] font-bold"
                  style={{ background: 'var(--sf-accent)', color: 'var(--sf-accent-ink)' }}
                >
                  {savedCount}
                </span>
              )}
            </Link>

            <Link
              href="/account"
              aria-current={isActive(pathname, '/account') ? 'page' : undefined}
              className="hidden size-10 place-items-center rounded-[3px] transition-colors hover:text-[var(--sf-accent)] sm:grid"
              aria-label="Account"
            >
              <UserRound className="size-5" aria-hidden="true" />
            </Link>

            <Link href="/test-drive" className="sf-btn sf-btn-primary ml-1 hidden min-h-[2rem] px-6 py-1 text-[0.75rem] md:inline-flex">
              Test drive
            </Link>
            <Link href="/trade-in" className="sf-btn sf-btn-ghost hidden min-h-[2rem] px-6 py-1 text-[0.75rem] xl:inline-flex" style={{ borderColor: 'var(--sf-accent)' }}>
              Trade-in
            </Link>

            <button
              ref={menuButtonRef}
              type="button"
              className="grid size-11 place-items-center rounded-[3px] transition-colors hover:text-[var(--sf-accent)] lg:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="storefront-mobile-menu"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
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
                placeholder="Make, model, stock #"
                className="sf-input sf-input-icon"
                aria-label="Search inventory"
              />
            </form>
            <nav aria-label="Mobile">
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
                    {item.label}
                  </Link>
                )
              })}
            </nav>
            {(hasPhone || business.directionsHref) && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {hasPhone && (
                  <a href={business.phoneHref} className="sf-btn sf-btn-ghost">
                    <Phone className="size-4" aria-hidden="true" />
                    Call
                  </a>
                )}
                {business.directionsHref && (
                  <a href={business.directionsHref} target="_blank" rel="noreferrer" className="sf-btn sf-btn-ghost">
                    Directions
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
