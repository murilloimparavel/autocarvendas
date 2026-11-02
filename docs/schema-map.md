# Openfront Dealership: schema map

Step 1 of the platform coverage brief (`~/Code/Euler/state/briefs/platform-coverage-2026-10-23.md`). Written from a full read of `features/keystone/models/**`, `features/keystone/access.ts`, `features/keystone/lifecycle/**`, `features/keystone/mutations/**`, the onboarding seed, every platform slice under `features/platform/**` with its route wrappers under `app/dashboard/(admin)/platform/**`, and the storefront under `app/(storefront)/**` and `features/storefront/**`. Read only; nothing was run.

Conventions used below:

- **Write path.** "Command only" means the list's `access.operation.create` and `update` are `() => false` or `denyAll`, so every write goes through a custom mutation (or a hook or seed running as sudo). "Open CRUD" means Keystone create/update are allowed for the named permission, so the generic `/dashboard/<list>` pages can write it.
- **Rooftop scoping.** Almost every operating list has `rooftop: rooftopField()` (`features/keystone/tenantRecords.ts:12`) and a `withRooftopScope` / `withRooftopPermissionScope` filter (`tenantRecords.ts:30`). Item create is gated by `canCreateRooftopRecord` (`tenantRecords.ts:107`). Permissions resolve from the user's Role, and the operating permissions can also come from an active dealer-group or rooftop membership role for that scope only (`access.ts:45-73`).
- **Audit.** Every custom command writes a `DomainAuditEvent` plus a `DomainOutboxEvent` in the same transaction through `recordDomainEventInTransaction` (`lifecycle/domainEvents.ts:54-112`). The idempotency key is the event key, so a retry with the same key replays and a reused key with different evidence throws. This is why most lists are command-only.
- **Registered lists.** `features/keystone/models/index.ts:73-145` registers **71** lists, not 73. The other four files in the folder are helpers: `fields.ts` (Role permission checkboxes), `trackingFields.ts` (`createdAt` and `updatedAt`), `prismaSchema.ts` and `index.ts`. `AuthenticationThrottle` is registered, but it is GraphQL-omitted and unused (`AuthenticationThrottle.ts:1-9`).
- **Platform route** means `/dashboard/platform/<slice>`. A thin wrapper lives at `app/dashboard/(admin)/platform/<slice>/page.tsx`, and the logic lives in `features/platform/<slice>`. **Generic page** means the Keystone model pages at `/dashboard/<list>` (`app/dashboard/(admin)/[listKey]/**`). Generic pages do not count as platform coverage.

## Permissions (Role checkboxes, `models/fields.ts:3-100`)

| Group | Permissions |
|---|---|
| Role only (`access.ts:48-62`) | `canAccessDashboard`, `canSeeOtherPeople`, `canEditOtherPeople`, `canManagePeople`, `canReadUsers`, `canManageUsers`, `canReadRoles`, `canManageRoles`, `canManageSettings`, `canManageOnboarding`, `canManageKeys`, `canReadPayments`, `canManagePayments` |
| Role or scoped membership role | `canManageDealerships`, `canViewInventory`, `canManageInventory`, `canManageLeads`, `canViewAllLeads`, `canManageDeals`, `canApproveDeals`, `canManageTradeIns`, `canManageFinancing`, `canManageService`, `canViewReports` |
| Derived (`access.ts:83-101`) | `canViewInventory` = view or manage inventory. `canAccessDeals` = deals, approve or financing. `canAccessTradeIns` = trade-ins, deals or leads. `canAccessLeads` = leads, deals, service, financing or trade-ins. `canManageTasks` = leads, financing or service. `canViewDealerCost` = manage inventory or financing across **all** rooftops. |
| Row filters (`access.ts:103-228`) | Leads, lead children, deals, deal approvals and trade-ins are limited to the assigned salesperson unless the user has `canViewAllLeads` across all rooftops (`access.ts:159-219`). |

API-key sessions are restricted again by the key's scopes (`access.ts:69-71`, `utils/apiKeyPolicy.ts`).

---

## 1. Lists

Columns: **Purpose**, **Key fields**, **Relationships**, **Created by**, **States and transitions**, **Direct write** (whether Keystone create/update is open or the list is command-only).

### 1.1 Org and access

| List | Purpose | Key fields | Relationships | Created by | States and transitions | Direct write |
|---|---|---|---|---|---|---|
| **User** | Staff login, and also storefront customer login | name, email (unique), password, phone, employeeId, commissionRate, isSalesperson / isServiceAdvisor / isFinanceManager, onboardingStatus (`not_started`, `in_progress`, `completed`, `dismissed`) | role → Role; read-only reverse lists: dealerGroupMemberships, rooftopMemberships, assignedLeads, deals, tasks, interactions, dealApprovals, apiKeys, customerAppointments / techAppointments (ServiceAppointment), lead-assignment events, sales visits | Staff: generic `createUser` with `canManagePeople` (`User.ts:12`), or through the `/platform/users` invite. Customer: `registerCustomerAccount` (`mutations/customerAccount.ts:5-14`, sudo, onboardingStatus `dismissed`). First admin: `/dashboard/init`. | onboardingStatus is set by `updateActiveUser` (`mutations/updateActiveUser.ts`). No other states. | Open: create/delete need `canManagePeople`; update is allowed for self or `canUpdatePeople` (`User.ts:9-19`). `role` can only be changed with `canManageRoles`, and never on yourself (`User.ts:64-77`). |
| **Role** | Permission bundle | name, plus every permission checkbox | assignedTo → User[]; dealerGroupMemberships, rooftopMemberships | `/platform/users` and generic pages (`canManageRoles`). Onboarding seeds staff roles through `ensureDealershipOnboardingRecord` entity `Role` (`ensureDealershipOnboardingRecord.ts:424-443`; codes sales-manager, sales-associate, finance-manager, service-manager, service-advisor, technician, parts-specialist, office-manager, lines 75-87). | none | Open with `canManageRoles` (`Role.ts:10-21`). |
| **DealerGroup** | The dealer group, the tenant root | name, slug (unique), legalName, status (`active`, `suspended`, `archived`) | rooftops, memberships, membershipAuditEvents | Onboarding `Dealership` entity (`ensureDealershipOnboardingRecord.ts:129-227`); generic page with `canManageDealerships` | Status select only. No command and no transition map. | Open with `canManageDealerships`; delete denied (`DealerGroup.ts:9-21`) |
| **Rooftop** | One physical store or location | code (immutable, uppercased), name, publicSlug (unique, storefront), status, timezone, currencyCode, rooftopKey (hook) | dealerGroup (immutable), memberships | Onboarding `Dealership` entity; generic page with `canManageDealerships` plus dealer-group access (`Rooftop.ts:21-27`) | Status select only. Vehicle writes require an active rooftop (`Vehicle.ts:36-46`). | Open; delete denied |
| **DealerGroupMembership** | A user's access to a whole group; `accessAllRooftops` gives group-wide access | user, dealerGroup, role, status (`invited`, `active`, `suspended`, `revoked`), accessAllRooftops, invitedBy, joinedAt | User, DealerGroup, Role | `changeDealerMembership` with scopeType `dealer-group` (`mutations/changeDealerMembership.ts:23`); onboarding bootstrap | Any status to any status through the command, with guards in `mutations/membershipPolicy.ts:23-46`: you cannot change your own membership, a reason is required, and rooftop memberships cannot grant group-wide access | Command only (`DealerGroupMembership.ts:11-16`; every field `update: denyAll`) |
| **RooftopMembership** | A user's access to one rooftop | user, rooftop, role, status (same four values), invitedBy, joinedAt | User, Rooftop, Role | `changeDealerMembership` with scopeType `rooftop`; onboarding | Same as above | Command only (`RooftopMembership.ts:11-16`) |
| **MembershipAuditEvent** | Immutable log of membership changes | scopeType, action (`created`, `updated`, `onboarding-bootstrap`), previousSnapshot / nextSnapshot, reason | dealerGroup, rooftop, targetUser, actor | System: `changeDealerMembership` and onboarding | none | Command only; read needs `canManageDealerships` |
| **DealershipProfile** (singleton) | Storefront identity and deal defaults | name, shortName, sales/service email, phone, address, hours, websiteUrl, currencyCode, salesTaxRateBps, docFeeCents, homepageTitle/Description, logoIcon (sanitized SVG), logoColor | none | Onboarding `Dealership` entity; `/platform/store-settings` | none. `createDealPencil` reads it to seed tax and doc fee (`createDealPencil.ts:31,48`). | Open: query is public; create/update need settings, onboarding or dealerships permission (`DealershipProfile.ts:9-21`) |
| **ApiKey** | Programmatic access token for the key owner | name, tokenSecret (hashed `of_…`), tokenPreview, scopes (`read_inventory`, `write_inventory`, `write_leads`, `write_deals`, `write_service`, `read_reports`; `ApiKey.ts:16-23`), status (`active`, `inactive`, `revoked`), expiresAt, lastUsedAt, usageCount, restrictedToIPs | user (set from the session) | The owner, through the generic page only (`ApiKey.ts:31-44`; human sessions only, own keys only) | A revoked key cannot be reactivated (`ApiKey.ts:51`) | Open to the owner |
| **AuthenticationThrottle** | Unused legacy rows | keyHash, purpose, failureCount, blockedUntil | none | Nothing | none | Everything denied; GraphQL-omitted |

### 1.2 Inventory

