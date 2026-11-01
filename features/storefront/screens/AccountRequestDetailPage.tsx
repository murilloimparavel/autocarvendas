import Link from 'next/link'

import { getCustomerRequestDetail } from '../actions/customerRecords'
import { BookingActions } from '../components/account/BookingActions'
import { AccountBack, AccountEmpty, AccountError, AccountHeader, AccountSection } from '../components/account/AccountStates'
import { Sticker, type StickerRowData } from '../components/forms/RequestForm'
import { customerFacingReference, customerRequestStatusLabel } from '../lib/customerRequests'
import {
  customerRequestPath,
  formatCents,
  formatDateTime,
  parseCustomerRequestRef,
  serviceOrderStatusLabel,
  statusLabel,
  statusTone,
} from '../lib/accountRecords'
import { TRADE_IN_ESTIMATE_DISCLAIMER } from '../lib/tradeInForm'

function vehicleRows(vehicle: any): StickerRowData[] {
  if (!vehicle) return []
  return [
    { label: 'Vehicle', value: vehicle.label },
    ...(vehicle.stockNumber ? [{ label: 'Stock', value: vehicle.stockNumber }] : []),
    ...(vehicle.vin ? [{ label: 'VIN', value: vehicle.vin }] : []),
  ]
}

function percent(basisPoints: number | null | undefined) {
  return basisPoints === null || basisPoints === undefined ? null : `${(basisPoints / 100).toFixed(2)}%`
}

