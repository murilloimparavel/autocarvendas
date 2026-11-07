import { getCrmViewer } from '@/features/platform/crm/actions'
import { getCustomer, getDuplicateCandidates, getCustomerCurrencyCode } from '../actions'
import { CustomerDetailPageClient } from './CustomerDetailPageClient'
import { getDealershipTimeZone } from '../../lib/dealershipTimeZone'

export async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [response, viewer, timeZone, currencyCode] = await Promise.all([getCustomer(id), getCrmViewer(), getDealershipTimeZone(), getCustomerCurrencyCode()])
  const customer = response.success ? response.data.customer : null
  const duplicates = customer?.status === 'active' ? await getDuplicateCandidates(customer.id) : null

  return (
    <CustomerDetailPageClient
      id={id}
      initialCustomer={customer}
      initialDuplicates={duplicates?.success ? duplicates.data.customerDuplicateCandidates : []}
      initialDuplicateError={duplicates && !duplicates.success ? duplicates.error : null}
      viewer={viewer}
      timeZone={timeZone}
      currencyCode={currencyCode}
      initialError={response.success ? (customer ? null : 'This customer was not found.') : response.error}
    />
  )
}

export default CustomerDetailPage
