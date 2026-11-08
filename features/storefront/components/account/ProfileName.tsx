'use client'

import { updateCustomerName, type CustomerProfile } from '../../actions/account'
import { ProfileField } from './ProfileField'
import { useLocale } from '@/features/i18n/LocaleProvider'

export function ProfileName({ customer }: { customer: CustomerProfile }) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  return (
    <ProfileField title={pt ? 'Nome' : 'Name'} action={updateCustomerName}>
      <div>
        <label htmlFor="profile-name" className="sf-label">{pt ? 'Nome completo' : 'Full name'}</label>
        <input id="profile-name" name="name" autoComplete="name" required maxLength={200} defaultValue={customer.name || ''} className="sf-input" />
      </div>
    </ProfileField>
  )
}
