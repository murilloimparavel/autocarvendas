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
import { getRequestLocale } from '../../i18n/server'

function vehicleRows(vehicle: any, pt: boolean): StickerRowData[] {
  if (!vehicle) return []
  return [
    { label: pt ? 'Veículo' : 'Vehicle', value: vehicle.label },
    ...(vehicle.stockNumber ? [{ label: pt ? 'Estoque' : 'Stock', value: vehicle.stockNumber }] : []),
    ...(vehicle.vin ? [{ label: 'VIN', value: vehicle.vin }] : []),
  ]
}

function percent(basisPoints: number | null | undefined) {
  return basisPoints === null || basisPoints === undefined ? null : `${(basisPoints / 100).toFixed(2)}%`
}

export async function AccountRequestDetailPage({ refParam }: { refParam: string }) {
  const locale = await getRequestLocale()
  const pt = locale === 'pt-BR'
  const parsed = parseCustomerRequestRef(refParam)
  const result = parsed ? await getCustomerRequestDetail(parsed.kind, parsed.id) : { ok: true as const, detail: null }

  if (!result.ok) {
    return (
      <div className="space-y-4">
        <AccountBack href="/account" label={pt ? 'Solicitações' : 'Requests'} />
        <AccountError title={pt ? 'Não foi possível carregar a solicitação.' : "Request couldn't be loaded."} retryHref={parsed ? customerRequestPath(parsed.kind, parsed.id) : '/account'} />
      </div>
    )
  }
  const detail = result.detail
  if (!parsed || !detail) {
    return (
      <div className="space-y-4">
        <AccountBack href="/account" label={pt ? 'Solicitações' : 'Requests'} />
        <AccountEmpty>{pt ? 'Solicitação não encontrada.' : 'Request not found.'}</AccountEmpty>
      </div>
    )
  }

  const kind = parsed.kind
  const reference = customerFacingReference(kind, detail.id, kind === 'financing' ? detail.reference : null)
  const tz = detail.timezone as string | null
  const rows: StickerRowData[] = [{ label: pt ? 'Protocolo' : 'Reference', value: reference }]
  let body: React.ReactNode = null

  if (kind === 'test-drive') {
    rows.push(
      { label: pt ? 'Data e horário' : 'Time', value: formatDateTime(detail.scheduledAt, tz, locale), strong: true },
      ...vehicleRows(detail.vehicle, pt),
      { label: pt ? 'Solicitado em' : 'Submitted', value: formatDateTime(detail.submittedAt, tz, locale) },
      ...(detail.cancelledAt ? [{ label: pt ? 'Cancelado em' : 'Cancelled', value: formatDateTime(detail.cancelledAt, tz, locale) }] : []),
    )
    body = (
      <AccountSection title={pt ? 'Gerenciar' : 'Manage'}>
        <BookingActions kind="test-drive" id={detail.id} canCancel={Boolean(detail.canCancel)} canReschedule={Boolean(detail.canReschedule)} />
      </AccountSection>
    )
  } else if (kind === 'service') {
    rows.push(
      { label: pt ? 'Data e horário' : 'Time', value: formatDateTime(detail.scheduledAt, tz, locale), strong: true },
      ...(detail.servicePackage ? [{ label: pt ? 'Pacote' : 'Package', value: detail.servicePackage.name }] : []),
      ...(detail.servicePackage?.priceCents != null ? [{ label: pt ? 'Preço do pacote' : 'Package price', value: formatCents(detail.servicePackage.priceCents, null, locale) }] : []),
      ...(detail.serviceType ? [{ label: pt ? 'Serviço' : 'Service', value: statusLabel(detail.serviceType, locale) }] : []),
      { label: pt ? 'Veículo' : 'Vehicle', value: detail.vehicleDescription },
      ...(detail.vehicleVin ? [{ label: 'VIN', value: detail.vehicleVin }] : []),
      { label: pt ? 'Solicitado em' : 'Submitted', value: formatDateTime(detail.submittedAt, tz, locale) },
    )
    const order = detail.serviceOrder
    body = (
      <>
        {detail.concern && (
          <AccountSection title={pt ? 'Relato do cliente' : 'Concern'}>
            <p className="whitespace-pre-line text-[length:var(--sf-text-sm)]">{detail.concern}</p>
          </AccountSection>
        )}
        <AccountSection title={pt ? 'Ordem de serviço' : 'Repair order'}>
          {order ? (
            <Link
              href={`/account/service/${encodeURIComponent(order.id)}`}
              className="sf-well flex min-h-11 flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-[var(--sf-paper-2)]"
            >
              <span className="sf-title-line">
                <span className="sf-dot" data-tone={statusTone(order.status)} aria-hidden="true" />
                <span className="sf-heading">{order.invoiceNumber ? `${pt ? 'Nota fiscal' : 'Invoice'} ${order.invoiceNumber}` : (pt ? 'Ordem de serviço' : 'Repair order')}</span>
                <span className="sf-muted text-[length:var(--sf-text-sm)]">{serviceOrderStatusLabel(order.status, locale)}</span>
              </span>
              {order.grandTotalCents != null && <span className="sf-price">{formatCents(order.grandTotalCents, null, locale)}</span>}
            </Link>
          ) : (
            <AccountEmpty>{pt ? 'Ainda não há ordem de serviço.' : 'No repair order yet.'}</AccountEmpty>
          )}
        </AccountSection>
        <AccountSection title={pt ? 'Gerenciar' : 'Manage'}>
          <BookingActions kind="service" id={detail.id} canCancel={Boolean(detail.canCancel)} canReschedule={Boolean(detail.canReschedule)} />
        </AccountSection>
      </>
    )
  } else if (kind === 'inquiry') {
    rows.push(
      ...(detail.intentLabel ? [{ label: pt ? 'Solicitação' : 'Request', value: detail.intentLabel }] : []),
      ...vehicleRows(detail.vehicle, pt),
      ...(detail.preferredContact ? [{ label: pt ? 'Preferência de contato' : 'Contact by', value: statusLabel(detail.preferredContact, locale) }] : []),
      { label: pt ? 'Enviado em' : 'Submitted', value: formatDateTime(detail.submittedAt, tz, locale) },
    )
  } else if (kind === 'trade-in') {
    const range = detail.estimatedMin != null && detail.estimatedMax != null
      ? `${formatCents(Math.round(detail.estimatedMin * 100), null, locale)} ${pt ? 'a' : 'to'} ${formatCents(Math.round(detail.estimatedMax * 100), null, locale)}`
      : null
    rows.push(
      ...vehicleRows(detail.vehicle, pt),
      ...(detail.mileage != null ? [{ label: pt ? 'Quilometragem' : 'Mileage', value: `${new Intl.NumberFormat(locale).format(detail.mileage)} ${pt ? 'km' : 'mi'}` }] : []),
      ...(detail.condition ? [{ label: pt ? 'Condição' : 'Condition', value: statusLabel(detail.condition, locale) }] : []),
      ...(range ? [{ label: pt ? 'Faixa preliminar' : 'Preliminary range', value: range }] : []),
      { label: pt ? 'Oferta' : 'Offer', value: detail.offerAmountCents != null ? formatCents(detail.offerAmountCents, null, locale) : detail.status === 'closed' ? (pt ? 'Sem oferta' : 'No offer') : (pt ? 'Aguardando avaliação' : 'Pending appraisal'), strong: true },
      { label: pt ? 'Solicitado em' : 'Submitted', value: formatDateTime(detail.submittedAt, tz, locale) },
    )
    if (range) {
      body = <p className="sf-muted mt-[var(--sf-space-md)] text-[length:var(--sf-text-sm)]">{pt ? 'A estimativa é preliminar e não representa uma oferta final. O valor depende da inspeção do veículo e da confirmação de seus dados.' : TRADE_IN_ESTIMATE_DISCLAIMER}</p>
    }
  } else if (kind === 'financing') {
    rows.push(
      ...vehicleRows(detail.vehicle, pt),
      ...(detail.requestedAmountCents != null ? [{ label: pt ? 'Valor solicitado' : 'Amount', value: formatCents(detail.requestedAmountCents, null, locale) }] : []),
      ...(detail.plannedDownPaymentCents != null ? [{ label: pt ? 'Entrada planejada' : 'Down payment', value: formatCents(detail.plannedDownPaymentCents, null, locale) }] : []),
      ...(detail.loanTermMonths != null ? [{ label: pt ? 'Prazo' : 'Term', value: pt ? `${detail.loanTermMonths} meses` : `${detail.loanTermMonths} mo` }] : []),
      { label: pt ? 'Solicitado em' : 'Submitted', value: formatDateTime(detail.submittedAt, tz, locale) },
    )
    const decisions = Array.isArray(detail.decisions) ? detail.decisions : []
    body = (
      <AccountSection title={pt ? 'Análises da financeira' : 'Lender decisions'}>
        {decisions.length === 0 ? (
          <AccountEmpty>{pt ? 'Ainda não há retorno da financeira.' : 'No lender decision yet.'}</AccountEmpty>
        ) : (
          <ul className="border-t" style={{ borderColor: 'var(--sf-rule)' }}>
            {decisions.map((decision: any) => (
              <li key={decision.id} className="border-b py-4" style={{ borderColor: 'var(--sf-rule)' }}>
                <p className="sf-title-line">
                  <span className="sf-dot" data-tone={statusTone(decision.decision)} aria-hidden="true" />
                  <span className="sf-heading">{statusLabel(decision.decision, locale)}</span>
                  <span className="sf-muted text-[length:var(--sf-text-sm)]">{formatDateTime(decision.decidedAt, tz, locale)}</span>
                </p>
                <dl className="sf-spec mt-3">
                  {decision.approvedAmountCents != null && <div><dt>{pt ? 'Aprovado' : 'Approved'}</dt><dd className="sf-figure">{formatCents(decision.approvedAmountCents, null, locale)}</dd></div>}
                  {decision.aprBasisPoints != null && <div><dt>{pt ? 'Taxa anual' : 'APR'}</dt><dd className="sf-figure">{percent(decision.aprBasisPoints)}</dd></div>}
                  {decision.termMonths != null && <div><dt>{pt ? 'Prazo' : 'Term'}</dt><dd className="sf-figure">{pt ? `${decision.termMonths} meses` : `${decision.termMonths} mo`}</dd></div>}
                  {decision.monthlyPaymentCents != null && <div><dt>{pt ? 'Parcela' : 'Payment'}</dt><dd className="sf-figure">{formatCents(decision.monthlyPaymentCents, null, locale)}</dd></div>}
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
      <AccountBack href="/account" label={pt ? 'Solicitações' : 'Requests'} />
      <div className="mt-2">
        <AccountHeader
          reference={reference}
          title={detail.label || (pt ? (kind === 'test-drive' ? 'Test-drive' : kind === 'service' ? 'Oficina' : kind === 'trade-in' ? 'Veículo na troca' : kind === 'financing' ? 'Financiamento' : 'Contato') : 'Request')}
          tone={statusTone(detail.status)}
          status={customerRequestStatusLabel(kind, detail.status, locale)}
        />
      </div>
      <div className="mt-[var(--sf-space-lg)] max-w-xl">
        <Sticker title={detail.label || (pt ? (kind === 'test-drive' ? 'Test-drive' : kind === 'service' ? 'Oficina' : kind === 'trade-in' ? 'Veículo na troca' : kind === 'financing' ? 'Financiamento' : 'Contato') : 'Request')} meta={reference} rows={rows} />
      </div>
      {body}
    </section>
  )
}
