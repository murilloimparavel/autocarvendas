'use client'

import { PlatformSelect } from '@/features/platform/components/PlatformSelect'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { fetchGraphQL } from '@/features/storefront/lib/data/graphql-client'
import { GET_VEHICLE_BY_ID } from '@/features/storefront/lib/data/queries'
import type { Vehicle } from '@/features/storefront/lib/types'
import { submitStorefrontTradeIn } from '../actions/submissions'
import { PageHeader } from '../components/PageHeader'
import { useStorefrontBusiness } from '../components/StorefrontBusinessProvider'
import { formatMileage, formatPrice } from '../lib/format'
import { customerRequestReference } from '../lib/customerRequests'
import { transitionTradeInStep, TRADE_IN_ESTIMATE_DISCLAIMER } from '../lib/tradeInForm'
import { fillBlankFields, useCustomerPrefill } from '../lib/useCustomerPrefill'
import { currencySymbol } from '../lib/format'
import {
  Field,
  FormSection,
  MobileSummary,
  Notice,
  RadioPills,
  RequestLayout,
  RequestReceived,
  Sticker,
  StickerVehicle,
  type StickerRowData,
} from '../components/forms/RequestForm'

const MAKES = [
  'Acura', 'Audi', 'BMW', 'Chevrolet', 'Ford', 'Honda', 'Hyundai', 'Kia', 'Lexus', 'Mazda',
  'Mercedes-Benz', 'Nissan', 'Subaru', 'Tesla', 'Toyota', 'Volkswagen',
]
const currentYear = new Date().getFullYear()
// Matches the server's accepted range (1980 through next model year).
const OLDEST_TRADE_YEAR = 1980
const YEARS = Array.from({ length: currentYear + 1 - OLDEST_TRADE_YEAR + 1 }, (_, i) => currentYear + 1 - i)

const CONDITIONS = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
]

const OWNERSHIP = [
  { value: 'own', label: 'Owned' },
  { value: 'financing', label: 'Financing' },
  { value: 'lease', label: 'Lease' },
]

const STEPS = ['Vehicle', 'Condition', 'Contact']

const EMPTY = {
  year: '',
  make: '',
  model: '',
  trim: '',
  mileage: '',
  vin: '',
  condition: 'good',
  ownership: 'own',
  payoffAmount: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  website: '',
}

const optionLabel = (options: { value: string; label: string }[], value: string) =>
  options.find((option) => option.value === value)?.label ?? null

