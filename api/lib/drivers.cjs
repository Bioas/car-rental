// Driver schedules, LINE account linking and driver notifications.
//
// A driver is a `role: 'driver'` user record with no password. A booking is
// assigned to one by a signer (or an admin approving it) via `driver_id`. The
// driver page (/driver) and the admin's driver schedule both read the same
// trip shape built here, and the LINE messages describe trips the same way.

const crypto = require('crypto')
const { collections, find, findOne, updateOne, updateMany, toId, str } = require('../db.cjs')
const { today } = require('./dates.cjs')
const { remainingStages, WITHOUT_SIGNATURE_IMAGES } = require('./signing.cjs')
const { pushText, isLineConfigured, lineConfig } = require('./line.cjs')
const { spansOverlap } = require('./booking-time.cjs')

// Statuses a driver still cares about. Rejected/cancelled trips never happen;
// returned ones stay so the calendar shows past work.
const SCHEDULE_STATUSES = ['pending', 'approved', 'returned']
const LINK_CODE_TTL_MS = 30 * 60 * 1000

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']

function parseDate(s) {
  const [y, m, d] = String(s).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function addDays(dateStr, n) {
  const d = parseDate(dateStr)
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA')
}

/** "วันพฤหัสบดีที่ 16 ต.ค. 2569" */
function thaiDate(dateStr, withDay = false) {
  const d = parseDate(dateStr)
  const text = `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`
  return withDay ? `วัน${THAI_DAYS[d.getDay()]}ที่ ${text}` : text
}

function thaiDateRange(start, end) {
  if (!end || start === end) return thaiDate(start, true)
  return `${thaiDate(start)} – ${thaiDate(end)}`
}

/** " เวลา 08.00–17.00 น." (or "" for whole-day bookings). */
function timeRangeText(b) {
  if (!b.start_time || !b.end_time) return ''
  return ` เวลา ${b.start_time.replace(':', '.')}–${b.end_time.replace(':', '.')} น.`
}

function destinationText(b) {
  return [
    b.destination_place,
    b.destination_district && `อ.${b.destination_district}`,
    b.destination_province && `จ.${b.destination_province}`,
  ].filter(Boolean).join(' ')
}

/** The driver-facing view of a booking. No phone numbers: this feeds a public page. */
function serializeTrip(b, car = {}) {
  return {
    id: str(b._id),
    driver_id: b.driver_id ? str(b.driver_id) : null,
    start_date: b.start_date,
    end_date: b.end_date,
    start_time: b.start_time || '',
    end_time: b.end_time || '',
    status: b.status,
    remaining_signers: remainingStages(b.signatures, b.paper_signers),
    doc_label: b.doc_label || (b.doc_number ? String(b.doc_number) : null),
    user_name: b.user_name || '',
    user_position: b.user_position || '',
    purpose: b.purpose || '',
    destination_place: b.destination_place || '',
    destination_district: b.destination_district || '',
    destination_province: b.destination_province || '',
    attendees: b.attendees || 0,
    car_id: b.car_id ? str(b.car_id) : null,
    license_plate: car.license_plate || '',
    brand: car.brand || '',
    model: car.model || '',
  }
}

async function carsById(bookings) {
  const ids = [...new Set(bookings.map((b) => str(b.car_id)).filter(Boolean))]
  if (!ids.length) return new Map()
  const cars = await find(collections.cars, { _id: { $in: ids.map(toId).filter(Boolean) } })
  return new Map(cars.map((c) => [str(c._id), c]))
}

/**
 * Trips overlapping [from, to] (inclusive YYYY-MM-DD), for one driver or for
 * every driver when `driverIds` is omitted.
 */
async function findTrips({ driverIds = null, from, to }) {
  const filter = {
    status: { $in: SCHEDULE_STATUSES },
    driver_id: driverIds ? { $in: driverIds.map(toId).filter(Boolean) } : { $ne: null },
    start_date: { $lte: to },
    end_date: { $gte: from },
  }
  const rows = await find(collections.bookings, filter, {
    sort: { start_date: 1 },
    projection: WITHOUT_SIGNATURE_IMAGES,
  })
  const cars = await carsById(rows)
  return rows.map((b) => serializeTrip(b, cars.get(str(b.car_id))))
}

/** A [from, to] window from query params, defaulting to roughly a year around today. */
function rangeFromQuery(query, { back = 62, ahead = 186 } = {}) {
  const valid = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))
  const from = valid(query.from) ? query.from : addDays(today(), -back)
  const to = valid(query.to) ? query.to : addDays(today(), ahead)
  return from <= to ? { from, to } : { from: to, to: from }
}

