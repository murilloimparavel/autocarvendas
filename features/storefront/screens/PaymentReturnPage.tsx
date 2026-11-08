import Link from 'next/link'

import { getCustomer } from '../actions/account'
import { Container } from '../components/Container'
import { Sticker } from '../components/forms/RequestForm'
import { loadStorefrontBusiness } from '../lib/data/storefront-business'
import { loadPaymentReturn, type PaymentReturn } from '../lib/data/payment-return'
import { storefrontCurrency } from '../lib/format'
import { getRequestLocale } from '@/features/i18n/server'

type Outcome = 'success' | 'cancel'

function money(cents: number, currency: string, locale: 'pt-BR' | 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: storefrontCurrency(currency) }).format(cents / 100)
}

/** Heading, tone and sentence for where the customer came back from and what the payment now says. */
function copyFor(outcome: Outcome, payment: PaymentReturn | null, pt: boolean) {
  const text = (en: string, br: string) => pt ? br : en
  if (!payment) {
    return { tone: 'warn', title: outcome === 'success' ? text('Payment received', 'Pagamento recebido') : text('Payment not completed', 'Pagamento não concluído'), line: text('We could not look up this payment link. Contact the dealership and they will confirm it for you.', 'Não foi possível localizar este pagamento. Entre em contato com a loja para confirmar.') }
  }
  if (payment.state === 'received') return { tone: 'ok', title: text('Payment received', 'Pagamento recebido'), line: text('Thank you. Your payment went through and the dealership has been notified.', 'Obrigado. O pagamento foi confirmado e a loja foi avisada.') }
  if (payment.state === 'refunded') return { tone: 'ok', title: text('Payment refunded', 'Pagamento reembolsado'), line: text('This payment has been refunded to your card. Refunds usually show up within 5 to 10 business days.', 'O valor foi estornado no seu cartão. O crédito costuma aparecer em até 5 a 10 dias úteis.') }
  if (outcome === 'success') return { tone: 'warn', title: text('Payment processing', 'Pagamento em processamento'), line: text('Your bank is still confirming this payment. This page updates when you refresh it.', 'O banco ainda está confirmando o pagamento. Atualize esta página para consultar o status.') }
  if (payment.state === 'pending') return { tone: 'warn', title: text('Payment not completed', 'Pagamento não concluído'), line: text('No charge was made. You can return to checkout to finish paying.', 'Nenhuma cobrança foi feita. Volte ao pagamento para concluir a operação.') }
  return { tone: 'bad', title: text('Payment not completed', 'Pagamento não concluído'), line: text('No charge was made. This checkout link has expired, so ask the dealership to send a new one.', 'Nenhuma cobrança foi feita. Este link de pagamento expirou; peça à loja para enviar outro.') }
}

export async function PaymentReturnPage({ outcome, reference }: { outcome: Outcome; reference: string | null }) {
  const [payment, settings, customer, locale] = await Promise.all([loadPaymentReturn(reference), loadStorefrontBusiness(), getCustomer(), getRequestLocale()])
  const pt = locale === 'pt-BR'
  const text = (en: string, br: string) => pt ? br : en
  const business = settings.status === 'ready' ? settings.business : null
  const copy = copyFor(outcome, payment, pt)
  const retryUrl = outcome === 'cancel' && payment?.state === 'pending' ? payment.retryUrl : null

  return (
    <Container className="sf-section">
      <div className="grid gap-[var(--sf-space-xl)] lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
        <div className="min-w-0">
          <h1 className="sf-title-line">
            <span className="sf-dot" data-tone={copy.tone} aria-hidden="true" />
            <span className="sf-display text-[length:var(--sf-text-display)]">{copy.title}</span>
          </h1>
          <p role="status" className="sf-muted mt-3 max-w-xl text-[length:var(--sf-text-md)]">{copy.line}</p>
          {payment && (
            <p className="mt-5 flex flex-wrap items-baseline gap-3">
              <span className="sf-eyebrow">{text('Amount', 'Valor')}</span>
              <span className="sf-figure text-[length:var(--sf-text-xl)] font-semibold">{money(payment.amountCents, payment.currency, locale)}</span>
            </p>
          )}
          <nav aria-label={pt ? 'Próximas etapas' : 'Next'} className="mt-[var(--sf-space-lg)] flex flex-wrap gap-2">
            {retryUrl && <a href={retryUrl} className="sf-btn sf-btn-primary">{text('Return to checkout', 'Voltar ao pagamento')}</a>}
            {customer
              ? <Link href="/account" className={`sf-btn ${retryUrl ? 'sf-btn-ghost' : 'sf-btn-primary'}`}>{text('Your account', 'Minha conta')}</Link>
              : <Link href="/inventory" className={`sf-btn ${retryUrl ? 'sf-btn-ghost' : 'sf-btn-primary'}`}>{text('Browse inventory', 'Ver estoque')}</Link>}
            <Link href="/contact" className="sf-btn sf-btn-ghost">{text('Contact us', 'Fale conosco')}</Link>
          </nav>
        </div>
        <div className="grid min-w-0 gap-[var(--sf-space-md)]">
          {payment && (
            <Sticker
              title={payment.purpose}
              meta={payment.reference}
              rows={[
                { label: payment.stockNumber || payment.purpose === 'Vehicle payment' ? text('Vehicle', 'Veículo') : text('For', 'Referente a'), value: payment.item ?? undefined },
                ...(payment.stockNumber ? [{ label: text('Stock', 'Estoque'), value: `#${payment.stockNumber}` }] : []),
                { label: text('Amount', 'Valor'), value: money(payment.amountCents, payment.currency, locale), strong: true },
              ]}
            />
          )}
          {business && (
            <Sticker
              title={pt ? 'Concessionária' : 'Dealership'}
              meta={business.shortName || business.fullName}
              rows={[
                ...(business.phoneDisplay ? [{ label: text('Phone', 'Telefone'), value: business.phoneHref ? <a href={business.phoneHref} className="underline underline-offset-2">{business.phoneDisplay}</a> : business.phoneDisplay }] : []),
                ...(business.salesEmail ? [{ label: text('Email', 'E-mail'), value: <a href={`mailto:${business.salesEmail}`} className="break-all underline underline-offset-2">{business.salesEmail}</a> }] : []),
                ...(business.addressLine1 ? [{ label: text('Visit', 'Endereço'), value: [business.addressLine1, business.addressLine2].filter(Boolean).join(', ') }] : []),
              ]}
            />
          )}
        </div>
      </div>
    </Container>
  )
}
