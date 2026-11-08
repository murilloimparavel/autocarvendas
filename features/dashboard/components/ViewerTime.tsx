'use client'

import React from 'react'
import { useFormattedTime } from '../lib/useViewerTime'
import type { StoreTimeStyle } from '../lib/storeTime'
import { useLocale } from '@/features/i18n/LocaleProvider'

/** Date or date-time in the viewer's browser zone (date-times carry a short zone label). */
export function ViewerTime({
  value,
  style = 'datetime',
  timeZone,
  fallback = '—',
}: {
  value: Date | string | number | null | undefined
  style?: StoreTimeStyle
  timeZone?: string | null
  fallback?: string
}) {
  const { locale } = useLocale()
  const text = useFormattedTime(value, style, timeZone, locale)
  if (value == null || value === '') return <>{fallback}</>
  return <span suppressHydrationWarning>{text}</span>
}
