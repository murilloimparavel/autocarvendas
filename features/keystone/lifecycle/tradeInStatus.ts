// Trade-ins carry no status field. Their state follows from what has happened to them, and the
// admin desk and the customer's account both read it from here so they cannot disagree.

export type TradeInStatus = 'acquired' | 'on-deal' | 'closed' | 'offered' | 'submitted'

export type TradeInStatusFacts = {
  acquired?: boolean
  onDeal?: boolean
  leadStatus?: string | null
  offerAmountCents?: number | null
}

export function tradeInStatus({ acquired, onDeal, leadStatus, offerAmountCents }: TradeInStatusFacts): TradeInStatus {
  // Once the vehicle is in inventory or on a deal, the deal owns it whatever happens to the lead.
  if (acquired) return 'acquired'
  if (onDeal) return 'on-deal'
  // A request is closed when staff close its customer lead as lost.
  if (leadStatus === 'closed-lost') return 'closed'
  if (offerAmountCents != null) return 'offered'
  return 'submitted'
}

/** What the customer sees: closed, appraised once an offer exists, otherwise submitted. */
export function customerTradeInStatus(facts: TradeInStatusFacts): 'closed' | 'appraised' | 'submitted' {
  const status = tradeInStatus(facts)
  if (status === 'closed') return 'closed'
  return status === 'submitted' ? 'submitted' : 'appraised'
}
