// Test-drive / service request receipt email. Called AFTER the public submission has
// committed; a mail failure never fails the request. Exactly-once: a DomainAuditEvent row with
// a unique eventKey is claimed first (replay or concurrent retry fails the create and exits),
// and the send status is recorded in its metadata JSON.
export type RequestReceipt = {
  kind: 'test_drive' | 'service'
  requestId: string
  rooftopId: string
  to: string
  customerName: string
  what: string
  scheduledTime: string
  vehicleId: string
}

export function formatRequestedTime(iso: string, timeZone: string) {
  const zone = timeZone || 'UTC'
  const text = new Intl.DateTimeFormat('en-US', { timeZone: zone, dateStyle: 'full', timeStyle: 'short' }).format(new Date(iso))
  const label = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(new Date(iso)).find(part => part.type === 'timeZoneName')?.value || zone
  return `${text} ${label}`
}

function publicBaseUrl(context: any) {
  const configured = process.env.SMTP_STORE_LINK
  if (configured) return configured.replace(/\/+$/, '')
  const headers = (context?.req?.headers || {}) as Record<string, string | string[] | undefined>
  const first = (value: string | string[] | undefined) => String(Array.isArray(value) ? value[0] : value || '').split(',')[0].trim()
  const host = first(headers['x-forwarded-host']) || first(headers.host)
  if (!host || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return ''
  const proto = first(headers['x-forwarded-proto']) || (/^(localhost|127\.)/.test(host) ? 'http' : 'https')
  return `${proto}://${host}`
}

export async function deliverRequestReceipt(context: any, receipt: RequestReceipt) {
  const sudo = context.sudo()
  const eventKey = `request-receipt-email:${receipt.kind}:${receipt.requestId}`
  try {
    await sudo.prisma.domainAuditEvent.create({
      data: {
        rooftopId: receipt.rooftopId,
        eventKey,
        aggregateType: receipt.kind === 'test_drive' ? 'TestDrive' : 'ServiceAppointment',
        aggregateId: receipt.requestId,
        action: 'receipt_email',
        metadata: { status: 'sending' },
      },
      select: { id: true },
    })
  } catch {
    return // already claimed
  }
  const mark = async (status: string, extra: Record<string, unknown> = {}) => {
    try {
      await sudo.prisma.domainAuditEvent.update({ where: { eventKey }, data: { metadata: { status, ...extra } } })
    } catch {
      // The request is committed; bookkeeping must never surface.
    }
  }
  try {
    if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) {
      console.warn('Request receipt email skipped: SMTP is not configured', receipt.requestId)
      await mark('skipped_not_configured')
      return
    }
    const rooftop = await sudo.prisma.rooftop.findUnique({ where: { id: receipt.rooftopId }, select: { name: true, timezone: true } })
    const base = publicBaseUrl(context)
    const path = receipt.kind === 'test_drive' && receipt.vehicleId ? `/inventory/${receipt.vehicleId}` : receipt.kind === 'service' ? '/service' : '/inventory'
    const { sendRequestReceiptEmail } = await import('./mail')
    const result = await sendRequestReceiptEmail(receipt.to, {
      dealershipName: rooftop?.name || 'Our dealership',
      kind: receipt.kind,
      what: receipt.what,
      whenLabel: formatRequestedTime(receipt.scheduledTime, rooftop?.timezone || 'UTC'),
      requestNumber: receipt.requestId,
      customerName: receipt.customerName,
      url: base ? `${base}${path}` : '',
    })
    if (result.sent) await mark('sent', { sentAt: new Date().toISOString(), messageId: result.messageId || '' })
    else await mark('failed', { error: result.error || 'send_failed' })
  } catch (error) {
    console.error('Request receipt email failed:', error instanceof Error ? error.message : 'Unknown error')
    await mark('failed', { error: error instanceof Error ? error.message : 'send_failed' })
  }
}
