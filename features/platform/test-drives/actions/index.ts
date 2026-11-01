'use server'

import { revalidatePath } from 'next/cache'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

export type TestDrive = {
  id: string
  scheduledTime: string | null
  completed: boolean | null
  noShow: boolean | null
  cancelledAt: string | null
  driverLicenseVerified: boolean | null
  feedback: string | null
  interestedLevel: string | null
  lead: { id: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null; status: string | null } | null
  vehicle: { id: string; year: number | null; make: string | null; model: string | null; stockNumber: string | null; vin: string | null; price: number | null } | null
  salesperson: { id: string; name: string | null; email: string | null } | null
}

const TEST_DRIVES_PATH = '/dashboard/platform/test-drives'

export async function getTestDrives() {
  return keystoneClient<{ testDrives: TestDrive[] }>(`
    query TestDriveDesk {
      testDrives(orderBy: { scheduledTime: asc }, take: 200) {
        id
        scheduledTime
        completed
        noShow
        cancelledAt
        driverLicenseVerified
        feedback
        interestedLevel
        lead { id firstName lastName email phone status }
        vehicle { id year make model stockNumber vin price }
        salesperson { id name email }
      }
    }
  `, {}, { cache: 'no-store' })
}

export async function verifyTestDriveLicense(id: string) {
  const response = await keystoneClient(`
    mutation VerifyLicense($data: TestDriveWorkflowInput!) {
      updateTestDriveWorkflow(data: $data) { id driverLicenseVerified }
    }
  `, { data: { id, action: 'verify-license', idempotencyKey: `test-drive:${id}:verify-license` } })
  if (response.success) revalidatePath(TEST_DRIVES_PATH)
  return response
}

export async function completeTestDrive(data: { id: string; interestedLevel: string; feedback: string }) {
  const response = await keystoneClient(`
    mutation CompleteTestDrive($data: TestDriveWorkflowInput!) {
      updateTestDriveWorkflow(data: $data) { id completed interestedLevel feedback lead { id status lastContact } }
    }
  `, {
    data: {
      id: data.id,
      action: 'complete',
      interestedLevel: data.interestedLevel,
      feedback: data.feedback,
      idempotencyKey: `test-drive:${data.id}:complete`,
    },
  })
  if (response.success) revalidatePath(TEST_DRIVES_PATH)
  return response
}

export async function markTestDriveNoShow(id: string) {
  const response = await keystoneClient(`
    mutation MarkTestDriveNoShow($data: TestDriveWorkflowInput!) {
      updateTestDriveWorkflow(data: $data) { id completed noShow }
    }
  `, { data: { id, action: 'no-show', idempotencyKey: `test-drive:${id}:no-show` } })
  if (response.success) revalidatePath(TEST_DRIVES_PATH)
  return response
}

/** Staff cancel: same end state as the customer's own cancel, and it frees the vehicle's slot. */
export async function cancelTestDrive(id: string) {
  const response = await keystoneClient(`
    mutation CancelTestDrive($data: TestDriveWorkflowInput!) {
      updateTestDriveWorkflow(data: $data) { id completed cancelledAt }
    }
  `, { data: { id, action: 'cancel', idempotencyKey: `test-drive:${id}:cancel` } })
  if (response.success) revalidatePath(TEST_DRIVES_PATH)
  return response
}

export type TestDriveVehicleOption = { id: string; year: number | null; make: string | null; model: string | null; stockNumber: string | null }

export async function getTestDriveVehicles() {
  return keystoneClient<{ vehicles: TestDriveVehicleOption[] }>(`
    query TestDriveVehicles {
      vehicles(where: { status: { equals: "available" } }, orderBy: [{ stockNumber: asc }], take: 200) {
        id year make model stockNumber
      }
    }
  `, {}, { cache: 'no-store' })
}

type SchedulePayload = { ok: boolean; errorCode?: string | null; errorMessage?: string | null; testDriveId?: string | null }

/** Schedules a phone or walk-in customer through the same command the storefront uses. */
export async function scheduleTestDrive(data: {
  customerName: string
  customerEmail: string
  customerPhone: string
  preferredDate: string
  preferredTime: string
  vehicleId: string
  idempotencyKey: string
}) {
  const response = await keystoneClient<{ submitTestDrive: SchedulePayload }>(`
    mutation ScheduleTestDrive($data: SubmitTestDriveInput!) {
      submitTestDrive(data: $data) { ok errorCode errorMessage testDriveId }
    }
  `, { data })
  if (!response.success) return response
  const payload = response.data.submitTestDrive
  if (!payload?.ok) return { success: false as const, error: payload?.errorMessage || 'Unable to schedule test drive' }
  revalidatePath(TEST_DRIVES_PATH)
  return { success: true as const, data: payload }
}