| List | Purpose | Key fields | Relationships | Created by | States and transitions | Direct write |
|---|---|---|---|---|---|---|
| **Vehicle** | A unit, as merchandised and sold | vin (unique, normalized), stockNumber (unique), year, make, model, trim, colours, mileage, purchasePriceCents (dealer cost, `canViewDealerCost`), listPriceCents, priceCents, condition (`new`, `used`, `certified`), status, description, features, metadata. Virtual fields: purchasePrice, listPrice, price. | rooftop; images, conditionReports, history, priceHistory, inventoryStock, acquisition, deals, leads, testDrives, salesVisits, financingApplications | `intakeInventoryVehicle` (`mutations/intakeInventoryVehicle.ts:317-318`; also used by onboarding `ensureVehicle`, `ensureDealershipOnboardingRecord.ts:259-298`) | status `available` → `pending` when the deal is submitted (`transitionDeal.ts:130-139`); `pending` → `available` when the deal is cancelled (`transitionDeal.ts:170-176`); `pending` → `sold` at `completeDealDelivery` (`operatorCommands.ts:311`). Intake stocks the unit as `service`, and `transitionInventoryAcquisition` sets `available` at frontline (`transitionInventoryAcquisition.ts:117-122`). The desk also labels `hold` (`lifecycle/inventoryPublication.ts:80`), but that value is not a select option. | Command only (`Vehicle.ts:12-24`); status is `update: false`. The afterOperation hook writes a domain event (`Vehicle.ts:59-92`). Delete is blocked once the vehicle is referenced (`Vehicle.ts:47-57`). |
| **VehicleImage** | Gallery photo | image (stored file), imagePath (static), caption, category (`exterior`, `interior`, `engine`, `damage`), sortOrder, isPrimary | vehicle | `addInventoryVehiclePhoto`, `arrangeInventoryVehiclePhotos`, `removeInventoryVehiclePhoto` (`mutations/inventoryPhotoCommands.ts:109,152,175`); `updateInventoryMerchandisingDraft` imagePath (`inventoryPublishingCommands.ts:92-93`); intake | none. Any photo change resets submitted merchandising to `rejected` (`inventoryPhotoCommands.ts:51`). | Command only |
| **VehicleConditionReport** | Inspection grades | reportDate, inspector, overall/mechanical/body/interior rating (`excellent`, `good`, `fair`, `poor`), issues JSON, estimatedRepairs, notes | vehicle | Generic page only (`canManageInventory`) | none | Open CRUD (`VehicleConditionReport.ts:9-22`) |
| **VehicleHistory** | Ownership, accident and title history | acquisitionDate/Source, previousOwners, hasAccidents, accidentDetails, serviceRecords, titleStatus | vehicle (one-to-one) | Generic page only | none | Open CRUD |
| **PriceHistory** | Price change log | effectiveDate, previous/newPriceCents, changeReason, notes; virtual previousPrice/newPrice | vehicle, changedBy | Generic page only. **No command writes it:** price edits through `updateInventoryMerchandisingDraft` do not append here. | none | Open CRUD with `canManageInventory`; read needs `canViewDealerCost` |
| **InventoryAcquisition** | Sourcing pipeline for a unit (appraise → buy → arrive → recon → frontline) | reference (unique), status, acquisitionSource (`trade-in`, `auction`, `wholesale`, `consumer-purchase`, `oem-distributor`, `dealer-transfer`), sourceReference, vin, year, make, model, odometer, appraisalCents, purchaseCents, reconEstimateCents, immutablePurchaseSnapshot, purchasedAt / arrivedAt / frontlineAt | vehicle, stock, events, requestedBy, lastTransitionedBy | `startInventoryAcquisition` (starts at `appraised`; `startInventoryAcquisition.ts:77-82`); `intakeInventoryVehicle` (creates it already advanced) | `appraised` → `approved` / `cancelled`; `approved` → `purchased` / `cancelled`; `purchased` → `arrived` / `cancelled`; `arrived` → `reconditioning` / `cancelled`; `reconditioning` → `frontline` / `cancelled` (`lifecycle/inventoryAcquisitionLifecycle.ts:10-18`). Command: `transitionInventoryAcquisition`. `purchased` needs purchaseCents; `frontline` needs a linked vehicle, price, description, image, completed recon and approved merchandising (`transitionInventoryAcquisition.ts:90-113`). | Command only |
| **InventoryAcquisitionEvent** | Transition log per acquisition | fromStatus, toStatus, reason, evidence, actor, occurredAt | acquisition | System (`startInventoryAcquisition.ts:98`, `transitionInventoryAcquisition.ts:155`, intake) | none | Command only |
| **InventoryStock** | Operations record for a unit on the lot: location, cost, recon, merchandising and feed gates | stockNumber, stockKey, locationCode/Label, stockedAt, frontlineAt, purchase/recon/other/totalCostCents (dealer cost), reconStatus (`not-started`, `in-progress`, `completed`), merchandisingStatus (`draft`, `submitted`, `approved`, `rejected`), approvedRevisionHash, feedStatus (`not-published`, `succeeded`, `partial`, `failed`) | vehicle (required, one-to-one), acquisition, events, reconWorkItems, merchandisingVersions | `establishInventoryStock` (`inventoryStockCommands.ts:94`); `intakeInventoryVehicle` | reconStatus is derived from the open work items (`inventoryStockCommands.ts:178,208-209`). merchandisingStatus goes `draft` → `submitted` (`submitInventoryMerchandising`) → `approved` / `rejected` (`decideInventoryMerchandising`); any content edit sends a submitted listing back to `rejected` (`inventoryPublishingCommands.ts:85`). feedStatus is set by `recordInventoryFeedRun` (`inventoryPublishingCommands.ts:246-247`). Publication gate: `lifecycle/inventoryPublication.ts:60-66` (approved current revision, recon completed, frontlineAt set, vehicle `available`). | Command only (`InventoryStock.ts:11`) |
| **InventoryStockEvent** | Ledger of stock moves, costs and content edits | eventKey, eventType, reason, amountCents, evidence, actor | stock | System: every inventory stock, photo or publishing command | none | Command only |
| **InventoryReconWorkItem** | One reconditioning job | title, category (`mechanical`, `body`, `detail`, `tires`, `inspection`, `other`), status, estimated/actualCostCents, vendorName, assignedTo, dueAt, completedAt | stock | `openInventoryReconWorkItem` (`inventoryStockCommands.ts:177`) | `open` → `in-progress` / `completed` / `cancelled`; `in-progress` → `completed` / `cancelled` (`lifecycle/inventoryOperationsLifecycle.ts:4-9`). Command: `transitionInventoryReconWorkItem`; completed needs actual cost (`inventoryStockCommands.ts:194`). | Command only |
| **InventoryMerchandisingVersion** | Immutable snapshot of a listing submitted for review | version, versionKey, status (`submitted`, `approved`, `rejected`), snapshot, submittedBy/At, decidedBy/At, decisionReason | stock | `submitInventoryMerchandising` (`inventoryPublishingCommands.ts:125`); intake auto-approves (`intakeInventoryVehicle.ts:166-172`) | `submitted` → `approved` / `rejected` only (`lifecycle/inventoryOperationsLifecycle.ts:32-36`) | Command only |
| **InventoryFeedRun** | One syndication or publish run | runKey, channelKey, status (`succeeded`, `partial`, `failed`), attempted/succeeded/failedCount, request/response snapshot, started/completedAt, recordedBy | errors | `recordInventoryFeedRun` (`inventoryPublishingCommands.ts:242`); intake | Recorded once, terminal | Command only |
| **InventoryFeedError** | A per-unit feed failure | errorCode, message, rowReference, evidence | run, stock | `recordInventoryFeedRun` (`inventoryPublishingCommands.ts:243`) | none | Command only |

### 1.3 Sales and CRM

| List | Purpose | Key fields | Relationships | Created by | States and transitions | Direct write |
|---|---|---|---|---|---|---|
| **Customer** | Deduplicated person per rooftop (CRM identity) | firstName, lastName, primaryEmail/Phone, normalizedEmail/Phone, identityKey (unique), status (`active`, `merged`), consent and suppression flags for email/sms/phone, preferredChannel, suppressionReason/Source, mergedAt | household, mergedInto / mergedCustomers, leads, salesVisits, contactPreferenceEvents, mergeEvents | System: find-or-create by rooftop plus email or phone on every public submission (`mutations/customerIdentity.ts:43-118`). **Not linked to the login User.** | `active` → `merged` through `mergeCustomers` (`crmIdentityWorkflows.ts:47-190`) | Command only; all consent fields are create/update denied |
| **CustomerMergeEvent** | Merge audit | reason, mergedAt, movedLeadIds, evidenceSnapshot | survivor, duplicate, actor | `mergeCustomers` | none | Command only |
| **CustomerHousehold** | Groups customers in one household | householdKey, displayName | members → Customer[] | `linkCustomerHousehold` (`crmEngagementWorkflows.ts:228-268`) | none | Command only |
| **CustomerContactPreferenceEvent** | Consent change log | source, reason, occurredAt, preferenceSnapshot | customer, actor | `updateCustomerCommunicationPreferences` (`crmEngagementWorkflows.ts:52-113`); `mergeCustomers` | none | Command only |
| **Lead** | A sales opportunity, also the parent for service and finance requests | firstName, lastName, email, phone, source (`walk-in`, `website`, `phone`, `referral`, `ad`, `social`, `third-party`), campaignKey, cadenceKey/Status (`none`, `active`, `paused`, `completed`, `suppressed`)/Step/DueAt, budgetRange, tradeInVehicle (text), timeframe, status, assignedAt, firstResponseDueAt/At, lostReasonCode, lostReason, notes, lastContact | customer (required), interestedVehicle, assignedSalesperson, assignmentEvents, testDrives, tradeIns, serviceAppointments, deals, interactions, tasks, salesVisits, financingApplications | Customer: storefront `submitInquiry`, `submitTestDrive`, `submitTradeIn`, `submitFinancing`, `submitServiceBooking` (each creates a Lead; `submitInquiry.ts:76` etc.). Merchant: only indirectly, through `/platform/test-drives` "Schedule" (which calls `submitTestDrive`). **No staff "create lead" command exists.** | `new` → `contacted` / `test-drive-scheduled` / `closed-lost`; `contacted` → `test-drive-scheduled` / `negotiating` / `closed-won` / `closed-lost`; `test-drive-scheduled` → `contacted` / `negotiating` / `closed-won` / `closed-lost`; `negotiating` → `closed-won` / `closed-lost` (`mutations/operatorWorkflows.ts:21-28`). Command: `transitionLead`; closed-lost needs a structured reason (`operatorWorkflows.ts:39`). Side effects: `recordLeadInteraction` moves `new` → `contacted` (`:117`); completing a test drive moves the lead to `negotiating` or `contacted` (`:139-168`). Cadence: `enrollLeadCadence` sets `active` and `advanceLeadCadence` steps it (`crmEngagementWorkflows.ts:115-226`). | Command only: create, update and delete are `denyAll` (`Lead.ts:11-17`) |
| **LeadAssignmentEvent** | Assignment history | reason, routeKey, assignedAt, firstResponseDueAt | lead, fromUser, toUser, actor | `transferLeadOwnership` (`operatorCommands.ts:47`, routeKey `manual-transfer`); `routeLead` (`crmIdentityWorkflows.ts:270`) | none | Command only |
| **LeadRoutingRule** | Auto-assignment rule per rooftop and source | name, routeKey (hook), active, priority, source (`any` or a lead source), firstResponseMinutes | assignee (required) | `configureLeadRoutingRule` (upsert by routeKey, `crmIdentityWorkflows.ts:193-231`); onboarding `ensureLeadRoutingRule`; generic page | Active flag only. `routeLead` picks the highest-priority active rule matching the source or `any` (`crmIdentityWorkflows.ts:246-249`). | Open CRUD with `canManageLeads` (`LeadRoutingRule.ts:9-22`) |
| **CustomerInteraction** | Logged contact (call, email, visit and so on) | interactionType (`phone`, `email`, `visit`, `test-drive`, `sms`, `video`), date, duration, notes, outcome (`positive`, `neutral`, `negative`, `no-answer`, `voicemail`), followUpDate, followUpCompleted | lead, performedBy | `recordLeadInteraction` (`operatorWorkflows.ts:61-124`) | none (no follow-up completion command) | Command only |
| **Task** | To-do on a lead | title, description, priority (`low`, `medium`, `high`, `urgent`), completed, dueDate, completedDate | lead, assignedTo | `createLeadTask` (`operatorWorkflows.ts:233-281`); `openFinanceFollowUp` (`operatorCommands.ts:321-348`); `submitFinancing` (24-hour F&I follow-up); cadence commands (`crmEngagementWorkflows.ts:154,212`) | open → completed through `completeTask` (`operatorWorkflows.ts:283-305`). No reopen, edit or delete. | Command only (`Task.ts:11-17`) |
| **SalesVisit** | Showroom visit or sales appointment, with a manager "turn" (T.O.) | kind (`appointment`, `showroom`), status, scheduled/arrived/managerTurn/completedAt, outcome, notes | lead, customer, vehicle, assignedSalesperson, manager | `manageSalesVisit` action `schedule` (`crmEngagementWorkflows.ts:278-351`) | `scheduled` → `arrived` / `cancelled` / `no-show`; `arrived` → `manager-turn` / `completed` / `cancelled`; `manager-turn` → `completed` / `cancelled` (`crmEngagementWorkflows.ts:271-276`) | Command only |
| **TestDrive** | Booked test drive | scheduledTime, completed, noShow, driverLicenseVerified, feedback, interestedLevel (`not-interested`, `maybe`, `very-interested`), requestedBy (customer User, read-denied) | lead, vehicle, salesperson | Customer: `submitTestDrive` (`submitTestDrive.ts:67-94`; the lead goes to `test-drive-scheduled`). Merchant: the same mutation from `/platform/test-drives`. | open → license verified → completed (needs verification), or open → no-show (only after the scheduled time). Command: `updateTestDriveWorkflow` (`operatorWorkflows.ts:126-173`). Completed is immutable. No reschedule or cancel command. | Command only (`TestDrive.ts:11-22`) |
| **TradeIn** | Customer's car offered in trade | vin, year, make, model, trim, mileage, condition (`excellent`, `good`, `fair`, `poor`), exterior/interior condition, mechanicalIssues, kbbValueCents (reference value), offerAmountCents, mainPhoto; virtual referenceValue, offerAmount | lead (create/update denied), deal, appraisedBy | Customer: `submitTradeIn` (`submitTradeIn.ts:92-127`). Merchant: generic page only (create allowed for `canAccessTradeIns`). | No status field. "Appraised" means offerAmountCents is set, through `recordTradeInAppraisal` (`operatorWorkflows.ts:203-231`). The appraisal is immutable once a deal is attached. | Open: create/update need `canAccessTradeIns`, delete needs `canManageTradeIns` (`TradeIn.ts:11-23`). Value fields and lead are not updatable. |

