'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { fetchGraphQL } from '@/features/storefront/lib/data/graphql-client'
import { GET_VEHICLE_BY_ID } from '@/features/storefront/lib/data/queries'
import { Vehicle } from '@/features/storefront/lib/types'
import {
  getComparisonVehicles,
  removeFromComparison,
  clearComparison,
} from '@/features/storefront/lib/comparison'
import { Plus, X } from 'lucide-react'
import { Container } from '../components/Container'
import { PageHeader } from '../components/PageHeader'
import { useStorefrontBusiness } from '../components/StorefrontBusinessProvider'
import { VehiclePhotoPlaceholder } from '../components/VehiclePhotoPlaceholder'
import { formatPrice, formatMileage, vehicleTitle } from '../lib/format'
import { primaryVehicleImage, vehicleImageUrl, skipImageOptimizer } from '../lib/images'
import { vehicleConditionLabel, vehicleStatus } from '../lib/vehicleStatus'
import { partitionSavedVehicleResults } from '../lib/data/compare-inventory'
import { useLocale } from '@/features/i18n/LocaleProvider'

const COMPARISON_FIELDS: {
  label: string
  key: string
  format: (v: Vehicle, currencyCode?: string, locale?: import('@/features/i18n/messages').Locale) => string
  highlight: boolean
  mono?: boolean
}[] = [
  { label: 'Price', key: 'price', format: (v, currencyCode, locale) => formatPrice(v.price, currencyCode, locale), highlight: true, mono: true },
  { label: 'Year', key: 'year', format: (v) => String(v.year), highlight: false, mono: true },
  { label: 'Make', key: 'make', format: (v) => v.make, highlight: false },
  { label: 'Model', key: 'model', format: (v) => v.model, highlight: false },
  { label: 'Trim', key: 'trim', format: (v) => v.trim || '—', highlight: false },
  { label: 'Mileage', key: 'mileage', format: (v, _currencyCode, locale) => formatMileage(v.mileage, locale), highlight: true, mono: true },
  { label: 'Condition', key: 'condition', format: (v, _currencyCode, locale) => (v.condition ? vehicleConditionLabel(v.condition, locale) : '—'), highlight: false },
  { label: 'Color', key: 'color', format: (v) => v.color || '—', highlight: false },
  { label: 'MPG city', key: 'mpgCity', format: (v) => String(v.features?.mpgCity ?? '—'), highlight: true, mono: true },
  { label: 'MPG highway', key: 'mpgHighway', format: (v) => String(v.features?.mpgHighway ?? '—'), highlight: true, mono: true },
  { label: 'VIN', key: 'vin', format: (v) => v.vin, highlight: false, mono: true },
  { label: 'Stock #', key: 'stockNumber', format: (v) => v.stockNumber, highlight: false, mono: true },
]

function numericValue(field: (typeof COMPARISON_FIELDS)[number], v: Vehicle): number | null {
  const formatted = field.format(v)
  const num = parseFloat(formatted.replace(/[^0-9.-]/g, ''))
  return isNaN(num) ? null : num
}

function bestValueClass(
  field: (typeof COMPARISON_FIELDS)[number],
  vehicle: Vehicle,
  all: Vehicle[]
): string {
  if (!field.highlight) return ''
  const values = all.map((v) => numericValue(field, v)).filter((v): v is number => v !== null)
  if (values.length <= 1) return ''
  const current = numericValue(field, vehicle)
  if (current === null) return ''
  if (field.key === 'price' || field.key === 'mileage') {
    return current === Math.min(...values) ? 'sf-best' : ''
  }
  if (field.key.includes('mpg')) {
    return current === Math.max(...values) ? 'sf-best' : ''
  }
  return ''
}

