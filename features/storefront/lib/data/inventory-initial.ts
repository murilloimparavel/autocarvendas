import { fetchGraphQL } from './graphql-client'
import { GET_VEHICLES } from './queries'
import { INVENTORY_PAGE_SIZE, parseInventoryPage, resolveInventoryPage } from './inventory-pagination'
import { buildVehicleOrderBy, buildVehicleWhereInput, inventoryQueryFromSearch } from './vehicle-inventory'
import type { Vehicle } from '../types'

/**
 * The results the inventory page opens with, read on the server. Anything unusual (a bad filter,
 * a page past the end, a failed read) returns null and the page falls back to loading on the client,
 * which already explains those cases to the shopper.
 */
export async function loadInitialInventory(search: string) {
  const query = inventoryQueryFromSearch(search)
  const page = parseInventoryPage(query.page)
  if (page.status !== 'valid') return null
  try {
    const data = await fetchGraphQL<{ publicInventoryVehicles: { items: Vehicle[]; totalCount: number } }>(GET_VEHICLES, {
      where: buildVehicleWhereInput(query.filters),
      orderBy: buildVehicleOrderBy(query.sortBy),
      take: INVENTORY_PAGE_SIZE,
      skip: page.skip,
    })
    const result = data.publicInventoryVehicles
    if (!result || !Array.isArray(result.items) || !Number.isSafeInteger(result.totalCount)) return null
    const resolution = resolveInventoryPage(page.page, result.totalCount, result.items.length)
    if (resolution.status !== 'ready' && !(resolution.status === 'empty' && !resolution.resetToFirstPage)) return null
    return { search, items: result.items, totalCount: result.totalCount }
  } catch {
    return null
  }
}
