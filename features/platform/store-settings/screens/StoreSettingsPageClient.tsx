'use client'

import { useMemo, useState, type ReactNode } from 'react'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { RadioGroup } from '@/components/ui/radio-group'
import { sanitizeStoreLogoSvg } from '@/features/lib/sanitize-store-logo'
import { StoreLogo } from '../components/StoreLogo'
import { CustomSvgEditor, LogoPicker } from '../components/LogoPicker'
import { Save } from 'lucide-react'
import { toast } from 'sonner'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DeskHeader, DeskSection, Notice, Pill, Status } from '@/features/platform/components/desk'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  type DealershipStoreSettings,
  saveDealershipStoreSettings,
} from '../actions'
import { DEFAULT_STORE_LOGO_COLOR, normalizeStoreLogoColor } from '@/features/lib/store-logo'
import { HUE_PRESETS, LOGO_ICONS } from '../lib/icon-registry'
import { formatBpsForInput, formatCentsForInput, parseDollarsToCents, parsePercentToBps } from '@/features/platform/deals/lib/moneyInput'
import { countLabel } from '@/features/platform/lib/format'

const EMPTY_SETTINGS: DealershipStoreSettings = {
  name: '',
  shortName: '',
  salesEmail: '',
  serviceEmail: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  hoursMonFri: '',
  hoursSaturday: '',
  hoursSunday: '',
  websiteUrl: '',
  currencyCode: 'USD',
  homepageTitle: '',
  homepageDescription: '',
  logoIcon: LOGO_ICONS[0].lightSvg,
  logoColor: DEFAULT_STORE_LOGO_COLOR,
  salesTaxRateBps: 0,
  docFeeCents: 0,
  timezone: '',
}

