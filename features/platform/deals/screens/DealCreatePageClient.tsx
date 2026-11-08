'use client'

import { useState, useEffect, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, RefreshCw, Save, UserPlus } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatPhone } from '@/features/platform/lib/format'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import {
  Code,
  DeskHeader,
  Notice,
  Panel,
  Pill,
  Figure,
  Status,
  Track,
} from '@/features/platform/components/desk'
import {
  createDealWorksheet,
  getDealSetupOptions,
  getRooftopSalespeople,
  openWalkInLead,
  type DealSetupLead,
  type DealSetupVehicle,
  type DealTradeInOption,
} from '../actions'
import { formatUsd, formatUsdCredit } from '../lib/formatMoney'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { MoneyInput } from '../components/MoneyInput'
import { applyDealDefaults, calculateDealPrice, lineAmountCents, type DealDefaults } from '@/features/keystone/lifecycle/dealPricing'

type Vehicle = DealSetupVehicle
type Lead = DealSetupLead

interface User {
  id: string
  name: string
}

const fieldLabel = 'text-[12px] font-medium text-muted-foreground'
const controlClass = 'h-10 rounded-[4px] text-[13px] shadow-none'

/** One section of the worksheet; the word on the right says whether it is filled. */
function Step({ index, title, done, optional, children, pt }: { index: number; title: string; done: boolean; optional?: boolean; children: ReactNode; pt: boolean }) {
  return (
    <section className="min-w-0" aria-labelledby={`deal-step-${index}`}>
      <div className="flex min-w-0 items-baseline gap-3 border-b border-foreground/15 pb-2">
        <h2 id={`deal-step-${index}`} className="text-[15px] font-semibold text-foreground">{title}</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {done ? <Status tone="ok" className="text-xs">{pt ? 'Preenchido' : 'Filled'}</Status> : optional ? (pt ? 'Opcional' : 'Optional') : (pt ? 'Obrigatório' : 'Required')}
        </span>
      </div>
      <div className="space-y-4 pt-4">{children}</div>
    </section>
  )
}

function SummaryRow({ label, value, emphasis, credit }: { label: string; value: string; emphasis?: boolean; credit?: boolean }) {
  return (
    <div className={`flex min-w-0 items-baseline justify-between gap-4 px-4 ${emphasis ? 'border-t border-foreground/60 py-3 text-base font-semibold' : 'py-2 text-[13px]'}`}>
      <dt className={emphasis ? 'text-foreground' : 'text-muted-foreground'}>{label}</dt>
      <dd className={`shrink-0 text-right tabular-nums ${credit ? 'text-muted-foreground' : 'text-foreground'}`}>{emphasis ? <Figure size="md">{value}</Figure> : value}</dd>
    </div>
  )
}

const NO_DEFAULTS: DealDefaults = { salesTaxRateBps: 0, docFeeCents: 0 }

/** Preview of the pencil the server creates: the same defaults and pricing rules, in dollars. */
function previewDeal(form: { vehiclePrice: number; tradeInValue: number; downPayment: number }, defaults: DealDefaults) {
  try {
    const amounts = { vehiclePriceCents: Math.round(form.vehiclePrice * 100), tradeInValueCents: Math.round(form.tradeInValue * 100), downPaymentCents: Math.round(form.downPayment * 100) }
    const { fees, taxLines } = applyDealDefaults({ ...amounts, rebates: [] }, defaults)
    const price = calculateDealPrice({ ...amounts, fees, taxLines })
    return { fees, taxLines, subtotal: price.subtotalCents / 100, totalPrice: price.totalPriceCents / 100, remainingBalance: Math.max(0, price.balanceCents) / 100 }
  } catch {
    return null
  }
}

const NO_TRADE_IN = 'none'
const NEW_CUSTOMER = '__new-customer__'

type WalkInForm = { firstName: string; lastName: string; phone: string; email: string }
const EMPTY_WALK_IN: WalkInForm = { firstName: '', lastName: '', phone: '', email: '' }

