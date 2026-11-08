import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'
import { getRequestLocale } from '@/features/i18n/server'
import { getDealershipStoreSettings } from '../actions'
import { StoreSettingsPageClient } from './StoreSettingsPageClient'

export async function StoreSettingsPage() {
  const response = await getDealershipStoreSettings()
  const pt = (await getRequestLocale()) === 'pt-BR'

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageBreadcrumbs
        items={[
          { type: 'link', label: pt ? 'Painel' : 'Dashboard', href: '/' },
          { type: 'page', label: pt ? 'Plataforma' : 'Platform' },
          { type: 'page', label: pt ? 'Configurações da loja' : 'Store Settings' },
        ]}
      />
      <StoreSettingsPageClient
        initialSettings={response.success ? response.data : null}
        initialError={response.success ? null : response.error}
      />
    </section>
  )
}

export default StoreSettingsPage
