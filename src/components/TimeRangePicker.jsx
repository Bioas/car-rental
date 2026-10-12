import React, { useEffect } from 'react'
import { Select } from './ui/select'
import { useIsMobile } from './RangeDatePicker'
import { BOOKING_HOURS, formatTime } from '../lib/constants'

/**
 * Departure / return time for a booking, by the hour.
 *
 * On a single-day booking the return has to be after the departure, so the
 * return list only offers later hours, and moving the departure past the
 * return pushes the return one hour after it.
 *
 * Props:
 *   startTime, endTime — "HH:00"
 *   sameDay            — start and end date are the same day
 *   onChange           — (startTime, endTime) => void
 *   compact            — no visible labels (the parent labels the group)
 */
export default function TimeRangePicker({ startTime, endTime, sameDay, onChange, compact = false }) {
  // On phones the two fields are ~170px wide: drop the clock icon so the
  // time itself fits.
  const isMobile = useIsMobile()
  const option = (t) => ({ value: t, label: `${formatTime(t)} น.` })
  // A same-day trip must leave by 22:00 to return by 23:00 at the latest.
  const startOptions = (sameDay ? BOOKING_HOURS.slice(0, -1) : BOOKING_HOURS).map(option)
  const endOptions = (sameDay ? BOOKING_HOURS.filter((t) => t > startTime) : BOOKING_HOURS).map(option)

  // Switching to a single day can leave the return before the departure
  // (e.g. 18:00 → 09:00 the next morning); pull it back into order.
  useEffect(() => {
    if (!sameDay || !startTime || !endTime || endTime > startTime) return
    const start = startTime >= '23:00' ? '22:00' : startTime
    onChange(start, BOOKING_HOURS[BOOKING_HOURS.indexOf(start) + 1])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sameDay, startTime, endTime])

  function changeStart(t) {
    let end = endTime
    if (sameDay && end <= t) end = BOOKING_HOURS[BOOKING_HOURS.indexOf(t) + 1] || end
    onChange(t, end)
  }

  const field = (label, value, options, handler, icon) => (
    <div className="min-w-0 flex-1">
      {!compact && <span className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</span>}
      <Select value={value} onChange={handler} options={options} ariaLabel={label} icon={isMobile ? '' : icon} />
    </div>
  )

  return (
    <div className="flex items-end gap-2 sm:gap-3" role="group" aria-label="เวลาใช้รถ">
      {field('เวลาออกเดินทาง', startTime, startOptions, changeStart, 'bx-time-five')}
      <i aria-hidden="true" className="bx bx-right-arrow-alt text-lg text-gray-400 h-11 flex items-center shrink-0"></i>
      {field('เวลากลับ', endTime, endOptions, (t) => onChange(startTime, t), 'bx-time')}
    </div>
  )
}
