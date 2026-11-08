'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react'
import { fetchGraphQL } from '@/features/storefront/lib/data/graphql-client'
import { GET_VEHICLES } from '@/features/storefront/lib/data/queries'
import { Vehicle } from '@/features/storefront/lib/types'
import { buildVehicleOrderBy, buildVehicleWhereInput, EMPTY_INVENTORY_FILTERS, inventoryQueryFromSearch } from '@/features/storefront/lib/data/vehicle-inventory'
import { buildInventoryFacets, facetModels, fetchListedInventoryOptions, type InventoryFacets } from '@/features/storefront/lib/data/inventory-facets'
import { INVENTORY_PAGE_SIZE, parseInventoryPage, resolveInventoryPage } from '@/features/storefront/lib/data/inventory-pagination'
import { PlatformSelect } from '@/features/platform/components/PlatformSelect'
import { Container } from '../components/Container'
import { VehicleCard } from '../components/VehicleCard'
import { useStorefrontBusiness } from '../components/StorefrontBusinessProvider'
import { InventoryCardSkeleton } from '../components/inventory/InventoryCardSkeleton'
import { formatPrice } from '../lib/format'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { isEscapeKey, trapDialogFocus } from '../lib/dialogAccessibility'

const SHEET_QUERY = '(max-width: 1023.98px)'

function isSheetViewport() {
  return typeof window !== 'undefined' && window.matchMedia(SHEET_QUERY).matches
}

// The first page as the server rendered it, so the grid is in the HTML instead of a skeleton that
// the results then push the footer down from.
export type InitialInventory = { search: string; items: Vehicle[]; totalCount: number }

