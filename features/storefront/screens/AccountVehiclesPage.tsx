import { getCustomerPayments, getCustomerPurchases } from '../actions/customerRecords'
import { AccountEmpty, AccountError, AccountHeader, AccountSection } from '../components/account/AccountStates'
import { Sticker, type StickerRowData } from '../components/forms/RequestForm'
import { formatCents, formatDate, formatDateTime, statusLabel, statusTone, type CustomerPayment, type CustomerPurchase } from '../lib/accountRecords'
import { getRequestLocale } from '../../i18n/server'

const DEAL_STATUS: Record<string, string> = {
  submitted: 'In review',
  approved: 'Approved',
  financed: 'Financed',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}
const DEAL_STATUS_PT: Record<string, string> = { submitted: 'Em análise', approved: 'Aprovado', financed: 'Financiado', delivered: 'Entregue', cancelled: 'Cancelado' }

function purchaseRows(deal: CustomerPurchase, locale: 'pt-BR' | 'en-US'): StickerRowData[] {
  const pt = locale === 'pt-BR'
  return [
    ...(deal.vehicle?.stockNumber ? [{ label: pt ? 'Estoque' : 'Stock', value: deal.vehicle.stockNumber }] : []),
    ...(deal.vehicle?.vin ? [{ label: 'VIN', value: deal.vehicle.vin }] : []),
    ...(deal.saleDate ? [{ label: pt ? 'Data da venda' : 'Sale date', value: formatDate(deal.saleDate, deal.timezone, locale) }] : []),
    { label: pt ? 'Valor do veículo' : 'Vehicle price', value: formatCents(deal.vehiclePriceCents, null, locale) },
    ...(deal.tradeInValueCents ? [{ label: pt ? 'Crédito da troca' : 'Trade-in credit', value: formatCents(deal.tradeInValueCents, null, locale) }] : []),
    ...(deal.taxAmountCents ? [{ label: pt ? 'Impostos' : 'Tax', value: formatCents(deal.taxAmountCents, null, locale) }] : []),
    ...(deal.totalPriceCents != null ? [{ label: pt ? 'Total' : 'Total', value: formatCents(deal.totalPriceCents, null, locale), strong: true }] : []),
    ...(deal.downPaymentCents ? [{ label: pt ? 'Entrada' : 'Down payment', value: formatCents(deal.downPaymentCents, null, locale) }] : []),
    ...(deal.financingAmountCents ? [{ label: pt ? 'Financiado' : 'Financed', value: formatCents(deal.financingAmountCents, null, locale) }] : []),
    ...(deal.monthlyPaymentCents ? [{ label: pt ? 'Parcela mensal' : 'Monthly', value: formatCents(deal.monthlyPaymentCents, null, locale) }] : []),
    ...(deal.loanTerm ? [{ label: pt ? 'Prazo' : 'Term', value: pt ? `${deal.loanTerm} meses` : `${deal.loanTerm} mo` }] : []),
    ...(deal.apr != null && deal.financingAmountCents ? [{ label: 'APR', value: `${Number(deal.apr).toFixed(2)}%` }] : []),
  ]
}