export function TradeInPage() {
  const business = useStorefrontBusiness()
  const searchParams = useSearchParams()
  const interestedVehicleId = searchParams?.get('vehicleId') || ''
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState(EMPTY)
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [submitted, setSubmitted] = useState(false)
  const [submissionReference, setSubmissionReference] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [stepError, setStepError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [interestedVehicle, setInterestedVehicle] = useState<Vehicle | null>(null)
  const [estimate, setEstimate] = useState<{ min: number; max: number } | null>(null)
  const prefill = useCustomerPrefill()
  const contactPrefill = prefill
    ? { firstName: prefill.firstName, lastName: prefill.lastName, email: prefill.email, phone: prefill.phone }
    : {}

  useEffect(() => {
    if (!prefill) return
    setFormData((prev) => fillBlankFields(prev, { firstName: prefill.firstName, lastName: prefill.lastName, email: prefill.email, phone: prefill.phone }))
  }, [prefill])

  useEffect(() => {
    if (!interestedVehicleId) {
      setInterestedVehicle(null)
      return
    }

    void fetchGraphQL<{ publicInventoryVehicle: Vehicle | null }>(GET_VEHICLE_BY_ID, { id: interestedVehicleId })
      .then((data) => setInterestedVehicle(data.publicInventoryVehicle ?? null))
      .catch(() => setInterestedVehicle(null))
  }, [interestedVehicleId])

  const submitTradeIn = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const result = await submitStorefrontTradeIn({
        ...formData,
        year: parseInt(formData.year),
        mileage: parseInt(formData.mileage) || 0,
        payoffAmount: parseFloat(formData.payoffAmount) || 0,
        interestedVehicleId,
        rooftopSlug: business.rooftopSlug,
        idempotencyKey,
      })
      if (!result.success) throw new Error(result.error)
      setSubmissionReference(customerRequestReference('trade-in', result.data.tradeInId))
      const { estimatedMin, estimatedMax } = result.data
      setEstimate(
        Number.isFinite(estimatedMin) && Number.isFinite(estimatedMax) && Number(estimatedMax) > 0
          ? { min: Number(estimatedMin), max: Number(estimatedMax) }
          : null
      )
      setIdempotencyKey(crypto.randomUUID())
      setSubmitted(true)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'There was an error submitting your trade-in request. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const advanceStep = (currentStep: 1 | 2) => {
    const transition = transitionTradeInStep(currentStep, formData)
    setStepError(transition.error)
    setStep(transition.step)
  }

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (step === 1 || step === 2) {
      advanceStep(step)
      return
    }
    void submitTradeIn()
  }

  const goBack = (previousStep: 1 | 2) => {
    setStepError(null)
    setSubmitError(null)
    setStep(previousStep)
  }

  const reset = () => {
    setSubmitted(false)
    setStep(1)
    setFormData(fillBlankFields(EMPTY, contactPrefill))
    setSubmissionReference(null)
    setEstimate(null)
    setStepError(null)
    setSubmitError(null)
    setIdempotencyKey(crypto.randomUUID())
  }

  const mileage = Number(formData.mileage)
  const payoff = Number(formData.payoffAmount)
  const vehicleRows: StickerRowData[] = [
    { label: 'Vehicle', value: [formData.year, formData.make, formData.model, formData.trim].filter(Boolean).join(' '), strong: true },
    { label: 'Mileage', value: formData.mileage && Number.isFinite(mileage) ? formatMileage(mileage) : null },
    ...(formData.vin ? [{ label: 'VIN', value: formData.vin }] : []),
    { label: 'Condition', value: optionLabel(CONDITIONS, formData.condition) },
    { label: 'Ownership', value: optionLabel(OWNERSHIP, formData.ownership) },
    ...(formData.ownership === 'financing' && formData.payoffAmount && Number.isFinite(payoff)
      ? [{ label: 'Payoff', value: formatPrice(payoff, business.currencyCode) }]
      : []),
  ]
  const contactName = [formData.firstName, formData.lastName].filter(Boolean).join(' ')

  const sticker = (rows: StickerRowData[], meta?: string) => (
    <Sticker title="Trade-in" meta={meta} rows={rows}>
      {interestedVehicle && <StickerVehicle vehicle={interestedVehicle} label="Trading toward" />}
    </Sticker>
  )

  if (submitted) {
    return (
      <RequestReceived
        context="Trade-in"
        reference={submissionReference}
        note={estimate
          ? TRADE_IN_ESTIMATE_DISCLAIMER
          : 'Any offer, if made, will be shared separately after inspection and dealership review.'}
        summary={sticker([
          ...(estimate
            ? [{
                label: 'Preliminary range',
                value: <span className="sf-figure">{formatPrice(estimate.min, business.currencyCode)} to {formatPrice(estimate.max, business.currencyCode)}</span>,
                strong: true,
              }]
            : []),
          ...vehicleRows,
          { label: 'Name', value: contactName },
          { label: 'Email', value: formData.email },
          { label: 'Phone', value: formData.phone },
        ], business.shortName || business.fullName)}
        actions={
          <>
            <Link href="/inventory" className="sf-btn sf-btn-primary">Browse inventory</Link>
            <button type="button" onClick={reset} className="sf-btn sf-btn-ghost">New trade-in request</button>
            <Link href="/financing" className="sf-btn sf-btn-ghost">Financing</Link>
          </>
        }
      />
    )
  }

  const summary = sticker(
    step === 3 ? [...vehicleRows, { label: 'Name', value: contactName }] : vehicleRows,
    `Step ${step}/3`,
  )

  return (
    <>
      <PageHeader title="Trade-in review" />

      <RequestLayout summary={summary}>
        <ol className="sf-track mb-[var(--sf-space-lg)]" aria-label="Steps">
          {STEPS.map((label, i) => {
            const n = i + 1
            return (
              <li
                key={label}
                className="sf-pill cursor-default"
                data-active={step === n ? 'true' : undefined}
                aria-current={step === n ? 'step' : undefined}
                style={step > n ? { color: 'var(--sf-ink)' } : undefined}
              >
                <span className="sf-figure hidden opacity-70 sm:inline">{n}</span>
                {label}
              </li>
            )
          })}
        </ol>

        <form onSubmit={handleFormSubmit} className="space-y-[var(--sf-space-lg)]">
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

          {step === 1 && (
            <FormSection title="Your vehicle" first>
              <div className="grid gap-4">
                <Field label="Year" htmlFor="trade-year">
                  <PlatformSelect id="trade-year" name="year" required value={formData.year} onValueChange={(v) => setFormData((p) => ({ ...p, year: v }))} className="sf-input sf-trigger" placeholder="Select year" searchable options={YEARS.map((y) => ({ value: String(y), label: String(y) }))} />
                </Field>
                <Field label="Make" htmlFor="trade-make">
                  <PlatformSelect id="trade-make" name="make" required value={formData.make} onValueChange={(v) => setFormData((p) => ({ ...p, make: v }))} className="sf-input sf-trigger" placeholder="Select make" searchable options={MAKES.map((m) => ({ value: m, label: m }))} />
                </Field>
                <Field label="Model" htmlFor="trade-model">
                  <input id="trade-model" type="text" required value={formData.model} onChange={(e) => setFormData((p) => ({ ...p, model: e.target.value }))} className="sf-input" placeholder="e.g. Accord" />
                </Field>
                <Field label="Trim" htmlFor="trade-trim" optional>
                  <input id="trade-trim" type="text" value={formData.trim} onChange={(e) => setFormData((p) => ({ ...p, trim: e.target.value }))} className="sf-input" placeholder="e.g. Sport" />
                </Field>
                <Field label="Mileage" htmlFor="trade-mileage">
                  <input id="trade-mileage" type="number" inputMode="numeric" required min="0" max="2000000" step="1" value={formData.mileage} onChange={(e) => setFormData((p) => ({ ...p, mileage: e.target.value }))} className="sf-input sf-figure" placeholder="e.g. 45,000" />
                </Field>
                <Field label="VIN" htmlFor="trade-vin" optional>
                  <input id="trade-vin" type="text" value={formData.vin} onChange={(e) => setFormData((p) => ({ ...p, vin: e.target.value }))} className="sf-input sf-figure" placeholder="17 characters" maxLength={17} autoCapitalize="characters" spellCheck={false} />
                </Field>
              </div>
            </FormSection>
          )}

          {step === 2 && (
            <FormSection title="Condition" first>
              <div className="space-y-5">
                <RadioPills
                  legend="Overall condition"
                  name="condition"
                  required
                  variant="grid"
                  className="grid-cols-2 sm:grid-cols-4"
                  value={formData.condition}
                  onChange={(e) => setFormData((p) => ({ ...p, condition: e.target.value }))}
                  options={CONDITIONS}
                />
                <RadioPills
                  legend="Ownership"
                  name="ownership"
                  required
                  variant="grid"
                  className="grid-cols-3"
                  value={formData.ownership}
                  onChange={(e) => setFormData((p) => ({ ...p, ownership: e.target.value }))}
                  options={OWNERSHIP}
                />
                {formData.ownership === 'financing' && (
                  <Field label="Estimated payoff" htmlFor="trade-payoff" className="sm:max-w-xs">
                    <div className="relative">
                      <span className="sf-figure sf-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">{currencySymbol(business.currencyCode)}</span>
                      <input id="trade-payoff" type="number" inputMode="decimal" min="0" step="1" value={formData.payoffAmount} onChange={(e) => setFormData((p) => ({ ...p, payoffAmount: e.target.value }))} className="sf-input sf-figure pl-8" />
                    </div>
                  </Field>
                )}
              </div>
            </FormSection>
          )}

          {step === 3 && (
            <FormSection title="Contact" first>
              <div className="grid gap-4">
                <Field label="First name" htmlFor="trade-first-name">
                  <input id="trade-first-name" type="text" required autoComplete="given-name" value={formData.firstName} onChange={(e) => setFormData((p) => ({ ...p, firstName: e.target.value }))} className="sf-input" />
                </Field>
                <Field label="Last name" htmlFor="trade-last-name">
                  <input id="trade-last-name" type="text" required autoComplete="family-name" value={formData.lastName} onChange={(e) => setFormData((p) => ({ ...p, lastName: e.target.value }))} className="sf-input" />
                </Field>
                <Field label="Email" htmlFor="trade-email">
                  <input id="trade-email" type="email" required autoComplete="email" value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} className="sf-input" />
                </Field>
                <Field label="Phone" htmlFor="trade-phone">
                  <input id="trade-phone" type="tel" required autoComplete="tel" value={formData.phone} onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))} className="sf-input" />
                </Field>
              </div>
            </FormSection>
          )}

          <div className="space-y-4">
            {step === 3 && <MobileSummary>{summary}</MobileSummary>}

            {stepError && <Notice tone="bad">{stepError}</Notice>}
            {step === 3 && submitError && <Notice tone="bad">{submitError}</Notice>}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
              {step > 1 && (
                <button type="button" onClick={() => goBack(step === 3 ? 2 : 1)} className="sf-btn sf-btn-ghost w-full sm:w-auto">
                  Back
                </button>
              )}
              <button type="submit" disabled={step === 3 && isSubmitting} className="sf-btn sf-btn-primary w-full sm:w-auto sm:min-w-56">
                {step === 3 ? (isSubmitting ? 'Sending…' : 'Send trade-in request') : 'Continue'}
              </button>
            </div>
          </div>
        </form>
      </RequestLayout>
    </>
  )
}
