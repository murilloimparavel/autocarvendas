import { getDealershipTimeZone } from '@/features/platform/lib/dealershipTimeZone'
import { getDealDeskWorkspace } from '../actions'
import { DealListPageClient } from './DealListPageClient'

export async function DealListPage() {
  const [response, timeZone] = await Promise.all([getDealDeskWorkspace('all'), getDealershipTimeZone()])

  return (
    <DealListPageClient
      initialDeals={response.success ? response.data.dealDeskWorkspace.deals || [] : null}
      initialError={response.success ? null : response.error}
      timeZone={timeZone}
    />
  )
}

export default DealListPage
