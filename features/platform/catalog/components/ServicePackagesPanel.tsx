'use client'

import { useMemo, useState } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DeskTable, Figure, Notice, Panel, Pill, Segmented, Td, Th, Tr, Track } from '@/features/platform/components/desk'
import { formatCentsForInput, parseDollarsToCents } from '@/features/platform/deals/lib/moneyInput'
import { cn } from '@/lib/utils'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { type CatalogRooftop, type CatalogServicePackage, type IncludedService, deleteServicePackage, saveServicePackage } from '../actions'
import { ConfirmDialog, EmptyRow, Field, FormDialog, TAP, TAP_INPUT, TAP_SM } from './formKit'

type Draft = { id?: string; rooftopId: string; name: string; description: string; price: string; duration: string; included: string }

function includedToText(items: IncludedService[] | null) {
  return (Array.isArray(items) ? items : [])
    .map(item => (item?.description && item.description !== item.service ? `${item.service}: ${item.description}` : String(item?.service || '')))
    .filter(Boolean)
    .join('\n')
}

function textToIncluded(text: string): IncludedService[] {
  return text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const split = line.indexOf(': ')
    return split > 0 ? { service: line.slice(0, split).trim(), description: line.slice(split + 2).trim() } : { service: line }
  })
}

function formatDuration(minutes: number | null) {
  if (!minutes) return null
  const hours = Math.floor(minutes / 60), rest = minutes % 60
  return hours ? `${hours} h${rest ? ` ${rest} min` : ''}` : `${rest} min`
}

