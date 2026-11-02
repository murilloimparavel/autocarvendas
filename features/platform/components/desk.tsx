/**
 * Desk kit: the shared building blocks for the dealership platform screens.
 * Flat and square: underline tabs, 4px controls, 6px panels, hairline tables.
 * Figures (price, stock, days, gross) are set condensed, like the numbers a lot
 * writes on the glass; lot yellow marks only what needs attention.
 */

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'
import { ScrollFadeTrack } from './deskScrollTrack'
import { deskFigureFont } from './deskFont'

export type DeskTone = 'ok' | 'warn' | 'bad' | 'info' | 'idle' | 'accent'

const MARK_TONE: Record<DeskTone, string> = {
  ok: 'bg-emerald-600 dark:bg-emerald-400',
  warn: 'bg-amber-700 dark:bg-amber-500',
  bad: 'bg-red-600 dark:bg-red-400',
  info: 'bg-sky-600 dark:bg-sky-400',
  idle: 'bg-zinc-400 dark:bg-zinc-500',
  accent: 'bg-foreground',
}

const TEXT_TONE: Record<DeskTone, string> = {
  ok: 'text-emerald-700 dark:text-emerald-300',
  warn: 'text-amber-800 dark:text-amber-300',
  bad: 'text-red-700 dark:text-red-300',
  info: 'text-sky-700 dark:text-sky-300',
  idle: 'text-muted-foreground',
  accent: 'text-foreground',
}

/** Status mark: a small square. Always paired with a word somewhere on the row; colour is never the only signal. */
export function StatusDot({ tone = 'idle', className }: { tone?: DeskTone; className?: string }) {
  return <span aria-hidden="true" className={cn('inline-block size-2 shrink-0 rounded-[1px]', MARK_TONE[tone], className)} />
}

/** Status column cell: mark plus word. */
export function Status({ tone = 'idle', children, className }: { tone?: DeskTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[13px] font-medium', TEXT_TONE[tone], className)}>
      <StatusDot tone={tone} />
      <span className="truncate">{children}</span>
    </span>
  )
}

/** A heading whose status mark sits on its first line, not vertically centred against wrapped text. */
export function TitleLine({
  tone,
  status,
  children,
  as: Tag = 'h3',
  className,
}: {
  tone?: DeskTone
  status?: string
  children: React.ReactNode
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'div'
  className?: string
}) {
  return (
    <Tag className={cn('flex min-w-0 items-baseline gap-2', className)}>
      {tone && <StatusDot tone={tone} className="-translate-y-[0.1em]" />}
      {status && <span className="sr-only">{status}: </span>}
      <span className="min-w-0 break-words">{children}</span>
    </Tag>
  )
}

/**
 * Page header for PageContainer's `header` slot. The page's state is said in words in `meta`, so a
 * header carries no status mark. `eyebrow` is accepted for compatibility and rendered as plain meta.
 */
export function DeskHeader({
  title,
  status,
  meta,
  actions,
  eyebrow,
}: {
  title: React.ReactNode
  tone?: DeskTone
  status?: string
  meta?: React.ReactNode
  actions?: React.ReactNode
  eyebrow?: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-1">
      <div className="min-w-0 max-w-full flex-[1_1_16rem]">
        <h1 className="min-w-0 break-words text-2xl font-semibold tracking-[-0.015em] text-foreground">
          {status && <span className="sr-only">{status}: </span>}
          {title}
        </h1>
        {(meta || eyebrow) && (
          <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
            {eyebrow && <span>{eyebrow}</span>}
            {meta && <div className="min-w-0">{meta}</div>}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 [&_[data-slot=track]]:flex-wrap [&_[data-slot=track]]:overflow-visible">
          {actions}
        </div>
      )}
    </div>
  )
}

// A track is a plain row of controls. When it holds segment choices (pills with `active`), it becomes an
// underline tab bar: a hairline under the row, the current choice underlined in ink.
const TRACK_CLASS =
  'inline-flex max-w-full items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden has-[>[data-segment]]:gap-0 has-[>[data-segment]]:border-b has-[>[data-segment]]:border-border'
const TABS_CLASS =
  'flex max-w-full items-stretch gap-0 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
const TRACK_BLOCK_CLASS = 'flex w-full [&>*]:flex-1'

