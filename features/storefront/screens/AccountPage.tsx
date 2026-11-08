import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { getCustomer } from '../actions/account'
import { getCustomerEmailLink, getCustomerRequestHistory } from '../actions/customerRecords'
import { getRequestLocale } from '../../i18n/server'
import { EmailLinkPanel } from '../components/account/EmailLinkPanel'
import { customerFacingReference, customerRequestStatusLabel, type CustomerRequestKind } from '../lib/customerRequests'
import { customerRequestPath, formatCents, formatDateTime, isCustomerRequestKind, statusTone, type CustomerRequestRow } from '../lib/accountRecords'

type CustomerRequest = CustomerRequestRow

const KIND_KEYS: Record<string, CustomerRequestKind> = {
  'test drive': 'test-drive',
  'test-drive': 'test-drive',
  service: 'service',
  'trade-in': 'trade-in',
  'trade in': 'trade-in',
  financing: 'financing',
  inquiry: 'inquiry',
  contact: 'inquiry',
}

function kindKey(item: CustomerRequest): CustomerRequestKind | null {
  if (isCustomerRequestKind(item.kindKey)) return item.kindKey
  return KIND_KEYS[item.kind.trim().toLowerCase()] ?? null
}

function requestReference(item: CustomerRequest) {
  const kind = kindKey(item)
  return kind ? customerFacingReference(kind, item.id, item.reference) : null
}

function isScheduledKind(item: CustomerRequest) {
  return ['test-drive', 'service'].includes(kindKey(item) ?? '')
}

function requestKindLabel(value: string, pt: boolean) {
  if (!pt) return value
  const kind = String(value).trim().toLowerCase()
  const labels: Record<string, string> = {
    'test drive': 'Test-drive', 'test-drive': 'Test-drive', service: 'Oficina', 'trade-in': 'Veículo na troca', 'trade in': 'Veículo na troca',
    financing: 'Financiamento', inquiry: 'Contato', contact: 'Contato',
  }
  return labels[kind] || value
}

const NEW_REQUESTS = [
  { href: '/test-drive', label: 'Test drive' },
  { href: '/service', label: 'Service' },
  { href: '/trade-in', label: 'Trade-in' },
  { href: '/financing', label: 'Financing' },
]

export async function AccountPage() {
  const [customer, history, emailLink, locale] = await Promise.all([getCustomer(), getCustomerRequestHistory(), getCustomerEmailLink(), getRequestLocale()])
  const pt = locale === 'pt-BR'

  if (!customer) {
    return (
      <div role="alert" className="mx-auto max-w-md py-[var(--sf-space-lg)]">
        <h1 className="sf-title-line">
          <span className="sf-dot" data-tone="bad" aria-hidden="true" />
          <span className="sf-heading text-[length:var(--sf-text-2xl)]">{pt ? 'Conta indisponível' : 'Account unavailable'}</span>
        </h1>
        <p className="sf-muted mt-3">{pt ? 'Não foi possível carregar sua conta. Tente novamente.' : 'We couldn&apos;t load your account. Please try again.'}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/account" prefetch={false} className="sf-btn sf-btn-primary">{pt ? 'Tentar novamente' : 'Retry'}</Link>
          <Link href="/inventory" className="sf-btn sf-btn-ghost">{pt ? 'Voltar ao estoque' : 'Back to inventory'}</Link>
        </div>
      </div>
    )
  }

  const counts = history
    ? Object.entries(history.reduce<Record<string, number>>((acc, item) => {
        acc[item.kind] = (acc[item.kind] ?? 0) + 1
        return acc
      }, {}))
    : []

  return (
    <section>
      <header className="border-b pb-[var(--sf-space-md)]" style={{ borderColor: 'var(--sf-rule)' }}>
        <h1 className="sf-display text-[length:var(--sf-text-display)]">{customer.name || (pt ? 'Minha conta' : 'Account')}</h1>
        {customer.email && <p className="sf-muted mt-2 break-all">{customer.email}</p>}
      </header>

      <EmailLinkPanel link={emailLink} />

      {counts.length > 0 && (
        <dl className="sf-spec grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))]">
          <div>
            <dt>{pt ? 'Solicitações' : 'Requests'}</dt>
            <dd className="sf-figure text-[length:var(--sf-text-xl)]">{history?.length ?? 0}</dd>
          </div>
          {counts.map(([kind, count]) => (
            <div key={kind}>
              <dt>{requestKindLabel(kind, pt)}</dt>
              <dd className="sf-figure text-[length:var(--sf-text-xl)]">{count}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-[var(--sf-space-xl)] flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="sf-heading text-[length:var(--sf-text-xl)]">{pt ? 'Histórico de solicitações' : 'Request history'}</h2>
        <nav className="flex flex-wrap gap-2" aria-label={pt ? 'Nova solicitação' : 'New request'}>
          {NEW_REQUESTS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="sf-btn sf-btn-ghost sf-btn-sm min-h-10"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-5">
          {history === null ? (
          <div className="sf-notice" data-tone="bad" role="alert">{pt ? 'Não foi possível carregar o histórico.' : 'Request history couldn&apos;t be loaded.'}</div>
        ) : history.length === 0 ? (
          <div className="sf-well p-6">
            <p className="sf-muted text-[length:var(--sf-text-sm)]">{pt ? 'Nenhuma solicitação até o momento.' : 'No requests yet.'}</p>
          </div>
        ) : (
          <ul className="border-t" style={{ borderColor: 'var(--sf-rule)' }}>
            {history.map((item) => {
              const reference = requestReference(item)
              const status = customerRequestStatusLabel(item.kind, item.status, locale)
              const kind = kindKey(item)
              const amount = formatCents(item.amountCents, null, locale)
              const row = (
                <>
                  <div className="min-w-0">
                    <h3 className="sf-title-line">
                      <span className="sf-dot" data-tone={statusTone(item.status)} aria-hidden="true" />
                      <span className="sf-heading text-[length:var(--sf-text-lg)]">{requestKindLabel(kind || item.kind, pt)}</span>
                      <span className="sf-muted text-[length:var(--sf-text-sm)]">{status}</span>
                    </h3>
                    {item.vehicle && <p className="mt-1 pl-4 text-[length:var(--sf-text-sm)]">{item.vehicle}</p>}
                    <p className="sf-muted mt-1 pl-4 text-[length:var(--sf-text-sm)]">
                      {isScheduledKind(item) ? (pt ? 'Data solicitada' : 'Requested time') : (pt ? 'Enviado em' : 'Submitted')}{' '}
                      <time dateTime={item.scheduledAt} className="sf-figure text-[var(--sf-ink)]">
                        {formatDateTime(item.scheduledAt, item.timezone, locale)}
                      </time>
                      {amount && <> · <span className="sf-figure text-[var(--sf-ink)]">{amount}</span></>}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 pl-4 sm:justify-end sm:pl-0">
                    {reference && <span className="sf-figure sf-muted text-[length:var(--sf-text-sm)]">{reference}</span>}
                    {kind && <ChevronRight className="sf-faint size-4 shrink-0" aria-hidden="true" />}
                  </div>
                </>
              )
              return (
                <li key={`${item.kind}-${item.id}`} className="border-b" style={{ borderColor: 'var(--sf-rule)' }}>
                  {kind ? (
                    <Link
                      href={customerRequestPath(kind, item.id)}
                      className="grid min-h-11 gap-x-6 gap-y-1 px-1 py-4 transition-colors hover:bg-[var(--sf-paper-2)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                      {row}
                    </Link>
                  ) : (
                    <div className="grid gap-x-6 gap-y-1 px-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">{row}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