export function ComparePage() {
  const { locale } = useLocale()
  const { currencyCode } = useStorefrontBusiness()
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [unavailableIds, setUnavailableIds] = useState<string[]>([])
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadComparisonVehicles()
    const handler = () => loadComparisonVehicles()
    window.addEventListener('comparison-updated', handler)
    return () => window.removeEventListener('comparison-updated', handler)
  }, [])

  const loadComparisonVehicles = async () => {
    setLoading(true)
    setLoadError(false)
    const ids = getComparisonVehicles()
    setSavedIds(ids)
    if (ids.length === 0) {
      setVehicles([])
      setUnavailableIds([])
      setLoading(false)
      return
    }
    try {
      const results = await Promise.all(ids.map((id) => fetchGraphQL<{ publicInventoryVehicle: Vehicle | null }>(GET_VEHICLE_BY_ID, { id })))
      const resolved = partitionSavedVehicleResults<Vehicle>(ids, results)
      setVehicles(resolved.vehicles)
      setUnavailableIds(resolved.unavailableIds)
    } catch (error) {
      console.error('Error loading comparison vehicles:', error)
      setVehicles([])
      setUnavailableIds([])
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const handleClearAll = () => {
    clearComparison()
  }

  const browseTrack = (
    <div className="flex flex-wrap gap-2">
      <Link href="/inventory" className="sf-btn sf-btn-primary">{locale === 'pt-BR' ? 'Ver estoque' : 'Browse inventory'}</Link>
    </div>
  )

  const unavailableList = (
    <ul className="mt-3 divide-y" style={{ borderColor: 'var(--sf-rule)' }}>
      {unavailableIds.map((id) => (
        <li key={id} className="flex items-center justify-between gap-4 py-2" style={{ borderColor: 'var(--sf-rule)' }}>
          <span className="sf-title-line min-w-0">
            <span className="sf-dot" aria-hidden="true" />
          <span className="truncate">{locale === 'pt-BR' ? 'Veículo não está mais disponível' : 'Vehicle no longer available'}</span>
          </span>
          <button type="button" onClick={() => removeFromComparison(id)} className="sf-btn sf-btn-ghost sf-btn-sm min-h-10 shrink-0">
            <X className="size-4" aria-hidden="true" />
            {locale === 'pt-BR' ? 'Remover' : 'Remove'}
          </button>
        </li>
      ))}
    </ul>
  )

  if (loading) {
    return (
      <>
        <PageHeader title={locale === 'pt-BR' ? 'Compare veículos' : 'Compare vehicles'} />
        <Container className="py-[var(--sf-space-xl)]">
          <div className="flex gap-4 overflow-hidden" aria-busy="true" aria-label={locale === 'pt-BR' ? 'Carregando comparação' : 'Loading comparison'}>
            <div className="hidden w-32 shrink-0 space-y-3 sm:block">
              <div className="sf-skeleton h-56" />
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="sf-skeleton h-6" />)}
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="w-60 shrink-0 space-y-3">
                <div className="sf-skeleton aspect-[4/3]" />
                <div className="sf-skeleton h-5 w-3/4" />
                <div className="sf-skeleton h-7 w-1/2" />
                {Array.from({ length: 6 }).map((_, j) => <div key={j} className="sf-skeleton h-6" />)}
              </div>
            ))}
          </div>
        </Container>
      </>
    )
  }

  if (loadError) {
    return (
      <>
        <PageHeader title={locale === 'pt-BR' ? 'Compare veículos' : 'Compare vehicles'} />
        <Container className="py-[var(--sf-space-xl)]">
          <div className="sf-well flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <p role="alert" className="sf-title-line font-semibold">
              <span className="sf-dot" data-tone="bad" aria-hidden="true" />
              {locale === 'pt-BR' ? 'Não foi possível carregar estes veículos.' : <>These vehicles couldn&apos;t be loaded.</>}
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button type="button" onClick={() => void loadComparisonVehicles()} className="sf-btn sf-btn-primary">
                {locale === 'pt-BR' ? 'Tentar novamente' : 'Retry'}
              </button>
              <Link href="/inventory" className="sf-btn sf-btn-ghost">{locale === 'pt-BR' ? 'Ver estoque' : 'Browse inventory'}</Link>
            </div>
          </div>
        </Container>
      </>
    )
  }

  if (savedIds.length === 0) {
    return (
      <>
        <PageHeader title={locale === 'pt-BR' ? 'Nenhum veículo para comparar' : 'No vehicles to compare'} />
        <Container className="py-[var(--sf-space-xl)]">
          <div className="sf-well flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="sf-title-line font-semibold">
              <span className="sf-dot" aria-hidden="true" />
              {locale === 'pt-BR' ? 'Nenhum veículo adicionado' : 'No vehicles added'}
            </p>
            {browseTrack}
          </div>
        </Container>
      </>
    )
  }

  if (vehicles.length === 0) {
    return (
      <>
        <PageHeader title={locale === 'pt-BR' ? 'Veículos indisponíveis' : 'Vehicles no longer available'} />
        <Container className="py-[var(--sf-space-xl)]">
          <div className="sf-well p-6">
            <p className="sf-title-line font-semibold">
              <span className="sf-dot" data-tone="warn" aria-hidden="true" />
              {locale === 'pt-BR' ? 'Estes veículos não estão mais disponíveis.' : 'These vehicles are no longer available.'}
            </p>
            {unavailableList}
          </div>
          <div className="mt-6">{browseTrack}</div>
        </Container>
      </>
    )
  }

  const stickyCell = 'sticky left-0 z-10 w-28 min-w-28 border-r px-3 text-left align-top sm:w-40 sm:min-w-40 sm:px-4'
  const stickyStyle = { background: 'var(--sf-paper)', borderColor: 'var(--sf-rule)' }

  return (
    <>
      <PageHeader
        title={locale === 'pt-BR' ? 'Compare veículos' : 'Compare vehicles'}
        description={locale === 'pt-BR' ? `${vehicles.length} de 4 ${vehicles.length === 1 ? 'veículo' : 'veículos'}` : `${vehicles.length} of 4 ${vehicles.length === 1 ? 'vehicle' : 'vehicles'}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/inventory" className="sf-btn sf-btn-primary">
              <Plus className="size-4" aria-hidden="true" />
              {locale === 'pt-BR' ? 'Adicionar veículos' : 'Add vehicles'}
            </Link>
            <button type="button" onClick={handleClearAll} className="sf-btn sf-btn-ghost">
              {locale === 'pt-BR' ? 'Limpar tudo' : 'Clear all'}
            </button>
          </div>
        }
      />

      <Container className="py-[var(--sf-space-lg)] md:py-[var(--sf-space-xl)]">
        {unavailableIds.length > 0 && (
          <div className="sf-notice mb-6" data-tone="warn" role="status">
            <p className="font-semibold">{locale === 'pt-BR' ? 'Alguns veículos não estão mais disponíveis.' : 'Some vehicles are no longer available.'}</p>
            {unavailableList}
          </div>
        )}

        <div className="mb-3 flex items-center justify-end gap-2">
          <span className="sf-chip sf-best">{locale === 'pt-BR' ? 'Melhor custo-benefício' : 'Best value'}</span>
        </div>

        <div
          className="sf-panel overflow-x-auto overscroll-x-contain"
          style={{ borderColor: 'var(--sf-rule)' }}
          role="region"
          aria-label={locale === 'pt-BR' ? 'Tabela de comparação' : 'Comparison table'}
          tabIndex={0}
        >
          <table className="w-full border-collapse text-[length:var(--sf-text-sm)]">
            <thead>
              <tr>
                <th scope="col" className={`${stickyCell} sf-eyebrow align-bottom py-4`} style={stickyStyle}>
                  Spec
                </th>
                {vehicles.map((vehicle) => {
                  const imageUrl = vehicleImageUrl(primaryVehicleImage(vehicle.images))
                  const status = vehicleStatus(vehicle.status, locale)
                  return (
                    <th key={vehicle.id} scope="col" className="min-w-[13rem] p-3 text-left align-top font-normal sm:min-w-[15rem] sm:p-4">
                      <Link href={`/inventory/${vehicle.id}`} className="sf-photo block aspect-[4/3]" tabIndex={-1} aria-hidden="true">
                        {imageUrl ? (
                          <Image src={imageUrl} alt="" fill className="object-cover" sizes="240px" unoptimized={skipImageOptimizer(imageUrl)} />
                        ) : (
                          <VehiclePhotoPlaceholder />
                        )}
                        {vehicle.stockNumber && <span className="sf-stall absolute bottom-2 left-2">#{vehicle.stockNumber}</span>}
                      </Link>
                      <h2 className="sf-title-line mt-3">
                        <span className="sf-dot" data-tone={status.tone} aria-hidden="true" />
                        <Link href={`/inventory/${vehicle.id}`} className="sf-heading min-w-0 text-[length:var(--sf-text-md)] hover:text-[var(--sf-accent)]">
                          {vehicle.year} {vehicle.make} {vehicle.model}
                        </Link>
                      </h2>
                      <p className="sf-muted min-h-[1.5em] truncate pl-4 text-[length:var(--sf-text-xs)]">
                        <span className="sr-only">{status.label}. </span>
                        {vehicle.trim}
                      </p>
                      <p className="sf-price mt-2 pl-4 text-[length:var(--sf-text-xl)]">{formatPrice(vehicle.price, currencyCode)}</p>
                      <div className="mt-3 pl-4">
                        <button
                          type="button"
                          onClick={() => removeFromComparison(vehicle.id)}
                          className="sf-btn sf-btn-ghost sf-btn-sm min-h-10"
                          aria-label={`Remove ${vehicleTitle(vehicle)} from compare`}
                        >
                          <X className="size-4" aria-hidden="true" />
                          Remove
                        </button>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_FIELDS.map((field) => (
                <tr key={field.key} className="border-t" style={{ borderColor: 'var(--sf-rule)' }}>
                  <th scope="row" className={`${stickyCell} py-3 align-middle`} style={stickyStyle}>
                    <span className="sf-eyebrow">{locale === 'pt-BR' ? ({ Price: 'Preço', Year: 'Ano', Make: 'Marca', Model: 'Modelo', Trim: 'Versão', Mileage: 'Quilometragem', Condition: 'Condição', Color: 'Cor', 'MPG city': 'Consumo na cidade', 'MPG highway': 'Consumo na estrada', VIN: 'Chassi (VIN)', 'Stock #': 'Código do estoque' } as Record<string, string>)[field.label] : field.label}</span>
                  </th>
                  {vehicles.map((vehicle) => {
                    const best = bestValueClass(field, vehicle, vehicles)
                    return (
                      <td
                        key={vehicle.id}
                        className={`px-3 py-3 sm:px-4 ${field.mono ? 'sf-figure' : ''} ${field.key === 'vin' ? 'break-all text-[length:var(--sf-text-xs)]' : ''} ${best}`}
                      >
                        {field.format(vehicle, currencyCode, locale)}
                        {best && <span className="sr-only"> ({locale === 'pt-BR' ? 'melhor valor' : 'best'})</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}

              <tr className="border-t" style={{ borderColor: 'var(--sf-rule)' }}>
                <th scope="row" className={`${stickyCell} py-3`} style={stickyStyle}>
                  <span className="sf-eyebrow">{locale === 'pt-BR' ? 'Descrição' : 'Description'}</span>
                </th>
                {vehicles.map((vehicle) => (
                  <td key={vehicle.id} className="sf-muted px-3 py-3 align-top leading-relaxed sm:px-4">
                    {vehicle.description || (locale === 'pt-BR' ? 'Não informada' : 'Not listed')}
                  </td>
                ))}
              </tr>

              <tr className="border-t" style={{ borderColor: 'var(--sf-rule)' }}>
                <th scope="row" className={`${stickyCell} py-4`} style={stickyStyle}>
                  <span className="sf-eyebrow">{locale === 'pt-BR' ? 'Ações' : 'Actions'}</span>
                </th>
                {vehicles.map((vehicle) => (
                  <td key={vehicle.id} className="px-3 py-4 sm:px-4">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/inventory/${vehicle.id}`} className="sf-btn sf-btn-primary sf-btn-sm min-h-10">
                        {locale === 'pt-BR' ? 'Ver veículo' : 'View'}
                      </Link>
                      <Link href={`/test-drive?vehicleId=${vehicle.id}`} className="sf-btn sf-btn-ghost sf-btn-sm min-h-10">
                        {locale === 'pt-BR' ? 'Agendar test-drive' : 'Test drive'}
                      </Link>
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Container>
    </>
  )
}
