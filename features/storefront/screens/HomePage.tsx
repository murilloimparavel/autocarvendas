import Image from 'next/image'
import Link from 'next/link'
import { CalendarCheck, CarFront, ChevronRight, CircleDollarSign, House, MapPin, Search, Tag, Wrench } from 'lucide-react'
import { fetchGraphQL } from '@/features/storefront/lib/data/graphql-client'
import { GET_VEHICLES, GET_VEHICLES_COUNT } from '@/features/storefront/lib/data/queries'
import { Vehicle } from '@/features/storefront/lib/types'
import { Container } from '../components/Container'
import { HeroSearch, HeroSearchCompact } from '../components/HeroSearch'
import { ShowroomCard, ShowroomRow } from '../components/ShowroomCard'
import { loadHomeQuery, selectHomeFeaturedVehicles, selectHomeInventoryCount } from '../lib/data/home-inventory'
import { loadStorefrontBusiness } from '../lib/data/storefront-business'
import { createStorefrontBusiness, type StorefrontBusiness } from '../lib/business'

const HERO_PHOTO = '/images/showroom-dusk.jpg'

async function getFeaturedVehicles() {
  return loadHomeQuery(
    () => fetchGraphQL<unknown>(GET_VEHICLES, {
      where: { status: { equals: 'available' } },
      orderBy: [{ year: 'desc' }],
      take: 3,
    }),
    selectHomeFeaturedVehicles<Vehicle>,
  )
}

async function getInventoryCount() {
  return loadHomeQuery(
    () => fetchGraphQL<unknown>(GET_VEHICLES_COUNT, {
      where: { status: { equals: 'available' } },
    }),
    selectHomeInventoryCount,
  )
}

// "Springfield, VA, 22150" -> "Springfield"
function cityOf(business: StorefrontBusiness) {
  return business.addressLine2.split(',')[0]?.trim() || ''
}

function heroCopy(business: StorefrontBusiness) {
  const title = business.homepageTitle.trim()
  const custom = title && title !== business.fullName && title !== business.shortName
  const city = cityOf(business)
  const address = [business.addressLine1, business.addressLine2].filter(Boolean).join(', ')
  return {
    lead: custom ? title : 'Find your next drive:',
    accent: custom ? '' : city ? `In ${city}.` : `${business.shortName}.`,
    sub: business.homepageDescription || [business.fullName, address].filter(Boolean).join('. '),
  }
}

const STRIP = [
  { title: 'Financing available', action: 'Estimate your payment', href: '/financing' },
  { title: 'Sell us your car', action: 'Get a free offer', href: '/trade-in' },
  { title: 'Your test drive awaits', action: 'Book now', href: '/test-drive' },
]

const QUICK = [
  { href: '/financing', label: 'Financing', icon: CircleDollarSign },
  { href: '/trade-in', label: 'Trade in', icon: CarFront },
  { href: '/test-drive', label: 'Test drive', icon: CalendarCheck },
]

const VISIT = [
  { href: '/inventory', label: 'Vehicle inventory', icon: CarFront },
  { href: '/contact', label: 'Contact sales', icon: Tag },
  { href: '/service', label: 'Service center', icon: Wrench },
]

function InventoryState({ state }: { state: 'unavailable' | 'empty' }) {
  return (
    <div className="sf-well flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between" role={state === 'unavailable' ? 'alert' : undefined}>
      <p className="sf-title-line font-semibold">
        <span className="sf-dot" data-tone={state === 'unavailable' ? 'bad' : undefined} aria-hidden="true" />
        {state === 'unavailable' ? 'Inventory couldn\u2019t be loaded.' : 'No vehicles listed'}
      </p>
      {state === 'unavailable' ? (
        <Link href="/" prefetch={false} className="sf-btn sf-btn-ghost sf-btn-sm">Retry</Link>
      ) : (
        <Link href="/contact" className="sf-btn sf-btn-ghost sf-btn-sm">Contact sales</Link>
      )}
    </div>
  )
}

