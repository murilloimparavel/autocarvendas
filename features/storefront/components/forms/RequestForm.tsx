import Image from 'next/image'
import type { ChangeEvent, ReactNode } from 'react'
import type { Vehicle } from '@/features/storefront/lib/types'
import { vehicleTitle } from '../../lib/format'
import { primaryVehicleImage, vehicleImageUrl, skipImageOptimizer } from '../../lib/images'
import { Container } from '../Container'
import { VehiclePhotoPlaceholder } from '../VehiclePhotoPlaceholder'

/* Two-column request page: form on the left, sticky sticker summary on the right.
   Below lg the aside is hidden; pages place <MobileSummary> above their submit. */
export function RequestLayout({ children, summary }: { children: ReactNode; summary: ReactNode }) {
  return (
    <Container className="sf-section">
      <div className="grid gap-[var(--sf-space-xl)] lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start xl:gap-[var(--sf-space-2xl)]">
        <div className="min-w-0">{children}</div>
        <aside className="hidden lg:sticky lg:top-28 lg:block" aria-label="Request summary">
          {summary}
        </aside>
      </div>
    </Container>
  )
}

export function MobileSummary({ children }: { children: ReactNode }) {
  return <div className="lg:hidden">{children}</div>
}

export function FormSection({
  title,
  children,
  aside,
  first,
}: {
  title: string
  children: ReactNode
  aside?: ReactNode
  first?: boolean
}) {
  return (
    <section className={first ? undefined : 'border-t pt-[var(--sf-space-md)]'} style={first ? undefined : { borderColor: 'var(--sf-rule)' }}>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="sf-heading min-w-0 text-[length:var(--sf-text-xl)]">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function Field({
  label,
  htmlFor,
  optional,
  className = '',
  children,
}: {
  label: string
  htmlFor?: string
  optional?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={htmlFor} className="sf-label">
        {label}
        {optional && <span className="sf-faint"> / Optional</span>}
      </label>
      {children}
    </div>
  )
}

export type PillOption = { value: string; label: ReactNode }

const PILL_FOCUS =
  'min-h-11 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--sf-focus)]'

/* Native radios styled as joined segmented plates, so name/required/onChange keep working as form fields. */
export function RadioPills({
  legend,
  name,
  options,
  value,
  onChange,
  required,
  variant = 'track',
  className = '',
}: {
  legend: string
  name: string
  options: PillOption[]
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  required?: boolean
  variant?: 'track' | 'grid'
  className?: string
}) {
  const container = variant === 'grid'
    ? `grid gap-1.5 ${className || 'grid-cols-3 sm:grid-cols-4'}`
    : `sf-track sf-track-block ${className}`
  // In a grid each choice is its own square plate; in a track the plates are joined.
  const plate = variant === 'grid' ? 'border border-[var(--sf-ink-3)] rounded-[var(--sf-radius-sm)] data-[active=true]:border-[var(--sf-ink)]' : ''

  return (
    <fieldset className="min-w-0">
      <legend className="sf-label">{legend}</legend>
      <div className={container}>
        {options.map((option) => (
          <label
            key={option.value}
            className={`sf-pill ${plate} ${PILL_FOCUS}`}
            data-active={value === option.value ? 'true' : undefined}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={onChange}
              required={required}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function Notice({ tone, children, role }: { tone?: 'ok' | 'bad' | 'warn'; children: ReactNode; role?: 'alert' | 'status' }) {
  return (
    <div className="sf-notice" data-tone={tone} role={role ?? (tone === 'bad' ? 'alert' : 'status')}>
      {children}
    </div>
  )
}

export type StickerRowData = { label: string; value: ReactNode; strong?: boolean }

export function Sticker({
  title,
  meta,
  rows,
  children,
  footer,
}: {
  title: string
  meta?: ReactNode
  rows?: StickerRowData[]
  children?: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="sf-sticker">
      <div className="sf-sticker-head">
        <span>{title}</span>
        {meta && <span className="sf-figure">{meta}</span>}
      </div>
      {children}
      {rows && rows.length > 0 && (
        <dl>
          {rows.map((row) => (
            <div key={row.label} className="sf-sticker-row">
              <dt>{row.label}</dt>
              <dd className={row.strong ? 'font-semibold' : undefined}>
                {row.value === null || row.value === undefined || row.value === '' ? <span className="sf-faint">Not set</span> : row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {footer && (
        <div className="border-t px-4 py-3" style={{ borderColor: 'var(--sf-rule)' }}>
          {footer}
        </div>
      )}
    </div>
  )
}

export function StickerVehicle({ vehicle, label }: { vehicle: Vehicle; label: string }) {
  const src = vehicleImageUrl(primaryVehicleImage(vehicle.images))
  return (
    <div className="flex items-center gap-3 border-b border-dashed p-3" style={{ borderColor: 'var(--sf-rule)' }}>
      <div className="sf-photo relative h-16 w-24 shrink-0">
        {src ? (
          <Image src={src} alt={vehicleTitle(vehicle)} fill className="object-cover" sizes="96px" unoptimized={skipImageOptimizer(src)} />
        ) : (
          <VehiclePhotoPlaceholder className="origin-center scale-[0.6]" />
        )}
      </div>
      <div className="min-w-0">
        <p className="sf-eyebrow">{label}</p>
        <p className="sf-heading mt-1 text-[length:var(--sf-text-md)]">{vehicleTitle(vehicle)}</p>
        {vehicle.stockNumber && (
          <p className="sf-figure sf-muted mt-0.5 text-[length:var(--sf-text-xs)]">Stock {vehicle.stockNumber}</p>
        )}
      </div>
    </div>
  )
}

/* "Request received": status dot on the title line, submitted summary in a sticker, next actions as a button row. */
export function RequestReceived({
  context,
  reference,
  summary,
  actions,
  note,
}: {
  context: string
  reference?: string | null
  summary?: ReactNode
  actions: ReactNode
  note?: string
}) {
  return (
    <Container className="sf-section">
      <div className="grid gap-[var(--sf-space-xl)] lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
        <div className="min-w-0">
          <h1 className="sf-title-line">
            <span className="sf-dot" data-tone="ok" aria-hidden="true" />
            <span className="sf-display text-[length:var(--sf-text-display)]">Request received</span>
          </h1>
          <p className="sf-muted mt-3 text-[length:var(--sf-text-md)]">{context}</p>
          {reference && (
            <p role="status" className="mt-5 flex flex-wrap items-baseline gap-3">
              <span className="sf-eyebrow">Reference</span>
              <span className="sf-figure text-[length:var(--sf-text-xl)] font-semibold">{reference}</span>
            </p>
          )}
          {note && <p className="sf-muted mt-4 max-w-md text-[length:var(--sf-text-sm)]">{note}</p>}
          <nav aria-label="Next" className={`mt-[var(--sf-space-lg)] ${ACTION_ROW}`}>
            {actions}
          </nav>
        </div>
        {summary && <div className="min-w-0">{summary}</div>}
      </div>
    </Container>
  )
}

export const PILL_TARGET = 'min-h-11'

/* A row of standalone sf-btn actions that wraps on narrow phones. */
export const ACTION_ROW = 'flex flex-wrap gap-2'

/* "2026-10-24" -> "Sat, Oct 24, 2026" without shifting the day across time zones. */
export function formatRequestDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}
