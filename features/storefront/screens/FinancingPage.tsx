'use client'

import { PlatformSelect } from '@/features/platform/components/PlatformSelect'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { fetchGraphQL } from '@/features/storefront/lib/data/graphql-client'
import { GET_VEHICLE_BY_ID } from '@/features/storefront/lib/data/queries'
import type { Vehicle } from '@/features/storefront/lib/types'
import { submitStorefrontFinancing } from '../actions/submissions'
import { Container } from '../components/Container'
import { PageHeader } from '../components/PageHeader'
import { useStorefrontBusiness } from '../components/StorefrontBusinessProvider'
import { currencySymbol, formatPrice, storefrontCurrency, vehicleTitle } from '../lib/format'
import { customerRequestReference } from '../lib/customerRequests'
import { fillBlankFields, useCustomerPrefill } from '../lib/useCustomerPrefill'
import { FINANCING_ANNUAL_INCOME_INPUT, isFinancingSubmitDisabled } from '../lib/financingForm'
import { buildAmortizationSchedule, calculateFinancingEstimate, parseFinancingAmount } from '../lib/data/financing-calculator'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { classifyVehicleDetailResponse } from '../lib/data/vehicle-detail-response'
import {
  Field,
  FormSection,
  MobileSummary,
  Notice,
  ACTION_ROW,
  RequestLayout,
  Sticker,
  StickerVehicle,
  type StickerRowData,
} from '../components/forms/RequestForm'

type SelectedVehicleLookup =
  | { status: 'none' }
  | { status: 'loading' | 'error' | 'not-found'; vehicleId: string }
  | { status: 'available'; vehicleId: string; vehicle: Vehicle }

const LOAN_TERMS = [36, 48, 60, 72, 84]
const DEFAULT_INTEREST_RATE = 7.5
const DEFAULT_DOWN_PAYMENT_PERCENT = 10
const DOWN_PAYMENT_PRESETS = [0, 10, 15, 20, 25]

