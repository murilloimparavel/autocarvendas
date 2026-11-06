import { getCustomerServiceOrder, payServiceInvoiceAction } from '../actions/customerRecords'
import { AccountBack, AccountEmpty, AccountError, AccountHeader, AccountSection } from '../components/account/AccountStates'
import { Sticker, type StickerRowData } from '../components/forms/RequestForm'
import { formatCents, formatDate, formatDateTime, serviceOrderStatusLabel, statusLabel, statusTone } from '../lib/accountRecords'

const STORY: Array<{ key: 'concern' | 'cause' | 'correction' | 'workPerformed' | 'recommendations'; label: string }> = [
  { key: 'concern', label: 'Concern' },
  { key: 'cause', label: 'Cause' },
  { key: 'correction', label: 'Correction' },
  { key: 'workPerformed', label: 'Work performed' },
  { key: 'recommendations', label: 'Recommendations' },
]

export async function AccountServiceOrderPage({ id, payError = null }: { id: string; payError?: string | null }) {
  const result = await getCustomerServiceOrder(id)
  if (!result.ok) {
    return (
      <div className="space-y-4">
        <AccountBack href="/account/service" label="Service" />
        <AccountError title="Repair order couldn't be loaded." retryHref={`/account/service/${encodeURIComponent(id)}`} />
      </div>
    )
  }
  const order = result.order
  if (!order) {
    return (
      <div className="space-y-4">
        <AccountBack href="/account/service" label="Service" />
        <AccountEmpty>Repair order not found.</AccountEmpty>
      </div>
    )
  }

  const tz = order.timezone
  const invoiced = ['invoiced', 'paid'].includes(order.status)
  const totals: StickerRowData[] = [
    { label: 'Labor', value: formatCents(order.laborTotalCents) },
    { label: 'Parts', value: formatCents(order.partsTotalCents) },
    { label: 'Tax', value: formatCents(order.taxCents) },
    { label: invoiced ? 'Invoice total' : 'Estimated total', value: formatCents(order.grandTotalCents), strong: true },
    ...(invoiced ? [
      { label: 'Paid', value: formatCents(order.paidCents) },
      { label: 'Balance', value: order.status === 'paid' ? formatCents(0) : formatCents(order.balanceCents), strong: true },
    ] : []),
  ]
  const canPay = order.status === 'invoiced' && Number(order.balanceCents || 0) > 0
  const story = STORY.filter((item) => String(order[item.key] || '').trim())

  return (
    <section className="pb-24">
      <AccountBack href="/account/service" label="Service" />
      <div className="mt-2">
        <AccountHeader
          reference={order.invoiceNumber ? `Invoice ${order.invoiceNumber}` : null}
          title={order.appointment?.customerVehicleDescription || 'Repair order'}
          tone={statusTone(order.status)}
          status={serviceOrderStatusLabel(order.status)}
          meta={
            <>
              {order.appointment?.appointmentDate && <>Visit {formatDateTime(order.appointment.appointmentDate, tz)}</>}
              {order.completedAt && <> · Completed {formatDate(order.completedAt, tz)}</>}
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

          <AccountSection title="Lines">
            {order.lineItems.length === 0 && order.laborOperations.length === 0 ? (
              <AccountEmpty>No lines yet.</AccountEmpty>
            ) : (
              <ul className="border-t" style={{ borderColor: 'var(--sf-rule)' }}>
                {order.laborOperations.map((labor) => (
                  <li key={labor.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b py-3" style={{ borderColor: 'var(--sf-rule)' }}>
                    <div className="min-w-0">
                      <p className="sf-title-line">
                        <span className="sf-dot" data-tone={statusTone(labor.status)} aria-hidden="true" />
                        <span>{labor.description || 'Labor'}</span>
                      </p>
                      <p className="sf-muted pl-4 text-[length:var(--sf-text-sm)]">Labor · {statusLabel(labor.status)}</p>
                    </div>
                    {labor.soldHours != null && <span className="sf-figure text-[length:var(--sf-text-sm)]">{labor.soldHours} h</span>}
                  </li>
                ))}
                {order.lineItems.map((line) => (
                  <li key={line.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b py-3" style={{ borderColor: 'var(--sf-rule)' }}>
                    <div className="min-w-0">
                      <p className="break-words">{line.description}</p>
                      <p className="sf-muted text-[length:var(--sf-text-sm)]">
                        {statusLabel(line.itemType)}
                        {line.partNumber ? ` · ${line.partNumber}` : ''}
                        {line.quantity != null ? ` · Qty ${line.quantity}` : ''}
                        {line.unitPriceCents != null ? ` · ${formatCents(line.unitPriceCents)} each` : ''}
                      </p>
                    </div>
                    <span className="sf-figure">{formatCents(line.priceCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </AccountSection>

          <AccountSection title="Payments">
            {order.payments.length === 0 ? (
              <AccountEmpty>No payments recorded.</AccountEmpty>
            ) : (
              <ul className="border-t" style={{ borderColor: 'var(--sf-rule)' }}>
                {order.payments.map((payment) => (
                  <li key={payment.id} className="flex items-baseline justify-between gap-4 border-b py-3" style={{ borderColor: 'var(--sf-rule)' }}>
                    <span className="sf-title-line">
                      <span className="sf-dot" data-tone={statusTone(payment.status)} aria-hidden="true" />
                      <span>{statusLabel(payment.status)}</span>
                      <span className="sf-muted text-[length:var(--sf-text-sm)]">{formatDate(payment.createdAt, tz)}</span>
                    </span>
                    <span className="sf-figure">{formatCents(payment.amountCents, payment.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </AccountSection>
        </div>

        <div className="space-y-3">
          <Sticker
            title={invoiced ? 'Invoice' : 'Estimate'}
            meta={order.invoiceNumber || undefined}
            rows={totals}
            footer={canPay ? (
              <form action={payServiceInvoiceAction} className="space-y-2">
                <input type="hidden" name="serviceOrderId" value={order.id} />
                <button type="submit" className="sf-btn sf-btn-primary w-full min-h-11">Pay {formatCents(order.balanceCents)} by card</button>
                <p className="sf-muted text-[length:var(--sf-text-sm)]">Secure card checkout. Your receipt shows here once paid.</p>
              </form>
            ) : undefined}
          />
          {payError && canPay && <p role="alert" className="text-[length:var(--sf-text-sm)]" style={{ color: 'var(--sf-bad)' }}>{payError}</p>}
        </div>
      </div>
    </section>
  )
}