export async function AccountRequestDetailPage({ refParam }: { refParam: string }) {
  const parsed = parseCustomerRequestRef(refParam)
  const result = parsed ? await getCustomerRequestDetail(parsed.kind, parsed.id) : { ok: true as const, detail: null }

  if (!result.ok) {
    return (
      <div className="space-y-4">
        <AccountBack href="/account" label="Requests" />
        <AccountError title="Request couldn't be loaded." retryHref={parsed ? customerRequestPath(parsed.kind, parsed.id) : '/account'} />
      </div>
    )
  }
  const detail = result.detail
  if (!parsed || !detail) {
    return (
      <div className="space-y-4">
        <AccountBack href="/account" label="Requests" />
        <AccountEmpty>Request not found.</AccountEmpty>
      </div>
    )
  }

  const kind = parsed.kind
  const reference = customerFacingReference(kind, detail.id, kind === 'financing' ? detail.reference : null)
  const tz = detail.timezone as string | null
  const rows: StickerRowData[] = [{ label: 'Reference', value: reference }]
  let body: React.ReactNode = null

  if (kind === 'test-drive') {
    rows.push(
      { label: 'Time', value: formatDateTime(detail.scheduledAt, tz), strong: true },
      ...vehicleRows(detail.vehicle),
      { label: 'Submitted', value: formatDateTime(detail.submittedAt, tz) },
      ...(detail.cancelledAt ? [{ label: 'Cancelled', value: formatDateTime(detail.cancelledAt, tz) }] : []),
    )
    body = (
      <AccountSection title="Manage">
        <BookingActions kind="test-drive" id={detail.id} canCancel={Boolean(detail.canCancel)} canReschedule={Boolean(detail.canReschedule)} />
      </AccountSection>
    )
  } else if (kind === 'service') {
    rows.push(
      { label: 'Time', value: formatDateTime(detail.scheduledAt, tz), strong: true },
      ...(detail.servicePackage ? [{ label: 'Package', value: detail.servicePackage.name }] : []),
      ...(detail.servicePackage?.priceCents != null ? [{ label: 'Package price', value: formatCents(detail.servicePackage.priceCents) }] : []),
      ...(detail.serviceType ? [{ label: 'Service', value: statusLabel(detail.serviceType) }] : []),
      { label: 'Vehicle', value: detail.vehicleDescription },
      ...(detail.vehicleVin ? [{ label: 'VIN', value: detail.vehicleVin }] : []),
      { label: 'Submitted', value: formatDateTime(detail.submittedAt, tz) },
    )
    const order = detail.serviceOrder
    body = (
      <>
        {detail.concern && (
          <AccountSection title="Concern">
            <p className="whitespace-pre-line text-[length:var(--sf-text-sm)]">{detail.concern}</p>
          </AccountSection>
        )}
        <AccountSection title="Repair order">
          {order ? (
            <Link
              href={`/account/service/${encodeURIComponent(order.id)}`}
              className="sf-well flex min-h-11 flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-[var(--sf-paper-2)]"
            >
              <span className="sf-title-line">
                <span className="sf-dot" data-tone={statusTone(order.status)} aria-hidden="true" />
                <span className="sf-heading">{order.invoiceNumber ? `Invoice ${order.invoiceNumber}` : 'Repair order'}</span>
                <span className="sf-muted text-[length:var(--sf-text-sm)]">{serviceOrderStatusLabel(order.status)}</span>
              </span>
              {order.grandTotalCents != null && <span className="sf-price">{formatCents(order.grandTotalCents)}</span>}
            </Link>
          ) : (
            <AccountEmpty>No repair order yet.</AccountEmpty>
          )}
        </AccountSection>
        <AccountSection title="Manage">
          <BookingActions kind="service" id={detail.id} canCancel={Boolean(detail.canCancel)} canReschedule={Boolean(detail.canReschedule)} />
        </AccountSection>
      </>
    )
  } else if (kind === 'inquiry') {
    rows.push(
      ...(detail.intentLabel ? [{ label: 'Request', value: detail.intentLabel }] : []),
      ...vehicleRows(detail.vehicle),
      ...(detail.preferredContact ? [{ label: 'Contact by', value: statusLabel(detail.preferredContact) }] : []),
      { label: 'Submitted', value: formatDateTime(detail.submittedAt, tz) },
    )
  } else if (kind === 'trade-in') {
    const range = detail.estimatedMin != null && detail.estimatedMax != null
      ? `${formatCents(Math.round(detail.estimatedMin * 100))} to ${formatCents(Math.round(detail.estimatedMax * 100))}`
      : null
    rows.push(
      ...vehicleRows(detail.vehicle),
      ...(detail.mileage != null ? [{ label: 'Mileage', value: `${new Intl.NumberFormat('en-US').format(detail.mileage)} mi` }] : []),
      ...(detail.condition ? [{ label: 'Condition', value: statusLabel(detail.condition) }] : []),
      ...(range ? [{ label: 'Preliminary range', value: range }] : []),
      { label: 'Offer', value: detail.offerAmountCents != null ? formatCents(detail.offerAmountCents) : detail.status === 'closed' ? 'No offer' : 'Pending appraisal', strong: true },
      { label: 'Submitted', value: formatDateTime(detail.submittedAt, tz) },
    )
    if (range) {
      body = <p className="sf-muted mt-[var(--sf-space-md)] text-[length:var(--sf-text-sm)]">{TRADE_IN_ESTIMATE_DISCLAIMER}</p>
    }
  } else if (kind === 'financing') {
    rows.push(
      ...vehicleRows(detail.vehicle),
      ...(detail.requestedAmountCents != null ? [{ label: 'Amount', value: formatCents(detail.requestedAmountCents) }] : []),
      ...(detail.plannedDownPaymentCents != null ? [{ label: 'Down payment', value: formatCents(detail.plannedDownPaymentCents) }] : []),
      ...(detail.loanTermMonths != null ? [{ label: 'Term', value: `${detail.loanTermMonths} mo` }] : []),
      { label: 'Submitted', value: formatDateTime(detail.submittedAt, tz) },
    )
    const decisions = Array.isArray(detail.decisions) ? detail.decisions : []
    body = (
      <AccountSection title="Lender decisions">
        {decisions.length === 0 ? (
          <AccountEmpty>No lender decision yet.</AccountEmpty>
        ) : (
          <ul className="border-t" style={{ borderColor: 'var(--sf-rule)' }}>
            {decisions.map((decision: any) => (
              <li key={decision.id} className="border-b py-4" style={{ borderColor: 'var(--sf-rule)' }}>
                <p className="sf-title-line">
                  <span className="sf-dot" data-tone={statusTone(decision.decision)} aria-hidden="true" />
                  <span className="sf-heading">{statusLabel(decision.decision)}</span>
                  <span className="sf-muted text-[length:var(--sf-text-sm)]">{formatDateTime(decision.decidedAt, tz)}</span>
                </p>
                <dl className="sf-spec mt-3">
                  {decision.approvedAmountCents != null && <div><dt>Approved</dt><dd className="sf-figure">{formatCents(decision.approvedAmountCents)}</dd></div>}
                  {decision.aprBasisPoints != null && <div><dt>APR</dt><dd className="sf-figure">{percent(decision.aprBasisPoints)}</dd></div>}
                  {decision.termMonths != null && <div><dt>Term</dt><dd className="sf-figure">{decision.termMonths} mo</dd></div>}
                  {decision.monthlyPaymentCents != null && <div><dt>Payment</dt><dd className="sf-figure">{formatCents(decision.monthlyPaymentCents)}</dd></div>}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </AccountSection>
    )
  }

  return (
    <section className="pb-24">
      <AccountBack href="/account" label="Requests" />
      <div className="mt-2">
        <AccountHeader
          reference={reference}
          title={detail.label || 'Request'}
          tone={statusTone(detail.status)}
          status={customerRequestStatusLabel(kind, detail.status)}
        />
      </div>
      <div className="mt-[var(--sf-space-lg)] max-w-xl">
        <Sticker title={detail.label || 'Request'} meta={reference} rows={rows} />
      </div>
      {body}
    </section>
  )
}
