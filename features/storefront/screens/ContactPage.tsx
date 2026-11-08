'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { submitStorefrontInquiry } from '../actions/submissions'
import { Container } from '../components/Container'
import { PageHeader } from '../components/PageHeader'
import { useStorefrontBusiness } from '../components/StorefrontBusinessProvider'
import { customerRequestReference } from '../lib/customerRequests'
import { Field, Notice, RequestReceived, Sticker } from '../components/forms/RequestForm'
import { useLocale } from '@/features/i18n/LocaleProvider'

const PREFERRED_CONTACT = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'text', label: 'Text' },
]

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-3 text-[length:var(--sf-text-sm)]" style={{ borderColor: 'var(--sf-rule)' }}>
      <dt className="sf-muted shrink-0">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  )
}

export function ContactPage() {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const text = (en: string, br: string) => pt ? br : en
  const business = useStorefrontBusiness()
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    preferredContact: 'email',
    message: '',
    website: '',
  })
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [submitted, setSubmitted] = useState(false)
  const [submissionReference, setSubmissionReference] = useState<string | null>(null)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    setSubmissionError(null)
    try {
      const result = await submitStorefrontInquiry({
        ...formData,
        intent: 'general-contact',
        rooftopSlug: business.rooftopSlug,
        idempotencyKey,
      })
      if (!result.success) throw new Error(result.error)
      setSubmissionReference(customerRequestReference('inquiry', result.data.leadId))
      setSubmitted(true)
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : text('There was an error submitting your message. Please try again.', 'Não foi possível enviar sua mensagem. Tente novamente.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const preferredLabel = (pt ? ({ email: 'E-mail', phone: 'Telefone', text: 'Mensagem de texto' } as Record<string, string>)[formData.preferredContact] : PREFERRED_CONTACT.find((option) => option.value === formData.preferredContact)?.label)

  if (submitted) {
    return (
      <RequestReceived
        context={text('Message', 'Mensagem')}
        reference={submissionReference}
        summary={
          <Sticker
            title={text('Message', 'Mensagem')}
            meta={business.shortName || business.fullName}
            rows={[
              { label: text('Name', 'Nome'), value: [formData.firstName, formData.lastName].filter(Boolean).join(' ') },
              { label: text('Reply by', 'Retorno por'), value: preferredLabel, strong: true },
              { label: text('Email', 'E-mail'), value: formData.email },
              ...(formData.phone ? [{ label: text('Phone', 'Telefone'), value: formData.phone }] : []),
            ]}
          />
        }
        actions={
          <>
            <Link href="/" className="sf-btn sf-btn-primary">{text('Back home', 'Voltar ao início')}</Link>
            <Link href="/inventory" className="sf-btn sf-btn-ghost">{text('Inventory', 'Estoque')}</Link>
            <Link href="/service" className="sf-btn sf-btn-ghost">{text('Service', 'Oficina')}</Link>
          </>
        }
      />
    )
  }

  const hasAddress = Boolean(business.addressLine1 || business.addressLine2)
  const hours = [
    { label: text('Mon–Fri', 'Segunda a sexta'), value: business.hoursMonFri },
    { label: text('Saturday', 'Sábado'), value: business.hoursSaturday },
    { label: text('Sunday', 'Domingo'), value: business.hoursSunday },
  ].filter((row) => row.value)
  const departments = [
    business.salesEmail ? { label: text('Sales', 'Vendas'), email: business.salesEmail } : null,
    business.serviceEmail ? { label: text('Service', 'Oficina'), email: business.serviceEmail } : null,
  ].filter((row): row is { label: string; email: string } => Boolean(row))

  return (
    <>
      <PageHeader title={business.fullName} />

      <Container className="sf-section">
        <div className="grid gap-[var(--sf-space-xl)] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] xl:gap-[var(--sf-space-2xl)]">
          <aside className="order-2 min-w-0 space-y-[var(--sf-space-lg)] lg:order-1">
            <section>
              <h2 className="sf-heading mb-3 text-[length:var(--sf-text-lg)]">{text('Visit', 'Visite nossa loja')}</h2>
              {hasAddress ? (
                <>
                  <address className="not-italic">
                    {business.addressLine1 && <p className="text-[length:var(--sf-text-lg)] font-semibold">{business.addressLine1}</p>}
                    {business.addressLine2 && <p className="sf-muted mt-1">{business.addressLine2}</p>}
                  </address>
                  {business.directionsHref && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <a href={business.directionsHref} target="_blank" rel="noopener noreferrer" className="sf-btn sf-btn-primary">
                        {text('Directions', 'Como chegar')}
                        <ArrowUpRight className="size-4" aria-hidden="true" />
                      </a>
                      {business.phoneHref && business.phoneDisplay && (
                        <a href={business.phoneHref} className="sf-btn sf-btn-ghost">{text('Call', 'Ligar')}</a>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="sf-muted text-[length:var(--sf-text-sm)]">{text('Address not listed', 'Endereço não informado')}</p>
              )}
            </section>

            <section>
              <h2 className="sf-heading mb-3 text-[length:var(--sf-text-lg)]">{text('Departments', 'Departamentos')}</h2>
              {business.phoneDisplay || departments.length ? (
                <dl className="border-t" style={{ borderColor: 'var(--sf-rule)' }}>
                  {business.phoneHref && business.phoneDisplay && (
                    <InfoRow label={text('Phone', 'Telefone')}>
                      <a href={business.phoneHref} className="sf-link sf-figure">{business.phoneDisplay}</a>
                    </InfoRow>
                  )}
                  {departments.map((row) => (
                    <InfoRow key={row.label} label={row.label}>
                      <a href={`mailto:${row.email}`} className="sf-link break-all">{row.email}</a>
                    </InfoRow>
                  ))}
                </dl>
              ) : (
                <p className="sf-muted text-[length:var(--sf-text-sm)]">{text('Contact details not listed', 'Dados de contato não informados')}</p>
              )}
            </section>

            <section>
              <h2 className="sf-heading mb-3 text-[length:var(--sf-text-lg)]">{text('Hours', 'Horários')}</h2>
              {hours.length ? (
                <dl className="border-t" style={{ borderColor: 'var(--sf-rule)' }}>
                  {hours.map((row) => (
                    <InfoRow key={row.label} label={row.label}>
                      <span className="sf-figure">{row.value}</span>
                    </InfoRow>
                  ))}
                </dl>
              ) : (
                <p className="sf-muted text-[length:var(--sf-text-sm)]">{text('Hours not listed', 'Horários não informados')}</p>
              )}
            </section>
          </aside>

          <form onSubmit={handleSubmit} className="order-1 min-w-0 lg:order-2 lg:border-l lg:pl-[var(--sf-space-xl)]" style={{ borderColor: 'var(--sf-rule)' }}>
            <h2 className="sf-heading mb-5 text-[length:var(--sf-text-xl)]">{text('Message', 'Envie uma mensagem')}</h2>
            <div className="grid gap-4">
              <Field label={text('First name', 'Nome')} htmlFor="contact-first-name">
                <input
                  id="contact-first-name"
                  type="text"
                  required
                  autoComplete="given-name"
                  value={formData.firstName}
                  onChange={(e) => setFormData((p) => ({ ...p, firstName: e.target.value }))}
                  className="sf-input"
                />
              </Field>
              <Field label={text('Last name', 'Sobrenome')} htmlFor="contact-last-name">
                <input
                  id="contact-last-name"
                  type="text"
                  required
                  autoComplete="family-name"
                  value={formData.lastName}
                  onChange={(e) => setFormData((p) => ({ ...p, lastName: e.target.value }))}
                  className="sf-input"
                />
              </Field>
              <Field label={text('Email', 'E-mail')} htmlFor="contact-email">
                <input
                  id="contact-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                  className="sf-input"
                />
              </Field>
              <Field label={text('Phone', 'Telefone')} htmlFor="contact-phone" optional={formData.preferredContact === 'email'}>
                <input
                  id="contact-phone"
                  type="tel"
                  autoComplete="tel"
                  required={formData.preferredContact !== 'email'}
                  value={formData.phone}
                  onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                  className="sf-input"
                />
              </Field>
              <div>
                <p id="contact-preferred" className="sf-label">{text('Preferred contact', 'Prefiro receber contato por')}</p>
                <div role="group" aria-labelledby="contact-preferred" className="sf-track">
                  {PREFERRED_CONTACT.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className="sf-pill min-h-11 px-5"
                      aria-pressed={formData.preferredContact === option.value}
                      onClick={() => setFormData((p) => ({ ...p, preferredContact: option.value }))}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <Field label={text('Message', 'Mensagem')} htmlFor="contact-message">
                <textarea
                  id="contact-message"
                  required
                  rows={6}
                  value={formData.message}
                  onChange={(e) => setFormData((p) => ({ ...p, message: e.target.value }))}
                  className="sf-input"
                />
              </Field>
            </div>
            <input
              type="text"
              name="website"
              value={formData.website}
              onChange={(e) => setFormData((p) => ({ ...p, website: e.target.value }))}
              tabIndex={-1}
              autoComplete="off"
              className="hidden"
              aria-hidden="true"
            />
            <div className="mt-6 space-y-4">
              {submissionError && <Notice tone="bad">{submissionError}</Notice>}
              <button type="submit" disabled={isSubmitting} className="sf-btn sf-btn-primary w-full sm:w-auto sm:min-w-56">
                {isSubmitting ? text('Sending…', 'Enviando…') : text('Send message', 'Enviar mensagem')}
              </button>
            </div>
          </form>
        </div>
      </Container>
    </>
  )
}
