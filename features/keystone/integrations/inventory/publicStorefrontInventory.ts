import { storefrontRooftopSlug } from '../../tenantRecords'
import { activeReservationWhere } from '../../mutations/reservationHold'
import { assertCurrentInventoryApproval, assertPublishableInventory } from '../../lifecycle/inventoryPublication'

const MAX_CANDIDATES = 5_000
const PUBLIC_INVENTORY_UNAVAILABLE = 'Public inventory is currently unavailable.'

type PublicInventoryOptions = {
  id?: string
  where?: Record<string, any> | null
  orderBy?: Array<Record<string, 'asc' | 'desc'>> | null
  take?: number | null
  skip?: number | null
}

function readWhere(where: PublicInventoryOptions['where']) {
  const filters: Record<string, any> = {}
  const clauses = Array.isArray(where?.AND) ? where.AND : where ? [where] : []
  for (const clause of clauses) {
    if (!clause || typeof clause !== 'object' || Array.isArray(clause)) throw new Error('Invalid public inventory filter')
    for (const [key, rawValue] of Object.entries(clause as Record<string, any>)) {
      const value = rawValue as any
      if (key === 'status') {
        if (value?.equals !== 'available') filters.status = 'unavailable'
      } else if (key === 'make' || key === 'model') {
        const search = String(value?.contains || '').trim().toLocaleLowerCase()
        if (search) filters[key] = search
      } else if (key === 'OR') {
        if (!Array.isArray(value)) throw new Error('Invalid public inventory filter')
        const group: Array<{ field: string; search: string }> = []
        for (const option of value) {
          if (!option || typeof option !== 'object' || Array.isArray(option)) throw new Error('Invalid public inventory filter')
          for (const [field, condition] of Object.entries(option as Record<string, any>)) {
            if (!['make', 'model', 'trim'].includes(field)) throw new Error('Invalid public inventory filter')
            const search = String(condition?.contains || '').trim().toLocaleLowerCase()
            if (search) group.push({ field, search })
          }
        }
        if (group.length) filters.anyOf = [...(filters.anyOf || []), group]
      } else if (key === 'condition') {
        const condition = String(value?.equals || '').trim().toLocaleLowerCase()
        if (condition) filters.condition = condition
      } else if (key === 'year' || key === 'priceCents' || key === 'mileage') {
        const range: Record<string, number> = {}
        for (const [operator, raw] of Object.entries(value || {})) {
          if (!['gte', 'lte'].includes(operator)) throw new Error('Invalid public inventory range filter')
          const number = Number(raw)
          if (!Number.isSafeInteger(number) || number < 0) throw new Error('Invalid public inventory range value')
          range[operator] = number
        }
        if (Object.keys(range).length) filters[key] = range
      }
    }
  }
  return filters
}

function inRange(value: unknown, range: Record<string, number> | undefined) {
  if (!range) return true
  const number = Number(value)
  return Number.isFinite(number) && (range.gte == null || number >= range.gte) && (range.lte == null || number <= range.lte)
}

function matches(vehicle: any, filters: Record<string, any>) {
  if (filters.status === 'unavailable') return false
  if (filters.make && !String(vehicle.make || '').toLocaleLowerCase().includes(filters.make)) return false
  if (filters.model && !String(vehicle.model || '').toLocaleLowerCase().includes(filters.model)) return false
  if (filters.condition && String(vehicle.condition || '').toLocaleLowerCase() !== filters.condition) return false
  if (filters.anyOf?.some((group: Array<{ field: string; search: string }>) =>
    !group.some(({ field, search }) => String(vehicle[field] || '').toLocaleLowerCase().includes(search)))) return false
  return inRange(vehicle.year, filters.year) && inRange(vehicle.priceCents, filters.priceCents) && inRange(vehicle.mileage, filters.mileage)
}

function compare(a: any, b: any, orderBy: PublicInventoryOptions['orderBy']) {
  const order = Array.isArray(orderBy) ? orderBy.find(item => item && typeof item === 'object' && Object.keys(item).length) : undefined
  const [requestedField, requestedDirection] = order ? Object.entries(order)[0] : ['year', 'desc']
  const field = requestedField === 'priceCents' ? 'priceCents' : requestedField === 'mileage' ? 'mileage' : 'year'
  const direction = requestedDirection === 'asc' ? 1 : -1
  const left = a[field] == null ? (direction > 0 ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER) : Number(a[field])
  const right = b[field] == null ? (direction > 0 ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER) : Number(b[field])
  return (left - right) * direction || String(a.id).localeCompare(String(b.id))
}

