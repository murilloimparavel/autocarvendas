'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, RefreshCw, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { basePath } from '@/features/dashboard/lib/config'
import { Code, DeskHeader, DeskSection, DeskTable, Figure, Notice, Pill, Readout, ReadoutStrip, Segmented, Status, Td, Th, Tr, Track } from '@/features/platform/components/desk'
import { formatCentsForInput, parseDollarsToCents } from '@/features/platform/deals/lib/moneyInput'
import { getFinanceProductCatalog, saveFinanceProduct } from '../actions/catalog'
import { FinanceFormDialog, type FieldErrors, type FinanceFormField } from '../components/FinanceFormDialog'
import type { CatalogProduct, CatalogRooftop } from '../lib/catalogTypes'
import { PRODUCT_CATEGORIES, categoryLabels, financeLabel, formatCents as formatCentsBase, newIdempotencyKey } from '../lib/display'

type Catalog = { products: CatalogProduct[]; rooftops: CatalogRooftop[]; sessionRooftopId: string | null; currencyCode: string }
type Editor = { mode: 'create' | 'edit'; product?: CatalogProduct; values: Record<string, string>; idempotencyKey: string }

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,79}$/

export function FinanceProductsPageClient({ initial, initialError }: { initial: Catalog | null; initialError: string | null }) {
  const { locale } = useLocale()
  const text = (value: string) => financeLabel(locale, value)
  const router = useRouter()
  const [catalog, setCatalog] = useState<Catalog | null>(initial)
  const currencyCode = catalog?.currencyCode || (locale === 'pt-BR' ? 'BRL' : 'USD')
  const formatCents = (cents: number | null | undefined, empty = '-') => formatCentsBase(cents, empty, currencyCode, locale)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)
  const [rooftopId, setRooftopId] = useState<string>(initial?.sessionRooftopId || '')
  const [tab, setTab] = useState<'active' | 'inactive' | 'all'>('active')
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  const rooftops = catalog?.rooftops || []
  const rooftopName = (id: string) => rooftops.find(rooftop => rooftop.id === id)?.name || text('Rooftop')

  const reload = async () => {
    setLoading(true)
    const response = await getFinanceProductCatalog()
    if (response.success) {
      setCatalog(response.data)
      setError(null)
      if (!rooftopId) setRooftopId(response.data.sessionRooftopId || '')
    } else setError(response.error)
    setLoading(false)
    router.refresh()
  }

  const rooftopProducts = useMemo(() => (catalog?.products || []).filter(product => !rooftopId || product.rooftop?.id === rooftopId), [catalog, rooftopId])
  const counts = {
    active: rooftopProducts.filter(product => product.active).length,
    inactive: rooftopProducts.filter(product => !product.active).length,
    all: rooftopProducts.length,
  }
  const term = search.trim().toLowerCase()
  const visible = rooftopProducts
    .filter(product => tab === 'all' || (tab === 'active' ? product.active : !product.active))
    .filter(product => category === 'all' || product.category === category)
    .filter(product => !term || `${product.code} ${product.name}`.toLowerCase().includes(term))
  const activeProducts = rooftopProducts.filter(product => product.active)
  const costKnown = activeProducts.filter(product => product.costCents != null)
  const averageMargin = costKnown.length ? costKnown.reduce((sum, product) => sum + (product.retailPriceCents - (product.costCents || 0)), 0) / costKnown.length : null

  const openCreate = () => {
    setFieldErrors({}); setFormError(null)
    setEditor({ mode: 'create', idempotencyKey: newIdempotencyKey('finance-product'), values: { rooftopId: rooftopId || catalog?.sessionRooftopId || '', code: '', name: '', category: 'service-contract', retail: '', cost: '' } })
  }
  const openEdit = (product: CatalogProduct) => {
    setFieldErrors({}); setFormError(null)
    setEditor({
      mode: 'edit', product, idempotencyKey: newIdempotencyKey('finance-product'),
      values: { rooftopId: product.rooftop?.id || '', rooftopName: product.rooftop?.name || '', code: product.code, name: product.name, category: product.category, retail: formatCentsForInput(product.retailPriceCents, locale), cost: product.costCents == null ? '' : formatCentsForInput(product.costCents, locale), active: product.active ? 'yes' : '' },
    })
  }

  const submit = async () => {
    if (!editor) return
    const v = editor.values
    const errors: FieldErrors = {}
    const code = (v.code || '').trim().toUpperCase()
    if (!v.rooftopId) errors.rooftopId = text('Select a rooftop.')
    if (editor.mode === 'create') {
      if (!CODE_PATTERN.test(code)) errors.code = text('Use 2-80 letters, digits, dashes or underscores.')
      else if ((catalog?.products || []).some(product => product.rooftop?.id === v.rooftopId && product.code === code)) errors.code = text('This code already exists at this rooftop.')
    }
    if (!(v.name || '').trim()) errors.name = text('Enter a product name.')
    else if (v.name.trim().length > 200) errors.name = text('Use 200 characters or fewer.')
    if (!PRODUCT_CATEGORIES.includes(v.category as typeof PRODUCT_CATEGORIES[number])) errors.category = text('Select a category.')
    const retail = (v.retail || '').trim() ? parseDollarsToCents(v.retail, locale) : null
    if (retail == null) errors.retail = text('Enter a dollar amount, for example 1,299.50.')
    const costHidden = editor.mode === 'edit' && editor.product?.costCents == null
    const cost = (v.cost || '').trim() ? parseDollarsToCents(v.cost, locale) : null
    if (!(costHidden && !(v.cost || '').trim()) && cost == null) errors.cost = text('Enter a dollar amount, for example 899.')
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    setBusyId('editor'); setFormError(null)
    const response = await saveFinanceProduct({
      rooftopId: v.rooftopId,
      code: editor.mode === 'edit' ? editor.product!.code : code,
      name: v.name.trim(),
      category: v.category,
      retailPriceCents: retail!,
      costCents: cost,
      active: editor.mode === 'create' ? true : v.active === 'yes',
      expectNew: editor.mode === 'create',
      idempotencyKey: editor.idempotencyKey,
    })
    setBusyId(null)
    if (!response.success) { setFormError(text(response.error)); return }
    setEditor(null)
    setNotice({ tone: 'ok', text: editor.mode === 'create' ? `${code} ${text('added.')}` : `${editor.product!.code} ${text('saved.')}` })
    await reload()
  }

  const toggleActive = async (product: CatalogProduct) => {
    if (!product.rooftop) return
    setBusyId(product.id); setNotice(null)
    const response = await saveFinanceProduct({
      rooftopId: product.rooftop.id,
      code: product.code,
      name: product.name,
      category: product.category,
      retailPriceCents: product.retailPriceCents,
      costCents: product.costCents,
      active: !product.active,
      expectNew: false,
      idempotencyKey: newIdempotencyKey('finance-product'),
    })
    setBusyId(null)
    setNotice(response.success ? { tone: 'ok', text: `${product.code} ${text(product.active ? 'deactivated' : 'activated')}.` } : { tone: 'bad', text: text(response.error) })
    if (response.success) await reload()
  }

  const editorFields: FinanceFormField[] = !editor ? [] : [
    editor.mode === 'create'
      ? { name: 'rooftopId', label: text('Rooftop'), type: 'select', options: rooftops.map(rooftop => ({ value: rooftop.id, label: rooftop.name })), wide: true }
      : { name: 'rooftopName', label: text('Rooftop'), type: 'readonly', wide: true },
    editor.mode === 'create' ? { name: 'code', label: text('Code'), placeholder: 'VSC-60', maxLength: 80 } : { name: 'code', label: text('Code'), type: 'readonly' },
    { name: 'category', label: text('Category'), type: 'select', options: PRODUCT_CATEGORIES.map(value => ({ value, label: text(categoryLabels[value]) })) },
    { name: 'name', label: text('Name'), maxLength: 200, wide: true },
    { name: 'retail', label: text('Retail price'), type: 'money', placeholder: new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode }).format(1299) },
    { name: 'cost', label: text('Dealer cost'), type: 'money', placeholder: editor.mode === 'edit' && editor.product?.costCents == null ? text('Unchanged') : new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode }).format(899), description: editor.mode === 'edit' && editor.product?.costCents == null ? text('Hidden for your role; blank keeps the current cost') : undefined },
    ...(editor.mode === 'edit' ? [{ name: 'active', label: text('Active on menus'), type: 'checkbox' as const }] : []),
  ]

  const breadcrumbs = [
    { type: 'link' as const, label: text('Dashboard'), href: basePath },
    { type: 'page' as const, label: text('Platform') },
    { type: 'link' as const, label: text('Finance'), href: `${basePath}/platform/finance` },
    { type: 'page' as const, label: text('F&I products') },
  ]

  const header = (
    <DeskHeader
      title={text('F&I products')}
      tone={error ? 'bad' : counts.active > 0 ? 'ok' : 'warn'}
      status={error ? text('Unavailable') : `${counts.active} ${text('active')}`}
      meta={error ? text('Unavailable') : `${rooftopId ? rooftopName(rooftopId) : text('All rooftops')} · ${counts.active} ${text('active')} · ${counts.inactive} ${text('inactive')}`}
      actions={
        <>
          <Pill asChild variant="plain">
            <Link href={`${basePath}/platform/finance`}><ArrowLeft />{text('Finance')}</Link>
          </Pill>
          <Pill variant="plain" onClick={reload} disabled={loading} aria-label={text('Refresh')}>
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            {text('Refresh')}
          </Pill>
          <Pill variant="primary" onClick={openCreate} disabled={!rooftops.length || Boolean(error)} title={!rooftops.length ? text('No rooftop available') : undefined}>
            <Plus />
            {text('New product')}
          </Pill>
        </>
      }
    />
  )

  if (error && !catalog) {
    return (
      <PageContainer title={text('F&I products')} header={header} breadcrumbs={breadcrumbs}>
        <div className="space-y-3 px-4 pb-24 md:px-6">
          <Notice tone="bad">
            <p className="font-medium">{text('Products are unavailable')}</p>
            <p className="mt-0.5 text-muted-foreground">{text(error)}</p>
          </Notice>
          <Track><Pill onClick={reload} disabled={loading}>{text('Retry')}</Pill></Track>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer title={text('F&I products')} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-6 px-4 pb-24 md:px-6">
        {notice && (
          <Notice tone={notice.tone}>
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0">{notice.text}</p>
              <Track><Pill size="sm" variant="plain" onClick={() => setNotice(null)}>{text('Dismiss')}</Pill></Track>
            </div>
          </Notice>
        )}
        {error && <Notice tone="bad">{error}</Notice>}

        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          {rooftops.length > 1 && (
            <Select value={rooftopId || 'all'} onValueChange={value => setRooftopId(value === 'all' ? '' : value)}>
              <SelectTrigger className="h-10 w-full rounded-[4px] lg:w-[220px]" aria-label={text('Rooftop')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{text('All rooftops')}</SelectItem>
                {rooftops.map(rooftop => <SelectItem key={rooftop.id} value={rooftop.id}>{rooftop.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Segmented
            label={text('Product status')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'active', label: text('Active'), count: counts.active, tone: 'ok' },
              { value: 'inactive', label: text('Inactive'), count: counts.inactive, tone: 'idle' },
              { value: 'all', label: text('All'), count: counts.all },
            ]}
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-10 w-full rounded-[4px] lg:w-[190px]" aria-label={text('Category')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{text('All categories')}</SelectItem>
              {PRODUCT_CATEGORIES.map(value => <SelectItem key={value} value={value}>{text(categoryLabels[value])}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative min-w-0 flex-1 lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-10 rounded-[4px] pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder={text('Search code or name')} aria-label={text('Search products')} />
          </div>
          {loading && <span className="text-sm text-muted-foreground" role="status">{text('Refreshing…')}</span>}
        </div>

        <DeskSection title={text('Catalog')} count={visible.length}>
          {visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
              <p>{rooftopProducts.length === 0 ? text('No products at this rooftop') : text('No matching products')}</p>
              <Track>
                {rooftopProducts.length === 0
                  ? <Pill size="sm" variant="primary" onClick={openCreate} disabled={!rooftops.length}>{text('New product')}</Pill>
                  : <Pill size="sm" onClick={() => { setSearch(''); setCategory('all'); setTab('all') }}>{text('Reset filters')}</Pill>}
              </Track>
            </div>
          ) : (
            <DeskTable>
              <thead>
                <tr>
                  <Th>{text('Product')}</Th>
                  <Th>{text('Status')}</Th>
                  <Th priority={2}>{text('Category')}</Th>
                  {!rooftopId && <Th priority={3}>{text('Rooftop')}</Th>}
                  <Th priority={3} align="right">{text('Quotes')}</Th>
                  <Th align="right">{text('Retail')}</Th>
                  <Th priority={2} align="right">{text('Cost')}</Th>
                  <Th priority={2} align="right">{text('Margin')}</Th>
                  <Th align="right"><span className="sr-only">{text('Actions')}</span></Th>
                </tr>
              </thead>
              <tbody>
                {visible.map(product => {
                  const margin = product.costCents == null ? null : product.retailPriceCents - product.costCents
                  const busy = busyId === product.id
                  return (
                    <Tr key={product.id}>
                      <Td>
                        <p className="font-medium text-foreground">{product.name}</p>
                        <Code>{product.code}</Code>
                      </Td>
                      <Td><Status tone={product.active ? 'ok' : 'idle'}>{text(product.active ? 'Active' : 'Inactive')}</Status></Td>
                      <Td priority={2} className="text-muted-foreground">{text(categoryLabels[product.category] || product.category)}</Td>
                      {!rooftopId && <Td priority={3} className="text-muted-foreground">{product.rooftop?.name || '-'}</Td>}
                      <Td priority={3} align="right">{product.quotesCount || 0}</Td>
                      <Td align="right"><Figure size="sm">{formatCents(product.retailPriceCents)}</Figure></Td>
                      <Td priority={2} align="right" className="text-muted-foreground">{formatCents(product.costCents, text('Hidden'))}</Td>
                      <Td priority={2} align="right">{margin != null ? formatCents(margin) : '-'}</Td>
                      <Td align="right">
                        <span className="inline-flex flex-wrap justify-end gap-2">
                          <Pill size="sm" className="max-md:h-10" onClick={() => openEdit(product)} disabled={busy}>{text('Edit')}</Pill>
                          <Pill size="sm" className="max-md:h-10" variant={product.active ? 'plain' : 'raised'} onClick={() => toggleActive(product)} disabled={busy}>
                            {busy ? text('Saving…') : text(product.active ? 'Deactivate' : 'Activate')}
                          </Pill>
                        </span>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>

        <ReadoutStrip>
          <Readout label={text('Active')} value={counts.active} tone={counts.active > 0 ? 'ok' : 'warn'} />
          <Readout label={text('Inactive')} value={counts.inactive} />
          <Readout label={text('Avg margin')} value={averageMargin == null ? '-' : formatCents(Math.round(averageMargin))} sub={averageMargin == null ? text('Cost hidden or no products') : text('Active products')} />
        </ReadoutStrip>

        <FinanceFormDialog
          open={Boolean(editor)}
          title={editor?.mode === 'create' ? text('New F&I product') : `${text('Edit')} ${editor?.product?.code || text('product')}`}
          fields={editorFields}
          values={editor?.values || {}}
          errors={fieldErrors}
          error={formError}
          busy={busyId === 'editor'}
          submitLabel={text(editor?.mode === 'create' ? 'Add product' : 'Save')}
          onValuesChange={values => setEditor(current => current ? { ...current, values } : current)}
          onSubmit={submit}
          onOpenChange={open => { if (!open) setEditor(null) }}
        />
      </div>
    </PageContainer>
  )
}
