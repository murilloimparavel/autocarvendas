import { assertTestDriveVehicleCapacity } from './bookingCapacity'
import { requestingAccountId } from './customerAccount'
import { resolveCustomerInTransaction } from './customerIdentity'
import { runPublicSubmission } from './publicSubmissionPolicy'
import { deliverRequestReceipt } from '../lib/requestReceiptEmail'
import { localeFromCookieHeader } from '../../i18n/server'
import {
  optionalText,
  parseScheduledTime,
  requiredText,
  resolveAvailableVehicle,
  splitCustomerName,
  validEmail,
  validPhone,
} from './submissionUtils'

export type SubmitTestDriveInput = {
  customerName?: unknown
  customerEmail?: unknown
  customerPhone?: unknown
  preferredDate?: unknown
  preferredTime?: unknown
  vehicleId?: unknown
  message?: unknown
  rooftopSlug?: unknown
  idempotencyKey?: unknown
  website?: unknown
}

export async function submitTestDrive(_root: unknown, { data }: { data: SubmitTestDriveInput }, context: any) {
  const customerName = requiredText(data.customerName, 'Customer name', 200)
  const email = validEmail(data.customerEmail)
  const phone = validPhone(data.customerPhone)
  const message = optionalText(data.message, 4000, 'Message')
  const requestedDate = requiredText(data.preferredDate, 'Preferred date', 10)
  const requestedTime = requiredText(data.preferredTime, 'Preferred time', 20)
  const { firstName, lastName } = splitCustomerName(customerName, 'Website', 'Lead')

  return runPublicSubmission({
    context,
    workflow: 'test-drive',
    rooftopSlug: data.rooftopSlug,
    idempotencyKey: data.idempotencyKey,
    honeypot: data.website,
    requestEvidence: {
      customerName,
      email,
      phone,
      message,
      requestedDate,
      requestedTime,
      vehicleId: optionalText(data.vehicleId, 100, 'Vehicle'),
    },
    aggregateType: 'TestDrive',
    topic: 'public-test-drive.submitted',
    aggregateId: result => String(result.testDriveId),
    afterCommit: (r, rooftopId) => deliverRequestReceipt(context, ((result: any) => ({
      kind: 'test_drive', requestId: String(result.testDriveId), rooftopId, to: email, customerName,
      what: result.vehicle ? [result.vehicle.year, result.vehicle.make, result.vehicle.model].filter(Boolean).join(' ') : 'Test drive',
      scheduledTime: new Date(result.scheduledTime).toISOString(), vehicleId: result.vehicle?.id || '',
    }))(r), localeFromCookieHeader(context?.req?.headers?.cookie)),
    handler: async (transactionContext, { rooftopId }) => {
      // The public policy has validated this active rooftop and request token.
      const location = await transactionContext.prisma.rooftop.findUnique({ where: { id: rooftopId }, select: { timezone: true } })
      const scheduled = parseScheduledTime(requestedDate, requestedTime, 'Preferred', location?.timezone || 'UTC')
      const vehicle = await resolveAvailableVehicle(transactionContext, data.vehicleId, rooftopId)
      if (vehicle) await assertTestDriveVehicleCapacity(transactionContext, vehicle.id, scheduled.iso)
      const rooftop = { connect: { id: rooftopId } }
      const { customer } = await resolveCustomerInTransaction(transactionContext, {
        rooftopId,
        firstName,
        lastName,
        email,
        phone,
      })
      const testDrive = await transactionContext.sudo().query.TestDrive.createOne({
        data: {
          rooftop,
          ...(requestingAccountId(context) ? { requestedBy: { connect: { id: requestingAccountId(context)! } } } : {}),
          scheduledTime: scheduled.iso,
          completed: false,
          driverLicenseVerified: false,
          ...(vehicle ? { vehicle: { connect: { id: vehicle.id } } } : {}),
          lead: {
            create: {
              rooftop,
              customer: { connect: { id: customer.id } },
              firstName,
              lastName,
              email,
              phone,
              source: 'website',
              status: 'test-drive-scheduled',
              notes: [
                `Test drive request submitted for ${scheduled.date} at ${scheduled.time}.`,
                message ? `Customer notes: ${message}` : null,
              ].filter(Boolean).join('\n'),
              ...(vehicle ? { interestedVehicle: { connect: { id: vehicle.id } } } : {}),
            },
          },
        },
        query: 'id scheduledTime lead { id }',
      })
      return {
        testDriveId: testDrive.id,
        leadId: testDrive.lead.id,
        scheduledTime: new Date(testDrive.scheduledTime),
        vehicle,
      }
    },
  })
}
