import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { getCustomer } from '../actions/account'
import { AccountLayout } from '../components/account/AccountLayout'
import { loadStorefrontBusiness } from '../lib/data/storefront-business'
import { getRequestLocale } from '../../i18n/server'

// A plain string title here would drop the storefront's "%s | <store>" template for every account
// page ("Sign in" with no store name), so the template is restated for this subtree.
export async function generateMetadata(): Promise<Metadata> {
  const [settings, locale] = await Promise.all([loadStorefrontBusiness(), getRequestLocale()])
  const title = locale === 'pt-BR' ? 'Minha conta' : 'Account'
  if (settings.status === 'error') return { title }
  return { title: { default: title, template: `%s | ${settings.business.shortName}` } }
}

export async function AccountPageLayout({
  dashboard,
  login,
}: {
  dashboard?: ReactNode
  login?: ReactNode
}) {
  const customer = await getCustomer()

  return <AccountLayout signedIn={Boolean(customer)}>{customer ? dashboard : login}</AccountLayout>
}