### 1.4 Deals

| List | Purpose | Key fields | Relationships | Created by | States and transitions | Direct write |
|---|---|---|---|---|---|---|
| **Deal** | Deal jacket and worksheet | vehiclePriceCents, tradeInValueCents, tradeInDetails, downPaymentCents, financingAmountCents, monthlyPaymentCents, loanTerm, apr, taxAmountCents, fees / rebates / products / taxLines (typed money lines, `lifecycle/dealPricing.ts:43-58`), structureType (`cash`, `finance`, `lease`), residualValueCents, moneyFactorBasisPoints, worksheetVersion, grossCents, presented/acceptedSnapshot and timestamps, evidenceSnapshot, lockedAt, saleDate, status. Virtual: totalPrice, profit and the dollar mirrors. | lead, vehicle, salesperson, tradeInVehicle → TradeIn, selectedLenderDecision, approvals, deliveryCases, financeProductQuotes / Cancellations / MenuVersions / ComplianceChecks / ContractPackages / FundingCases, paymentTransactions | `createDealPencil` (`mutations/createDealPencil.ts:12-108`; status `pencil`, cash, doc fee and tax from the profile) | `pencil` → `submitted` / `cancelled`; `submitted` → `approved` / `cancelled`; `approved` → `financed` / `cancelled`; `financed` → `delivered` / `cancelled` (`lifecycle/dealLifecycle.ts:19-26`). Permission per step at `dealLifecycle.ts:81-89`. Command: `transitionDeal`. `delivered` is only reachable through `completeDealDelivery` (`transitionDeal.ts:40`). Gates: `submitted` needs the current worksheet accepted and reserves the vehicle (`transitionDeal.ts:126-141`). `approved` needs the accepted worksheet, the current selected lender offer for finance or lease, `canManageFinancing` for finance or lease, and `canManageDealerships` when gross is negative or the price is under 90% of retail (`transitionDeal.ts:84-95`). `financed` needs current funding (`transitionDeal.ts:96-100`). Worksheet sub-states while in pencil: save (`saveDealWorksheet`, which bumps worksheetVersion and clears presentation, acceptance and lender selection; `operatorCommands.ts:66-141`) → present (`presentDealWorksheet`) → accept (`acceptDealWorksheet`). `reopenDealWorksheet` takes submitted or approved back to `pencil` (`operatorCommands.ts:224-252`). | Command only (`Deal.ts:14-27`). The validate hook blocks status edits and edits to locked evidence (`Deal.ts:35-80`). Only pencil deals can be deleted. |
| **DealApproval** | Approval log per deal | decision (`pending`, `approved`, `rejected`, `changes-requested`), notes, approvalDate | deal, approver | System: `transitionDeal` writes `pending` on submit, `approved` on approve and `rejected` on cancel-from-submitted (`transitionDeal.ts:149-168`); `reopenDealWorksheet` writes `changes-requested` (`operatorCommands.ts:247`) | none | Command only |

### 1.5 Finance and F&I

| List | Purpose | Key fields | Relationships | Created by | States and transitions | Direct write |
|---|---|---|---|---|---|---|
| **FinancingApplication** | Customer credit application (locked at submission) | reference, status, applicantName/Email/Phone, employmentStatus, annualIncomeCents, selfReportedCreditTier (private fields need `canManageFinancing`), requested amount, planned monthly payment, down payment, trade-in, aprBasisPoints, loanTermMonths, consentAt, submittedAt, lockedAt, immutableSnapshot | lead, vehicle, submissions, decisions | Customer: `submitFinancing` (`submitFinancing.ts:138-223`; also creates a Lead and a 24-hour Task). **No staff create.** | `submitted` → `under-review` / `cancelled`; `under-review` → `approved` / `declined` / `expired` / `cancelled`; `approved` → `expired` / `cancelled` (`lifecycle/financingLifecycle.ts:13-20`). `queueFinancingApplication` moves submitted → under-review (`queueFinancingApplication.ts:58-63`). `recordLenderDecision` maps the decision to a status (conditional stays `under-review`; `financingLifecycle.ts:35-38`). | Command only |
| **LenderSubmission** | Application sent or queued to a lender | providerKey, status (`queued`, `submitted`, `failed`), externalReference, request/responseSnapshot, errorCode, queuedAt, submittedAt | application | `queueFinancingApplication` (`queueFinancingApplication.ts:65`, through the financing adapter) | Set by the adapter; there is no operator transition | Command only |
| **LenderDecision** | Lender's answer, which is the deal's "offer" | providerKey, decision (`approved`, `declined`, `conditional`, `expired`, `cancelled`), approved amount, aprBasisPoints, termMonths, monthlyPaymentCents, reasonCodes, immutableSnapshot, decidedAt | application, submission, recordedBy, selectedForDeals | `recordLenderDecision` (`recordLenderDecision.ts:89`). Approved or conditional needs terms (`financingLifecycle.ts:40-54`); operator-recorded needs an evidence reference; declined needs reason codes. | Terminal record. A deal selects one through `selectDealLenderOffer`. | Command only |
| **FinanceProduct** | F&I product catalog (VSC, GAP and so on) per rooftop | code (unique per rooftop), name, category (`service-contract`, `gap`, `maintenance`, `appearance`, `tire-wheel`, `other`), providerKey, active, retailPriceCents, costCents | quotes | `configureFinanceProduct` (`financeOperations.ts:51`); onboarding `ensureFinanceProduct`; generic page | active flag | Open CRUD with `canManageFinancing` |
| **FinanceProductQuote** | Provider rate for one product on one deal | providerKey, status (`requested`, `quoted`, `failed`), retailPriceCents, costCents, evidenceReference, snapshots | deal, product | `recordFinanceProductQuote` (`financeOperations.ts:282`) | Recorded per call | Command only |
| **FinanceMenuVersion** | F&I menu presented to the customer, with the decision | version (unique per deal), status, optionsSnapshot, selected/declinedProductCodes, disclosureAcknowledgment, presentedAt, decidedAt | deal, cancellations | `presentFinanceMenu` (supersedes earlier menus; `financeOperations.ts:70-71`); cash funding auto-creates a `declined` menu (`financeOperations.ts:254-260`) | `presented` → `accepted` / `declined` (`decideFinanceMenu`, `financeOperations.ts:88`); older versions become `superseded` | Command only |
| **FinanceComplianceCheck** | Identity, OFAC, red-flag and privacy notice evidence | checkType (`identity`, `ofac`, `red-flag`, `privacy`), providerKey, status (`requested`, `completed`, `failed`, `manual-review`), resultCode, snapshots | deal | `recordFinanceComplianceCheck` (`financeOperations.ts:100-107`; append-only, latest per type wins) | none. Cash requires identity, OFAC and privacy; finance also requires red-flag (`lifecycle/financePrerequisites.ts:33-40`). | Command only |
| **FinanceContractPackage** | Retail installment contract, or the buyer's order on cash, and its documents | status, providerKey, envelopeReference, requiredDocuments, documentChecklist (`missing`, `received`, `reviewed`, `complete`), immutableStatusEvidence, sent/signedAt | deal (one per deal) | `manageFinanceContractPackage` (`financeOperations.ts:118-154`) | Actions: `prepare` → `preparing`; `mark-ready` → `ready`; `request-handoff` → `awaiting-external-handoff`; `record-provider-status` → `sent` / `viewed` / `signed` / `declined` / `void` (`financeOperations.ts:129-141`) | Command only |
| **FinanceFundingCase** | Lender funding, or the cash payment receipt | status (`pending`, `exception`, `clear-to-fund`, `funded`, `cancelled`), checklist, exceptions, fundingReference, fundedAt, immutableEvidence | deal (one per deal) | `manageFinanceFundingCase` (`financeOperations.ts:160-245`). On cash it also creates a `captured` operator-recorded PaymentTransaction and runs the prerequisite review (`financeOperations.ts:234-262`). | Any of the five statuses can be set. `clear-to-fund` and `funded` need no open checklist or exception items, an approved or financed deal, and reviewed prerequisites; delivered funding is frozen (`financeOperations.ts:164-209`). Funding gate: `lifecycle/dealFinanceEvidence.ts:115-129`. Finance desk step plan: `lifecycle/financePrerequisites.ts:201-266`. | Command only |
| **FinanceProductCancellation** | Cancelling a sold F&I product, with the refund amount | productCode, status (`requested`, `completed`, `denied`), reason, refundCents, evidence | deal, menu (must be an accepted menu that contains the product) | `recordFinanceProductCancellation` (`financeOperations.ts:284`). Records evidence only: it creates **no** PaymentRefund and does not change Deal.products. | Recorded per status (append) | Command only |

Prerequisite review (no list of its own): `reviewFinancePrerequisites` writes a `prerequisites-reviewed` DomainAuditEvent that funding needs on finance or lease deals (`mutations/financePrerequisiteReview.ts`; checked in `financePrerequisites.ts:153-171`).

### 1.6 Delivery

| List | Purpose | Key fields | Relationships | Created by | States and transitions | Direct write |
|---|---|---|---|---|---|---|
| **DeliveryCase** | Delivery appointment, checklist and customer sign-off | status (`scheduled`, `arrived`, `ready`, `delivered`, `cancelled`), appointmentAt, arrivedAt, checklist (identity, insurance, registration, title-handoff, plus funding derived from the funding case), customerAcknowledgment, acknowledgedAt, deliverySnapshot | deal (one per deal), weOweItems | `manageDeliveryCase` action `schedule` (`deliveryOperations.ts:66-69`); the deal must be `financed` | `schedule` → `scheduled`; `arrive` (needs scheduled) → `arrived`; `record-checklist` keeps the status and clears the acknowledgment; `acknowledge` (needs the four items and current funding) → `ready`; `cancel` → `cancelled` (`deliveryOperations.ts:66-92`). `ready` → `delivered` through `completeDealDelivery`, which also sets Deal `delivered` and Vehicle `sold` (`operatorCommands.ts:254-319`). | Command only |
| **WeOweItem** | Promise owed to the customer after the sale | description, status (`open`, `fulfilled`, `waived`), promisedAt, owner, estimatedCostCents, fulfillmentEvidence, customerAcknowledgment, fulfilledAt | deliveryCase, owner | `manageWeOweItem` action `create` (`deliveryOperations.ts:104`) | `open` → `fulfilled` / `waived` (actions `fulfill` / `waive`, `deliveryOperations.ts:104`) | Command only |

### 1.7 Service and parts