export async function HomePage() {
  const [featured, inventoryCount, settings] = await Promise.all([
    getFeaturedVehicles(),
    getInventoryCount(),
    loadStorefrontBusiness(),
  ])
  const business = settings.status === 'ready' ? settings.business : createStorefrontBusiness()
  const vehicles = featured.status === 'ready' ? featured.value.slice(0, 3) : []
  const count = inventoryCount.status === 'ready' ? inventoryCount.value : null
  const copy = heroCopy(business)
  const inventoryState = featured.status === 'unavailable' ? 'unavailable' : vehicles.length === 0 ? 'empty' : null
  const city = cityOf(business)

  return (
    <div className="sf-home" data-flush-end>
      {/* ---------- Desktop and tablet ---------- */}
      <section className="relative hidden overflow-hidden md:block">
        <Image src={HERO_PHOTO} alt="" fill priority unoptimized sizes="100vw" className="object-cover object-[60%_55%]" />
        <span className="sf-hero-shade" aria-hidden="true" />
        <Container className="relative flex min-h-[26.25rem] flex-col pb-[1.125rem] pt-[3.25rem]">
          <h1 className="sf-display sf-hero-title">
            <span className="block max-w-[40rem]" style={{ color: 'var(--sf-bone)' }}>{copy.lead}</span>
            {copy.accent && <span className="block" style={{ color: 'var(--sf-accent)' }}>{copy.accent}</span>}
          </h1>
          {copy.sub && (
            <p className="mt-4 max-w-[46rem] text-[0.8125rem] font-medium uppercase" style={{ color: 'var(--sf-ink)' }}>
              {copy.sub}
            </p>
          )}
          <div className="mt-auto pt-5">
            <HeroSearch />
          </div>
        </Container>
      </section>

      <section className="hidden pt-3 md:block">
        <Container>
          <h2 className="mb-3 flex items-center gap-4">
            <Link href="/inventory" className="sf-caps inline-flex items-center gap-4 text-[0.875rem] font-medium hover:text-[var(--sf-accent)]">
              Inventory
              {count !== null && <span className="sr-only">, {count} vehicles</span>}
              <ChevronRight className="size-4" style={{ color: 'var(--sf-accent)' }} aria-hidden="true" />
            </Link>
          </h2>
          {inventoryState ? (
            <InventoryState state={inventoryState} />
          ) : (
            <div className="grid grid-cols-2 gap-5 lg:grid-cols-3 lg:gap-[1.25rem]">
              {vehicles.map((vehicle, index) => (
                <ShowroomCard key={vehicle.id} vehicle={vehicle} currencyCode={business.currencyCode} priority={index < 3} />
              ))}
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 border-t py-5" style={{ borderColor: 'var(--sf-rule)' }}>
            {STRIP.map((item, index) => (
              <div key={item.href} className={`min-w-0 ${index > 0 ? 'border-l pl-11' : ''}`} style={{ borderColor: 'var(--sf-rule)' }}>
                <h3 className="sf-caps text-[0.875rem] font-medium">{item.title}</h3>
                <Link href={item.href} className="mt-1 inline-flex items-center gap-2 text-[0.9375rem] hover:text-[var(--sf-accent)]" style={{ color: 'var(--sf-ink-2)' }}>
                  {item.action}
                  <ChevronRight className="size-4" style={{ color: 'var(--sf-accent)' }} aria-hidden="true" />
                </Link>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ---------- Phone ---------- */}
      <section className="sf-dock-clear relative overflow-hidden md:hidden">
        <span className="sf-phone-glow" aria-hidden="true">
          <Image src={HERO_PHOTO} alt="" fill priority unoptimized sizes="100vw" className="object-cover object-[45%_70%]" />
        </span>
        <Container className="relative">
          <h1 className="sf-display sf-phone-title mx-auto mt-2 w-fit" aria-label={`Driven by you. ${business.fullName}`}>
            <span className="block">Driven</span>
            <span className="flex items-start">
              <span className="sf-phone-title-small">By</span>
              <span>You</span>
            </span>
          </h1>

          <p className="sf-eyebrow sf-eyebrow-accent mt-3 text-[0.9375rem] font-bold">Find your next ride</p>
          <div className="mt-2">
            <HeroSearchCompact />
          </div>

          <nav aria-label="Shopping tools" className="mt-4 grid grid-cols-3 gap-2 px-3">
            {QUICK.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="sf-quick-tile">
                <Icon className="size-5" strokeWidth={1.4} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-5 flex items-end gap-3">
            <div className="min-w-0">
              <p className="sf-eyebrow sf-eyebrow-accent" style={{ letterSpacing: '0.04em' }}>Inventory</p>
              <h2 className="sf-display whitespace-nowrap text-[1.375rem] leading-none" style={{ fontStretch: '80%' }}>Real cars. Real deals.</h2>
            </div>
            <span className="mb-1 h-px min-w-4 flex-1" style={{ background: 'var(--sf-accent)' }} aria-hidden="true" />
            <Link href="/inventory" className="sf-caps inline-flex shrink-0 items-center gap-1 text-[0.8125rem] font-medium" style={{ color: 'var(--sf-accent)' }}>
              View all
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-3 space-y-2.5">
            {inventoryState ? (
              <InventoryState state={inventoryState} />
            ) : (
              vehicles.map((vehicle, index) => (
                <ShowroomRow key={vehicle.id} vehicle={vehicle} currencyCode={business.currencyCode} priority={index < 2} />
              ))
            )}

            <section className="sf-visit-card" aria-labelledby="home-visit">
              <Image src={HERO_PHOTO} alt="" fill unoptimized sizes="100vw" className="object-cover object-[88%_60%]" />
              <span className="sf-showroom-row-shade" aria-hidden="true" />
              <div className="relative max-w-[70%] px-4 py-4">
                <h2 id="home-visit" className="sf-display text-[1.5rem] leading-[0.95]" style={{ fontStretch: '100%' }}>
                  <span className="block" style={{ color: 'var(--sf-accent)' }}>{city ? `Visit ${city}` : 'Visit us'}</span>
                  <span className="mt-0.5 block text-[1.0625rem]">{business.fullName}</span>
                </h2>
                {(business.addressLine1 || business.addressLine2) && (
                  <a href={business.directionsHref || '/contact'} target={business.directionsHref ? '_blank' : undefined} rel="noreferrer" className="mt-1.5 flex items-start gap-1.5 text-[0.8125rem] leading-snug">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {business.addressLine1 && <span className="block">{business.addressLine1}</span>}
                      {business.addressLine2 && <span className="block">{business.addressLine2}</span>}
                    </span>
                  </a>
                )}
              </div>
            </section>
          </div>

          <nav aria-label="Visit" className="mt-3 grid grid-cols-3 gap-2 px-3">
            {VISIT.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="sf-quick-tile">
                <Icon className="size-4" strokeWidth={1.4} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
        </Container>

        <nav aria-label="Quick" className="sf-dock">
          <Link href="/" aria-current="page" className="sf-dock-item" data-active="true">
            <House className="size-5" aria-hidden="true" />
            Home
          </Link>
          <Link href="/inventory" className="sf-dock-item">
            <Search className="size-5" aria-hidden="true" />
            Browse
          </Link>
          <Link href="/financing" className="sf-dock-item">
            <Tag className="size-5" aria-hidden="true" />
            Finance
          </Link>
        </nav>
      </section>
    </div>
  )
}