async function listDrivers() {
  const drivers = await find(collections.users, { role: 'driver' }, { sort: { name: 1 } })
  return drivers
}

function publicDriver(u) {
  return { id: str(u._id), name: u.name, position: u.position || '', line_linked: !!u.line_user_id }
}

// ─── LINE linking ───

/**
 * A fresh 6-digit code the driver sends to the LINE OA to link their account.
 * Codes are single-use and expire after 30 minutes.
 */
async function issueLinkCode(driverId) {
  const id = toId(driverId)
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = String(crypto.randomInt(100000, 1000000))
    const clash = await findOne(collections.users, { line_link_code: code, line_link_expires: { $gt: new Date() } })
    if (clash) continue
    const expires = new Date(Date.now() + LINK_CODE_TTL_MS)
    await updateOne(collections.users, { _id: id }, { $set: { line_link_code: code, line_link_expires: expires } })
    return { code, expires_at: expires }
  }
  throw new Error('could not allocate a LINE link code')
}

/** Link the LINE user who sent `code`. Returns the driver, or null for a bad/expired code. */
async function consumeLinkCode(code, lineUserId) {
  const driver = await findOne(collections.users, {
    role: 'driver', line_link_code: String(code), line_link_expires: { $gt: new Date() },
  })
  if (!driver) return null
  // One LINE account belongs to one driver: a phone handed over to a colleague
  // re-links rather than notifying both.
  await updateMany(collections.users, { line_user_id: lineUserId, _id: { $ne: driver._id } }, { $unset: { line_user_id: '', line_linked_at: '' } })
  await updateOne(collections.users, { _id: driver._id }, {
    $set: { line_user_id: lineUserId, line_linked_at: new Date() },
    $unset: { line_link_code: '', line_link_expires: '' },
  })
  return driver
}

async function unlinkLine({ driverId = null, lineUserId = null }) {
  const filter = driverId ? { _id: toId(driverId) } : { line_user_id: lineUserId }
  await updateMany(collections.users, filter, { $unset: { line_user_id: '', line_linked_at: '', line_link_code: '', line_link_expires: '' } })
}

// ─── Messages ───

function tripLines(trip) {
  const car = [trip.brand, trip.model].filter(Boolean).join(' ')
  const lines = [
    `📅 ${thaiDateRange(trip.start_date, trip.end_date)}${timeRangeText(trip)}`,
    `🚙 ${trip.license_plate || 'รถ'}${car ? ` (${car})` : ''}`,
  ]
  const dest = destinationText(trip)
  if (dest) lines.push(`📍 ${dest}`)
  if (trip.purpose) lines.push(`🎯 ${trip.purpose}`)
  const who = [trip.user_name, trip.user_position && `(${trip.user_position})`].filter(Boolean).join(' ')
  if (who) lines.push(`👤 ผู้ขอใช้รถ: ${who}${trip.user_phone ? ` โทร ${trip.user_phone}` : ''}`)
  if (trip.attendees) lines.push(`👥 ผู้ไปราชการ ${trip.attendees} คน`)
  if (trip.doc_label) lines.push(`📄 เลขที่ ${trip.doc_label}`)
  return lines
}

async function scheduleLink(driverId) {
  const { appUrl } = await lineConfig()
  return appUrl ? `\n\nดูตารางงานทั้งหมด: ${appUrl}/driver/${driverId}` : ''
}

/** Full trip incl. the requester's phone — only ever sent privately to the linked driver. */
async function tripForMessage(booking) {
  const car = booking.car_id ? await findOne(collections.cars, { _id: toId(booking.car_id) }) : null
  return { ...serializeTrip(booking, car || {}), user_phone: booking.user_phone || '' }
}

/**
 * Tell the assigned driver about an approved trip. Never throws — a LINE
 * outage must not fail the approval that triggered it.
 * @returns {Promise<boolean>} whether a message was sent
 */
