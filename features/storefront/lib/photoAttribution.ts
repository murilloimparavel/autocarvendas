// Attribution for the bundled vehicle photos in public/images.
export type PhotoAttribution = {
  path: string
  vehicle: string
  title: string
  author: string
  sourceUrl: string
  license: string
  licenseUrl: string
  changes: string
}

export const BUILT_IN_PHOTO_ATTRIBUTIONS: readonly PhotoAttribution[] = [
]

// Matches only the root-relative built-in paths, so an uploaded or remote
// image that happens to share a file name is never credited to these authors.
export function photoAttributionFor(src?: string | null): PhotoAttribution | null {
  if (!src) return null
  const path = src.split(/[?#]/)[0]
  return BUILT_IN_PHOTO_ATTRIBUTIONS.find((photo) => photo.path === path) ?? null
}

// A bundled photo stands in for a vehicle when the photographed model is not this vehicle's model.
export function isRepresentativePhoto(src: string | null | undefined, vehicle: { make?: string | null; model?: string | null }): boolean {
  const photo = photoAttributionFor(src)
  if (!photo || !vehicle.make || !vehicle.model) return false
  const subject = photo.vehicle.toLowerCase()
  return !(subject.includes(vehicle.make.toLowerCase()) && subject.includes(vehicle.model.toLowerCase()))
}
