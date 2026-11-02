'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { basePath } from '@/features/dashboard/lib/config'
import { Code, DeskSection, Notice, Pill, Segmented, TitleLine, Track } from '@/features/platform/components/desk'
import { formatCentsForInput, parseDollarsToCents } from '@/features/platform/deals/lib/moneyInput'
import { decideDealFinanceMenu, getDealFinanceMenu, presentDealFinanceMenu, quoteFinanceProduct } from '../actions/menu'
import { FinanceFormDialog, type FieldErrors, type FinanceFormField } from './FinanceFormDialog'
import type { DealMenuData, MenuOption, MenuProduct, MenuQuote, MenuVersion } from '../lib/menuTypes'
import { categoryLabels, formatCents, formatDay, newIdempotencyKey, stateTone } from '../lib/display'
import { countLabel } from '@/features/platform/lib/format'

export type MenuRequest = { kind: 'quotes' | 'present-menu' | 'decide-menu'; nonce: number }

type PanelDeal = { id: string; status: string | null; updatedAt: string | null; rooftop: { id: string } | null }
type StepHint = { available: boolean; blockedReason: string | null } | null

type Dialog =
  | { kind: 'quote'; product: MenuProduct; values: Record<string, string>; idempotencyKey: string }
  | { kind: 'present'; picked: string[]; idempotencyKey: string }
  | { kind: 'decide'; menu: MenuVersion; choices: Record<string, 'chosen' | 'declined' | ''>; values: Record<string, string>; idempotencyKey: string }

const ACTIVE_DEAL = ['submitted', 'approved', 'financed']

function termOf(quote: MenuQuote | undefined) {
  const term = quote?.resultSnapshot?.termMonths
  return typeof term === 'number' && Number.isInteger(term) ? term : null
}

