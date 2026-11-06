import { getCustomerPayments, getCustomerPurchases } from '../actions/customerRecords'
import { AccountEmpty, AccountError, AccountHeader, AccountSection } from '../components/account/AccountStates'
import { Sticker, type StickerRowData } from '../components/forms/RequestForm'
import { formatCents, formatDate, formatDateTime, statusLabel, statusTone, type CustomerPayment, type CustomerPurchase } from '../lib/accountRecords'

const DEAL_STATUS: Record<string, string> = {
  submitted: 'In review',
  approved: 'Approved',
  financed: 'Financed',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

function purchaseRows(deal: CustomerPurchase): StickerRowData[] {
  return [
    ...(deal.vehicle?.stockNumber ? [{ label: 'Stock', value: deal.vehicle.stockNumber }] : []),
    ...(deal.vehicle?.vin ? [{ label: 'VIN', value: deal.vehicle.vin }] : []),
    ...(deal.saleDate ? [{ label: 'Sale date', value: formatDate(deal.saleDate, deal.timezone) }] : []),
    { label: 'Vehicle price', value: formatCents(deal.vehiclePriceCents) },
    ...(deal.tradeInValueCents ? [{ label: 'Trade-in credit', value: formatCents(deal.tradeInValueCents) }] : []),
    ...(deal.taxAmountCents ? [{ label: 'Tax', value: formatCents(deal.taxAmountCents) }] : []),
    ...(deal.totalPriceCents != null ? [{ label: 'Total', value: formatCents(deal.totalPriceCents), strong: true }] : []),
    ...(deal.downPaymentCents ? [{ label: 'Down payment', value: formatCents(deal.downPaymentCents) }] : []),
    ...(deal.financingAmountCents ? [{ label: 'Financed', value: formatCents(deal.financingAmountCents) }] : []),
    ...(deal.monthlyPaymentCents ? [{ label: 'Monthly', value: formatCents(deal.monthlyPaymentCents) }] : []),
    ...(deal.loanTerm ? [{ label: 'Term', value: `${deal.loanTerm} mo` }] : []),
    ...(deal.apr != null && deal.financingAmountCents ? [{ label: 'APR', value: `${Number(deal.apr).toFixed(2)}%` }] : []),
  ]
}

function PaymentList({ payments }: { payments: CustomerPayment[] }) {
  return (
    <ul className="border-t" style={{ borderColor: 'var(--sf-rule)' }}>
      {payments.map((payment) => (
        <li key={payment.id} className="grid gap-x-6 gap-y-1 border-b py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline" style={{ borderColor: 'var(--sf-rule)' }}>
          <div className="min-w-0">
            <p className="sf-title-line">
              <span className="sf-dot" data-tone={statusTone(payment.status)} aria-hidden="true" />
              <span className="sf-heading">{payment.label || (payment.sourceType === 'service' ? 'Service payment' : 'Vehicle payment')}</span>
              <span className="sf-muted text-[length:var(--sf-text-sm)]">{statusLabel(payment.status)}</span>
            </p>
            <p className="sf-muted mt-1 pl-4 text-[length:var(--sf-text-sm)]">{formatDateTime(payment.createdAt, payment.timezone)}</p>
          </div>
          <div className="pl-4 sm:pl-0 sm:text-right">
            <p className="sf-price">{formatCents(payment.amountCents, payment.currency)}</p>
            {payment.refundedCents > 0 && (
              <p className="sf-muted text-[length:var(--sf-text-sm)]">Refunded {formatCents(payment.refundedCents, payment.currency)}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

export async function AccountVehiclesPage() {
  const [purchases, payments] = await Promise.all([getCustomerPurchases(), getCustomerPayments()])

  return (
    <section className="pb-24">
      <AccountHeader title="My vehicles" />

      <AccountSection title="Purchases">
        {purchases === null ? (
          <AccountError title="Purchases couldn't be loaded." retryHref="/account/vehicles" />
        ) : purchases.length === 0 ? (
          <AccountEmpty>No purchases yet.</AccountEmpty>
        ) : (
          <div className="space-y-[var(--sf-space-xl)]">
            {purchases.map((deal) => (
              <article key={deal.id} className="space-y-4">
                <h3 className="sf-title-line flex-wrap">
                  <span className="sf-dot" data-tone={statusTone(deal.status)} aria-hidden="true" />
                  <span className="sf-heading text-[length:var(--sf-text-lg)]">{deal.vehicle?.label || 'Vehicle purchase'}</span>
                  <span className="sf-muted text-[length:var(--sf-text-sm)]">{DEAL_STATUS[deal.status] || statusLabel(deal.status)}</span>
                </h3>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Sticker title="Purchase" meta={formatDate(deal.createdAt, deal.timezone)} rows={purchaseRows(deal)} />
                  <div className="space-y-4">
                    {deal.deliveries.length === 0 ? (
                      <div className="sf-well p-4">
                        <p className="sf-muted text-[length:var(--sf-text-sm)]">Delivery not scheduled.</p>
                      </div>
                    ) : deal.deliveries.map((delivery) => (
                      <div key={delivery.id} className="sf-well space-y-3 p-4">
                        <p className="sf-title-line">
                          <span className="sf-dot" data-tone={statusTone(delivery.status)} aria-hidden="true" />
                          <span className="sf-heading">Delivery</span>
                          <span className="sf-muted text-[length:var(--sf-text-sm)]">{statusLabel(delivery.status)}</span>
                        </p>
                        {delivery.appointmentAt && (
                          <p className="pl-4 text-[length:var(--sf-text-sm)]">
                            <span className="sf-muted">Appointment </span>
                            <span className="sf-figure">{formatDateTime(delivery.appointmentAt, deal.timezone)}</span>
                          </p>
                        )}
                        <div className="pl-4">
                          <p className="sf-label">We owe</p>
                          {delivery.weOweItems.length === 0 ? (
                            <p className="sf-muted text-[length:var(--sf-text-sm)]">None</p>
                          ) : (
                            <ul className="space-y-2">
                              {delivery.weOweItems.map((item) => (
                                <li key={item.id} className="text-[length:var(--sf-text-sm)]">
                                  <span className="sf-title-line">
                                    <span className="sf-dot" data-tone={statusTone(item.status)} aria-hidden="true" />
                                    <span>{item.description}</span>
                                  </span>
                                  <span className="sf-muted block pl-4">
                                    {statusLabel(item.status)}
                                    {item.status === 'open' ? ` · Promised ${formatDate(item.promisedAt, deal.timezone)}` : ''}
                                    {item.fulfilledAt ? ` · ${formatDate(item.fulfilledAt, deal.timezone)}` : ''}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </AccountSection>

      <AccountSection title="Payments">
        {payments === null ? (
          <AccountError title="Payments couldn't be loaded." retryHref="/account/vehicles" />
        ) : payments.length === 0 ? (
          <AccountEmpty>No payments yet.</AccountEmpty>
        ) : (
          <PaymentList payments={payments} />
        )}
      </AccountSection>
    </section>
  )
}