function FinancingContent() {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const text = (en: string, br: string) => pt ? br : en
  const business = useStorefrontBusiness()
  const currency = storefrontCurrency(business.currencyCode)
  const symbol = currencySymbol(currency)
  const money = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
  const wholeMoney = (value: number) => formatPrice(value, currency, locale)
  const searchParams = useSearchParams()
  const vehiclePrice = searchParams?.get('price') ?? null
  const vehicleId = searchParams?.get('vehicleId') || ''
  const queryPrice = parseFinancingAmount(vehiclePrice)
  const initialVehiclePrice = !vehicleId && queryPrice.status === 'valid' ? String(queryPrice.value) : ''
  const initialDownPayment = queryPrice.status === 'valid' && queryPrice.value > 0
    ? ((queryPrice.value * DEFAULT_DOWN_PAYMENT_PERCENT) / 100).toFixed(2)
    : ''

  const [formData, setFormData] = useState({
    vehiclePrice: initialVehiclePrice,
    downPayment: initialVehiclePrice ? initialDownPayment : '',
    downPaymentPercent: DEFAULT_DOWN_PAYMENT_PERCENT,
    interestRate: DEFAULT_INTEREST_RATE,
    loanTerm: 60,
    tradeInValue: '',
  })

  const [applicationForm, setApplicationForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    employmentStatus: '',
    annualIncome: '',
    creditTier: '',
    consent: false,
    privacyAcknowledged: false,
    website: '',
  })
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [isApplying, setIsApplying] = useState(false)
  const [applicationStatus, setApplicationStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [applicationReference, setApplicationReference] = useState<string | null>(null)
  const [applicationError, setApplicationError] = useState<string | null>(null)
  const [vehicleLookup, setVehicleLookup] = useState<SelectedVehicleLookup>(
    vehicleId ? { status: 'loading', vehicleId } : { status: 'none' },
  )
  const [vehicleLookupRetry, setVehicleLookupRetry] = useState(0)
  const [showAmortization, setShowAmortization] = useState(false)
  const prefill = useCustomerPrefill()

  useEffect(() => {
    if (!prefill) return
    setApplicationForm((prev) => fillBlankFields(prev, { fullName: prefill.name, email: prefill.email, phone: prefill.phone }))
  }, [prefill])

  const currentVehicleLookup = vehicleId && vehicleLookup.status !== 'none' && vehicleLookup.vehicleId === vehicleId
    ? vehicleLookup
    : vehicleId ? { status: 'loading' as const, vehicleId } : { status: 'none' as const }
  const selectedVehicle = currentVehicleLookup.status === 'available' ? currentVehicleLookup.vehicle : null
  const selectedPrice = selectedVehicle ? parseFinancingAmount(selectedVehicle.price) : null
  const selectedPriceLabel = selectedPrice?.status === 'valid' && selectedPrice.value > 0
    ? formatPrice(selectedPrice.value, currency, locale)
    : text('Price unavailable', 'Preço indisponível')
  const calculationInput = currentVehicleLookup.status === 'loading' ? { ...formData, vehiclePrice: '' } : formData
  const calculation = calculateFinancingEstimate(calculationInput)
  const calculatedResults = 'estimate' in calculation ? calculation.estimate : null
  const amortizationSchedule = calculation.status === 'ready' && calculatedResults
    ? buildAmortizationSchedule(calculatedResults, formData.interestRate, formData.loanTerm)
    : []
  const invalidPriceFromLink = !vehicleId && vehiclePrice !== null && queryPrice.status === 'invalid' && !formData.vehiclePrice

  useEffect(() => {
    if (!vehicleId) {
      setVehicleLookup({ status: 'none' })
      return
    }

    let isCurrentRequest = true
    setVehicleLookup({ status: 'loading', vehicleId })
    void fetchGraphQL<unknown>(GET_VEHICLE_BY_ID, { id: vehicleId })
      .then((response) => {
        if (!isCurrentRequest) return
        const result = classifyVehicleDetailResponse<Vehicle>(response, vehicleId)
        if (result.status === 'available') {
          setVehicleLookup({ status: 'available', vehicleId, vehicle: result.vehicle })
          const currentPrice = parseFinancingAmount(result.vehicle.price)
          if (currentPrice.status === 'valid' && currentPrice.value > 0) {
            setFormData((prev) => prev.vehiclePrice ? prev : {
              ...prev,
              vehiclePrice: String(currentPrice.value),
              downPayment: ((currentPrice.value * prev.downPaymentPercent) / 100).toFixed(2),
            })
          }
        } else if (result.status === 'not-found') {
          setVehicleLookup({ status: 'not-found', vehicleId })
        } else {
          setVehicleLookup({ status: 'error', vehicleId })
        }
      })
      .catch(() => {
        if (isCurrentRequest) setVehicleLookup({ status: 'error', vehicleId })
      })
    return () => {
      isCurrentRequest = false
    }
  }, [vehicleId, vehicleLookupRetry])

  useEffect(() => {
    if (!vehicleId) return
    setFormData((prev) => prev.vehiclePrice || prev.downPayment
      ? { ...prev, vehiclePrice: '', downPayment: '' }
      : prev)
  }, [vehicleId])

  useEffect(() => {
    if (vehicleId) return
    const linkedPrice = parseFinancingAmount(vehiclePrice)
    const nextPrice = linkedPrice.status === 'valid' ? String(linkedPrice.value) : ''
    setFormData((prev) => {
      if (prev.vehiclePrice === nextPrice) return prev
      return {
        ...prev,
        vehiclePrice: nextPrice,
        ...(linkedPrice.status === 'valid' && linkedPrice.value > 0
          ? { downPayment: ((linkedPrice.value * prev.downPaymentPercent) / 100).toFixed(2) }
          : {}),
      }
    })
  }, [vehicleId, vehiclePrice])

  const retryVehicleLookup = () => {
    setVehicleLookup({ status: 'loading', vehicleId })
    setVehicleLookupRetry((current) => current + 1)
  }

  const handleDownPaymentChange = (value: string) => {
    const downPayment = value ? parseFinancingAmount(value) : { status: 'valid' as const, value: 0 }
    const price = parseFinancingAmount(formData.vehiclePrice)
    const percent = price.status === 'valid' && price.value > 0 && downPayment.status === 'valid'
      ? (downPayment.value / price.value) * 100
      : 0
    setFormData((prev) => ({ ...prev, downPayment: value, downPaymentPercent: percent }))
  }

  const handleApplicationSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsApplying(true)
    setApplicationStatus('idle')
    setApplicationError(null)

    try {
      const result = await submitStorefrontFinancing({
        ...applicationForm,
        annualIncome: parseFloat(applicationForm.annualIncome) || 0,
        requestedAmount: calculation.status === 'ready' || calculation.status === 'no-loan'
          ? calculatedResults?.loanAmount ?? null
          : calculation.status === 'zero-price' ? 0 : null,
        monthlyPayment: calculation.status === 'ready' ? calculatedResults?.monthlyPayment ?? null : null,
        downPayment: parseFloat(formData.downPayment || '0') || 0,
        tradeInValue: parseFloat(formData.tradeInValue || '0') || 0,
        apr: formData.interestRate,
        loanTerm: formData.loanTerm,
        vehicleId: selectedVehicle?.id,
        rooftopSlug: business.rooftopSlug,
        idempotencyKey,
      })

      if (!result.success) throw new Error(result.error)

      setApplicationReference(
        result.data.applicationReference || customerRequestReference('financing', result.data.applicationId)
      )
      setApplicationStatus('success')
      setIdempotencyKey(crypto.randomUUID())
      setApplicationForm({
        fullName: prefill?.name || '',
        email: prefill?.email || '',
        phone: prefill?.phone || '',
        employmentStatus: '',
        annualIncome: '',
        creditTier: '',
        consent: false,
        privacyAcknowledged: false,
        website: '',
      })
    } catch (error) {
      setApplicationError(error instanceof Error && error.message ? error.message : null)
      setApplicationStatus('error')
    } finally {
      setIsApplying(false)
    }
  }

  const setDownPaymentPercent = (percent: number) => {
    setFormData((prev) => {
      const price = parseFinancingAmount(prev.vehiclePrice)
      return {
        ...prev,
        downPaymentPercent: percent,
        ...(price.status === 'valid' && price.value > 0
          ? { downPayment: ((price.value * percent) / 100).toFixed(2) }
          : {}),
      }
    })
  }

  const estimateReadout = calculation.status === 'ready' && calculatedResults ? (
    <div className="px-4 pb-4 pt-5">
      <p className="sf-eyebrow">{text('Monthly payment', 'Parcela mensal')}</p>
      <p className="sf-price mt-2 text-[length:var(--sf-text-display)]" aria-live="polite">
        {money(calculatedResults.monthlyPayment)}
      </p>
      <p className="sf-figure sf-muted mt-2 text-[length:var(--sf-text-sm)]">
        {pt ? `${formData.loanTerm} meses / ${formData.interestRate}% a.a.` : `${formData.loanTerm} mo / ${formData.interestRate}% APR`}
      </p>
    </div>
  ) : (
    <div className="px-4 py-5">
      <p className="sf-eyebrow">{text('Monthly payment', 'Parcela mensal')}</p>
      {calculation.status === 'no-loan' ? (
        <p role="status" className="sf-title-line mt-3 text-[length:var(--sf-text-sm)]">
          <span className="sf-dot" data-tone="ok" aria-hidden="true" />
          <span>{text('Down payment and trade-in cover the full price.', 'A entrada e o veículo na troca cobrem o valor total.')}</span>
        </p>
      ) : calculation.status === 'invalid-price' || calculation.status === 'invalid-input' ? (
        <p role="alert" className="sf-title-line mt-3 text-[length:var(--sf-text-sm)]">
          <span className="sf-dot" data-tone="bad" aria-hidden="true" />
          <span>{text('Check the amounts entered.', 'Confira os valores informados.')}</span>
        </p>
      ) : (
        <p role="status" className="sf-faint mt-3 text-[length:var(--sf-text-sm)]">{text('Enter a vehicle price.', 'Informe o preço do veículo.')}</p>
      )}
    </div>
  )

  const estimateRows: StickerRowData[] = calculatedResults && (calculation.status === 'ready' || calculation.status === 'no-loan')
    ? [
        { label: text('Vehicle price', 'Valor do veículo'), value: wholeMoney(calculatedResults.vehiclePrice) },
        { label: text('Down payment', 'Entrada'), value: `−${wholeMoney(calculatedResults.downPayment)}` },
        ...(calculatedResults.tradeInValue > 0
          ? [{ label: text('Trade-in', 'Veículo na troca'), value: `−${wholeMoney(calculatedResults.tradeInValue)}` }]
          : []),
        { label: text('Loan amount', 'Valor financiado'), value: wholeMoney(calculatedResults.loanAmount), strong: true },
        ...(calculation.status === 'ready'
          ? [
              { label: text('Total interest', 'Total de juros'), value: `+${money(calculatedResults.totalInterest)}` },
              { label: text('Total payment', 'Total pago'), value: money(calculatedResults.totalPayment), strong: true },
            ]
          : []),
      ]
    : []

  const summary = (
    <Sticker
      title={text('Payment estimate', 'Simulação de financiamento')}
      meta={pt ? `${formData.loanTerm} meses` : `${formData.loanTerm} mo`}
      rows={estimateRows}
      footer={<p className="sf-faint text-[length:var(--sf-text-xs)]">{text('Estimate. Actual rates and terms may differ.', 'Simulação. As taxas e condições reais podem variar.')}</p>}
    >
      {selectedVehicle && <StickerVehicle vehicle={selectedVehicle} label={`${text('Vehicle', 'Veículo')} / ${selectedPriceLabel}`} />}
      <div className={estimateRows.length ? 'border-b border-dashed' : undefined} style={{ borderColor: 'var(--sf-rule)' }}>
        {estimateReadout}
      </div>
    </Sticker>
  )

  const roundedPercent = Math.round(formData.downPaymentPercent * 10) / 10

  return (
    <>
      <PageHeader title={text('Payment estimate', 'Simulação de financiamento')} />

      <RequestLayout summary={summary}>
        <div className="space-y-[var(--sf-space-xl)]">
          {vehicleId && currentVehicleLookup.status === 'loading' && (
            <Notice role="status">{text('Loading vehicle…', 'Carregando veículo…')}</Notice>
          )}
          {vehicleId && currentVehicleLookup.status === 'not-found' && (
            <Notice tone="warn" role="status">
                {text('This vehicle is no longer available.', 'Este veículo não está mais disponível.')} {' '}
              <Link href="/inventory" className="sf-link">{text('Browse inventory', 'Ver estoque')}</Link>
            </Notice>
          )}
          {vehicleId && currentVehicleLookup.status === 'error' && (
            <Notice tone="bad">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{text('This vehicle couldn’t be loaded.', 'Não foi possível carregar este veículo.')}</span>
                <button type="button" onClick={retryVehicleLookup} className="sf-btn sf-btn-ghost sf-btn-sm min-h-10">{text('Retry', 'Tentar novamente')}</button>
              </div>
            </Notice>
          )}

          <FormSection
            title={text('Loan', 'Financiamento')}
            first
            aside={selectedVehicle ? (
              <Link href={`/inventory/${selectedVehicle.id}`} className="sf-link shrink-0 text-[length:var(--sf-text-sm)]">
                {text('Vehicle details', 'Detalhes do veículo')}
              </Link>
            ) : undefined}
          >
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={text('Vehicle price', 'Valor do veículo')} htmlFor="financing-vehicle-price">
                  <div className="relative">
                    <span className="sf-figure sf-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">{symbol}</span>
                    <input
                      id="financing-vehicle-price"
                      type="number"
                      inputMode="decimal"
                      value={formData.vehiclePrice}
                      onChange={(e) => {
                        const value = e.target.value
                        const amount = parseFinancingAmount(value)
                        setFormData((prev) => ({
                          ...prev,
                          vehiclePrice: value,
                          ...(amount.status === 'valid' && amount.value > 0
                            ? { downPayment: ((amount.value * prev.downPaymentPercent) / 100).toFixed(2) }
                            : {}),
                        }))
                      }}
                      className="sf-input sf-figure pl-8"
                      placeholder={text('e.g. 35,000', 'Ex.: 35.000')}
                      step="0.01"
                      min="0"
                      aria-invalid={invalidPriceFromLink || undefined}
                    />
                  </div>
                  {invalidPriceFromLink && (
                    <p role="alert" className="sf-error">{text('Enter a vehicle price.', 'Informe o preço do veículo.')}</p>
                  )}
                </Field>
                <Field label={text('Interest rate', 'Taxa de juros anual')} htmlFor="financing-apr">
                  <div className="relative">
                    <input
                      id="financing-apr"
                      type="number"
                      inputMode="decimal"
                      value={formData.interestRate}
                      onChange={(e) => setFormData((prev) => ({ ...prev, interestRate: parseFloat(e.target.value) || 0 }))}
                      className="sf-input sf-figure pr-8"
                      placeholder={text('e.g. 7.5', 'Ex.: 7,5')}
                      step="0.1"
                      min="0"
                      max="30"
                    />
                    <span className="sf-figure sf-faint pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">%</span>
                  </div>
                </Field>
              </div>

              <div>
                <p id="financing-loan-term" className="sf-label">{text('Term', 'Prazo')}</p>
                <div role="group" aria-labelledby="financing-loan-term" className="sf-track sf-track-block">
                  {LOAN_TERMS.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, loanTerm: term }))}
                      className="sf-pill min-h-12 gap-1 px-2"
                      aria-pressed={formData.loanTerm === term}
                    >
                      <span className="sf-figure text-[length:var(--sf-text-lg)]">{term}</span>
                      <span className="sf-faint text-[length:var(--sf-text-xs)] max-[379px]:hidden">{pt ? 'meses' : 'mo'}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor="financing-down-payment" className="sf-label">{text('Down payment', 'Entrada')}</label>
                  <span className="sf-figure sf-muted text-[length:var(--sf-text-sm)]">{formData.downPaymentPercent.toFixed(1)}%</span>
                </div>
                <div role="group" aria-label={text('Down payment share', 'Percentual de entrada')} className="sf-track sf-track-block mb-3">
                  {DOWN_PAYMENT_PRESETS.map((percent) => (
                    <button
                      key={percent}
                      type="button"
                      onClick={() => setDownPaymentPercent(percent)}
                      className="sf-pill min-h-12 px-2"
                      aria-pressed={roundedPercent === percent}
                    >
                      <span className="sf-figure text-[length:var(--sf-text-lg)]">{percent}</span>
                      <span className="sf-figure sf-faint text-[length:var(--sf-text-xs)]">%</span>
                    </button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-center">
                  <div className="relative">
                    <span className="sf-figure sf-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">{symbol}</span>
                    <input
                      id="financing-down-payment"
                      type="number"
                      inputMode="decimal"
                      value={formData.downPayment}
                      onChange={(e) => handleDownPaymentChange(e.target.value)}
                      className="sf-input sf-figure pl-8"
                      placeholder={text('e.g. 3,500', 'Ex.: 3.500')}
                      step="100"
                      min="0"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="sf-figure sf-faint text-[length:var(--sf-text-xs)]">0%</span>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      step="1"
                      value={formData.downPaymentPercent}
                      onChange={(e) => setDownPaymentPercent(parseFloat(e.target.value))}
                      className="h-11 w-full min-w-0 accent-[var(--sf-accent)]"
                      aria-label={text('Down payment percentage', 'Percentual de entrada')}
                    />
                    <span className="sf-figure sf-faint text-[length:var(--sf-text-xs)]">50%</span>
                  </div>
                </div>
              </div>

              <Field label={text('Trade-in amount', 'Valor do veículo na troca')} htmlFor="financing-trade-in" className="sm:max-w-sm">
                <div className="relative">
                  <span className="sf-figure sf-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">{symbol}</span>
                  <input
                    id="financing-trade-in"
                    type="number"
                    inputMode="decimal"
                    value={formData.tradeInValue}
                    onChange={(e) => setFormData((prev) => ({ ...prev, tradeInValue: e.target.value }))}
                    className="sf-input sf-figure pl-8"
                    placeholder={text('e.g. 5,000', 'Ex.: 5.000')}
                    step="100"
                    min="0"
                  />
                </div>
                <Link
                  href={selectedVehicle ? `/trade-in?vehicleId=${selectedVehicle.id}` : '/trade-in'}
                  className="sf-link mt-1 inline-flex min-h-11 items-center text-[length:var(--sf-text-sm)]"
                >
                  {text('Request a trade-in review', 'Solicitar avaliação para troca')}
                </Link>
              </Field>
            </div>
          </FormSection>

          <MobileSummary>{summary}</MobileSummary>

          {calculation.status === 'ready' && calculatedResults && calculatedResults.loanAmount > 0 && (
            <section className="border-t pt-[var(--sf-space-md)]" style={{ borderColor: 'var(--sf-rule)' }}>
              <button
                type="button"
                onClick={() => setShowAmortization(!showAmortization)}
                aria-expanded={showAmortization}
                className="flex min-h-11 w-full items-center justify-between gap-4 text-left"
              >
                <span className="sf-heading text-[length:var(--sf-text-xl)]">{text('Amortization', 'Amortização')}</span>
                <ChevronDown
                  className={`size-5 shrink-0 transition-transform ${showAmortization ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>

              {showAmortization && (
                <div className="sf-well mt-4 overflow-x-auto">
                  <table className="sf-figure w-full min-w-[30rem] text-[length:var(--sf-text-sm)]">
                    <thead>
                      <tr>
                        <th className="sf-eyebrow px-3 py-2.5 text-left font-medium">{text('Month', 'Mês')}</th>
                        <th className="sf-eyebrow px-3 py-2.5 text-right font-medium">{text('Payment', 'Parcela')}</th>
                        <th className="sf-eyebrow px-3 py-2.5 text-right font-medium">{text('Principal', 'Amortização')}</th>
                        <th className="sf-eyebrow px-3 py-2.5 text-right font-medium">{text('Interest', 'Juros')}</th>
                        <th className="sf-eyebrow px-3 py-2.5 text-right font-medium">{text('Balance', 'Saldo devedor')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {amortizationSchedule.map((row, idx) => {
                        if (row.separator) {
                          return (
                            <tr key={idx} className="border-t" style={{ borderColor: 'var(--sf-rule)' }}>
                              <td colSpan={5} className="sf-faint px-3 py-1.5 text-center">…</td>
                            </tr>
                          )
                        }
                        return (
                          <tr key={idx} className="border-t" style={{ borderColor: 'var(--sf-rule)' }}>
                            <td className="px-3 py-2">{row.month}</td>
                            <td className="px-3 py-2 text-right">{money(row.payment)}</td>
                            <td className="px-3 py-2 text-right">{money(row.principal)}</td>
                            <td className="px-3 py-2 text-right">{money(row.interest)}</td>
                            <td className="px-3 py-2 text-right">{money(row.balance)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          <FormSection title={text('Financing request', 'Solicitação de financiamento')}>
            {applicationStatus === 'success' ? (
              <div className="space-y-5">
                <p role="status" className="sf-title-line">
                  <span className="sf-dot" data-tone="ok" aria-hidden="true" />
                  <span className="sf-heading text-[length:var(--sf-text-2xl)]">{text('Request received', 'Solicitação recebida')}</span>
                </p>
                <dl className="sf-spec">
                  <div>
                    <dt>{text('Dealer', 'Concessionária')}</dt>
                    <dd>{business.fullName}</dd>
                  </div>
                  {applicationReference && (
                    <div>
                      <dt>{text('Reference', 'Protocolo')}</dt>
                      <dd className="sf-figure">{applicationReference}</dd>
                    </div>
                  )}
                  {selectedVehicle && (
                    <div>
                      <dt>{text('Vehicle', 'Veículo')}</dt>
                      <dd>{vehicleTitle(selectedVehicle)}</dd>
                    </div>
                  )}
                </dl>
                <nav aria-label={text('Next', 'Próximas etapas')} className={ACTION_ROW}>
                  <Link
                    href={selectedVehicle ? `/inventory/${selectedVehicle.id}` : '/inventory'}
                    className="sf-btn sf-btn-primary"
                  >
                    {selectedVehicle ? text('Return to vehicle', 'Voltar ao veículo') : text('Browse inventory', 'Ver estoque')}
                  </Link>
                  <Link
                    href={selectedVehicle ? `/test-drive?vehicleId=${selectedVehicle.id}` : '/test-drive'}
                    className="sf-btn sf-btn-ghost"
                  >
                    {text('Test drive', 'Agendar test-drive')}
                  </Link>
                  <Link href="/account" className="sf-btn sf-btn-ghost">{text('Account', 'Minha conta')}</Link>
                </nav>
              </div>
            ) : (
              <form onSubmit={handleApplicationSubmit} className="grid gap-4 sm:grid-cols-2">
                <Field label={text('Full name', 'Nome completo')} htmlFor="financing-full-name" className="sm:col-span-2">
                  <input
                    id="financing-full-name"
                    type="text"
                    required
                    autoComplete="name"
                    value={applicationForm.fullName}
                    onChange={(e) => setApplicationForm((prev) => ({ ...prev, fullName: e.target.value }))}
                    className="sf-input"
                  />
                </Field>
                <Field label="E-mail" htmlFor="financing-email">
                  <input
                    id="financing-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={applicationForm.email}
                    onChange={(e) => setApplicationForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="sf-input"
                  />
                </Field>
                <Field label={text('Phone', 'Telefone')} htmlFor="financing-phone">
                  <input
                    id="financing-phone"
                    type="tel"
                    required
                    autoComplete="tel"
                    value={applicationForm.phone}
                    onChange={(e) => setApplicationForm((prev) => ({ ...prev, phone: e.target.value }))}
                    className="sf-input"
                  />
                </Field>
                <Field label={text('Employment status', 'Situação profissional')} htmlFor="financing-employment">
                  <PlatformSelect
                    id="financing-employment"
                    name="employmentStatus"
                    required
                    value={applicationForm.employmentStatus}
                    onValueChange={(value) => setApplicationForm((prev) => ({ ...prev, employmentStatus: value }))}
                    className="sf-input sf-trigger"
                    placeholder={text('Select', 'Selecione')}
                    options={[
                      { value: 'employed', label: text('Employed', 'Empregado(a)') },
                      { value: 'self-employed', label: text('Self-employed', 'Autônomo(a)') },
                      { value: 'retired', label: text('Retired', 'Aposentado(a)') },
                      { value: 'student', label: text('Student', 'Estudante') },
                      { value: 'other', label: text('Other', 'Outro') },
                    ]}
                  />
                </Field>
                <Field label={text('Annual income', 'Renda mensal')} htmlFor="financing-income">
                  <div className="relative">
                    <span className="sf-figure sf-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">{symbol}</span>
                    <input
                      id="financing-income"
                      type="number"
                      inputMode="numeric"
                      required
                      value={applicationForm.annualIncome}
                      onChange={(e) => setApplicationForm((prev) => ({ ...prev, annualIncome: e.target.value }))}
                      className="sf-input sf-figure pl-8"
                      min={FINANCING_ANNUAL_INCOME_INPUT.min}
                      step={FINANCING_ANNUAL_INCOME_INPUT.step}
                    />
                  </div>
                </Field>
                <Field label={text('Credit range', 'Faixa de crédito')} htmlFor="financing-credit" className="sm:col-span-2">
                  <PlatformSelect
                    id="financing-credit"
                    name="creditTier"
                    required
                    value={applicationForm.creditTier}
                    onValueChange={(value) => setApplicationForm((prev) => ({ ...prev, creditTier: value }))}
                    className="sf-input sf-trigger"
                    placeholder={text('Self-reported credit range', 'Informe sua faixa de crédito')}
                    options={[
                      { value: 'excellent-720-plus', label: text('Excellent (720+)', 'Excelente (720+)') },
                      { value: 'good-680-719', label: text('Good (680–719)', 'Boa (680–719)') },
                      { value: 'fair-620-679', label: text('Fair (620–679)', 'Regular (620–679)') },
                      { value: 'rebuilding-under-620', label: text('Rebuilding (<620)', 'Em reconstrução (<620)') },
                      { value: 'unknown', label: text('Not sure', 'Não sei') },
                    ]}
                  />
                </Field>
                <label className="sf-muted flex min-h-11 cursor-pointer items-start gap-3 text-[length:var(--sf-text-sm)] sm:col-span-2">
                  <input
                    type="checkbox"
                    required
                    checked={applicationForm.consent}
                    onChange={(e) => setApplicationForm((prev) => ({ ...prev, consent: e.target.checked }))}
                    className="mt-0.5 size-5 shrink-0 accent-[var(--sf-accent)]"
                  />
                  <span>{text('I agree to be contacted about financing options.', 'Concordo em receber contato sobre opções de financiamento.')}</span>
                </label>
                <label className="sf-muted flex min-h-11 cursor-pointer items-start gap-3 text-[length:var(--sf-text-sm)] sm:col-span-2">
                  <input
                    type="checkbox"
                    required
                    checked={applicationForm.privacyAcknowledged}
                    onChange={(e) => setApplicationForm((prev) => ({ ...prev, privacyAcknowledged: e.target.checked }))}
                    className="mt-0.5 size-5 shrink-0 accent-[var(--sf-accent)]"
                  />
                  <span>{text(`I acknowledge that ${business.fullName} stores this application to review financing options with lenders.`, `Estou ciente de que ${business.fullName} armazenará esta solicitação para analisar opções de financiamento junto às instituições financeiras.`)}</span>
                </label>
                <input
                  type="text"
                  name="website"
                  value={applicationForm.website}
                  onChange={(e) => setApplicationForm((prev) => ({ ...prev, website: e.target.value }))}
                  tabIndex={-1}
                  autoComplete="off"
                  className="hidden"
                  aria-hidden="true"
                />
                {applicationStatus === 'error' && (
                  <div className="sm:col-span-2">
                    <Notice tone="bad">
                      {applicationError || text('We could not submit your request. Please try again or contact the dealership.', 'Não foi possível enviar sua solicitação. Tente novamente ou entre em contato com a concessionária.')}
                    </Notice>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={isFinancingSubmitDisabled(isApplying)}
                    className="sf-btn sf-btn-primary w-full sm:w-auto sm:min-w-56"
                  >
                    {isApplying ? text('Sending…', 'Enviando…') : text('Send financing request', 'Solicitar financiamento')}
                  </button>
                </div>
              </form>
            )}
          </FormSection>
        </div>
      </RequestLayout>
    </>
  )
}

function FinancingFallback() {
  const { locale } = useLocale()
  return (
    <>
      <PageHeader title={locale === 'pt-BR' ? 'Simulação de financiamento' : 'Payment estimate'} />
      <Container className="sf-section">
        <div className="grid gap-[var(--sf-space-xl)] lg:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="sf-skeleton h-96" />
          <div className="sf-skeleton hidden h-80 lg:block" />
        </div>
      </Container>
    </>
  )
}

export function FinancingPage() {
  return (
    <Suspense fallback={<FinancingFallback />}>
      <FinancingContent />
    </Suspense>
  )
}
