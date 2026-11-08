'use client'

import Link from 'next/link'
import { useCallback, useState } from 'react'
import { useLocale } from '@/features/i18n/LocaleProvider'
import { ArrowLeft, ExternalLink, RefreshCw, Scale, Undo2 } from 'lucide-react'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { Code, DeskHeader, DeskSection, DeskTable, Facts, Figure, Notice, Panel, Pill, Status, Td, Th, Tr, Track } from '@/features/platform/components/desk'
import { recordReference } from '@/features/platform/lib/format'
import { formatCentsForInput, parseDollarsToCents } from '@/features/platform/deals/lib/moneyInput'
import { CommandDialog, type FieldErrors } from '@/features/platform/accounting/components/CommandDialog'
import { PAYMENT_STATUS_LABEL, dateTime as dateTimeBase, money as moneyBase, nonce, paymentStatusLabel, paymentTone, refundTone } from '@/features/platform/accounting/lib/format'

import { getPayment, reconcilePaymentTransaction, requestPaymentRefund } from '../actions'
import { REFUNDABLE_STATUSES, SETTLED_STATUSES, paymentSource } from '../lib/format'
import type { PaymentDetail, PaymentProviderEventRecord, PaymentRefundRecord } from '../lib/types'

const REFUND_LABEL: Record<string, string> = { creating: 'Creating', pending: 'Pending', succeeded: 'Succeeded', failed: 'Failed', canceled: 'Canceled' }

