// Fallback for storefront pages that stream in. It holds a screen of space so the footer starts below
// the fold instead of being painted under the header and pushed down when the page arrives (layout shift).
export function PageFallback() {
  return <div className="min-h-[100svh]" aria-busy="true" />
}
