'use client'

import { PlatformDateInput } from '@/features/platform/components/PlatformDateTime'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, X } from 'lucide-react'

import { cancelCustomerBooking, rescheduleCustomerBooking } from '../../actions/customerRecords'
import { DEFAULT_SERVICE_SLOTS, DEFAULT_TEST_DRIVE_SLOTS, closedDayLabel, dayAvailability, localDateString } from '../../lib/bookingSlots'
import { useStorefrontBusiness } from '../StorefrontBusinessProvider'
import { ACTION_ROW, Field, Notice, RadioPills } from '../forms/RequestForm'

type Mode = 'idle' | 'reschedule' | 'cancel'

export function BookingActions({
  kind,
  id,
  canCancel,
  canReschedule,
}: {
  kind: 'test-drive' | 'service'
  id: string
  canCancel: boolean
  canReschedule: boolean
}) {
  const business = useStorefrontBusiness()
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('idle')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const [pending, startTransition] = useTransition()

  if (!canCancel && !canReschedule) {
    return (
      <p className="sf-muted text-[length:var(--sf-text-sm)]">
        {kind === 'service' ? 'Online changes closed. Contact the service department.' : 'Online changes closed. Contact the dealership.'}
      </p>
    )
  }

  const availability = dayAvailability(business, date, kind === 'service' ? DEFAULT_SERVICE_SLOTS : DEFAULT_TEST_DRIVE_SLOTS)
  const minDate = localDateString(new Date(), business.timezone)

  const reset = (next: Mode) => {
    setMode(next)
    setError(null)
    setDone(null)
    setIdempotencyKey(crypto.randomUUID())
  }

  const submitReschedule = (event: React.FormEvent) => {
    event.preventDefault()
    if (!date || !time) {
      setError('Choose a date and time.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await rescheduleCustomerBooking({ kind, id, date, time, idempotencyKey })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setDone('Rescheduled')
      setMode('idle')
      setDate('')
      setTime('')
      setIdempotencyKey(crypto.randomUUID())
      router.refresh()
    })
  }

  const confirmCancel = () => {
    setError(null)
    startTransition(async () => {
      const result = await cancelCustomerBooking({ kind, id, idempotencyKey })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setDone('Cancelled')
      setMode('idle')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {done && <Notice tone="ok">{done}</Notice>}

      {mode === 'idle' && (
        <div className={ACTION_ROW}>
          {canReschedule && (
            <button type="button" onClick={() => reset('reschedule')} className="sf-btn sf-btn-ghost">
              <CalendarClock className="size-4" aria-hidden="true" />
              Reschedule
            </button>
          )}
          {canCancel && (
            <button type="button" onClick={() => reset('cancel')} className="sf-btn sf-btn-ghost">
              <X className="size-4" aria-hidden="true" />
              Cancel booking
            </button>
          )}
        </div>
      )}

      {mode === 'cancel' && (
        <div className="sf-well space-y-3 p-4">
          <p className="sf-title-line text-[length:var(--sf-text-sm)]">
            <span className="sf-dot" data-tone="bad" aria-hidden="true" />
            <span>Cancel this {kind === 'service' ? 'appointment' : 'test drive'}?</span>
          </p>
          {error && <Notice tone="bad">{error}</Notice>}
          <div className={ACTION_ROW}>
            <button type="button" disabled={pending} onClick={confirmCancel} className="sf-btn sf-btn-primary">
              {pending ? 'Cancelling' : 'Confirm cancel'}
            </button>
            <button type="button" disabled={pending} onClick={() => reset('idle')} className="sf-btn sf-btn-ghost">
              Keep booking
            </button>
          </div>
        </div>
      )}

      {mode === 'reschedule' && (
        <form onSubmit={submitReschedule} className="sf-well space-y-4 p-4">
          <Field label="New date" htmlFor={`reschedule-date-${id}`}>
            <PlatformDateInput
              id={`reschedule-date-${id}`}
              required
              min={minDate}
              value={date}
              onChange={(value) => {
                setDate(value)
                setTime('')
              }}
              className="sf-input sf-trigger"
            />
          </Field>
          {date && (availability.status === 'closed' ? (
            <p role="alert" className="sf-title-line text-[length:var(--sf-text-sm)]">
              <span className="sf-dot" data-tone="bad" aria-hidden="true" />
              <span>{closedDayLabel(availability)} Choose another date.</span>
            </p>
          ) : (
            <RadioPills
              legend="New time"
              name={`reschedule-time-${id}`}
              required
              variant="grid"
              className="grid-cols-3 sm:grid-cols-4"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              options={availability.slots.map((slot) => ({ value: slot, label: <span className="sf-figure">{slot}</span> }))}
            />
          ))}
          {error && <Notice tone="bad">{error}</Notice>}
          <div className={ACTION_ROW}>
            <button type="submit" disabled={pending} className="sf-btn sf-btn-primary">
              {pending ? 'Saving' : 'Save new time'}
            </button>
            <button type="button" disabled={pending} onClick={() => reset('idle')} className="sf-btn sf-btn-ghost">
              Keep current time
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