/** Row of controls; becomes an underline tab bar when it holds segment choices. */
export function Track({
  children,
  className,
  block,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { block?: boolean }) {
  return (
    <div data-slot="track" className={cn(TRACK_CLASS, block && TRACK_BLOCK_CLASS, className)} {...props}>
      {children}
    </div>
  )
}

type PillVariant = 'plain' | 'raised' | 'primary' | 'danger'

const BUTTON_VARIANT: Record<PillVariant, string> = {
  plain: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  raised: 'border border-input bg-background text-foreground hover:bg-muted',
  primary: 'bg-foreground text-background hover:bg-foreground/85',
  danger: 'bg-red-600 text-white hover:bg-red-700',
}

const SEGMENT_CLASS =
  'relative -mb-px rounded-none border-b-2 px-3 text-muted-foreground hover:text-foreground data-[active=true]:border-foreground data-[active=true]:text-foreground border-transparent'

export interface PillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PillVariant
  /** Selected state for segmented choices: renders as an underline tab. */
  active?: boolean
  size?: 'sm' | 'md'
  asChild?: boolean
}

/**
 * The kit's button. Actions are `raised` (outlined, the default), `primary` (ink), `plain` (ghost) or `danger`.
 * Passing `active` makes it a segment choice, drawn as an underline tab.
 */
export const Pill = React.forwardRef<HTMLButtonElement, PillProps>(function Pill(
  { variant, active, size = 'md', asChild, className, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button'
  const segment = active !== undefined && variant === undefined
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? 'button')}
      data-active={active ? 'true' : undefined}
      data-segment={segment ? '' : undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[13px]',
        segment ? cn(SEGMENT_CLASS, size === 'sm' ? 'h-8' : 'h-9') : cn('rounded-[4px]', size === 'sm' ? 'px-2.5' : 'px-3', BUTTON_VARIANT[variant ?? 'raised']),
        className,
      )}
      {...props}
    />
  )
})

