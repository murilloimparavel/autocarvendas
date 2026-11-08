import type { ReactNode } from 'react'
import { LogOut } from 'lucide-react'

import { signOutCustomer } from '../../actions/account'
import { Container } from '../Container'
import { AccountNav } from './AccountNav'
import { useLocale } from '@/features/i18n/LocaleProvider'

export function AccountLayout({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  const { locale } = useLocale()
  if (!signedIn) {
    return (
      <Container className="flex min-h-[70dvh] items-center justify-center py-[var(--sf-space-xl)] md:py-[var(--sf-space-2xl)]">
        {children}
      </Container>
    )
  }

  return (
    <Container className="sf-section">
      <div className="mb-[var(--sf-space-lg)]">
        <AccountNav>
          <form action={signOutCustomer} className="self-start sm:self-auto">
            <button type="submit" className="sf-btn sf-btn-ghost sf-btn-sm min-h-10">
              <LogOut className="size-4" aria-hidden="true" />
              {locale === 'pt-BR' ? 'Sair' : 'Sign out'}
            </button>
          </form>
        </AccountNav>
      </div>
      <div className="min-w-0">{children}</div>
    </Container>
  )
}
