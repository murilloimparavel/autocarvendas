export type CustomerRequestKind =
  | 'inquiry'
  | 'test-drive'
  | 'trade-in'
  | 'financing'
  | 'service'

const REFERENCE_PREFIX: Record<CustomerRequestKind, string> = {
  inquiry: 'INQ',
  'test-drive': 'TD',
  'trade-in': 'TRADE',
  financing: 'FIN',
  service: 'SVC',
}

// Internal scheduling reserves a requested slot; it is not customer-facing
// confirmation. Keep the saved lifecycle untouched and label its read state.
export function customerRequestStatusLabel(kind: string, status: string) {
  if (kind.toLowerCase() === 'service' && status === 'scheduled') return 'Confirmation pending'
  const label = status.trim().replaceAll('-', ' ')
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Status unavailable'
}

export function customerRequestReference(
  kind: CustomerRequestKind,
  persistedId?: string | null
) {
  const normalized = String(persistedId || '').trim().replace(/[^a-zA-Z0-9]/g, '')
  if (!normalized) return null
  return `${REFERENCE_PREFIX[kind]}-${normalized.slice(-8).toUpperCase()}`
}

/**
 * The reference shown back to the customer. A financing application has its own stored reference
 * (FIN-6E2377C9484641CF), which is what the confirmation screen gave them; other kinds derive one.
 */
export function customerFacingReference(
  kind: CustomerRequestKind,
  persistedId?: string | null,
  storedReference?: string | null
) {
  const stored = String(storedReference || '').trim()
  return stored || customerRequestReference(kind, persistedId)
}
