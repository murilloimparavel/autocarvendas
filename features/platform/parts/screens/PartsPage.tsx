import { getPartsCatalog, getPurchaseOrders, getPartsCurrencyCode } from '../actions'
import { PartsPageClient } from './PartsPageClient'

export async function PartsPage() {
  // Purchase orders feed the "POs to receive" queue; a failure there leaves the catalog usable.
  const [response, purchaseOrders, currencyCode] = await Promise.all([getPartsCatalog(), getPurchaseOrders(), getPartsCurrencyCode()])

  return (
    <PartsPageClient
      initialParts={response.success ? response.data.partsInventories || [] : []}
      initialRooftops={response.success ? response.data.rooftops || [] : []}
      initialError={response.success ? null : response.error}
      initialPurchaseOrders={purchaseOrders.success ? purchaseOrders.data.partsPurchaseOrders || [] : []}
      currencyCode={currencyCode}
    />
  )
}

export default PartsPage
