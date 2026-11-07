import { defaultLocale, isLocale, localeCookieName, type Locale } from './messages'

export async function getRequestLocale() {
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  const saved = cookieStore.get(localeCookieName)?.value
  return isLocale(saved) ? saved : defaultLocale
}

export function localeFromCookieHeader(cookieHeader: string | undefined): Locale {
  const value = cookieHeader?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${localeCookieName}=`))?.split('=').slice(1).join('=')
  return isLocale(value) ? value : defaultLocale
}
