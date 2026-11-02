'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { VehicleImage } from '@/features/storefront/lib/types'
import { vehicleImageUrl, skipImageOptimizer } from '../../lib/images'
import { PhotoAttribution } from '../PhotoAttribution'
import { isRepresentativePhoto } from '../../lib/photoAttribution'
import { VehiclePhotoPlaceholder } from '../VehiclePhotoPlaceholder'

const SWIPE_THRESHOLD = 40

export function VehicleGallery({
  images,
  activeIndex,
  onSelect,
  title,
  conditionLabel,
  stockNumber,
  make,
  model,
}: {
  images: VehicleImage[]
  activeIndex: number
  onSelect: (index: number) => void
  title: string
  conditionLabel: string
  stockNumber?: string | null
  make?: string | null
  model?: string | null
}) {
  const stripRef = useRef<HTMLDivElement>(null)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const count = images.length
  const currentImageUrl = vehicleImageUrl(images[activeIndex])
  const hasMany = count > 1

  const step = (delta: number) => {
    if (!hasMany) return
    onSelect((activeIndex + delta + count) % count)
  }

  // Keep the active thumbnail visible inside the strip's own scroller.
  useEffect(() => {
    const strip = stripRef.current
    const thumb = strip?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    if (!strip || !thumb) return
    const left = thumb.offsetLeft - (strip.clientWidth - thumb.clientWidth) / 2
    strip.scrollTo({ left, behavior: 'smooth' })
  }, [activeIndex])

  return (
    <div className="min-w-0">
      <div
        className="sf-photo aspect-[4/3] touch-pan-y select-none max-sm:-mx-4 max-sm:rounded-none sm:aspect-[16/10]"
        onPointerDown={(event) => {
          pointerStart.current = { x: event.clientX, y: event.clientY }
        }}
        onPointerUp={(event) => {
          const start = pointerStart.current
          pointerStart.current = null
          if (!start) return
          const dx = event.clientX - start.x
          const dy = event.clientY - start.y
          if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1)
        }}
        onPointerCancel={() => {
          pointerStart.current = null
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') step(1)
          if (event.key === 'ArrowLeft') step(-1)
        }}
        role={hasMany ? 'region' : undefined}
        aria-roledescription={hasMany ? 'carousel' : undefined}
        aria-label={hasMany ? `${title} photos` : undefined}
      >
        {currentImageUrl ? (
          <Image
            src={currentImageUrl}
            alt={title}
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 62vw"
            priority
            unoptimized={skipImageOptimizer(currentImageUrl)}
            draggable={false}
          />
        ) : (
          <VehiclePhotoPlaceholder />
        )}

        <span className="sf-chip sf-chip-dark absolute left-3 top-3">{conditionLabel}</span>
        {stockNumber && <span className="sf-stall absolute bottom-3 left-3">#{stockNumber}</span>}
        {isRepresentativePhoto(currentImageUrl, { make, model }) && (
          <span className="sf-chip sf-chip-dark absolute bottom-3 right-3">Representative photo</span>
        )}

        {hasMany && (
          <>
            <span className="sf-chip sf-chip-dark sf-figure absolute right-3 top-3" aria-live="polite">
              {activeIndex + 1} / {count}
            </span>
            <div className="absolute bottom-3 right-3 flex gap-1.5">
              <button
                type="button"
                onClick={() => step(-1)}
                className="grid size-11 place-items-center rounded-[var(--sf-radius-sm)] bg-[var(--sf-asphalt)] text-[var(--sf-on-dark)] transition-colors hover:bg-[var(--sf-ink)]"
                aria-label="Previous photo"
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                className="grid size-11 place-items-center rounded-[var(--sf-radius-sm)] bg-[var(--sf-asphalt)] text-[var(--sf-on-dark)] transition-colors hover:bg-[var(--sf-ink)]"
                aria-label="Next photo"
              >
                <ChevronRight className="size-5" aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>

      <PhotoAttribution src={currentImageUrl} className="mt-2" />

      {hasMany && (
        <div
          ref={stripRef}
          className="-mx-1 mt-2 flex snap-x gap-2 overflow-x-auto overscroll-x-contain p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((image, index) => {
            const url = vehicleImageUrl(image)
            const active = index === activeIndex
            return (
              <button
                key={image.id}
                type="button"
                data-index={index}
                onClick={() => onSelect(index)}
                className="relative aspect-[4/3] w-20 shrink-0 snap-start overflow-hidden rounded-[2px] transition-opacity sm:w-24"
                style={{
                  background: 'var(--sf-paper-2)',
                  opacity: active ? 1 : 0.62,
                  boxShadow: active ? '0 0 0 2px var(--sf-paper), 0 0 0 4px var(--sf-ink)' : undefined,
                }}
                aria-label={`View image ${index + 1}`}
                aria-pressed={active}
              >
                {url && <Image src={url} alt="" fill className="object-cover" sizes="96px" unoptimized={skipImageOptimizer(url)} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
