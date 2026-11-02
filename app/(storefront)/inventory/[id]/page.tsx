import type { Metadata } from 'next'

import { loadStorefrontBusiness } from '@/features/storefront/lib/data/storefront-business'
import { vehicleMetadata } from '@/features/storefront/lib/seo'
import { loadVehicleDetail } from '@/features/storefront/lib/data/vehicle-detail'
import { vehicleTitle } from '@/features/storefront/lib/format'
import { VehicleDetailPage } from '@/features/storefront/screens/VehicleDetailPage'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const result = await loadVehicleDetail(id)
  if (result.status === 'not-found') return { title: 'Vehicle not found', robots: { index: false, follow: true } }
  if (result.status === 'unlisted') return { title: vehicleTitle(result.vehicle), robots: { index: false, follow: true } }
  if (result.status !== 'available') return { title: 'Vehicle' }
  const settings = await loadStorefrontBusiness()
  return settings.status === 'ready' ? vehicleMetadata(settings.business, result.vehicle) : { title: vehicleTitle(result.vehicle) }
}

export default async function Page({ params }: Props) {
  const { id } = await params
  return <VehicleDetailPage id={id} />
}
