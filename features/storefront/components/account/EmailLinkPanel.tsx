'use client'

import { useState, useTransition } from 'react'
import { MailCheck } from 'lucide-react'

import { sendCustomerEmailVerification } from '../../actions/customerRecords'
import type { CustomerEmailLink } from '../../lib/accountRecords'
import { Notice } from '../forms/RequestForm'
import { useLocale } from '@/features/i18n/LocaleProvider'

export function EmailLinkPanel({ link }: { link: CustomerEmailLink | null }) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  if (!link) return null

  const send = () => {
    setResult(null)
    startTransition(async () => {
      const response = await sendCustomerEmailVerification()
      setResult(response.ok ? { tone: 'ok', text: pt ? 'E-mail de verificação enviado.' : response.message || 'Verification email sent.' } : { tone: 'bad', text: response.error })
    })
  }

  return (
    <section className="sf-well mt-[var(--sf-space-lg)] space-y-3 p-4 sm:p-5" aria-labelledby="email-link-title">
      <h2 id="email-link-title" className="sf-title-line">
        <span className="sf-dot" data-tone={link.verified ? 'ok' : 'warn'} aria-hidden="true" />
        <span className="sf-heading text-[length:var(--sf-text-md)]">
          {link.verified ? (pt ? 'E-mail verificado' : 'Email verified') : (pt ? 'E-mail não verificado' : 'Email not verified')}
        </span>
      </h2>
      {/* Only the address may break anywhere; the sentence wraps at words. */}
      <p className="sf-muted pl-4 text-[length:var(--sf-text-sm)]">
        {link.verified ? (pt ? 'As solicitações feitas com ' : 'Requests made with ') : (pt ? 'Confirme ' : 'Verify ')}
        <span className="break-all">{link.email}</span>
        {link.verified ? (pt ? ' estão vinculadas a esta conta.' : ' are linked to this account.') : (pt ? ' para vincular a esta conta as solicitações feitas antes de entrar.' : ' to link requests made with it before you signed in.')}
      </p>
      {result && <Notice tone={result.tone}>{result.text}</Notice>}
      <button type="button" onClick={send} disabled={pending} className={`sf-btn sf-btn-sm min-h-10 ${link.verified ? 'sf-btn-ghost' : 'sf-btn-primary'}`}>
        <MailCheck className="size-4" aria-hidden="true" />
        {pending ? (pt ? 'Enviando' : 'Sending') : link.verified ? (pt ? 'Vincular novas solicitações' : 'Link new requests') : (pt ? 'Enviar e-mail de verificação' : 'Send verification email')}
      </button>
    </section>
  )
}