| List | Purpose | Key fields | Relationships | Created by | States and transitions | Direct write |
|---|---|---|---|---|---|---|
| **ServiceAppointment** | Service booking | appointmentDate, serviceType (`maintenance`, `repair`, `warranty`, `recall`, `inspection`, `diagnostic`), description, estimatedDuration, vehicleVin, customerVehicleDescription, transportationNeed (`none`, `waiter`, `shuttle`, `loaner`, `rental`, `drop-off`), capacitySlot, mileageIn, advisorNotes, status, requestedBy (read-denied) | lead (create/update denied), customer → User (never set by any flow), assignedTech → User, serviceOrder | Customer: `submitServiceBooking` (`submitServiceBooking.ts:99-138`; at most 4 per hour slot, lines 76-90). Merchant: generic page only (create allowed for `canManageService`). | `scheduled` → `checked-in` / `cancelled`; `checked-in` → `in-progress` / `waiting-parts` / `cancelled`; `in-progress` → `waiting-parts` / `completed`; `waiting-parts` → `in-progress` / `completed` (`lifecycle/serviceAppointmentTransitions.ts:1-8`). Command: `transitionServiceAppointment`. | Open CRUD with `canManageService` (`ServiceAppointment.ts:10-23`), except status and serviceOrder, which are not updatable |
| **ServiceOrder** | Repair order (RO) | concern, cause, correction, payType (`customer`, `warranty`, `internal`), authorizationStatus (`pending`, `authorized`, `declined`), authorizationEvidence, inspectionEvidence, declinedWork, invoiceNumber, diagnosis, workPerformed, recommendations, laborTotalCents, partsTotalCents, taxCents, grandTotalCents, status, completedAt, lockedAt, settledAt, evidenceSnapshot | appointment (one-to-one, required), lineItems, laborOperations, partsMovements, paymentTransactions | `openServiceOrder` (`openServiceOrder.ts:11-81`; starts at `estimate`; the appointment must not be completed or cancelled) | `estimate` → `approved` → `in-progress` → `completed` → `invoiced` → `paid` (`lifecycle/serviceOrderLifecycle.ts:14-21`). Command: `transitionServiceOrder`. Gates: `approved` needs a concern and `authorized` status; `completed` needs cause, correction and all labor operations completed or cancelled, then locks the evidence; `invoiced` needs an invoice number; `paid` needs `canViewReports` and `canManageDealerships` plus verified net captured payments of at least the grand total (`transitionServiceOrder.ts:64-81`, `lifecycle/serviceOrderAuthority.ts:25-35`). A provider webhook capture also sets `paid` (`paymentOperations.ts:201`). | Command only (`ServiceOrder.ts:13-25`); the validate hook blocks status edits and locked edits |
| **RepairOrderLineItem** | Priced RO line | itemType (`labor`, `part`, `sublet`), description, partNumber, quantity, unitPriceCents, priceCents, costCents | serviceOrder | `addServiceOrderLineItem` (`operatorCommands.ts:350-389`; recomputes the RO totals; only while estimate, approved or in-progress) | Locked once the RO is completed (`RepairOrderLineItem.ts:36-50`). No edit or remove command. | Command only |
| **ServiceLaborOperation** | Technician labor op with time punches | operationCode, description, status, technician, soldHours, actualMinutes, timePunches, startedAt, completedAt | serviceOrder | `manageLaborOperation` action `create` (`fixedOpsOperations.ts:11-68`) | `open` → `dispatched` / `cancelled`; `dispatched` → `in-progress` / `cancelled`; `in-progress` → `paused` / `completed`; `paused` → `in-progress` / `completed` / `cancelled` (`fixedOpsOperations.ts:44`). Start, pause and complete need an approved or in-progress RO that is `authorized` (`:41`). | Command only |
| **ServicePackage** | Service menu item shown on the storefront | name, description, priceCents, estimatedDuration, includedServices | rooftop | Onboarding `ensureServicePackage`; generic page | none | Open CRUD with `canManageService`; query is public, limited to active rooftops (`ServicePackage.ts:10-25`) |
| **PartsInventory** | Part master and on-hand quantities | partNumber (unique per rooftop), description, binLocation, quantity / committedQuantity / onOrderQuantity (command-only), minimumQuantity, costCents, priceCents, supplier, supplierPartNumber | movements | `configurePart` (`fixedOpsOperations.ts:69`); onboarding `ensurePart`; generic page (but quantities stay locked) | Quantities change only through PartsMovement | Open CRUD with `canManageService`; quantity fields are create/update denied (`PartsInventory.ts:49-56`) |
| **PartsMovement** | Parts stock ledger | movementType (`receipt`, `issue`, `return`, `adjustment`, `count`, `commit`, `release`, `po-order`, `po-cancel`), quantityDelta, on-hand / committed / on-order after, reference, reason | part, serviceOrder (required for issue, return, commit and release; RO must be estimate, approved or in-progress) | `recordPartsMovement` (`fixedOpsOperations.ts:70-211`; quantity math at lines 104-131; never below available) | none (ledger) | Command only |
| **PartsPurchaseOrder** | Supplier PO | reference (unique per rooftop), supplier, status, lines JSON (quantity, unitCostCents), orderedAt, receivedAt | none (lines are JSON, not linked to parts) | `managePartsPurchaseOrder` action `create` (`fixedOpsOperations.ts:212`) | `draft` → `ordered` → `received`; `ordered` / `partially-received` → `received`; `draft` / `ordered` → `cancelled` (`fixedOpsOperations.ts:212`). **Receiving a PO does not post PartsMovement receipts or change on-order quantities**; those need separate `recordPartsMovement` calls (`receipt`, `po-order`). Nothing sets `partially-received`. | Command only |

### 1.8 Payments and accounting

| List | Purpose | Key fields | Relationships | Created by | States and transitions | Direct write |
|---|---|---|---|---|---|---|
| **PaymentProvider** | Configured payment adapter | name, code (`pp_…`), isInstalled, credentials, metadata, adapter function names | transactions | Onboarding `ensurePaymentProvider` (2 in the seed); generic page | isInstalled flag | Open CRUD with `canManagePayments` (no rooftop scope) |
| **PaymentTransaction** | Money taken for a deal or a service order | sourceType (`deal`, `service`), amountCents, currency, providerKey, providerTransactionId / SessionId, checkoutUrl, status (`creating`, `pending`, `authorized`, `captured`, `failed`, `canceled`, `partially-refunded`, `refunded`), capturedCents, refundedCents, reconciliationReference, reconciledAt, version | deal, serviceOrder, paymentProvider | `createPaymentCheckout` (`paymentOperations.ts:74-110`; the deal must be approved, financed or delivered, or the RO invoiced or paid; capped at the remaining balance); cash funding (`financeOperations.ts:237`) | `creating` → `pending` (checkout created) or `failed`. Webhooks move it to `captured`, `canceled` or `failed`, and refunds move it to `partially-refunded` or `refunded` (`paymentOperations.ts:164-205`). `reconcilePaymentTransaction` sets reconciledAt on a settled payment (`:147-162`). | Command only |
| **PaymentRefund** | Refund against a captured payment | amountCents, reason, status (`creating`, `pending`, `succeeded`, `failed`, `canceled`), providerRefundId | transaction | `requestPaymentRefund` (`paymentOperations.ts:112-145`; captured or partially-refunded only, capped at the remaining captured amount) | `creating` → `pending` / `failed`; the webhook moves it to `succeeded` (`:186-189`) | Command only |
| **PaymentProviderEvent** | Verified webhook receipt | providerEventId (unique), eventType, payloadDigest, signatureTimestamp, receivedAt | transaction, refund | `handlePaymentProviderWebhook` → `processVerifiedPaymentWebhook` (`paymentOperations.ts:196`) | none | Command only |
| **AccountingMapping** | GL account mapping per source code | sourceType (`deal`, `service`, `parts`, `payment`), sourceCode (for example vehicle-sale, sales-tax, fees, finance-products, rebates, trade-in, labor, parts, inventory-receipt, payment-capture, payment-refund), debitAccount, creditAccount, providerKey (must be `operator-recorded`) | rooftop | `configureAccountingMapping` (`accountingOperations.ts:6`); onboarding (11 in the seed); generic page | none | Open CRUD with `canManageDealerships` and `canViewReports` |
| **AccountingBatch** | Balanced journal batch for one source record | sourceType, sourceId, status, providerKey, lines, totalDebit/CreditCents, attemptCount, externalReference, lastErrorCode, posted/reconciled/lockedAt | none (sourceId is text) | `stageAccountingBatch` (`accountingOperations.ts:6`). Needs a delivered deal, a paid RO, a received PO or a reconciled payment, and a mapping for every amount code. One active batch per source. | `staged` → `posting` (`queue-post`); `posting` → `posted` (`record-posted`) or `failed` (`record-failed`); `failed` → `posting`; `posted` → `reconciled` → `locked` (`manageAccountingBatch`, `accountingOperations.ts:6`) | Command only |
| **AccountingProviderResponse** | Response log for each posting attempt | responseCode, externalReference, immutableResponse, requestFingerprint | batch | `manageAccountingBatch` on `record-posted` or `record-failed` | none | Command only |

### 1.9 Catalog and config

| List | Purpose | Key fields | Relationships | Created by | States and transitions | Direct write |
|---|---|---|---|---|---|---|
| **Make** | Manufacturer catalog | name (unique), logo | models | Onboarding `ensureMake` (8 in the seed); generic page | none | Open CRUD with `canManageInventory`; public query |
| **Model** | Model catalog | name, bodyStyle (`sedan`, `suv`, `truck`, `coupe`, `hatchback`, `convertible`, `wagon`, `van`, `minivan`), baseYear | make | Onboarding `ensureModel` (13 in the seed); generic page | none | Open CRUD; public query |
| **RetentionPolicy** | Data retention rule per rooftop and category | category (`customer-intake`, `report-export`, `provider-payload`, `audit-evidence`), retentionDays, legalHold, rationale, lastSweptAt | rooftop | **Nothing.** Create is denied (`RetentionPolicy.ts:10`) and no mutation, seed or hook writes it. | none | Command only, but no command exists |

Also catalog or config, listed above under their own domains: ServicePackage, FinanceProduct, LeadRoutingRule, AccountingMapping, PaymentProvider, DealershipProfile, Role.

### 1.10 Reporting, audit and system

| List | Purpose | Key fields | Relationships | Created by | States and transitions | Direct write |
|---|---|---|---|---|---|---|
| **SavedReport** | Saved operational report definition | name, reportType (`operations`, `audit`, `accounting-exceptions`, `payment-reconciliation`), filters (must be empty: "not supported yet", `reportingOperations.ts:120`), exportFormat (`json`, `csv`), schedule (`manual`, `daily`, `weekly`, `monthly`), active, nextRunAt | owner, rooftop | `saveOperationalReport` (`reportingOperations.ts:114-152`) | active flag; nextRunAt is advanced by runs | Command only |
| **ReportRun** | One execution of a saved report | status (`queued`, `completed`, `failed`, `expired`), exportFormat, resultSnapshot, resultDigest, errorCode, completedAt, expiresAt | savedReport | `runSavedReport` (completed inline, `:154-181`); `queueDueSavedReports` (queued, `:183-204`) | `queued` is written but nothing processes queued runs into `completed` | Command only |
| **DomainAuditEvent** | Append-only audit of every command and of Vehicle hooks | eventKey, requestHash, aggregateType, aggregateId, action, before/afterSnapshot, metadata, actor, occurredAt | actor | System (`lifecycle/domainEvents.ts:82-97`) | none | Command only; read needs `canViewReports`. Read through `domainTimeline` and `auditSearch`. |
| **DomainOutboxEvent** | Outbox for downstream delivery | deliveryKey, topic, aggregate, payload, status (`pending`, `processing`, `delivered`, `failed`), attemptCount, availableAt, processedAt, lastError | none | System (`domainEvents.ts:98-110`) | Always written as `pending`. **No dispatcher in this repo moves it on.** | Command only |

### 1.11 Onboarding seed (`features/platform/onboarding/lib/seed.json`)

`ensureDealershipOnboardingRecord(entity, data)` needs `canManageOnboarding` (`ensureDealershipOnboardingRecord.ts:459-470`). It dispatches to these handlers (`:445-457`): Dealership, Make, Model, Vehicle, ServicePackage, Part, FinanceProduct, LeadRoutingRule, AccountingMapping, PaymentProvider and Role.

| Seed key | Count (Complete) | Writes |
|---|---|---|
| dealership | 1 | DealerGroup `sams-motor-company`; Rooftop `SAM-MAIN` / slug `main` (time zone defaults to America/New_York; USD only); DealershipProfile (fills empty fields only); a DealerGroupMembership for the operator with all-rooftop access, and a MembershipAuditEvent `onboarding-bootstrap` (`ensureDealershipOnboardingRecord.ts:129-220`) |
| vehicleMakes / vehicleModels | 8 / 13 | Make, Model |
| vehicles | 13 | Through `intakeInventoryVehicleInTransaction`: Vehicle, VehicleImage, InventoryAcquisition (+ event), InventoryStock (+ event), a completed InventoryReconWorkItem, an approved InventoryMerchandisingVersion and a succeeded InventoryFeedRun (`intakeInventoryVehicle.ts:317-472`), so the units come out listed |
| services | 8 | ServicePackage |
| parts | 8 | PartsInventory through `configurePart`, plus a PartsMovement `receipt` "Opening stock" for the starting quantity |
| financeProducts | 5 | FinanceProduct through `configureFinanceProduct` (operator-recorded, active) |
| leadRoutingRules | 5 | LeadRoutingRule through `configureLeadRoutingRule`; the assignee is the onboarding user |
| accountingMappings | 11 | AccountingMapping through `configureAccountingMapping` |
| paymentProviders | 2 | PaymentProvider `pp_system_default` (Manual) and `pp_stripe_stripe` (Stripe), insert only |
| staff | 8 | Role only, no Users (Sales Manager, Sales Associate, Finance Manager, Service Manager, Service Advisor, Technician, Parts Specialist, Office Manager). Needs `canManageRoles`. |

