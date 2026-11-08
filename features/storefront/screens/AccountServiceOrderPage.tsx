import { getCustomerServiceOrder } from '../actions/customerRecords'
import { AccountBack, AccountEmpty, AccountError, AccountHeader, AccountSection } from '../components/account/AccountStates'
import { Sticker, type StickerRowData } from '../components/forms/RequestForm'
import { formatCents, formatDate, formatDateTime, serviceOrderStatusLabel, statusLabel, statusTone } from '../lib/accountRecords'
import { getRequestLocale } from '../../i18n/server'

export async function AccountServiceOrderPage({ id }: { id: string }) {
  const [result, locale] = await Promise.all([getCustomerServiceOrder(id), getRequestLocale()])
  const pt = locale === 'pt-BR'
  const storyFields: Array<{ key: 'concern' | 'cause' | 'correction' | 'workPerformed' | 'recommendations'; label: string }> = [
    { key: 'concern', label: pt ? 'Relato' : 'Concern' }, { key: 'cause', label: pt ? 'Causa' : 'Cause' },
    { key: 'correction', label: pt ? 'Correção' : 'Correction' }, { key: 'workPerformed', label: pt ? 'Serviços realizados' : 'Work performed' },
    { key: 'recommendations', label: pt ? 'Recomendações' : 'Recommendations' },
  ]
  if (!result.ok) {
    return (
      <div className="space-y-4">
        <AccountBack href="/account/service" label={pt ? 'Oficina' : 'Service'} />
        <AccountError title={pt ? 'Não foi possível carregar a ordem de serviço.' : "Repair order couldn't be loaded."} retryHref={`/account/service/${encodeURIComponent(id)}`} />
      </div>
    )
  }
  const order = result.order
  if (!order) {
    return (
      <div className="space-y-4">
        <AccountBack href="/account/service" label={pt ? 'Oficina' : 'Service'} />
        <AccountEmpty>{pt ? 'Ordem de serviço não encontrada.' : 'Repair order not found.'}</AccountEmpty>
      </div>
    )
  }

  const tz = order.timezone
  const invoiced = ['invoiced', 'paid'].includes(order.status)
  const totals: StickerRowData[] = [
    { label: pt ? 'Mão de obra' : 'Labor', value: formatCents(order.laborTotalCents, null, locale) },
    { label: pt ? 'Peças' : 'Parts', value: formatCents(order.partsTotalCents, null, locale) },
    { label: pt ? 'Impostos' : 'Tax', value: formatCents(order.taxCents, null, locale) },
    { label: invoiced ? (pt ? 'Total da nota' : 'Invoice total') : (pt ? 'Total estimado' : 'Estimated total'), value: formatCents(order.grandTotalCents, null, locale), strong: true },
    ...(invoiced ? [
      { label: pt ? 'Pago' : 'Paid', value: formatCents(order.paidCents, null, locale) },
      { label: pt ? 'Saldo' : 'Balance', value: order.status === 'paid' ? formatCents(0, null, locale) : formatCents(order.balanceCents, null, locale), strong: true },
    ] : []),
  ]
  const story = storyFields.filter((item) => String(order[item.key] || '').trim())

  return (
    <section className="pb-24">
      <AccountBack href="/account/service" label={pt ? 'Oficina' : 'Service'} />
      <div className="mt-2">
        <AccountHeader
          reference={order.invoiceNumber ? `${pt ? 'Nota fiscal' : 'Invoice'} ${order.invoiceNumber}` : null}
          title={order.appointment?.customerVehicleDescription || (pt ? 'Ordem de serviço' : 'Repair order')}
          tone={statusTone(order.status)}
          status={serviceOrderStatusLabel(order.status, locale)}
          meta={
            <>
              {order.appointment?.appointmentDate && <>{pt ? 'Atendimento' : 'Visit'} {formatDateTime(order.appointment.appointmentDate, tz, locale)}</>}
              {order.completedAt && <> · {pt ? 'Concluído' : 'Completed'} {formatDate(order.completedAt, tz, locale)}</>}
              {order.appointment?.vehicleVin && <> · VIN {order.appointment.vehicleVin}</>}
            </>
          }
        />
      </div>

      <div className="mt-[var(--sf-space-lg)] grid gap-[var(--sf-space-lg)] lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0">
          {story.length > 0 && (
            <dl className="space-y-4">
              {story.map((item) => (
                <div key={item.key}>
                  <dt className="sf-label">{item.label}</dt>
                  <dd className="whitespace-pre-line text-[length:var(--sf-text-sm)]">{order[item.key]}</dd>
                </div>
              ))}
            </dl>
          )}

          <AccountSection title={pt ? 'Itens do serviço' : 'Lines'}>
            {order.lineItems.length === 0 && order.laborOperations.length === 0 ? (
              <AccountEmpty>{pt ? 'Nenhum item registrado.' : 'No lines yet.'}</AccountEmpty>
            ) : (
              <ul className="border-t" style={{ borderColor: 'var(--sf-rule)' }}>
                {order.laborOperations.map((labor) => (
                  <li key={labor.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b py-3" style={{ borderColor: 'var(--sf-rule)' }}>
                    <div className="min-w-0">
                      <p className="sf-title-line">
                        <span className="sf-dot" data-tone={statusTone(labor.status)} aria-hidden="true" />
                        <span>{labor.description || (pt ? 'Mão de obra' : 'Labor')}</span>
                      </p>
                      <p className="sf-muted pl-4 text-[length:var(--sf-text-sm)]">{pt ? 'Mão de obra' : 'Labor'} · {statusLabel(labor.status, locale)}</p>
                    </div>
                    {labor.soldHours != null && <span className="sf-figure text-[length:var(--sf-text-sm)]">{new Intl.NumberFormat(locale).format(labor.soldHours)} {pt ? 'h' : 'h'}</span>}
                  </li>
                ))}
                {order.lineItems.map((line) => (
                  <li key={line.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b py-3" style={{ borderColor: 'var(--sf-rule)' }}>
                    <div className="min-w-0">
                      <p className="break-words">{line.description}</p>
                      <p className="sf-muted text-[length:var(--sf-text-sm)]">
                        {statusLabel(line.itemType, locale)}
                        {line.partNumber ? ` · ${line.partNumber}` : ''}
                        {line.quantity != null ? ` · ${pt ? 'Qtd.' : 'Qty'} ${line.quantity}` : ''}
                        {line.unitPriceCents != null ? ` · ${formatCents(line.unitPriceCents, null, locale)} ${pt ? 'cada' : 'each'}` : ''}
                      </p>
                    </div>
                    <span className="sf-figure">{formatCents(line.priceCents, null, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </AccountSection>

          <AccountSection title={pt ? 'Pagamentos' : 'Payments'}>
            {order.payments.length === 0 ? (
              <AccountEmpty>{pt ? 'Nenhum pagamento registrado.' : 'No payments recorded.'}</AccountEmpty>
            ) : (
              <ul className="border-t" style={{ borderColor: 'var(--sf-rule)' }}>
                {order.payments.map((payment) => (
                  <li key={payment.id} className="flex items-baseline justify-between gap-4 border-b py-3" style={{ borderColor: 'var(--sf-rule)' }}>
                    <span className="sf-title-line">
                      <span className="sf-dot" data-tone={statusTone(payment.status)} aria-hidden="true" />
                      <span>{statusLabel(payment.status, locale)}</span>
                      <span className="sf-muted text-[length:var(--sf-text-sm)]">{formatDate(payment.createdAt, tz, locale)}</span>
                    </span>
                    <span className="sf-figure">{formatCents(payment.amountCents, payment.currency, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </AccountSection>
        </div>

        <Sticker title={invoiced ? (pt ? 'Nota fiscal' : 'Invoice') : (pt ? 'Orçamento' : 'Estimate')} meta={order.invoiceNumber || undefined} rows={totals} />
      </div>
    </section>
  )
}
