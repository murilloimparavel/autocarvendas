import { list } from '@keystone-6/core'
import { denyAll } from '@keystone-6/core/access'
import { relationship, text, select, timestamp } from '@keystone-6/core/fields'

import { permissions, rules } from '../access'
import { rooftopField, validateRooftopRecord } from '../tenantRecords'
import { trackingFields } from './trackingFields'

export const Lead = list({
  access: {
    operation: {
      query: permissions.canAccessLeads,
      // Public intake and operator commands own identity, assignment and lifecycle.
      // Raw and nested writes must not bypass their validation/audit transactions.
      create: denyAll,
      update: denyAll,
      delete: denyAll,
    },
    filter: {
      query: rules.canReadLeads,
    },
  },
  hooks: {
    validate: (args: any) => validateRooftopRecord(args, [
      { field: 'customer', listKey: 'Customer' },
      { field: 'interestedVehicle', listKey: 'Vehicle' },
      { field: 'assignedSalesperson', listKey: 'User', kind: 'user' },
    ]),
  },
  ui: {
    hideCreate: true,
    listView: {
      initialColumns: ['firstName', 'lastName', 'status', 'source', 'assignedSalesperson', 'createdAt'],
    },
  },
  fields: {
    ...trackingFields,
    rooftop: rooftopField(),
    customer: relationship({
      ref: 'Customer.leads',
      db: {
        extendPrismaSchema: field => field
          .replace(/customer Customer\?/g, 'customer Customer')
          .replace(/customerId String\?/g, 'customerId String'),
      },
      ui: { displayMode: 'select', labelField: 'primaryEmail' },
    }),

    // Contact Information
    firstName: text({
      validation: { isRequired: true },
      label: 'First Name',
    }),
    lastName: text({
      validation: { isRequired: true },
      label: 'Last Name',
    }),
    email: text({
      label: 'Email',
    }),
    phone: text({
      label: 'Phone',
    }),

    // Lead Source
    source: select({
      type: 'string',
      options: [
        { label: 'Walk-In', value: 'walk-in' },
        { label: 'Website', value: 'website' },
        { label: 'Phone', value: 'phone' },
        { label: 'Referral', value: 'referral' },
        { label: 'Advertisement', value: 'ad' },
        { label: 'Social Media', value: 'social' },
        { label: 'Third Party', value: 'third-party' },
      ],
      label: 'Source',
      ui: {
        description: 'How the lead found the dealership',
      },
    }),
    campaignKey: text({ access: { update: () => false }, label: 'Campaign key' }),
    cadenceKey: text({ access: { update: () => false }, label: 'Cadence key' }),
    cadenceStatus: select({
      access: { update: () => false },
      type: 'string',
      options: [
        { label: 'Not enrolled', value: 'none' },
        { label: 'Active', value: 'active' },
        { label: 'Paused', value: 'paused' },
        { label: 'Completed', value: 'completed' },
        { label: 'Suppressed', value: 'suppressed' },
      ],
      defaultValue: 'none',
      validation: { isRequired: true },
    }),
    cadenceStep: text({ access: { update: () => false }, label: 'Cadence step' }),
    cadenceDueAt: timestamp({ access: { update: () => false }, label: 'Cadence due' }),

    // Vehicle Interest
    interestedVehicle: relationship({
      ref: 'Vehicle.leads',
      ui: {
        displayMode: 'select',
        labelField: 'vin',
      },
      label: 'Interested Vehicle',
    }),
    budgetRange: select({
      type: 'string',
      options: [
        { label: 'Under $20,000', value: 'under-20k' },
        { label: '$20,000 - $30,000', value: '20-30k' },
        { label: '$30,000 - $40,000', value: '30-40k' },
        { label: '$40,000 - $50,000', value: '40-50k' },
        { label: '$50,000 - $75,000', value: '50-75k' },
        { label: '$75,000 - $100,000', value: '75-100k' },
        { label: 'Over $100,000', value: 'over-100k' },
      ],
      label: 'Budget Range',
    }),
    tradeInVehicle: text({
      label: 'Trade-In Vehicle',
      ui: {
        description: 'Description of vehicle they want to trade in',
      },
    }),

    // Timeline
    timeframe: select({
      type: 'string',
      options: [
        { label: 'Immediately', value: 'immediately' },
        { label: 'This Week', value: 'this-week' },
        { label: 'This Month', value: 'this-month' },
        { label: 'Just Looking', value: 'just-looking' },
      ],
      label: 'Purchase Timeframe',
    }),

    // Status
    status: select({
      access: { update: () => false },
      type: 'string',
      options: [
        { label: 'New', value: 'new' },
        { label: 'Contacted', value: 'contacted' },
        { label: 'Test Drive Scheduled', value: 'test-drive-scheduled' },
        { label: 'Negotiating', value: 'negotiating' },
        { label: 'Closed - Won', value: 'closed-won' },
        { label: 'Closed - Lost', value: 'closed-lost' },
      ],
      defaultValue: 'new',
      label: 'Status',
    }),

    // Assignment
    assignedSalesperson: relationship({
      ref: 'User.assignedLeads',
      ui: {
        displayMode: 'select',
        labelField: 'name',
      },
      label: 'Assigned Salesperson',
    }),
    assignedAt: timestamp({ access: { update: () => false }, label: 'Assigned At' }),
    firstResponseDueAt: timestamp({ access: { update: () => false }, label: 'First Response Due' }),
    firstResponseAt: timestamp({ access: { update: () => false }, label: 'First Response At' }),
    assignmentEvents: relationship({ ref: 'LeadAssignmentEvent.lead', many: true, access: { update: denyAll }, ui: { displayMode: 'count' } }),
    lostReasonCode: select({
      access: { update: () => false },
      type: 'string',
      options: [
        { label: 'Purchased elsewhere', value: 'purchased-elsewhere' },
        { label: 'Price', value: 'price' },
        { label: 'Financing', value: 'financing' },
        { label: 'Vehicle unavailable', value: 'vehicle-unavailable' },
        { label: 'No response', value: 'no-response' },
        { label: 'Timing', value: 'timing' },
        { label: 'Other', value: 'other' },
      ],
      label: 'Lost-sale outcome',
    }),
    lostReason: text({ access: { update: () => false }, label: 'Lost-sale details' }),

    // Notes
    notes: text({
      ui: {
        displayMode: 'textarea',
        description: 'Additional notes about the lead',
      },
      label: 'Notes',
    }),

    // Timestamps
    lastContact: timestamp({
      access: { update: () => false },
      label: 'Last Contact',
      ui: {
        description: 'Last time this lead was contacted',
      },
    }),

    // Relationships
    testDrives: relationship({
      ref: 'TestDrive.lead',
      many: true,
      access: { update: denyAll },
      ui: {
        displayMode: 'cards',
        cardFields: ['vehicle', 'scheduledTime', 'completed'],
        inlineCreate: { fields: ['vehicle', 'scheduledTime'] },
        inlineConnect: true,
      },
      label: 'Test Drives',
    }),
    tradeIns: relationship({
      ref: 'TradeIn.lead',
      many: true,
      access: { update: denyAll },
      ui: {
        displayMode: 'cards',
        cardFields: ['year', 'make', 'model', 'condition', 'offerAmount'],
      },
      label: 'Trade-In Requests',
    }),
    serviceAppointments: relationship({
      ref: 'ServiceAppointment.lead',
      many: true,
      access: { update: denyAll },
      ui: {
        displayMode: 'cards',
        cardFields: ['appointmentDate', 'serviceType', 'status', 'customerVehicleDescription'],
      },
      label: 'Service Appointments',
    }),
    deals: relationship({
      ref: 'Deal.lead',
      many: true,
      access: { update: denyAll },
      ui: {
        displayMode: 'cards',
        cardFields: ['vehicle', 'status', 'vehiclePrice'],
      },
      label: 'Deals',
    }),
    interactions: relationship({
      ref: 'CustomerInteraction.lead',
      many: true,
      access: { update: denyAll },
      ui: {
        displayMode: 'cards',
        cardFields: ['interactionType', 'date', 'outcome', 'followUpDate'],
        inlineCreate: { fields: ['interactionType', 'date', 'notes'] },
      },
      label: 'Interactions',
    }),
    tasks: relationship({
      ref: 'Task.lead',
      many: true,
      access: { update: denyAll },
      ui: {
        displayMode: 'cards',
        cardFields: ['title', 'dueDate', 'priority', 'completed'],
        inlineCreate: { fields: ['title', 'dueDate', 'priority'] },
      },
      label: 'Tasks',
    }),
    salesVisits: relationship({
      ref: 'SalesVisit.lead',
      many: true,
      access: { update: denyAll },
      ui: { displayMode: 'count' },
      label: 'Sales appointments and showroom visits',
    }),
    financingApplications: relationship({
      access: { read: permissions.canManageFinancing, update: denyAll },
      ref: 'FinancingApplication.lead',
      many: true,
      ui: { displayMode: 'count' },
      label: 'Restricted Financing Applications',
    }),
    paymentTransactions: relationship({
      ref: 'PaymentTransaction.lead',
      many: true,
      access: { read: permissions.canViewReports, create: denyAll, update: denyAll },
      ui: { displayMode: 'count' },
      label: 'Reservation deposits',
    }),
  },
})
