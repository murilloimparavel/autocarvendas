export type VehicleInventoryFilters = {
  search?: string
  make?: string
  model?: string
  yearMin?: string
  yearMax?: string
  priceMin?: string
  priceMax?: string
  mileageMax?: string
  condition?: string
}

export type VehicleInventorySortKey =
  | 'price-asc'
  | 'price-desc'
  | 'mileage-asc'
  | 'year-desc'
  | 'year-asc'
  | string

export const EMPTY_INVENTORY_FILTERS = {
  search: '', make: '', model: '', yearMin: '', yearMax: '', priceMin: '', priceMax: '', mileageMax: '', condition: '',
}

/** Read the inventory filters and sort from the URL. The server render and the client both use this. */
export function inventoryQueryFromSearch(search: string) {
  const params = new URLSearchParams(search)
  const year = params.get('year') || ''
  return {
    filters: {
      search: params.get('search') || '',
      make: params.get('make') || '',
      model: params.get('model') || '',
      yearMin: params.get('yearMin') || year,
      yearMax: params.get('yearMax') || year,
      priceMin: params.get('priceMin') || '',
      priceMax: params.get('priceMax') || '',
      mileageMax: params.get('mileageMax') || '',
      condition: params.get('condition') || '',
    },
    sortBy: params.get('sort') || 'year-desc',
    page: params.get('page'),
  }
}

function parseNonNegativeInteger(value: string | undefined, label: string) {
  const normalized = value?.trim() || ''
  if (!normalized) return undefined
  if (!/^\d+$/.test(normalized)) throw new Error(`${label} must be a non-negative whole number.`)
  const number = Number(normalized)
  if (!Number.isSafeInteger(number)) throw new Error(`${label} is outside the supported range.`)
  return number
}

function parsePriceCents(value: string | undefined, label: string) {
  const normalized = value?.trim() || ''
  if (!normalized) return undefined
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) {
    throw new Error(`${label} must be a finite non-negative amount.`)
  }
  const amount = Number(normalized)
  const cents = Math.round(amount * 100)
  if (!Number.isFinite(amount) || !Number.isSafeInteger(cents) || cents < 0) {
    throw new Error(`${label} is outside the supported range.`)
  }
  return cents
}

export function buildVehicleWhereInput(filters: VehicleInventoryFilters = {}) {
  const search = filters.search?.trim() || ''
  const make = filters.make?.trim() || ''
  const model = filters.model?.trim() || ''
  const yearMin = parseNonNegativeInteger(filters.yearMin, 'Minimum year')
  const yearMax = parseNonNegativeInteger(filters.yearMax, 'Maximum year')
  const priceMinCents = parsePriceCents(filters.priceMin, 'Minimum price')
  const priceMaxCents = parsePriceCents(filters.priceMax, 'Maximum price')
  const mileageMax = parseNonNegativeInteger(filters.mileageMax, 'Maximum mileage')
  const condition = filters.condition?.trim() || ''

  if (yearMin !== undefined && yearMax !== undefined && yearMin > yearMax) {
    throw new Error('Minimum year cannot exceed maximum year.')
  }
  if (priceMinCents !== undefined && priceMaxCents !== undefined && priceMinCents > priceMaxCents) {
    throw new Error('Minimum price cannot exceed maximum price.')
  }

  const where: { AND: Record<string, unknown>[] } = {
    AND: [{ status: { equals: 'available' } }],
  }

  if (search) {
    where.AND.push({
      OR: [
        { make: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
        { trim: { contains: search, mode: 'insensitive' } },
      ],
    })
  }
  if (make) where.AND.push({ make: { contains: make, mode: 'insensitive' } })
  if (model) where.AND.push({ model: { contains: model, mode: 'insensitive' } })
  if (yearMin !== undefined) where.AND.push({ year: { gte: yearMin } })
  if (yearMax !== undefined) where.AND.push({ year: { lte: yearMax } })
  if (priceMinCents !== undefined) where.AND.push({ priceCents: { gte: priceMinCents } })
  if (priceMaxCents !== undefined) where.AND.push({ priceCents: { lte: priceMaxCents } })
  if (mileageMax !== undefined) where.AND.push({ mileage: { lte: mileageMax } })
  if (condition) where.AND.push({ condition: { equals: condition } })

  return where
}

export function buildVehicleOrderBy(sortBy: VehicleInventorySortKey = 'year-desc') {
  switch (sortBy) {
    case 'price-asc':
      return [{ priceCents: 'asc' }]
    case 'price-desc':
      return [{ priceCents: 'desc' }]
    case 'mileage-asc':
      return [{ mileage: 'asc' }]
    case 'year-asc':
      return [{ year: 'asc' }]
    case 'year-desc':
    default:
      return [{ year: 'desc' }]
  }
}
