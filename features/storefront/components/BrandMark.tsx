'use client'

import Link from 'next/link'
import { StoreLogo } from '@/features/platform/store-settings/components/StoreLogo'
import { useStorefrontBusiness } from './StorefrontBusinessProvider'

// The store's own logo (Store Settings) beside its name, set as a two-line wordmark:
// the first word large in signal orange, the rest in small caps beneath it.
export function splitBrandName(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length < 2) return { lead: name.trim(), rest: '' }
  return { lead: words[0], rest: words.slice(1).join(' ') }
}

export function BrandMark({ size = 'md', className = '' }: { size?: 'md' | 'lg'; className?: string }) {
  const business = useStorefrontBusiness()
  const { lead, rest } = splitBrandName(business.shortName)
  const large = size === 'lg'

  return (
    <Link
      href="/"
      className={`flex min-h-11 min-w-0 items-center gap-2 md:gap-2.5 ${className}`}
      title={business.shortName}
    >
      {business.logoIcon && (
        <StoreLogo svg={business.logoIcon} color={business.logoColor} className={large ? 'size-9' : 'size-5 md:size-8'} />
      )}
      <span className="flex min-w-0 flex-col leading-none">
        <span
          className={`sf-display truncate ${large ? 'text-[1.875rem]' : 'text-[1.3125rem] md:text-[1.75rem]'}`}
          style={{ color: 'var(--sf-accent)', lineHeight: 0.9 }}
        >
          {lead}
        </span>
        {rest && (
          <span
            className={`truncate font-extrabold uppercase ${large ? 'text-[0.8125rem]' : 'text-[0.5625rem] md:text-[0.75rem]'}`}
            style={{ color: 'var(--sf-ink)', letterSpacing: '0.01em', fontStretch: '106%', marginTop: '0.2em' }}
          >
            {rest}
          </span>
        )}
        <span className="sr-only"> home</span>
      </span>
    </Link>
  )
}