function walkInErrors(form: WalkInForm, pt: boolean) {
  const errors: Partial<Record<keyof WalkInForm, string>> = {}
  if (!form.firstName.trim()) errors.firstName = pt ? 'Informe o nome.' : 'First name is required'
  if (!form.lastName.trim()) errors.lastName = pt ? 'Informe o sobrenome.' : 'Last name is required'
  const email = form.email.trim()
  const digits = form.phone.replace(/\D/g, '')
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = pt ? 'Informe um e-mail válido.' : 'Email is invalid'
  if (form.phone.trim() && (digits.length < 7 || digits.length > 15)) errors.phone = pt ? 'Informe um telefone válido.' : 'Phone is invalid'
  if (!email && !form.phone.trim()) errors.phone = pt ? 'Informe um telefone ou e-mail.' : 'Enter a phone or email'
  return errors
}

function tradeInLabel(tradeIn: DealTradeInOption) {
  return [tradeIn.year, tradeIn.make, tradeIn.model, tradeIn.trim].filter(Boolean).join(' ') || 'Trade-in'
}

/** The pencil a CRM link opens: its lead, the lead's interested vehicle when available, and a picked trade-in. */
function prefilledForm(vehicles: Vehicle[], leads: Lead[], tradeIns: DealTradeInOption[], leadId: string, tradeInId: string) {
  const lead = leads.find(item => item.id === leadId)
  const vehicle = lead?.interestedVehicle ? vehicles.find(item => item.id === lead.interestedVehicle?.id) : undefined
  const tradeIn = tradeIns.find(item => item.id === tradeInId && item.offerAmountCents != null && (!item.lead || item.lead.id === lead?.id))
  return {
    vehicleId: vehicle?.id || '',
    leadId: lead?.id || '',
    salespersonId: '',
    tradeInId: tradeIn?.id || '',
    vehiclePrice: vehicle?.price || 0,
    tradeInValue: tradeIn ? (tradeIn.offerAmountCents || 0) / 100 : 0,
    downPayment: 0,
  }
}

