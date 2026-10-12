// Driver trips — the shape returned by /api/driver/:id/schedule and
// /api/admin/driver-schedule (api/lib/drivers.cjs → serializeTrip). Shared by
// the driver page (/driver) and the admin's driver schedule.

import { effectiveStatus } from './constants'

const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const THAI_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

export { THAI_MONTHS, THAI_MONTHS_SHORT, THAI_DAYS, THAI_DAYS_SHORT }

export function parseDay(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function dayStr(d) {
  return d.toLocaleDateString('en-CA')
}

export function addDays(s, n) {
  const d = parseDay(s)
  d.setDate(d.getDate() + n)
  return dayStr(d)
}

export function daysBetween(a, b) {
  return Math.round((parseDay(b) - parseDay(a)) / 86400000)
}

/** "16 ต.ค. 2569" */
export function thaiShort(s) {
  const d = parseDay(s)
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`
}

/** "วันพุธที่ 12 ตุลาคม 2569" */
export function thaiLong(s) {
  const d = parseDay(s)
  return `วัน${THAI_DAYS[d.getDay()]}ที่ ${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`
}

export function thaiRange(start, end) {
  if (!end || start === end) return thaiShort(start)
  const a = parseDay(start)
  const b = parseDay(end)
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()}–${b.getDate()} ${THAI_MONTHS_SHORT[b.getMonth()]} ${b.getFullYear() + 543}`
  }
  return `${thaiShort(start)} – ${thaiShort(end)}`
}

export function tripDays(trip) {
  return daysBetween(trip.start_date, trip.end_date) + 1
}

export function tripOn(trip, day) {
  return trip.start_date <= day && trip.end_date >= day
}

export function destinationText(t) {
  return [
    t.destination_place,
    t.destination_district && `อ.${t.destination_district}`,
    t.destination_province && `จ.${t.destination_province}`,
  ].filter(Boolean).join(' ')
}

export function carText(t) {
  const model = [t.brand, t.model].filter(Boolean).join(' ')
  return t.license_plate ? (model ? `${t.license_plate} · ${model}` : t.license_plate) : model || 'รถ'
}

// What a driver should read: confirmed, still waiting on signatures, or done.
const TRIP_STATES = {
  approved: { label: 'อนุมัติแล้ว', short: 'ยืนยันแล้ว', icon: 'bx-check-circle', chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300', bar: '#34d399', ring: 'ring-emerald-200 dark:ring-emerald-800' },
  pending: { label: 'รออนุมัติ', short: 'รออนุมัติ', icon: 'bx-time-five', chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300', bar: '#fbbf24', ring: 'ring-amber-200 dark:ring-amber-800' },
  returned: { label: 'เสร็จสิ้น', short: 'เสร็จสิ้น', icon: 'bx-flag', chip: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300', bar: '#93c5fd', ring: 'ring-sky-200 dark:ring-sky-800' },
}

export function tripState(trip) {
  const status = effectiveStatus(trip)
  return TRIP_STATES[status] || TRIP_STATES.pending
}

export function initials(name) {
  const parts = String(name || '').replace(/^(นาย|นางสาว|นาง|ว่าที่ร้อยตรี|ดร\.)\s*/, '').trim().split(/\s+/)
  return (parts[0]?.[0] || '?') + (parts[1]?.[0] || '')
}