export function ServicePackagesPanel({
  packages,
  rooftops,
  currencyCode,
  error,
  onReload,
}: {
  packages: CatalogServicePackage[]
  rooftops: CatalogRooftop[]
  currencyCode: string
  error: string | null
  onReload: () => Promise<void>
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const [rooftopFilter, setRooftopFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<CatalogServicePackage | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const money = useMemo(() => new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, minimumFractionDigits: 0, maximumFractionDigits: 2 }), [currencyCode, locale])
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return packages
      .filter(item => rooftopFilter === 'all' || item.rooftop?.id === rooftopFilter)
      .filter(item => !term || `${item.name} ${item.description || ''} ${includedToText(item.includedServices)}`.toLowerCase().includes(term))
  }, [packages, rooftopFilter, search])

  const open = (item?: CatalogServicePackage) => {
    setFieldErrors({}); setFormError(null)
    setDraft(item
      ? { id: item.id, rooftopId: item.rooftop?.id || '', name: item.name, description: item.description || '', price: formatCentsForInput(item.priceCents), duration: item.estimatedDuration ? String(item.estimatedDuration) : '', included: includedToText(item.includedServices) }
      : { rooftopId: rooftopFilter !== 'all' ? rooftopFilter : rooftops[0]?.id || '', name: '', description: '', price: '', duration: '', included: '' })
  }

  const submit = async () => {
    if (!draft) return
    const errors: Record<string, string> = {}
    const name = draft.name.trim()
    if (!draft.id && !draft.rooftopId) errors.rooftopId = pt ? 'Selecione uma loja' : 'Choose a rooftop'
    if (!name) errors.name = pt ? 'Informe o nome' : 'Name is required'
    else if (name.length > 200) errors.name = pt ? 'O nome deve ter até 200 caracteres' : 'Name is too long'
    else if (packages.some(item => item.id !== draft.id && item.rooftop?.id === draft.rooftopId && item.name.toLowerCase() === name.toLowerCase())) errors.name = pt ? 'Esta loja já tem um pacote com esse nome' : 'This rooftop already has a package with this name'
    const priceCents = draft.price.trim() ? parseDollarsToCents(draft.price) : null
    if (!draft.price.trim()) errors.price = pt ? 'Informe o preço' : 'Price is required'
    else if (priceCents === null) errors.price = pt ? 'Informe o valor em reais e centavos, por exemplo, 89,95' : 'Enter dollars and cents, e.g. 89.95'
    let duration: number | null = null
    if (draft.duration.trim()) {
      duration = Number(draft.duration.trim())
      if (!Number.isInteger(duration) || duration < 1 || duration > 1440) errors.duration = pt ? 'Informe um número inteiro de minutos entre 1 e 1.440' : 'Minutes must be a whole number from 1 to 1440'
    }
    if (draft.description.length > 2000) errors.description = pt ? 'A descrição deve ter até 2.000 caracteres' : 'Description is too long'
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    setBusy(true); setFormError(null)
    const response = await saveServicePackage({ id: draft.id, rooftopId: draft.rooftopId, name, description: draft.description, priceCents: priceCents as number, estimatedDuration: duration, includedServices: textToIncluded(draft.included) })
    setBusy(false)
    if (!response.success) { setFormError(response.error); return }
    setNotice(pt ? `${draft.id ? 'Pacote salvo' : 'Pacote adicionado'}: ${name}` : draft.id ? `Saved ${name}` : `Added ${name}`)
    setDraft(null)
    await onReload()
  }

  const confirmDelete = async () => {
    if (!pending) return
    setBusy(true); setFormError(null)
    const response = await deleteServicePackage(pending.id)
    setBusy(false)
    if (!response.success) { setFormError(response.error); return }
    setNotice(pt ? `Pacote excluído: ${pending.name}` : `Deleted ${pending.name}`)
    setPending(null)
    await onReload()
  }

  return (
    <div className="space-y-4">
      {error && <Notice tone="bad">{error}</Notice>}
      {notice && <Notice tone="ok">{notice}</Notice>}
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {rooftops.length > 1 && (
          <Segmented
            label={pt ? 'Filtrar por loja' : 'Filter by rooftop'}
            value={rooftopFilter}
            onChange={setRooftopFilter}
            size="sm"
            options={[{ value: 'all', label: pt ? 'Todas' : 'All', count: packages.length }, ...rooftops.map(rooftop => ({ value: rooftop.id, label: rooftop.name, count: packages.filter(item => item.rooftop?.id === rooftop.id).length }))]}
          />
        )}
        <div className="relative min-w-0 sm:max-w-xs sm:flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className={cn('pl-9', TAP_INPUT)} value={search} onChange={event => setSearch(event.target.value)} placeholder={pt ? 'Pacote ou serviço incluído' : 'Package or included service'} aria-label={pt ? 'Buscar pacotes de serviço' : 'Search service packages'} />
        </div>
        <Track className="sm:ml-auto">
          <Pill variant="primary" className={TAP} disabled={rooftops.length === 0} onClick={() => open()}>
            <Plus />
            {pt ? 'Adicionar pacote' : 'Add package'}
          </Pill>
        </Track>
      </div>
      {rooftops.length === 0 && <Notice tone="warn">{pt ? 'Nenhuma loja disponível para novos pacotes.' : 'No rooftop available for new packages'}</Notice>}

      {visible.length === 0 ? (
        <Panel><EmptyRow>{packages.length === 0 ? (pt ? 'Nenhum pacote de serviço cadastrado' : 'No service packages yet') : (pt ? 'Nenhum pacote encontrado' : 'No packages match')}</EmptyRow></Panel>
      ) : (
        <DeskTable aria-label={pt ? 'Pacotes de serviço' : 'Service packages'}>
          <thead>
            <tr>
              <Th>{pt ? 'Pacote' : 'Package'}</Th>
              {rooftops.length > 1 && <Th priority={2}>{pt ? 'Loja' : 'Rooftop'}</Th>}
              <Th priority={3}>{pt ? 'Itens incluídos' : 'Included'}</Th>
              <Th align="right" priority={2}>{pt ? 'Duração' : 'Duration'}</Th>
              <Th align="right">{pt ? 'Preço' : 'Price'}</Th>
              <Th align="right"><span className="sr-only">{pt ? 'Ações' : 'Actions'}</span></Th>
            </tr>
          </thead>
          <tbody>
            {visible.map(item => {
              const included = Array.isArray(item.includedServices) ? item.includedServices : []
              return (
                <Tr key={item.id}>
                  <Td className="max-w-0 min-w-[9rem]">
                    <span className="block truncate font-medium text-foreground">{item.name}</span>
                    {item.description && <span className="block truncate text-xs text-muted-foreground">{item.description}</span>}
                    <span className="block truncate text-xs text-muted-foreground md:hidden">
                      {[formatDuration(item.estimatedDuration), rooftops.length > 1 ? item.rooftop?.name : null].filter(Boolean).join(' · ')}
                    </span>
                  </Td>
                  {rooftops.length > 1 && <Td priority={2} className="text-muted-foreground">{item.rooftop?.name || (pt ? 'Nenhuma' : 'None')}</Td>}
                  <Td priority={3} className="max-w-[16rem] text-muted-foreground">
                    <span className="line-clamp-2">{included.length ? included.map(service => service.service).join(', ') : (pt ? 'Nenhum' : 'None')}</span>
                  </Td>
                  <Td align="right" priority={2} className="whitespace-nowrap text-muted-foreground">{formatDuration(item.estimatedDuration) || ''}</Td>
                  <Td align="right"><Figure size="sm">{money.format(item.priceCents / 100)}</Figure></Td>
                  <Td align="right" className="w-px whitespace-nowrap">
                    <div className="inline-flex gap-1">
                      <Pill size="sm" className={TAP_SM} onClick={() => open(item)}>
                        <Pencil />
                        {pt ? 'Editar' : 'Edit'}
                      </Pill>
                      <Pill size="sm" variant="plain" className={cn(TAP_SM, 'max-sm:w-11')} aria-label={pt ? `Excluir ${item.name}` : `Delete ${item.name}`} onClick={() => { setFormError(null); setPending(item) }}>
                        <Trash2 />
                      </Pill>
                    </div>
                  </Td>
                </Tr>
              )
            })}
          </tbody>
        </DeskTable>
      )}

      <FormDialog
        open={draft !== null}
        title={draft?.id ? 'Edit service package' : 'Add service package'}
        busy={busy}
        error={formError}
        onSubmit={submit}
        onOpenChange={value => { if (!value) setDraft(null) }}
        wide
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {!draft?.id && rooftops.length > 1 && (
            <Field id="package-rooftop" label="Rooftop" error={fieldErrors.rooftopId} className="sm:col-span-2">
              <Select value={draft?.rooftopId || ''} onValueChange={value => setDraft(current => current && { ...current, rooftopId: value })}>
                <SelectTrigger id="package-rooftop" className={TAP_INPUT}><SelectValue placeholder={pt ? 'Selecione uma loja' : 'Select rooftop'} /></SelectTrigger>
                <SelectContent>{rooftops.map(rooftop => <SelectItem key={rooftop.id} value={rooftop.id}>{rooftop.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
          <Field id="package-name" label="Name" error={fieldErrors.name} className="sm:col-span-2">
            <Input id="package-name" className={TAP_INPUT} maxLength={200} value={draft?.name || ''} aria-invalid={Boolean(fieldErrors.name)} onChange={event => setDraft(current => current && { ...current, name: event.target.value })} />
          </Field>
          <Field id="package-price" label="Price" error={fieldErrors.price}>
            <Input id="package-price" className={TAP_INPUT} inputMode="decimal" placeholder="$89.95" value={draft?.price || ''} aria-invalid={Boolean(fieldErrors.price)} onChange={event => setDraft(current => current && { ...current, price: event.target.value })} />
          </Field>
          <Field id="package-duration" label="Duration (minutes)" error={fieldErrors.duration}>
            <Input id="package-duration" className={TAP_INPUT} inputMode="numeric" value={draft?.duration || ''} aria-invalid={Boolean(fieldErrors.duration)} onChange={event => setDraft(current => current && { ...current, duration: event.target.value })} />
          </Field>
          <Field id="package-description" label="Description" error={fieldErrors.description} className="sm:col-span-2">
            <Textarea id="package-description" rows={3} maxLength={2000} value={draft?.description || ''} onChange={event => setDraft(current => current && { ...current, description: event.target.value })} />
          </Field>
          <Field id="package-included" label="Included services" hint="One per line. Service: detail" className="sm:col-span-2">
            <Textarea id="package-included" rows={4} value={draft?.included || ''} onChange={event => setDraft(current => current && { ...current, included: event.target.value })} />
          </Field>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={pending !== null}
        title={`Delete ${pending?.name || 'package'}?`}
        description="It is removed from the storefront service menu."
        confirmLabel="Delete"
        busy={busy}
        error={formError}
        onConfirm={confirmDelete}
        onOpenChange={value => { if (!value) { setPending(null); setFormError(null) } }}
      />
    </div>
  )
}