export async function lockPublicInventoryRows(tx: any, rooftopId: string, dealerGroupId: string | null, candidates: any[]) {
  await tx.$queryRaw`SELECT "id" FROM "Rooftop" WHERE "id" = ${rooftopId} FOR SHARE`
  if (dealerGroupId) await tx.$queryRaw`SELECT "id" FROM "DealerGroup" WHERE "id" = ${dealerGroupId} FOR SHARE`
  const stockIds = candidates.map((stock: any) => String(stock.id)).sort()
  const vehicleIds = candidates.map((stock: any) => String(stock.vehicleId || stock.vehicle?.id || '')).filter(Boolean).sort()
  if (!stockIds.length) return
  await tx.$queryRaw`SELECT "id" FROM "InventoryStock" WHERE "id" = ANY(${stockIds}::text[]) FOR SHARE`
  if (vehicleIds.length) {
    await tx.$queryRaw`SELECT "id" FROM "Vehicle" WHERE "id" = ANY(${vehicleIds}::text[]) FOR SHARE`
    await tx.$queryRaw`SELECT "id" FROM "VehicleImage" WHERE "vehicle" = ANY(${vehicleIds}::text[]) FOR SHARE`
  }
}

export async function loadPublicInventoryImageUrls(sudo: any, imageIds: string[]) {
  const ids = [...new Set(imageIds.filter(Boolean))]
  if (!ids.length) return new Map<string, string | null>()
  const images = await sudo.query.VehicleImage.findMany({ where: { id: { in: ids } }, query: 'id image { url }' })
  return new Map(images.map((image: any) => [image.id, image.image?.url || null]))
}

