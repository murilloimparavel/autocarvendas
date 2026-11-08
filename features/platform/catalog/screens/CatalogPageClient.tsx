'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { Attention, DeskHeader, DeskSection, DeskTable, Pill, Segmented, Status, Td, Th, Tr } from '@/features/platform/components/desk'
import { type CatalogData, getCatalogData } from '../actions'
import { LeadRoutingPanel } from '../components/LeadRoutingPanel'
import { MakesModelsPanel } from '../components/MakesModelsPanel'
import { ServicePackagesPanel } from '../components/ServicePackagesPanel'
import { TAP } from '../components/formKit'
import { countLabel } from '@/features/platform/lib/format'
import { useLocale } from '@/features/i18n/LocaleProvider'

export type CatalogTab = 'makes' | 'services' | 'routing'

export function CatalogPageClient({ initialData, initialTab }: { initialData: CatalogData; initialTab: CatalogTab }) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const [data, setData] = useState(initialData)
  const [tab, setTab] = useState<CatalogTab>(initialTab)
  const [loading, setLoading] = useState(false)

  const reload = async () => {
    setLoading(true)
    try { setData(await getCatalogData()) } finally { setLoading(false) }
  }

  const changeTab = (next: CatalogTab) => {
    setTab(next)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', next)
    window.history.replaceState(null, '', url)
  }

  const modelCount = data.makes.data.reduce((total, make) => total + make.modelsCount, 0)
  const activeRules = data.routingRules.data.filter(rule => rule.active).length
  const anyError = data.makes.error || data.servicePackages.error || data.routingRules.error

  // Needs you: stock the catalog doesn't know, routing gaps, and makes with nothing under them.
  const catalogPairs = new Set(data.makes.data.flatMap(make => make.models.map(model => `${make.name.trim().toLowerCase()}|${model.name.trim().toLowerCase()}`)))
  const missingPairs = data.inventoryPairs.filter(pair => !catalogPairs.has(`${pair.make.trim().toLowerCase()}|${pair.model.trim().toLowerCase()}`))
  const unassignedRules = data.routingRules.data.filter(rule => !rule.assignee?.id)
  const emptyMakes = data.makes.data.filter(make => make.modelsCount === 0)
  const queue: Array<{ key: string; what: string; detail: string; status: string; tab: CatalogTab; stale?: boolean }> = [
    ...(missingPairs.length ? [{ key: 'pairs', what: `${missingPairs.length} inventory ${missingPairs.length === 1 ? 'model' : 'models'} not in catalog`, detail: `${missingPairs.reduce((total, pair) => total + pair.units, 0)} units on the lot`, status: 'Not in catalog', tab: 'makes' as const }] : []),
    ...(!data.routingRules.error && activeRules === 0 ? [{ key: 'routing', what: 'No active lead routing rule', detail: 'New leads are not assigned', status: 'Not routed', tab: 'routing' as const, stale: true }] : []),
    ...(unassignedRules.length ? [{ key: 'assignee', what: `${unassignedRules.length} routing ${unassignedRules.length === 1 ? 'rule has' : 'rules have'} no assignee`, detail: unassignedRules.map(rule => rule.name).join(', '), status: 'No assignee', tab: 'routing' as const }] : []),
    ...(emptyMakes.length ? [{ key: 'empty', what: `${emptyMakes.length} ${emptyMakes.length === 1 ? 'make has' : 'makes have'} no models`, detail: emptyMakes.map(make => make.name).join(', '), status: 'No models', tab: 'makes' as const }] : []),
  ]

  const header = (
    <DeskHeader
      title={pt ? 'Catálogo' : 'Catalog'}
      status={anyError ? (pt ? 'Parcialmente indisponível' : 'Partly unavailable') : modelCount === 0 ? (pt ? 'Sem modelos' : 'No models') : activeRules === 0 ? (pt ? 'Sem distribuição ativa' : 'No active routing') : (pt ? 'Pronto' : 'Ready')}
      meta={`${anyError ? 'Partly unavailable' : modelCount === 0 ? 'No models' : activeRules === 0 ? 'No active routing' : 'Ready'} · ${countLabel(data.makes.data.length, 'make')} · ${countLabel(modelCount, 'model')} · ${countLabel(data.servicePackages.data.length, 'service package')} · ${countLabel(activeRules, 'active routing rule')}`}
      actions={
        <Pill variant="plain" className={TAP} onClick={reload} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : undefined} />
          {pt ? 'Atualizar' : 'Refresh'}
        </Pill>
      }
    />
  )

  return (
    <PageContainer
      title={pt ? 'Catálogo' : 'Catalog'}
      header={header}
      breadcrumbs={[
        { type: 'link', label: pt ? 'Painel' : 'Dashboard', href: basePath },
        { type: 'page', label: pt ? 'Plataforma' : 'Platform' },
        { type: 'page', label: pt ? 'Catálogo' : 'Catalog' },
      ]}
    >
      <div className="min-w-0 max-w-full space-y-4 px-4 pb-24 md:px-6">
        {queue.length > 0 && (
          <DeskSection title={pt ? 'Ações necessárias' : 'Needs you'} count={queue.length} id="catalog-needs-you" className="pb-4">
            <DeskTable aria-labelledby="catalog-needs-you">
              <thead>
                <tr>
                  <Th>{pt ? 'Pendente' : 'Waiting'}</Th>
                  <Th>{pt ? 'Situação' : 'Status'}</Th>
                  <Th align="right"><span className="sr-only">Action</span></Th>
                </tr>
              </thead>
              <tbody>
                {queue.map(item => (
                  <Tr key={item.key}>
                    <Td className="max-w-0 min-w-[10rem]">
                      <span className="block truncate font-medium text-foreground">{item.what}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
                    </Td>
                    <Td>{item.stale ? <Attention>{item.status}</Attention> : <Status tone="warn">{item.status}</Status>}</Td>
                    <Td align="right" className="w-px"><Pill size="sm" className={TAP} onClick={() => changeTab(item.tab)}>{pt ? 'Abrir' : 'Open'}</Pill></Td>
                  </Tr>
                ))}
              </tbody>
            </DeskTable>
          </DeskSection>
        )}

        <Segmented<CatalogTab>
          label={pt ? 'Seção do catálogo' : 'Catalog section'}
          value={tab}
          onChange={changeTab}
          options={[
            { value: 'makes', label: pt ? 'Marcas e modelos' : 'Makes and models', count: data.makes.data.length, tone: data.makes.error ? 'bad' : modelCount === 0 ? 'warn' : undefined },
            { value: 'services', label: pt ? 'Pacotes de serviço' : 'Service packages', count: data.servicePackages.data.length, tone: data.servicePackages.error ? 'bad' : undefined },
            { value: 'routing', label: pt ? 'Distribuição de oportunidades' : 'Lead routing', count: data.routingRules.data.length, tone: data.routingRules.error ? 'bad' : activeRules === 0 ? 'warn' : undefined },
          ]}
        />
        {tab === 'makes' && <MakesModelsPanel makes={data.makes.data} inventoryPairs={data.inventoryPairs} error={data.makes.error} onReload={reload} />}
        {tab === 'services' && <ServicePackagesPanel packages={data.servicePackages.data} rooftops={data.rooftops} currencyCode={data.currencyCode} error={data.servicePackages.error} onReload={reload} />}
        {tab === 'routing' && <LeadRoutingPanel rules={data.routingRules.data} rooftops={data.rooftops} error={data.routingRules.error} onReload={reload} />}
      </div>
    </PageContainer>
  )
}
