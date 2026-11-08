'use client'

import { useMemo, useState } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DeskSection, DeskTable, Figure, Notice, Panel, Pill, Segmented, Status, Td, Th, Tr, Track } from '@/features/platform/components/desk'
import { cn } from '@/lib/utils'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { type CatalogMake, type CatalogModel, type InventoryPair, addInventoryPairs, deleteMake, deleteModel, saveMake, saveModel } from '../actions'
import { ConfirmDialog, EmptyRow, Field, FormDialog, TAP, TAP_INPUT, TAP_SM } from './formKit'

export const BODY_STYLES = [
  { value: 'sedan', label: 'Sedan' },
  { value: 'suv', label: 'SUV' },
  { value: 'truck', label: 'Truck' },
  { value: 'coupe', label: 'Coupe' },
  { value: 'hatchback', label: 'Hatchback' },
  { value: 'convertible', label: 'Convertible' },
  { value: 'wagon', label: 'Wagon' },
  { value: 'van', label: 'Van' },
  { value: 'minivan', label: 'Minivan' },
]
const bodyStyleLabel = (value: string | null, pt = false) => {
  const label = BODY_STYLES.find(style => style.value === value)?.label || null
  if (!pt || !label) return label
  const labels: Record<string, string> = { Sedan: 'Sedã', Truck: 'Picape', Coupe: 'Cupê', Hatchback: 'Hatch', Convertible: 'Conversível', Wagon: 'Perua', Van: 'Van', Minivan: 'Minivan' }
  return labels[label] || label
}

type MakeFilter = 'all' | 'with-models' | 'no-models'
type MakeDraft = { id?: string; name: string }
type ModelDraft = { id?: string; makeId: string; name: string; bodyStyle: string; baseYear: string }
type Pending = { kind: 'make'; make: CatalogMake } | { kind: 'model'; model: CatalogModel }

const pairKey = (make: string, model: string) => `${make.trim().toLowerCase()}|${model.trim().toLowerCase()}`

