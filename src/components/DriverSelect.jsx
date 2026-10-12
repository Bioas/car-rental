import React from 'react'
import { Select } from './ui/select'
import { formatBookingRange } from '../lib/constants'

/** "ติดงาน กข 1234 · 14 ต.ค. 2569 · 08.00–12.00 น." */
function busyText(trip) {
  return `ติดงาน ${trip.license_plate || 'รถ'} · ${formatBookingRange(trip)}`
}

/**
 * Driver picker for approving / signing a booking. Drivers whose `busy` trip
 * overlaps this booking's time can't be picked — the row says which trip
 * keeps them busy — and the server refuses them too (409 driver_busy).
 *
 * The list is ordered for picking: the recommended driver (free, fewest
 * trips in the booking's week — chosen by the server) first, then the other
 * free drivers by how light their week is, then the busy ones.
 *
 * Props:
 *   drivers       — [{ id, name, phone, busy: trip | null, week_trips?: number }]
 *   recommendedId — id of the suggested driver, if any
 *   value, onChange
 */
export default function DriverSelect({ drivers, recommendedId = null, value, onChange }) {
  const selected = drivers.find((d) => d.id === value)
  const freeCount = drivers.filter((d) => !d.busy).length
  const hasLoad = drivers.some((d) => typeof d.week_trips === 'number')
  const weekText = (d) => (hasLoad ? `สัปดาห์นี้ ${d.week_trips ? `${d.week_trips} งาน` : 'ยังไม่มีงาน'}` : '')
  const rank = (d) => (d.busy ? 2 : d.id === recommendedId ? 0 : 1)
  const ordered = [...drivers].sort((a, b) => rank(a) - rank(b) || (a.week_trips || 0) - (b.week_trips || 0))
  const recommended = drivers.find((d) => d.id === recommendedId && !d.busy)

  return (
    <>
      <Select value={value} onChange={onChange}
        icon="bx-user-pin" placeholder="— เลือกพนักงานขับรถ —" ariaLabel="พนักงานขับรถ"
        options={ordered.map((d) => ({
          value: d.id,
          label: d.phone ? `${d.name} (${d.phone})` : d.name,
          disabled: !!d.busy,
          badge: d.id === recommended?.id ? 'แนะนำ' : '',
          hint: d.busy ? busyText(d.busy) : weekText(d) && `ว่าง · ${weekText(d)}`,
          hintClassName: d.busy ? '' : 'text-neutral-500 dark:text-gray-400',
        }))} />
      {recommended && value === recommended.id && hasLoad && (
        <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-1.5">
          <i aria-hidden="true" className="bx bx-bulb text-sm mt-px shrink-0"></i>
          <span>ระบบแนะนำ {recommended.name} — ว่างในช่วงเวลานี้และมีงานน้อยที่สุดในสัปดาห์ ({weekText(recommended)})</span>
        </p>
      )}
      {selected?.busy && (
        <p role="alert" className="mt-2 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
          <i aria-hidden="true" className="bx bx-error-circle text-sm mt-px shrink-0"></i>
          <span>{selected.name} มีงานขับรถในช่วงเวลาเดียวกันอยู่แล้ว ({busyText(selected.busy).replace(/^ติดงาน /, '')}) กรุณาเลือกคนอื่น</span>
        </p>
      )}
      {drivers.length > 0 && freeCount === 0 && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
          <i aria-hidden="true" className="bx bx-info-circle text-sm mt-px shrink-0"></i>
          <span>พนักงานขับรถทุกคนติดงานในช่วงเวลานี้ — เลือก &quot;ให้ผู้ยืมขับเอง&quot; หรือปรับเวลาคำขอ</span>
        </p>
      )}
    </>
  )
}