/** Underline tabs: one choice is current. Counts sit beside each label in tabular figures. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size,
  block,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<{ value: T; label: React.ReactNode; count?: number; tone?: DeskTone; disabled?: boolean }>
  label: string
  size?: 'sm' | 'md'
  block?: boolean
  className?: string
}) {
  // Overflowing tabs scroll sideways behind an edge fade rather than being cut off.
  return (
    <ScrollFadeTrack role="group" aria-label={label} activeKey={value} className={cn(TABS_CLASS, block && TRACK_BLOCK_CLASS, className)}>
      {options.map((option) => (
        <Pill
          key={option.value}
          size={size}
          active={option.value === value}
          aria-pressed={option.value === value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.tone && <StatusDot tone={option.tone} className="size-1.5" />}
          {option.label}
          {option.count !== undefined && (
            <span className={cn('text-[12px] tabular-nums', option.count > 0 ? 'text-foreground/70' : 'text-muted-foreground/70')}>{option.count}</span>
          )}
        </Pill>
      ))}
    </ScrollFadeTrack>
  )
}

/** A desk figure: condensed, heavy, tabular. Use for the one number a row or summary is about. */
export function Figure({
  children,
  size = 'md',
  attention,
  className,
}: {
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** Marks the figure in lot yellow: aged, overdue, waiting. */
  attention?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        deskFigureFont.className,
        'inline-block font-bold leading-none tabular-nums tracking-[-0.01em] [font-stretch:72%]',
        size === 'sm' && 'text-[14px]',
        size === 'md' && 'text-xl',
        size === 'lg' && 'text-2xl',
        attention && 'rounded-[2px] bg-[oklch(0.9_0.17_95)] px-1 text-zinc-950 dark:bg-[oklch(0.84_0.16_92)]',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Lot-yellow attention marker beside a word: "Overdue", "42 days", "Waiting". */
export function Attention({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-[2px] bg-[oklch(0.93_0.13_95)] px-1.5 py-px text-[12px] font-semibold text-zinc-950 dark:bg-[oklch(0.84_0.16_92)]', className)}>
      {children}
    </span>
  )
}

/** One summary figure. Summary strips sit below the work, so they stay quiet: body-scale figures, no boxes. */
export function Readout({
  label,
  value,
  sub,
  tone,
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: DeskTone
  className?: string
}) {
  return (
    <div className={cn('min-w-0 py-2.5 pr-4', className)}>
      <TitleLine as="p" tone={tone && tone !== 'idle' ? tone : undefined} className="text-[12px] text-muted-foreground">
        {label}
      </TitleLine>
      <p className="mt-0.5 truncate text-foreground">
        <Figure size="md">{value}</Figure>
      </p>
      {sub && <p className="mt-0.5 text-[12px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

/** One borderless hairline row of summary figures; two up on phones. */
export function ReadoutStrip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-x-4 border-y md:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] md:[&>*+*]:border-l md:[&>*+*]:pl-4',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Titled region separated by spacing and a hairline, not a card. */
export function DeskSection({
  title,
  count,
  actions,
  children,
  className,
  id,
}: {
  title: React.ReactNode
  count?: number
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  id?: string
}) {
  return (
    <section className={cn('min-w-0', className)} aria-labelledby={id}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-foreground/15 pb-2">
        <h2 id={id} className="flex items-baseline gap-2 text-[14px] font-semibold text-foreground">
          {title}
          {count !== undefined && <span className="text-[13px] font-normal tabular-nums text-muted-foreground">{count}</span>}
        </h2>
        {actions}
      </div>
      <div className="pt-3">{children}</div>
    </section>
  )
}

/** Bordered surface for lists and forms. */
export function Panel({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('min-w-0 rounded-md border bg-card', className)} {...props}>
      {children}
    </div>
  )
}

/** Dense table inside a panel. Columns marked `priority` 2/3 drop at narrower widths. */
export function DeskTable({ children, className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-md border bg-card">
      <table className={cn('w-full border-collapse text-[13px]', className)} {...props}>
        {children}
      </table>
    </div>
  )
}

const PRIORITY: Record<1 | 2 | 3, string> = { 1: '', 2: 'max-md:hidden', 3: 'max-lg:hidden' }

export function Th({
  children,
  className,
  align = 'left',
  priority = 1,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right'; priority?: 1 | 2 | 3 }) {
  return (
    <th
      scope="col"
      className={cn(
        'sticky top-0 z-[1] h-9 whitespace-nowrap border-b bg-muted/60 px-3 text-[12px] font-medium text-muted-foreground backdrop-blur-sm first:pl-4 last:pr-4',
        align === 'right' ? 'text-right' : 'text-left',
        PRIORITY[priority],
        className,
      )}
      {...props}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  className,
  align = 'left',
  priority = 1,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right'; priority?: 1 | 2 | 3 }) {
  return (
    <td
      className={cn('px-3 py-2.5 align-middle first:pl-4 last:pr-4', align === 'right' && 'text-right tabular-nums', PRIORITY[priority], className)}
      {...props}
    >
      {children}
    </td>
  )
}

/** Table row; pass `href` to make the whole row open a record. */
export function Tr({ children, className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('border-b last:border-b-0 transition-colors hover:bg-muted/40', className)} {...props}>
      {children}
    </tr>
  )
}

/** Label/value pairs in a two-column list. */
export function Facts({
  items,
  className,
}: {
  items: ReadonlyArray<{ label: React.ReactNode; value: React.ReactNode; mono?: boolean } | null | false | undefined>
  className?: string
}) {
  return (
    <dl className={cn('divide-y text-[13px]', className)}>
      {items.filter(Boolean).map((item, index) => {
        const row = item as { label: React.ReactNode; value: React.ReactNode; mono?: boolean }
        return (
          <div key={index} className="flex min-w-0 items-baseline justify-between gap-4 py-2">
            <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
            <dd className={cn('min-w-0 break-words text-right text-foreground', row.mono && 'break-all font-mono text-[12px] tabular-nums')}>{row.value}</dd>
          </div>
        )
      })}
    </dl>
  )
}

/** Inline notice for errors and results. */
export function Notice({
  tone = 'idle',
  children,
  className,
  role,
}: {
  tone?: DeskTone
  children: React.ReactNode
  className?: string
  role?: 'alert' | 'status'
}) {
  return (
    <div
      role={role ?? (tone === 'bad' ? 'alert' : 'status')}
      className={cn(
        'flex min-w-0 items-baseline gap-2 rounded-[4px] border px-3 py-2 text-[13px]',
        tone === 'bad' && 'border-red-600/30 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200',
        tone === 'warn' && 'border-amber-700/35 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
        tone === 'ok' && 'border-emerald-600/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100',
        (tone === 'idle' || tone === 'info' || tone === 'accent') && 'bg-muted/50 text-foreground',
        className,
      )}
    >
      <StatusDot tone={tone} className="-translate-y-[0.1em]" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  )
}

/** Monospace identifier: stock number, VIN, RO number. */
export function Code({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[12px] tabular-nums tracking-tight text-muted-foreground', className)}>{children}</span>
}

/** Thin bar for a share or progress value from real data (0..1). */
export function Meter({ value, tone = 'accent', segments = 12, label }: { value: number; tone?: DeskTone; segments?: number; label?: string }) {
  const share = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  const filled = Math.round(share * segments)
  return (
    <span
      role="meter"
      aria-valuemin={0}
      aria-valuemax={segments}
      aria-valuenow={filled}
      aria-label={label}
      className="relative inline-block h-1.5 w-16 overflow-hidden rounded-[1px] bg-muted-foreground/15 align-middle"
    >
      <span className={cn('absolute inset-y-0 left-0', MARK_TONE[tone])} style={{ width: `${share * 100}%` }} />
    </span>
  )
}
