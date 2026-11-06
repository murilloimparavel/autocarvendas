// An open checkout holds the unit this long; a Stripe Checkout session lasts at least 30 minutes.
export const RESERVATION_CHECKOUT_HOLD_MS = 35 * 60 * 1000

/**
 * Prisma filter for deposits that currently hold a vehicle: a paid (captured or authorized) deposit
 * that has not been fully refunded, or a checkout the shopper may still be completing. Refunded,
 * canceled and failed deposits release the unit.
 */
export function activeReservationWhere(vehicleId: string, now = new Date()) {
  return {
    sourceType: 'reservation',
    lead: { is: { interestedVehicleId: vehicleId } },
    OR: [
      { status: { in: ['captured', 'authorized', 'partially-refunded'] } },
      { status: { in: ['creating', 'pending'] }, createdAt: { gt: new Date(now.getTime() - RESERVATION_CHECKOUT_HOLD_MS) } },
    ],
  }
}
