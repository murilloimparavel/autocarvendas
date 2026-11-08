import { getServiceOrderDetail, getServiceTaxRate, getServiceCurrencyCode } from '../actions'
import { ServiceOrderDetailPageClient } from './ServiceOrderDetailPageClient'
import { getDealershipTimeZone } from '../../lib/dealershipTimeZone'

export async function ServiceOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [response, timeZone, taxRateBps, currencyCode] = await Promise.all([getServiceOrderDetail(id), getDealershipTimeZone(), getServiceTaxRate(), getServiceCurrencyCode()])

  return (
    <ServiceOrderDetailPageClient
      id={id}
      initialOrder={response.success ? response.data : null}
      initialError={response.success ? null : response.error}
      timeZone={timeZone}
      taxRateBps={taxRateBps}
      currencyCode={currencyCode}
    />
  )
}

export default ServiceOrderDetailPage
