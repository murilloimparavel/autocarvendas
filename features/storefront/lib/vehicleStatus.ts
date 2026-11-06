export function vehicleConditionLabel(condition: string) {
  return condition === 'certified' ? 'Certified' : condition === 'new' ? 'New' : 'Pre-owned'
}

export type VehicleStatusTone = 'ok' | 'warn' | 'bad' | 'idle'

const STATUS: Record<string, { label: string; tone: VehicleStatusTone }> = {
  available: { label: 'Available', tone: 'ok' },
  pending: { label: 'Sale pending', tone: 'warn' },
  hold: { label: 'On hold', tone: 'warn' },
  reserved: { label: 'Reserved', tone: 'warn' },
  service: { label: 'In prep', tone: 'idle' },
  sold: { label: 'Sold', tone: 'bad' },
}

export function vehicleStatus(status: string): { label: string; tone: VehicleStatusTone } {
  return STATUS[status] ?? { label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unlisted', tone: 'idle' }
}
