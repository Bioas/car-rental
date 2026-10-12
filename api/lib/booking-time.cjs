// Booking times.
//
// A booking runs from `start_date start_time` to `end_date end_time`; times
// are `HH:MM` strings (the forms offer whole hours). Bookings made before times
// existed have none and occupy their days in full, so they are read as
// 00:00 → 24:00. Same-format strings compare chronologically, which keeps every
// check a plain string comparison like the dates.
//
// Two bookings clash only when their spans overlap; back-to-back is fine
// (08:00–12:00 then 12:00–17:00 on the same car).

const { collections, find } = require('../db.cjs')

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DAY_START = '00:00'
const DAY_END = '24:00'

function isValidTime(value) {
  return TIME_RE.test(String(value || ''))
}

/** `[start, end)` of a booking as comparable `YYYY-MM-DDTHH:MM` strings. */
function spanOf(b) {
  return [
    `${b.start_date}T${b.start_time || DAY_START}`,
    `${b.end_date}T${b.end_time || DAY_END}`,
  ]
}

function spansOverlap(a, b) {
  const [aStart, aEnd] = spanOf(a)
  const [bStart, bEnd] = spanOf(b)
  return aStart < bEnd && bStart < aEnd
}

/**
 * Validate the optional `start_time` / `end_time` of a booking request.
 * Both or neither must be given (neither = whole days, the old behaviour).
 * Returns `{ error }` or `{ start_time, end_time }` (empty strings when omitted).
 */
function parseBookingTimes({ start_date, end_date, start_time, end_time }) {
  const st = String(start_time || '').trim()
  const et = String(end_time || '').trim()
  if (!st && !et) return { start_time: '', end_time: '' }
  if (!st || !et) return { error: 'กรุณาเลือกทั้งเวลาออกเดินทางและเวลากลับ' }
  if (!isValidTime(st) || !isValidTime(et)) return { error: 'รูปแบบเวลาไม่ถูกต้อง (ต้องเป็น HH:MM)' }
  if (start_date === end_date && et <= st) return { error: 'เวลากลับต้องหลังเวลาออกเดินทาง' }
  return { start_time: st, end_time: et }
}

/**
 * First booking of `carId` (approved or pending, or only `statuses`) whose time
 * span overlaps `span`, ignoring `excludeId`. Dates narrow the query; times are
 * compared here.
 */
async function findClash(carId, span, { statuses = ['approved', 'pending'], excludeId = null } = {}) {
  const filter = {
    car_id: carId,
    status: { $in: statuses },
    start_date: { $lte: span.end_date },
    end_date: { $gte: span.start_date },
  }
  if (excludeId) filter._id = { $ne: excludeId }
  const rows = await find(collections.bookings, filter, {
    projection: { car_id: 1, start_date: 1, end_date: 1, start_time: 1, end_time: 1, status: 1 },
  })
  return rows.find((b) => spansOverlap(b, span)) || null
}

/** "08:00" → "08.00 น." (Thai convention); empty for whole-day bookings. */
function thaiTime(t) {
  return t ? `${t.replace(':', '.')} น.` : ''
}

module.exports = { TIME_RE, isValidTime, spanOf, spansOverlap, parseBookingTimes, findClash, thaiTime }