const US_TIME_ZONES = [
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Phoenix', label: 'Mountain, no DST (Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
  { value: 'America/Puerto_Rico', label: 'Atlantic (Puerto Rico)' },
]

function otherTimeZones(current: string) {
  let zones: string[] = []
  try {
    zones = Intl.supportedValuesOf('timeZone')
  } catch {
    zones = []
  }
  const us = new Set(US_TIME_ZONES.map(zone => zone.value))
  const rest = zones.filter(zone => !us.has(zone))
  if (current && !us.has(current) && !rest.includes(current)) rest.unshift(current)
  return rest.map(zone => ({ value: zone, label: zone.replaceAll('_', ' ') }))
}

function TimezoneSelect({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const others = useMemo(() => otherTimeZones(value), [value])
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor="store-settings-timezone" className={labelClass}>Timezone</Label>
      <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="store-settings-timezone" className="h-10 w-full rounded-[4px]" aria-label="Timezone">
          <SelectValue placeholder={disabled ? 'Unavailable' : 'Select timezone'} />
        </SelectTrigger>
        <SelectContent className="max-h-[min(420px,var(--radix-select-content-available-height))]">
          <SelectGroup>
            <SelectLabel>United States</SelectLabel>
            {US_TIME_ZONES.map(zone => <SelectItem key={zone.value} value={zone.value}>{zone.label}</SelectItem>)}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>All zones</SelectLabel>
            {others.map(zone => <SelectItem key={zone.value} value={zone.value}>{zone.label}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

const labelClass = 'text-[12px] font-medium text-muted-foreground'

function fieldId(label: string) {
  return `store-settings-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <DeskSection title={title} id={id}>
      <div className="space-y-4">{children}</div>
    </DeskSection>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  inputMode,
  error,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  required?: boolean
  inputMode?: 'decimal'
  error?: string | null
  className?: string
}) {
  const id = fieldId(label)
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className={labelClass}>{label}{required ? ' *' : ''}</Label>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        className={`h-10 rounded-[4px] ${className ?? ''}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? <p id={`${id}-error`} className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

type TextSettingKey = { [K in keyof DealershipStoreSettings]-?: DealershipStoreSettings[K] extends string ? K : never }[keyof DealershipStoreSettings]

const TAX_RATE_ERROR = 'Enter a rate from 0 to 100, up to two decimals'
const DOC_FEE_ERROR = 'Enter a dollar amount, up to two decimals'

export function StoreSettingsPageClient({
  initialSettings,
  initialError,
}: {
  initialSettings: DealershipStoreSettings | null
  initialError: string | null
}) {
  const [form, setForm] = useState<DealershipStoreSettings>({
    ...EMPTY_SETTINGS,
    ...initialSettings,
    logoIcon: initialSettings?.logoIcon || EMPTY_SETTINGS.logoIcon,
    logoColor: normalizeStoreLogoColor(initialSettings?.logoColor),
  })
  const safePreviewMark = sanitizeStoreLogoSvg(form.logoIcon)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [warning, setWarning] = useState<string | null>(null)
  // Deal defaults are edited as typed text ("4.15", "$1,299") and stored as basis points and cents.
  const [taxRateText, setTaxRateText] = useState(() => formatBpsForInput(initialSettings?.salesTaxRateBps))
  const [docFeeText, setDocFeeText] = useState(() => formatCentsForInput(initialSettings?.docFeeCents))
  const salesTaxRateBps = parsePercentToBps(taxRateText)
  const docFeeCents = parseDollarsToCents(docFeeText)
  const invalidDealDefaults = salesTaxRateBps === null || docFeeCents === null

  const update = (key: TextSettingKey, value: string) => {
    setForm(current => ({ ...current, [key]: value }))
  }

  const save = async () => {
    if (initialError || invalidMark || salesTaxRateBps === null || docFeeCents === null) return
    setIsSaving(true)
    setError(null)
    setWarning(null)
    const result = await saveDealershipStoreSettings({ ...form, salesTaxRateBps, docFeeCents })
    if (result.success && result.data) {
      setForm({ ...result.data, timezone: result.data.timezone || form.timezone })
      setTaxRateText(formatBpsForInput(result.data.salesTaxRateBps))
      setDocFeeText(formatCentsForInput(result.data.docFeeCents))
      if (result.warning) {
        setWarning(result.warning)
        toast.error(result.warning)
      } else {
        toast.success('Store settings saved')
      }
    } else if (!result.success) {
      setError(result.error)
      toast.error(result.error)
    }
    setIsSaving(false)
  }

  const invalidMark = Boolean(form.logoIcon.trim()) && !safePreviewMark
  const [svgEditorOpen, setSvgEditorOpen] = useState(() => !LOGO_ICONS.some(icon => icon.lightSvg === (initialSettings?.logoIcon || EMPTY_SETTINGS.logoIcon)))
  const openSvgEditor = (open: boolean) => {
    setSvgEditorOpen(open)
    if (open) requestAnimationFrame(() => document.getElementById('store-settings-custom-svg')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }

  // Needs you: the details shoppers look for first, still blank. Required ones first.
  const missing = [
    { label: 'Dealership name', value: form.name, required: true },
    { label: 'Short name', value: form.shortName, required: true },
    { label: 'Phone', value: form.phone },
    { label: 'Sales email', value: form.salesEmail },
    { label: 'Service email', value: form.serviceEmail },
    { label: 'Monday–Friday', value: form.hoursMonFri, display: 'Weekday hours' },
    { label: 'Saturday', value: form.hoursSaturday, display: 'Saturday hours' },
    { label: 'Address line 1', value: form.addressLine1, display: 'Street address' },
    { label: 'City', value: form.city },
    { label: 'State', value: form.state },
    { label: 'Postal code', value: form.postalCode },
  ].filter(item => !item.value.trim())

  const saveButton = (
    <Pill variant="primary" className="max-sm:h-10" onClick={save} disabled={isSaving || Boolean(initialError) || invalidMark || invalidDealDefaults}>
      <Save />
      {isSaving ? 'Saving…' : 'Save settings'}
    </Pill>
  )

  const stateWord = initialError ? 'Unavailable' : !initialSettings ? 'Not set up' : missing.length ? `${countLabel(missing.length, 'detail')} missing` : 'Set up'

  const presets = [
    ...HUE_PRESETS,
    // A rotation saved before the presets were renamed keeps its own swatch.
    ...(HUE_PRESETS.some(preset => String(preset.value) === form.logoColor) ? [] : [{ name: 'Current', value: Number(form.logoColor) }]),
  ]

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto min-w-0 max-w-5xl space-y-8 px-4 py-6 md:px-6">
        <DeskHeader
          title="Store settings"
          status={stateWord}
          meta={[stateWord, form.name || null, form.currencyCode || null].filter(Boolean).join(' · ')}
          actions={saveButton}
        />

        {!initialSettings && !initialError ? (
          <Notice tone="warn">Add a dealership name and short name to publish the storefront.</Notice>
        ) : null}

        {warning ? <Notice tone="warn">{warning}</Notice> : null}

        {error ? (
          <Notice tone="bad">
            <p className="font-medium">Settings were not saved</p>
            <p className="mt-0.5">{error}</p>
          </Notice>
        ) : null}

        {!initialError && missing.length > 0 ? (
          <DeskSection title="Missing" count={missing.length} id="store-settings-missing">
            <ul className="flex flex-wrap gap-x-2 gap-y-2" aria-labelledby="store-settings-missing">
              {missing.map(item => (
                <li key={item.label}>
                  <a
                    href={`#${fieldId(item.label)}`}
                    className="inline-flex min-h-10 items-center gap-2 rounded-[4px] border bg-card px-3 text-[13px] text-foreground hover:bg-muted sm:min-h-8"
                  >
                    {item.display || item.label}
                    <Status tone={item.required ? 'bad' : 'warn'} className="text-[12px]">{item.required ? 'Required' : 'Blank'}</Status>
                  </a>
                </li>
              ))}
            </ul>
          </DeskSection>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <Section title="Dealership">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Dealership name" value={form.name} onChange={value => update('name', value)} required />
              <Field label="Short name" value={form.shortName} onChange={value => update('shortName', value)} required />
            </div>
          </Section>

          <Section title="Contact">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" type="tel" value={form.phone} onChange={value => update('phone', value)} />
              <Field label="Sales email" type="email" value={form.salesEmail} onChange={value => update('salesEmail', value)} />
              <Field label="Service email" type="email" value={form.serviceEmail} onChange={value => update('serviceEmail', value)} />
              <Field label="Website URL" type="url" value={form.websiteUrl} onChange={value => update('websiteUrl', value)} placeholder="https://example.com" />
            </div>
          </Section>

          <Section title="Hours">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Monday–Friday" value={form.hoursMonFri} onChange={value => update('hoursMonFri', value)} />
              <Field label="Saturday" value={form.hoursSaturday} onChange={value => update('hoursSaturday', value)} />
              <Field label="Sunday" value={form.hoursSunday} onChange={value => update('hoursSunday', value)} />
            </div>
          </Section>

          <Section title="Address">
            <Field label="Address line 1" value={form.addressLine1} onChange={value => update('addressLine1', value)} />
            <Field label="Address line 2" value={form.addressLine2} onChange={value => update('addressLine2', value)} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="City" value={form.city} onChange={value => update('city', value)} />
              <Field label="State" value={form.state} onChange={value => update('state', value)} />
              <Field label="Postal code" value={form.postalCode} onChange={value => update('postalCode', value)} />
            </div>
            <div className="sm:max-w-sm">
              <TimezoneSelect value={form.timezone} onChange={value => update('timezone', value)} disabled={Boolean(initialSettings) && !initialSettings?.timezone} />
            </div>
          </Section>
        </div>

        <Section title="Branding">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-1.5">
              <p className={labelClass} id="store-settings-logo-color">Logo color</p>
              <RadioGroup
                value={form.logoColor}
                onValueChange={value => update('logoColor', value)}
                className="grid grid-cols-2 gap-1.5 min-[400px]:grid-cols-3 sm:grid-cols-4"
                aria-labelledby="store-settings-logo-color"
                aria-label="Logo color"
              >
                {presets.map(preset => {
                  const value = String(preset.value)
                  const selected = form.logoColor === value
                  return (
                    <RadioGroupPrimitive.Item
                      key={preset.value}
                      value={value}
                      aria-label={preset.name}
                      className={`flex min-h-10 min-w-0 items-center gap-2 rounded-[4px] border px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9 ${selected ? 'border-foreground bg-background font-medium text-foreground' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                    >
                      <span aria-hidden="true" className="size-4 shrink-0 rounded-[4px]" style={{ background: '#155eef', filter: `hue-rotate(${preset.value}deg)` }} />
                      <span className="truncate">{preset.name}</span>
                    </RadioGroupPrimitive.Item>
                  )
                })}
              </RadioGroup>
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <LogoPicker
                value={form.logoIcon}
                hue={form.logoColor}
                onChange={value => update('logoIcon', value)}
                editing={svgEditorOpen}
                onEditingChange={openSvgEditor}
              />
              {safePreviewMark ? (
                <div aria-label="Logo" className="flex items-center gap-3 self-start rounded-md border bg-card p-3">
                  <StoreLogo svg={safePreviewMark} color={form.logoColor} className="size-10" />
                  {(form.shortName || form.name) && <span className="text-sm font-semibold">{form.shortName || form.name}</span>}
                </div>
              ) : null}
            </div>
          </div>
          {invalidMark ? <Notice tone="bad">Invalid or unsupported SVG.</Notice> : null}
        </Section>

        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <Section title="Storefront">
            <Field label="Homepage title" value={form.homepageTitle} onChange={value => update('homepageTitle', value)} placeholder="Inventory and service" />
            <div className="space-y-1.5">
              <Label htmlFor="store-settings-homepage-description" className={labelClass}>Description</Label>
              <Textarea
                id="store-settings-homepage-description"
                className="rounded-[4px]"
                value={form.homepageDescription}
                onChange={event => update('homepageDescription', event.target.value)}
                maxLength={1000}
              />
            </div>
          </Section>

          <div className="min-w-0 space-y-8">
            <Section title="Deal defaults">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Sales tax rate (%)" inputMode="decimal" className="text-right tabular-nums" value={taxRateText} onChange={setTaxRateText} placeholder="0" error={salesTaxRateBps === null ? TAX_RATE_ERROR : null} />
                <Field label="Documentation fee ($)" inputMode="decimal" className="text-right tabular-nums" value={docFeeText} onChange={setDocFeeText} placeholder="0" error={docFeeCents === null ? DOC_FEE_ERROR : null} />
              </div>
            </Section>

            <Section title="Currency">
              <div className="max-w-[12rem]">
                <Field label="Currency code" value={form.currencyCode} onChange={value => update('currencyCode', value.toUpperCase())} required />
              </div>
            </Section>
          </div>
        </div>

        {svgEditorOpen ? (
          <Section title="Custom logo SVG">
            <CustomSvgEditor
              key={form.logoIcon}
              value={form.logoIcon}
              hue={form.logoColor}
              onChange={value => update('logoIcon', value)}
              onClose={() => setSvgEditorOpen(false)}
            />
          </Section>
        ) : null}

        <div className="flex justify-end border-t pt-4">{saveButton}</div>
      </div>
    </div>
  )
}
