import { assertServiceSlotCapacity } from './bookingCapacity'
import { requestingAccountId } from './customerAccount'
import { resolveCustomerInTransaction } from './customerIdentity'
import { runPublicSubmission } from './publicSubmissionPolicy'
import { deliverRequestReceipt } from '../lib/requestReceiptEmail'
import { SubmissionError } from './submissionErrors'
import {
  finiteNumber,
  optionalText,
  parseScheduledTime,
  requiredText,
  splitCustomerName,
  validEmail,
  validPhone,
} from './submissionUtils'

const SERVICES: Record<string, { serviceType: string; label: string; duration: number }> = {
  oil_change: { serviceType: 'maintenance', label: 'Oil Change', duration: 45 },
  brake_service: { serviceType: 'repair', label: 'Brake Service', duration: 120 },
  battery_service: { serviceType: 'maintenance', label: 'Battery Service', duration: 60 },
  diagnostics: { serviceType: 'diagnostic', label: 'Diagnostics', duration: 90 },
  tire_service: { serviceType: 'maintenance', label: 'Tire Service', duration: 90 },
  state_inspection: { serviceType: 'inspection', label: 'State Inspection', duration: 60 },
  scheduled_maintenance: { serviceType: 'maintenance', label: 'Scheduled Maintenance', duration: 120 },
  repair: { serviceType: 'repair', label: 'Repair', duration: 120 },
  other: { serviceType: 'diagnostic', label: 'Other / Initial Diagnosis', duration: 90 },
}

// ServiceAppointment.serviceType is a coarse category. A booked menu package sets it from the
// package itself, so the category never comes from an unrelated storefront type.
const PACKAGE_CATEGORIES: [RegExp, string][] = [
  [/\brecall/i, 'recall'],
  [/\bwarranty/i, 'warranty'],
  [/\binspection\b/i, 'inspection'],
  [/\bdiagnos/i, 'diagnostic'],
  [/\b(repair|brake)/i, 'repair'],
]

function packageServiceType(name: string) {
  return PACKAGE_CATEGORIES.find(([pattern]) => pattern.test(name))?.[1] ?? 'maintenance'
}

