import { getDeliveryWorkspace, getDeliveryCurrencyCode } from '../actions'
import { DeliveryDeskPageClient } from './DeliveryDeskPageClient'
import { getDealershipTimeZone } from '../../lib/dealershipTimeZone'

export async function DeliveryDeskPage() {
  const [response, timeZone, currencyCode] = await Promise.all([getDeliveryWorkspace(), getDealershipTimeZone(), getDeliveryCurrencyCode()])

  return (
    <DeliveryDeskPageClient
      initialWorkspace={response.success ? response.data.deliveryWorkspace : null}
      initialError={response.success ? null : response.error}
      timeZone={timeZone}
      currencyCode={currencyCode}
    />
  )
}

export default DeliveryDeskPage