function PaymentList({ payments, locale }: { payments: CustomerPayment[]; locale: 'pt-BR' | 'en-US' }) {
  const pt = locale === 'pt-BR'
  return (
    <ul className="border-t" style={{ borderColor: 'var(--sf-rule)' }}>
      {payments.map((payment) => (
        <li key={payment.id} className="grid gap-x-6 gap-y-1 border-b py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline" style={{ borderColor: 'var(--sf-rule)' }}>
          <div className="min-w-0">
            <p className="sf-title-line">
              <span className="sf-dot" data-tone={statusTone(payment.status)} aria-hidden="true" />
              <span className="sf-heading">{payment.label || (payment.sourceType === 'service' ? (pt ? 'Pagamento de serviço' : 'Service payment') : (pt ? 'Pagamento do veículo' : 'Vehicle payment'))}</span>
              <span className="sf-muted text-[length:var(--sf-text-sm)]">{statusLabel(payment.status, locale)}</span>
            </p>
            <p className="sf-muted mt-1 pl-4 text-[length:var(--sf-text-sm)]">{formatDateTime(payment.createdAt, undefined, locale)}</p>
          </div>
          <div className="pl-4 sm:pl-0 sm:text-right">
            <p className="sf-price">{formatCents(payment.amountCents, payment.currency, locale)}</p>
            {payment.refundedCents > 0 && (
              <p className="sf-muted text-[length:var(--sf-text-sm)]">{pt ? 'Reembolsado' : 'Refunded'} {formatCents(payment.refundedCents, payment.currency, locale)}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

export async function AccountVehiclesPage() {
  const [purchases, payments, locale] = await Promise.all([getCustomerPurchases(), getCustomerPayments(), getRequestLocale()])
  const pt = locale === 'pt-BR'

  return (
    <section className="pb-24">
      <AccountHeader title={pt ? 'Meus veículos' : 'My vehicles'} />

      <AccountSection title={pt ? 'Compras' : 'Purchases'}>
        {purchases === null ? (
          <AccountError title={pt ? 'Não foi possível carregar as compras.' : "Purchases couldn't be loaded."} retryHref="/account/vehicles" />
        ) : purchases.length === 0 ? (
          <AccountEmpty>{pt ? 'Nenhuma compra até o momento.' : 'No purchases yet.'}</AccountEmpty>
        ) : (
          <div className="space-y-[var(--sf-space-xl)]">
            {purchases.map((deal) => (
              <article key={deal.id} className="space-y-4">
                <h3 className="sf-title-line flex-wrap">
                  <span className="sf-dot" data-tone={statusTone(deal.status)} aria-hidden="true" />
                  <span className="sf-heading text-[length:var(--sf-text-lg)]">{deal.vehicle?.label || (pt ? 'Compra de veículo' : 'Vehicle purchase')}</span>
                  <span className="sf-muted text-[length:var(--sf-text-sm)]">{pt ? DEAL_STATUS_PT[deal.status] || statusLabel(deal.status, locale) : DEAL_STATUS[deal.status] || statusLabel(deal.status, locale)}</span>
                </h3>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Sticker title={pt ? 'Compra' : 'Purchase'} meta={formatDate(deal.createdAt, deal.timezone, locale)} rows={purchaseRows(deal, locale)} />
                  <div className="space-y-4">
                    {deal.deliveries.length === 0 ? (
                      <div className="sf-well p-4">
                        <p className="sf-muted text-[length:var(--sf-text-sm)]">{pt ? 'Entrega ainda não agendada.' : 'Delivery not scheduled.'}</p>
                      </div>
                    ) : deal.deliveries.map((delivery) => (
                      <div key={delivery.id} className="sf-well space-y-3 p-4">
                        <p className="sf-title-line">
                          <span className="sf-dot" data-tone={statusTone(delivery.status)} aria-hidden="true" />
                          <span className="sf-heading">{pt ? 'Entrega' : 'Delivery'}</span>
                          <span className="sf-muted text-[length:var(--sf-text-sm)]">{statusLabel(delivery.status, locale)}</span>
                        </p>
                        {delivery.appointmentAt && (
                          <p className="pl-4 text-[length:var(--sf-text-sm)]">
                            <span className="sf-muted">{pt ? 'Agendamento ' : 'Appointment '}</span>
                            <span className="sf-figure">{formatDateTime(delivery.appointmentAt, deal.timezone, locale)}</span>
                          </p>
                        )}
                        <div className="pl-4">
                          <p className="sf-label">{pt ? 'Pendências da loja' : 'We owe'}</p>
                          {delivery.weOweItems.length === 0 ? (
                            <p className="sf-muted text-[length:var(--sf-text-sm)]">{pt ? 'Nenhuma' : 'None'}</p>
                          ) : (
                            <ul className="space-y-2">
                              {delivery.weOweItems.map((item) => (
                                <li key={item.id} className="text-[length:var(--sf-text-sm)]">
                                  <span className="sf-title-line">
                                    <span className="sf-dot" data-tone={statusTone(item.status)} aria-hidden="true" />
                                    <span>{item.description}</span>
                                  </span>
                                  <span className="sf-muted block pl-4">
                                    {statusLabel(item.status, locale)}
                                    {item.status === 'open' ? ` · ${pt ? 'Previsão' : 'Promised'} ${formatDate(item.promisedAt, deal.timezone, locale)}` : ''}
                                    {item.fulfilledAt ? ` · ${pt ? 'Concluído em' : ''} ${formatDate(item.fulfilledAt, deal.timezone, locale)}` : ''}
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

      <AccountSection title={pt ? 'Pagamentos' : 'Payments'}>
        {payments === null ? (
          <AccountError title={pt ? 'Não foi possível carregar os pagamentos.' : "Payments couldn't be loaded."} retryHref="/account/vehicles" />
        ) : payments.length === 0 ? (
          <AccountEmpty>{pt ? 'Nenhum pagamento até o momento.' : 'No payments yet.'}</AccountEmpty>
        ) : (
          <PaymentList payments={payments} locale={locale} />
        )}
      </AccountSection>
    </section>
  )
}
