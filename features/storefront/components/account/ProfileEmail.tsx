'use client'

import { updateCustomerEmail, type CustomerProfile } from '../../actions/account'
import { ProfileField } from './ProfileField'
import { useLocale } from '@/features/i18n/LocaleProvider'

export function ProfileEmail({ customer }: { customer: CustomerProfile }) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  return (
    <ProfileField title={pt ? 'Endereço de e-mail' : 'Email address'} action={updateCustomerEmail}>
      <div>
        <label htmlFor="profile-email" className="sf-label">E-mail</label>
        <input id="profile-email" name="email" type="email" autoComplete="email" required defaultValue={customer.email || ''} className="sf-input" />
      </div>
    </ProfileField>
  )
}
