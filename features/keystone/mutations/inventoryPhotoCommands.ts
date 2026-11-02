import { permissions } from '../access'
import { inventoryCommand } from './inventoryCommandErrors'
import { assertActiveInventory } from './inventoryActiveStatus'
import { lockInventoryStock, photoArrangementUnchanged } from '../lifecycle/inventoryPublication'
import { recordDomainEventInTransaction, type DomainEventInput } from '../lifecycle/domainEvents'
import { assertSessionRooftopPermission } from '../tenantRecords'

/** Storage key of `VehicleImage.image` (features/keystone/index.ts). */
const PHOTO_STORAGE = 'my_images'
const MAX_PHOTOS_PER_UNIT = 60
const UNSUPPORTED_PHOTO = 'Photos must be JPG, PNG, WebP or GIF images'

function required(value: unknown, label: string, max = 500) {
  const result = String(value || '').trim()
  if (!result || result.length > max) throw new Error(`${label} is required and must be at most ${max} characters`)
  return result
}

function key(value: unknown) {
  const result = String(value || '').trim()
  if (result.length < 8 || result.length > 180) throw new Error('A valid idempotency key is required')
  return result
}

function requireInventory(context: any) {
  if (!context.session?.itemId || !permissions.canManageInventory({ session: context.session })) throw new Error('Inventory management permission is required')
}

async function stockAccess(context: any, id: string) {
  const stock = await context.query.InventoryStock.findOne({ where: { id }, query: 'id rooftop { id } vehicle { id year make model status }' })
  if (!stock?.rooftop?.id || !stock.vehicle?.id) throw new Error('Inventory stock not found or not accessible')
  await assertSessionRooftopPermission(context, stock.rooftop.id, 'canManageInventory')
  assertActiveInventory(stock.vehicle.status)
  return stock
}

function imageUrl(value: unknown) {
  const result = String(value || '').trim()
  if (!result) return ''
  if (result.length > 500) throw new Error('Image URL must be at most 500 characters')
  if (!/^(\/[^/\s]|https:\/\/)\S*$/.test(result)) throw new Error('Image URL must start with https:// or /')
  return result
}

async function priorEvent(context: any, eventKey: string) {
  return context.sudo().prisma.domainAuditEvent.findUnique({ where: { eventKey }, select: { id: true } })
}

/**
 * Deliberate: photos are part of the approved snapshot (`merchandisingSnapshot`), and the storefront and
 * feed re-check that hash on every read, so a reviewer must see the photos customers will see. A real
 * photo change therefore reopens review; a no-op arrange does not reach here.
 */
async function returnListingToDraft(tx: any, stock: any, actorId: string) {
  await tx.prisma.inventoryStock.update({ where: { id: stock.id }, data: { merchandisingStatus: 'draft', approvedRevisionHash: '', feedStatus: 'not-published' } })
  await tx.prisma.inventoryMerchandisingVersion.updateMany({ where: { stockId: stock.id, status: 'submitted' }, data: { status: 'rejected', decisionReason: 'Superseded by photo change', decidedById: actorId, decidedAt: new Date() } })
}

async function recordPhotoEvent(tx: any, stock: any, context: any, eventKey: string, action: string, reason: string, evidence: Record<string, unknown>) {
  const event: DomainEventInput = { eventKey, rooftopId: stock.rooftop.id, aggregateType: 'InventoryStock', aggregateId: stock.id, action, topic: 'inventory-merchandising.photos-changed', actorId: context.session.itemId, afterSnapshot: evidence, payload: { rooftopId: stock.rooftop.id, ...evidence } }
  const recorded = await recordDomainEventInTransaction(tx, event)
  if (recorded.reused) return true
  await tx.prisma.inventoryStockEvent.create({ data: { rooftopId: stock.rooftop.id, stockId: stock.id, eventKey, eventType: action, reason, evidence, actorId: context.session.itemId } })
  return false
}