export function MakesModelsPanel({
  makes,
  inventoryPairs,
  error,
  onReload,
}: {
  makes: CatalogMake[]
  inventoryPairs: InventoryPair[]
  error: string | null
  onReload: () => Promise<void>
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const [filter, setFilter] = useState<MakeFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(makes[0]?.id || null)
  const [makeDraft, setMakeDraft] = useState<MakeDraft | null>(null)
  const [modelDraft, setModelDraft] = useState<ModelDraft | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [addingPairs, setAddingPairs] = useState<string | null>(null)
  const [pairError, setPairError] = useState<string | null>(null)

  const counts = {
    all: makes.length,
    withModels: makes.filter(make => make.modelsCount > 0).length,
    noModels: makes.filter(make => make.modelsCount === 0).length,
  }
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return makes
      .filter(make => filter === 'all' || (filter === 'with-models' ? make.modelsCount > 0 : make.modelsCount === 0))
      .filter(make => !term || make.name.toLowerCase().includes(term) || make.models.some(model => model.name.toLowerCase().includes(term)))
  }, [makes, filter, search])
  const selected = makes.find(make => make.id === selectedId) || null

  const catalogPairs = useMemo(() => new Set(makes.flatMap(make => make.models.map(model => pairKey(make.name, model.name)))), [makes])
  const missingPairs = inventoryPairs.filter(pair => !catalogPairs.has(pairKey(pair.make, pair.model)))

  const closeForms = () => { setMakeDraft(null); setModelDraft(null); setFieldErrors({}); setFormError(null) }

  const submitMake = async () => {
    if (!makeDraft) return
    const name = makeDraft.name.trim()
    const errors: Record<string, string> = {}
    if (!name) errors.name = pt ? 'Informe o nome da marca' : 'Name is required'
    else if (name.length > 100) errors.name = pt ? 'O nome deve ter até 100 caracteres' : 'Name is too long'
    else if (makes.some(make => make.id !== makeDraft.id && make.name.toLowerCase() === name.toLowerCase())) errors.name = pt ? 'Esta marca já está cadastrada' : 'This make already exists'
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    setBusy(true); setFormError(null)
    const response = await saveMake({ id: makeDraft.id, name })
    setBusy(false)
    if (!response.success) { setFormError(response.error); return }
    setNotice(pt ? (makeDraft.id ? `Marca renomeada para ${name}` : `Marca adicionada: ${name}`) : makeDraft.id ? `Make renamed to ${name}` : `Added ${name}`)
    closeForms()
    await onReload()
  }

  const submitModel = async () => {
    if (!modelDraft) return
    const name = modelDraft.name.trim()
    const make = makes.find(item => item.id === modelDraft.makeId)
    const errors: Record<string, string> = {}
    if (!make) errors.makeId = pt ? 'Selecione uma marca' : 'Choose a make'
    if (!name) errors.name = pt ? 'Informe o nome do modelo' : 'Name is required'
    else if (name.length > 100) errors.name = pt ? 'O nome deve ter até 100 caracteres' : 'Name is too long'
    else if (make?.models.some(model => model.id !== modelDraft.id && model.name.toLowerCase() === name.toLowerCase())) errors.name = pt ? `${make.name} já tem esse modelo cadastrado` : `${make.name} already has this model`
    let baseYear: number | null = null
    if (modelDraft.baseYear.trim()) {
      baseYear = Number(modelDraft.baseYear.trim())
      const maxYear = new Date().getFullYear() + 2
      if (!Number.isInteger(baseYear) || baseYear < 1900 || baseYear > maxYear) errors.baseYear = pt ? `O ano deve estar entre 1900 e ${maxYear}` : `Year must be 1900 to ${maxYear}`
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    setBusy(true); setFormError(null)
    const response = await saveModel({ id: modelDraft.id, makeId: modelDraft.makeId, name, bodyStyle: modelDraft.bodyStyle === 'none' ? null : modelDraft.bodyStyle, baseYear })
    setBusy(false)
    if (!response.success) { setFormError(response.error); return }
    setNotice(pt ? (modelDraft.id ? `Modelo salvo: ${name}` : `Modelo adicionado: ${make?.name} ${name}`) : modelDraft.id ? `Saved ${name}` : `Added ${make?.name} ${name}`)
    setSelectedId(modelDraft.makeId)
    closeForms()
    await onReload()
  }

  const confirmDelete = async () => {
    if (!pending) return
    setBusy(true); setFormError(null)
    const response = pending.kind === 'make' ? await deleteMake(pending.make.id) : await deleteModel(pending.model.id)
    setBusy(false)
    if (!response.success) { setFormError(response.error); return }
    setNotice(pt ? (pending.kind === 'make' ? `Marca excluída: ${pending.make.name}` : `Modelo excluído: ${pending.model.name}`) : pending.kind === 'make' ? `Deleted ${pending.make.name}` : `Deleted ${pending.model.name}`)
    if (pending.kind === 'make' && selectedId === pending.make.id) setSelectedId(null)
    setPending(null)
    await onReload()
  }

  const addPairs = async (pairs: InventoryPair[], key: string) => {
    setAddingPairs(key); setNotice(null); setPairError(null)
    const response = await addInventoryPairs(pairs.map(pair => ({ make: pair.make, model: pair.model })))
    setAddingPairs(null)
    if (!response.success) { setPairError(response.error); return }
    setNotice(pt ? `${response.added ?? 0} ${response.added === 1 ? 'modelo adicionado' : 'modelos adicionados'} a partir do estoque` : `Added ${response.added ?? 0} ${response.added === 1 ? 'model' : 'models'} from inventory`)
    await onReload()
  }

  return (
    <div className="space-y-4">
      {error && <Notice tone="bad">{error}</Notice>}
      {notice && <Notice tone="ok">{notice}</Notice>}

      {missingPairs.length > 0 && (
        <DeskSection
          title={pt ? 'No estoque, fora do catálogo' : 'In inventory, not in catalog'}
          count={missingPairs.length}
          actions={
            <Track>
              <Pill size="sm" variant="primary" className={TAP_SM} disabled={addingPairs !== null} onClick={() => addPairs(missingPairs, 'all')}>
                <Plus />
                {addingPairs === 'all' ? (pt ? 'Adicionando…' : 'Adding…') : (pt ? 'Adicionar todos' : 'Add all')}
              </Pill>
            </Track>
          }
        >
          {pairError && <Notice tone="bad" className="mb-3">{pairError}</Notice>}
          <DeskTable aria-label={pt ? 'Modelos do estoque fora do catálogo' : 'Inventory models missing from catalog'}>
            <thead>
              <tr>
                <Th>{pt ? 'Marca e modelo' : 'Make and model'}</Th>
                <Th>{pt ? 'Situação' : 'Status'}</Th>
                <Th align="right">{pt ? 'Unidades' : 'Units'}</Th>
                <Th align="right"><span className="sr-only">Action</span></Th>
              </tr>
            </thead>
            <tbody>
              {missingPairs.map(pair => {
                const key = pairKey(pair.make, pair.model)
                return (
                  <Tr key={key}>
                    <Td className="font-medium text-foreground">{pair.make} {pair.model}</Td>
                    <Td><Status tone="warn">{pt ? 'Fora do catálogo' : 'Not in catalog'}</Status></Td>
                    <Td align="right"><Figure size="sm">{pair.units}</Figure></Td>
                    <Td align="right" className="w-px whitespace-nowrap">
                      <Pill size="sm" className={TAP_SM} disabled={addingPairs !== null} onClick={() => addPairs([pair], key)} aria-label={`Add ${pair.make} ${pair.model}`}>
                        <Plus />
                        {addingPairs === key ? (pt ? 'Adicionando…' : 'Adding…') : (pt ? 'Adicionar' : 'Add')}
                      </Pill>
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </DeskTable>
        </DeskSection>
      )}

      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Segmented<MakeFilter>
          label={pt ? 'Filtrar marcas' : 'Filter makes'}
          value={filter}
          onChange={setFilter}
          size="sm"
          options={[
            { value: 'all', label: pt ? 'Todas' : 'All', count: counts.all },
            { value: 'with-models', label: pt ? 'Com modelos' : 'With models', count: counts.withModels },
            { value: 'no-models', label: pt ? 'Sem modelos' : 'No models', count: counts.noModels, tone: counts.noModels ? 'warn' : undefined },
          ]}
        />
        <div className="relative min-w-0 sm:max-w-xs sm:flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className={cn('pl-9', TAP_INPUT)} value={search} onChange={event => setSearch(event.target.value)} placeholder={pt ? 'Marca ou modelo' : 'Make or model'} aria-label={pt ? 'Buscar marcas e modelos' : 'Search makes and models'} />
        </div>
        <Track className="sm:ml-auto">
          <Pill variant="primary" className={TAP} onClick={() => { closeForms(); setMakeDraft({ name: '' }) }}>
            <Plus />
            {pt ? 'Adicionar marca' : 'Add make'}
          </Pill>
        </Track>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {visible.length === 0 ? (
          <Panel><EmptyRow>{makes.length === 0 ? (pt ? 'Nenhuma marca cadastrada' : 'No makes yet') : (pt ? 'Nenhuma marca encontrada' : 'No makes match')}</EmptyRow></Panel>
        ) : (
          <DeskTable aria-label={pt ? 'Marcas' : 'Makes'}>
            <thead>
              <tr>
                <Th>{pt ? 'Marca' : 'Make'}</Th>
                <Th>{pt ? 'Situação' : 'Status'}</Th>
                <Th align="right">{pt ? 'Modelos' : 'Models'}</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map(make => (
                <Tr key={make.id} className={cn(make.id === selectedId && 'bg-muted/60 hover:bg-muted/60')}>
                  <Td className="p-0 first:pl-0">
                    <button
                      type="button"
                      onClick={() => setSelectedId(make.id)}
                      aria-pressed={make.id === selectedId}
                      className="flex min-h-11 w-full min-w-0 items-center px-4 text-left font-medium text-foreground hover:underline"
                    >
                      {make.name}
                    </button>
                  </Td>
                  <Td>{make.modelsCount > 0 ? <Status tone="ok">{pt ? 'Com modelos' : 'Has models'}</Status> : <Status tone="warn">{pt ? 'Sem modelos' : 'No models'}</Status>}</Td>
                  <Td align="right">{make.modelsCount}</Td>
                </Tr>
              ))}
            </tbody>
          </DeskTable>
        )}

        <Panel className="overflow-hidden">
          {!selected ? (
            <EmptyRow>{pt ? 'Selecione uma marca' : 'Select a make'}</EmptyRow>
          ) : (
            <div>
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <h3 className="flex min-w-0 items-baseline gap-2 text-base font-semibold">
                  {selected.name}
                  <span className="text-[13px] font-normal tabular-nums text-muted-foreground">{selected.modelsCount} {selected.modelsCount === 1 ? 'model' : 'models'}</span>
                </h3>
                <Track>
                  <Pill size="sm" className={TAP_SM} onClick={() => { closeForms(); setMakeDraft({ id: selected.id, name: selected.name }) }}>
                    <Pencil />
                    {pt ? 'Renomear' : 'Rename'}
                  </Pill>
                  <Pill
                    size="sm"
                    className={TAP_SM}
                    disabled={selected.modelsCount > 0}
                    title={selected.modelsCount > 0 ? (pt ? 'Exclua os modelos primeiro' : 'Delete its models first') : undefined}
                    onClick={() => { setFormError(null); setPending({ kind: 'make', make: selected }) }}
                  >
                    <Trash2 />
                    {pt ? 'Excluir' : 'Delete'}
                  </Pill>
                  <Pill size="sm" variant="primary" className={TAP_SM} onClick={() => { closeForms(); setModelDraft({ makeId: selected.id, name: '', bodyStyle: 'none', baseYear: '' }) }}>
                    <Plus />
                    {pt ? 'Adicionar modelo' : 'Add model'}
                  </Pill>
                </Track>
              </div>
              {selected.modelsCount > 0 && <p className="border-b px-4 py-2 text-xs text-muted-foreground">{pt ? 'A marca só pode ser excluída quando não tiver modelos.' : 'Delete is available once the make has no models.'}</p>}
              {selected.models.length === 0 ? (
                <EmptyRow>{pt ? 'Nenhum modelo' : 'No models'}</EmptyRow>
              ) : (
                <table className="w-full border-collapse text-[13px]" aria-label={`${selected.name} models`}>
                  <thead>
                    <tr>
                      <Th>{pt ? 'Modelo' : 'Model'}</Th>
                      <Th priority={2}>{pt ? 'Categoria' : 'Body style'}</Th>
                      <Th align="right" priority={2}>{pt ? 'A partir do ano' : 'Since'}</Th>
                      <Th align="right"><span className="sr-only">{pt ? 'Ações' : 'Actions'}</span></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.models.map(model => (
                      <Tr key={model.id}>
                        <Td className="max-w-0 min-w-[7rem]">
                          <span className="block truncate font-medium text-foreground">{model.name}</span>
                          <span className="block truncate text-xs text-muted-foreground md:hidden">{[bodyStyleLabel(model.bodyStyle, pt), model.baseYear ? `${pt ? 'A partir de' : 'Since'} ${model.baseYear}` : null].filter(Boolean).join(' · ') || (pt ? 'Sem categoria' : 'No body style')}</span>
                        </Td>
                        <Td priority={2} className="text-muted-foreground">{bodyStyleLabel(model.bodyStyle, pt) || (pt ? 'Não informada' : 'None')}</Td>
                        <Td align="right" priority={2} className="text-muted-foreground">{model.baseYear || ''}</Td>
                        <Td align="right" className="w-px whitespace-nowrap">
                          <div className="inline-flex gap-1">
                            <Pill size="sm" className={TAP_SM} aria-label={`Edit ${model.name}`} onClick={() => { closeForms(); setModelDraft({ id: model.id, makeId: selected.id, name: model.name, bodyStyle: model.bodyStyle || 'none', baseYear: model.baseYear ? String(model.baseYear) : '' }) }}>
                              <Pencil />
                              {pt ? 'Editar' : 'Edit'}
                            </Pill>
                            <Pill size="sm" variant="plain" className={cn(TAP_SM, 'max-sm:w-11')} aria-label={`Delete ${model.name}`} onClick={() => { setFormError(null); setPending({ kind: 'model', model }) }}>
                              <Trash2 />
                            </Pill>
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </Panel>
      </div>

      <FormDialog
        open={makeDraft !== null}
        title={makeDraft?.id ? (pt ? 'Renomear marca' : 'Rename make') : (pt ? 'Adicionar marca' : 'Add make')}
        busy={busy}
        error={formError}
        onSubmit={submitMake}
        onOpenChange={open => { if (!open) closeForms() }}
      >
        <Field id="make-name" label={pt ? 'Nome' : 'Name'} error={fieldErrors.name}>
          <Input id="make-name" className={TAP_INPUT} autoFocus maxLength={100} value={makeDraft?.name || ''} aria-invalid={Boolean(fieldErrors.name)} onChange={event => setMakeDraft(draft => draft && { ...draft, name: event.target.value })} />
        </Field>
      </FormDialog>

      <FormDialog
        open={modelDraft !== null}
        title={modelDraft?.id ? (pt ? 'Editar modelo' : 'Edit model') : (pt ? 'Adicionar modelo' : 'Add model')}
        busy={busy}
        error={formError}
        onSubmit={submitModel}
        onOpenChange={open => { if (!open) closeForms() }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="model-make" label={pt ? 'Marca' : 'Make'} error={fieldErrors.makeId}>
            <Select value={modelDraft?.makeId || ''} onValueChange={value => setModelDraft(draft => draft && { ...draft, makeId: value })}>
              <SelectTrigger id="model-make" className={TAP_INPUT}><SelectValue placeholder={pt ? 'Selecione a marca' : 'Select make'} /></SelectTrigger>
              <SelectContent>{makes.map(make => <SelectItem key={make.id} value={make.id}>{make.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field id="model-name" label={pt ? 'Nome' : 'Name'} error={fieldErrors.name}>
            <Input id="model-name" className={TAP_INPUT} autoFocus maxLength={100} value={modelDraft?.name || ''} aria-invalid={Boolean(fieldErrors.name)} onChange={event => setModelDraft(draft => draft && { ...draft, name: event.target.value })} />
          </Field>
          <Field id="model-body" label={pt ? 'Categoria do veículo' : 'Body style'}>
            <Select value={modelDraft?.bodyStyle || 'none'} onValueChange={value => setModelDraft(draft => draft && { ...draft, bodyStyle: value })}>
              <SelectTrigger id="model-body" className={TAP_INPUT}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{pt ? 'Não informada' : 'None'}</SelectItem>
                {BODY_STYLES.map(style => <SelectItem key={style.value} value={style.value}>{bodyStyleLabel(style.value, pt)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field id="model-year" label={pt ? 'Ano inicial' : 'Base year'} error={fieldErrors.baseYear}>
            <Input id="model-year" className={TAP_INPUT} inputMode="numeric" maxLength={4} value={modelDraft?.baseYear || ''} aria-invalid={Boolean(fieldErrors.baseYear)} onChange={event => setModelDraft(draft => draft && { ...draft, baseYear: event.target.value })} />
          </Field>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === 'make' ? (pt ? `Excluir a marca ${pending.make.name}?` : `Delete ${pending.make.name}?`) : (pt ? `Excluir o modelo ${pending?.kind === 'model' ? pending.model.name : ''}?` : `Delete ${pending?.kind === 'model' ? pending.model.name : ''}?`)}
        confirmLabel={pt ? 'Excluir' : 'Delete'}
        busy={busy}
        error={formError}
        onConfirm={confirmDelete}
        onOpenChange={open => { if (!open) { setPending(null); setFormError(null) } }}
      />
    </div>
  )
}
