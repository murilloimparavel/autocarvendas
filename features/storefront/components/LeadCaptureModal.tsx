'use client'

import { PlatformDateInput } from '@/features/platform/components/PlatformDateTime'
import { PlatformSelect } from '@/features/platform/components/PlatformSelect'
import { useEffect, useRef } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import { Vehicle } from '@/features/storefront/lib/types'
import {
  dialogFocusableElements,
  inertOutsideDialog,
  isEscapeKey,
  restoreFocusAfterClose,
  trapDialogFocus,
} from '../lib/dialogAccessibility'
import { vehicleTitle } from '../lib/format'
import { DEFAULT_TEST_DRIVE_SLOTS, closedDayLabel, dayAvailability, localDateString } from '../lib/bookingSlots'
import { useStorefrontBusiness } from './StorefrontBusinessProvider'
import { useLocale } from '@/features/i18n/LocaleProvider'

// Mirrors RESERVATION_DEPOSIT_CENTS in features/keystone/mutations/reserveVehicle.ts: $500, or the price if lower.
function formatDeposit(price: unknown, locale: 'pt-BR' | 'en-US', currencyCode: string) {
  const dollars = Number(price)
  const amount = Number.isFinite(dollars) && dollars > 0 ? Math.min(500, dollars) : 500
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount)
}

export type LeadIntent = 'contact' | 'test-drive' | 'get-quote' | 'reserve'

export type LeadSubmissionFeedback = {
  status: 'idle' | 'success' | 'error'
  message?: string
  reference?: string | null
}