export function InventoryPage({ initial }: { initial?: InitialInventory | null }) {
  const { locale } = useLocale()
  const [vehicles, setVehicles] = useState<Vehicle[]>(initial?.items ?? [])
  const [totalCount, setTotalCount] = useState(initial?.totalCount ?? 0)
  const [loading, setLoading] = useState(!initial)
  const initialSearch = useRef(initial ? initial.search : null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [hydratedFromUrl, setHydratedFromUrl] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [invalidPage, setInvalidPage] = useState(false)
  const [pageNotice, setPageNotice] = useState<string | null>(null)
  const requestSequence = useRef(0)
  const lastWrittenQuery = useRef<string | null>(null)
  const searchParams = useSearchParams()
  const searchKey = searchParams?.toString() ?? ''
  const itemsPerPage = INVENTORY_PAGE_SIZE

  const [filters, setFilters] = useState(() => (initial ? inventoryQueryFromSearch(initial.search).filters : EMPTY_INVENTORY_FILTERS))
  const [sortBy, setSortBy] = useState(() => (initial ? inventoryQueryFromSearch(initial.search).sortBy : 'year-desc'))
  const [facets, setFacets] = useState<InventoryFacets | null>(null)

  useEffect(() => {
    let active = true
    void fetchListedInventoryOptions()
      .then((items) => { if (active) setFacets(buildInventoryFacets(items)) })
      .catch(() => { if (active) setFacets({ makes: [], modelsByMake: {} }) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (lastWrittenQuery.current === searchKey) return
    const query = inventoryQueryFromSearch(searchKey)
    setFilters(query.filters)
    setSortBy(query.sortBy)
    const page = parseInventoryPage(query.page)
    if (page.status === 'valid') {
      setCurrentPage(page.page)
      setInvalidPage(false)
    } else setInvalidPage(true)
    setPageNotice(null)
    setHydratedFromUrl(true)
  }, [searchKey])

  useEffect(() => {
    if (!hydratedFromUrl) return
    if (invalidPage) {
      requestSequence.current += 1
      setVehicles([])
      setTotalCount(0)
      setLoadError(null)
      setLoading(false)
      return
    }
    // The server already rendered this exact query; fetch again only once the shopper changes it.
    if (initialSearch.current !== null) {
      const served = initialSearch.current === searchKey
      initialSearch.current = null
      if (served) return
    }
    void loadVehicles()
  }, [filters, sortBy, currentPage, hydratedFromUrl, invalidPage])

  useEffect(() => {
    if (!hydratedFromUrl || invalidPage) return
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
    if (sortBy !== 'year-desc') params.set('sort', sortBy)
    if (currentPage > 1) params.set('page', String(currentPage))
    const query = params.toString()
    lastWrittenQuery.current = query
    window.history.replaceState(null, '', query ? `/inventory?${query}` : '/inventory')
  }, [filters, sortBy, currentPage, hydratedFromUrl, invalidPage])

  const loadVehicles = async () => {
    const sequence = ++requestSequence.current
    let pageTransitionPending = false
    setLoading(true)
    setLoadError(null)

    const pageRequest = parseInventoryPage(String(currentPage))
    if (pageRequest.status !== 'valid') {
      if (sequence === requestSequence.current) {
        setVehicles([])
        setTotalCount(0)
        setInvalidPage(true)
        setLoading(false)
      }
      return
    }

    let where: ReturnType<typeof buildVehicleWhereInput>
    try {
      where = buildVehicleWhereInput(filters)
    } catch (error) {
      if (sequence === requestSequence.current) {
        setVehicles([])
        setTotalCount(0)
        setLoadError(error instanceof Error ? error.message : 'Inventory filters are invalid.')
        setLoading(false)
      }
      return
    }

    try {
      const orderBy = buildVehicleOrderBy(sortBy)
      const data = await fetchGraphQL<{ publicInventoryVehicles: { items: Vehicle[]; totalCount: number } }>(GET_VEHICLES, {
        where,
        orderBy,
        take: itemsPerPage,
        skip: pageRequest.skip,
      })
      if (sequence !== requestSequence.current) return

      const result = data.publicInventoryVehicles
      if (!result || !Array.isArray(result.items) || !Number.isSafeInteger(result.totalCount) || result.totalCount < 0) {
        throw new Error('Inventory response is incomplete.')
      }
      const resolution = resolveInventoryPage(currentPage, result.totalCount, result.items.length)
      if (resolution.status === 'invalid-response') throw new Error('Inventory page does not match its verified result count.')

      if (resolution.status === 'out-of-range') {
        pageTransitionPending = true
        setVehicles([])
        setTotalCount(result.totalCount)
        setPageNotice(locale === 'pt-BR' ? 'Esta página passou do fim dos resultados. Exibindo a última página disponível.' : 'That page is past the current results. Showing the last available page.')
        setCurrentPage(resolution.lastPage)
        return
      }

      if (resolution.status === 'empty') {
        setVehicles([])
        setTotalCount(0)
        if (resolution.resetToFirstPage) {
          pageTransitionPending = true
          setPageNotice(locale === 'pt-BR' ? 'Nenhum veículo encontrado. Voltando à primeira página.' : 'No matching vehicles were found. Returning to the first page.')
          setCurrentPage(1)
        } else {
          setPageNotice(null)
        }
        return
      }

      setVehicles(result.items)
      setTotalCount(result.totalCount)
    } catch {
      if (sequence === requestSequence.current) {
        setVehicles([])
        setTotalCount(0)
        setPageNotice(null)
        setLoadError(locale === 'pt-BR' ? 'Não foi possível carregar o estoque. Tente novamente.' : 'Inventory could not be loaded. Please try again.')
      }
    } finally {
      if (sequence === requestSequence.current && !pageTransitionPending) setLoading(false)
    }
  }

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'make' && facets && prev.model && !facetModels(facets, value).some((model) => model.toLowerCase() === prev.model.toLowerCase())) {
        next.model = ''
      }
      return next
    })
    setCurrentPage(1)
    setInvalidPage(false)
    setPageNotice(null)
  }

  const clearFilters = () => {
    setFilters(EMPTY_INVENTORY_FILTERS)
    setSortBy('year-desc')
    setCurrentPage(1)
    setInvalidPage(false)
    setPageNotice(null)
  }

  const goToPage = (page: number) => {
    setCurrentPage(page)
    setInvalidPage(false)
    setPageNotice(null)
  }

  const activeFilterCount =
    Object.values(filters).filter(Boolean).length + (sortBy !== 'year-desc' ? 1 : 0)
  const totalPages = Math.ceil(totalCount / itemsPerPage)
  const firstVisiblePage = Math.min(Math.max(1, currentPage - 2), Math.max(1, totalPages - 4))
  const visiblePageCount = Math.min(5, totalPages)
  const withCurrent = (options: string[], current: string) =>
    current && !options.some((option) => option.toLowerCase() === current.toLowerCase()) ? [current, ...options] : options
  const makeOptions = withCurrent(facets?.makes ?? [], filters.make)
  const modelOptions = withCurrent(facets ? facetModels(facets, filters.make) : [], filters.model)
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 20 }, (_, i) => currentYear - i)

  const { currencyCode } = useStorefrontBusiness()
  const conditions = [
    { value: '', label: locale === 'pt-BR' ? 'Todos' : 'All' },
    { value: 'new', label: locale === 'pt-BR' ? 'Novos' : 'New' },
    { value: 'used', label: locale === 'pt-BR' ? 'Usados' : 'Pre-owned' },
    { value: 'certified', label: locale === 'pt-BR' ? 'Certificados' : 'Certified' },
  ]
  const sorts = [
    { value: 'year-desc', label: locale === 'pt-BR' ? 'Mais novos' : 'Newest' },
    { value: 'year-asc', label: locale === 'pt-BR' ? 'Mais antigos' : 'Oldest' },
    { value: 'price-asc', label: locale === 'pt-BR' ? 'Menor preço' : 'Price low' },
    { value: 'price-desc', label: locale === 'pt-BR' ? 'Maior preço' : 'Price high' },
    { value: 'mileage-asc', label: locale === 'pt-BR' ? 'Menor quilometragem' : 'Lowest miles' },
  ]
  const sheetRef = useRef<HTMLElement>(null)
  const sheetCloseRef = useRef<HTMLButtonElement>(null)
  const filtersButtonRef = useRef<HTMLButtonElement>(null)

  // Phone filter sheet: lock page scroll and move focus in while open; close if the viewport grows into the rail layout.
  useEffect(() => {
    if (!filtersOpen) return
    const query = window.matchMedia(SHEET_QUERY)
    if (!query.matches) {
      setFiltersOpen(false)
      return
    }
    const onChange = () => {
      if (!query.matches) setFiltersOpen(false)
    }
    query.addEventListener('change', onChange)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => sheetCloseRef.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      query.removeEventListener('change', onChange)
      document.body.style.overflow = previousOverflow
    }
  }, [filtersOpen])

  const closeSheet = () => {
    setFiltersOpen(false)
    requestAnimationFrame(() => filtersButtonRef.current?.focus())
  }

  const handleSheetKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!filtersOpen || !isSheetViewport()) return
    if (isEscapeKey(event.key)) {
      event.preventDefault()
      event.stopPropagation()
      closeSheet()
      return
    }
    if (sheetRef.current) trapDialogFocus(event, sheetRef.current)
  }

  const changeSort = (value: string) => {
    setSortBy(value)
    setCurrentPage(1)
    setInvalidPage(false)
    setPageNotice(null)
  }

  const money = (value: string) => {
    const amount = Number(value)
    return value.trim() && Number.isFinite(amount) ? formatPrice(amount, currencyCode, locale) : value
  }
  const miles = (value: string) => {
    const amount = Number(value)
    return value.trim() && Number.isFinite(amount) ? `${new Intl.NumberFormat(locale).format(locale === 'pt-BR' ? Math.round(amount * 1.609344) : amount)} ${locale === 'pt-BR' ? 'km' : 'mi'}` : value
  }
  const range = (min: string, max: string, format: (value: string) => string) => {
    if (min && max) return min === max ? format(min) : `${format(min)}–${format(max)}`
    return min ? (locale === 'pt-BR' ? `A partir de ${format(min)}` : `From ${format(min)}`) : (locale === 'pt-BR' ? `Até ${format(max)}` : `Up to ${format(max)}`)
  }

  const chips: { key: string; label: string; clear: () => void }[] = []
  if (filters.search) chips.push({ key: 'search', label: `“${filters.search}”`, clear: () => handleFilterChange('search', '') })
  if (filters.condition) {
    chips.push({
      key: 'condition',
      label: conditions.find((option) => option.value === filters.condition)?.label ?? filters.condition,
      clear: () => handleFilterChange('condition', ''),
    })
  }
  if (filters.make) chips.push({ key: 'make', label: filters.make, clear: () => handleFilterChange('make', '') })
  if (filters.model) chips.push({ key: 'model', label: filters.model, clear: () => handleFilterChange('model', '') })
  if (filters.yearMin || filters.yearMax) {
    chips.push({
      key: 'year',
      label: range(filters.yearMin, filters.yearMax, (value) => value),
      clear: () => {
        handleFilterChange('yearMin', '')
        handleFilterChange('yearMax', '')
      },
    })
  }
  if (filters.priceMin || filters.priceMax) {
    chips.push({
      key: 'price',
      label: range(filters.priceMin, filters.priceMax, money),
      clear: () => {
        handleFilterChange('priceMin', '')
        handleFilterChange('priceMax', '')
      },
    })
  }
  if (filters.mileageMax) chips.push({ key: 'mileage', label: `${locale === 'pt-BR' ? 'Até' : 'Max'} ${miles(filters.mileageMax)}`, clear: () => handleFilterChange('mileageMax', '') })

  const readout = loading
    ? (locale === 'pt-BR' ? 'Carregando' : 'Loading')
    : invalidPage
      ? (locale === 'pt-BR' ? 'Página inválida' : 'Invalid page')
      : loadError
        ? (locale === 'pt-BR' ? 'Indisponível' : 'Unavailable')
        : `${new Intl.NumberFormat(locale).format(totalCount)} ${locale === 'pt-BR' ? (totalCount === 1 ? 'veículo' : 'veículos') : (totalCount === 1 ? 'vehicle' : 'vehicles')}`
  const readoutTone = loading ? 'idle' : invalidPage || loadError ? 'bad' : totalCount > 0 ? 'ok' : 'idle'
  const pages = Array.from({ length: visiblePageCount }, (_, i) => firstVisiblePage + i)

  const sortTrack = (className: string, pillClassName = '') => (
    <div role="group" aria-label={locale === 'pt-BR' ? 'Ordenar' : 'Sort'} className={`sf-track ${className}`}>
      {sorts.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`sf-pill ${pillClassName}`}
          aria-pressed={sortBy === option.value}
          onClick={() => changeSort(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )

  return (
    <>
      <section className="border-b" style={{ borderColor: 'var(--sf-rule)' }}>
        <Container className="py-5 md:py-8">
          <h1 className="sf-display text-[length:var(--sf-text-2xl)] md:text-[2.75rem]">{locale === 'pt-BR' ? 'Estoque de veículos' : 'On the lot'}</h1>
        </Container>
      </section>

      <Container className="py-6 md:py-10">
        <div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-8 xl:gap-12">
          <aside
            ref={sheetRef}
            id="inventory-filters"
            role={filtersOpen ? 'dialog' : undefined}
            aria-modal={filtersOpen || undefined}
            aria-labelledby="inventory-filters-title"
            onKeyDown={handleSheetKeyDown}
            className={`${filtersOpen ? 'flex max-lg:fixed max-lg:inset-0 max-lg:z-[60]' : 'hidden lg:flex'} flex-col lg:sticky lg:top-28 lg:max-h-[calc(100dvh-8rem)]`}
            style={{ background: 'var(--sf-paper)' }}
          >
            <div
              className="flex items-center justify-between gap-3 border-b px-4 py-2 lg:border-b-0 lg:px-0 lg:pb-5 lg:pt-0"
              style={{ borderColor: 'var(--sf-rule)' }}
            >
              <h2 id="inventory-filters-title" className="sf-title-line sf-heading text-[length:var(--sf-text-lg)]">
                {locale === 'pt-BR' ? 'Filtros' : 'Filters'}
                {activeFilterCount > 0 && (
                  <span className="sf-chip sf-figure" aria-label={locale === 'pt-BR' ? `${activeFilterCount} ativos` : `${activeFilterCount} active`}>{activeFilterCount}</span>
                )}
              </h2>
              <div className="flex items-center gap-1">
                <button type="button" onClick={clearFilters} className="sf-btn sf-btn-ghost sf-btn-sm hidden lg:inline-flex" disabled={activeFilterCount === 0}>
                  {locale === 'pt-BR' ? 'Limpar' : 'Reset'}
                </button>
                <button
                  ref={sheetCloseRef}
                  type="button"
                  onClick={closeSheet}
                  className="grid size-11 place-items-center rounded-[var(--sf-radius-sm)] transition-colors hover:bg-[var(--sf-paper-2)] lg:hidden"
                  aria-label={locale === 'pt-BR' ? 'Fechar filtros' : 'Close filters'}
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-5 lg:-mx-1 lg:px-1 lg:py-1">
              <div>
                <p id="inventory-condition-label" className="sf-label">{locale === 'pt-BR' ? 'Condição' : 'Condition'}</p>
                <div role="group" aria-labelledby="inventory-condition-label" className="sf-track sf-track-block">
                  {conditions.map((option) => (
                    <button
                      key={option.value || 'all'}
                      type="button"
                      className="sf-pill flex-auto px-2 max-lg:min-h-11"
                      aria-pressed={filters.condition === option.value}
                      onClick={() => handleFilterChange('condition', option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="inventory-search" className="sf-label">{locale === 'pt-BR' ? 'Buscar' : 'Search'}</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" style={{ color: 'var(--sf-ink-3)' }} aria-hidden="true" />
                  <input
                    id="inventory-search"
                    type="search"
                    value={filters.search}
                    onChange={(e) => handleFilterChange('search', e.target.value)}
                    placeholder={locale === 'pt-BR' ? 'Marca, modelo ou versão' : 'Make, model or trim'}
                    className="sf-input pl-9"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label htmlFor="inventory-make" className="sf-label">{locale === 'pt-BR' ? 'Marca' : 'Make'}</label>
                  <PlatformSelect
                    id="inventory-make"
                    value={filters.make}
                    onValueChange={(value) => handleFilterChange('make', value)}
                    className="sf-input sf-trigger"
                    options={[{ value: '', label: facets ? (locale === 'pt-BR' ? 'Qualquer' : 'Any') : (locale === 'pt-BR' ? 'Carregando' : 'Loading') }, ...makeOptions.map((make) => ({ value: make, label: make }))]}
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="inventory-model" className="sf-label">{locale === 'pt-BR' ? 'Modelo' : 'Model'}</label>
                  <PlatformSelect
                    id="inventory-model"
                    value={filters.model}
                    onValueChange={(value) => handleFilterChange('model', value)}
                    className="sf-input sf-trigger"
                    options={[{ value: '', label: facets ? (locale === 'pt-BR' ? 'Qualquer' : 'Any') : (locale === 'pt-BR' ? 'Carregando' : 'Loading') }, ...modelOptions.map((model) => ({ value: model, label: model }))]}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="inventory-year-min" className="sf-label">{locale === 'pt-BR' ? 'Ano' : 'Year'}</label>
                <div className="grid grid-cols-2 gap-3">
                  <PlatformSelect
                    id="inventory-year-min"
                    value={filters.yearMin}
                    onValueChange={(value) => handleFilterChange('yearMin', value)}
                    className="sf-input sf-trigger sf-figure"
                    aria-label={locale === 'pt-BR' ? 'Ano mínimo' : 'Minimum year'}
                    options={[{ value: '', label: locale === 'pt-BR' ? 'Mín.' : 'Min' }, ...years.map((y) => ({ value: String(y), label: String(y) }))]}
                  />
                  <PlatformSelect
                    value={filters.yearMax}
                    onValueChange={(value) => handleFilterChange('yearMax', value)}
                    className="sf-input sf-trigger sf-figure"
                    aria-label={locale === 'pt-BR' ? 'Ano máximo' : 'Maximum year'}
                    options={[{ value: '', label: locale === 'pt-BR' ? 'Máx.' : 'Max' }, ...years.map((y) => ({ value: String(y), label: String(y) }))]}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="inventory-price-min" className="sf-label">{locale === 'pt-BR' ? 'Preço' : 'Price'}</label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    id="inventory-price-min"
                    aria-label={locale === 'pt-BR' ? 'Preço mínimo' : 'Minimum price'}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={filters.priceMin}
                    onChange={(e) => handleFilterChange('priceMin', e.target.value)}
                    placeholder={locale === 'pt-BR' ? 'Mín.' : 'Min'}
                    className="sf-input sf-figure"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={filters.priceMax}
                    onChange={(e) => handleFilterChange('priceMax', e.target.value)}
                    placeholder={locale === 'pt-BR' ? 'Máx.' : 'Max'}
                    className="sf-input sf-figure"
                    aria-label={locale === 'pt-BR' ? 'Preço máximo' : 'Maximum price'}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="inventory-mileage-max" className="sf-label">{locale === 'pt-BR' ? 'Quilometragem máxima' : 'Max mileage'}</label>
                <input
                  id="inventory-mileage-max"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={filters.mileageMax}
                  onChange={(e) => handleFilterChange('mileageMax', e.target.value)}
                  placeholder={locale === 'pt-BR' ? 'Qualquer' : 'Any'}
                  className="sf-input sf-figure"
                />
              </div>
            </div>

            <div
              className="border-t px-4 pt-3 lg:hidden"
              style={{ borderColor: 'var(--sf-rule)', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
              <div className="flex gap-2">
                <button type="button" onClick={clearFilters} className="sf-btn sf-btn-ghost flex-1" disabled={activeFilterCount === 0}>
                  {locale === 'pt-BR' ? 'Limpar' : 'Reset'}
                </button>
                <button type="button" onClick={closeSheet} className="sf-btn sf-btn-primary flex-[2]">
                  {loading || loadError || invalidPage ? (locale === 'pt-BR' ? 'Ver resultados' : 'Show results') : (locale === 'pt-BR' ? `Ver ${new Intl.NumberFormat(locale).format(totalCount)} resultados` : `Show ${new Intl.NumberFormat(locale).format(totalCount)}`)}
                </button>
              </div>
            </div>
          </aside>

          <div className="min-w-0">
            <div
              className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b pb-3"
              style={{ borderColor: 'var(--sf-rule-strong)' }}
            >
              <p className="sf-title-line sf-figure text-[length:var(--sf-text-md)] font-semibold" aria-live="polite">
                <span className="sf-dot" data-tone={readoutTone} aria-hidden="true" />
                {readout}
              </p>
              <div className="flex w-full gap-2 lg:hidden">
                <button
                  ref={filtersButtonRef}
                  type="button"
                  onClick={() => setFiltersOpen(true)}
                  className="sf-btn sf-btn-ghost flex-1"
                  aria-expanded={filtersOpen}
                  aria-controls="inventory-filters"
                >
                  <SlidersHorizontal className="size-4" aria-hidden="true" />
                  {locale === 'pt-BR' ? 'Filtros' : 'Filters'}
                  {activeFilterCount > 0 && <span className="sf-figure text-[length:var(--sf-text-xs)]" aria-label={locale === 'pt-BR' ? `${activeFilterCount} ativos` : `${activeFilterCount} active`}>{activeFilterCount}</span>}
                </button>
                <label htmlFor="inventory-sort-mobile" className="sr-only">{locale === 'pt-BR' ? 'Ordenar' : 'Sort'}</label>
                <div className="min-w-0 flex-1">
                  <PlatformSelect
                    id="inventory-sort-mobile"
                    value={sortBy}
                    onValueChange={changeSort}
                    className="sf-input sf-trigger"
                    aria-label={locale === 'pt-BR' ? 'Ordenar' : 'Sort'}
                    options={sorts.map((option) => ({ value: option.value, label: option.label }))}
                  />
                </div>
              </div>
              {sortTrack('hidden lg:inline-flex')}
            </div>

            {chips.length > 0 && (
              <ul className="mb-6 flex flex-wrap items-center gap-x-1.5" aria-label={locale === 'pt-BR' ? 'Filtros ativos' : 'Active filters'}>
                {chips.map((chip) => (
                  <li key={chip.key}>
                    <button
                      type="button"
                      onClick={chip.clear}
                      className="group inline-flex min-h-11 items-center"
                      aria-label={locale === 'pt-BR' ? `Remover filtro ${chip.label}` : `Remove filter ${chip.label}`}
                    >
                      <span className="sf-chip normal-case tracking-normal transition-colors group-hover:text-[var(--sf-ink)]">
                        {chip.label}
                        <X className="size-3.5" aria-hidden="true" />
                      </span>
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" onClick={clearFilters} className="sf-link inline-flex min-h-11 items-center px-2 text-[length:var(--sf-text-xs)]">
                    {locale === 'pt-BR' ? 'Limpar tudo' : 'Clear all'}
                  </button>
                </li>
              </ul>
            )}

            <h2 className="sr-only">{locale === 'pt-BR' ? 'Resultados' : 'Results'}</h2>
            {pageNotice && !loading && !loadError && !invalidPage && (
              <p role="status" className="sf-notice mb-6" data-tone="warn">{pageNotice}</p>
            )}

            {loading ? (
              <div className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label={locale === 'pt-BR' ? 'Carregando veículos' : 'Loading vehicles'}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <InventoryCardSkeleton key={i} />
                ))}
              </div>
            ) : invalidPage ? (
              <div className="sf-well flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <p role="alert" className="sf-title-line font-semibold">
                  <span className="sf-dot" data-tone="bad" aria-hidden="true" />
                  {locale === 'pt-BR' ? 'Página não encontrada.' : 'Page not found.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setInvalidPage(false)
                    setCurrentPage(1)
                    setPageNotice(null)
                  }}
                  className="sf-btn sf-btn-ghost sf-btn-sm max-sm:min-h-11"
                >
                  {locale === 'pt-BR' ? 'Voltar à primeira página' : 'Return to first page'}
                </button>
              </div>
            ) : loadError ? (
              <div className="sf-well flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <p role="alert" className="sf-title-line font-semibold">
                  <span className="sf-dot" data-tone="bad" aria-hidden="true" />
                  {loadError}
                </p>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" onClick={() => void loadVehicles()} className="sf-btn sf-btn-primary sf-btn-sm max-sm:min-h-11">
                    {locale === 'pt-BR' ? 'Tentar novamente' : 'Retry'}
                  </button>
                  <button type="button" onClick={clearFilters} className="sf-btn sf-btn-ghost sf-btn-sm max-sm:min-h-11">
                    {locale === 'pt-BR' ? 'Limpar filtros' : 'Clear filters'}
                  </button>
                </div>
              </div>
            ) : vehicles.length > 0 ? (
              <>
                <div className="grid min-w-0 grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
                  {vehicles.map((vehicle, index) => (
                    <VehicleCard key={vehicle.id} vehicle={vehicle} priority={index < 3} />
                  ))}
                </div>

                {totalPages > 1 && (
                  <nav className="mt-12 flex flex-col items-center gap-3 border-t pt-6" style={{ borderColor: 'var(--sf-rule)' }} aria-label={locale === 'pt-BR' ? 'Paginação' : 'Pagination'}>
                    <div className="sf-track">
                      <button
                        type="button"
                        onClick={() => goToPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="sf-pill min-h-11 min-w-11 px-3 sm:min-h-9"
                        aria-label={locale === 'pt-BR' ? 'Página anterior' : 'Previous page'}
                      >
                        <ChevronLeft className="size-4" aria-hidden="true" />
                        <span className="hidden sm:inline">{locale === 'pt-BR' ? 'Anterior' : 'Previous'}</span>
                      </button>
                      {firstVisiblePage > 1 && <span className="sf-pill sf-faint pointer-events-none hidden px-2 sm:inline-flex" aria-hidden="true">…</span>}
                      {pages.map((page) => (
                        <button
                          key={page}
                          type="button"
                          onClick={() => goToPage(page)}
                          aria-current={currentPage === page ? 'page' : undefined}
                          aria-label={locale === 'pt-BR' ? `Página ${page}` : `Page ${page}`}
                          className={`sf-pill sf-figure min-h-11 min-w-11 px-2 sm:min-h-9 sm:min-w-9 ${Math.abs(page - currentPage) > 1 ? 'max-sm:hidden' : ''}`}
                        >
                          {page}
                        </button>
                      ))}
                      {firstVisiblePage + visiblePageCount - 1 < totalPages && <span className="sf-pill sf-faint pointer-events-none hidden px-2 sm:inline-flex" aria-hidden="true">…</span>}
                      <button
                        type="button"
                        onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="sf-pill min-h-11 min-w-11 px-3 sm:min-h-9"
                        aria-label={locale === 'pt-BR' ? 'Próxima página' : 'Next page'}
                      >
                        <span className="hidden sm:inline">{locale === 'pt-BR' ? 'Próxima' : 'Next'}</span>
                        <ChevronRight className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                    <p className="sf-figure sf-faint text-[length:var(--sf-text-xs)]" aria-live="polite">
                      {locale === 'pt-BR' ? `Página ${currentPage} de ${totalPages}` : `Page ${currentPage} of ${totalPages}`}
                    </p>
                  </nav>
                )}
              </>
            ) : (
              <div className="sf-well flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="sf-title-line font-semibold">
                  <span className="sf-dot" aria-hidden="true" />
                  {locale === 'pt-BR' ? 'Nenhum veículo corresponde a estes filtros.' : 'No vehicles match these filters.'}
                </p>
                <button type="button" onClick={clearFilters} className="sf-btn sf-btn-ghost sf-btn-sm max-sm:min-h-11">
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </div>
      </Container>
    </>
  )
}
