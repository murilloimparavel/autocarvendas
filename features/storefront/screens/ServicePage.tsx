'use client'

import { PlatformDateInput } from '@/features/platform/components/PlatformDateTime'
import { PlatformSelect } from '@/features/platform/components/PlatformSelect'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, X } from 'lucide-react'
import { fetchGraphQL } from '@/features/storefront/lib/data/graphql-client'
import { submitStorefrontService } from '../actions/submissions'
import { PageHeader } from '../components/PageHeader'
import { useStorefrontBusiness } from '../components/StorefrontBusinessProvider'
import { formatServicePackagePrice } from '../lib/servicePackagePrice'
import { readServiceMenu, serviceTypeForPackage, type ServiceMenuState } from '../lib/serviceMenuState'
import { customerRequestReference } from '../lib/customerRequests'
import { fillBlankFields, useCustomerPrefill } from '../lib/useCustomerPrefill'
import { DEFAULT_SERVICE_SLOTS, closedDayLabel, dayAvailability, localDateString } from '../lib/bookingSlots'
import {
  Field,
  FormSection,
  MobileSummary,
  Notice,
  RadioPills,
  RequestLayout,
  RequestReceived,
  Sticker,
  formatRequestDate,
  type StickerRowData,
} from '../components/forms/RequestForm'

const GET_SERVICE_PACKAGES = `
  query GetServicePackages {
    servicePackages(orderBy: { priceCents: asc }) {
      id
      name
      description
      price
      estimatedDuration
    }
  }
`

const SERVICE_TYPES = [
  { value: 'oil_change', label: 'Oil Change' },
  { value: 'brake_service', label: 'Brake Service' },
  { value: 'battery_service', label: 'Battery Service' },
  { value: 'diagnostics', label: 'Diagnostics' },
  { value: 'tire_service', label: 'Tire Service' },
  { value: 'state_inspection', label: 'State Inspection' },
  { value: 'scheduled_maintenance', label: 'Scheduled Maintenance' },
  { value: 'repair', label: 'Repair' },
  { value: 'other', label: 'Other' },
]

const PACKAGE_CHOICE = 'package:'

const EMPTY = {
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  appointmentDate: '',
  appointmentTime: '',
  serviceType: '',
  vehicleYear: '',
  vehicleMake: '',
  vehicleModel: '',
  vehicleVin: '',
  description: '',
  website: '',
}

function formatDuration(minutes: number | null) {
  const total = Number(minutes)
  if (!(total > 0)) return null
  const hours = Math.floor(total / 60)
  const rest = total % 60
  return `${hours > 0 ? `${hours}h ` : ''}${rest > 0 ? `${rest}m` : ''}`.trim()
}

