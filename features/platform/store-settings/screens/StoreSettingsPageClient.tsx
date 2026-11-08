'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Code } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { sanitizeStoreLogoSvg } from '@/features/lib/sanitize-store-logo'
import { StoreSettingsSaveBar } from '../components/StoreSettingsSaveBar'
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
import { useLocale } from '@/features/i18n/LocaleProvider'

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
  currencyCode: 'BRL',
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
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const text = (en: string, br: string) => pt ? br : en
  const others = useMemo(() => otherTimeZones(value), [value])
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor="store-settings-timezone" className={labelClass}>{text('Timezone', 'Fuso horário')}</Label>
      <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="store-settings-timezone" className="h-10 w-full rounded-[4px]" aria-label={text('Timezone', 'Fuso horário')}>
          <SelectValue placeholder={disabled ? text('Unavailable', 'Indisponível') : text('Select timezone', 'Selecione o fuso horário')} />
        </SelectTrigger>
        <SelectContent className="max-h-[min(420px,var(--radix-select-content-available-height))]">
          <SelectGroup>
            <SelectLabel>{pt ? 'Estados Unidos' : 'United States'}</SelectLabel>
            {US_TIME_ZONES.map(zone => <SelectItem key={zone.value} value={zone.value}>{zone.label}</SelectItem>)}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>{pt ? 'Todos os fusos' : 'All zones'}</SelectLabel>
            {others.map(zone => <SelectItem key={zone.value} value={zone.value}>{zone.label}</SelectItem>)}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

const labelClass = 'text-xs font-medium text-muted-foreground'

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