async function queryPublicInventory(context: any, options: PublicInventoryOptions = {}) {
  const slug = await storefrontRooftopSlug(context)
  if (!slug) throw new Error(PUBLIC_INVENTORY_UNAVAILABLE)

  const sudo = context.sudo()
  return sudo.prisma.$transaction(async (tx: any) => {
    const rooftops = await tx.rooftop.findMany({
      where: { publicSlug: slug, status: 'active', dealerGroup: { is: { status: 'active' } } },
      select: { id: true, dealerGroupId: true },
      take: 2,
    })
    if (rooftops.length !== 1 || !rooftops[0].dealerGroupId) {
      throw new Error(PUBLIC_INVENTORY_UNAVAILABLE)
    }
    const rooftopId = rooftops[0].id
    const candidates = await tx.inventoryStock.findMany({
      where: {
        rooftopId,
        ...(options.id ? { vehicleId: options.id } : {}),
        reconStatus: 'completed',
        merchandisingStatus: 'approved',
        approvedRevisionHash: { not: '' },
        frontlineAt: { not: null },
        vehicle: { is: { status: 'available' } },
      },
      include: {
        rooftop: { include: { dealerGroup: true } },
        vehicle: { include: { images: true } },
        merchandisingVersions: { orderBy: { version: 'desc' }, take: 1 },
      },
      take: MAX_CANDIDATES + 1,
    })
    if (candidates.length > MAX_CANDIDATES) throw new Error('Public inventory validation capacity exceeded; refusing to emit an incomplete storefront projection.')

    await lockPublicInventoryRows(tx, rooftopId, rooftops[0].dealerGroupId, candidates)

    const approved = candidates.flatMap((stock: any) => {
      if (stock.rooftop?.status !== 'active' || stock.rooftop?.dealerGroup?.status !== 'active') return []
      try {
        assertPublishableInventory(stock)
        return [{ stock, vehicle: stock.vehicle }]
      } catch {
        return []
      }
    })
    const filters = readWhere(options.where)
    const matching = approved.map(({ vehicle }: any) => vehicle).filter((vehicle: any) => matches(vehicle, filters)).sort((a: any, b: any) => compare(a, b, options.orderBy))
    const skip = Math.max(0, Math.min(10_000, Number.isSafeInteger(options.skip) ? Number(options.skip) : 0))
    const take = Math.max(0, Math.min(100, Number.isSafeInteger(options.take) ? Number(options.take) : 50))
    const page = matching.slice(skip, skip + take)
    if (!page.length) return { items: [], totalCount: matching.length }

    // A unit held by a live reservation deposit stays listed (test drives and questions are still
    // welcome) but reads "reserved", so the storefront stops taking a second deposit.
    const reserved = new Set((await tx.paymentTransaction.findMany({
      where: { rooftopId, OR: page.map((vehicle: any) => activeReservationWhere(vehicle.id)) },
      select: { lead: { select: { interestedVehicleId: true } } },
    })).map((row: any) => row.lead?.interestedVehicleId).filter(Boolean))

    const imageIds = page.flatMap((vehicle: any) => (vehicle.images || []).map((image: any) => image.id))
    const imageUrlById = await loadPublicInventoryImageUrls(sudo, imageIds)
    return {
      totalCount: matching.length,
      items: page.map((vehicle: any) => ({
        id: vehicle.id,
        vin: vehicle.vin,
        stockNumber: vehicle.stockNumber,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim,
        exteriorColor: vehicle.exteriorColor,
        mileage: vehicle.mileage,
        price: vehicle.priceCents == null ? null : vehicle.priceCents / 100,
        status: reserved.has(vehicle.id) ? 'reserved' : vehicle.status,
        condition: vehicle.condition,
        features: vehicle.features,
        description: vehicle.description,
        images: (vehicle.images || []).map((image: any) => ({
          id: image.id,
          imagePath: image.imagePath,
          image: image.image_id ? { url: imageUrlById.get(image.id) || null } : null,
          isPrimary: image.isPrimary,
          sortOrder: image.sortOrder,
        })).sort((a: any, b: any) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
      })),
    }
  }, { isolationLevel: 'RepeatableRead', timeout: 30_000 })
}

export async function publicInventoryVehicles(_root: unknown, options: PublicInventoryOptions, context: any) {
  return queryPublicInventory(context, options)
}

export async function publicInventoryVehicle(_root: unknown, { id }: { id: string }, context: any) {
  const result = await queryPublicInventory(context, { id, take: 1 })
  return result.items[0] || null
}

export async function publicInventoryCount(_root: unknown, { where }: Pick<PublicInventoryOptions, 'where'>, context: any) {
  const result = await queryPublicInventory(context, { where, take: 0 })
  return result.totalCount
}


const CLOSED_LISTING_STATUSES = new Set(['pending', 'sold'])

/**
 * Read-only record of a unit that WAS publicly listed and has since gone pending or sold, so shared
 * links and cached search results land on a "Sale pending" / "Sold" page instead of a 404.
 *
 * The listing evidence is the same server-side gate the live storefront uses (current merchandising
 * approval whose revision hash matches the unit's content, completed recon, frontline), with only the
 * lot status relaxed to pending/sold. A unit that never passed that gate, or whose content changed
 * after approval, resolves to null. Price is withheld, and the VIN is withheld once sold.
 */
export async function publicInventoryVehicleRecord(_root: unknown, { id }: { id: string }, context: any) {
  const vehicleId = String(id || '').trim()
  if (!vehicleId) return null
  const slug = await storefrontRooftopSlug(context)
  if (!slug) throw new Error(PUBLIC_INVENTORY_UNAVAILABLE)

  const sudo = context.sudo()
  const rooftops = await sudo.prisma.rooftop.findMany({
    where: { publicSlug: slug, status: 'active', dealerGroup: { is: { status: 'active' } } },
    select: { id: true, dealerGroupId: true },
    take: 2,
  })
  if (rooftops.length !== 1 || !rooftops[0].dealerGroupId) throw new Error(PUBLIC_INVENTORY_UNAVAILABLE)

  const stocks = await sudo.prisma.inventoryStock.findMany({
    where: {
      rooftopId: rooftops[0].id,
      vehicleId,
      reconStatus: 'completed',
      merchandisingStatus: 'approved',
      approvedRevisionHash: { not: '' },
      frontlineAt: { not: null },
      vehicle: { is: { status: { in: [...CLOSED_LISTING_STATUSES] } } },
    },
    include: {
      vehicle: { include: { images: true } },
      merchandisingVersions: { orderBy: { version: 'desc' }, take: 1 },
    },
    take: 2,
  })
  if (stocks.length !== 1) return null
  const stock = stocks[0]
  const vehicle = stock.vehicle
  if (!vehicle || !CLOSED_LISTING_STATUSES.has(String(vehicle.status))) return null
  try {
    assertCurrentInventoryApproval(stock)
  } catch {
    return null
  }

  const imageUrlById = await loadPublicInventoryImageUrls(sudo, (vehicle.images || []).map((image: any) => image.id))
  const sold = vehicle.status === 'sold'
  return {
    id: vehicle.id,
    vin: sold ? null : vehicle.vin,
    stockNumber: vehicle.stockNumber,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    exteriorColor: vehicle.exteriorColor,
    mileage: vehicle.mileage,
    price: null,
    status: vehicle.status,
    condition: vehicle.condition,
    features: vehicle.features,
    description: vehicle.description,
    images: (vehicle.images || []).map((image: any) => ({
      id: image.id,
      imagePath: image.imagePath,
      image: image.image_id ? { url: imageUrlById.get(image.id) || null } : null,
      isPrimary: image.isPrimary,
      sortOrder: image.sortOrder,
    })).sort((a: any, b: any) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
  }
}
