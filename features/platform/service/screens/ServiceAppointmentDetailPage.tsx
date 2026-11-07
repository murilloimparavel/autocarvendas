import { getServiceAppointmentDetail, getServiceCurrencyCode } from '../actions'
import { ServiceAppointmentDetailPageClient } from './ServiceAppointmentDetailPageClient'
import { getDealershipTimeZone } from '../../lib/dealershipTimeZone'

export async function ServiceAppointmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [response, timeZone, currencyCode] = await Promise.all([getServiceAppointmentDetail(id), getDealershipTimeZone(), getServiceCurrencyCode()])

  return (
    <ServiceAppointmentDetailPageClient
      id={id}
      initialAppointment={response.success ? response.data : null}
      initialError={response.success ? null : response.error}
      timeZone={timeZone}
      currencyCode={currencyCode}
    />
  )
}

export default ServiceAppointmentDetailPage
