import { getDealSetupOptions } from '../actions'
import { DealCreatePageClient } from './DealCreatePageClient'

export async function DealCreatePage({ searchParams }: { searchParams?: Promise<{ leadId?: string | string[]; tradeInId?: string | string[] }> }) {
  const [response, params] = await Promise.all([getDealSetupOptions(), searchParams ?? Promise.resolve({} as { leadId?: string | string[]; tradeInId?: string | string[] })])
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || ''

  return (
    <DealCreatePageClient
      initialVehicles={response.success ? response.data.vehicles : []}
      initialLeads={response.success ? response.data.leads : []}
      initialTradeIns={response.success ? response.data.tradeIns : []}
      initialDealDefaults={response.success ? response.data.dealDefaults : { salesTaxRateBps: 0, docFeeCents: 0 }}
      currencyCode={response.success ? response.data.currencyCode : 'USD'}
      initialError={response.success ? null : response.error}
      prefillLeadId={first(params.leadId)}
      prefillTradeInId={first(params.tradeInId)}
    />
  )
}

export default DealCreatePage