async function notifyDriverAssigned(booking, { resend = false } = {}) {
  try {
    if (!booking?.driver_id || !(await isLineConfigured())) return false
    const driver = await findOne(collections.users, { _id: toId(booking.driver_id) })
    if (!driver?.line_user_id) return false
    const trip = await tripForMessage(booking)
    const head = resend ? '🔔 แจ้งเตือนงานขับรถ (ส่งซ้ำ)' : '🚗 คุณได้รับมอบหมายงานขับรถ'
    const text = [head, '', ...tripLines(trip)].join('\n') + await scheduleLink(str(driver._id))
    await pushText(driver.line_user_id, text)
    await updateOne(collections.bookings, { _id: toId(booking._id) }, { $set: { driver_notified_at: new Date() } })
    return true
  } catch (err) {
    console.error('[line] notify driver:', err && err.message)
    return false
  }
}

/**
 * Evening-before reminders: every approved trip starting tomorrow whose driver
 * is linked and has not been reminded yet. Safe to call repeatedly.
 */
async function sendDriverReminders(now = new Date()) {
  if (!(await isLineConfigured())) return 0
  const tomorrow = addDays(now.toLocaleDateString('en-CA'), 1)
  const rows = await find(collections.bookings, {
    status: 'approved', driver_id: { $ne: null }, start_date: tomorrow, driver_reminded_at: { $exists: false },
  }, { projection: WITHOUT_SIGNATURE_IMAGES })
  let sent = 0
  for (const b of rows) {
    try {
      const driver = await findOne(collections.users, { _id: b.driver_id })
      // Claim the reminder first so two overlapping runs never both send it.
      const claimed = await updateOne(collections.bookings, { _id: b._id, driver_reminded_at: { $exists: false } }, { $set: { driver_reminded_at: new Date() } })
      if (!claimed.modifiedCount || !driver?.line_user_id) continue
      const trip = await tripForMessage(b)
      await pushText(driver.line_user_id, ['⏰ พรุ่งนี้คุณมีงานขับรถ', '', ...tripLines(trip)].join('\n') + await scheduleLink(str(driver._id)))
      sent++
    } catch (err) {
      console.error('[line] reminder:', err && err.message)
    }
  }
  return sent
}

/**
 * Runs `sendDriverReminders` every 10 minutes once the local clock passes the
 * reminder hour (ตั้งค่า → LINE, default 17:00; null = off). Only for the
 * long-running server — a serverless deployment has no process to keep a
 * timer in. The hour is re-read each tick, so a change applies without restart.
 */
function startDriverReminderScheduler() {
  const tick = async () => {
    try {
      const { token, secret, reminderHour } = await lineConfig()
      if (!token || !secret || reminderHour === null || reminderHour === undefined) return
      if (new Date().getHours() < reminderHour) return
      await sendDriverReminders()
    } catch (err) {
      console.error('[line] reminders:', err && err.message)
    }
  }
  const timer = setInterval(tick, 10 * 60 * 1000)
  if (timer.unref) timer.unref()
  tick()
  return timer
}

// ─── Double-booking a driver ───
//
// A driver cannot be on two trips at once. Trips that still hold a driver are
// pending ones (a signer may assign the driver before the chain finishes) and
// approved ones; returned trips are over. Spans compare like car bookings
// (api/lib/booking-time.cjs): back-to-back is fine, whole-day legacy trips
// take the whole day.
const DRIVER_BUSY_STATUSES = ['pending', 'approved']

/**
 * Trips of other bookings that overlap `booking`'s time span, keyed by driver
 * id: Map<driverId, trip>. Pass `driverIds` to check only those drivers.
 */
async function driverConflicts(booking, driverIds = null) {
  const filter = {
    _id: { $ne: booking._id },
    status: { $in: DRIVER_BUSY_STATUSES },
    driver_id: driverIds ? { $in: driverIds.map(toId).filter(Boolean) } : { $ne: null },
    start_date: { $lte: booking.end_date },
    end_date: { $gte: booking.start_date },
  }
  const rows = (await find(collections.bookings, filter, { sort: { start_date: 1 }, projection: WITHOUT_SIGNATURE_IMAGES }))
    .filter((b) => spansOverlap(b, booking))
  const cars = await carsById(rows)
  const busy = new Map()
  for (const b of rows) {
    const key = str(b.driver_id)
    if (!busy.has(key)) busy.set(key, serializeTrip(b, cars.get(str(b.car_id))))
  }
  return busy
}

