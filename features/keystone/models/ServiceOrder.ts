import { list } from '@keystone-6/core'
import { allOperations } from '@keystone-6/core/access'
import { relationship, text, select, integer, timestamp, virtual, json } from '@keystone-6/core/fields'
import { graphql } from '@graphql-ts/schema'

import { permissions } from '../access'
import { isServiceOrderEvidenceLocked } from '../lifecycle/serviceOrderLifecycle'
import { assertAccessibleRelationship, connectedId } from '../lifecycle/relationshipGuards'
import { rooftopField, validateRooftopRecord, withRooftopScope } from '../tenantRecords'
import { trackingFields } from './trackingFields'

export const ServiceOrder = list({
  access: {
    operation: {
      query: permissions.canManageService,
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    filter: {
      query: ({ session }) => withRooftopScope(true, session as any, 'canManageService'),
      update: ({ session }) => withRooftopScope(true, session as any, 'canManageService'),
    },
    item: { create: () => false },
  },
  ui: {
    hideCreate: true,
    hideDelete: true,
    itemView: { defaultFieldMode: 'read' },
    listView: {
      initialColumns: ['appointment', 'status', 'laborTotal', 'partsTotal', 'grandTotal'],
    },
  },
  hooks: {
    validate: async (args: any) => {
      const { operation, resolvedData, item, context } = args
      if (operation === 'delete') throw new Error('Service order evidence cannot be deleted')
      await validateRooftopRecord(args, [{ field: 'appointment', listKey: 'ServiceAppointment' }])

      if (operation === 'create') {
        if (resolvedData.status && resolvedData.status !== 'estimate') {
          throw new Error('Service orders must start as estimates')
        }
        const appointmentId = connectedId(resolvedData.appointment)
        if (!appointmentId) throw new Error('Service order requires an appointment')
        const appointment = await assertAccessibleRelationship(
          context,
          'ServiceAppointment',
          appointmentId,
          'id serviceOrder { id }'
        )
        if (appointment?.serviceOrder) throw new Error('Appointment already has a service order')
        return
      }

      if (resolvedData.appointment !== undefined) {
        throw new Error('appointment cannot be moved to another record')
      }
      if (resolvedData.status !== undefined) {
        throw new Error('Service order status changes must use transitionServiceOrder')
      }
      if (isServiceOrderEvidenceLocked(item.status) && Object.keys(resolvedData).length > 0) {
        throw new Error('Completed, invoiced, and paid service order evidence is immutable')
      }
    },
  },
  fields: {
    ...trackingFields,
    rooftop: rooftopField(),
    // Link to Appointment
    appointment: relationship({
      ref: 'ServiceAppointment.serviceOrder',
      ui: {
        displayMode: 'select',
      },
      label: 'Appointment',
    }),

    // Work Description
    concern: text({ label: 'Customer Concern', ui: { displayMode: 'textarea' } }),
    cause: text({ label: 'Verified Cause', ui: { displayMode: 'textarea' } }),
    correction: text({ label: 'Correction', ui: { displayMode: 'textarea' } }),
    payType: select({ type: 'string', options: ['customer','warranty','internal'].map(value => ({ label: value, value })), defaultValue: 'customer' }),
    authorizationStatus: select({ type: 'string', options: ['pending','authorized','declined'].map(value => ({ label: value, value })), defaultValue: 'pending' }),
    authorizationEvidence: json({ defaultValue: {} }),
    inspectionEvidence: json({ defaultValue: [] }),
    declinedWork: json({ defaultValue: [] }),
    invoiceNumber: text(),
    diagnosis: text({
      ui: {
        displayMode: 'textarea',
        description: 'Initial diagnosis and findings',
      },
      label: 'Diagnosis',
    }),
    workPerformed: text({
      ui: {
        displayMode: 'textarea',
        description: 'Detailed description of work completed',
      },
      label: 'Work Performed',
    }),
    recommendations: text({
      ui: {
        displayMode: 'textarea',
        description: 'Recommended future service',
      },
      label: 'Recommendations',
    }),

    // Line Items
    laborOperations: relationship({ ref: 'ServiceLaborOperation.serviceOrder', many: true }),
    partsMovements: relationship({ ref: 'PartsMovement.serviceOrder', many: true }),
    paymentTransactions: relationship({ ref: 'PaymentTransaction.serviceOrder', many: true, access: { read: permissions.canViewReports, create: () => false, update: () => false } }),
    lineItems: relationship({
      ref: 'RepairOrderLineItem.serviceOrder',
      many: true,
      ui: {
        displayMode: 'cards',
        cardFields: ['itemType', 'description', 'quantity', 'price'],
        inlineCreate: { fields: ['itemType', 'description', 'quantity', 'unitPriceCents', 'priceCents'] },
        inlineEdit: { fields: ['itemType', 'description', 'quantity', 'unitPriceCents', 'priceCents'] },
      },
      label: 'Line Items',
    }),

    // Totals (can be calculated from line items or entered manually)
    laborTotalCents: integer({ label: 'Labor Total (cents)', ui: { description: 'Total labor charges in integer USD cents' } }),
    partsTotalCents: integer({ label: 'Parts Total (cents)', ui: { description: 'Total parts charges in integer USD cents' } }),
    laborTotal: virtual({
      field: graphql.field({ type: graphql.Float, resolve(item: any) { return item.laborTotalCents == null ? null : item.laborTotalCents / 100 } }),
      ui: { itemView: { fieldMode: 'read' } },
    }),
    partsTotal: virtual({
      field: graphql.field({ type: graphql.Float, resolve(item: any) { return item.partsTotalCents == null ? null : item.partsTotalCents / 100 } }),
      ui: { itemView: { fieldMode: 'read' } },
    }),
    subtotal: virtual({
      field: graphql.field({
        type: graphql.Float,
        async resolve(item) {
          const serviceOrder = item as any
          return (Number(serviceOrder.laborTotalCents || 0) + Number(serviceOrder.partsTotalCents || 0)) / 100
        },
      }),
      ui: {
        listView: { fieldMode: 'hidden' },
        itemView: { fieldMode: 'read' },
      },
    }),
    taxCents: integer({ label: 'Tax (cents)' }),
    grandTotalCents: integer({ label: 'Grand Total (cents)', ui: { description: 'Total including labor, parts, and tax in integer USD cents' } }),
    tax: virtual({
      field: graphql.field({ type: graphql.Float, resolve(item: any) { return item.taxCents == null ? null : item.taxCents / 100 } }),
      ui: { itemView: { fieldMode: 'read' } },
    }),
    grandTotal: virtual({
      field: graphql.field({ type: graphql.Float, resolve(item: any) { return item.grandTotalCents == null ? null : item.grandTotalCents / 100 } }),
      ui: { itemView: { fieldMode: 'read' } },
    }),

    // Status
    status: select({
      type: 'string',
      options: [
        { label: 'Estimate', value: 'estimate' },
        { label: 'Approved', value: 'approved' },
        { label: 'In Progress', value: 'in-progress' },
        { label: 'Completed', value: 'completed' },
        { label: 'Invoiced', value: 'invoiced' },
        { label: 'Paid Externally', value: 'paid' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
      defaultValue: 'estimate',
      label: 'Status',
      ui: {
        description: 'Paid means an operator reconciled an external/offline settlement; the app does not authorize or capture service payments.',
      },
    }),

    // Timestamps
    completedAt: timestamp({
      label: 'Completed At',
      ui: {
        description: 'When the service was completed',
      },
    }),
    lockedAt: timestamp({
      label: 'Evidence Locked At',
      ui: { itemView: { fieldMode: 'read' } },
    }),
    settledAt: timestamp({
      label: 'External Settlement Recorded At',
      ui: { itemView: { fieldMode: 'read' } },
    }),
    evidenceSnapshot: json({
      access: { create: () => false, update: () => false },
      defaultValue: {},
      label: 'Immutable Service Evidence',
      ui: { itemView: { fieldMode: 'read' } },
    }),
  },
})