export async function submitServiceBooking(_root: unknown, { data }: { data: any }, context: any) {
  const customerName = requiredText(data.customerName, 'Customer name', 200)
  const email = validEmail(data.customerEmail)
  const phone = validPhone(data.customerPhone)
  const year = finiteNumber(data.vehicleYear, 'Vehicle year', {
    min: 1900,
    max: new Date().getFullYear() + 1,
    integer: true,
  })
  const make = requiredText(data.vehicleMake, 'Vehicle make', 100)
  const model = requiredText(data.vehicleModel, 'Vehicle model', 100)
  const vin = optionalText(data.vehicleVin, 17, 'VIN').toUpperCase()
  const serviceKey = requiredText(data.serviceType, 'Service type', 100)
  const service = SERVICES[serviceKey]
  if (!service) throw new SubmissionError('A supported service is required.')
  if (vin && (vin.length !== 17 || /[IOQ]/.test(vin))) {
    throw new SubmissionError('VIN must be a valid 17-character identifier when provided.')
  }
  const requestedDate = requiredText(data.appointmentDate, 'Appointment date', 10)
  const requestedTime = requiredText(data.appointmentTime, 'Appointment time', 20)
  const servicePackageId = optionalText(data.servicePackageId, 100, 'Service package')
  const concern = optionalText(data.description, 4000, 'Service concern') || `${service.label} requested from storefront.`
  const vehicleDescription = `${year} ${make} ${model}${vin ? ` · VIN ${vin}` : ''}`
  const { firstName, lastName } = splitCustomerName(customerName, 'Service', 'Customer')

  return runPublicSubmission({
    context,
    workflow: 'service',
    rooftopSlug: data.rooftopSlug,
    idempotencyKey: data.idempotencyKey,
    honeypot: data.website,
    requestEvidence: {
      customerName,
      email,
      phone,
      year,
      make,
      model,
      vin,
      serviceKey,
      servicePackageId,
      requestedDate,
      requestedTime,
      concern,
    },
    aggregateType: 'ServiceAppointment',
    topic: 'public-service-appointment.submitted',
    aggregateId: result => String(result.serviceAppointmentId),
    afterCommit: (r, rooftopId) => deliverRequestReceipt(context, ((result: any) => ({
      kind: 'service', requestId: String(result.serviceAppointmentId), rooftopId, to: email, customerName,
      what: String(result.requestedServiceLabel || 'Service appointment'),
      scheduledTime: new Date(result.appointmentDate).toISOString(), vehicleId: '',
    }))(r)),
    handler: async (transactionContext, { rooftopId }) => {
      const location = await transactionContext.prisma.rooftop.findUnique({ where: { id: rooftopId }, select: { timezone: true } })
      const scheduled = parseScheduledTime(requestedDate, requestedTime, 'Appointment', location?.timezone || 'UTC')
      const capacitySlot = await assertServiceSlotCapacity(transactionContext, rooftopId, scheduled.iso)
      const servicePackage = servicePackageId
        ? await transactionContext.prisma.servicePackage.findFirst({ where: { id: servicePackageId, rooftopId }, select: { id: true, name: true, estimatedDuration: true } })
        : null
      if (servicePackageId && !servicePackage) throw new SubmissionError('The selected service package is unavailable.')
      const rooftop = { connect: { id: rooftopId } }
      const requestedLabel = servicePackage?.name || service.label
      const { customer } = await resolveCustomerInTransaction(transactionContext, {
        rooftopId,
        firstName,
        lastName,
        email,
        phone,
      })
      const appointment = await transactionContext.sudo().query.ServiceAppointment.createOne({
        data: {
          rooftop,
          ...(requestingAccountId(context) ? { requestedBy: { connect: { id: requestingAccountId(context)! } } } : {}),
          appointmentDate: scheduled.iso,
          serviceType: servicePackage ? packageServiceType(servicePackage.name) : service.serviceType,
          status: 'scheduled',
          vehicleVin: vin || '',
          transportationNeed: 'drop-off',
          capacitySlot,
          customerVehicleDescription: vehicleDescription,
          description: concern,
          estimatedDuration: servicePackage?.estimatedDuration || service.duration,
          ...(servicePackage ? { servicePackage: { connect: { id: servicePackage.id } } } : {}),
          advisorNotes: [
            `Requested service: ${requestedLabel}`,
            ...(servicePackage ? [`Service package: ${servicePackage.name}`] : []),
            `Requested slot: ${scheduled.date} at ${scheduled.time}`,
            vin ? `Customer vehicle VIN: ${vin}` : 'Customer vehicle VIN not provided',
          ].join('\n'),
          lead: {
            create: {
              rooftop,
              customer: { connect: { id: customer.id } },
              firstName,
              lastName,
              email,
              phone,
              source: 'website',
              status: 'new',
              timeframe: 'immediately',
              notes: [
                `Service appointment request for ${requestedLabel}.`,
                `Customer vehicle: ${vehicleDescription}.`,
                `Requested slot: ${scheduled.date} at ${scheduled.time}.`,
                `Customer concern: ${concern}`,
              ].join('\n'),
            },
          },
        },
        query: 'id appointmentDate serviceType status lead { id } servicePackage { id name }',
      })
      return {
        serviceAppointmentId: appointment.id,
        leadId: appointment.lead.id,
        appointmentDate: new Date(appointment.appointmentDate),
        serviceType: appointment.serviceType,
        status: appointment.status,
        requestedServiceLabel: appointment.servicePackage?.name || requestedLabel,
        servicePackageId: appointment.servicePackage?.id || null,
      }
    },
  })
}
