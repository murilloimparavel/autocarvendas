import type { VehicleImage } from '@/features/storefront/lib/types'

/**
 * Photos shipped in /public go through Next's image optimizer (resized WebP instead of the full JPEG).
 * Uploaded photos are served from the shop's bucket host, which is not in the optimizer's allowlist
 * on every deploy, so those are left as they are.
 */
export function skipImageOptimizer(src: string | null | undefined) {
  return !src || !src.startsWith('/') || src.startsWith('//')
}

export function vehicleImageUrl(image?: VehicleImage | null) {
  return image?.imagePath || image?.image?.url || null
}

export function primaryVehicleImage(images?: VehicleImage[] | null) {
  return images?.find((image) => image.isPrimary) ?? images?.[0] ?? null
}
