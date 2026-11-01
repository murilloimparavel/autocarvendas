import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  actions,
  tone = 'light',
}: {
  title: string
  description?: string
  actions?: ReactNode
  tone?: 'light' | 'dark' | 'lane'
}) {
  return (
    <section
      className={tone === 'dark' ? 'sf-band' : tone === 'lane' ? 'sf-lane' : 'border-b'}
      style={tone === 'light' ? { borderColor: 'var(--sf-rule)' } : undefined}
    >
      <div className="sf-container flex flex-col gap-5 py-5 md:flex-row md:items-end md:justify-between md:py-8">
        <div className="min-w-0">
          <h1 className="sf-display max-w-3xl text-[length:var(--sf-text-2xl)] md:text-[2.75rem]">{title}</h1>
          {description && (
            <p className="sf-muted mt-3 max-w-xl text-[length:var(--sf-text-md)]">{description}</p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </section>
  )
}