export function ServicePage() {
  const business = useStorefrontBusiness()
  const [formData, setFormData] = useState(EMPTY)
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [requestReference, setRequestReference] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const [serviceMenu, setServiceMenu] = useState<ServiceMenuState>({ kind: 'loading' })
  const [serviceMenuRequest, setServiceMenuRequest] = useState(0)
  const [submittedRows, setSubmittedRows] = useState<StickerRowData[] | null>(null)
  const prefill = useCustomerPrefill()

  useEffect(() => {
    if (!prefill) return
    setFormData((prev) => fillBlankFields(prev, { customerName: prefill.name, customerEmail: prefill.email, customerPhone: prefill.phone }))
  }, [prefill])

  useEffect(() => {
    let active = true
    void readServiceMenu(() => fetchGraphQL<unknown>(GET_SERVICE_PACKAGES))
      .then((result) => {
        if (active) setServiceMenu(result)
      })

    return () => {
      active = false
    }
  }, [serviceMenuRequest])

  const retryServiceMenu = () => {
    setServiceMenu({ kind: 'loading' })
    setServiceMenuRequest(request => request + 1)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'appointmentDate' ? { appointmentTime: '' } : {}),
    }))
  }

  const bookPackage = (name: string) => {
    setSelectedPackage(name)
    setFormData((prev) => ({ ...prev, serviceType: serviceTypeForPackage(name, SERVICE_TYPES) }))
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const clearPackage = () => {
    setSelectedPackage(null)
    setFormData((prev) => ({ ...prev, serviceType: '' }))
  }

  // One choice: a menu package or, without one, a service type. Both live in the same select.
  const menuPackages = serviceMenu.kind === 'ready' ? serviceMenu.packages : []
  const serviceChoice = selectedPackage ? `${PACKAGE_CHOICE}${selectedPackage}` : formData.serviceType
  const chooseService = (value: string) => {
    if (value.startsWith(PACKAGE_CHOICE)) {
      const name = value.slice(PACKAGE_CHOICE.length)
      setSelectedPackage(name)
      setFormData((prev) => ({ ...prev, serviceType: serviceTypeForPackage(name, SERVICE_TYPES) }))
      return
    }
    setSelectedPackage(null)
    setFormData((prev) => ({ ...prev, serviceType: value }))
  }

  const selectedPackagePrice = serviceMenu.kind === 'ready' && selectedPackage
    ? formatServicePackagePrice(serviceMenu.packages.find((pkg) => pkg.name === selectedPackage)?.price, business.currencyCode)
    : null
  const serviceTypeLabel = SERVICE_TYPES.find((type) => type.value === formData.serviceType)?.label ?? null
  const vehicleLabel = [formData.vehicleYear, formData.vehicleMake, formData.vehicleModel].filter(Boolean).join(' ')

  const summaryRows = (): StickerRowData[] => [
    ...(selectedPackage
      ? [{ label: 'Package', value: selectedPackage }]
      : [{ label: 'Service', value: serviceTypeLabel }]),
    ...(selectedPackagePrice ? [{ label: 'Price', value: selectedPackagePrice, strong: true }] : []),
    { label: 'Date', value: formData.appointmentDate ? formatRequestDate(formData.appointmentDate) : null },
    { label: 'Time', value: formData.appointmentTime },
    { label: 'Vehicle', value: vehicleLabel },
    ...(formData.vehicleVin ? [{ label: 'VIN', value: formData.vehicleVin }] : []),
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitStatus('idle')
    setSubmitError(null)
    const rows = summaryRows()
    try {
      const result = await submitStorefrontService({
        ...formData,
        description: selectedPackage
          ? [`Service package: ${selectedPackage}`, formData.description].filter(Boolean).join('\n\n')
          : formData.description,
        vehicleYear: parseInt(formData.vehicleYear),
        servicePackageId: serviceMenu.kind === 'ready' && selectedPackage
          ? serviceMenu.packages.find((pkg) => pkg.name === selectedPackage)?.id
          : undefined,
        rooftopSlug: business.rooftopSlug,
        idempotencyKey,
      })
      if (!result.success) throw new Error(result.error)
      setSubmittedRows(rows)
      setRequestReference(customerRequestReference('service', result.data.serviceAppointmentId))
      setSubmitStatus('success')
      setIdempotencyKey(crypto.randomUUID())
      setFormData(prefill
        ? fillBlankFields(EMPTY, { customerName: prefill.name, customerEmail: prefill.email, customerPhone: prefill.phone })
        : EMPTY)
      setSelectedPackage(null)
    } catch (error) {
      setSubmitError(error instanceof Error && error.message ? error.message : null)
      setSubmitStatus('error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const minDate = localDateString(new Date(), business.timezone)
  const availability = dayAvailability(business, formData.appointmentDate, DEFAULT_SERVICE_SLOTS)

  if (submitStatus === 'success') {
    return (
      <RequestReceived
        context="Service"
        reference={requestReference}
        summary={<Sticker title="Service appointment" meta={business.shortName || business.fullName} rows={submittedRows ?? []} />}
        actions={
          <>
            <Link href="/" className="sf-btn sf-btn-primary">Back to home</Link>
            <Link href="/inventory" className="sf-btn sf-btn-ghost">Inventory</Link>
            <Link href="/account" className="sf-btn sf-btn-ghost">Account</Link>
          </>
        }
      />
    )
  }

  const summary = (
    <Sticker
      title="Service appointment"
      meta={business.shortName || business.fullName}
      rows={summaryRows()}
      footer={selectedPackage ? (
        <button type="button" onClick={clearPackage} className="sf-link inline-flex min-h-11 items-center gap-1.5 text-[length:var(--sf-text-sm)]">
          <X className="size-4" aria-hidden="true" />
          Remove package
        </button>
      ) : undefined}
    />
  )

  return (
    <>
      <PageHeader title="Book service" tone="lane" />

      <RequestLayout summary={summary}>
        <div className="space-y-[var(--sf-space-xl)]">
          <FormSection title="Service menu" first>
            {serviceMenu.kind === 'loading' ? (
              <div className="space-y-2" aria-label="Loading service menu">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="sf-skeleton h-20" aria-hidden />
                ))}
              </div>
            ) : serviceMenu.kind === 'ready' ? (
              <ul className="border-t" style={{ borderColor: 'var(--sf-rule)' }}>
                {serviceMenu.packages.map((pkg) => {
                  const selected = selectedPackage === pkg.name
                  const duration = formatDuration(pkg.estimatedDuration)
                  return (
                    <li key={pkg.id} className="border-b" style={{ borderColor: 'var(--sf-rule)' }}>
                      <button
                        type="button"
                        onClick={() => bookPackage(pkg.name)}
                        aria-pressed={selected}
                        className="grid w-full grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-x-3 px-2 py-4 text-left transition-colors hover:bg-[var(--sf-paper-2)] aria-pressed:bg-[var(--sf-accent-soft)] sm:px-3"
                      >
                        <span
                          className="mt-0.5 grid size-6 place-items-center rounded-[var(--sf-radius-sm)] border"
                          style={selected
                            ? { background: 'var(--sf-accent-fill)', borderColor: 'var(--sf-accent-fill)', color: 'var(--sf-accent-ink)' }
                            : { borderColor: 'var(--sf-rule)', background: 'var(--sf-paper)' }}
                          aria-hidden="true"
                        >
                          {selected && <Check className="size-3.5" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0">
                          <span className="sf-heading block text-[length:var(--sf-text-md)]">{pkg.name}</span>
                          {pkg.description && (
                            <span className="sf-muted mt-1 block text-[length:var(--sf-text-sm)]">{pkg.description}</span>
                          )}
                          {duration && <span className="sf-figure sf-faint mt-1.5 block text-[length:var(--sf-text-xs)]">{duration}</span>}
                        </span>
                        <span className="sf-price text-right text-[length:var(--sf-text-lg)]">
                          {formatServicePackagePrice(pkg.price, business.currencyCode) ?? (
                            <span className="sf-faint font-sans text-[length:var(--sf-text-xs)] font-medium">Price unavailable</span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : serviceMenu.kind === 'empty' ? (
              <div className="sf-well p-5">
                <p className="sf-muted text-[length:var(--sf-text-sm)]" role="status">No service packages listed.</p>
              </div>
            ) : (
              <div className="sf-well flex flex-col items-start gap-4 p-5" role="status">
                <p className="sf-title-line text-[length:var(--sf-text-sm)]">
                  <span className="sf-dot" data-tone="bad" aria-hidden="true" />
                  <span>
                    Service menu unavailable.
                    {business.serviceEmail ? (
                      <> Email <a href={`mailto:${business.serviceEmail}`} className="sf-link break-all">{business.serviceEmail}</a>.</>
                    ) : null}
                  </span>
                </p>
                <button type="button" onClick={retryServiceMenu} className="sf-btn sf-btn-ghost sf-btn-sm min-h-10">Retry service menu</button>
              </div>
            )}
          </FormSection>

          <div ref={formRef} className="scroll-mt-28">
            <form onSubmit={handleSubmit} className="space-y-[var(--sf-space-xl)]">
              <FormSection title="Date and time">
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Date" htmlFor="appointmentDate">
                      <PlatformDateInput
                        id="appointmentDate"
                        name="appointmentDate"
                        required
                        min={minDate}
                        value={formData.appointmentDate}
                        onChange={(value) => setFormData((prev) => ({ ...prev, appointmentDate: value, appointmentTime: '' }))}
                        className="sf-input sf-trigger"
                      />
                    </Field>
                    <Field label="Service" htmlFor="serviceType">
                      <PlatformSelect
                        id="serviceType"
                        name="serviceType"
                        required
                        value={serviceChoice}
                        onValueChange={chooseService}
                        className="sf-input sf-trigger"
                        placeholder="Select service"
                        options={[
                          ...menuPackages.map((pkg) => ({ value: `${PACKAGE_CHOICE}${pkg.name}`, label: pkg.name })),
                          ...SERVICE_TYPES.map((type) => ({ value: type.value, label: type.label })),
                        ]}
                      />
                    </Field>
                  </div>

                  {availability.status === 'closed' ? (
                    <div className="sf-well p-4">
                      <p role="alert" className="sf-title-line text-[length:var(--sf-text-sm)]">
                        <span className="sf-dot" data-tone="bad" aria-hidden="true" />
                        <span>{closedDayLabel(availability)} Choose another date.</span>
                      </p>
                    </div>
                  ) : (
                    <RadioPills
                      legend="Time"
                      name="appointmentTime"
                      required
                      variant="grid"
                      className="grid-cols-3 sm:grid-cols-4 xl:grid-cols-5"
                      value={formData.appointmentTime}
                      onChange={handleChange}
                      options={availability.slots.map((slot) => ({
                        value: slot,
                        label: <span className="sf-figure">{slot}</span>,
                      }))}
                    />
                  )}
                </div>
              </FormSection>

              <FormSection title="Vehicle">
                <div className="grid gap-4">
                  <Field label="Year" htmlFor="vehicleYear" className="sm:max-w-[10rem]">
                    <input
                      id="vehicleYear"
                      name="vehicleYear"
                      type="number"
                      inputMode="numeric"
                      required
                      min="1900"
                      max={new Date().getFullYear() + 1}
                      value={formData.vehicleYear}
                      onChange={handleChange}
                      className="sf-input sf-figure"
                      placeholder="e.g. 2020"
                    />
                  </Field>
                  <Field label="Make" htmlFor="vehicleMake">
                    <input
                      id="vehicleMake"
                      name="vehicleMake"
                      type="text"
                      required
                      value={formData.vehicleMake}
                      onChange={handleChange}
                      className="sf-input"
                      placeholder="e.g. Toyota"
                    />
                  </Field>
                  <Field label="Model" htmlFor="vehicleModel">
                    <input
                      id="vehicleModel"
                      name="vehicleModel"
                      type="text"
                      required
                      value={formData.vehicleModel}
                      onChange={handleChange}
                      className="sf-input"
                      placeholder="e.g. Camry"
                    />
                  </Field>
                  <Field label="VIN" htmlFor="vehicleVin" optional>
                    <input
                      id="vehicleVin"
                      name="vehicleVin"
                      type="text"
                      maxLength={17}
                      value={formData.vehicleVin}
                      onChange={handleChange}
                      className="sf-input sf-figure"
                      placeholder="17 characters"
                      autoCapitalize="characters"
                      spellCheck={false}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection title="Contact">
                <div className="grid gap-4">
                  <Field label="Full name" htmlFor="customerName">
                    <input
                      id="customerName"
                      name="customerName"
                      type="text"
                      required
                      value={formData.customerName}
                      onChange={handleChange}
                      className="sf-input"
                      autoComplete="name"
                    />
                  </Field>
                  <Field label="Email" htmlFor="customerEmail">
                    <input
                      id="customerEmail"
                      name="customerEmail"
                      type="email"
                      required
                      value={formData.customerEmail}
                      onChange={handleChange}
                      className="sf-input"
                      autoComplete="email"
                    />
                  </Field>
                  <Field label="Phone" htmlFor="customerPhone">
                    <input
                      id="customerPhone"
                      name="customerPhone"
                      type="tel"
                      required
                      value={formData.customerPhone}
                      onChange={handleChange}
                      className="sf-input"
                      autoComplete="tel"
                    />
                  </Field>
                  <Field label="Service notes" htmlFor="description" optional>
                    <textarea
                      id="description"
                      name="description"
                      rows={4}
                      value={formData.description}
                      onChange={handleChange}
                      className="sf-input"
                    />
                  </Field>
                </div>
              </FormSection>

              <input
                type="text"
                name="website"
                value={formData.website}
                onChange={handleChange}
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
                aria-hidden="true"
              />

              <div className="space-y-4">
                <MobileSummary>{summary}</MobileSummary>

                {submitStatus === 'error' && (
                  <Notice tone="bad">
                    {submitError || 'There was an error submitting your service request.'} Please try again
                    {business.serviceEmail ? (
                      <> or email <a href={`mailto:${business.serviceEmail}`} className="sf-link break-all">{business.serviceEmail}</a></>
                    ) : null}.
                  </Notice>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="submit"
                    disabled={isSubmitting || availability.status === 'closed'}
                    className="sf-btn sf-btn-primary w-full sm:w-auto sm:min-w-56"
                  >
                    {isSubmitting ? 'Sending…' : 'Send service request'}
                  </button>
                  <Link href="/" className="sf-btn sf-btn-ghost w-full sm:w-auto">
                    Cancel
                  </Link>
                </div>
              </div>
            </form>
          </div>
        </div>
      </RequestLayout>
    </>
  )
}