export function PaymentDetailPageClient({
  id,
  timeZone,
  initialPayment,
  initialRefunds,
  initialEvents,
  initialError,
}: {
  id: string
  timeZone: string
  initialPayment: PaymentDetail | null
  initialRefunds: PaymentRefundRecord[]
  initialEvents: PaymentProviderEventRecord[]
  initialError: string | null
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const money = (cents: number | null | undefined, currency = 'usd') => moneyBase(cents, currency, locale)
  const dateTime = (value: string | null | undefined, zone: string) => dateTimeBase(value, zone, locale)
  const [payment, setPayment] = useState(initialPayment)
  const [refunds, setRefunds] = useState(initialRefunds)
  const [events, setEvents] = useState(initialEvents)
  const [error, setError] = useState(initialError)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'reconcile' | 'refund' | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await getPayment(id)
    if (result.success) {
      setPayment(result.data.paymentTransaction)
      setRefunds(result.data.paymentRefunds || [])
      setEvents(result.data.paymentProviderEvents || [])
      setError(null)
    } else {
      setError(result.error)
    }
    setLoading(false)
  }, [id])

  const breadcrumbs = [
    { type: 'link' as const, label: pt ? 'Painel' : 'Dashboard', href: basePath },
    { type: 'page' as const, label: pt ? 'Plataforma' : 'Platform' },
    { type: 'link' as const, label: pt ? 'Pagamentos' : 'Payments', href: `${basePath}/platform/payments` },
    { type: 'page' as const, label: recordReference('PAY', id) || (pt ? 'Pagamento' : 'Payment') },
  ]

  if (!payment) {
    return (
      <PageContainer
        title={pt ? 'Pagamento' : 'Payment'}
        breadcrumbs={breadcrumbs}
        header={
          <DeskHeader
            title={pt ? 'Pagamento' : 'Payment'}
            tone="bad"
            status={pt ? 'Indisponível' : 'Unavailable'}
            meta={error ? (pt ? 'Indisponível' : 'Unavailable') : (pt ? 'Não encontrado' : 'Not found')}
            actions={
              <Track>
                <Pill asChild className="h-11 sm:h-8">
                  <Link href={`${basePath}/platform/payments`}>
                    <ArrowLeft />
                    {pt ? 'Pagamentos' : 'Payments'}
                  </Link>
                </Pill>
              </Track>
            }
          />
        }
      >
        <div className="min-w-0 max-w-full space-y-3 px-4 pb-24 md:px-6">
          <Notice tone="bad">
            <p className="font-medium">{error ? (pt ? 'Pagamento indisponível' : 'Payment is unavailable') : (pt ? 'Pagamento não encontrado' : 'Payment not found')}</p>
            {error && <p className="mt-0.5 text-muted-foreground">{error}</p>}
          </Notice>
          <Track>
            <Pill onClick={load} disabled={loading} className="h-10 sm:h-8">{pt ? 'Tentar novamente' : 'Retry'}</Pill>
          </Track>
        </div>
      </PageContainer>
    )
  }

  const reservedRefunds = refunds.filter(r => ['creating', 'pending', 'succeeded'].includes(r.status)).reduce((total, r) => total + r.amountCents, 0)
  const refundable = Math.max(0, payment.capturedCents - reservedRefunds)
  const settled = SETTLED_STATUSES.includes(payment.status)
  const reconciled = Boolean(payment.reconciledAt)
  const reconcileWhy = reconciled ? 'Already reconciled' : !settled ? 'Needs a captured or refunded payment' : null
  const refundWhy = payment.status === 'refunded'
    ? 'Fully refunded'
    : !REFUNDABLE_STATUSES.includes(payment.status)
    ? 'Needs a captured payment'
    : !payment.providerTransactionId
      ? 'No provider transaction ID yet'
      : refundable <= 0
        ? 'Nothing left to refund'
        : null
  const source = paymentSource(payment)
  const statusLabel = paymentStatusLabel(locale, PAYMENT_STATUS_LABEL[payment.status] || payment.status)

  const open = (kind: 'reconcile' | 'refund') => {
    setDialog(kind)
    setValues(kind === 'refund' ? { amount: formatCentsForInput(refundable, locale), reason: '' } : { reference: '' })
    setFieldErrors({})
    setSubmitError(null)
  }

  const submit = async () => {
    const errors: FieldErrors = {}
    if (dialog === 'reconcile') {
      const reference = (values.reference || '').trim()
      if (!reference) errors.reference = pt ? 'Informe a referência da conciliação' : 'Reconciliation reference is required'
      else if (reference.length > 200) errors.reference = pt ? 'Máximo de 200 caracteres' : 'Up to 200 characters'
      setFieldErrors(errors)
      if (Object.keys(errors).length) return
      setBusy(true)
      setSubmitError(null)
      const result = await reconcilePaymentTransaction({ transactionId: payment.id, reconciliationReference: reference, idempotencyKey: nonce('payment-reconcile') })
      setBusy(false)
      if (!result.success) return setSubmitError(result.error)
      setMessage(pt ? 'Pagamento conciliado.' : 'Payment reconciled.')
    } else if (dialog === 'refund') {
      const cents = parseDollarsToCents(values.amount || '', locale)
      const reason = (values.reason || '').trim()
      if (cents === null) errors.amount = pt ? 'Informe o valor em reais e centavos' : 'Enter dollars and cents'
      else if (cents <= 0) errors.amount = pt ? 'O valor deve ser maior que R$ 0,00' : 'Amount must be more than $0'
      else if (cents > refundable) errors.amount = pt ? `Máximo de ${money(refundable, payment.currency)}` : `Up to ${money(refundable, payment.currency)}`
      if (!reason) errors.reason = pt ? 'Informe o motivo' : 'Reason is required'
      else if (reason.length > 500) errors.reason = pt ? 'Máximo de 500 caracteres' : 'Up to 500 characters'
      setFieldErrors(errors)
      if (Object.keys(errors).length || !cents) return
      setBusy(true)
      setSubmitError(null)
      const result = await requestPaymentRefund({ transactionId: payment.id, amountCents: cents, reason, idempotencyKey: nonce('payment-refund') })
      setBusy(false)
      if (!result.success) return setSubmitError(result.error)
    setMessage(pt ? `Estorno ${({ creating: 'em processamento', pending: 'pendente', succeeded: 'concluído', failed: 'com falha', canceled: 'cancelado' } as Record<string, string>)[result.data.requestPaymentRefund.status] || result.data.requestPaymentRefund.status}.` : `Refund ${REFUND_LABEL[result.data.requestPaymentRefund.status]?.toLowerCase() || result.data.requestPaymentRefund.status}.`)
    }
    setDialog(null)
    await load()
  }

  const age = Math.max(0, Math.floor((Date.now() - new Date(payment.createdAt).getTime()) / 86_400_000))
  const stateWords = [
    statusLabel,
    settled ? (reconciled ? 'reconciled' : 'not reconciled') : '',
  ].filter(Boolean).join(', ')
  // The next action is whichever the payment can take now: reconcile a settled payment first, then refund.
  const primaryAction: 'reconcile' | 'refund' | null = !reconcileWhy ? 'reconcile' : !refundWhy ? 'refund' : null

  const header = (
    <DeskHeader
      title={`${money(payment.amountCents, payment.currency)} · ${source.label}`}
      tone={paymentTone(payment.status)}
      status={statusLabel}
      meta={
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <Code>{recordReference('PAY', payment.id)}</Code>
          <span>{stateWords}</span>
          {[payment.paymentProvider?.name || payment.providerKey, payment.rooftop?.name].filter(Boolean).map(part => (
            <span key={part as string}>· {part}</span>
          ))}
        </span>
      }
      actions={
        <>
          <Pill asChild variant="plain" className="h-11 sm:h-8">
            <Link href={`${basePath}/platform/payments`}>
              <ArrowLeft />
              {pt ? 'Pagamentos' : 'Payments'}
            </Link>
          </Pill>
          <Pill variant="plain" onClick={load} disabled={loading} aria-label={pt ? 'Atualizar' : 'Refresh'} className="h-11 sm:h-8">
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            {pt ? 'Atualizar' : 'Refresh'}
          </Pill>
          {payment.checkoutUrl && ['creating', 'pending'].includes(payment.status) && (
            <Pill asChild className="h-11 sm:h-8">
              <a href={payment.checkoutUrl} target="_blank" rel="noreferrer noopener">
                <ExternalLink />
                {pt ? 'Abrir página de cobrança' : 'Open checkout'}
              </a>
            </Pill>
          )}
          <Pill
            variant={primaryAction === 'refund' ? 'primary' : 'raised'}
            disabled={Boolean(refundWhy)}
            aria-describedby={refundWhy ? 'why-refund' : undefined}
            onClick={() => open('refund')}
            className="h-11 sm:h-8"
          >
            <Undo2 />
            {pt ? 'Estornar' : 'Refund'}
          </Pill>
          <Pill
            variant={primaryAction === 'reconcile' ? 'primary' : 'raised'}
            disabled={Boolean(reconcileWhy)}
            aria-describedby="why-reconcile"
            onClick={() => open('reconcile')}
            className="h-11 sm:h-8"
          >
            <Scale />
            {pt ? 'Conciliar' : 'Reconcile'}
          </Pill>
        </>
      }
    />
  )

  return (
    <PageContainer title={pt ? 'Pagamento' : 'Payment'} header={header} breadcrumbs={breadcrumbs}>
      <div className="min-w-0 max-w-full space-y-8 px-4 pb-24 md:px-6">
        {message && (
          <Notice tone="ok">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0">{message}</p>
              <Track>
                <Pill size="sm" variant="plain" onClick={() => setMessage(null)} className="h-10 sm:h-7">{pt ? 'Fechar' : 'Dismiss'}</Pill>
              </Track>
            </div>
          </Notice>
        )}
        {error && <Notice tone="bad">{error}</Notice>}
        {payment.status === 'failed' && payment.failureCode && (
          <Notice tone="bad">
            {pt ? 'Falha:' : 'Failed:'} <Code className="text-inherit">{payment.failureCode}</Code>
          </Notice>
        )}

        <div className="grid min-w-0 gap-x-8 gap-y-1 text-[13px] text-muted-foreground sm:grid-cols-2">
          <p id="why-reconcile">
            <span className="font-medium text-foreground">{pt ? 'Conciliação: ' : 'Reconcile: '}</span>
            {reconciled ? (
              <>
                <Code>{payment.reconciliationReference}</Code> · {dateTime(payment.reconciledAt, timeZone)}
              </>
            ) : (pt && reconcileWhy ? ({ 'Already reconciled': 'Pagamento já conciliado', 'Needs a captured or refunded payment': 'É necessário que o pagamento esteja capturado ou estornado' } as Record<string, string>)[reconcileWhy] || reconcileWhy : reconcileWhy) || (
              <>
                {pt ? 'Aguardando ·' : 'Waiting ·'} {age} {pt ? (age === 1 ? 'dia' : 'dias') : (age === 1 ? 'day' : 'days')}
              </>
            )}
          </p>
          <p>
            <span className="font-medium text-foreground">{pt ? 'Estorno: ' : 'Refund: '}</span>
            {refundWhy ? <span id="why-refund">{pt ? ({ 'Fully refunded': 'Totalmente estornado', 'Needs a captured payment': 'É necessário que o pagamento tenha sido capturado', 'No provider transaction ID yet': 'Ainda não há ID da transação no provedor', 'Nothing left to refund': 'Não há saldo disponível para estorno' } as Record<string, string>)[refundWhy] || refundWhy : refundWhy}</span> : `${pt ? 'Até' : 'Up to'} ${money(refundable, payment.currency)}`}
          </p>
        </div>

        <Panel className="grid min-w-0 gap-x-8 px-4 py-1 lg:grid-cols-2">
          <Facts
            items={[
              { label: pt ? 'Status' : 'Status', value: <Status tone={paymentTone(payment.status)}>{statusLabel}</Status> },
              { label: pt ? 'Valor' : 'Amount', value: <Figure size="sm">{money(payment.amountCents, payment.currency)}</Figure> },
              { label: pt ? 'Capturado' : 'Captured', value: money(payment.capturedCents, payment.currency) },
              { label: pt ? 'Estornado' : 'Refunded', value: money(payment.refundedCents, payment.currency) },
              { label: pt ? 'Disponível para estorno' : 'Refundable', value: money(refundable, payment.currency) },
              { label: pt ? 'Origem' : 'Source', value: payment.sourceType === 'deal' ? (pt ? 'Venda' : 'Deal') : payment.sourceType === 'service' ? (pt ? 'Ordem de serviço' : 'Service order') : payment.sourceType === 'reservation' ? (pt ? 'Reserva de veículo' : 'Vehicle reservation') : payment.sourceType },
              { label: pt ? 'Registro' : 'Record', value: source.href ? <Link href={`${basePath}${source.href}`} className="underline underline-offset-2">{source.label}</Link> : source.label },
              source.detail ? { label: pt ? 'Cliente' : 'Customer', value: source.detail } : null,
            ]}
          />
          <Facts
            className="max-lg:border-t"
            items={[
              payment.rooftop ? { label: pt ? 'Loja' : 'Rooftop', value: payment.rooftop.name } : null,
              { label: pt ? 'Provedor' : 'Provider', value: payment.paymentProvider?.name || payment.providerKey },
              payment.providerTransactionId ? { label: pt ? 'ID da transação' : 'Transaction ID', value: payment.providerTransactionId, mono: true } : null,
              payment.providerSessionId ? { label: pt ? 'ID da sessão' : 'Session ID', value: payment.providerSessionId, mono: true } : null,
              { label: pt ? 'Criado em' : 'Created', value: dateTime(payment.createdAt, timeZone) },
              { label: pt ? 'Atualizado em' : 'Updated', value: dateTime(payment.updatedAt, timeZone) },
              { label: pt ? 'Versão' : 'Version', value: payment.version, mono: true },
            ]}
          />
        </Panel>

        <DeskSection title={pt ? 'Estornos' : 'Refunds'} count={refunds.length}>
          {refunds.length === 0 ? (
            <Panel>
              <p className="py-8 text-center text-sm text-muted-foreground">{pt ? 'Nenhum estorno' : 'No refunds'}</p>
            </Panel>
          ) : (
            <DeskTable>
              <thead>
                <tr>
                  <Th>{pt ? 'Situação' : 'Status'}</Th>
                  <Th priority={2}>{pt ? 'Motivo' : 'Reason'}</Th>
                  <Th priority={3}>{pt ? 'Estorno no provedor' : 'Provider refund'}</Th>
                  <Th priority={2}>{pt ? 'Solicitado em' : 'Requested'}</Th>
                  <Th align="right">{pt ? 'Valor' : 'Amount'}</Th>
                </tr>
              </thead>
              <tbody>
                {refunds.map(refund => (
                  <Tr key={refund.id}>
                    <Td>
                      <Status tone={refundTone(refund.status)}>{pt ? ({ creating: 'Criando', pending: 'Pendente', succeeded: 'Concluído', failed: 'Falhou', canceled: 'Cancelado' } as Record<string, string>)[refund.status] || refund.status : REFUND_LABEL[refund.status] || refund.status}</Status>
                      {refund.failureCode && <p className="mt-0.5 text-xs text-muted-foreground"><Code>{refund.failureCode}</Code></p>}
                      <p className="mt-0.5 break-words text-xs text-muted-foreground md:hidden">{refund.reason}</p>
                    </Td>
                    <Td priority={2} className="max-w-[24rem] break-words text-muted-foreground">{refund.reason}</Td>
                    <Td priority={3}>{refund.providerRefundId ? <Code>{refund.providerRefundId}</Code> : <span className="text-muted-foreground">-</span>}</Td>
                    <Td priority={2} className="whitespace-nowrap text-muted-foreground">{dateTime(refund.createdAt, timeZone)}</Td>
                    <Td align="right" className="whitespace-nowrap">{money(refund.amountCents, payment.currency)}</Td>
                  </Tr>
                ))}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>

        <DeskSection title={pt ? 'Eventos do provedor' : 'Provider events'} count={events.length}>
          {events.length === 0 ? (
            <Panel>
              <p className="py-8 text-center text-sm text-muted-foreground">{pt ? 'Nenhum evento do provedor' : 'No provider events'}</p>
            </Panel>
          ) : (
            <DeskTable className="table-fixed">
              <thead>
                <tr>
                  <Th>{pt ? 'Evento' : 'Event'}</Th>
                  <Th priority={2}>{pt ? 'Recebido em' : 'Received'}</Th>
                  <Th priority={3}>ID {pt ? 'do evento' : 'Event'}</Th>
                  <Th priority={3}>{pt ? 'Resumo criptográfico' : 'Digest'}</Th>
                </tr>
              </thead>
              <tbody>
                {events.map(event => (
                  <Tr key={event.id}>
                    <Td className="min-w-0">
                      <Code className="break-all text-foreground">{event.eventType}</Code>
                      {event.refund && <p className="text-xs text-muted-foreground">{pt ? 'Evento de estorno' : 'Refund event'}</p>}
                      <p className="mt-0.5 text-xs text-muted-foreground md:hidden">{dateTime(event.receivedAt, timeZone)}</p>
                    </Td>
                    <Td priority={2} className="text-muted-foreground">
                      {dateTime(event.receivedAt, timeZone)}
                      <p className="text-xs">{pt ? 'Assinado em' : 'Signed'} {dateTime(event.signatureTimestamp, timeZone)}</p>
                    </Td>
                    <Td priority={3}><p className="truncate font-mono text-[12px] text-muted-foreground" title={event.providerEventId}>{event.providerEventId}</p></Td>
                    <Td priority={3}><p className="truncate font-mono text-[12px] text-muted-foreground" title={event.payloadDigest}>{event.payloadDigest}</p></Td>
                  </Tr>
                ))}
              </tbody>
            </DeskTable>
          )}
        </DeskSection>

        <CommandDialog
          open={dialog === 'reconcile'}
          title={pt ? 'Conciliar pagamento' : 'Reconcile payment'}
          fields={[{ name: 'reference', label: pt ? 'Referência da conciliação' : 'Reconciliation reference', maxLength: 200, wide: true, placeholder: pt ? 'Referência do depósito ou extrato' : 'Deposit or statement reference' }]}
          values={values}
          fieldErrors={fieldErrors}
          error={submitError}
          busy={busy}
          submitLabel={pt ? 'Conciliar' : 'Reconcile'}
          onValuesChange={next => { setValues(next); setFieldErrors({}) }}
          onSubmit={submit}
          onOpenChange={value => { if (!value) setDialog(null) }}
        />

        <CommandDialog
          open={dialog === 'refund'}
          title={pt ? 'Estornar pagamento' : 'Refund payment'}
          description={`${pt ? 'Disponível para estorno:' : 'Refundable:'} ${money(refundable, payment.currency)}`}
          fields={[
            { name: 'amount', label: pt ? 'Valor' : 'Amount', type: 'money', wide: true },
            { name: 'reason', label: pt ? 'Motivo' : 'Reason', type: 'textarea', maxLength: 500 },
          ]}
          values={values}
          fieldErrors={fieldErrors}
          error={submitError}
          busy={busy}
          danger
          submitLabel={pt ? 'Estornar' : 'Refund'}
          onValuesChange={next => { setValues(next); setFieldErrors({}) }}
          onSubmit={submit}
          onOpenChange={value => { if (!value) setDialog(null) }}
        />
      </div>
    </PageContainer>
  )
}
