'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, CarFront, DollarSign, Gem, Search, Tag } from 'lucide-react'
import { PlatformSelect } from '@/features/platform/components/PlatformSelect'
import { formatPrice } from '../lib/format'
import { useStorefrontBusiness } from './StorefrontBusinessProvider'
import { useLocale } from '@/features/i18n/LocaleProvider'

const CONDITIONS = [
  { value: '', label: 'Any' },
  { value: 'new', label: 'New' },
  { value: 'used', label: 'Pre-owned' },
  { value: 'certified', label: 'Certified' },
]

const PRICES = [15000, 20000, 25000, 30000, 40000, 50000, 75000]

function useHeroSearch() {
  const router = useRouter()
  const { locale } = useLocale()
  const conditions = [
    { value: '', label: locale === 'pt-BR' ? 'Qualquer' : 'Any' },
    { value: 'new', label: locale === 'pt-BR' ? 'Novo' : 'New' },
    { value: 'used', label: locale === 'pt-BR' ? 'Usado' : 'Pre-owned' },
    { value: 'certified', label: locale === 'pt-BR' ? 'Certificado' : 'Certified' },
  ]
  const [query, setQuery] = useState('')
  const [condition, setCondition] = useState('')
  const [priceMax, setPriceMax] = useState('')

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    const q = query.trim()
    // A leading model year narrows by year; the rest searches make, model and trim.
    const year = q.match(/^(19|20)\d{2}\b/)?.[0]
    const text = year ? q.slice(year.length).trim() : q
    if (year) {
      params.set('yearMin', year)
      params.set('yearMax', year)
    }
    if (text) params.set('search', text)
    if (condition) params.set('condition', condition)
    if (priceMax) params.set('priceMax', priceMax)
    const search = params.toString()
    router.push(search ? `/inventory?${search}` : '/inventory')
  }

  return { query, setQuery, condition, setCondition, priceMax, setPriceMax, onSubmit, locale, conditions }
}

// Desktop: one long dark bar over the bottom of the hero photo.
export function HeroSearch() {
  const { currencyCode } = useStorefrontBusiness()
  const s = useHeroSearch()

  return (
    <form
      onSubmit={s.onSubmit}
      role="search"
      aria-label={s.locale === 'pt-BR' ? 'Buscar no estoque' : 'Search inventory'}
      className="sf-hero-search grid grid-cols-[1.15fr_1.1fr_1.1fr_auto] items-center rounded-[var(--sf-radius-lg)] p-2"
    >
      <label className="sf-hero-field">
        <CalendarDays className="size-5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="sf-hero-field-label">{s.locale === 'pt-BR' ? 'Ano, marca e modelo' : 'Year make model'}</span>
          <input
            type="search"
            value={s.query}
            onChange={(e) => s.setQuery(e.target.value)}
            placeholder={s.locale === 'pt-BR' ? 'Qualquer' : 'Any'}
            className="sf-hero-field-input"
          />
        </span>
      </label>
      <label className="sf-hero-field">
        <Gem className="size-5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="sf-hero-field-label">{s.locale === 'pt-BR' ? 'Condição' : 'Condition'}</span>
          <PlatformSelect aria-label={s.locale === 'pt-BR' ? 'Condição' : 'Condition'} value={s.condition} onValueChange={s.setCondition} className="sf-hero-field-input sf-hero-trigger" options={s.conditions} />
        </span>
      </label>
      <label className="sf-hero-field">
        <DollarSign className="size-5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="sf-hero-field-label">{s.locale === 'pt-BR' ? 'Preço' : 'Price'}</span>
          <PlatformSelect aria-label={s.locale === 'pt-BR' ? 'Preço máximo' : 'Max price'} value={s.priceMax} onValueChange={s.setPriceMax} className="sf-hero-field-input sf-hero-trigger" options={[{ value: '', label: s.locale === 'pt-BR' ? 'Preço máximo' : 'Max Price' }, ...PRICES.map((value) => ({ value: String(value), label: formatPrice(value, currencyCode, s.locale) }))]} />
        </span>
      </label>
      <button type="submit" className="sf-btn sf-btn-primary h-10 w-[17rem] gap-3 rounded-[6px] text-[1rem] font-medium">
        <Search className="size-5" strokeWidth={1.75} aria-hidden="true" />
        Search inventory
      </button>
    </form>
  )
}

// Phone: three underlined fields and a square orange search button on one row.
export function HeroSearchCompact() {
  const { currencyCode } = useStorefrontBusiness()
  const s = useHeroSearch()

  return (
    <form onSubmit={s.onSubmit} role="search" aria-label={s.locale === 'pt-BR' ? 'Buscar no estoque' : 'Search inventory'} className="flex items-stretch gap-1">
      <label className="sf-line-field">
        <Search className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span className="sr-only">{s.locale === 'pt-BR' ? 'Ano, marca ou modelo' : 'Year, make or model'}</span>
        <input
          type="text"
          enterKeyHint="search"
          value={s.query}
          onChange={(e) => s.setQuery(e.target.value)}
          placeholder={s.locale === 'pt-BR' ? 'Qualquer marca' : 'Any make'}
          className="sf-line-field-input"
        />
      </label>
      <label className="sf-line-field">
        <CarFront className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span className="sr-only">{s.locale === 'pt-BR' ? 'Condição' : 'Condition'}</span>
        <PlatformSelect aria-label={s.locale === 'pt-BR' ? 'Condição' : 'Condition'} value={s.condition} onValueChange={s.setCondition} className="sf-line-field-input sf-line-trigger" options={[{ value: '', label: s.locale === 'pt-BR' ? 'Qualquer tipo' : 'Any type' }, ...CONDITIONS.slice(1)]} />
      </label>
      <label className="sf-line-field">
        <Tag className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span className="sr-only">{s.locale === 'pt-BR' ? 'Preço máximo' : 'Max price'}</span>
        <PlatformSelect aria-label={s.locale === 'pt-BR' ? 'Preço máximo' : 'Max price'} value={s.priceMax} onValueChange={s.setPriceMax} className="sf-line-field-input sf-line-trigger" options={[{ value: '', label: s.locale === 'pt-BR' ? 'Preço máximo' : 'Max price' }, ...PRICES.map((value) => ({ value: String(value), label: formatPrice(value, currencyCode, s.locale) }))]} />
      </label>
      <button type="submit" className="grid size-11 shrink-0 place-items-center rounded-[2px]" style={{ background: 'var(--sf-accent-fill)', color: 'var(--sf-accent-ink)' }} aria-label={s.locale === 'pt-BR' ? 'Buscar no estoque' : 'Search inventory'}>
        <Search className="size-5" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </form>
  )
}