/** Quotes and the F&I menu for one deal: quote each product, present a chosen set, record choose or decline per product. */
export function DealMenuPanel({
  deal,
  timeZone,
  request,
  presentStep,
  decideStep,
  onChanged,
}: {
  deal: PanelDeal
  timeZone: string
  request: MenuRequest | null
  presentStep: StepHint
  decideStep: StepHint
  onChanged: (message: string) => void | Promise<void>
}) {
  const [data, setData] = useState<DealMenuData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const handledNonce = useRef<number | null>(null)

  const rooftopId = deal.rooftop?.id || ''
  const load = useCallback(async () => {
    if (!rooftopId) return
    setLoading(true)
    const response = await getDealFinanceMenu(deal.id, rooftopId)
    if (response.success) {
      setData({ products: response.data.financeProducts, quotes: response.data.financeProductQuotes, menus: response.data.financeMenuVersions })
      setLoadError(null)
    } else setLoadError(response.error)
    setLoading(false)
  }, [deal.id, rooftopId])

  useEffect(() => { void load() }, [load, deal.updatedAt])

  const latestQuote = useMemo(() => {
    const map = new Map<string, MenuQuote>()
    for (const quote of data?.quotes || []) if (quote.product && !map.has(quote.product.id)) map.set(quote.product.id, quote)
    return map
  }, [data])
  const activeProducts = (data?.products || []).filter(product => product.active)
  const quotedProducts = activeProducts.filter(product => {
    const quote = latestQuote.get(product.id)
    return quote?.status === 'quoted' && Boolean(quote.evidenceReference)
  })
  const currentMenu = data?.menus[0] ?? null
  const dealActive = ACTIVE_DEAL.includes(deal.status || '')
  const inactiveReason = dealActive ? null : 'Deal must be submitted, approved or financed'

  const openQuote = useCallback((product: MenuProduct) => {
    const prior = latestQuote.get(product.id)
    setFieldErrors({}); setFormError(null)
    setDialog({
      kind: 'quote', product, idempotencyKey: newIdempotencyKey(`finance-quote:${deal.id}:${product.id}`),
      values: {
        status: 'quoted',
        retail: formatCentsForInput(prior?.retailPriceCents ?? product.retailPriceCents),
        cost: prior?.costCents != null ? formatCentsForInput(prior.costCents) : product.costCents != null ? formatCentsForInput(product.costCents) : '',
        term: termOf(prior)?.toString() || '',
        reference: '',
      },
    })
  }, [deal.id, latestQuote])

  const openPresent = useCallback(() => {
    setFieldErrors({}); setFormError(null)
    setDialog({ kind: 'present', picked: quotedProducts.map(product => product.code), idempotencyKey: newIdempotencyKey(`finance-menu:${deal.id}`) })
  }, [deal.id, quotedProducts])

  const openDecide = useCallback(() => {
    if (!currentMenu || currentMenu.status !== 'presented') return
    setFieldErrors({}); setFormError(null)
    const options = currentMenu.optionsSnapshot || []
    setDialog({ kind: 'decide', menu: currentMenu, choices: Object.fromEntries(options.map(option => [option.code, ''])), values: { acknowledgment: '' }, idempotencyKey: newIdempotencyKey(`finance-menu-decision:${deal.id}`) })
  }, [currentMenu, deal.id])

  // The desk's step list asks the panel to run quote, present or decide.
  useEffect(() => {
    if (!request || !data || handledNonce.current === request.nonce) return
    handledNonce.current = request.nonce
    if (request.kind === 'quotes') {
      const next = activeProducts.find(product => {
        const quote = latestQuote.get(product.id)
        return !quote || !(quote.status === 'failed' || (quote.status === 'quoted' && quote.evidenceReference))
      }) || activeProducts[0]
      if (next) openQuote(next)
    } else if (request.kind === 'present-menu') openPresent()
    else openDecide()
  }, [request, data, activeProducts, latestQuote, openQuote, openPresent, openDecide])

  const close = () => { if (!busy) setDialog(null) }

  const submit = async () => {
    if (!dialog) return
    const errors: FieldErrors = {}
    let run: (() => Promise<{ success: boolean; error?: string }>) | null = null
    let message = 'Saved.'
    if (dialog.kind === 'quote') {
      const v = dialog.values
      const status = v.status as 'requested' | 'quoted' | 'failed'
      if (!['requested', 'quoted', 'failed'].includes(status)) errors.status = 'Select a quote result.'
      const retail = (v.retail || '').trim() ? parseDollarsToCents(v.retail) : null
      const cost = (v.cost || '').trim() ? parseDollarsToCents(v.cost) : null
      const term = (v.term || '').trim() ? Number(v.term) : null
      if (status === 'quoted') {
        if (retail == null) errors.retail = 'Enter the quoted retail price.'
        if (cost == null) errors.cost = 'Enter the quoted dealer cost.'
        if (!(v.reference || '').trim()) errors.reference = 'Enter the provider rate or quote reference.'
      } else {
        if ((v.retail || '').trim() && retail == null) errors.retail = 'Enter a dollar amount.'
        if ((v.cost || '').trim() && cost == null) errors.cost = 'Enter a dollar amount.'
      }
      if (term != null && (!Number.isInteger(term) || term < 1 || term > 240)) errors.term = 'Enter 1 to 240 months.'
      if ((v.reference || '').length > 200) errors.reference = 'Use 200 characters or fewer.'
      run = () => quoteFinanceProduct({
        dealId: deal.id, productId: dialog.product.id, status,
        retailPriceCents: retail, costCents: cost, termMonths: term,
        evidenceReference: (v.reference || '').trim(), idempotencyKey: dialog.idempotencyKey,
      })
      message = `${dialog.product.code} quote recorded.`
    } else if (dialog.kind === 'present') {
      run = () => presentDealFinanceMenu({ dealId: deal.id, expectedUpdatedAt: deal.updatedAt, productCodes: dialog.picked, idempotencyKey: dialog.idempotencyKey })
      message = dialog.picked.length ? `Menu presented with ${countLabel(dialog.picked.length, 'product')}.` : 'Menu presented with no products.'
    } else {
      const codes = Object.keys(dialog.choices)
      for (const code of codes) if (!dialog.choices[code]) errors[`choice:${code}`] = 'Choose or decline.'
      const acknowledgment = (dialog.values.acknowledgment || '').trim()
      if (!acknowledgment) errors.acknowledgment = 'Enter the disclosure acknowledgment.'
      const selected = codes.filter(code => dialog.choices[code] === 'chosen')
      run = () => decideDealFinanceMenu({
        dealId: deal.id, expectedUpdatedAt: deal.updatedAt, menuId: dialog.menu.id,
        selectedProductCodes: selected, declinedProductCodes: codes.filter(code => dialog.choices[code] === 'declined'),
        disclosureAcknowledgment: acknowledgment, idempotencyKey: dialog.idempotencyKey,
      })
      message = selected.length ? `Menu accepted: ${selected.join(', ')}.` : 'Menu declined.'
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length || !run) return
    setBusy(true); setFormError(null)
    const response = await run()
    setBusy(false)
    if (!response.success) { setFormError(response.error || 'Unable to save.'); return }
    setDialog(null)
    await load()
    await onChanged(message)
  }

  const quoteFields: FinanceFormField[] = dialog?.kind === 'quote' ? [
    { name: 'status', label: 'Result', type: 'select', options: [{ value: 'quoted', label: 'Quoted' }, { value: 'requested', label: 'Requested' }, { value: 'failed', label: 'Cannot quote' }] },
    { name: 'term', label: 'Term (months)', type: 'number', placeholder: '60' },
    { name: 'retail', label: 'Retail price', type: 'money' },
    { name: 'cost', label: 'Dealer cost', type: 'money' },
    { name: 'reference', label: dialog.values.status === 'quoted' ? 'Rate reference' : 'Reference (optional)', maxLength: 200, wide: true },
  ] : dialog?.kind === 'decide' ? [
    { name: 'acknowledgment', label: 'Disclosure acknowledgment', type: 'textarea', maxLength: 1000 },
  ] : []

  const optionRow = (option: MenuOption, menu: MenuVersion) => {
    const chosen = (menu.selectedProductCodes || []).includes(option.code)
    const declined = (menu.declinedProductCodes || []).includes(option.code)
    const state = chosen ? 'Chosen' : declined ? 'Declined' : menu.status === 'presented' ? 'Awaiting' : '-'
    return (
      <li key={option.code} className="flex min-w-0 items-start justify-between gap-4 py-2">
        <div className="min-w-0">
          <TitleLine as="p" tone={chosen ? 'ok' : declined ? 'idle' : 'warn'} status={state}>{option.name || option.code}</TitleLine>
          <p className="pl-4 text-xs text-muted-foreground"><Code>{option.code}</Code> · {state}{option.termMonths ? ` · ${option.termMonths} mo` : ''}</p>
        </div>
        <p className="shrink-0 text-xs tabular-nums">{formatCents(option.retailPriceCents ?? null)}</p>
      </li>
    )
  }

  const presentDisabledReason = inactiveReason || (currentMenu?.status === 'presented' ? 'Record the customer decision first' : null)
  const decideDisabledReason = inactiveReason || (currentMenu?.status !== 'presented' ? decideStep?.blockedReason || 'Present the F&I menu first' : null)
  const chosenTotal = currentMenu ? (currentMenu.optionsSnapshot || []).filter(option => (currentMenu.selectedProductCodes || []).includes(option.code)).reduce((sum, option) => sum + (option.retailPriceCents || 0), 0) : 0

  return (
    <DeskSection
      title="F&I menu"
      count={activeProducts.length}
      actions={
        <Track>
          <Pill size="sm" variant={presentStep?.available ? 'primary' : 'raised'} disabled={busy || Boolean(presentDisabledReason) || !data} title={presentDisabledReason || undefined} onClick={openPresent}>
            {currentMenu && currentMenu.status !== 'superseded' ? 'Present new menu' : 'Present menu'}
          </Pill>
          <Pill size="sm" variant={decideStep?.available ? 'primary' : 'raised'} disabled={busy || Boolean(decideDisabledReason)} title={decideDisabledReason || undefined} onClick={openDecide}>
            Record decision
          </Pill>
        </Track>
      }
    >
      <div className="space-y-4">
        {loadError && (
          <Notice tone="bad">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>{loadError}</span>
              <Track><Pill size="sm" onClick={() => void load()}>Retry</Pill></Track>
            </div>
          </Notice>
        )}
        {!data && !loadError && <p className="py-3 text-sm text-muted-foreground" role="status">Loading products…</p>}
        {(presentDisabledReason || decideDisabledReason) && data && (
          <p className="text-xs text-muted-foreground">
            {[presentDisabledReason ? `Present: ${presentDisabledReason}` : null, decideDisabledReason && currentMenu?.status === 'presented' ? `Decision: ${decideDisabledReason}` : null].filter(Boolean).join(' · ')}
          </p>
        )}

        {data && (
          activeProducts.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm text-muted-foreground">
              <span>No active products at this rooftop</span>
              <Track><Pill size="sm" asChild><Link href={`${basePath}/platform/finance/products`}>F&I products</Link></Pill></Track>
            </div>
          ) : (
            <ul className="divide-y text-sm" aria-label="Product quotes">
              {activeProducts.map(product => {
                const quote = latestQuote.get(product.id)
                const term = termOf(quote)
                const status = quote?.status || 'not quoted'
                return (
                  <li key={product.id} className="flex min-w-0 flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <TitleLine as="p" tone={quote ? stateTone(quote.status) : 'idle'} status={status} className="font-medium">
                        {product.name}
                      </TitleLine>
                      <p className="break-words pl-4 text-xs text-muted-foreground">
                        <Code>{product.code}</Code> · {categoryLabels[product.category] || product.category} · {status === 'failed' ? 'cannot quote' : status}
                        {quote?.evidenceReference ? ` · ${quote.evidenceReference}` : ''}
                        {quote ? ` · ${formatDay(quote.completedAt || quote.requestedAt, timeZone)}` : ''}
                      </p>
                      <p className="pl-4 text-[11px] tabular-nums text-muted-foreground">
                        Price {formatCents(quote?.retailPriceCents ?? product.retailPriceCents)} · Cost {formatCents(quote ? quote.costCents : product.costCents, 'hidden')} · {term ? `${term} mo` : 'No term'}
                      </p>
                    </div>
                    <Track className="shrink-0 self-start pl-4 sm:self-auto sm:pl-0">
                      <Pill size="sm" disabled={busy || Boolean(inactiveReason)} title={inactiveReason || undefined} onClick={() => openQuote(product)}>
                        {quote ? 'Requote' : 'Quote'}
                      </Pill>
                    </Track>
                  </li>
                )
              })}
            </ul>
          )
        )}

        {data && currentMenu && (
          <div className="space-y-1 rounded-md border px-3 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <TitleLine as="p" tone={stateTone(currentMenu.status)} status={currentMenu.status} className="text-sm font-medium">
                Menu v{currentMenu.version} · {currentMenu.status}
              </TitleLine>
              <p className="text-xs tabular-nums text-muted-foreground">
                {formatDay(currentMenu.decidedAt || currentMenu.presentedAt, timeZone)}{currentMenu.status === 'accepted' ? ` · ${formatCents(chosenTotal)}` : ''}
              </p>
            </div>
            {(currentMenu.optionsSnapshot || []).length === 0
              ? <p className="pl-4 text-xs text-muted-foreground">No products on this menu</p>
              : <ul className="divide-y text-sm">{(currentMenu.optionsSnapshot || []).map(option => optionRow(option, currentMenu))}</ul>}
            {currentMenu.disclosureAcknowledgment && <p className="pl-4 text-xs text-muted-foreground">Acknowledgment: {currentMenu.disclosureAcknowledgment}</p>}
            {data.menus.length > 1 && <p className="pl-4 text-xs text-muted-foreground">{data.menus.length - 1} earlier versions superseded</p>}
          </div>
        )}
        {loading && data && <span className="sr-only" role="status">Refreshing menu</span>}
      </div>

      <FinanceFormDialog
        open={Boolean(dialog)}
        title={dialog?.kind === 'quote' ? `Quote ${dialog.product.code}` : dialog?.kind === 'present' ? 'Present F&I menu' : `Record decision · menu v${dialog?.kind === 'decide' ? dialog.menu.version : ''}`}
        fields={quoteFields}
        values={dialog?.kind === 'quote' || dialog?.kind === 'decide' ? dialog.values : {}}
        errors={fieldErrors}
        error={formError}
        busy={busy}
        submitLabel={dialog?.kind === 'present' ? 'Present' : 'Save'}
        onValuesChange={values => setDialog(current => current && (current.kind === 'quote' || current.kind === 'decide') ? { ...current, values } : current)}
        onSubmit={submit}
        onOpenChange={open => { if (!open) close() }}
      >
        {dialog?.kind === 'present' && (
          <fieldset className="space-y-2">
            <legend className="text-[12px] font-medium text-muted-foreground">Quoted products</legend>
            {quotedProducts.length === 0 && <p className="text-sm text-muted-foreground">No quoted products; the menu is presented empty</p>}
            {quotedProducts.map(product => {
              const quote = latestQuote.get(product.id)
              const checked = dialog.picked.includes(product.code)
              return (
                <label key={product.id} className="flex min-h-11 items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <input type="checkbox" className="size-4" checked={checked} onChange={event => setDialog(current => current?.kind === 'present' ? { ...current, picked: event.target.checked ? [...current.picked, product.code] : current.picked.filter(code => code !== product.code) } : current)} />
                    <span className="min-w-0 truncate">{product.name} <Code>{product.code}</Code></span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums">{formatCents(quote?.retailPriceCents ?? null)}{termOf(quote) ? ` · ${termOf(quote)} mo` : ''}</span>
                </label>
              )
            })}
            {activeProducts.length > quotedProducts.length && <p className="text-xs text-muted-foreground">{activeProducts.length - quotedProducts.length} active products without a current quote</p>}
          </fieldset>
        )}
        {dialog?.kind === 'decide' && (
          <fieldset className="space-y-2">
            <legend className="text-[12px] font-medium text-muted-foreground">Customer choice</legend>
            {(dialog.menu.optionsSnapshot || []).length === 0 && <p className="text-sm text-muted-foreground">No products on this menu; the decision records a decline</p>}
            {(dialog.menu.optionsSnapshot || []).map(option => (
              <div key={option.code} className="flex min-w-0 flex-col gap-2 rounded-md bg-muted/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="truncate">{option.name || option.code} <Code>{option.code}</Code></p>
                  <p className="text-xs tabular-nums text-muted-foreground">{formatCents(option.retailPriceCents ?? null)}{option.termMonths ? ` · ${option.termMonths} mo` : ''}</p>
                  {fieldErrors[`choice:${option.code}`] && <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors[`choice:${option.code}`]}</p>}
                </div>
                <Segmented
                  label={`${option.code} choice`}
                  value={dialog.choices[option.code] || ''}
                  onChange={value => setDialog(current => current?.kind === 'decide' ? { ...current, choices: { ...current.choices, [option.code]: value as 'chosen' | 'declined' } } : current)}
                  options={[{ value: 'chosen', label: 'Choose', tone: 'ok' }, { value: 'declined', label: 'Decline', tone: 'idle' }]}
                />
              </div>
            ))}
          </fieldset>
        )}
      </FinanceFormDialog>
    </DeskSection>
  )
}
