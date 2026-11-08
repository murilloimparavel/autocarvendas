'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { Pencil, Plus, Power, RefreshCw, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { Attention, Code, DeskHeader, DeskSection, DeskTable, Figure, Notice, Panel, Pill, Readout, ReadoutStrip, Segmented, Status, Td, Th, Tr, Track, type DeskTone } from '@/features/platform/components/desk'
import { recordReference, countLabel } from '@/features/platform/lib/format'
import { parseDollarsToCents } from '@/features/platform/deals/lib/moneyInput'
import { CommandDialog, type CommandField, type FieldErrors } from '@/features/platform/accounting/components/CommandDialog'
import { PAYMENT_STATUS_LABEL, dateTime as dateTimeBase, money as moneyBase, nonce, paymentStatusLabel, paymentTone } from '@/features/platform/accounting/lib/format'

import {
  createPaymentCheckout,
  createPaymentProvider,
  getCheckoutSources,
  getPaymentProviders,
  getPayments,
  updatePaymentProvider,
} from '../actions'
import { BUILT_IN_ADAPTERS, SETTLED_STATUSES, paymentSource, providerAdapter } from '../lib/format'
import type { CheckoutSourceOption, PaymentCounts, PaymentListItem, PaymentProviderRecord } from '../lib/types'

type View = 'transactions' | 'providers'
type ProviderForm = { provider: PaymentProviderRecord | null; values: Record<string, string> }

const STATUS_TABS = ['pending', 'captured', 'partially-refunded', 'refunded', 'failed', 'canceled'] as const
const RARE_TABS = ['creating', 'authorized'] as const
const ALL_FILTERS = { status: 'all', provider: 'all', from: '', to: '', search: '' }
const DAY_MS = 86_400_000

type QueueReason = { rank: number; label: string; tone: DeskTone }

/** Why a payment is waiting on the office, or null when it is settled and reconciled. */
function queueReason(tx: PaymentListItem, locale: 'pt-BR' | 'en-US'): QueueReason | null {
  if (tx.status === 'failed') return { rank: 0, label: locale === 'pt-BR' ? 'Falhou' : 'Failed', tone: 'bad' }
  if (SETTLED_STATUSES.includes(tx.status) && !tx.reconciledAt) return { rank: 1, label: locale === 'pt-BR' ? 'Não conciliado' : 'Not reconciled', tone: 'warn' }
  if (['creating', 'pending', 'authorized'].includes(tx.status)) return { rank: 2, label: locale === 'pt-BR' ? (tx.status === 'authorized' ? 'Autorizado, não capturado' : 'Não capturado') : (tx.status === 'authorized' ? 'Authorized, not captured' : 'Not captured'), tone: 'warn' }
  return null
}

function ageDays(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / DAY_MS))
}

