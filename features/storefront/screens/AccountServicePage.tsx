import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { getCustomerServiceHistory } from '../actions/customerRecords'
import { AccountEmpty, AccountError, AccountHeader, AccountSection } from '../components/account/AccountStates'
import { customerRequestReference, customerRequestStatusLabel } from '../lib/customerRequests'
import { customerRequestPath, formatCents, formatDateTime, serviceOrderStatusLabel, statusLabel, statusTone } from '../lib/accountRecords'
import { getRequestLocale } from '../../i18n/server'

export async function AccountServicePage() {
  const [visits, locale] = await Promise.all([getCustomerServiceHistory(), getRequestLocale()])
  const pt = locale === 'pt-BR'
  const now = Date.now()
  const upcoming = visits?.filter((visit) => ['scheduled', 'checked-in', 'in-progress', 'waiting-parts'].includes(visit.status) && (visit.status !== 'scheduled' || new Date(visit.appointmentDate).getTime() >= now)) ?? []
  const past = visits?.filter((visit) => !upcoming.includes(visit)) ?? []

  const list = (items: NonNullable<typeof visits>) => (
    <ul className="border-t" style={{ borderColor: 'var(--sf-rule)' }}>
      {items.map((visit) => {
        const order = visit.serviceOrder
        return (
          <li key={visit.id} className="border-b" style={{ borderColor: 'var(--sf-rule)' }}>
            <Link
              href={customerRequestPath('service', visit.id)}
              className="grid min-h-11 gap-x-6 gap-y-1 px-1 py-4 transition-colors hover:bg-[var(--sf-paper-2)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <h3 className="sf-title-line flex-wrap">
                  <span className="sf-dot" data-tone={statusTone(visit.status)} aria-hidden="true" />
                  <span className="sf-heading text-[length:var(--sf-text-lg)]">
                    {visit.servicePackage?.name || (visit.serviceType ? statusLabel(visit.serviceType, locale) : (pt ? 'Oficina' : 'Service'))}
                  </span>
                  <span className="sf-muted text-[length:var(--sf-text-sm)]">{customerRequestStatusLabel('service', visit.status, locale)}</span>
                </h3>
                {visit.vehicleDescription && <p className="mt-1 pl-4 text-[length:var(--sf-text-sm)]">{visit.vehicleDescription}</p>}
                <p className="sf-muted mt-1 pl-4 text-[length:var(--sf-text-sm)]">
                  <time dateTime={visit.appointmentDate} className="sf-figure text-[var(--sf-ink)]">{formatDateTime(visit.appointmentDate, visit.timezone, locale)}</time>
                  {order && (
                    <> · {order.invoiceNumber ? `${pt ? 'Nota fiscal' : 'Invoice'} ${order.invoiceNumber}` : (pt ? 'Ordem de serviço' : 'Repair order')} {serviceOrderStatusLabel(order.status, locale)}
                      {order.grandTotalCents != null && <> · <span className="sf-figure text-[var(--sf-ink)]">{formatCents(order.grandTotalCents, null, locale)}</span></>}
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 pl-4 sm:justify-end sm:pl-0">
                <span className="sf-figure sf-muted text-[length:var(--sf-text-sm)]">{customerRequestReference('service', visit.id)}</span>
                <ChevronRight className="sf-faint size-4 shrink-0" aria-hidden="true" />
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )

  return (
    <section className="pb-24">
      <AccountHeader title={pt ? 'Oficina' : 'Service'} />
      {visits === null ? (
        <div className="mt-[var(--sf-space-lg)]">
          <AccountError title={pt ? 'Não foi possível carregar o histórico da oficina.' : "Service history couldn't be loaded."} retryHref="/account/service" />
        </div>
      ) : (
        <>
          <AccountSection
            title={pt ? 'Próximos agendamentos' : 'Upcoming'}
            action={<Link href="/service" className="sf-btn sf-btn-primary sf-btn-sm min-h-10 self-start">{pt ? 'Agendar serviço' : 'Book service'}</Link>}
          >
            {upcoming.length === 0 ? <AccountEmpty>{pt ? 'Nenhum agendamento próximo.' : 'No upcoming appointments.'}</AccountEmpty> : list(upcoming)}
          </AccountSection>
          <AccountSection title={pt ? 'Histórico' : 'History'}>
            {past.length === 0 ? <AccountEmpty>{pt ? 'Nenhum atendimento anterior.' : 'No past visits.'}</AccountEmpty> : list(past)}
          </AccountSection>
        </>
      )}
    </section>
  )
}