export function StoreSettingsPageClient({
  initialSettings,
  initialError,
}: {
  initialSettings: DealershipStoreSettings | null
  initialError: string | null
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const text = (en: string, br: string) => pt ? br : en
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
  const [taxRateText, setTaxRateText] = useState(() => formatBpsForInput(initialSettings?.salesTaxRateBps, locale))
  const [docFeeText, setDocFeeText] = useState(() => formatCentsForInput(initialSettings?.docFeeCents, locale))
  const previousLocale = useRef(locale)
  useEffect(() => {
    const previous = previousLocale.current
    if (previous === locale) return
    const rate = parsePercentToBps(taxRateText, previous)
    const fee = parseDollarsToCents(docFeeText, previous)
    if (rate !== null) setTaxRateText(formatBpsForInput(rate, locale))
    if (fee !== null) setDocFeeText(formatCentsForInput(fee, locale))
    previousLocale.current = locale
  }, [locale, taxRateText, docFeeText])
  const salesTaxRateBps = parsePercentToBps(taxRateText, locale)
  const docFeeCents = parseDollarsToCents(docFeeText, locale)
  const invalidDealDefaults = salesTaxRateBps === null || docFeeCents === null
  const taxRateError = pt ? 'Informe uma alíquota de 0 a 100, com até duas casas decimais.' : 'Enter a rate from 0 to 100, up to two decimals.'
  const docFeeError = pt ? 'Informe um valor em reais, com até duas casas decimais.' : 'Enter a dollar amount, up to two decimals.'

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
      setTaxRateText(formatBpsForInput(result.data.salesTaxRateBps, locale))
      setDocFeeText(formatCentsForInput(result.data.docFeeCents, locale))
      if (result.warning) {
        setWarning(result.warning)
        toast.error(result.warning)
      } else {
        toast.success(text('Store settings saved', 'Configurações da loja salvas'))
      }
    } else if (!result.success) {
      setError(result.error)
      toast.error(result.error)
    }
    setIsSaving(false)
  }

  // Same names as the E-commerce logo block, over this page's form state.
  const logoIcon = form.logoIcon
  const logoColor = form.logoColor
  const setLogoIcon = (value: string) => update('logoIcon', value)
  const setLogoColor = (value: string) => update('logoColor', value)
  // Find matching preset icon, but don't default to first icon if not found
  const selectedIcon = LOGO_ICONS.find((icon) => icon.lightSvg === logoIcon)

  const invalidMark = Boolean(form.logoIcon.trim()) && !safePreviewMark

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
      {isSaving ? text('Saving…', 'Salvando…') : text('Save settings', 'Salvar configurações')}
    </Pill>
  )

  const stateWord = initialError ? text('Unavailable', 'Indisponível') : !initialSettings ? text('Not set up', 'Não configurada') : missing.length ? `${countLabel(missing.length, pt ? 'item' : 'detail')} ${text('missing', 'pendente(s)')}` : text('Set up', 'Configurada')


  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto min-w-0 max-w-5xl space-y-8 px-4 pb-24 pt-6 md:px-6 md:pb-6">
        <DeskHeader
          title={text('Store settings', 'Configurações da loja')}
          status={stateWord}
          meta={[stateWord, form.name || null, form.currencyCode || null].filter(Boolean).join(' · ')}
          actions={<div className="hidden md:block">{saveButton}</div>}
        />

        {!initialSettings && !initialError ? (
          <Notice tone="warn">{text('Add a dealership name and short name to publish the storefront.', 'Informe o nome da concessionária e o nome curto para publicar a vitrine.')}</Notice>
        ) : null}

        {warning ? <Notice tone="warn">{warning}</Notice> : null}

        {error ? (
          <Notice tone="bad">
            <p className="font-medium">{text('Settings were not saved', 'As configurações não foram salvas')}</p>
            <p className="mt-0.5">{error}</p>
          </Notice>
        ) : null}

        {!initialError && missing.length > 0 ? (
          <DeskSection title={text('Missing', 'Dados pendentes')} count={missing.length} id="store-settings-missing">
            <ul className="flex flex-wrap gap-x-2 gap-y-2" aria-labelledby="store-settings-missing">
              {missing.map(item => (
                <li key={item.label}>
                  <a
                    href={`#${fieldId(item.label)}`}
                    className="inline-flex min-h-10 items-center gap-2 rounded-[4px] border bg-card px-3 text-sm text-foreground hover:bg-muted sm:min-h-8"
                  >
                    {item.display || item.label}
                    <Status tone={item.required ? 'bad' : 'warn'} className="text-xs">{item.required ? text('Required', 'Obrigatório') : text('Blank', 'Em branco')}</Status>
                  </a>
                </li>
              ))}
            </ul>
          </DeskSection>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <Section title={text('Dealership', 'Concessionária')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={text('Dealership name', 'Nome da concessionária')} value={form.name} onChange={value => update('name', value)} required />
              <Field label={text('Short name', 'Nome curto')} value={form.shortName} onChange={value => update('shortName', value)} required />
            </div>
          </Section>

          <Section title={text('Contact', 'Contato')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={text('Phone', 'Telefone')} type="tel" value={form.phone} onChange={value => update('phone', value)} />
              <Field label={text('Sales email', 'E-mail de vendas')} type="email" value={form.salesEmail} onChange={value => update('salesEmail', value)} />
              <Field label={text('Service email', 'E-mail da oficina')} type="email" value={form.serviceEmail} onChange={value => update('serviceEmail', value)} />
              <Field label={text('Website address', 'Endereço do site')} type="url" value={form.websiteUrl} onChange={value => update('websiteUrl', value)} placeholder={pt ? 'https://exemplo.com.br' : 'https://example.com'} />
            </div>
          </Section>

          <Section title={text('Hours', 'Horários')}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={text('Monday–Friday', 'Segunda a sexta')} value={form.hoursMonFri} onChange={value => update('hoursMonFri', value)} />
              <Field label={text('Saturday', 'Sábado')} value={form.hoursSaturday} onChange={value => update('hoursSaturday', value)} />
              <Field label={text('Sunday', 'Domingo')} value={form.hoursSunday} onChange={value => update('hoursSunday', value)} />
            </div>
          </Section>

          <Section title={text('Address', 'Endereço')}>
            <Field label={text('Address line 1', 'Endereço')} value={form.addressLine1} onChange={value => update('addressLine1', value)} />
            <Field label={text('Address line 2', 'Complemento')} value={form.addressLine2} onChange={value => update('addressLine2', value)} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={text('City', 'Cidade')} value={form.city} onChange={value => update('city', value)} />
              <Field label={text('State', 'Estado')} value={form.state} onChange={value => update('state', value)} />
              <Field label={text('Postal code', 'CEP')} value={form.postalCode} onChange={value => update('postalCode', value)} />
            </div>
            <div className="sm:max-w-sm">
              <TimezoneSelect value={form.timezone} onChange={value => update('timezone', value)} disabled={Boolean(initialSettings) && !initialSettings?.timezone} />
            </div>
          </Section>
        </div>

        <Section title={text('Branding', 'Identidade visual')}>
          <div className="space-y-6">
          {/* Logo Icon Selector */}
          <div>
            <Label>Ícone da marca</Label>
            <div className="mt-2 flex items-center gap-2">
              <Select
                value={selectedIcon?.id || ''}
                onValueChange={(id) => {
                  const icon = LOGO_ICONS.find((i) => i.id === id);
                  if (icon) setLogoIcon(icon.lightSvg);
                }}
              >
                <SelectPrimitive.Trigger
                  className={cn(
                    'flex h-12 w-12 shrink-0 rounded-lg border border-input bg-background focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 p-0 overflow-hidden items-center justify-center'
                  )}
                >
                  <div
                    dangerouslySetInnerHTML={{ __html: logoIcon }}
                    style={{ filter: `hue-rotate(${logoColor}deg)` }}
                    className="[&>svg]:w-6 [&>svg]:h-6"
                  />
                </SelectPrimitive.Trigger>
                <SelectContent className="border-border dark:border-blue-700">
                  {LOGO_ICONS.map((icon) => (
                    <SelectItem key={icon.id} value={icon.id}>
                      <span className="flex items-center gap-3">
                        <div
                          dangerouslySetInnerHTML={{ __html: icon.lightSvg }}
                          style={{ filter: `hue-rotate(${logoColor}deg)` }}
                          className="[&>svg]:w-6 [&>svg]:h-6"
                        />
                        <span>
                          <span className="block font-medium text-gray-900 dark:text-gray-100">
                            {icon.name}
                          </span>
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* SVG Code Editor Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 shrink-0"
                    type="button"
                  >
                    <Code className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(500px,calc(100vw-2rem))]" align="start">
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">Editar código SVG</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        {text('Edit the SVG code directly. Changes will be reflected in the icon preview.', 'Edite o código SVG diretamente. As alterações aparecerão na prévia do ícone.')}
                      </p>
                    </div>
                    <Textarea
                      value={logoIcon}
                      onChange={(e) => setLogoIcon(e.target.value)}
                      className="font-mono text-xs min-h-[300px]"
                      placeholder="<svg>...</svg>"
                    />
                    <div className="flex items-center gap-2">
                      <div className="text-sm text-muted-foreground">{text('Preview:', 'Prévia:')}</div>
                      <div
                        dangerouslySetInnerHTML={{ __html: logoIcon }}
                        style={{ filter: `hue-rotate(${logoColor}deg)` }}
                        className="[&>svg]:w-8 [&>svg]:h-8 flex items-center justify-center p-2 border rounded"
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Logo Color Selector */}
          <div>
            <Label>Cor da marca</Label>
            <div className="mt-2">
              <Select
                value={logoColor}
                onValueChange={(value) => setLogoColor(value)}
              >
                <SelectPrimitive.Trigger
                  className={cn(
                    'flex h-12 w-12 shrink-0 rounded-lg border border-input bg-background focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 p-0 overflow-hidden items-center justify-center'
                  )}
                >
                  <SelectValue>
                    <div
                      className="w-6 h-6 rounded-full"
                      style={{
                        background: `hsl(${(240 + parseInt(logoColor)) % 360}, 70%, 50%)`
                      }}
                    />
                  </SelectValue>
                </SelectPrimitive.Trigger>
                <SelectContent className="border-border dark:border-blue-700">
                  <div className="grid grid-cols-4 gap-2 p-2">
                    {HUE_PRESETS.map((preset) => (
                      <SelectItem
                        key={preset.value}
                        value={preset.value.toString()}
                        className="cursor-pointer p-0 h-12 w-12 flex items-center justify-center [&>span:first-child]:hidden"
                      >
                        <div
                          className="w-6 h-6 rounded-full"
                          style={{
                            background: `hsl(${(240 + preset.value) % 360}, 70%, 50%)`
                          }}
                        />
                      </SelectItem>
                    ))}
                  </div>
                </SelectContent>
              </Select>
            </div>
          </div>
          </div>
          {invalidMark ? <Notice tone="bad">{text('Invalid or unsupported SVG.', 'Arquivo SVG inválido ou não compatível.')}</Notice> : null}
        </Section>

        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <Section title={text('Storefront', 'Vitrine')}>
            <Field label={text('Homepage title', 'Título da página inicial')} value={form.homepageTitle} onChange={value => update('homepageTitle', value)} placeholder={text('Inventory and service', 'Estoque e serviços')} />
            <div className="space-y-1.5">
              <Label htmlFor="store-settings-homepage-description" className={labelClass}>{text('Description', 'Descrição')}</Label>
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
            <Section title={text('Deal defaults', 'Padrões das vendas')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={text('Sales tax rate (%)', 'Alíquota de imposto (%)')} inputMode="decimal" className="text-right tabular-nums" value={taxRateText} onChange={setTaxRateText} placeholder="0" error={salesTaxRateBps === null ? taxRateError : null} />
                <Field label={pt ? `Taxa de documentação (${form.currencyCode === 'BRL' ? 'R$' : form.currencyCode})` : 'Documentation fee ($)'} inputMode="decimal" className="text-right tabular-nums" value={docFeeText} onChange={setDocFeeText} placeholder="0" error={docFeeCents === null ? docFeeError : null} />
              </div>
            </Section>

            <Section title={text('Currency', 'Moeda')}>
              <div className="max-w-[12rem]">
                <Field label={text('Currency code', 'Código da moeda')} value={form.currencyCode} onChange={value => update('currencyCode', value.toUpperCase())} required />
              </div>
            </Section>
          </div>
        </div>

        <StoreSettingsSaveBar isSaving={isSaving} button={saveButton} className="justify-end border-t pt-4" />
      </div>
    </div>
  )
}
