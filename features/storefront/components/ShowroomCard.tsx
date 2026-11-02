import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import type { Vehicle } from '../lib/types'
import { formatMileage, formatPrice } from '../lib/format'
import { primaryVehicleImage, vehicleImageUrl, skipImageOptimizer } from '../lib/images'
import { vehicleConditionLabel } from '../lib/vehicleStatus'
import { VehiclePhotoPlaceholder } from './VehiclePhotoPlaceholder'

function conditionTag(condition: string) {
  return condition === 'new' ? 'New arrival' : vehicleConditionLabel(condition)
}

// Desktop showroom card: the photo fills the card; title and a dark price plate sit on it.
export function ShowroomCard({ vehicle, currencyCode, priority = false }: { vehicle: Vehicle; currencyCode: string; priority?: boolean }) {
  const image = vehicleImageUrl(primaryVehicleImage(vehicle.images))
  const name = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')

  return (
    <Link href={`/inventory/${vehicle.id}`} className="sf-showroom-card group">
      {image ? (
        <Image src={image} alt="" fill unoptimized={skipImageOptimizer(image)} priority={priority} sizes="(min-width: 1024px) 22rem, 100vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
      ) : (
        <VehiclePhotoPlaceholder />
      )}
      <span className="sf-showroom-card-shade" aria-hidden="true" />
      <span className="sf-tag absolute left-3 top-3">{conditionTag(vehicle.condition)}</span>
      <span className="absolute inset-x-3 bottom-3 flex min-w-0 flex-col items-start">
        <span className="sf-heading max-w-full truncate text-[1.0625rem] uppercase leading-tight" style={{ color: 'var(--sf-ink)', letterSpacing: '0.005em' }}>{name}{vehicle.trim && <span className="sr-only"> {vehicle.trim}</span>}</span>
        <span className="mt-1 flex w-full items-end justify-between gap-3">
          <span className="sf-price-plate">{formatPrice(vehicle.price, currencyCode)}</span>
          <span className="text-[0.8125rem]" style={{ color: 'var(--sf-ink-2)' }}>{formatMileage(vehicle.mileage)}</span>
        </span>
      </span>
    </Link>
  )
}

// Phone showroom row: year set large over make, model and trim; the car to the right.
export function ShowroomRow({ vehicle, currencyCode, priority = false }: { vehicle: Vehicle; currencyCode: string; priority?: boolean }) {
  const image = vehicleImageUrl(primaryVehicleImage(vehicle.images))
  const model = [vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ')

  return (
    <Link href={`/inventory/${vehicle.id}`} className="sf-showroom-row group">
      {image ? (
        <Image src={image} alt="" fill unoptimized={skipImageOptimizer(image)} priority={priority} sizes="100vw" className="object-cover object-[70%_60%]" />
      ) : (
        <VehiclePhotoPlaceholder />
      )}
      <span className="sf-showroom-row-shade" aria-hidden="true" />
      <span className="relative flex min-w-0 max-w-[64%] flex-col justify-center py-2.5 pl-4">
        <span className="sf-display text-[1.75rem] leading-[0.95]" style={{ fontStretch: '80%' }}>{vehicle.year}</span>
        <span className="sf-heading sf-caps mt-0.5 line-clamp-2 text-[1rem] leading-[1.05]" style={{ fontStretch: '78%' }}>{model}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[0.8125rem]">
          <span style={{ color: 'var(--sf-accent)' }}>{formatPrice(vehicle.price, currencyCode)}</span>
          <span aria-hidden="true" style={{ color: 'var(--sf-accent)' }}>•</span>
          <span style={{ color: 'var(--sf-ink-2)' }}>{formatMileage(vehicle.mileage)}</span>
        </span>
      </span>
      <ArrowUpRight className="absolute bottom-3 right-3 size-5" strokeWidth={1.5} style={{ color: 'var(--sf-accent)' }} aria-hidden="true" />
    </Link>
  )
}