async function commandResult(context: any, stockId: string, id: string, reused: boolean) {
  const stock = await context.sudo().prisma.inventoryStock.findUnique({ where: { id: stockId }, select: { updatedAt: true, reconStatus: true, merchandisingStatus: true, feedStatus: true } })
  if (!stock) throw new Error('Inventory stock no longer exists')
  return { id, stockId, status: stock.reconStatus, merchandisingStatus: stock.merchandisingStatus, feedStatus: stock.feedStatus, updatedAt: stock.updatedAt, reused }
}

/** Streams the upload into the `VehicleImage.image` bucket exactly as the Keystone image field does. */
async function storePhoto(context: any, photo: any) {
  const upload = await photo?.upload
  if (!upload?.createReadStream) throw new Error('Choose a photo to upload')
  try {
    return await context.images(PHOTO_STORAGE).getDataFromStream(upload.createReadStream(), String(upload.filename || 'photo'))
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/file type not found|not a supported image type|height and width/i.test(message)) throw new Error(UNSUPPORTED_PHOTO)
    throw error
  }
}

async function addInventoryVehiclePhotoCommand(_root: unknown, { data }: any, context: any) {
  requireInventory(context)
  const stock = await stockAccess(context, String(data.stockId || ''))
  const reason = required(data.reason, 'Audit reason')
  const eventKey = `inventory-photo-add:${key(data.idempotencyKey)}`
  const path = imageUrl(data.imageUrl)
  if (Boolean(path) === Boolean(data.photo)) throw new Error('Add one photo file or one image URL')
  // A replayed command must not store the file again.
  const replay = await priorEvent(context, eventKey)
  if (replay) return commandResult(context, stock.id, stock.id, true)

  const stored = data.photo ? await storePhoto(context, data.photo) : null
  const evidence = {
    stockId: stock.id,
    vehicleId: stock.vehicle.id,
    imagePath: path,
    imageId: stored?.id ?? null,
    imageExtension: stored?.extension ?? null,
    filesize: stored?.filesize ?? null,
    reason,
  }
  try {
    const command = await context.transaction(async (tx: any) => {
      await lockInventoryStock(tx, stock.id)
      if (await recordPhotoEvent(tx, stock, context, eventKey, 'merchandising-photo-added', reason, evidence)) return { id: stock.id, reused: true }
      const existing = await tx.prisma.vehicleImage.findMany({ where: { vehicleId: stock.vehicle.id }, select: { isPrimary: true, sortOrder: true } })
      if (existing.length >= MAX_PHOTOS_PER_UNIT) throw new Error(`A unit can have at most ${MAX_PHOTOS_PER_UNIT} photos`)
      const sortOrder = existing.reduce((max: number, image: any) => Math.max(max, image.sortOrder ?? 0), -1) + 1
      const created = await tx.prisma.vehicleImage.create({
        data: {
          rooftopId: stock.rooftop.id,
          vehicleId: stock.vehicle.id,
          imagePath: path,
          image_id: stored?.id ?? null,
          image_extension: stored?.extension ?? null,
          image_filesize: stored?.filesize ?? null,
          image_width: stored?.width ?? null,
          image_height: stored?.height ?? null,
          caption: `${stock.vehicle.year} ${stock.vehicle.make} ${stock.vehicle.model}`,
          category: 'exterior',
          sortOrder,
          isPrimary: !existing.some((image: any) => image.isPrimary),
        },
        select: { id: true },
      })
      await returnListingToDraft(tx, stock, context.session.itemId)
      return { id: created.id, reused: false }
    }, { timeout: 30_000 })
    if (command.reused && stored) await context.images(PHOTO_STORAGE).deleteAtSource(stored.id, stored.extension).catch(() => {})
    return commandResult(context, stock.id, command.id, command.reused)
  } catch (error) {
    if (stored) await context.images(PHOTO_STORAGE).deleteAtSource(stored.id, stored.extension).catch(() => {})
    throw error
  }
}

