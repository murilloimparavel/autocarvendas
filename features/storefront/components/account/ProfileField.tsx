'use client'

import { useActionState, type ReactNode } from 'react'

import type { AccountState } from '../../actions/account'
import { useLocale } from '@/features/i18n/LocaleProvider'

export function ProfileField({
  title,
  action,
  children,
}: {
  title: string
  action: (state: AccountState, data: FormData) => Promise<AccountState>
  children: ReactNode
}) {
  const [state, formAction, pending] = useActionState(action, { error: null })
  const { locale } = useLocale()

  return (
    <form
      action={formAction}
      className="grid gap-4 border-b py-[var(--sf-space-md)] md:grid-cols-[11rem_minmax(0,1fr)_auto] md:items-start md:gap-6"
      style={{ borderColor: 'var(--sf-rule)' }}
    >
      <h2 className="sf-heading text-[length:var(--sf-text-lg)]">{title}</h2>
      <div className="min-w-0 max-w-xl space-y-4">
        {children}
        {state.error && <div role="alert" className="sf-notice" data-tone="bad">{state.error}</div>}
        {!state.error && state.success && !pending && <div role="status" className="sf-notice" data-tone="ok">{state.success}</div>}
      </div>
      <button type="submit" disabled={pending} className="sf-btn sf-btn-ghost self-start md:mt-6">
        {pending ? (locale === 'pt-BR' ? 'Salvando…' : 'Saving…') : (locale === 'pt-BR' ? 'Salvar' : 'Save')}
      </button>
    </form>
  )
}