export function LeadCaptureModal({
  vehicle,
  intent,
  onClose,
  onSubmit,
  isSubmitting,
  feedback,
  formData,
  setFormData,
  returnFocusTo,
}: {
  vehicle: Vehicle
  intent: LeadIntent
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
  isSubmitting: boolean
  feedback: LeadSubmissionFeedback
  formData: {
    firstName: string
    lastName: string
    email: string
    phone: string
    message: string
    preferredDate: string
    preferredTime: string
    website: string
  }
  returnFocusTo?: HTMLElement | null
  setFormData: React.Dispatch<
    React.SetStateAction<{
      firstName: string
      lastName: string
      email: string
      phone: string
      message: string
      preferredDate: string
      preferredTime: string
      website: string
    }>
  >
}) {
  const business = useStorefrontBusiness()
  const { locale } = useLocale()
  const availability = dayAvailability(business, formData.preferredDate, DEFAULT_TEST_DRIVE_SLOTS)
  const overlayRef = useRef<HTMLDivElement>(null)
  // Capture the opener during the first modal render. By the time effects run,
  // applying inert/modal focus may already have moved document.activeElement.
  const previouslyFocusedRef = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  )

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const restoreBackground = inertOutsideDialog(overlay)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
      restoreBackground()
      restoreFocusAfterClose(returnFocusTo || previouslyFocusedRef.current)
    }
  }, [returnFocusTo])

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const frame = requestAnimationFrame(() => {
      const preferred = overlay.querySelector<HTMLElement>('[data-dialog-initial-focus]')
      const target = preferred || dialogFocusableElements(overlay)[0] || overlay
      target.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [feedback.status])

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isEscapeKey(event.key)) {
      event.preventDefault()
      event.stopPropagation()
      if (!isSubmitting) onClose()
      return
    }
    if (overlayRef.current) trapDialogFocus(event, overlayRef.current)
  }

  const titles: Record<LeadIntent, string> = {
    contact: 'Contact about this vehicle',
    'test-drive': 'Schedule a test drive',
    'get-quote': 'Request a price quote',
    reserve: 'Reserve this vehicle',
  }

  const fieldId = (name: string) => `lead-${name}`

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={{ background: 'oklch(0.16 0.012 262 / 0.6)' }}
      tabIndex={-1}
      onKeyDown={handleDialogKeyDown}
      data-storefront-dialog-overlay
    >
      <div
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[var(--sf-radius-md)] sm:max-h-[90vh] sm:max-w-lg sm:rounded-[var(--sf-radius-md)]"
        style={{ background: 'var(--sf-paper)', boxShadow: 'var(--sf-shadow-float)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-modal-title"
      >
        <div className="flex items-start justify-between gap-4 border-b px-5 pb-4 pt-5 sm:px-6" style={{ borderColor: 'var(--sf-rule)' }}>
          <div className="min-w-0">
            <h2 id="lead-modal-title" className="sf-heading text-[length:var(--sf-text-xl)]">
              {locale === 'pt-BR' ? ({ contact: 'Dúvida sobre este veículo', 'test-drive': 'Agendar um test-drive', 'get-quote': 'Solicitar uma proposta', reserve: 'Reservar este veículo' } as const)[intent] : titles[intent]}
            </h2>
            <p className="sf-muted mt-1.5 flex min-w-0 items-center gap-2 text-[length:var(--sf-text-sm)]">
              <span className="truncate">{vehicleTitle(vehicle)}</span>
              {vehicle.stockNumber && <span className="sf-stall shrink-0">#{vehicle.stockNumber}</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-[var(--sf-radius-sm)] transition-colors hover:bg-[var(--sf-paper-2)] disabled:opacity-50"
            aria-label={locale === 'pt-BR' ? 'Fechar' : 'Close'}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
        {feedback.status === 'success' ? (
          <div className="space-y-5" role="status" aria-live="polite">
            <div className="sf-notice" data-tone="ok">
              <p className="sf-title-line font-semibold">
                <span className="sf-dot" data-tone="ok" aria-hidden="true" />
                {locale === 'pt-BR' ? 'Solicitação recebida' : 'Request received'}
              </p>
              <p className="sf-muted mt-1 pl-4">{feedback.message}</p>
            </div>
            {feedback.reference && (
              <dl className="sf-sticker">
                <div className="sf-sticker-row">
                <dt>{locale === 'pt-BR' ? 'Referência' : 'Reference'}</dt>
                  <dd>{feedback.reference}</dd>
                </div>
              </dl>
            )}
            <button type="button" onClick={onClose} className="sf-btn sf-btn-primary w-full" data-dialog-initial-focus>{locale === 'pt-BR' ? 'Concluir' : 'Done'}</button>
          </div>
        ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label htmlFor={fieldId('first-name')} className="sf-label">{locale === 'pt-BR' ? 'Nome' : 'First name'}</label>
              <input
                id={fieldId('first-name')}
                type="text"
                autoComplete="given-name"
                value={formData.firstName}
                onChange={(e) => setFormData((p) => ({ ...p, firstName: e.target.value }))}
                className="sf-input"
                required
                data-dialog-initial-focus
              />
            </div>
            <div className="min-w-0">
              <label htmlFor={fieldId('last-name')} className="sf-label">{locale === 'pt-BR' ? 'Sobrenome' : 'Last name'}</label>
              <input
                id={fieldId('last-name')}
                type="text"
                autoComplete="family-name"
                value={formData.lastName}
                onChange={(e) => setFormData((p) => ({ ...p, lastName: e.target.value }))}
                className="sf-input"
                required
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
            <div className="min-w-0">
              <label htmlFor={fieldId('email')} className="sf-label">E-mail</label>
              <input
                id={fieldId('email')}
                type="email"
                autoComplete="email"
                value={formData.email}
                onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                className="sf-input"
                required
              />
            </div>
            <div className="min-w-0">
              <label htmlFor={fieldId('phone')} className="sf-label">{locale === 'pt-BR' ? 'Telefone' : 'Phone'}</label>
              <input
                id={fieldId('phone')}
                type="tel"
                autoComplete="tel"
                value={formData.phone}
                onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                className="sf-input sf-figure"
                required
              />
            </div>
          </div>

          {intent === 'test-drive' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label htmlFor={fieldId('preferred-date')} className="sf-label">{locale === 'pt-BR' ? 'Data' : 'Date'}</label>
                <PlatformDateInput
                  id={fieldId('preferred-date')}
                  value={formData.preferredDate}
                  onChange={(value) => setFormData((p) => ({ ...p, preferredDate: value, preferredTime: '' }))}
                  className="sf-input sf-trigger sf-figure"
                  required
                  min={localDateString(new Date(), business.timezone)}
                />
              </div>
              <div className="min-w-0">
                <label htmlFor={fieldId('preferred-time')} className="sf-label">{locale === 'pt-BR' ? 'Horário' : 'Time'}</label>
                <PlatformSelect
                  id={fieldId('preferred-time')}
                  value={formData.preferredTime}
                  onValueChange={(value) => setFormData((p) => ({ ...p, preferredTime: value }))}
                  className="sf-input sf-trigger sf-figure"
                  required
                  placeholder={locale === 'pt-BR' ? 'Selecione' : 'Select'}
                  aria-invalid={availability.status === 'closed' && formData.preferredDate ? true : undefined}
                  options={availability.status === 'open' ? availability.slots.map((slot) => ({ value: slot, label: slot })) : []}
                />
              </div>
              {availability.status === 'closed' && formData.preferredDate && (
                <p role="alert" className="sf-error col-span-2 mt-0">{closedDayLabel(availability)}</p>
              )}
            </div>
          )}

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

          <div>
            <label htmlFor={fieldId('message')} className="sf-label">
              {intent === 'contact'
                ? (locale === 'pt-BR' ? 'Dúvida sobre o veículo' : 'Vehicle question')
                : (locale === 'pt-BR' ? 'Mensagem' : 'Message')}
              {intent !== 'contact' && <span className="sf-faint"> / {locale === 'pt-BR' ? 'Opcional' : 'Optional'}</span>}
            </label>
            <textarea
              id={fieldId('message')}
              value={formData.message}
              onChange={(e) => setFormData((p) => ({ ...p, message: e.target.value }))}
              rows={3}
              className="sf-input resize-y"
              required={intent === 'contact'}
            />
          </div>

          {intent === 'reserve' && (
            <p className="sf-muted text-[length:var(--sf-text-sm)]">
              {locale === 'pt-BR' ? <>Um sinal reembolsável de {formatDeposit(vehicle.price, locale, business.currencyCode)} reserva este veículo. O pagamento é feito com cartão na próxima etapa e será abatido da compra ou devolvido integralmente se você mudar de ideia.</> : <>A refundable deposit of {formatDeposit(vehicle.price, locale, business.currencyCode)} holds this vehicle. You pay by card on the next screen, and the deposit counts toward the purchase or is refunded in full if you change your mind.</>}
            </p>
          )}

          {feedback.status === 'error' && (
            <p role="alert" className="sf-notice" data-tone="bad">
              {feedback.message || (locale === 'pt-BR' ? 'Algo deu errado. Tente novamente.' : 'Something went wrong. Please try again.')}
            </p>
          )}

          <button type="submit" disabled={isSubmitting} className="sf-btn sf-btn-primary w-full" aria-busy={isSubmitting || undefined}>
            {isSubmitting && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {isSubmitting ? (locale === 'pt-BR' ? (intent === 'reserve' ? 'Abrindo pagamento seguro' : 'Enviando') : (intent === 'reserve' ? 'Opening secure checkout' : 'Sending')) : intent === 'reserve' ? (locale === 'pt-BR' ? `Pagar sinal de ${formatDeposit(vehicle.price, locale, business.currencyCode)}` : `Pay ${formatDeposit(vehicle.price, locale, business.currencyCode)} deposit`) : (locale === 'pt-BR' ? 'Enviar solicitação' : 'Submit request')}
          </button>
        </form>
        )}
        </div>
      </div>
    </div>
  )
}
