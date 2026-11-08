import { getCustomer } from '../actions/account'
import { AccountEmpty, AccountHeader } from '../components/account/AccountStates'
import { VerifyEmailConfirm } from '../components/account/VerifyEmailConfirm'
import { getRequestLocale } from '../../i18n/server'

export async function AccountVerifyEmailPage({ token }: { token: string | null }) {
  const [customer, locale] = await Promise.all([getCustomer(), getRequestLocale()])
  const pt = locale === 'pt-BR'
  return (
    <section className="max-w-xl pb-24">
      <AccountHeader title={pt ? 'Confirmar e-mail' : 'Verify email'} meta={customer?.email ? <span className="break-all">{customer.email}</span> : undefined} />
      <div className="mt-[var(--sf-space-lg)]">
        {token ? <VerifyEmailConfirm token={token} /> : <AccountEmpty>{pt ? 'O link de confirmação não contém o código necessário.' : 'Verification link is missing its token.'}</AccountEmpty>}
      </div>
    </section>
  )
}
