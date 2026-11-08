'use client'

import { updateCustomerPhone, type CustomerProfile } from '../../actions/account'
import { ProfileField } from './ProfileField'
import { useLocale } from '@/features/i18n/LocaleProvider'

export function ProfilePhone({ customer }: { customer: CustomerProfile }) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  return (
    <ProfileField title={pt ? 'Telefone' : 'Phone number'} action={updateCustomerPhone}>
      <div>
        <label htmlFor="profile-phone" className="sf-label">{pt ? 'Telefone' : 'Phone'}</label>
        <input id="profile-phone" name="phone" type="tel" autoComplete="tel" defaultValue={customer.phone || ''} className="sf-input" />
      </div>
    </ProfileField>
  )
}
