import { getPurchaseOrders, getPartsCurrencyCode } from '../actions'
import { PurchaseOrdersPageClient } from './PurchaseOrdersPageClient'
import { getDealershipTimeZone } from '../../lib/dealershipTimeZone'

export async function PurchaseOrdersPage() {
  const [response, timeZone, currencyCode] = await Promise.all([getPurchaseOrders(), getDealershipTimeZone(), getPartsCurrencyCode()])

  return (
    <PurchaseOrdersPageClient
      initialOrders={response.success ? response.data.partsPurchaseOrders || [] : []}
      initialParts={response.success ? response.data.partsInventories || [] : []}
      initialRooftops={response.success ? response.data.rooftops || [] : []}
      initialError={response.success ? null : response.error}
      timeZone={timeZone}
      currencyCode={currencyCode}
    />
  )
}

export default PurchaseOrdersPage
