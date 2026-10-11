// Statistics for the รายงานสถิติ page (GET /api/admin/reports/summary) and
// its CSV export. Everything is scoped to a date range on the *date of use*:
// a request counts when its [start_date, end_date] overlaps [from, to].
//
// Outcome buckets follow what people see elsewhere in the app (see
// src/lib/constants.js effectiveStatus): an "approved" request that has not
// been signed by every stage is still in progress.

const { STAGE_KEYS, PARALLEL_STAGE_KEYS, paperKeysOf, isChainComplete } = require('./signing.cjs')

const OUTCOMES = ['approved', 'returned', 'in_progress', 'rejected']
const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const DAY_MS = 86400000
const HOUR_MS = 3600000

function utcDay(ymd) {
  return Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10))
}

/** Inclusive day count between two YYYY-MM-DD dates. */
function daysBetween(from, to) {
  return Math.round((utcDay(to) - utcDay(from)) / DAY_MS) + 1
}

function addDays(ymd, n) {
  return new Date(utcDay(ymd) + n * DAY_MS).toISOString().slice(0, 10)
}

function isFullySigned(b) {
  // Legacy rows from before the signing flow carry no document at all.
  if (!b.doc_number) return true
  return isChainComplete(b)
}

function outcomeOf(b) {
  if (b.status === 'returned') return 'returned'
  if (b.status === 'rejected') return 'rejected'
  if (b.status === 'approved' && isFullySigned(b)) return 'approved'
  return 'in_progress'
}

/** Days of [start, end] that fall inside [from, to]. */
function overlapDays(b, from, to) {
  const start = b.start_date > from ? b.start_date : from
  const end = b.end_date < to ? b.end_date : to
  return start > end ? 0 : daysBetween(start, end)
}

const signedAt = (b, key) => {
  const at = b.signatures && b.signatures[key] && b.signatures[key].signed_at
  return at ? new Date(at).getTime() : null
}

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
const round1 = (n) => (n === null ? null : Math.round(n * 10) / 10)

/** Headline numbers for a set of bookings already scoped to [from, to]. */
function kpis(bookings, cars, from, to) {
  const counts = Object.fromEntries(OUTCOMES.map((o) => [o, 0]))
  let carDays = 0
  const turnaround = []
  const borrowers = new Set()
  for (const b of bookings) {
    const outcome = outcomeOf(b)
    counts[outcome]++
    if (outcome === 'approved' || outcome === 'returned') carDays += overlapDays(b, from, to)
    const done = signedAt(b, 'director')
    if (done && b.created_at) turnaround.push((done - new Date(b.created_at).getTime()) / HOUR_MS)
    if (b.user_name) borrowers.add(`${b.user_name}\u0000${b.user_phone || ''}`)
  }
  const decided = counts.approved + counts.returned + counts.rejected
  const activeCars = cars.filter((c) => c.status !== 'retired').length
  const capacity = activeCars * daysBetween(from, to)
  return {
    requests: bookings.length,
    ...counts,
    approval_rate: decided ? round1(((counts.approved + counts.returned) / decided) * 100) : null,
    car_days: carDays,
    utilization: capacity ? round1((carDays / capacity) * 100) : null,
    avg_turnaround_hours: round1(avg(turnaround)),
    borrowers: borrowers.size,
  }
}

