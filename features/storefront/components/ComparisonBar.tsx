'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clearComparison, getComparisonCount } from '@/features/storefront/lib/comparison'

export function ComparisonBar() {
  const [count, setCount] = useState(0)
  const pathname = usePathname()

  useEffect(() => {
    const sync = () => setCount(getComparisonCount())
    sync()
    window.addEventListener('comparison-updated', sync)
    return () => window.removeEventListener('comparison-updated', sync)
  }, [])

  if (count === 0 || pathname === '/compare') return null

  return (
    <>
      {/* Keeps the end of the footer reachable above the fixed bar. */}
      <div className="sf-band h-20" aria-hidden="true" />
      <div className="sf-compare-bar pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-3 md:bottom-5">
        <div
          className="sf-band pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[var(--sf-radius-md)] py-1.5 pl-4 pr-1.5"
          style={{ boxShadow: 'var(--sf-shadow-float)' }}
          role="region"
          aria-label="Compare"
        >
          <p className="min-w-0 flex-1 truncate text-[length:var(--sf-text-sm)]">
            <span className="sf-figure font-semibold">{count}</span>
            <span style={{ color: 'var(--sf-on-dark-2)' }}> of 4 selected</span>
          </p>
          <div className="flex shrink-0 gap-1.5">
            <button type="button" onClick={() => clearComparison()} className="sf-btn sf-btn-ghost sf-btn-sm min-h-10">
              Clear
            </button>
            <Link href="/compare" className="sf-btn sf-btn-primary sf-btn-sm min-h-10">
              Compare
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
