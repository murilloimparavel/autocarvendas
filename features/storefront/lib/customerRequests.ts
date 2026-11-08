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
export function customerRequestStatusLabel(kind: string, status: string, locale: 'pt-BR' | 'en-US' = 'en-US') {
  if (kind.toLowerCase() === 'service' && status === 'scheduled') return locale === 'pt-BR' ? 'Aguardando confirmação' : 'Confirmation pending'
  if (locale === 'pt-BR') {
    const label = status.trim().toLowerCase().replaceAll('-', ' ')
    const translated: Record<string, string> = {
      submitted: 'Solicitado', pending: 'Pendente', scheduled: 'Agendado', contacted: 'Contatado', qualified: 'Qualificado', 'test drive scheduled': 'Test-drive agendado', completed: 'Concluído', cancelled: 'Cancelado', canceled: 'Cancelado', 'no show': 'Não compareceu', approved: 'Aprovado', declined: 'Recusado', rejected: 'Rejeitado', funded: 'Financiado', delivered: 'Entregue', appraised: 'Avaliado', offered: 'Com proposta', acquired: 'Adquirido', closed: 'Encerrado', won: 'Ganho', lost: 'Perdido', 'in review': 'Em análise', 'under review': 'Em análise', 'submitted to lender': 'Enviado à financeira', conditional: 'Aprovado com condições', expired: 'Expirado', failed: 'Falhou', refunded: 'Reembolsado', paid: 'Pago', financed: 'Financiado',
    }
    return translated[label] || (label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Status indisponível')
  }
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