export function DealCreatePageClient({
  initialVehicles,
  initialLeads,
  initialTradeIns,
  initialDealDefaults,
  currencyCode,
  initialError,
  prefillLeadId = '',
  prefillTradeInId = '',
}: {
  initialVehicles: Vehicle[]
  initialLeads: Lead[]
  initialTradeIns: DealTradeInOption[]
  initialDealDefaults: DealDefaults
  currencyCode: string
  initialError: string | null
  prefillLeadId?: string
  prefillTradeInId?: string
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const router = useRouter()
  const idempotencyKeyRef = useRef(`deal-pencil:${crypto.randomUUID()}`)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles)
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [tradeIns, setTradeIns] = useState<DealTradeInOption[]>(initialTradeIns)
  const [dealDefaults, setDealDefaults] = useState<DealDefaults>(initialDealDefaults || NO_DEFAULTS)
  const [activeCurrencyCode, setActiveCurrencyCode] = useState(currencyCode)
  const [salesReps, setSalesReps] = useState<User[]>([])
  const [salesRepsLoading, setSalesRepsLoading] = useState(false)

  const [formData, setFormData] = useState(() => prefilledForm(initialVehicles, initialLeads, initialTradeIns, prefillLeadId, prefillTradeInId))
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [walkIn, setWalkIn] = useState<WalkInForm>(EMPTY_WALK_IN)
  const [walkInTouched, setWalkInTouched] = useState(false)
  const [walkInSaving, setWalkInSaving] = useState(false)
  const [walkInError, setWalkInError] = useState<string | null>(null)
  const walkInKeyRef = useRef(`deal-walk-in:${crypto.randomUUID()}`)

  const calculated = previewDeal(formData, dealDefaults)

  useEffect(() => {
    let current = true
    setSalesReps([])
    setFormData(previous => ({ ...previous, salespersonId: '' }))
    const rooftopId = vehicles.find(vehicle => vehicle.id === formData.vehicleId)?.rooftop.id
    setSalesRepsLoading(Boolean(rooftopId))
    if (rooftopId) {
      getRooftopSalespeople(rooftopId).then(response => {
        if (!current) return
        setSalesRepsLoading(false)
        if (response.success && response.data) setSalesReps(response.data.users)
        else setError(response.error || (pt ? 'Não foi possível carregar os vendedores.' : 'Unable to load sales reps.'))
        // The lead's assigned salesperson is the only one the server accepts.
        if (response.success && response.data) {
          setFormData(previous => {
            const assigned = leads.find(lead => lead.id === previous.leadId)?.assignedSalesperson?.id
            return assigned && response.data.users.some(user => user.id === assigned) ? { ...previous, salespersonId: assigned } : previous
          })
        }
      })
    }
    return () => { current = false }
  }, [formData.vehicleId, vehicles])

  const loadData = async () => {
    setLoading(true)
    setError(null)

    const response = await getDealSetupOptions()
    if (response.success) {
      setVehicles(response.data.vehicles)
      setLeads(response.data.leads)
      setTradeIns(response.data.tradeIns)
      setDealDefaults(response.data.dealDefaults)
      setActiveCurrencyCode(response.data.currencyCode)
    } else {
      setError(response.error || (pt ? 'Não foi possível carregar as opções da venda.' : 'Unable to load deal options.'))
    }
    setLoading(false)
  }

  const handleVehicleChange = (vehicleId: string) => {
    const vehicle = vehicles.find(v => v.id === vehicleId)
    setFormData(prev => {
      const tradeIn = tradeIns.find(item => item.id === prev.tradeInId)
      const keepTradeIn = !tradeIn || tradeIn.rooftop?.id === vehicle?.rooftop.id
      return { ...prev, vehicleId, vehiclePrice: vehicle?.price || 0, ...(keepTradeIn ? {} : { tradeInId: '', tradeInValue: 0 }) }
    })
  }

  const handleSave = async () => {
    setSaveError(null)
    if (!formData.vehicleId) {
      setSaveError(pt ? 'Selecione um veículo.' : 'Select a vehicle.')
      return
    }

    setSaving(true)

    const selectedVehicle = vehicles.find(vehicle => vehicle.id === formData.vehicleId)
    if (!selectedVehicle?.rooftop?.id) {
      setSaving(false)
      setSaveError(pt ? 'O veículo selecionado não está vinculado a uma loja.' : 'The selected vehicle has no rooftop.')
      return
    }
    const lead = leads.find(item => item.id === formData.leadId)
    if (lead?.rooftop?.id && lead.rooftop.id !== selectedVehicle.rooftop.id) {
      setSaving(false)
      setSaveError(pt ? 'O cliente e o veículo estão vinculados a lojas diferentes.' : 'The customer and vehicle are at different rooftops.')
      return
    }

    const data: Parameters<typeof createDealWorksheet>[0] = {
      rooftopId: selectedVehicle.rooftop.id,
      vehicleId: formData.vehicleId,
      idempotencyKey: idempotencyKeyRef.current,
      vehiclePriceCents: Math.round(formData.vehiclePrice * 100),
      tradeInValueCents: Math.round(formData.tradeInValue * 100),
      downPaymentCents: Math.round(formData.downPayment * 100),
    }

    if (formData.leadId) data.leadId = formData.leadId
    if (formData.salespersonId) data.salespersonId = formData.salespersonId
    if (formData.tradeInId) data.tradeInId = formData.tradeInId

    // Creates the pencil and saves worksheet version 1, so the deal opens ready to present.
    const response = await createDealWorksheet(data)

    setSaving(false)

    if (response.success) {
      router.push(`${basePath}/platform/deals/${response.data.dealId}`)
    } else {
      setSaveError(`Failed to create deal: ${response.error || 'Unknown error'}`)
    }
  }

  const openWalkIn = () => {
    setWalkIn(EMPTY_WALK_IN)
    setWalkInTouched(false)
    setWalkInError(null)
    walkInKeyRef.current = `deal-walk-in:${crypto.randomUUID()}`
    setWalkInOpen(true)
  }

  const walkInFieldErrors = walkInErrors(walkIn, pt)

  const saveWalkIn = async () => {
    setWalkInTouched(true)
    setWalkInError(null)
    const vehicle = vehicles.find(item => item.id === formData.vehicleId)
    if (!vehicle?.rooftop?.id) { setWalkInError(pt ? 'Selecione um veículo primeiro.' : 'Choose a vehicle first'); return }
    if (Object.keys(walkInFieldErrors).length > 0) return
    setWalkInSaving(true)
    const response = await openWalkInLead({
      rooftopId: vehicle.rooftop.id,
      firstName: walkIn.firstName.trim(),
      lastName: walkIn.lastName.trim(),
      ...(walkIn.email.trim() ? { email: walkIn.email.trim() } : {}),
      ...(walkIn.phone.trim() ? { phone: walkIn.phone.trim() } : {}),
      interestedVehicleId: vehicle.id,
      idempotencyKey: walkInKeyRef.current,
    })
    setWalkInSaving(false)
    if (!response.success) { setWalkInError(response.error || (pt ? 'Não foi possível cadastrar o cliente.' : 'Unable to add the customer')); return }
    const created = response.data.openLead
    const lead: Lead = {
      id: created.id,
      firstName: walkIn.firstName.trim(),
      lastName: walkIn.lastName.trim(),
      email: walkIn.email.trim().toLowerCase(),
      phone: walkIn.phone.trim(),
      rooftop: { id: vehicle.rooftop.id },
      interestedVehicle: { id: vehicle.id },
      assignedSalesperson: created.assignedToId ? { id: created.assignedToId } : null,
    }
    setLeads(previous => previous.some(item => item.id === lead.id) ? previous : [lead, ...previous])
    setFormData(previous => ({
      ...previous,
      leadId: lead.id,
      salespersonId: lead.assignedSalesperson && salesReps.some(user => user.id === lead.assignedSalesperson?.id) ? lead.assignedSalesperson.id : previous.salespersonId,
    }))
    setWalkInOpen(false)
  }

  const formatCurrency = (value: number) => formatUsd(value, { currencyCode: activeCurrencyCode, locale })
  const formatPrice = (value: number) => formatUsd(value, { whole: true, currencyCode: activeCurrencyCode, locale })

  const selectedVehicle = vehicles.find(v => v.id === formData.vehicleId)
  const selectedLead = leads.find(l => l.id === formData.leadId)
  const tradeInOptions = tradeIns.filter(tradeIn =>
    (!selectedVehicle || tradeIn.rooftop?.id === selectedVehicle.rooftop.id) &&
    (!tradeIn.lead || tradeIn.lead.id === formData.leadId)
  )
  const selectedTradeIn = tradeIns.find(tradeIn => tradeIn.id === formData.tradeInId)

  const chooseLead = (leadId: string) => setFormData(previous => {
    const assigned = leads.find(lead => lead.id === leadId)?.assignedSalesperson?.id
    const tradeIn = tradeIns.find(item => item.id === previous.tradeInId)
    const keepTradeIn = !tradeIn?.lead || tradeIn.lead.id === leadId
    return {
      ...previous,
      leadId,
      salespersonId: assigned && salesReps.some(user => user.id === assigned) ? assigned : previous.salespersonId,
      ...(keepTradeIn ? {} : { tradeInId: '', tradeInValue: 0 }),
    }
  })

  const chooseTradeIn = (value: string) => {
    const tradeIn = tradeIns.find(item => item.id === value)
    setFormData(previous => tradeIn
      ? { ...previous, tradeInId: tradeIn.id, tradeInValue: (tradeIn.offerAmountCents || 0) / 100 }
      : { ...previous, tradeInId: '', tradeInValue: 0 })
  }

  const breadcrumbs = [
    { type: 'link' as const, label: pt ? 'Painel' : 'Dashboard', href: basePath },
    { type: 'page' as const, label: pt ? 'Plataforma' : 'Platform' },
    { type: 'link' as const, label: pt ? 'Vendas' : 'Deals', href: `${basePath}/platform/deals` },
    { type: 'page' as const, label: pt ? 'Nova venda' : 'New Deal' },
  ]

  const header = (
    <DeskHeader
      title={pt ? 'Nova venda' : 'New deal'}
      meta={selectedVehicle ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}${selectedLead ? ` · ${selectedLead.firstName} ${selectedLead.lastName}` : ''}` : (pt ? 'Proposta de venda · selecione um veículo para começar' : 'Pencil worksheet · choose a vehicle to start')}
      actions={
        <Track>
          <Pill asChild variant="plain">
            <Link href={`${basePath}/platform/deals`}>{pt ? 'Cancelar' : 'Cancel'}</Link>
          </Pill>
        </Track>
      }
    />
  )

  const salesRepPlaceholder = !formData.vehicleId
    ? (pt ? 'Selecione um veículo primeiro' : 'Choose a vehicle first')
    : salesRepsLoading
      ? (pt ? 'Carregando vendedores' : 'Loading sales reps')
      : salesReps.length === 0
        ? (pt ? 'Nenhum vendedor cadastrado nesta loja' : 'No sales reps at this rooftop')
        : (pt ? 'Selecione o vendedor' : 'Select sales rep')

  const frontGross = selectedVehicle ? formData.vehiclePrice - (selectedVehicle.purchasePrice || 0) : null

  return (
    <PageContainer title={pt ? 'Nova venda' : 'New Deal'} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full px-4 pb-24 md:px-6">
        {loading ? (
          <p role="status" className="py-16 text-center text-sm text-muted-foreground">{pt ? 'Carregando opções da venda' : 'Loading deal options'}</p>
        ) : error ? (
          <Notice tone="bad">
            <p className="font-medium">{pt ? 'Não foi possível preparar a venda' : 'Unable to prepare a deal'}</p>
            <p className="mt-0.5 text-muted-foreground">{error}</p>
            <Track className="mt-2">
              <Pill size="sm" onClick={loadData}>
                <RefreshCw />
                {pt ? 'Tentar novamente' : 'Retry'}
              </Pill>
            </Track>
          </Notice>
        ) : vehicles.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
            <p>{pt ? 'Nenhum veículo disponível' : 'No available vehicles'}</p>
            <Track>
              <Pill asChild>
                <Link href={`${basePath}/platform/vehicles`}>
                  {pt ? 'Abrir estoque' : 'Open inventory'}
                  <ArrowRight />
                </Link>
              </Pill>
            </Track>
          </div>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-8">
              <Step index={2} title={pt ? 'Veículo' : 'Vehicle'} done={Boolean(formData.vehicleId)} pt={pt}>
                <label className="grid min-w-0 gap-1.5">
                  <span className={fieldLabel}>{pt ? 'Veículo' : 'Vehicle'}</span>
                  <Select value={formData.vehicleId} onValueChange={handleVehicleChange}>
                    <SelectTrigger aria-label={pt ? 'Selecionar veículo' : 'Select vehicle'} className={controlClass}>
                      <SelectValue placeholder={pt ? 'Escolha um veículo' : 'Choose a vehicle'} />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map(v => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.year} {v.make} {v.model} · #{v.stockNumber} · {formatPrice(v.price)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                {selectedVehicle && (
                  <Panel className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}</p>
                      <Code>#{selectedVehicle.stockNumber}</Code>
                    </div>
                    <dl className="flex gap-5 tabular-nums">
                      <div className="text-right"><dt className="text-[12px] text-muted-foreground">{selectedVehicle.condition === 'new' ? (pt ? 'Preço sugerido' : 'MSRP') : (pt ? 'Preço' : 'Price')}</dt><dd><Figure size="sm">{formatPrice(selectedVehicle.price)}</Figure></dd></div>
                      <div className="text-right"><dt className="text-[12px] text-muted-foreground">{pt ? 'Custo' : 'Cost'}</dt><dd className="text-[13px] text-muted-foreground">{formatPrice(selectedVehicle.purchasePrice || 0)}</dd></div>
                    </dl>
                  </Panel>
                )}

                <label className="grid min-w-0 gap-1.5">
                  <span className={fieldLabel}>{pt ? 'Vendedor' : 'Sales rep'}</span>
                  <Select value={formData.salespersonId} onValueChange={(v) => setFormData(prev => ({ ...prev, salespersonId: v }))} disabled={!formData.vehicleId || salesRepsLoading || salesReps.length === 0}>
                    <SelectTrigger aria-label={pt ? 'Vendedor responsável' : 'Sales representative'} className={controlClass}>
                      <SelectValue placeholder={salesRepPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {salesReps.map(u => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </Step>

              <Step index={1} title={pt ? 'Cliente' : 'Customer'} done={Boolean(formData.leadId)} optional pt={pt}>
                <label className="grid min-w-0 gap-1.5">
                  <span className={fieldLabel}>{pt ? 'Cliente interessado' : 'Customer (lead)'}</span>
                  <Select value={formData.leadId} onValueChange={value => value === NEW_CUSTOMER ? openWalkIn() : chooseLead(value)}>
                    <SelectTrigger aria-label={pt ? 'Cliente' : 'Customer'} className={controlClass}>
                      <SelectValue placeholder={pt ? 'Selecione o cliente' : 'Select customer'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NEW_CUSTOMER}>{pt ? 'Novo cliente' : 'New customer'}</SelectItem>
                      {leads.map(l => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.firstName} {l.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                {selectedLead && (
                  <Panel className="px-4 py-3 text-sm">
                    <p className="font-medium">{selectedLead.firstName} {selectedLead.lastName}</p>
                    <p className="break-all text-muted-foreground">{selectedLead.email}</p>
                    <p className="tabular-nums text-muted-foreground">{formatPhone(selectedLead.phone)}</p>
                  </Panel>
                )}
                <Track>
                  <Pill size="sm" onClick={openWalkIn}>
                    <UserPlus />
                    {pt ? 'Novo cliente' : 'New customer'}
                  </Pill>
                </Track>
              </Step>

              <Step index={3} title={pt ? 'Veículo na troca' : 'Trade-in'} done={Boolean(formData.tradeInId)} optional pt={pt}>
                <label className="grid min-w-0 gap-1.5">
                  <span className={fieldLabel}>{pt ? 'Avaliação de troca' : 'Trade-in record'}</span>
                  <Select value={formData.tradeInId || NO_TRADE_IN} onValueChange={(value) => chooseTradeIn(value === NO_TRADE_IN ? '' : value)}>
                    <SelectTrigger aria-label={pt ? 'Veículo na troca' : 'Trade-in record'} className={controlClass}>
                      <SelectValue placeholder={pt ? 'Sem veículo na troca' : 'No trade-in record'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TRADE_IN}>{pt ? 'Sem veículo na troca' : 'No trade-in record'}</SelectItem>
                      {tradeInOptions.map(tradeIn => (
                        <SelectItem key={tradeIn.id} value={tradeIn.id} disabled={tradeIn.offerAmountCents == null}>
                          {tradeInLabel(tradeIn)}{tradeIn.offerAmountCents != null ? ` · ${formatPrice(tradeIn.offerAmountCents / 100)}` : (pt ? ' · sem avaliação' : ' · not appraised')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                {selectedTradeIn && (
                  <Panel className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{tradeInLabel(selectedTradeIn)}</p>
                      <Code>{selectedTradeIn.vin || (pt ? 'Chassi não informado' : 'VIN not entered')}</Code>
                    </div>
                    <Link href={`${basePath}/platform/trade-ins/${selectedTradeIn.id}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">{pt ? 'Abrir avaliação' : 'Open trade-in'}</Link>
                  </Panel>
                )}
              </Step>

              <Step index={4} title={pt ? 'Valores' : 'Numbers'} done={formData.vehiclePrice > 0} pt={pt}>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label htmlFor="deal-negotiated-price" className="grid min-w-0 gap-1.5">
                    <span className={fieldLabel}>{pt ? 'Preço negociado' : 'Negotiated price'}</span>
                    <MoneyInput
                      id="deal-negotiated-price"
                      cents={Math.round(formData.vehiclePrice * 100)}
                      onCentsChange={(cents) => setFormData(prev => ({ ...prev, vehiclePrice: cents / 100 }))}
                      placeholder="0"
                      className="h-10 text-[13px]"
                    />
                  </label>
                  <label htmlFor="deal-trade-in-value" className="grid min-w-0 gap-1.5">
                    <span className={fieldLabel}>{pt ? 'Valor do veículo na troca' : 'Trade-in value'}</span>
                    <MoneyInput
                      id="deal-trade-in-value"
                      cents={Math.round(formData.tradeInValue * 100)}
                      onCentsChange={(cents) => setFormData(prev => ({ ...prev, tradeInValue: cents / 100 }))}
                      placeholder="0"
                      className="h-10 text-[13px]"
                      disabled={Boolean(formData.tradeInId)}
                      aria-describedby={formData.tradeInId ? 'deal-trade-in-value-source' : undefined}
                    />
                    {formData.tradeInId && <span id="deal-trade-in-value-source" className="text-xs text-muted-foreground">{pt ? 'Valor da avaliação' : 'Appraisal offer'}</span>}
                  </label>
                  <label htmlFor="deal-down-payment" className="grid min-w-0 gap-1.5">
                    <span className={fieldLabel}>{pt ? 'Entrada' : 'Down payment'}</span>
                    <MoneyInput
                      id="deal-down-payment"
                      cents={Math.round(formData.downPayment * 100)}
                      onCentsChange={(cents) => setFormData(prev => ({ ...prev, downPayment: cents / 100 }))}
                      placeholder="0"
                      className="h-10 text-[13px]"
                    />
                  </label>
                </div>
              </Step>
            </div>

            <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
              <section aria-labelledby="deal-summary" className="min-w-0 space-y-3">
                <h2 id="deal-summary" className="border-b border-foreground/15 pb-2 text-[15px] font-semibold text-foreground">{pt ? 'Resumo da venda' : 'Summary'}</h2>
                <Panel className="overflow-hidden">
                  <dl className="divide-y divide-border/60">
                    <SummaryRow label={pt ? 'Preço do veículo' : 'Vehicle price'} value={formatCurrency(formData.vehiclePrice)} />
                    {calculated?.fees.map(line => <SummaryRow key={line.code} label={line.name} value={formatCurrency(lineAmountCents(line) / 100)} />)}
                    <SummaryRow label={pt ? 'Subtotal' : 'Subtotal'} value={calculated ? formatCurrency(calculated.subtotal) : '-'} />
                    {calculated?.taxLines.map(line => <SummaryRow key={line.code} label={line.name} value={formatCurrency(lineAmountCents(line) / 100)} />)}
                    {formData.tradeInValue > 0 && <SummaryRow label={pt ? 'Crédito do veículo na troca' : 'Trade-in credit'} value={formatUsdCredit(formData.tradeInValue, { currencyCode: activeCurrencyCode, locale })} credit />}
                    <SummaryRow emphasis label={pt ? 'Total da venda' : 'Working balance'} value={calculated ? formatCurrency(calculated.totalPrice) : '-'} />
                    <SummaryRow label={pt ? 'Entrada' : 'Down payment'} value={formatUsdCredit(formData.downPayment, { currencyCode: activeCurrencyCode, locale })} credit={formData.downPayment > 0} />
                    <SummaryRow label={pt ? 'Saldo restante' : 'Remaining balance'} value={calculated ? formatCurrency(calculated.remainingBalance) : '-'} />
                  </dl>
                </Panel>
                {frontGross !== null && (
                  <Panel className="flex min-w-0 items-baseline justify-between gap-4 px-4 py-3">
                    <span className="text-[13px] text-muted-foreground">{pt ? `Margem bruta${frontGross < 0 ? ' · abaixo do custo' : ''}` : `Front gross${frontGross < 0 ? ' · under cost' : ''}`}</span>
                    <Figure size="lg" attention={frontGross < 0}>{formatCurrency(frontGross)}</Figure>
                  </Panel>
                )}
                {saveError && <Notice tone="bad">{saveError}</Notice>}
                <Track block>
                  <Pill variant="primary" onClick={handleSave} disabled={saving || !formData.vehicleId} aria-describedby={!formData.vehicleId ? 'deal-create-requirement' : undefined}>
                    <Save />
                    {saving ? (pt ? 'Criando…' : 'Creating…') : (pt ? 'Criar proposta de venda' : 'Create worksheet')}
                  </Pill>
                </Track>
                {!formData.vehicleId && <p id="deal-create-requirement" className="text-center text-xs text-muted-foreground">{pt ? 'Selecione um veículo primeiro' : 'Choose a vehicle first'}</p>}
              </section>
            </aside>
          </div>
        )}
      </div>

      <Dialog open={walkInOpen} onOpenChange={open => { if (!walkInSaving) setWalkInOpen(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{pt ? 'Novo cliente' : 'New customer'}</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-3"
            noValidate
            onSubmit={event => { event.preventDefault(); void saveWalkIn() }}
          >
            {!formData.vehicleId && <Notice tone="warn">{pt ? 'Selecione um veículo primeiro' : 'Choose a vehicle first'}</Notice>}
            <div className="grid gap-3 sm:grid-cols-2">
              {([['firstName', pt ? 'Nome' : 'First name', 'given-name'], ['lastName', pt ? 'Sobrenome' : 'Last name', 'family-name']] as const).map(([name, label, autoComplete]) => (
                <label key={name} htmlFor={`walk-in-${name}`} className="grid min-w-0 gap-1.5">
                  <span className={fieldLabel}>{label}</span>
                  <Input
                    id={`walk-in-${name}`}
                    className={controlClass}
                    value={walkIn[name]}
                    autoComplete={autoComplete}
                    maxLength={100}
                    aria-invalid={walkInTouched && walkInFieldErrors[name] ? true : undefined}
                    aria-describedby={walkInTouched && walkInFieldErrors[name] ? `walk-in-${name}-error` : undefined}
                    onChange={event => setWalkIn(previous => ({ ...previous, [name]: event.target.value }))}
                  />
                  {walkInTouched && walkInFieldErrors[name] && <span id={`walk-in-${name}-error`} className="text-xs text-destructive">{walkInFieldErrors[name]}</span>}
                </label>
              ))}
            </div>
            <label htmlFor="walk-in-phone" className="grid min-w-0 gap-1.5">
              <span className={fieldLabel}>{pt ? 'Telefone' : 'Phone'}</span>
              <Input
                id="walk-in-phone"
                className={controlClass}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={50}
                value={walkIn.phone}
                aria-invalid={walkInTouched && walkInFieldErrors.phone ? true : undefined}
                aria-describedby={walkInTouched && walkInFieldErrors.phone ? 'walk-in-phone-error' : undefined}
                onChange={event => setWalkIn(previous => ({ ...previous, phone: event.target.value }))}
                onBlur={() => setWalkIn(previous => ({ ...previous, phone: formatPhone(previous.phone) }))}
              />
              {walkInTouched && walkInFieldErrors.phone && <span id="walk-in-phone-error" className="text-xs text-destructive">{walkInFieldErrors.phone}</span>}
            </label>
            <label htmlFor="walk-in-email" className="grid min-w-0 gap-1.5">
              <span className={fieldLabel}>{pt ? 'E-mail' : 'Email'}</span>
              <Input
                id="walk-in-email"
                className={controlClass}
                type="email"
                autoComplete="email"
                maxLength={320}
                value={walkIn.email}
                aria-invalid={walkInTouched && walkInFieldErrors.email ? true : undefined}
                aria-describedby={walkInTouched && walkInFieldErrors.email ? 'walk-in-email-error' : undefined}
                onChange={event => setWalkIn(previous => ({ ...previous, email: event.target.value }))}
              />
              {walkInTouched && walkInFieldErrors.email && <span id="walk-in-email-error" className="text-xs text-destructive">{walkInFieldErrors.email}</span>}
            </label>
            {walkInError && <Notice tone="bad">{walkInError}</Notice>}
            <DialogFooter>
              <Track>
                <Pill type="button" variant="plain" onClick={() => setWalkInOpen(false)} disabled={walkInSaving}>{pt ? 'Cancelar' : 'Cancel'}</Pill>
                <Pill type="submit" variant="primary" disabled={walkInSaving || !formData.vehicleId}>
                  {walkInSaving ? (pt ? 'Adicionando…' : 'Adding…') : (pt ? 'Adicionar cliente' : 'Add customer')}
                </Pill>
              </Track>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