export function PaymentsPageClient({
  timeZone,
  initialTransactions,
  initialCounts,
  initialError,
  initialProviders,
  initialProviderError,
}: {
  timeZone: string
  initialTransactions: PaymentListItem[]
  initialCounts: PaymentCounts | null
  initialError: string | null
  initialProviders: PaymentProviderRecord[]
  initialProviderError: string | null
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const money = (cents: number | null | undefined, currency = 'usd') => moneyBase(cents, currency, locale)
  const dateTime = (value: string | null | undefined, zone: string) => dateTimeBase(value, zone, locale)
  const router = useRouter()
  const [view, setView] = useState<View>('transactions')
  const [message, setMessage] = useState<string | null>(null)

  const [transactions, setTransactions] = useState(initialTransactions)
  const [counts, setCounts] = useState<PaymentCounts>(initialCounts ?? { all: 0 })
  const [error, setError] = useState(initialError)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('all')
  const [provider, setProvider] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const firstLoad = useRef(true)
  // The queue reads the unfiltered list, so tabs and search below do not hide waiting payments.
  const [queueSource, setQueueSource] = useState(initialTransactions)
  const [queueError, setQueueError] = useState(initialError)

  const dateError = from && to && from > to ? (pt ? 'A data inicial é posterior à data final' : 'Start date is after end date') : null

  const loadTransactions = useCallback(
    async (filters: { status: string; provider: string; from: string; to: string; search: string }) => {
      setLoading(true)
      const result = await getPayments(filters, timeZone)
      if (result.success) {
        setTransactions(result.data.transactions)
        setCounts(result.data.counts)
        setError(null)
        if (JSON.stringify(filters) === JSON.stringify(ALL_FILTERS)) {
          setQueueSource(result.data.transactions)
          setQueueError(null)
        }
      } else {
        setError(result.error)
      }
      setLoading(false)
    },
    [timeZone],
  )

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false
      return
    }
    if (dateError) return
    const timer = setTimeout(() => loadTransactions({ status, provider, from, to, search }), search ? 250 : 0)
    return () => clearTimeout(timer)
  }, [status, provider, from, to, search, dateError, loadTransactions])

  // Providers
  const [providers, setProviders] = useState(initialProviders)
  const [providerError, setProviderError] = useState(initialProviderError)
  const [providerForm, setProviderForm] = useState<ProviderForm | null>(null)
  const [providerFieldErrors, setProviderFieldErrors] = useState<FieldErrors>({})
  const [providerSubmitError, setProviderSubmitError] = useState<string | null>(null)
  const [providerBusy, setProviderBusy] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  const loadProviders = useCallback(async () => {
    const result = await getPaymentProviders()
    if (result.success) {
      setProviders(result.data.paymentProviders || [])
      setProviderError(null)
    } else {
      setProviderError(result.error)
    }
  }, [])

  const openProvider = (record: PaymentProviderRecord | null) => {
    const adapter = record ? providerAdapter(record) : 'manual'
    const builtIn = adapter && (BUILT_IN_ADAPTERS as readonly string[]).includes(adapter)
    setProviderForm({
      provider: record,
      values: {
        name: record?.name || '',
        code: record?.code || 'pp_',
        adapter: adapter === null ? 'mixed' : builtIn ? adapter : 'custom',
        adapterUrl: adapter && !builtIn ? adapter : '',
        isInstalled: record ? (record.isInstalled ? 'yes' : 'no') : 'yes',
      },
    })
    setProviderFieldErrors({})
    setProviderSubmitError(null)
  }

  const submitProvider = async () => {
    if (!providerForm) return
    const values = providerForm.values
    const errors: FieldErrors = {}
    const name = (values.name || '').trim()
    const code = (values.code || '').trim()
    if (!name) errors.name = pt ? 'Informe o nome' : 'Name is required'
    if (!providerForm.provider) {
      if (!/^pp_[a-zA-Z0-9-_]+$/.test(code)) errors.code = pt ? 'Comece com pp_ e use letras, números, hífen ou sublinhado' : 'Starts with pp_ then letters, numbers, - or _'
      else if (providers.some(p => p.code === code)) errors.code = pt ? 'Este código já está em uso' : 'Code is already used'
    }
    const url = (values.adapterUrl || '').trim()
    if (values.adapter === 'custom' && !/^https:\/\/\S+$/.test(url)) errors.adapterUrl = pt ? 'Informe uma URL HTTPS válida para o adaptador' : 'Enter an https:// adapter URL'
    setProviderFieldErrors(errors)
    if (Object.keys(errors).length) return
    const adapter = values.adapter === 'custom' ? url : values.adapter === 'mixed' ? undefined : values.adapter
    setProviderBusy(true)
    setProviderSubmitError(null)
    const result = providerForm.provider
      ? await updatePaymentProvider(providerForm.provider.id, { name, isInstalled: values.isInstalled === 'yes', ...(adapter ? { adapter } : {}) })
      : await createPaymentProvider({ name, code, adapter: adapter || 'manual', isInstalled: values.isInstalled === 'yes' })
    setProviderBusy(false)
    if (!result.success) {
      setProviderSubmitError(result.error)
      return
    }
    setMessage(pt ? (providerForm.provider ? 'Provedor atualizado.' : 'Provedor adicionado.') : providerForm.provider ? 'Provider updated.' : 'Provider added.')
    setProviderForm(null)
    await loadProviders()
  }

  const toggleProvider = async (record: PaymentProviderRecord) => {
    setToggling(record.id)
    const result = await updatePaymentProvider(record.id, { isInstalled: !record.isInstalled })
    setToggling(null)
    setMessage(result.success ? (pt ? `${record.name} ${record.isInstalled ? 'desativado' : 'ativado'}.` : (record.isInstalled ? `${record.name} disabled.` : `${record.name} enabled.`)) : result.error)
    if (result.success) await loadProviders()
  }

  const providerFields: CommandField[] = providerForm
    ? [
        { name: 'name', label: pt ? 'Nome' : 'Name', maxLength: 100 },
        { name: 'code', label: pt ? 'Código' : 'Code', maxLength: 100, disabled: Boolean(providerForm.provider) },
        {
          name: 'adapter',
          label: pt ? 'Adaptador' : 'Adapter',
          type: 'select',
          options: [
            { value: 'manual', label: pt ? 'Manual' : 'Manual' },
            { value: 'stripe', label: 'Stripe' },
            { value: 'custom', label: pt ? 'Adaptador HTTP' : 'HTTP adapter' },
            ...(providerForm.values.adapter === 'mixed' ? [{ value: 'mixed', label: pt ? 'Por função (inalterado)' : 'Per-function (unchanged)' }] : []),
          ],
        },
        { name: 'isInstalled', label: 'Status', type: 'select', options: [{ value: 'yes', label: pt ? 'Ativado' : 'Enabled' }, { value: 'no', label: pt ? 'Desativado' : 'Disabled' }] },
        ...(providerForm.values.adapter === 'custom' ? [{ name: 'adapterUrl', label: pt ? 'URL do adaptador' : 'Adapter URL', wide: true, maxLength: 500, placeholder: 'https://' } as CommandField] : []),
      ]
    : []

  // Checkout
  const installed = providers.filter(p => p.isInstalled)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [checkoutValues, setCheckoutValues] = useState<Record<string, string>>({})
  const [checkoutOptions, setCheckoutOptions] = useState<CheckoutSourceOption[]>([])
  const [checkoutOptionsState, setCheckoutOptionsState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [checkoutFieldErrors, setCheckoutFieldErrors] = useState<FieldErrors>({})
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [checkoutBusy, setCheckoutBusy] = useState(false)

  const loadCheckoutOptions = useCallback(async (type: string) => {
    setCheckoutOptionsState('loading')
    setCheckoutOptions([])
    const result = await getCheckoutSources(type)
    if (result.success) {
      setCheckoutOptions(result.data)
      setCheckoutOptionsState('idle')
    } else {
      setCheckoutOptionsState('error')
    }
  }, [])

  const openCheckout = () => {
    setCheckoutValues({ sourceType: 'service', sourceId: '', providerKey: installed[0]?.code || '', amount: '' })
    setCheckoutFieldErrors({})
    setCheckoutError(null)
    setCheckoutOpen(true)
    loadCheckoutOptions('service')
  }

  const changeCheckout = (values: Record<string, string>) => {
    if (values.sourceType !== checkoutValues.sourceType) {
      setCheckoutValues({ ...values, sourceId: '', amount: '' })
      loadCheckoutOptions(values.sourceType)
    } else if (values.sourceId !== checkoutValues.sourceId && !values.amount) {
      const option = checkoutOptions.find(o => o.id === values.sourceId)
      setCheckoutValues({ ...values, amount: option?.totalCents ? (option.totalCents / 100).toFixed(2) : '' })
    } else {
      setCheckoutValues(values)
    }
    setCheckoutFieldErrors({})
  }

  const submitCheckout = async () => {
    const errors: FieldErrors = {}
    if (!checkoutValues.sourceId) errors.sourceId = pt ? 'Selecione o registro de origem' : 'Choose a source record'
    if (!checkoutValues.providerKey) errors.providerKey = pt ? 'Selecione um provedor' : 'Choose a provider'
    const cents = parseDollarsToCents(checkoutValues.amount || '', locale)
    if (cents === null) errors.amount = pt ? 'Informe o valor em reais e centavos' : 'Enter dollars and cents'
    else if (cents <= 0) errors.amount = pt ? 'O valor deve ser maior que R$ 0,00' : 'Amount must be more than $0'
    setCheckoutFieldErrors(errors)
    if (Object.keys(errors).length || !cents) return
    setCheckoutBusy(true)
    setCheckoutError(null)
    const result = await createPaymentCheckout({
      sourceType: checkoutValues.sourceType,
      sourceId: checkoutValues.sourceId,
      providerKey: checkoutValues.providerKey,
      amountCents: cents,
      idempotencyKey: nonce('payment-checkout'),
    })
    setCheckoutBusy(false)
    if (!result.success) {
      setCheckoutError(result.error)
      return
    }
    setCheckoutOpen(false)
    router.push(`${basePath}/platform/payments/${result.data.createPaymentCheckout.id}`)
  }

  const checkoutFields: CommandField[] = [
    { name: 'sourceType', label: pt ? 'Tipo de origem' : 'Source type', type: 'select', options: [{ value: 'service', label: pt ? 'Ordem de serviço' : 'Service order' }, { value: 'deal', label: pt ? 'Venda' : 'Deal' }] },
    { name: 'providerKey', label: pt ? 'Provedor' : 'Provider', type: 'select', options: installed.map(p => ({ value: p.code, label: p.name })), placeholder: installed.length ? (pt ? 'Selecione um provedor' : 'Select a provider') : (pt ? 'Nenhum provedor ativado' : 'No enabled providers') },
    {
      name: 'sourceId',
      label: pt ? 'Registro de origem' : 'Source record',
      type: 'select',
      wide: true,
      disabled: checkoutOptionsState === 'loading' || checkoutOptions.length === 0,
      placeholder: checkoutOptionsState === 'loading' ? (pt ? 'Carregando…' : 'Loading…') : checkoutOptionsState === 'error' ? (pt ? 'Origens indisponíveis' : 'Sources unavailable') : checkoutOptions.length === 0 ? (pt ? 'Nenhum registro com valor a cobrar' : 'No payable records') : (pt ? 'Selecione um registro' : 'Select a record'),
      options: checkoutOptions.map(o => ({ value: o.id, label: [o.label, o.detail, o.totalCents ? money(o.totalCents) : ''].filter(Boolean).join(' · ') })),
    },
    { name: 'amount', label: pt ? 'Valor' : 'Amount', type: 'money' },
  ]

  const loadQueue = useCallback(async () => {
    const result = await getPayments(ALL_FILTERS, timeZone)
    if (result.success) {
      setQueueSource(result.data.transactions)
      setQueueError(null)
    } else {
      setQueueError(result.error)
    }
  }, [timeZone])

  const refresh = async () => {
    await Promise.all([dateError ? Promise.resolve() : loadTransactions({ status, provider, from, to, search }), loadProviders(), loadQueue()])
  }

  const queue = useMemo(
    () =>
      queueSource
        .map(tx => ({ tx, reason: queueReason(tx, locale) }))
        .filter((row): row is { tx: PaymentListItem; reason: QueueReason } => row.reason !== null)
        .sort((a, b) => a.reason.rank - b.reason.rank || new Date(a.tx.createdAt).getTime() - new Date(b.tx.createdAt).getTime()),
    [queueSource],
  )

  const filtered = Boolean(search.trim()) || status !== 'all' || provider !== 'all' || Boolean(from) || Boolean(to)
  const resetFilters = () => {
    setSearch('')
    setStatus('all')
    setProvider('all')
    setFrom('')
    setTo('')
  }
  const providerName = (code: string) => providers.find(p => p.code === code)?.name || code

  const statusOptions = [
    { value: 'all', label: pt ? 'Todos' : 'All', count: counts.all || 0 },
    { value: 'unreconciled', label: pt ? 'Não conciliados' : 'Unreconciled', count: counts.unreconciled || 0, tone: 'warn' as const },
    ...STATUS_TABS.map(value => ({ value, label: paymentStatusLabel(locale, PAYMENT_STATUS_LABEL[value]), count: counts[value] || 0, tone: paymentTone(value) })),
    ...RARE_TABS.filter(value => (counts[value] || 0) > 0 || status === value).map(value => ({ value, label: paymentStatusLabel(locale, PAYMENT_STATUS_LABEL[value]), count: counts[value] || 0, tone: paymentTone(value) })),
  ]

  const breadcrumbs = [
    { type: 'link' as const, label: pt ? 'Painel' : 'Dashboard', href: basePath },
    { type: 'page' as const, label: pt ? 'Plataforma' : 'Platform' },
    { type: 'page' as const, label: pt ? 'Pagamentos' : 'Payments' },
  ]

  const header = (
    <DeskHeader
      title={pt ? 'Pagamentos' : 'Payments'}
      tone={error ? 'bad' : (counts.failed || 0) > 0 ? 'bad' : (counts.unreconciled || 0) > 0 ? 'warn' : 'ok'}
      status={error ? (pt ? 'Indisponível' : 'Unavailable') : (counts.failed || 0) > 0 ? `${counts.failed} ${pt ? 'com falha' : 'failed'}` : (counts.unreconciled || 0) > 0 ? `${counts.unreconciled} ${pt ? 'não conciliados' : 'unreconciled'}` : (pt ? 'Em dia' : 'Clear')}
      meta={
        error
          ? (pt ? 'Indisponível' : 'Unavailable')
          : [
              (counts.failed || 0) > 0 ? `${counts.failed} ${pt ? 'com falha' : 'failed'}` : '',
              (counts.unreconciled || 0) > 0 ? `${counts.unreconciled} ${pt ? 'não conciliados' : 'not reconciled'}` : '',
              `${counts.all || 0} ${pt ? 'transações' : 'transactions'}`,
              pt ? `${installed.length} de ${providers.length} provedores ativados` : `${installed.length} of ${countLabel(providers.length, 'provider')} enabled`,
            ].filter(Boolean).join(' · ')
      }
      actions={
        <>
          <Pill variant="plain" onClick={refresh} disabled={loading} aria-label={pt ? 'Atualizar' : 'Refresh'} className="h-11 sm:h-8">
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            {pt ? 'Atualizar' : 'Refresh'}
          </Pill>
          {view === 'transactions' ? (
            <Pill variant="primary" onClick={openCheckout} className="h-11 sm:h-8">
              <Plus />
              {pt ? 'Nova cobrança' : 'New checkout'}
            </Pill>
          ) : (
            <Pill variant="primary" onClick={() => openProvider(null)} className="h-11 sm:h-8">
              <Plus />
              {pt ? 'Adicionar provedor' : 'Add provider'}
            </Pill>
          )}
        </>
      }
    />
  )

  return (
    <PageContainer title={pt ? 'Pagamentos' : 'Payments'} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-6 px-4 pb-24 md:px-6">
        {message && (
          <Notice tone="info">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0">{message}</p>
              <Track>
                <Pill size="sm" variant="plain" onClick={() => setMessage(null)} className="h-10 sm:h-7">{pt ? 'Fechar' : 'Dismiss'}</Pill>
              </Track>
            </div>
          </Notice>
        )}

        <DeskSection title={pt ? 'Pendências' : 'Needs you'} count={queueError ? undefined : queue.length} id="payments-queue">
          {queueError ? (
            <Notice tone="bad">Queue unavailable: {queueError}</Notice>
          ) : queue.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">{pt ? 'Nenhum pagamento com falha, não capturado ou não conciliado' : 'No failed, uncaptured or unreconciled payments'}</p>
          ) : (
            <DeskTable aria-labelledby="payments-queue">
              <thead>
                <tr>
                  <Th>{pt ? 'Pagamento' : 'Payment'}</Th>
                  <Th>{pt ? 'Pendência' : 'Waiting on'}</Th>
                  <Th priority={3}>{pt ? 'Provedor' : 'Provider'}</Th>
                  <Th priority={2} align="right">{pt ? 'Tempo' : 'Age'}</Th>
                  <Th align="right">{pt ? 'Valor' : 'Amount'}</Th>
                </tr>
              </thead>
              <tbody>
                {queue.map(({ tx, reason }) => {
                  const source = paymentSource(tx)
                  const days = ageDays(tx.createdAt)
                  return (
                    <Tr key={tx.id} className="cursor-pointer" onClick={() => router.push(`${basePath}/platform/payments/${tx.id}`)}>
                      <Td className="min-w-0">
                        <Link href={`${basePath}/platform/payments/${tx.id}`} className="block min-w-0 font-medium text-foreground hover:underline" onClick={event => event.stopPropagation()}>
                          {source.label}
                        </Link>
                        <p className="mt-0.5 flex min-w-0 flex-wrap gap-x-2 text-xs text-muted-foreground">
                          <Code>{recordReference('PAY', tx.id)}</Code>
                          {source.detail && <span>{source.detail}</span>}
                          <span className="md:hidden">{days}d</span>
                        </p>
                      </Td>
                      <Td>
                        {reason.tone === 'bad' ? (
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <Status tone="bad">{reason.label}</Status>
                            <Attention>{pt ? 'Tentar novamente ou cancelar' : 'Retry or cancel'}</Attention>
                          </span>
                        ) : (
                          <Status tone={reason.tone}>{reason.label}</Status>
                        )}
                        {tx.failureCode && <p className="mt-0.5"><Code>{tx.failureCode}</Code></p>}
                      </Td>
                      <Td priority={3} className="text-muted-foreground">{providerName(tx.providerKey)}</Td>
                      <Td priority={2} align="right">
                        <Figure size="sm">{days}</Figure>
                        <span className="ml-1 text-xs text-muted-foreground">{pt ? (days === 1 ? 'dia' : 'dias') : (days === 1 ? 'day' : 'days')}</span>
                      </Td>
                      <Td align="right" className="whitespace-nowrap">
                        <Figure size="sm">{money(tx.amountCents, tx.currency)}</Figure>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>


        <Segmented<View>
          label={pt ? 'Visualização de pagamentos' : 'Payments view'}
          value={view}
          onChange={setView}
          options={[
            { value: 'transactions', label: pt ? 'Transações' : 'Transactions', count: counts.all || 0 },
            { value: 'providers', label: pt ? 'Provedores' : 'Providers', count: providers.length },
          ]}
        />

        {view === 'transactions' ? (
          <div className="space-y-4">
            <div className="flex min-w-0 flex-col gap-3">
              <Segmented label={pt ? 'Status do pagamento' : 'Payment status'} value={status} onChange={setStatus} options={statusOptions} />
              <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_10rem_10rem]">
                <div className="relative min-w-0 sm:col-span-2 lg:col-span-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={event => setSearch(event.target.value)} placeholder={pt ? 'ID do pagamento, ID do provedor ou referência' : 'Payment ID, provider ID or reference'} aria-label={pt ? 'Buscar pagamentos' : 'Search payments'} className="h-11 rounded-[4px] pl-9 text-[13px] sm:h-9" />
                </div>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger className="text-[13px] h-11 w-full rounded-[4px] sm:h-9" aria-label={pt ? 'Provedor' : 'Provider'}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{pt ? 'Todos os provedores' : 'All providers'}</SelectItem>
                    {providers.map(p => (
                      <SelectItem key={p.id} value={p.code}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} aria-label={pt ? 'Data inicial' : 'From date'} aria-invalid={Boolean(dateError)} className="h-11 rounded-[4px] text-[13px] sm:h-9" />
                <Input type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} aria-label={pt ? 'Data final' : 'To date'} aria-invalid={Boolean(dateError)} className="h-11 rounded-[4px] text-[13px] sm:h-9" />
              </div>
              {dateError && <p className="text-xs text-red-600 dark:text-red-400">{dateError}</p>}
            </div>

            {error ? (
              <div className="space-y-3">
                <Notice tone="bad">
                  <p className="font-medium">{pt ? 'Pagamentos indisponíveis' : 'Payments are unavailable'}</p>
                  <p className="mt-0.5 text-muted-foreground">{error}</p>
                </Notice>
                <Track>
                  <Pill onClick={() => loadTransactions({ status, provider, from, to, search })} className="h-10 sm:h-8">{pt ? 'Tentar novamente' : 'Retry'}</Pill>
                </Track>
              </div>
            ) : transactions.length === 0 ? (
              <Panel aria-busy={loading}>
                <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
                  <p>{loading ? (pt ? 'Carregando…' : 'Loading…') : filtered ? (pt ? 'Nenhum pagamento encontrado' : 'No payments match') : (pt ? 'Nenhum pagamento' : 'No payments')}</p>
                  {filtered && !loading && (
                    <Track>
                      <Pill size="sm" onClick={resetFilters} className="h-10 sm:h-7">{pt ? 'Limpar filtros' : 'Reset filters'}</Pill>
                    </Track>
                  )}
                </div>
              </Panel>
            ) : (
              <div className={loading ? 'opacity-60 transition-opacity' : undefined} aria-busy={loading}>
                <DeskTable>
                  <thead>
                    <tr>
                      <Th>{pt ? 'Pagamento' : 'Payment'}</Th>
                      <Th>{pt ? 'Situação' : 'Status'}</Th>
                      <Th priority={2}>{pt ? 'Provedor' : 'Provider'}</Th>
                      <Th priority={3}>{pt ? 'Conciliado' : 'Reconciled'}</Th>
                      <Th priority={3}>{pt ? 'Criado em' : 'Created'}</Th>
                      <Th align="right">{pt ? 'Valor' : 'Amount'}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => {
                      const source = paymentSource(tx)
                      return (
                        <Tr key={tx.id} className="cursor-pointer" onClick={() => router.push(`${basePath}/platform/payments/${tx.id}`)}>
                          <Td className="min-w-0">
                            <Link href={`${basePath}/platform/payments/${tx.id}`} className="block min-w-0 font-medium text-foreground hover:underline" onClick={event => event.stopPropagation()}>
                              {source.label}
                            </Link>
                            <p className="mt-0.5 flex min-w-0 flex-wrap gap-x-2 text-xs text-muted-foreground">
                              <Code>{recordReference('PAY', tx.id)}</Code>
                              {source.detail && <span>{source.detail}</span>}
                              <span className="lg:hidden">{dateTime(tx.createdAt, timeZone)}</span>
                            </p>
                          </Td>
                          <Td>
                            <Status tone={paymentTone(tx.status)}>{paymentStatusLabel(locale, PAYMENT_STATUS_LABEL[tx.status] || tx.status)}</Status>
                            {tx.refundedCents > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{money(tx.refundedCents, tx.currency)} {pt ? 'estornados' : 'refunded'}</p>}
                          </Td>
                          <Td priority={2} className="text-muted-foreground">{providerName(tx.providerKey)}</Td>
                          <Td priority={3} className="text-muted-foreground">
                            {tx.reconciledAt ? (
                              <Status tone="ok">{pt ? 'Conciliado' : 'Reconciled'}</Status>
                            ) : SETTLED_STATUSES.includes(tx.status) ? (
                              <Status tone="warn">{paymentStatusLabel(locale, 'Not reconciled')}</Status>
                            ) : (
                              '-'
                            )}
                          </Td>
                          <Td priority={3} className="whitespace-nowrap text-muted-foreground">{dateTime(tx.createdAt, timeZone)}</Td>
                          <Td align="right" className="whitespace-nowrap font-medium">{money(tx.amountCents, tx.currency)}</Td>
                        </Tr>
                      )
                    })}
                  </tbody>
                </DeskTable>
              </div>
            )}
          </div>
        ) : providerError ? (
          <div className="space-y-3">
            <Notice tone="bad">
              <p className="font-medium">{pt ? 'Provedores indisponíveis' : 'Providers are unavailable'}</p>
              <p className="mt-0.5 text-muted-foreground">{providerError}</p>
            </Notice>
            <Track>
              <Pill onClick={loadProviders} className="h-10 sm:h-8">{pt ? 'Tentar novamente' : 'Retry'}</Pill>
            </Track>
          </div>
        ) : providers.length === 0 ? (
          <Panel>
            <p className="py-10 text-center text-sm text-muted-foreground">{pt ? 'Nenhum provedor de pagamento cadastrado' : 'No payment providers'}</p>
          </Panel>
        ) : (
          <DeskTable>
            <thead>
              <tr>
                <Th>{pt ? 'Provedor' : 'Provider'}</Th>
                <Th>{pt ? 'Situação' : 'Status'}</Th>
                <Th priority={3}>{pt ? 'Adaptador' : 'Adapter'}</Th>
                <Th priority={2} align="right">{pt ? 'Transações' : 'Transactions'}</Th>
                <Th align="right"><span className="sr-only">{pt ? 'Ações' : 'Actions'}</span></Th>
              </tr>
            </thead>
            <tbody>
              {providers.map(record => {
                const adapter = providerAdapter(record)
                return (
                  <Tr key={record.id}>
                    <Td className="min-w-0">
                      <p className="font-medium text-foreground">{record.name}</p>
                      <Code>{record.code}</Code>
                    </Td>
                    <Td><Status tone={record.isInstalled ? 'ok' : 'idle'}>{record.isInstalled ? (pt ? 'Ativado' : 'Enabled') : (pt ? 'Desativado' : 'Disabled')}</Status></Td>
                    <Td priority={3} className="max-w-[18rem] break-all text-muted-foreground">{adapter ? <Code>{adapter}</Code> : (pt ? 'Adaptadores por função' : 'Per-function adapters')}</Td>
                    <Td priority={2} align="right">{record.transactionsCount}</Td>
                    <Td align="right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Pill size="sm" className="h-10 sm:h-7" onClick={() => openProvider(record)}>
                          <Pencil />
                          {pt ? 'Editar' : 'Edit'}
                        </Pill>
                        <Pill size="sm" className="h-10 sm:h-7" disabled={toggling === record.id} onClick={() => toggleProvider(record)}>
                          <Power />
                          {record.isInstalled ? (pt ? 'Desativar' : 'Disable') : (pt ? 'Ativar' : 'Enable')}
                        </Pill>
                      </div>
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </DeskTable>
        )}

        <CommandDialog
          open={checkoutOpen}
          title={pt ? 'Nova cobrança' : 'New checkout'}
          fields={checkoutFields}
          values={checkoutValues}
          fieldErrors={checkoutFieldErrors}
          error={checkoutError}
          busy={checkoutBusy}
          submitLabel={pt ? 'Criar cobrança' : 'Create checkout'}
          onValuesChange={changeCheckout}
          onSubmit={submitCheckout}
          onOpenChange={setCheckoutOpen}
        />

        <CommandDialog
          open={Boolean(providerForm)}
          title={providerForm?.provider ? (pt ? 'Editar provedor' : 'Edit provider') : (pt ? 'Adicionar provedor' : 'Add provider')}
          fields={providerFields}
          values={providerForm?.values || {}}
          fieldErrors={providerFieldErrors}
          error={providerSubmitError}
          busy={providerBusy}
          submitLabel={providerForm?.provider ? (pt ? 'Salvar' : 'Save') : (pt ? 'Adicionar' : 'Add')}
          onValuesChange={values => { setProviderForm(current => (current ? { ...current, values } : current)); setProviderFieldErrors({}) }}
          onSubmit={submitProvider}
          onOpenChange={open => { if (!open) setProviderForm(null) }}
        />
        <ReadoutStrip>
          <Readout label={pt ? 'Pendentes' : 'Pending'} value={(counts.pending || 0) + (counts.creating || 0) + (counts.authorized || 0)} tone={counts.pending ? 'warn' : 'idle'} />
          <Readout label={pt ? 'Capturados' : 'Captured'} value={counts.captured || 0} tone="ok" />
          <Readout label={pt ? 'Não conciliados' : 'Unreconciled'} value={counts.unreconciled || 0} tone={counts.unreconciled ? 'warn' : 'idle'} />
          <Readout label={pt ? 'Com falha' : 'Failed'} value={counts.failed || 0} tone={counts.failed ? 'bad' : 'idle'} />
        </ReadoutStrip>
      </div>
    </PageContainer>
  )
}
