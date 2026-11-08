'use client'

import { Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Pill, Track } from '@/features/platform/components/desk'
import { type MoneyLine } from '@/features/keystone/lifecycle/dealPricing'
import { MoneyInput } from './MoneyInput'
import { useLocale } from '@/features/i18n/LocaleProvider'

const fieldLabel = 'text-[12px] font-medium text-muted-foreground'

export function WorksheetLines({ title, category, lines, onChange, disabled, showErrors }: {
  title: string
  category: string
  lines: MoneyLine[]
  onChange: (lines: MoneyLine[]) => void
  disabled?: boolean
  /** Flag lines that cannot be saved, after the operator tries to save. */
  showErrors?: boolean
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const titleText = pt ? ({ Fees: 'Taxas', Products: 'Produtos', Rebates: 'Descontos', Tax: 'Impostos' } as Record<string, string>)[title] || title : title
  const categoryText = pt ? ({ fee: 'taxa', product: 'produto', rebate: 'desconto', tax: 'imposto' } as Record<string, string>)[category] || category : category
  const update = (index: number, patch: Partial<MoneyLine>) => onChange(lines.map((line, position) => position === index ? { ...line, ...patch } : line))
  return (
    <fieldset disabled={disabled} className="min-w-0 border-t pt-3 first:border-t-0 first:pt-0">
      <legend className="sr-only">{titleText}</legend>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p aria-hidden="true" className="text-sm font-medium text-foreground">
          {titleText}
          <span className="ml-2 text-xs font-normal tabular-nums text-muted-foreground">{lines.length}</span>
        </p>
        <Track>
          <Pill size="sm" disabled={disabled || lines.length >= 50} onClick={() => onChange([...lines, { code: `${category}-${crypto.randomUUID().slice(0, 8)}`, name: '', amountCents: 0, source: 'operator-recorded' }])}>
            <Plus />
            {pt ? `Adicionar ${categoryText}` : `Add ${category} line`}
          </Pill>
        </Track>
      </div>
      <div>
        {lines.length === 0 && <p className="py-2 text-xs text-muted-foreground">{pt ? `Nenhum item em ${titleText.toLowerCase()}` : `No ${title.toLowerCase()}`}</p>}
        {lines.length > 0 && (
          <ul className="mt-2 divide-y rounded-md border bg-muted/30">
            {lines.map((line, index) => {
              const nameMissing = Boolean(showErrors) && !String(line.name || '').trim()
              return (
              <li key={`${category}-${index}`} className="grid min-w-0 gap-2 p-2.5 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)_8rem_auto] sm:items-end">
                <label htmlFor={`${category}-${index}-code`} className="grid min-w-0 gap-1">
          <span className={fieldLabel}>{pt ? 'Código' : 'Code'}</span>
                  <Input id={`${category}-${index}-code`} className="h-10 rounded-[4px] font-mono text-xs shadow-none sm:h-8" value={line.code || `legacy-${index + 1}`} maxLength={80} onChange={event => update(index, { code: event.target.value })} />
                </label>
                <label htmlFor={`${category}-${index}-name`} className="grid min-w-0 gap-1">
                  <span className={fieldLabel}>{pt ? 'Descrição' : 'Description'}</span>
                  <Input id={`${category}-${index}-name`} className="h-10 rounded-[4px] text-[13px] shadow-none sm:h-8" value={line.name || ''} maxLength={160} required aria-invalid={nameMissing || undefined} aria-describedby={nameMissing ? `${category}-${index}-name-error` : undefined} onChange={event => update(index, { name: event.target.value })} />
                  {nameMissing && <span id={`${category}-${index}-name-error`} className="text-xs text-destructive">{pt ? 'Informe a descrição' : 'Description is required'}</span>}
                </label>
                <label htmlFor={`${category}-${index}-amount`} className="grid min-w-0 gap-1">
                  <span className={fieldLabel}>{pt ? 'Valor (USD)' : 'Amount (USD)'}</span>
                  {/* A typed amount is the operator's figure; it is no longer repriced from the configured rate. */}
                  <MoneyInput id={`${category}-${index}-amount`} className="h-10 text-[13px] sm:h-8" cents={Number(line.amountCents ?? Math.round(Number(line.amount || 0) * 100))} onCentsChange={amountCents => update(index, { amountCents, source: 'operator-recorded' })} />
                </label>
                <Track className="justify-self-end">
                  <Pill size="sm" variant="plain" aria-label={pt ? `Remover ${line.name || titleText} ${index + 1}` : `Remove ${line.name || title} line ${index + 1}`} onClick={() => onChange(lines.filter((_, position) => position !== index))}>
                    <X />
                    {pt ? 'Remover' : 'Remove'}
                  </Pill>
                </Track>
              </li>
              )
            })}
          </ul>
        )}
      </div>
    </fieldset>
  )
}
