'use server'

import { openfrontClient } from '../lib/config'
import { getAuthHeaders } from '../lib/data/cookies'

export type StorefrontSubmissionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string | null }

type SubmissionPayload = {
  ok: boolean
  errorCode?: string | null
  errorMessage?: string | null
}

type CommonSubmissionInput = {
  rooftopSlug: string
  idempotencyKey: string
  website?: string
}

const SUBMISSION_FAILED = 'Unable to submit this request.'

async function executeSubmission<T extends SubmissionPayload>(
  field: string,
  document: string,
  input: CommonSubmissionInput & Record<string, unknown>
): Promise<StorefrontSubmissionResult<T>> {
  let response: Record<string, T>
  try {
    response = await openfrontClient.request<Record<string, T>>(
      document,
      { data: { ...input, idempotencyKey: input.idempotencyKey.trim() } },
      await getAuthHeaders()
    )
  } catch {
    return { success: false, error: SUBMISSION_FAILED }
  }
  const payload = response[field]
  if (!payload?.ok) {
    return {
      success: false,
      error: payload?.errorMessage || SUBMISSION_FAILED,
      code: payload?.errorCode,
    }
  }
  return { success: true, data: payload }
}

export async function submitStorefrontInquiry(input: CommonSubmissionInput & {
  firstName: string
  lastName: string
  email: string
  phone?: string
  preferredContact: string
  intent: string
  message?: string
  vehicleId?: string
}) {
  return executeSubmission<SubmissionPayload & { leadId?: string; reused?: boolean }>(
    'submitInquiry',
    `mutation SubmitInquiry($data: SubmitInquiryInput!) {
      submitInquiry(data: $data) {
        ok errorCode errorMessage leadId intent intentLabel preferredContact reused
        selectedVehicle { id vin stockNumber year make model price status }
      }
    }`,
    input
  )
}

export async function reserveStorefrontVehicle(input: CommonSubmissionInput & {
  firstName: string
  lastName: string
  email: string
  phone: string
  message?: string
  vehicleId: string
}) {
  return executeSubmission<SubmissionPayload & { leadId?: string; amountCents?: number; checkoutUrl?: string; reused?: boolean }>(
    'reserveVehicle',
    `mutation ReserveVehicle($data: ReserveVehicleInput!) {
      reserveVehicle(data: $data) {
        ok errorCode errorMessage leadId amountCents checkoutUrl reused
      }
    }`,
    input
  )
}

export async function submitStorefrontTestDrive(input: CommonSubmissionInput & {
  customerName: string
  customerEmail: string
  customerPhone: string
  preferredDate: string
  preferredTime: string
  vehicleId?: string
  message?: string
}) {
  return executeSubmission<SubmissionPayload & { testDriveId?: string; leadId?: string; reused?: boolean }>(
    'submitTestDrive',
    `mutation SubmitTestDrive($data: SubmitTestDriveInput!) {
      submitTestDrive(data: $data) {
        ok errorCode errorMessage testDriveId leadId scheduledTime reused
        vehicle { id vin stockNumber year make model price status }
      }
    }`,
    input
  )
}

export async function submitStorefrontTradeIn(input: CommonSubmissionInput & {
  firstName: string
  lastName: string
  email: string
  phone: string
  year: number
  make: string
  model: string
  trim?: string
  vin?: string
  mileage: number
  condition: string
  ownership: string
  payoffAmount?: number
  interestedVehicleId?: string
}) {
  return executeSubmission<SubmissionPayload & {
    tradeInId?: string
    leadId?: string
    estimatedMin?: number
    estimatedMax?: number
    estimateMode?: string
    providerRequestSent?: boolean
    reused?: boolean
  }>(
    'submitTradeIn',
    `mutation SubmitTradeIn($data: SubmitTradeInInput!) {
      submitTradeIn(data: $data) {
        ok errorCode errorMessage tradeInId leadId estimatedMin estimatedMax
        estimateMode providerRequestSent reused
        vehicle { id vin stockNumber year make model price status }
      }
    }`,
    input
  )
}

export async function submitStorefrontFinancing(input: CommonSubmissionInput & {
  fullName: string
  email: string
  phone: string
  employmentStatus: string
  annualIncome: number
  creditTier: string
  requestedAmount?: number | null
  monthlyPayment?: number | null
  downPayment?: number
  tradeInValue?: number
  apr?: number
  loanTerm?: number
  vehicleId?: string
  consent: boolean
  privacyAcknowledged: boolean
}) {
  return executeSubmission<SubmissionPayload & {
    applicationId?: string
    applicationReference?: string
    leadId?: string
    taskId?: string
    providerMode?: string
    providerRequestSent?: boolean
    reused?: boolean
  }>(
    'submitFinancing',
    `mutation SubmitFinancing($data: SubmitFinancingInput!) {
      submitFinancing(data: $data) {
        ok errorCode errorMessage applicationId applicationReference leadId taskId
        followUpDueAt applicationStatus providerMode providerRequestSent reused
        vehicle { id vin stockNumber year make model price status }
      }
    }`,
    input
  )
}

export async function submitStorefrontService(input: CommonSubmissionInput & {
  customerName: string
  customerEmail: string
  customerPhone: string
  appointmentDate: string
  appointmentTime: string
  serviceType: string
  vehicleYear: number
  vehicleMake: string
  vehicleModel: string
  vehicleVin?: string
  description?: string
  servicePackageId?: string
}) {
  return executeSubmission<SubmissionPayload & {
    serviceAppointmentId?: string
    leadId?: string
    requestedServiceLabel?: string
    reused?: boolean
  }>(
    'submitServiceBooking',
    `mutation SubmitServiceBooking($data: SubmitServiceBookingInput!) {
      submitServiceBooking(data: $data) {
        ok errorCode errorMessage serviceAppointmentId leadId appointmentDate
        serviceType status requestedServiceLabel reused
      }
    }`,
    input
  )
}
