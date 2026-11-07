// Contract package statuses: operator actions and provider status reports both write `status`.
// A signed or voided package must never be re-prepared or reported back to an earlier provider state.
export const CONTRACT_PROVIDER_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  preparing: [],
  ready: [],
  'awaiting-external-handoff': ['sent', 'viewed', 'signed', 'declined', 'void'],
  sent: ['viewed', 'signed', 'declined', 'void'],
  viewed: ['signed', 'declined', 'void'],
  signed: ['void'],
  declined: ['void'],
  void: [],
}
/** Statuses from which the package may be (re)prepared. Signed packages must be voided first. */
const REPREPARABLE = ['preparing', 'ready', 'awaiting-external-handoff', 'sent', 'viewed', 'declined', 'void']

export function assertContractAction(current: string | undefined, action: string, nextProviderStatus?: string) {
  const from = current || 'preparing'
  if (action === 'prepare' && !REPREPARABLE.includes(from)) throw new Error('A signed contract package must be voided before it is prepared again')
  if (action === 'mark-ready' && ['signed', 'sent', 'viewed', 'void'].includes(from)) throw new Error(`A ${from} contract package cannot be marked ready`)
  if (action === 'record-provider-status') {
    if (!nextProviderStatus || nextProviderStatus === from) return
    if (!CONTRACT_PROVIDER_TRANSITIONS[from]?.includes(nextProviderStatus)) throw new Error(`Contract package cannot move from ${from} to ${nextProviderStatus}`)
  }
}
