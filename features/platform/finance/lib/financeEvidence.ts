import { z } from 'zod'
import { readFinanceEvidence, type FinanceEvidence } from '@/features/platform/deals/lib/financeEvidence'
import type { FinanceStep, FinanceStepCode } from '@/features/keystone/lifecycle/financePrerequisites'

export type { FinanceStep, FinanceStepCode }
export type CashPaymentRecord = { id: string; netCents: number; capturedCents: number; refundedCents: number; method: string; providerKey: string; reference: string | null; status: string; receivedAt: string }
export type CashPaymentState = { amountDueCents: number; receivedCents: number; remainingCents: number; payments: CashPaymentRecord[]; cashReceivedCents: number; form8300Required: boolean }

/** The server's finance projection plus the step plan the finance and delivery desks act on. */
export type DeskFinanceEvidence = FinanceEvidence & {
  structureType: 'cash' | 'finance'
  steps: FinanceStep[]
  nextStep: FinanceStepCode | null
  payment: CashPaymentState | null
}

const bounded = z.string().max(1000)
const step = z.object({
  code: bounded.min(1),
  label: bounded.min(1),
  state: z.enum(['done', 'todo', 'optional']),
  available: z.boolean(),
  blockedReason: bounded.nullable(),
  detail: bounded.nullable(),
})
const cents = z.number().int()
const extras = z.object({
  structureType: z.enum(['cash', 'finance']),
  steps: z.array(step).max(40),
  nextStep: bounded.nullable(),
  payment: z.object({
    amountDueCents: cents,
    receivedCents: cents,
    remainingCents: cents,
    payments: z.array(z.object({
      id: bounded, netCents: cents, capturedCents: cents, refundedCents: cents, method: bounded, providerKey: bounded,
      reference: bounded.nullable(), status: bounded, receivedAt: bounded,
    })).max(200).default([]),
    cashReceivedCents: cents.default(0),
    form8300Required: z.boolean().default(false),
  }).nullable(),
})

// Base fields go through the shared parser; a missing or malformed plan is "no plan", never "done".
export function readDeskFinanceEvidence(value: unknown): DeskFinanceEvidence | null {
  const base = readFinanceEvidence(value)
  if (!base) return null
  const parsed = extras.safeParse(value)
  if (!parsed.success) return { ...base, structureType: 'finance', steps: [], nextStep: null, payment: null }
  return {
    ...base,
    structureType: parsed.data.structureType,
    steps: parsed.data.steps as FinanceStep[],
    nextStep: parsed.data.nextStep as FinanceStepCode | null,
    payment: parsed.data.payment,
  }
}

/** "899", "1,299.50", "$1,299" -> cents. Throws a staff-facing message otherwise. */
export function parseDollarsToCents(raw: string, label: string, locale: 'pt-BR' | 'en-US' = 'en-US') {
  const input = raw.trim().replace(locale === 'pt-BR' ? /^R\$\s?/ : /^\$\s?/, '').replace(/[^\d.,]/g, '')
  const value = locale === 'pt-BR'
    ? input.includes(',') ? input.replaceAll('.', '').replace(',', '.') : /^\d{1,3}(?:\.\d{3})+$/.test(input) ? input.replaceAll('.', '') : input
    : input.replaceAll(',', '')
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error(locale === 'pt-BR' ? `${label} deve ser um valor em reais, por exemplo 1.299,50.` : `${label} must be a dollar amount, for example 1,299.50.`)
  const [whole, fraction = ''] = value.split('.')
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(result) || result > 2_147_483_647) throw new Error(locale === 'pt-BR' ? `${label} está fora do limite permitido.` : `${label} is outside the supported range.`)
  return result
}

/** Cents -> "1,299.50" for prefilled dollar inputs. */
export function centsToDollarInput(value: number, locale: 'pt-BR' | 'en-US' = 'en-US') {
  return (value / 100).toLocaleString(locale, { minimumFractionDigits: value % 100 ? 2 : 0, maximumFractionDigits: 2 })
}
