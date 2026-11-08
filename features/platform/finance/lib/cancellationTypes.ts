import type { MenuOption } from './menuTypes'

export type CancellationDeal = {
  id: string
  status: string | null
  saleDate: string | null
  rooftop: { id: string; name: string } | null
  lead: { id: string; firstName: string | null; lastName: string | null } | null
  vehicle: { id: string; year: number | null; make: string | null; model: string | null; stockNumber: string | null } | null
}

export type AcceptedMenu = {
  id: string
  version: number
  decidedAt: string | null
  optionsSnapshot: MenuOption[] | null
  selectedProductCodes: string[] | null
  deal: CancellationDeal | null
}

export type CancellationRecord = {
  id: string
  productCode: string
  status: string
  reason: string
  refundCents: number | null
  evidence: { evidenceReference?: string | null; refundBasis?: { method: string; retailPriceCents: number; termMonths: number; monthsUsed: number; cancellationFeeCents: number } | null } | null
  requestedAt: string
  completedAt: string | null
  createdAt: string
  deal: CancellationDeal | null
  menu: { id: string; version: number; decidedAt: string | null; optionsSnapshot: MenuOption[] | null; selectedProductCodes: string[] | null } | null
}

export type DealPayment = {
  id: string
  status: string
  amountCents: number
  capturedCents: number | null
  refundedCents: number | null
  deal: { id: string } | null
}

export type DealRefund = {
  id: string
  amountCents: number
  reason: string
  status: string
  createdAt: string
  transaction: { id: string; deal: { id: string } | null } | null
}

export type CancellationsWorkspace = {
  cancellations: CancellationRecord[]
  acceptedMenus: AcceptedMenu[]
  payments: DealPayment[] | null
  refunds: DealRefund[] | null
  currencyCode: string
}
