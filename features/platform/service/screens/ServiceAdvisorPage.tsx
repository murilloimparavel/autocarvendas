import { getFixedOpsWorkspace, getServiceCurrencyCode } from '../actions'
import { ServiceAdvisorPageClient } from './ServiceAdvisorPageClient'
import { getDealershipTimeZone } from '../../lib/dealershipTimeZone'

export async function ServiceAdvisorPage() {
  const [response, timeZone, currencyCode] = await Promise.all([getFixedOpsWorkspace(), getDealershipTimeZone(), getServiceCurrencyCode()])

  return (
    <ServiceAdvisorPageClient
      initialWorkspace={response.success ? response.data.fixedOpsWorkspace : null}
      initialError={response.success ? null : response.error}
      timeZone={timeZone}
      currencyCode={currencyCode}
    />
  )
}

export default ServiceAdvisorPage
