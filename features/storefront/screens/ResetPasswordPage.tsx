'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useSearchParams } from 'next/navigation'

import { resetCustomerPassword, type AccountState } from '../actions/account'
import { useLocale } from '@/features/i18n/LocaleProvider'

export function ResetPasswordPage() {
  const { locale, t } = useLocale()
  const pt = locale === 'pt-BR'
  const params = useSearchParams()
  const token = params?.get('token') || ''
  const [state, formAction, pending] = useActionState<AccountState, FormData>(resetCustomerPassword, { error: null })
  const title = token ? (pt ? 'Defina uma nova senha' : 'Set a new password') : (pt ? 'Esqueceu a senha?' : 'Forgot password')

  return (
    <section className="mx-auto w-full max-w-sm">
      <h1 className="sf-display text-center text-[length:var(--sf-text-2xl)]">{title}</h1>

      <div className="sf-panel mt-6 p-5 sm:p-6">
        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="reset-email" className="sf-label">{t('email')}</label>
            <input id="reset-email" name="email" type="email" autoComplete="email" required defaultValue={params?.get('email') || ''} className="sf-input" />
          </div>
          {token && (
            <div>
              <label htmlFor="reset-password" className="sf-label">{pt ? 'Nova senha' : 'New password'}</label>
              <input id="reset-password" name="password" type="password" autoComplete="new-password" required minLength={8} className="sf-input" />
              <input type="hidden" name="token" value={token} />
            </div>
          )}
          {state.error && <div role="alert" className="sf-notice" data-tone="bad">{state.error}</div>}
          {state.success && <div role="status" className="sf-notice" data-tone="ok">{state.success}</div>}
          <button type="submit" disabled={pending} className="sf-btn sf-btn-primary w-full">
            {pending ? (token ? (pt ? 'Salvando…' : 'Saving…') : (pt ? 'Enviando…' : 'Sending…')) : token ? (pt ? 'Definir senha' : 'Set password') : (pt ? 'Enviar link para redefinir senha' : 'Send reset link')}
          </button>
        </form>
      </div>

      <div className="mt-5 flex justify-center">
        <Link href="/account" className="sf-link inline-flex min-h-11 items-center gap-1.5 text-[length:var(--sf-text-sm)]">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {pt ? 'Voltar à conta' : 'Back to account'}
        </Link>
      </div>
    </section>
  )
}
