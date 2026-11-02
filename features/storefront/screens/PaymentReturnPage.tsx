import Link from 'next/link'

import { getCustomer } from '../actions/account'
import { Container } from '../components/Container'
import { Sticker } from '../components/forms/RequestForm'
import { loadStorefrontBusiness } from '../lib/data/storefront-business'
import { loadPaymentReturn, type PaymentReturn } from '../lib/data/payment-return'
import { storefrontCurrency } from '../lib/format'

type Outcome = 'success' | 'cancel'

function money(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: storefrontCurrency(currency) }).format(cents / 100)
}

/** Heading, tone and sentence for where the customer came back from and what the payment now says. */
function copyFor(outcome: Outcome, payment: PaymentReturn | null) {
  if (!payment) {
    return { tone: 'warn', title: outcome === 'success' ? 'Payment received' : 'Payment not completed', line: 'We could not look up this payment link. Contact the dealership and they will confirm it for you.' }
  }
  if (payment.state === 'received') return { tone: 'ok', title: 'Payment received', line: 'Thank you. Your payment went through and the dealership has been notified.' }
  if (payment.state === 'refunded') return { tone: 'ok', title: 'Payment refunded', line: 'This payment has been refunded to your card. Refunds usually show up within 5 to 10 business days.' }
  if (outcome === 'success') return { tone: 'warn', title: 'Payment processing', line: 'Your bank is still confirming this payment. This page updates when you refresh it.' }
  if (payment.state === 'pending') return { tone: 'warn', title: 'Payment not completed', line: 'No charge was made. You can return to checkout to finish paying.' }
  return { tone: 'bad', title: 'Payment not completed', line: 'No charge was made. This checkout link has expired, so ask the dealership to send a new one.' }
}

export async function PaymentReturnPage({ outcome, reference }: { outcome: Outcome; reference: string | null }) {
  const [payment, settings, customer] = await Promise.all([loadPaymentReturn(reference), loadStorefrontBusiness(), getCustomer()])
  const business = settings.status === 'ready' ? settings.business : null
  const copy = copyFor(outcome, payment)
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
              <span className="sf-eyebrow">Amount</span>
              <span className="sf-figure text-[length:var(--sf-text-xl)] font-semibold">{money(payment.amountCents, payment.currency)}</span>
            </p>
          )}
          <nav aria-label="Next" className="mt-[var(--sf-space-lg)] flex flex-wrap gap-2">
            {retryUrl && <a href={retryUrl} className="sf-btn sf-btn-primary">Return to checkout</a>}
            {customer
              ? <Link href="/account" className={`sf-btn ${retryUrl ? 'sf-btn-ghost' : 'sf-btn-primary'}`}>Your account</Link>
              : <Link href="/inventory" className={`sf-btn ${retryUrl ? 'sf-btn-ghost' : 'sf-btn-primary'}`}>Browse inventory</Link>}
            <Link href="/contact" className="sf-btn sf-btn-ghost">Contact us</Link>
          </nav>
        </div>
        <div className="grid min-w-0 gap-[var(--sf-space-md)]">
          {payment && (
            <Sticker
              title={payment.purpose}
              meta={payment.reference}
              rows={[
                { label: payment.stockNumber || payment.purpose === 'Vehicle payment' ? 'Vehicle' : 'For', value: payment.item ?? undefined },
                ...(payment.stockNumber ? [{ label: 'Stock', value: `#${payment.stockNumber}` }] : []),
                { label: 'Amount', value: money(payment.amountCents, payment.currency), strong: true },
              ]}
            />
          )}
          {business && (
            <Sticker
              title="Dealership"
              meta={business.shortName || business.fullName}
              rows={[
                ...(business.phoneDisplay ? [{ label: 'Phone', value: business.phoneHref ? <a href={business.phoneHref} className="underline underline-offset-2">{business.phoneDisplay}</a> : business.phoneDisplay }] : []),
                ...(business.salesEmail ? [{ label: 'Email', value: <a href={`mailto:${business.salesEmail}`} className="break-all underline underline-offset-2">{business.salesEmail}</a> }] : []),
                ...(business.addressLine1 ? [{ label: 'Visit', value: [business.addressLine1, business.addressLine2].filter(Boolean).join(', ') }] : []),
              ]}
            />
          )}
        </div>
      </div>
    </Container>
  )
}
