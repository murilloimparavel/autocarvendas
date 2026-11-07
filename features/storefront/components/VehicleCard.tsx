'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Check, Plus } from 'lucide-react'
import { Vehicle } from '@/features/storefront/lib/types'
import {
  addToComparison,
  isInComparison,
  removeFromComparison,
} from '@/features/storefront/lib/comparison'
import { formatMileage, formatPrice } from '../lib/format'
import { primaryVehicleImage, vehicleImageUrl, skipImageOptimizer } from '../lib/images'
import { vehicleConditionLabel, vehicleStatus } from '../lib/vehicleStatus'
import { PhotoAttribution } from './PhotoAttribution'
import { isRepresentativePhoto } from '../lib/photoAttribution'
import { useStorefrontBusiness } from './StorefrontBusinessProvider'
import { VehiclePhotoPlaceholder } from './VehiclePhotoPlaceholder'
import { useLocale } from '@/features/i18n/LocaleProvider'

interface VehicleCardProps {
  vehicle: Vehicle
  showCompareButton?: boolean
  layout?: 'grid' | 'feature'
  priority?: boolean
}

export function VehicleCard({
  vehicle,
  showCompareButton = true,
  layout = 'grid',
  priority = false,
}: VehicleCardProps) {
  const [comparing, setComparing] = useState(false)
  const [compareFull, setCompareFull] = useState(false)
  const { currencyCode } = useStorefrontBusiness()
  const { locale, t } = useLocale()

  useEffect(() => {
    setComparing(isInComparison(vehicle.id))
    const onUpdate = () => setComparing(isInComparison(vehicle.id))
    window.addEventListener('comparison-updated', onUpdate)
    return () => window.removeEventListener('comparison-updated', onUpdate)
  }, [vehicle.id])

  const imageUrl = vehicleImageUrl(primaryVehicleImage(vehicle.images))
  const name = `${vehicle.year} ${vehicle.make} ${vehicle.model}`
  const title = vehicle.trim ? `${name} ${vehicle.trim}` : name
  const status = vehicleStatus(vehicle.status)
  const href = `/inventory/${vehicle.id}`
  const representative = isRepresentativePhoto(imageUrl, vehicle)

  const toggleCompare = () => {
    if (comparing) {
      removeFromComparison(vehicle.id)
      setCompareFull(false)
      return
    }
    setCompareFull(!addToComparison(vehicle.id))
  }

  const compareButton = showCompareButton ? (
    <button
      type="button"
      onClick={toggleCompare}
      className={`sf-btn sf-btn-sm ${comparing ? 'sf-btn-secondary' : 'sf-btn-ghost'}`}
      aria-pressed={comparing}
      aria-label={comparing ? `Remove ${title} from compare` : `Add ${title} to compare`}
    >
      {comparing ? <Check className="size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
      Compare
    </button>
  ) : null

  if (layout === 'feature') {
    return (
      <article className="sf-lift grid min-w-0 gap-5 md:grid-cols-[1.25fr_1fr] md:gap-8">
        <Link href={href} className="sf-photo block aspect-[4/3]" tabIndex={-1} aria-hidden="true">
          {imageUrl ? (
            <Image src={imageUrl} alt="" fill className="object-cover" sizes="(max-width: 768px) 100vw, 55vw" priority={priority} unoptimized={skipImageOptimizer(imageUrl)} />
          ) : (
            <VehiclePhotoPlaceholder />
          )}
          <span className="sf-chip sf-chip-dark absolute left-3 top-3">{vehicleConditionLabel(vehicle.condition)}</span>
          <span className="sf-stall absolute bottom-3 left-3">#{vehicle.stockNumber}</span>
          {representative && <span className="sf-chip sf-chip-dark absolute bottom-3 right-3">Representative photo</span>}
        </Link>
        <div className="flex min-w-0 flex-col justify-end gap-5">
          <div className="min-w-0">
            <h3 className="sf-title-line">
              <span className="sf-dot" data-tone={status.tone} aria-hidden="true" />
              <Link href={href} className="sf-heading text-[length:var(--sf-text-xl)] hover:text-[var(--sf-accent)]">
                {name}
              </Link>
            </h3>
            <p className="sf-muted mt-1 text-[length:var(--sf-text-sm)]">
              <span className="sr-only">{status.label}. </span>
              {vehicle.trim}
            </p>
          </div>
          <dl className="sf-spec">
            <div><dt>{t('mileageShort')}</dt><dd className="sf-figure">{formatMileage(vehicle.mileage, locale)}</dd></div>
            <div><dt>Color</dt><dd>{vehicle.color || 'Not listed'}</dd></div>
            <div><dt>Stock</dt><dd className="sf-figure">{vehicle.stockNumber}</dd></div>
          </dl>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <p className="sf-price text-[length:var(--sf-text-2xl)]">{formatPrice(vehicle.price, currencyCode, locale)}</p>
            <div className="flex flex-wrap gap-2">
              <Link href={href} className="sf-btn sf-btn-primary sf-btn-sm">View vehicle</Link>
              {compareButton}
            </div>
          </div>
          {compareFull && <p role="status" className="sf-muted text-[length:var(--sf-text-xs)]">Compare holds 4 vehicles.</p>}
          <PhotoAttribution src={imageUrl} />
        </div>
      </article>
    )
  }

  return (
    <article className="sf-lift flex h-full min-w-0 flex-col">
      <Link href={href} className="sf-photo block aspect-[4/3]" tabIndex={-1} aria-hidden="true">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            priority={priority}
            unoptimized={skipImageOptimizer(imageUrl)}
          />
        ) : (
          <VehiclePhotoPlaceholder />
        )}
        <span className="sf-chip sf-chip-dark absolute left-2.5 top-2.5">{vehicleConditionLabel(vehicle.condition)}</span>
        <span className="sf-stall absolute bottom-2.5 left-2.5">#{vehicle.stockNumber}</span>
        {representative && <span className="sf-chip sf-chip-dark absolute bottom-2.5 right-2.5">Representative photo</span>}
      </Link>

      <div className="flex flex-1 flex-col pt-3">
        <div className="flex flex-1 items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="sf-heading min-w-0 text-[1.0625rem] uppercase leading-[1.1]" style={{ letterSpacing: '0.005em', fontStretch: '100%' }}>
              <Link href={href} className="hover:text-[var(--sf-accent)]">{name}</Link>
            </h3>
            <p className="sf-muted min-h-[1.5em] truncate text-[length:var(--sf-text-sm)]">{vehicle.trim}</p>
          </div>
          <p className="sf-price shrink-0 pt-0.5 text-[length:var(--sf-text-xl)]">{formatPrice(vehicle.price, currencyCode, locale)}</p>
        </div>

        <dl className="mt-3 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] border-y text-[length:var(--sf-text-xs)]" style={{ borderColor: 'var(--sf-rule)' }}>
          <div className="min-w-0 py-2 pr-2">
            <dt className="sf-faint">Miles</dt>
            <dd className="sf-figure truncate text-[length:var(--sf-text-sm)]">{formatMileage(vehicle.mileage, locale)}</dd>
          </div>
          <div className="min-w-0 border-l py-2 pl-3 pr-2" style={{ borderColor: 'var(--sf-rule)' }}>
            <dt className="sf-faint">Color</dt>
            <dd className="line-clamp-2 break-words leading-snug text-[length:var(--sf-text-sm)]" title={vehicle.color || undefined}>{vehicle.color || 'Not listed'}</dd>
          </div>
          <div className="border-l py-2 pl-3" style={{ borderColor: 'var(--sf-rule)' }}>
            <dt className="sf-faint">Status</dt>
            <dd className="flex items-baseline gap-1.5 whitespace-nowrap leading-snug text-[length:var(--sf-text-sm)]">
              <span className="sf-dot shrink-0 -translate-y-px" data-tone={status.tone} aria-hidden="true" />
              <span>{status.label}</span>
            </dd>
          </div>
        </dl>

        <div className="flex items-center justify-between gap-3 pt-3">
          <PhotoAttribution src={imageUrl} className="min-w-0" />
          {compareButton && <div className="ml-auto shrink-0">{compareButton}</div>}
        </div>
        {compareFull && <p role="status" className="sf-muted mt-2 text-[length:var(--sf-text-xs)]">Compare holds 4 vehicles.</p>}
      </div>
    </article>
  )
}