function buildReport({ bookings, previous, cars, from, to, prevFrom, prevTo, stageTitles }) {
  const rangeDays = daysBetween(from, to)

  // Monthly outcome counts, bucketed on the month the trip starts (clamped to
  // the range so a trip that began before `from` lands in the first month).
  const months = []
  for (let m = from.slice(0, 7); m <= to.slice(0, 7);) {
    months.push(m)
    const [y, mo] = m.split('-').map(Number)
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
  }
  const byMonth = new Map(months.map((m) => [m, { month: m, total: 0, ...Object.fromEntries(OUTCOMES.map((o) => [o, 0])) }]))

  const carStats = new Map(cars.map((c) => [String(c._id), {
    id: String(c._id), brand: c.brand, model: c.model, license_plate: c.license_plate, type: c.type || '',
    status: c.status, requests: 0, trips: 0, car_days: 0,
  }]))
  const weekdays = WEEKDAYS.map((label, i) => ({ day: i, label, requests: 0 }))
  const provinces = new Map()
  const borrowers = new Map()
  const drivers = new Map()
  const stageHours = Object.fromEntries(STAGE_KEYS.map((k) => [k, []]))

  for (const b of bookings) {
    const outcome = outcomeOf(b)
    const used = outcome === 'approved' || outcome === 'returned'
    const days = used ? overlapDays(b, from, to) : 0

    const monthKey = (b.start_date < from ? from : b.start_date).slice(0, 7)
    const month = byMonth.get(monthKey)
    if (month) { month.total++; month[outcome]++ }

    const car = carStats.get(String(b.car_id))
    if (car) {
      car.requests++
      if (used) { car.trips++; car.car_days += days }
    }

    weekdays[new Date(utcDay(b.start_date)).getUTCDay()].requests++

    const province = (b.destination_province || '').trim() || 'ไม่ระบุ'
    provinces.set(province, (provinces.get(province) || 0) + 1)

    if (b.user_name) {
      const key = `${b.user_name}\u0000${b.user_phone || ''}`
      const entry = borrowers.get(key) || { name: b.user_name, position: b.user_position || '', requests: 0, approved: 0, car_days: 0 }
      entry.requests++
      if (used) { entry.approved++; entry.car_days += days }
      borrowers.set(key, entry)
    }

    if (used) {
      const name = b.driver_name || (b.self_drive ? 'ผู้ยืมขับเอง' : 'ยังไม่ระบุผู้ขับ')
      const entry = drivers.get(name) || { name, trips: 0, car_days: 0 }
      entry.trips++
      entry.car_days += days
      drivers.set(name, entry)
    }

    // How long each signing stage took: the first three run in parallel from
    // submission; deputy waits on the last of those; director on the deputy.
    const created = b.created_at ? new Date(b.created_at).getTime() : null
    if (created) {
      const parallelDone = []
      for (const key of PARALLEL_STAGE_KEYS) {
        const at = signedAt(b, key)
        if (at) { stageHours[key].push((at - created) / HOUR_MS); parallelDone.push(at) }
      }
      const deputy = signedAt(b, 'deputy_director')
      const paper = paperKeysOf(b)
      if (deputy && parallelDone.length > 0 && parallelDone.length === PARALLEL_STAGE_KEYS.filter((k) => !paper.includes(k)).length) {
        stageHours.deputy_director.push((deputy - Math.max(...parallelDone)) / HOUR_MS)
      }
      const director = signedAt(b, 'director')
      if (director && deputy) stageHours.director.push((director - deputy) / HOUR_MS)
    }
  }

  const byCar = [...carStats.values()]
    .map((c) => ({ ...c, utilization: round1((c.car_days / rangeDays) * 100) }))
    .sort((a, b) => b.car_days - a.car_days || b.requests - a.requests)

  const sortedProvinces = [...provinces.entries()].sort((a, b) => b[1] - a[1])
  const destinations = sortedProvinces.slice(0, 7).map(([province, requests]) => ({ province, requests }))
  const rest = sortedProvinces.slice(7).reduce((sum, [, n]) => sum + n, 0)
  if (rest) destinations.push({ province: 'อื่น ๆ', requests: rest })

  return {
    range: { from, to, days: rangeDays, prev_from: prevFrom, prev_to: prevTo },
    kpis: kpis(bookings, cars, from, to),
    previous: kpis(previous, cars, prevFrom, prevTo),
    by_month: [...byMonth.values()],
    by_car: byCar,
    by_weekday: weekdays,
    destinations,
    top_borrowers: [...borrowers.values()].sort((a, b) => b.requests - a.requests || b.car_days - a.car_days).slice(0, 10),
    drivers: [...drivers.values()].sort((a, b) => b.trips - a.trips),
    stage_times: STAGE_KEYS.map((key) => ({
      key,
      title: stageTitles[key] || key,
      samples: stageHours[key].length,
      avg_hours: round1(avg(stageHours[key])),
    })),
  }
}

/** The same-length period immediately before [from, to]. */
function previousRange(from, to) {
  const days = daysBetween(from, to)
  const prevTo = addDays(from, -1)
  return { prevFrom: addDays(prevTo, -(days - 1)), prevTo }
}

const OUTCOME_LABELS = { approved: 'อนุมัติแล้ว', returned: 'คืนแล้ว', in_progress: 'รอดำเนินการ', rejected: 'ปฏิเสธ' }

/** One CSV-ready row per booking, Thai headers. */
function exportRows(bookings, carById, from, to) {
  return bookings.map((b) => {
    const car = carById.get(String(b.car_id)) || {}
    const outcome = outcomeOf(b)
    return {
      'เลขที่เอกสาร': b.doc_label || (b.doc_number ? String(b.doc_number) : ''),
      'วันที่ส่งคำขอ': b.created_at ? new Date(b.created_at).toLocaleDateString('en-CA') : '',
      'ผู้ยืม': b.user_name || '',
      'ตำแหน่ง': b.user_position || '',
      'เบอร์โทรศัพท์': b.user_phone || '',
      'ทะเบียน': car.license_plate || '',
      'ยานพาหนะ': [car.brand, car.model].filter(Boolean).join(' '),
      'วันที่เริ่ม': b.start_date,
      'วันที่สิ้นสุด': b.end_date,
      'จำนวนวัน': daysBetween(b.start_date, b.end_date),
      'จำนวนวันในช่วงรายงาน': overlapDays(b, from, to),
      'สถานที่': b.destination_place || '',
      'อำเภอ': b.destination_district || '',
      'จังหวัด': b.destination_province || '',
      'ผู้ร่วมเดินทาง (คน)': b.attendees || 0,
      'ผู้ขับ': outcome === 'approved' || outcome === 'returned'
        ? (b.driver_name || (b.self_drive ? 'ผู้ยืมขับเอง' : '')) : '',
      'สถานะ': OUTCOME_LABELS[outcome],
      'วัตถุประสงค์': b.purpose || '',
    }
  })
}

function toCsv(rows) {
  if (!rows.length) return '﻿'
  const headers = Object.keys(rows[0])
  const cell = (v) => {
    const s = String(v ?? '')
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  // BOM so Excel opens the UTF-8 Thai text correctly.
  return '﻿' + [headers.map(cell).join(','), ...rows.map((r) => headers.map((h) => cell(r[h])).join(','))].join('\r\n')
}

module.exports = { buildReport, previousRange, exportRows, toCsv, daysBetween, outcomeOf }
