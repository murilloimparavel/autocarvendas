'use client'

import { updateCustomerPassword } from '../../actions/account'
import { ProfileField } from './ProfileField'
import { useLocale } from '@/features/i18n/LocaleProvider'

export function ProfilePassword() {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  return (
    <ProfileField title={pt ? 'Senha' : 'Password'} action={updateCustomerPassword}>
      <div>
        <label htmlFor="profile-password" className="sf-label">{pt ? 'Nova senha' : 'New password'}</label>
        <input id="profile-password" name="password" type="password" autoComplete="new-password" required minLength={8} className="sf-input" />
      </div>
      <div>
        <label htmlFor="profile-confirm-password" className="sf-label">{pt ? 'Confirme a nova senha' : 'Confirm new password'}</label>
        <input id="profile-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} className="sf-input" />
      </div>
    </ProfileField>
  )
}
