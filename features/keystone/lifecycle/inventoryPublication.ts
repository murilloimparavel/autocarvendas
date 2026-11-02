import { domainEventRequestHash } from './domainEvents'

/** Every command touching review/publication takes this lock before its event lock. */
export async function lockInventoryStock(tx: any, stockId: string) {
  await tx.prisma.$queryRaw`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(hashtextextended(${`inventory-stock:${stockId}`}, 0))`
}

export async function loadInventoryPublication(tx: any, stockId: string) {
  const stock = await tx.prisma.inventoryStock.findUnique({
    where: { id: stockId },
    include: { vehicle: { include: { images: true } }, merchandisingVersions: { orderBy: { version: 'desc' }, take: 1 } },
  })
  if (!stock?.vehicle) throw new Error('Inventory stock no longer exists')
  return stock
}

/** Marketing content only. Availability/recon/frontline are independently checked lifecycle gates. */
export function merchandisingSnapshot(stock: any) {
  const v = stock.vehicle
  if (!v) throw new Error('Inventory vehicle is missing')
  const images = (v.images || []).map((image: any) => ({
    id: String(image.id), imagePath: String(image.imagePath || ''),
    imageId: image.image_id || null, imageExtension: image.image_extension || null,
    caption: String(image.caption || ''), category: image.category || null,
    isPrimary: Boolean(image.isPrimary), sortOrder: image.sortOrder ?? 0,
  })).sort((a: any, b: any) => a.id.localeCompare(b.id))
  return {
    schemaVersion: 2, vehicleId: v.id, vin: v.vin, stockNumber: stock.stockNumber,
    title: `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ''}`,
    year: v.year, make: v.make, model: v.model, trim: v.trim || '',
    exteriorColor: v.exteriorColor || '', interiorColor: v.interiorColor || '',
    mileage: v.mileage ?? null, condition: v.condition ?? null,
    description: String(v.description || '').trim(), priceCents: v.priceCents ?? null,
    listPriceCents: v.listPriceCents ?? null, features: v.features ?? [], images,
    primaryImagePath: images.find((image: any) => image.isPrimary)?.imagePath || images[0]?.imagePath || '',
  }
}

/**
 * True when arranging photos as `imageIds` (primary first) would leave every photo's `sortOrder` and
 * `isPrimary` as they are. Such a command changes nothing the reviewer approved, so it must not
 * reopen review; any real reorder or primary change does alter the approved snapshot.
 */
export function photoArrangementUnchanged(current: Array<{ id: string; sortOrder?: number | null; isPrimary?: boolean | null }>, imageIds: string[]) {
  const byId = new Map(current.map(image => [String(image.id), image]))
  if (current.length !== imageIds.length || byId.size !== imageIds.length) return false
  return imageIds.every((id, index) => {
    const image = byId.get(id)
    return Boolean(image) && (image!.sortOrder ?? 0) === index && Boolean(image!.isPrimary) === (index === 0)
  })
}

export function assertMerchandisingContent(stock: any) {
  const snapshot = merchandisingSnapshot(stock)
  if (!snapshot.description || !Number.isInteger(snapshot.priceCents) || snapshot.priceCents <= 0 || !snapshot.images.some((image: any) => image.imagePath || image.imageId)) {
    throw new Error('Merchandising submission requires price, description, and at least one image')
  }
  if (!['available', 'service'].includes(stock.vehicle.status)) throw new Error('Only active inventory can be reviewed')
  return snapshot
}

export function assertCurrentInventoryApproval(stock: any) {
  const latest = stock.merchandisingVersions?.[0]
  if (stock.merchandisingStatus !== 'approved' || latest?.status !== 'approved' || latest.snapshot?.schemaVersion !== 2) {
    throw new Error('Current merchandising approval is required; submit this listing for review')
  }
  const digest = domainEventRequestHash(merchandisingSnapshot(stock))
  if (stock.approvedRevisionHash !== digest || domainEventRequestHash(latest.snapshot) !== digest) {
    throw new Error('Inventory content changed after review; submit the current revision for approval')
  }
  return { versionId: latest.id, version: latest.version, revisionHash: digest }
}

export function assertPublishableInventory(stock: any) {
  const approval = assertCurrentInventoryApproval(stock)
  if (stock.reconStatus !== 'completed' || !stock.frontlineAt || stock.vehicle.status !== 'available') {
    throw new Error('Public inventory requires available stock, completed recon and frontline evidence')
  }
  return approval
}

export type InventoryPublicListingAction = 'reapprove' | 'resubmit' | null

/**
 * The storefront gate (`assertPublishableInventory`) explained for the desk: whether this stock is
 * publicly listed and, if not, the first gate it fails. `action` names the merchandising command that
 * restores approval evidence for a unit the desk reports as approved but the storefront rejects.
 */
export function inventoryPublicListingState(stock: any): { live: boolean; reason: string | null; action: InventoryPublicListingAction } {
  const status = String(stock.vehicle?.status || '')
  // Intake stocks a unit as `service` until frontline; report its next prep gate instead of the lot status.
  const inPrep = status === 'service' && !stock.frontlineAt
  if (status !== 'available' && !inPrep) {
    const label: Record<string, string> = { service: 'In service', pending: 'Pending sale', hold: 'On hold', sold: 'Sold' }
    return { live: false, reason: label[status] || 'Not available', action: null }
  }
  if (stock.reconStatus !== 'completed') return { live: false, reason: 'Recon not complete', action: null }
  if (stock.merchandisingStatus === 'submitted') return { live: false, reason: 'Listing awaiting approval', action: null }
  if (stock.merchandisingStatus !== 'approved') return { live: false, reason: stock.merchandisingStatus === 'rejected' ? 'Listing rejected' : 'Listing not approved', action: null }
  try {
    assertCurrentInventoryApproval(stock)
  } catch {
    const latest = stock.merchandisingVersions?.[0]
    let matches = false
    try {
      matches = latest?.status === 'approved' && latest.snapshot?.schemaVersion === 2 &&
        domainEventRequestHash(latest.snapshot) === domainEventRequestHash(merchandisingSnapshot(stock))
    } catch {
      matches = false
    }
    return { live: false, reason: matches ? 'Approval evidence missing' : 'Listing changed since approval', action: matches ? 'reapprove' : 'resubmit' }
  }
  if (inPrep || !stock.frontlineAt) return { live: false, reason: 'Not marked frontline', action: null }
  return { live: true, reason: null, action: null }
}