The Basic template uses label-filtered subsets (`features/platform/onboarding/config/templates.tsx:49-66`). The seed creates no leads, customers, deals, appointments, ROs, financing applications or payments. Every transactional desk starts empty.

---

## 2. Merchant workflows, end to end

Each step lists the lists it touches, the command it uses, and the platform page that does it today. **(none)** means no platform page calls the command; a step marked "generic only" can be done only on the Keystone model pages, and "API only" means through GraphQL alone.

### W1. Inventory: acquisition → recon → merchandising → publish/feed → sale

| # | Step | Lists | Command | Platform today |
|---|---|---|---|---|
| 1 | Appraise a unit you are sourcing | InventoryAcquisition, InventoryAcquisitionEvent | `startInventoryAcquisition` | **(none)** |
| 2 | Approve, purchase, arrive | InventoryAcquisition (+ event) | `transitionInventoryAcquisition` (appraised→approved→purchased→arrived) | **(none)**. `/platform/vehicles` only sends arrived→reconditioning and reconditioning→frontline. |
| 3 | Stock the unit: one-step intake, or create the vehicle and then stock it | Vehicle, VehicleImage, InventoryAcquisition, InventoryStock, InventoryStockEvent | `intakeInventoryVehicle` (one step), or `establishInventoryStock` after an acquisition | Intake dialog on `/platform/vehicles` (source is hardcoded to `dealer-transfer`). `establishInventoryStock`: **(none)**. |
| 4 | Move the unit between locations, record costs | InventoryStock, InventoryStockEvent | `moveInventoryStock`, `recordInventoryCost` | `/platform/vehicles` row menu (cost type is always `other`) |
| 5 | Recon work items | InventoryReconWorkItem, InventoryStock.reconStatus | `openInventoryReconWorkItem`, `transitionInventoryReconWorkItem` | `/platform/vehicles` step pills. Only the first open item is actionable, category is always `other`, and there is no cancel. |
| 6 | Edit listing content and photos | Vehicle, VehicleImage, InventoryStockEvent | `updateInventoryMerchandisingDraft`, `add/arrange/removeInventoryVehiclePhoto` | `/platform/vehicles` (price, mileage, description and photos only) |
| 7 | Submit the listing, then approve or reject it | InventoryMerchandisingVersion, InventoryStock | `submitInventoryMerchandising`, `decideInventoryMerchandising` | `/platform/vehicles`. Approve only: there is no reject and no version history. |
| 8 | Mark frontline (vehicle becomes `available`) | InventoryAcquisition, InventoryStock, Vehicle | `transitionInventoryAcquisition` →frontline | `/platform/vehicles` |
| 9 | Publish to the storefront and syndication feed | InventoryFeedRun, InventoryFeedError, InventoryStock.feedStatus | `recordInventoryFeedRun`. Storefront gate: `inventoryPublication.ts:60-66`. Public feed: `publicInventoryFeed` GraphQL query in `integrations/inventory/publicInventoryFeed.ts`. | `/platform/vehicles` "Publish feed" (single channel; errors always `[]`; no run history) |
| 10 | Condition report, history, price history | VehicleConditionReport, VehicleHistory, PriceHistory | none (open CRUD) | **(none)**; generic only |
| 11 | Sale | Vehicle.status pending→sold | through W3 (`transitionDeal` submit, `completeDealDelivery`) | Deal and delivery desks |

### W2. Lead intake → routing → engagement → test drive → deal

| # | Step | Lists | Command | Platform today |
|---|---|---|---|---|
| 1 | Customer submits an inquiry, test drive, trade-in, financing or service request | Customer (find-or-create), Lead, plus TestDrive / TradeIn / FinancingApplication / ServiceAppointment / Task | `submitInquiry`, `submitTestDrive`, `submitTradeIn`, `submitFinancing`, `submitServiceBooking` | Storefront (section 3.3). Staff can only add a walk-in or phone lead through the test-drive or service booking dialogs. **There is no "new lead" command or page.** |
| 2 | Route automatically | Lead, LeadAssignmentEvent, LeadRoutingRule | `routeLead` | `/platform/crm/[id]` "Apply routing rule" (only while the lead is unassigned) |
| 3 | Reassign by hand | Lead, LeadAssignmentEvent | `transferLeadOwnership` | **(none)** |
| 4 | Log an interaction, which also sets first response and moves new→contacted | CustomerInteraction, Lead | `recordLeadInteraction` | `/platform/crm/[id]` |
| 5 | Tasks | Task | `createLeadTask`, `completeTask` | `/platform/crm/[id]`. There is no cross-lead "my tasks" queue. |
| 6 | Cadence enrollment | Lead, Task | `enrollLeadCadence`, `advanceLeadCadence` | `/platform/crm/[id]` |
| 7 | Consent and suppression | Customer, CustomerContactPreferenceEvent | `updateCustomerCommunicationPreferences` | `/platform/crm/[id]` |
| 8 | Showroom visit or appointment, with manager turn | SalesVisit | `manageSalesVisit` | `/platform/crm/[id]`. Schedule is fixed at now + 1 hour; there is no cancel, no no-show and no showroom up-log. |
| 9 | Test drive: verify the license, complete or mark no-show | TestDrive, Lead | `updateTestDriveWorkflow`. Scheduling uses `submitTestDrive`. | `/platform/test-drives` |
| 10 | Find duplicates, merge, link a household | Customer, CustomerMergeEvent, CustomerHousehold | `customerDuplicateCandidates`, `mergeCustomers`, `linkCustomerHousehold` | Duplicate count only on `/platform/crm/[id]`. Merge and household linking: **(none)**. |
| 11 | Close won or lost | Lead | `transitionLead` | `/platform/crm/[id]` status select |
| 12 | Start the deal | Deal | `createDealPencil` | `/platform/deals/create` (the lead is not carried over from the CRM link) |

### W3. Deal: pencil → approval → finance (cash or finance) → F&I → contract → funding → delivery → we-owe

