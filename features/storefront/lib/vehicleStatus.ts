export function vehicleConditionLabel(condition: string, locale: 'pt-BR' | 'en-US' = 'en-US') {
  if (locale === 'pt-BR') return condition === 'certified' ? 'Certificado' : condition === 'new' ? 'Novo' : 'Usado'
  return condition === 'certified' ? 'Certified' : condition === 'new' ? 'New' : 'Pre-owned'
}

export type VehicleStatusTone = 'ok' | 'warn' | 'bad' | 'idle'

const STATUS: Record<string, { label: string; tone: VehicleStatusTone }> = {
  available: { label: 'Available', tone: 'ok' },
  pending: { label: 'Sale pending', tone: 'warn' },
  hold: { label: 'On hold', tone: 'warn' },
  service: { label: 'In prep', tone: 'idle' },
  sold: { label: 'Sold', tone: 'bad' },
}

export function vehicleStatus(status: string, locale: 'pt-BR' | 'en-US' = 'en-US'): { label: string; tone: VehicleStatusTone } {
  if (locale === 'pt-BR') {
    const labels: Record<string, string> = { available: 'Disponível', pending: 'Venda em andamento', hold: 'Reservado', service: 'Em preparação', sold: 'Vendido' }
    return { label: labels[status] || (status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Não anunciado'), tone: STATUS[status]?.tone || 'idle' }
  }
  return STATUS[status] ?? { label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unlisted', tone: 'idle' }
}