async function arrangeInventoryVehiclePhotosCommand(_root: unknown, { data }: any, context: any) {
  requireInventory(context)
  const stock = await stockAccess(context, String(data.stockId || ''))
  const reason = required(data.reason, 'Audit reason')
  const eventKey = `inventory-photo-arrange:${key(data.idempotencyKey)}`
  const imageIds: string[] = (Array.isArray(data.imageIds) ? data.imageIds : []).map((id: unknown) => String(id))
  if (!imageIds.length || new Set(imageIds).size !== imageIds.length) throw new Error('List each photo once, primary first')
  const evidence = { stockId: stock.id, vehicleId: stock.vehicle.id, imageIds, reason }
  const reused = await context.transaction(async (tx: any) => {
    await lockInventoryStock(tx, stock.id)
    if (await recordPhotoEvent(tx, stock, context, eventKey, 'merchandising-photos-arranged', reason, evidence)) return true
    const current = await tx.prisma.vehicleImage.findMany({ where: { vehicleId: stock.vehicle.id }, select: { id: true, sortOrder: true, isPrimary: true } })
    const currentIds = new Set(current.map((image: any) => image.id))
    if (current.length !== imageIds.length || imageIds.some(id => !currentIds.has(id))) throw new Error('Photos changed; reload and try again')
    if (photoArrangementUnchanged(current, imageIds)) return false
    for (const [index, id] of imageIds.entries()) {
      await tx.prisma.vehicleImage.update({ where: { id }, data: { sortOrder: index, isPrimary: index === 0 } })
    }
    await returnListingToDraft(tx, stock, context.session.itemId)
    return false
  }, { timeout: 30_000 })
  return commandResult(context, stock.id, imageIds[0], reused)
}

async function removeInventoryVehiclePhotoCommand(_root: unknown, { data }: any, context: any) {
  requireInventory(context)
  const stock = await stockAccess(context, String(data.stockId || ''))
  const reason = required(data.reason, 'Audit reason')
  const eventKey = `inventory-photo-remove:${key(data.idempotencyKey)}`
  const imageId = required(data.imageId, 'Photo', 100)
  const evidence = { stockId: stock.id, vehicleId: stock.vehicle.id, imageId, reason }
  const command = await context.transaction(async (tx: any) => {
    await lockInventoryStock(tx, stock.id)
    if (await recordPhotoEvent(tx, stock, context, eventKey, 'merchandising-photo-removed', reason, evidence)) return { reused: true, stored: null }
    const image = await tx.prisma.vehicleImage.findFirst({ where: { id: imageId, vehicleId: stock.vehicle.id }, select: { id: true, isPrimary: true, image_id: true, image_extension: true } })
    if (!image) throw new Error('Photo not found; reload and try again')
    await tx.prisma.vehicleImage.delete({ where: { id: image.id } })
    if (image.isPrimary) {
      const next = await tx.prisma.vehicleImage.findFirst({ where: { vehicleId: stock.vehicle.id }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true } })
      if (next) await tx.prisma.vehicleImage.update({ where: { id: next.id }, data: { isPrimary: true } })
    }
    await returnListingToDraft(tx, stock, context.session.itemId)
    return { reused: false, stored: image.image_id && image.image_extension ? { id: image.image_id, extension: image.image_extension } : null }
  }, { timeout: 30_000 })
  if (command.stored) await context.images(PHOTO_STORAGE).deleteAtSource(command.stored.id, command.stored.extension).catch(() => {})
  return commandResult(context, stock.id, imageId, command.reused)
}

export const addInventoryVehiclePhoto = inventoryCommand(addInventoryVehiclePhotoCommand)
export const arrangeInventoryVehiclePhotos = inventoryCommand(arrangeInventoryVehiclePhotosCommand)
export const removeInventoryVehiclePhoto = inventoryCommand(removeInventoryVehiclePhotoCommand)