| # | Step | Lists | Command | Platform today |
|---|---|---|---|---|
| 1 | Pencil, seeded with doc fee and tax from the profile | Deal | `createDealPencil` | `/platform/deals/create` |
| 2 | Work the worksheet (cash, finance or lease; fees, rebates, products and tax lines) | Deal, DomainAuditEvent `worksheet-saved` | `saveDealWorksheet` | `/platform/deals/[id]`. Cash and finance only: lease fields cannot be edited. |
| 3 | Present the structure, record customer acceptance | Deal | `presentDealWorksheet`, `acceptDealWorksheet` | `/platform/deals/[id]` |
| 4 | Finance path: pick a lender offer | Deal.selectedLenderDecision | `dealLenderOffers`, `selectDealLenderOffer` | `/platform/deals/[id]` |
| 5 | Submit (reserves the vehicle) | Deal, DealApproval `pending`, Vehicle →pending | `transitionDeal` →submitted | `/platform/deals/[id]` |
| 6 | Approve or reject; reopen | Deal, DealApproval | `transitionDeal` →approved / cancelled; `reopenDealWorksheet` | `/platform/deals/[id]` and `/platform/finance` (approve, reject). Cancelling from pencil, approved or financed: **(none)**. |
| 7 | F&I: product quotes → present menu → customer decision | FinanceProductQuote, FinanceMenuVersion | `recordFinanceProductQuote`, `presentFinanceMenu`, `decideFinanceMenu` | `/platform/finance`. Quotes every product, presents every product, and the decision is all-or-nothing. |
| 8 | Compliance checks (cash: identity, OFAC, privacy; finance adds red-flag) | FinanceComplianceCheck | `recordFinanceComplianceCheck` | `/platform/finance` |
| 9 | Contract package (cash: signed buyer's order) | FinanceContractPackage | `manageFinanceContractPackage` | `/platform/finance` |
| 10 | Finance path: review prerequisites | DomainAuditEvent `prerequisites-reviewed` | `reviewFinancePrerequisites` | `/platform/finance` |
| 11 | Funding (finance) or record payment (cash; creates a captured PaymentTransaction and auto-declines the menu) | FinanceFundingCase, PaymentTransaction, FinanceMenuVersion | `manageFinanceFundingCase` | `/platform/finance` |
| 12 | Mark financed or "release to delivery" | Deal | `transitionDeal` →financed | `/platform/finance` |
| 13 | Delivery: schedule → arrive → checklist → acknowledgment | DeliveryCase | `manageDeliveryCase` | `/platform/delivery`. No reschedule or cancel, and checklist items cannot be waived. |
| 14 | Complete delivery (Deal delivered, Vehicle sold) | Deal, Vehicle, DeliveryCase | `completeDealDelivery` | `/platform/delivery` |
| 15 | We-owe items | WeOweItem | `manageWeOweItem` | `/platform/delivery`. The owner is always the salesperson and the cost is always 0. |

### W4. Trade-in appraisal

| # | Step | Lists | Command | Platform today |
|---|---|---|---|---|
| 1 | Request from the customer | TradeIn, Lead, Customer | `submitTradeIn` | Storefront `/trade-in` |
| 2 | Walk-in appraisal | TradeIn | none; open `createTradeIn` with `canAccessTradeIns` | **(none)**; generic only |
| 3 | Record the reference value and offer | TradeIn | `recordTradeInAppraisal` | `/platform/trade-ins` (offer only; the reference value is re-sent unchanged) |
| 4 | Attach to a deal | Deal.tradeInVehicle | `createDealPencil` `tradeInId` (only at creation; the trade-in cannot be changed later, `Deal.ts:72`) | **(none)**. The deal create page sends a dollar trade-in value only. |
| 5 | Take the trade into inventory | InventoryAcquisition (`trade-in` source) | `startInventoryAcquisition` | **(none)** |

### W5. Financing application → lender submission → decision

| # | Step | Lists | Command | Platform today |
|---|---|---|---|---|
| 1 | Customer applies | FinancingApplication, Lead, Task | `submitFinancing` | Storefront `/financing` |
| 2 | Open an F&I follow-up task | Task | `openFinanceFollowUp` | `/platform/finance` |
| 3 | Queue to a lender (submitted → under-review) | LenderSubmission, FinancingApplication | `queueFinancingApplication` | `/platform/finance` (provider is always `operator-recorded`) |
| 4 | Record the lender decision | LenderDecision, FinancingApplication | `recordLenderDecision` | `/platform/finance` (always attached to `submissions[0]`) |
| 5 | Select the offer on the deal | Deal | `selectDealLenderOffer` | `/platform/deals/[id]` |

### W6. Service: appointment → RO → labor ops and lines → parts → invoice → payment

| # | Step | Lists | Command | Platform today |
|---|---|---|---|---|
| 1 | Book | ServiceAppointment, Lead, Customer | `submitServiceBooking` (customer or desk) | Storefront `/service`; `/platform/service` "New appointment" |
| 2 | Edit, assign a technician, record mileage and advisor notes | ServiceAppointment | none; open `updateServiceAppointment` | **(none)**; generic only |
| 3 | Check in → in progress → waiting for parts → completed / cancelled | ServiceAppointment | `transitionServiceAppointment` | `/platform/service`. Bug: the deterministic idempotency key makes a repeated move into the same status a silent no-op (`ServiceAdvisorPageClient.tsx:384` against `operatorWorkflows.ts:12-19`). |
| 4 | Open the RO (estimate) | ServiceOrder | `openServiceOrder` | `/platform/service` (totals start at 0) |
| 5 | Concern, cause, correction and authorization | ServiceOrder | `recordServiceOrderEvidence` | `/platform/service` |
| 6 | Line items | RepairOrderLineItem, ServiceOrder totals | `addServiceOrderLineItem` | `/platform/service`. Labor only: no part or sublet lines, and lines cannot be edited or removed. |
| 7 | Labor ops: dispatch → start → pause → complete | ServiceLaborOperation | `manageLaborOperation` | `/platform/service`. Only the first open operation, and no pause or cancel. |
| 8 | Parts for the RO: commit, issue, return, release | PartsMovement, PartsInventory | `recordPartsMovement` | **(none)**. The desk only records `receipt`. |
| 9 | RO approved → in progress → completed → invoiced | ServiceOrder | `transitionServiceOrder` | `/platform/service` |
| 10 | Take payment | PaymentTransaction | `createPaymentCheckout` | `/platform/accounting` (raw source ID and cents) |
| 11 | Settle the RO (paid) | ServiceOrder | `transitionServiceOrder` →paid, or a provider webhook capture | **(none)** for an operator-recorded settlement |

### W7. Parts purchasing and movements

| # | Step | Lists | Command | Platform today |
|---|---|---|---|---|
| 1 | Part master | PartsInventory | `configurePart` | `/platform/service` "Configure part" (create; existing parts cannot be edited from the list) |
| 2 | Create a PO → order → receive / cancel | PartsPurchaseOrder | `managePartsPurchaseOrder` | **(none)** |
| 3 | On-order and receipt postings | PartsMovement (`po-order`, `receipt`, `po-cancel`) | `recordPartsMovement` (receiving a PO does not post these) | Receipt only, on `/platform/service` |
| 4 | Adjustments and cycle counts | PartsMovement | `recordPartsMovement` (`adjustment`, `count`) | **(none)** |
| 5 | Movement history | PartsMovement | read through `fixedOpsWorkspace.partsMovements` | **(none)** (the query returns it, but the desk does not render it) |

### W8. F&I product cancellation and refund

| # | Step | Lists | Command | Platform today |
|---|---|---|---|---|
| 1 | Record the cancellation request, completion or denial | FinanceProductCancellation | `recordFinanceProductCancellation` | `/platform/finance` (product code is free text) |
| 2 | Refund money to the customer or lender | PaymentRefund | `requestPaymentRefund` (separate step; nothing links it to the cancellation) | `/platform/accounting`, typed by hand |
| 3 | Cancellations across deals | FinanceProductCancellation | read through `financeWorkspace.productCancellations` | **(none)** |

### W9. Payments and refunds

| # | Step | Lists | Command | Platform today |
|---|---|---|---|---|
| 1 | Configure providers | PaymentProvider | open CRUD | **(none)**; generic only |
| 2 | Create a checkout for a deal or an RO | PaymentTransaction | `createPaymentCheckout` | `/platform/accounting` |
| 3 | Provider webhook (capture, cancel, fail, refund) | PaymentTransaction, PaymentRefund, PaymentProviderEvent, ServiceOrder →paid | `handlePaymentProviderWebhook` | system |
| 4 | Refund | PaymentRefund | `requestPaymentRefund` | `/platform/accounting` |
| 5 | Reconcile | PaymentTransaction.reconciledAt | `reconcilePaymentTransaction` | **(none)**. That also blocks staging payment accounting batches, which need a reconciled payment. |

### W10. Accounting batches and mappings

| # | Step | Lists | Command | Platform today |
|---|---|---|---|---|
| 1 | Configure mappings | AccountingMapping | `configureAccountingMapping` | `/platform/accounting` (create only; rooftop is a raw ID) |
| 2 | Stage a batch from a delivered deal, paid RO, received PO or reconciled payment | AccountingBatch | `stageAccountingBatch` | `/platform/accounting` (raw source ID) |
| 3 | queue-post → record-posted / record-failed → reconcile → lock | AccountingBatch, AccountingProviderResponse | `manageAccountingBatch` | `/platform/accounting` sends queue-post, reconcile and lock only. **record-posted and record-failed have no UI**, so a batch stays in `posting`. |

### W11. Reporting

| # | Step | Lists | Command | Platform today |
|---|---|---|---|---|
| 1 | Live operations metrics | read only | `operationalReport` | `/platform/overview`, `/platform/analytics` |
| 2 | Save a report | SavedReport | `saveOperationalReport` | **(none)** |
| 3 | Run it now, or queue the due ones | ReportRun | `runSavedReport`, `queueDueSavedReports` | **(none)** |
| 4 | Audit search and timelines | DomainAuditEvent | `auditSearch`, `domainTimeline` | Timelines on the deal, finance and delivery desks. `auditSearch`: **(none)**. |

### W12. Org setup: dealer group, rooftops, memberships, roles, staff

| # | Step | Lists | Command | Platform today |
|---|---|---|---|---|
| 1 | Bootstrap the group, rooftop, profile and memberships | DealerGroup, Rooftop, DealershipProfile, DealerGroupMembership, MembershipAuditEvent | `ensureDealershipOnboardingRecord` `Dealership` | Onboarding dialog (not a route) |
| 2 | Edit the group, add or edit rooftops | DealerGroup, Rooftop | open CRUD with `canManageDealerships` | Store settings edits one rooftop's time zone only. Everything else: **(none)**; generic only. |
| 3 | Staff accounts | User | generic `createUser` / `updateUser` / `deleteUser` | `/platform/users` |
| 4 | Roles and permission matrix | Role | open CRUD with `canManageRoles` | **(none)**; generic only |
| 5 | Grant, suspend or revoke rooftop and group access | DealerGroupMembership, RooftopMembership, MembershipAuditEvent | `changeDealerMembership` | **(none)**. No UI anywhere, so this is API only. |

### W13. Catalog setup

| # | Step | Lists | Command | Platform today |
|---|---|---|---|---|
| 1 | Makes and models | Make, Model | open CRUD | **(none)**; generic only |
| 2 | Service packages (the storefront menu) | ServicePackage | open CRUD | **(none)**; generic only |
| 3 | F&I products | FinanceProduct | `configureFinanceProduct` | `/platform/finance` (create only, no catalog list, rooftop is implicit) |
| 4 | Lead routing rules | LeadRoutingRule | `configureLeadRoutingRule` | **(none)**; generic only |
| 5 | Dealership profile, tax and doc fee | DealershipProfile | open update | `/platform/store-settings` |

### W14. Retention policy and API keys

| # | Step | Lists | Command | Platform today |
|---|---|---|---|---|
| 1 | Retention policy per category, with legal hold | RetentionPolicy | **no command exists** (create denied) | **(none)** |
| 2 | API keys (create, scope, revoke) | ApiKey | open CRUD for the owner | **(none)**; generic only |

### W15. Also supported by the schema

- **Outbox and observability.** DomainOutboxEvent rows are always `pending` and no dispatcher exists here. An admin view of pending and failed rows has no page.
- **Customer account.** `registerCustomerAccount` and `customerRequestHistory` serve the storefront account (section 3.3).

---

## 3. Coverage

Verdicts come from reading each screen and its actions, not from page names.

- **Covered** means the page does the job the schema supports.
- **THIN** means a page exists but cannot do the job; the gap is named.
- **MISSING** means no platform page exists.

Child, log and system lists are judged through their parent page, which is named. Every wrapper under `app/dashboard/(admin)/platform/**` is a 3-line re-export, and nothing in the platform slices links to generic `/dashboard/<list>` pages except `/platform/users` ("Open full record").

### 3.1 Existing platform pages

| Route | Slice | Nav group | Does |
|---|---|---|---|
| `/dashboard/platform/overview` | `features/platform/overview` | top | Read-only 30-day `operationalReport` |
| `/dashboard/platform/vehicles` | `features/platform/vehicles` | top ("Inventory") | Inventory desk: intake, listing edits, photos, recon pills, merchandising submit and approve, frontline, publish feed |
| `/dashboard/platform/deals`, `/deals/create`, `/deals/[id]` | `features/platform/deals` | top | Deal list, pencil create, worksheet, present, accept, lender select, submit, approve, reject, reopen |
| `/dashboard/platform/analytics` | `features/platform/analytics` | top | Read-only charts (500-record cap) |
| `/dashboard/platform/store-settings` | `features/platform/store-settings` | top | DealershipProfile and one rooftop's time zone |
| `/dashboard/platform/crm`, `/crm/[id]` | `features/platform/crm` | Sales | Lead list and board (read-only); lead detail with interactions, tasks, routing, consent, cadence, visits and status |
| `/dashboard/platform/test-drives` | `features/platform/test-drives` | Sales | Queue, schedule, verify, complete, no-show |
| `/dashboard/platform/trade-ins` | `features/platform/trade-ins` | Sales | Queue and offer entry |
| `/dashboard/platform/finance` | `features/platform/finance` | Finance | Deal F&I step plan, applications, lender queue and decision, products, quotes, menu, compliance, contract, review, funding, cancellations |
| `/dashboard/platform/delivery` | `features/platform/delivery` | Finance | Delivery case actions, complete delivery, we-owe items |
| `/dashboard/platform/accounting` | `features/platform/accounting` | Finance | Batch queue, reconcile and lock; checkout; refund; mapping create; stage |
| `/dashboard/platform/service` | `features/platform/service` | Service | Appointments, RO, CCC, labor lines and ops, parts configure and receive |
| `/dashboard/platform/users` | `features/platform/users` | Operations ("Staff") | Staff list with generic create, edit and delete drawers |

The nav is defined in `features/platform/lib/navigation.ts:36-68`. Onboarding is a dialog mounted in `features/dashboard/components/DashboardLayout.tsx`, not a route. `/dashboard` itself is the generic model-card grid (`features/dashboard/screens/HomePage`).

### 3.2 Coverage by list

| Domain | List | Platform page | Verdict | What is missing |
|---|---|---|---|---|
| Org | User | `/platform/users` | Covered | Staff create, edit and delete work. A client refetch drops `STAFF_WHERE`, so shoppers can appear (`UserListPageClient.tsx:133-142`). |
| Org | Role | none | **MISSING** | Generic `/dashboard/roles` is the only way to edit permissions |
| Org | DealerGroup | none | **MISSING** | Generic only |
| Org | Rooftop | `/platform/store-settings` | **THIN** | Edits one rooftop's time zone only. No list, create, status, slug, code or currency. |
| Org | DealerGroupMembership | none | **MISSING** | `changeDealerMembership` has no UI anywhere, so this is API only |
| Org | RooftopMembership | none | **MISSING** | Same as above |
| Org | MembershipAuditEvent | none (parent would be a memberships page) | **MISSING** | No history view |
| Org | DealershipProfile | `/platform/store-settings` | Covered | Accepts any 3-letter currency, while onboarding allows USD only (`ensureDealershipOnboardingRecord.ts:103`) |
| Org | ApiKey | none | **MISSING** | Generic only |
| Org | AuthenticationThrottle | n/a | n/a | Unused and GraphQL-omitted |
| Inventory | Vehicle | `/platform/vehicles` | **THIN** | No detail page. Year, make, model, trim, colours, condition, features and list price cannot be edited after intake. Intake source is hardcoded. Capped at 100 rows. |
| Inventory | VehicleImage | parent `/platform/vehicles` | Covered | Captions and categories cannot be set |
| Inventory | VehicleConditionReport | none | **MISSING** | Generic only |
| Inventory | VehicleHistory | none | **MISSING** | Generic only |
| Inventory | PriceHistory | none | **MISSING** | Generic only, and no command appends to it when the price changes |
| Inventory | InventoryAcquisition | `/platform/vehicles` | **THIN** | No `startInventoryAcquisition` and no appraised, approved, purchased, arrived or cancel transitions. No acquisition pipeline view. |
| Inventory | InventoryAcquisitionEvent | parent `/platform/vehicles` | **THIN** | Not displayed |
| Inventory | InventoryStock | `/platform/vehicles` | **THIN** | No detail page. `establishInventoryStock` is not exposed. Costs cannot be listed and cost type is always `other`. |
| Inventory | InventoryStockEvent | parent `/platform/vehicles` | **THIN** | Ledger not displayed |
| Inventory | InventoryReconWorkItem | `/platform/vehicles` | **THIN** | Only the first open item is actionable. Category is always `other`. No cancel, assignee, due date, vendor or list. |
| Inventory | InventoryMerchandisingVersion | `/platform/vehicles` | **THIN** | Approve only, no reject decision, no version history |
| Inventory | InventoryFeedRun | `/platform/vehicles` | **THIN** | One hardcoded channel, no run history, no subset publish |
| Inventory | InventoryFeedError | parent feed runs | **THIN** | Errors are always sent as `[]` and are never shown |
| CRM | Customer | parent `/platform/crm/[id]` (consent only) | **THIN** | No customer directory or customer detail. Merge and household linking are not exposed. |
| CRM | CustomerMergeEvent | none | **MISSING** | `mergeCustomers` has no UI |
| CRM | CustomerHousehold | parent `/platform/crm/[id]` (read) | **THIN** | `linkCustomerHousehold` has no UI |
| CRM | CustomerContactPreferenceEvent | parent `/platform/crm/[id]` | Covered | Written through consent saves; the history is not listed |
| CRM | Lead | `/platform/crm`, `/crm/[id]` | **THIN** | No create (and no command exists for it). Contact, source, budget, notes and vehicle cannot be edited (no command exists). No manual reassign, although `transferLeadOwnership` exists. Capped at 100. |
| CRM | LeadAssignmentEvent | parent `/platform/crm/[id]` | **THIN** | Assignment history not shown |
| CRM | LeadRoutingRule | none | **MISSING** | `configureLeadRoutingRule` has no UI |
| CRM | CustomerInteraction | parent `/platform/crm/[id]` | Covered | |
| CRM | Task | parent `/platform/crm/[id]` | Covered | No cross-lead task queue, and completed tasks are hidden |
| CRM | SalesVisit | parent `/platform/crm/[id]` | **THIN** | Schedule is fixed at +1 hour as an `appointment`. No showroom kind, cancel or no-show. Only 3 visits are shown. No showroom up-log page. |
| CRM | TestDrive | `/platform/test-drives` | Covered | Every action the schema has (verify, complete, no-show) is present. Reschedule and cancel have no command. |
| CRM | TradeIn | `/platform/trade-ins` | **THIN** | No create or walk-in appraisal. The reference value cannot be recorded. No detail page. Cannot attach to a deal or send to inventory. |
| Deals | Deal | `/platform/deals`, `/create`, `/[id]` | Covered | Gaps: lease cannot be structured; no cancel from pencil, approved or financed; a TradeIn record cannot be attached at create; the lead is not prefilled from CRM. |
| Deals | DealApproval | parent `/platform/deals/[id]` | Covered | |
| Finance | FinancingApplication | `/platform/finance` | Covered | No detail view. Provider is always `operator-recorded`. |
| Finance | LenderSubmission | parent `/platform/finance` | Covered | |
| Finance | LenderDecision | parent `/platform/finance` | Covered | Always attached to `submissions[0]` |
| Finance | FinanceProduct | `/platform/finance` | **THIN** | Create only: no catalog list, edit or deactivate. Rooftop is taken from the first deal. |
| Finance | FinanceProductQuote | `/platform/finance` | **THIN** | Quotes every product at list price, always `quoted` |
| Finance | FinanceMenuVersion | `/platform/finance` | **THIN** | Presents every product, and the customer decision is all-or-nothing |
| Finance | FinanceComplianceCheck | `/platform/finance` | Covered | |
| Finance | FinanceContractPackage | `/platform/finance` | Covered | Documents cannot be tracked individually |
| Finance | FinanceFundingCase | `/platform/finance` | Covered | One exception note per update |
| Finance | FinanceProductCancellation | `/platform/finance` | **THIN** | No list across deals, no link to a refund, product code is free text |
| Delivery | DeliveryCase | `/platform/delivery` | **THIN** | No reschedule or cancel (the command supports both). Checklist items cannot be waived. |
| Delivery | WeOweItem | `/platform/delivery` | Covered | Owner is always the salesperson and cost is always 0 |
| Service | ServiceAppointment | `/platform/service` | **THIN** | No edit, technician assignment, mileage or advisor notes. Bug with the repeated-transition key. |
| Service | ServiceOrder | `/platform/service` | **THIN** | No RO detail page. Cannot settle to `paid`. Tax cannot be entered. |
| Service | RepairOrderLineItem | parent `/platform/service` | **THIN** | Labor lines only |
| Service | ServiceLaborOperation | parent `/platform/service` | **THIN** | Only the first open operation. No pause or cancel. |
| Service | ServicePackage | none | **MISSING** | Generic only, although it is the storefront service menu |
| Service | PartsInventory | `/platform/service` | **THIN** | Create and receive only. No parts page, edit, bin or cost view. |
| Service | PartsMovement | parent `/platform/service` | **THIN** | Receipt only. No issue, return, commit, release, adjust or count, and no ledger. |
| Service | PartsPurchaseOrder | none | **MISSING** | `managePartsPurchaseOrder` has no UI |
| Payments | PaymentProvider | none | **MISSING** | Generic only |
| Payments | PaymentTransaction | `/platform/accounting` | **THIN** | Checkout needs raw IDs and cents. No reconcile and no detail page. |
| Payments | PaymentRefund | `/platform/accounting` | Covered | Amount is typed by hand |
| Payments | PaymentProviderEvent | none (parent would be payment detail) | **MISSING** | Webhook log not shown |
| Accounting | AccountingMapping | `/platform/accounting` | **THIN** | Create only, raw rooftop ID, no edit or delete |
| Accounting | AccountingBatch | `/platform/accounting` | **THIN** | No record-posted or record-failed action (stuck in `posting`). No lines view. Stage needs a raw source ID. |
| Accounting | AccountingProviderResponse | none (parent would be batch detail) | **MISSING** | Never read |
| Catalog | Make | none | **MISSING** | Generic only |
| Catalog | Model | none | **MISSING** | Generic only |
| Catalog | RetentionPolicy | none | **MISSING** | No page and no write command |
| Reporting | SavedReport | none | **MISSING** | `saveOperationalReport` has no UI |
| Reporting | ReportRun | none | **MISSING** | `runSavedReport` and `queueDueSavedReports` have no UI |
| System | DomainAuditEvent | timelines on deals, finance and delivery | **THIN** | No `auditSearch` page |
| System | DomainOutboxEvent | none | **MISSING** | System list; the parent would be an audit page |

**Totals (70 live lists; AuthenticationThrottle excluded):**

| Verdict | Count |
|---|---|
| Covered | 17 |
| **THIN** | 31 |
| **MISSING** | 22 |

### 3.3 Workflow-step coverage summary

| Workflow | Steps | Covered | THIN | MISSING |
|---|---|---|---|---|
| W1 Inventory | 11 | 4 (4, 6, 8, 11) | 4 (3, 5, 7, 9) | 3 (1, 2, 10) |
| W2 Lead → deal | 12 | 6 (2, 4, 6, 7, 9, 11) | 4 (1, 5, 8, 12) | 2 (3, 10) |
| W3 Deal → delivery | 15 | 10 | 5 (2, 6, 7, 13, 15) | 0 |
| W4 Trade-in | 5 | 1 (1, storefront) | 1 (3) | 3 (2, 4, 5) |
| W5 Financing | 5 | 3 (2, 4, 5) | 1 (3) | 0; step 1 is storefront |
| W6 Service | 11 | 4 (1, 4, 5, 9) | 4 (3, 6, 7, 10) | 3 (2, 8, 11) |
| W7 Parts | 5 | 0 | 2 (1, 3) | 3 (2, 4, 5) |
| W8 F&I cancellation | 3 | 0 | 2 (1, 2) | 1 (3) |
| W9 Payments | 5 | 1 (4); step 3 is system | 1 (2) | 2 (1, 5) |
| W10 Accounting | 3 | 0 | 3 | 0 |
| W11 Reporting | 4 | 1 (1) | 1 (4) | 2 (2, 3) |
| W12 Org setup | 5 | 2 (1 onboarding, 3) | 1 (2) | 2 (4, 5) |
| W13 Catalog | 5 | 1 (5) | 1 (3) | 3 (1, 2, 4) |
| W14 Retention and keys | 2 | 0 | 0 | 2 |

### 3.4 Storefront coverage by customer workflow

Customer submissions go through `features/storefront/actions/submissions.ts:24-48`. That sends the session as a Bearer token, so a request made while signed in is linked to the account. TestDrive and ServiceAppointment link through `requestedBy`; Lead, TradeIn and FinancingApplication link through the audit `actorId` (`mutations/customerAccount.ts:33-43`). The CRM Customer is never linked to the login User, so guest submissions are never claimed. Confirmation references are made on the client (`features/storefront/lib/customerRequests.ts:24-31`).

| Workflow | Browse | Detail | Request / book / buy | Confirmation | Account history |
|---|---|---|---|---|---|
| Vehicle shopping | Present: `/inventory` (`screens/InventoryPage.tsx:151`). Thin filters: make and model are free text, there are no body or colour filters, and `GET_MODELS` is unused. | Present: `/inventory/[id]` (`VehicleDetailPageClient.tsx:215-388`); compare at `/compare` | Present: question, quote or test drive modal → `submitInquiry` / `submitTestDrive` (`:111-168`) | Present: reference shown in the modal (`components/LeadCaptureModal.tsx:158-176`) | Thin: kind and status only, no vehicle, no quote (`customerAccount.ts:53`) |
| Test drive | Thin: vehicle only through `?vehicleId`, no picker (`TestDrivePage.tsx:53-63`) | n/a | Present: `/test-drive` → `submitTestDrive`. Slots are client-side only and the server does no capacity check. | Present (`TestDrivePage.tsx:113-147`), with no account link | Thin: requested or completed only; no cancel or reschedule |
| Trade-in | n/a | n/a | Present: `/trade-in` → `submitTradeIn` | Thin: the server's estimate (`submitTradeIn.ts:131-133`) is discarded (`TradeInPage.tsx:112`), even though the home tile promises "Value your vehicle" | Thin: submitted or appraised; the offer amount is never shown |
| Financing | Present: calculator (`FinancingPage.tsx:237-536`) | n/a | Thin: `/financing` → `submitFinancing` with a minimal application. `privacyAcknowledged` is never sent. There is no pre-qualification step, even though the home tile promises one. | Present (server reference, `:539-578`) | Thin: application status only, no lender decision |
| Service | Present: `/service` menu (`ServicePage.tsx:28-38`) | n/a | Present: `submitServiceBooking` (4 per hour capacity). The chosen package goes into free text only. | Present (`:177-192`) | Thin: status only. No cancel or reschedule, and the RO it becomes is not shown. |
| Buy / reserve / deposit | **Missing** | **Missing** | **Missing**: no checkout. `createPaymentCheckout` is staff-only (`paymentOperations.ts:34`). | **Missing** | **Missing** |
| Purchases (deals, delivery, we-owe) | n/a | n/a | n/a | n/a | **Missing**: no customer query exists |
| Service orders, invoices, payments | n/a | n/a | n/a | n/a | **Missing**: no customer query exists |
| Account | n/a | n/a | Present: sign up (`registerCustomerAccount`), sign in, reset, profile (generic `updateUser`; the current password is not checked) | n/a | Thin: `/account` flat list of up to 50 requests (`screens/AccountPage.tsx:146-175`) with no detail pages |
| Contact | n/a | n/a | Present: `/contact` → `submitInquiry` | Present | Thin (same as an inquiry) |
| CMS pages | **Missing**: `[...slug]` always calls `notFound()` | | | | |

---

## 4. Recommended build list

Ordered by how much merchant work is blocked today. Each slice follows the E-commerce pattern: a thin wrapper at `app/dashboard/(admin)/platform/<slice>/`, logic in `features/platform/<slice>/`, and a nav entry in `features/platform/lib/navigation.ts`.

### P1. Blocking gaps (work that cannot be done at all, or gets stuck)

| # | Slice / route | Build | Lists | Existing commands | Genuinely missing command |
|---|---|---|---|---|---|
| 1 | **access**: `/platform/access` (or tabs on `/platform/users`) | Members per rooftop and group: grant, suspend and revoke with a reason; role per scope; a membership audit list; a roles and permission-matrix editor | DealerGroupMembership, RooftopMembership, MembershipAuditEvent, Role, User | `changeDealerMembership`; open Role CRUD | None. Also fix the `STAFF_WHERE` refetch in users. |
| 2 | **parts**: `/platform/parts`, `/parts/[id]` | Parts catalog (edit, bin, cost, min, supplier); ledger per part; movement drawer covering every type; RO parts commit, issue and return from the RO; purchase orders (create, order, receive, cancel) | PartsInventory, PartsMovement, PartsPurchaseOrder, ServiceOrder | `configurePart`, `recordPartsMovement`, `managePartsPurchaseOrder`, `fixedOpsWorkspace` | **Receiving a PO should post `receipt` movements and clear on-order quantities.** Today `managePartsPurchaseOrder` receive only changes the status, and nothing sets `partially-received`. Either extend it or post the movements from the action. |
| 3 | **accounting** rebuild: `/platform/accounting`, `/accounting/batches/[id]`, `/accounting/payments/[id]` | Batch detail (lines, provider responses); record-posted and record-failed actions; source pickers instead of raw IDs; mapping edit and delete with a rooftop picker; payment detail with webhook events; reconcile action | AccountingBatch, AccountingProviderResponse, AccountingMapping, PaymentTransaction, PaymentRefund, PaymentProviderEvent | `manageAccountingBatch` (all 5 actions), `stageAccountingBatch`, `configureAccountingMapping`, `reconcilePaymentTransaction`, `createPaymentCheckout`, `requestPaymentRefund` | None. Mapping delete is open CRUD; `accountingWorkspace` needs `AccountingProviderResponse` and `PaymentProviderEvent` added to the read, or a detail query. |
| 4 | **service** rebuild: `/platform/service`, `/service/orders/[id]`, `/service/appointments/[id]` | RO detail page: part and sublet lines; labor ops list with every action (pause, cancel, reassign); tax; settle to paid. Appointment edit (technician, mileage, notes, time). Fix the deterministic transition key. | ServiceOrder, RepairOrderLineItem, ServiceLaborOperation, ServiceAppointment, PartsMovement | `transitionServiceOrder` (incl. `paid`), `addServiceOrderLineItem`, `manageLaborOperation`, `recordServiceOrderEvidence`, `transitionServiceAppointment`, `openServiceOrder`; open `updateServiceAppointment` | **Edit or remove a line item** and **set RO tax** (no command; RepairOrderLineItem is command-only). Optional: a command for appointment edits, so they are audited. |
| 5 | **inventory** rebuild: `/platform/vehicles/[id]` plus an acquisitions view | Vehicle detail: identity and spec edit, stock ledger, cost list (all cost types), every recon item with category, assignee and cancel, merchandising history with approve and reject, feed run history and errors, condition report, vehicle history, price history. Acquisition pipeline: start, approve, purchase, arrive, cancel, then stock. | Vehicle, InventoryStock, InventoryStockEvent, InventoryReconWorkItem, InventoryMerchandisingVersion, InventoryFeedRun, InventoryFeedError, InventoryAcquisition (+ event), VehicleConditionReport, VehicleHistory, PriceHistory | `startInventoryAcquisition`, `transitionInventoryAcquisition`, `establishInventoryStock`, `recordInventoryCost`, `openInventoryReconWorkItem`, `transitionInventoryReconWorkItem`, `decideInventoryMerchandising` (rejected), `recordInventoryFeedRun`, `domainTimeline`; open CRUD for condition, history and price history | **Edit vehicle identity and spec** (VIN, year, make, model, trim, colours, condition, features, list price). Vehicle is command-only, and `updateInventoryMerchandisingDraft` covers price, mileage, description and image only. **Append PriceHistory on price change** (no writer today). |

### P2. Thin desks that need their missing actions

| # | Slice / route | Build | Lists | Existing commands | Missing command |
|---|---|---|---|---|---|
| 6 | **customers**: `/platform/customers`, `/customers/[id]` | Customer directory and detail (leads, visits, consent history, household); duplicate review and merge; household link | Customer, CustomerMergeEvent, CustomerHousehold, CustomerContactPreferenceEvent, Lead, SalesVisit | `customerDuplicateCandidates`, `mergeCustomers`, `linkCustomerHousehold`, `updateCustomerCommunicationPreferences` | None |
| 7 | **crm** rebuild | Lead create; lead edit; manual reassign; assignment history; visit scheduling with kind and time, cancel and no-show; showroom up-log; a "my tasks" queue | Lead, LeadAssignmentEvent, SalesVisit, Task | `transferLeadOwnership`, `manageSalesVisit` (cancel, no-show, showroom), `createLeadTask`, `completeTask` | **`createLead`** (staff walk-in or phone intake with customer find-or-create; the only route today is borrowing `submitTestDrive` or `submitServiceBooking`). **`updateLeadDetails`** (contact, source, budget, timeframe, notes, interested vehicle). Lead is `denyAll`. |
| 8 | **trade-ins** rebuild: `/platform/trade-ins/[id]` | Walk-in create, condition edit, reference value plus offer, attach to a pencil deal, "send to inventory" | TradeIn, Deal, InventoryAcquisition | Open `createTradeIn` / `updateTradeIn` (condition fields), `recordTradeInAppraisal`, `startInventoryAcquisition` (source `trade-in`), `createDealPencil` `tradeInId` | **Attach or detach a trade-in on an existing pencil deal.** The Deal validate hook forbids changing `tradeInVehicle` (`Deal.ts:72`), and `saveDealWorksheet` does not take it. |
| 9 | **finance** rebuild: add `/platform/finance/products` and an application detail | F&I product catalog (edit, deactivate, per rooftop); per-product quote entry; menu with per-product choices; cancellations list with a link to a refund; application detail; lender choice | FinanceProduct, FinanceProductQuote, FinanceMenuVersion, FinanceProductCancellation, FinancingApplication, LenderSubmission, LenderDecision, PaymentRefund | `configureFinanceProduct`, `recordFinanceProductQuote`, `presentFinanceMenu` (subset `productCodes`), `decideFinanceMenu`, `recordFinanceProductCancellation`, `requestPaymentRefund`, `queueFinancingApplication` | Optional: link a FinanceProductCancellation to a PaymentRefund (no field or command connects them) |
| 10 | **deals**: small additions | Lease structure fields; cancel from pencil, approved or financed; prefill the lead and vehicle from the CRM link; pick a TradeIn record at create | Deal | `saveDealWorksheet` (lease fields), `transitionDeal` →cancelled, `createDealPencil` `tradeInId` | None |
| 11 | **delivery**: small additions | Reschedule and cancel the case; waive a checklist item; we-owe owner and cost | DeliveryCase, WeOweItem | `manageDeliveryCase` (`schedule` again, `cancel`; checklist `waived`), `manageWeOweItem` (`ownerId`) | `estimatedCostCents` is create-time only. Optional: an edit action on `manageWeOweItem`. |

### P3. Catalog, configuration and reporting slices

| # | Slice / route | Build | Lists | Existing commands | Missing command |
|---|---|---|---|---|---|
| 12 | **catalog**: `/platform/catalog` (tabs: Makes and models, Service packages, Lead routing) | CRUD for Make and Model; service menu CRUD (the storefront `/service` reads it); routing rules with priority, source, assignee, SLA and active | Make, Model, ServicePackage, LeadRoutingRule | Open CRUD (Make, Model, ServicePackage); `configureLeadRoutingRule` | None |
| 13 | **dealership**: `/platform/dealership` (or tabs in store-settings) | Dealer group edit; rooftop list, create and edit (status, slug, time zone, currency); payment providers | DealerGroup, Rooftop, PaymentProvider | Open CRUD with `canManageDealerships` / `canManagePayments` | None. Align the currency rule with onboarding (USD only). |
| 14 | **reports**: `/platform/reports` | Saved reports, run now, run history and downloads, audit search, outbox health | SavedReport, ReportRun, DomainAuditEvent, DomainOutboxEvent | `saveOperationalReport`, `runSavedReport`, `queueDueSavedReports`, `auditSearch` | Queued ReportRuns are never processed (no worker), and saved filters are rejected ("not supported yet"). Outbox needs a read query; generic read needs `canViewReports`. |
| 15 | **settings: API keys and retention**: `/platform/api-keys`, `/platform/retention` | Own keys: create (show the token once), scopes, IP limits, revoke. Retention policy per category, with legal hold. | ApiKey, RetentionPolicy | Open ApiKey CRUD (owner) | **`configureRetentionPolicy`**: RetentionPolicy create and update are denied and nothing writes it. Also there is no sweeper that reads it. |

### Storefront flows to add

| # | Flow | Routes | Lists | Commands | Missing |
|---|---|---|---|---|---|
| S1 | **Account request detail and purchases** | `/account/requests/[kind]/[id]`, `/account/purchases`, `/account/service` | Lead, TestDrive, TradeIn, FinancingApplication, ServiceAppointment, Deal, DeliveryCase, WeOweItem, ServiceOrder, PaymentTransaction | `customerRequestHistory` (list only) | **Customer-scoped read queries** for request detail, deals and delivery, ROs and invoices, and payments. Every one of these lists is staff-read only today. Also link Customer to User (or claim guest submissions by email), so history is complete. |
| S2 | **Show the trade-in estimate** | `/trade-in` confirmation | TradeIn | `submitTradeIn` already returns estimatedMin, estimatedMax and estimateMode | None. This is a UI change only. |
| S3 | **Cancel or reschedule a test drive or service booking** | account request detail | TestDrive, ServiceAppointment | `transitionServiceAppointment` is staff-only | **Customer cancel and reschedule commands**, with requestedBy ownership checks |
| S4 | **Reserve or deposit online** | `/inventory/[id]` → `/checkout/deposit` → confirmation → account | PaymentTransaction, Deal or a reservation, Vehicle | `createPaymentCheckout` (staff-only; needs an approved deal) | **A customer deposit command** (create a pencil deal or hold plus a checkout for the deposit amount) and webhook handling for it |
| S5 | **Financing completeness** | `/financing` | FinancingApplication | `submitFinancing` | Send `privacyAcknowledged` (UI only). True pre-qualification needs a provider adapter. |
| S6 | **Structured service package booking** | `/service` | ServiceAppointment | `submitServiceBooking` | Add a package ID input and field (today it is free text in the description) |
| S7 | **Test drive vehicle picker and capacity** | `/test-drive` | TestDrive | `submitTestDrive` | Server-side slot capacity, the same as service bookings |
| S8 | **CMS pages** (about, privacy, terms) | `[...slug]` | none | none | No content list exists. Either static pages, or a new `Page` list. |

### Bugs found while reading (fix alongside the rebuilds)

- `features/platform/service/screens/ServiceAdvisorPageClient.tsx:384`: the appointment transition idempotency key is `service-appointment:${id}:${status}`. A second in-progress ↔ waiting-parts move replays silently (`mutations/operatorWorkflows.ts:12-19`).
- `features/platform/accounting`: there is no record-posted or record-failed action, so staged batches can never reach `posted`.
- `features/platform/users/screens/UserListPageClient.tsx:133-142`: the client refetch drops `STAFF_WHERE`.
- `features/platform/onboarding/hooks/useOnboardingApi.ts:56-58`: a retry after a partial failure is refused, because a rooftop already exists.
- `features/platform/finance/screens/FinanceDeskPageClient.tsx:317`: F&I products are created on the first deal's rooftop.
- Analytics: "today" uses the server's day boundary, and inventory age uses `Vehicle.createdAt` instead of `stockedAt` (`features/platform/analytics/actions/metrics.ts:358-363`).