/** "กข 1234 · 14 ต.ค. 2569 เวลา 08.00–12.00 น." — what a clashing trip is. */
function clashText(trip) {
  return `${trip.license_plate || 'รถ'} · ${thaiDateRange(trip.start_date, trip.end_date)}${timeRangeText(trip)}`
}

/** 409 message when `driver` already has a trip overlapping `booking`, else null. */
async function driverClashError(booking, driver) {
  const trip = (await driverConflicts(booking, [str(driver._id)])).get(str(driver._id))
  if (!trip) return null
  return `${driver.name} มีงานขับรถในช่วงเวลาเดียวกันอยู่แล้ว (${clashText(trip)}${trip.doc_label ? ` · เลขที่ ${trip.doc_label}` : ''}) กรุณาเลือกพนักงานขับรถคนอื่น`
}

// ─── Picking a driver ───

/** Monday–Sunday week containing `dateStr`, as { from, to }. */
function weekOf(dateStr) {
  const from = addDays(dateStr, -((parseDate(dateStr).getDay() + 6) % 7))
  return { from, to: addDays(from, 6) }
}

/**
 * Everything the driver picker needs for one booking:
 *   busy          Map<driverId, trip>  — a trip overlapping this booking (can't pick)
 *   load          Map<driverId, n>     — other trips in the booking's Mon–Sun week
 *   week          { from, to }
 *   recommendedId the free driver with the fewest trips that week (ties: by name),
 *                 or null when nobody is free
 * Load counts pending, approved and returned trips — returned ones were still
 * work that week — but never the booking itself.
 */
async function driverAvailability(booking) {
  const week = weekOf(booking.start_date)
  const [drivers, busy, rows] = await Promise.all([
    listDrivers(),
    driverConflicts(booking),
    find(collections.bookings, {
      _id: { $ne: booking._id },
      status: { $in: SCHEDULE_STATUSES },
      driver_id: { $ne: null },
      start_date: { $lte: week.to },
      end_date: { $gte: week.from },
    }, { projection: { driver_id: 1 } }),
  ])
  const load = new Map(drivers.map((d) => [str(d._id), 0]))
  for (const b of rows) {
    const key = str(b.driver_id)
    if (load.has(key)) load.set(key, load.get(key) + 1)
  }
  const free = drivers
    .filter((d) => !busy.has(str(d._id)))
    .sort((a, b) => load.get(str(a._id)) - load.get(str(b._id)) || String(a.name).localeCompare(String(b.name), 'th'))
  return { drivers, busy, load, week, recommendedId: free.length ? str(free[0]._id) : null }
}

/** "คิว" reply in the LINE chat: today's and upcoming trips for a linked driver. */
async function upcomingTripsText(driver) {
  const trips = await findTrips({ driverIds: [str(driver._id)], from: today(), to: addDays(today(), 60) })
  const active = trips.filter((t) => t.status !== 'returned').slice(0, 5)
  const link = await scheduleLink(str(driver._id))
  if (!active.length) return `สวัสดี ${driver.name}\nขณะนี้ยังไม่มีงานขับรถที่กำหนดไว้ 🙂` + link
  const blocks = active.map((t) => {
    const state = t.status === 'approved' ? '✅ อนุมัติแล้ว' : '⏳ รออนุมัติ'
    return [`${state}`, ...tripLines(t)].join('\n')
  })
  return `งานขับรถของ ${driver.name}\n\n${blocks.join('\n\n')}` + link
}

module.exports = {
  SCHEDULE_STATUSES, serializeTrip, findTrips, rangeFromQuery, listDrivers, publicDriver,
  issueLinkCode, consumeLinkCode, unlinkLine, notifyDriverAssigned, sendDriverReminders,
  startDriverReminderScheduler, upcomingTripsText, thaiDate, thaiDateRange, addDays,
  driverConflicts, driverClashError, clashText, driverAvailability, weekOf,
}
