const { Router } = require('express')
const bcrypt = require('bcryptjs')
const {
  collections, find, findOne, insertOne, updateOne, updateMany,
  deleteOne, countDocuments, toId, str,
} = require('../db.cjs')
const { broadcastToRole, broadcastToUser } = require('../sse.cjs')
const { authMiddleware, adminMiddleware, bookingManagerMiddleware } = require('../middleware/auth.cjs')
const { pageParams } = require('../lib/pagination.cjs')
const { sendError } = require('../lib/http-error.cjs')
const { SIGN_STAGES, STAGE_KEYS, PARALLEL_STAGE_KEYS, WITHOUT_SIGNATURE_IMAGES } = require('../lib/signing.cjs')
const { docNumberState, setNextDocNumber } = require('../lib/doc-number.cjs')
const { getDocSettings, parseUpdate, updateDocSettings } = require('../lib/doc-settings.cjs')
const { carText, notifyRejected, closeSignRequests } = require('../lib/notify.cjs')
const { reconcilePaperSigners } = require('../lib/paper-signers.cjs')
const { buildReport, previousRange, exportRows, toCsv, daysBetween, outcomeOf } = require('../lib/reports.cjs')
const { isValidDate } = require('../lib/dates.cjs')
const { findClash } = require('../lib/booking-time.cjs')
const {
  SETTINGS_ID: LINE_SETTINGS_ID, lineConfig, invalidateLineConfig, isLineConfigured, linePublicInfo, pushText,
  normalizeBotId, addFriendUrl, fetchBotInfo, setWebhookEndpoint, getWebhookInfo, testWebhook, messageQuota,
} = require('../lib/line.cjs')
const {
  findTrips, rangeFromQuery, listDrivers, issueLinkCode, unlinkLine, notifyDriverAssigned,
  driverClashError, driverAvailability,
} = require('../lib/drivers.cjs')

// 'staff' is the single login role for anyone who signs loan documents —
// which of the five document stages (api/lib/signing.cjs) a given staff
// member actually handles is an assignment (see the stage-assignment
// endpoints below), not a separate role, since who signs where is picked
// per stage rather than baked into the account.
const ALL_ROLES = ['admin', 'driver', 'staff']

const router = Router()

router.use(authMiddleware, adminMiddleware)

function serializeCar(car) {
  return {
    id: str(car._id),
    license_plate: car.license_plate,
    brand: car.brand,
    model: car.model,
    type: car.type || '',
    color: car.color,
    year: car.year,
    seats: car.seats,
    status: car.status,
    notes: car.notes || '',
    created_at: car.created_at,
  }
}

// Each signature image is a base64 data URL of up to ~500 KB, so a 20-row page
// would be tens of megabytes if they were shipped wholesale. The list only
// needs the record of WHO signed each stage, WHEN, and with what decision —
// the rendered document (api/lib/pdf.cjs) is where the actual signatures live.
function serializeSignatures(signatures) {
  const out = {}
  for (const [key, entry] of Object.entries(signatures || {})) {
    if (!entry || typeof entry !== 'object') continue
    out[key] = {
      user_id: str(entry.user_id),
      name: entry.name || '',
      position: entry.position || '',
      decision: entry.decision || null,
      signed_at: entry.signed_at || null,
    }
  }
  return out
}

function serializeBooking(b, extras = {}) {
  return {
    id: str(b._id),
    user_id: str(b.user_id),
    car_id: str(b.car_id),
    start_date: b.start_date,
    end_date: b.end_date,
    start_time: b.start_time || '',
    end_time: b.end_time || '',
    purpose: b.purpose || '',
    destination_place: b.destination_place || '',
    destination_district: b.destination_district || '',
    destination_province: b.destination_province || '',
    attendees: b.attendees || 0,
    self_drive: !!b.self_drive,
    driver_id: str(b.driver_id),
    driver_name: b.driver_name || '',
    status: b.status,
    // The document number, the stage still awaiting signature, and the record
    // of who already signed — the list row opens the sign modal directly
    // (BookingsManage), and an approved row opens the full document with its
    // signature chain, which is where the old "ประวัติการเซ็น" tab now lives.
    doc_number: b.doc_number || null,
    doc_label: b.doc_label || (b.doc_number ? String(b.doc_number) : null),
    approval_stage: b.approval_stage || null,
    signatures: serializeSignatures(b.signatures),
    // Stages signed on paper, with the name printed on the PDF.
    paper_signers: b.paper_signers || {},
    admin_notes: b.admin_notes || '',
    created_at: b.created_at,
    updated_at: b.updated_at,
    ...extras,
  }
}

// A staff member's saved signature image (api/routes/auth.cjs) is large and
// never part of a user listing.
const NO_SIGNATURE = { saved_signature: 0 }

function publicUser(u) {
  return {
    id: str(u._id),
    name: u.name,
    // Title (นาย/นาง/นางสาว) picked in the user form. `name` already starts
    // with it — the form sends the combined name, like the booking form does —
    // so this only lets the edit form split it back out.
    prefix: u.prefix || '',
    email: u.email,
    role: u.role,
    phone: u.phone || '',
    position: u.position || '',
    id_card: u.id_card || '',
    avatar: u.avatar || '',
    created_at: u.created_at,
  }
}

/** Attach car fields to a list of bookings (small in-memory join). The
 * borrower's name/phone are not a join — they are stored directly on the
 * booking, since a borrower is not a user account. */
async function enrichBookings(bookings) {
  const carIds = [...new Set(bookings.map((b) => str(b.car_id)))]
  const cars = await find(collections.cars, { _id: { $in: carIds.map(toId).filter(Boolean) } })
  const carById = new Map(cars.map((c) => [str(c._id), c]))

  return bookings.map((b) => {
    const c = carById.get(str(b.car_id)) || {}
    return serializeBooking(b, {
      user_name: b.user_name || '',
      user_phone: b.user_phone || '',
      user_position: b.user_position || '',
      license_plate: c.license_plate || '',
      brand: c.brand || '',
      model: c.model || '',
      color: c.color || '',
    })
  })
}

/** Mark a booking's outstanding request notifications as read. */
async function clearRequestNotifications(bookingId) {
  await updateMany(
    collections.notifications,
    { related_type: 'booking', related_id: bookingId, type: 'booking_request' },
    { $set: { is_read: true } }
  )
}

// ─── CARS ───

router.get('/cars', async (req, res) => {
  try {
    const cars = await find(collections.cars, {}, { sort: { created_at: -1 } })
    res.json({ cars: cars.map(serializeCar) })
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/cars', async (req, res) => {
  try {
    const { license_plate, brand, model, type, color, year, seats, status, notes } = req.body
    if (!license_plate || !brand || !model) {
      return res.status(400).json({ error: 'กรุณากรอกทะเบียนรถ ยี่ห้อ และรุ่น' })
    }

    const existing = await findOne(collections.cars, { license_plate })
    if (existing) {
      return res.status(409).json({ error: 'ทะเบียนรถนี้มีในระบบแล้ว' })
    }

    let id
    try {
      id = await insertOne(collections.cars, {
        license_plate, brand, model, type: type || '', color: color || '', year: year || null,
        seats: seats || 4, status: status || 'available', notes: notes || '', created_at: new Date(),
      })
    } catch (err) {
      if (err && err.code === 11000) return res.status(409).json({ error: 'ทะเบียนรถนี้มีในระบบแล้ว' })
      throw err
    }
    const car = await findOne(collections.cars, { _id: id })
    res.status(201).json({ car: serializeCar(car) })
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/cars/:id', async (req, res) => {
  try {
    const id = toId(req.params.id)
    const car = id ? await findOne(collections.cars, { _id: id }) : null
    if (!car) return res.status(404).json({ error: 'ไม่พบรถยนต์' })

    const { license_plate, brand, model, type, color, year, seats, status, notes } = req.body
    const data = {}
    if (license_plate) data.license_plate = license_plate
    if (brand) data.brand = brand
    if (model) data.model = model
    if (type !== undefined) data.type = type
    if (color !== undefined) data.color = color
    if (year !== undefined) data.year = year
    if (seats !== undefined) data.seats = seats
    if (status) data.status = status
    if (notes !== undefined) data.notes = notes

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'ไม่มีข้อมูลที่จะแก้ไข' })
    }

    if (license_plate) {
      const dup = await findOne(collections.cars, { license_plate, _id: { $ne: car._id } })
      if (dup) return res.status(409).json({ error: 'ทะเบียนรถนี้มีในระบบแล้ว' })
    }

    await updateOne(collections.cars, { _id: car._id }, { $set: data })
    const updated = await findOne(collections.cars, { _id: car._id })
    res.json({ car: serializeCar(updated) })
  } catch (err) {
    sendError(res, err)
  }
})

router.delete('/cars/:id', async (req, res) => {
  try {
    const id = toId(req.params.id)
    const car = id ? await findOne(collections.cars, { _id: id }) : null
    if (!car) return res.status(404).json({ error: 'ไม่พบรถยนต์' })

    const active = await findOne(collections.bookings, { car_id: car._id, status: { $in: ['pending', 'approved'] } })
    if (active) {
      return res.status(400).json({ error: 'ไม่สามารถลบรถที่มีการจองค้างอยู่' })
    }

    await deleteOne(collections.cars, { _id: car._id })
    res.json({ message: 'ลบรถยนต์สำเร็จ' })
  } catch (err) {
    sendError(res, err)
  }
})

// ─── USERS ───

router.get('/users', async (req, res) => {
  try {
    const paging = pageParams(req.query)

    if (!paging) {
      const users = await find(collections.users, {}, { sort: { created_at: -1 }, projection: NO_SIGNATURE })
      return res.json({ users: users.map(publicUser) })
    }

    const total = await countDocuments(collections.users, {})
    const users = await find(collections.users, {}, { sort: { created_at: -1 }, skip: paging.offset, limit: paging.limit, projection: NO_SIGNATURE })
    res.json({
      users: users.map(publicUser),
      total,
      page: paging.page,
      limit: paging.limit,
      pages: Math.max(Math.ceil(total / paging.limit), 1),
    })
  } catch (err) {
    sendError(res, err)
  }
})

// Drivers are a separate role from borrowers; the approve flow needs the full
// list (unpaged) so an admin can pick one without hunting through page 2.
router.get('/drivers', async (req, res) => {
  try {
    const drivers = await find(collections.users, { role: 'driver' }, { sort: { name: 1 } })
    res.json({ drivers: drivers.map(adminDriver) })
  } catch (err) {
    sendError(res, err)
  }
})

// ─── DRIVER SCHEDULE + LINE ───
//
// Who drives when (rows = drivers, trips overlapping [from, to]) and each
// driver's LINE link, for the admin's ตารางคนขับ page. See api/lib/drivers.cjs.

function adminDriver(u) {
  return {
    id: str(u._id),
    name: u.name,
    phone: u.phone || '',
    position: u.position || '',
    line_linked: !!u.line_user_id,
    line_linked_at: u.line_linked_at || null,
  }
}

async function driverOr404(req, res) {
  const id = toId(req.params.id)
  const user = id ? await findOne(collections.users, { _id: id }) : null
  if (!user || user.role !== 'driver') {
    res.status(404).json({ error: 'ไม่พบพนักงานขับรถ' })
    return null
  }
  return user
}

router.get('/driver-schedule', async (req, res) => {
  try {
    const { from, to } = rangeFromQuery(req.query, { back: 7, ahead: 31 })
    const [drivers, trips] = await Promise.all([listDrivers(), findTrips({ from, to })])
    res.json({ from, to, drivers: drivers.map(adminDriver), trips, line: await linePublicInfo() })
  } catch (err) {
    sendError(res, err)
  }
})

// A link code generated by the admin — for a driver with no phone on file, or
// to link on their behalf in person.
router.post('/drivers/:id/line-code', async (req, res) => {
  try {
    if (!(await isLineConfigured())) return res.status(503).json({ error: 'ยังไม่ได้ตั้งค่า LINE Messaging API' })
    const driver = await driverOr404(req, res)
    if (!driver) return
    const { code, expires_at } = await issueLinkCode(driver._id)
    res.json({ code, expires_at, line: await linePublicInfo() })
  } catch (err) {
    sendError(res, err)
  }
})

router.delete('/drivers/:id/line', async (req, res) => {
  try {
    const driver = await driverOr404(req, res)
    if (!driver) return
    await unlinkLine({ driverId: driver._id })
    res.json({ message: 'ยกเลิกการเชื่อมต่อ LINE แล้ว' })
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/drivers/:id/line-test', async (req, res) => {
  try {
    const driver = await driverOr404(req, res)
    if (!driver) return
    if (!(await isLineConfigured())) return res.status(503).json({ error: 'ยังไม่ได้ตั้งค่า LINE Messaging API' })
    if (!driver.line_user_id) return res.status(400).json({ error: 'พนักงานขับรถคนนี้ยังไม่ได้เชื่อมต่อ LINE' })
    await pushText(driver.line_user_id, `🔔 ข้อความทดสอบจากระบบขออนุญาตใช้ยานพาหนะ
สวัสดี ${driver.name} — การแจ้งเตือนทาง LINE ใช้งานได้ปกติ`)
    res.json({ message: 'ส่งข้อความทดสอบแล้ว' })
  } catch (err) {
    console.error('[line] test:', err && err.message)
    res.status(502).json({ error: 'ส่งข้อความไม่สำเร็จ — ตรวจสอบ Channel access token' })
  }
})

// Re-send a trip to its driver (e.g. after they linked LINE late).
router.post('/bookings/:id/notify-driver', async (req, res) => {
  try {
    const id = toId(req.params.id)
    const booking = id ? await findOne(collections.bookings, { _id: id }) : null
    if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' })
    if (!booking.driver_id) return res.status(400).json({ error: 'รายการนี้ยังไม่ได้มอบหมายพนักงานขับรถ' })
    if (!(await isLineConfigured())) return res.status(503).json({ error: 'ยังไม่ได้ตั้งค่า LINE Messaging API' })
    const driver = await findOne(collections.users, { _id: booking.driver_id })
    if (!driver?.line_user_id) return res.status(400).json({ error: 'พนักงานขับรถคนนี้ยังไม่ได้เชื่อมต่อ LINE' })
    const sent = await notifyDriverAssigned(booking, { resend: true })
    if (!sent) return res.status(502).json({ error: 'ส่งข้อความไม่สำเร็จ' })
    res.json({ message: `ส่งแจ้งเตือนถึง ${driver.name} แล้ว` })
  } catch (err) {
    sendError(res, err)
  }
})

// ─── DOCUMENT SIGN-STAGE ASSIGNMENTS ───
//
// Which staff account handles each of the five document stages (see
// api/lib/signing.cjs). Stored one settings doc per stage, keyed by stage
// key, e.g. { _id: 'vehicle_head', user_id: ObjectId(...) }.

router.get('/stage-assignments', async (req, res) => {
  try {
    const [assignments, staff, docSettings] = await Promise.all([
      find(collections.settings, { _id: { $in: STAGE_KEYS } }),
      find(collections.users, { role: 'staff' }, { sort: { name: 1 }, projection: NO_SIGNATURE }),
      getDocSettings(),
    ])
    const assignmentByStage = new Map(assignments.map((a) => [a._id, a]))
    const staffById = new Map(staff.map((u) => [str(u._id), u]))

    res.json({
      stages: SIGN_STAGES.map((stage) => {
        const assignment = assignmentByStage.get(stage.key)
        const assignedUser = assignment ? staffById.get(str(assignment.user_id)) : null
        return {
          key: stage.key,
          title: docSettings.stage_titles[stage.key],
          default_title: stage.title,
          section: stage.section,
          user_id: assignedUser ? str(assignedUser._id) : null,
          user_name: assignedUser ? assignedUser.name : '',
        }
      }),
      staff: staff.map((u) => ({ id: str(u._id), name: u.name, email: u.email })),
    })
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/stage-assignments/:key', async (req, res) => {
  try {
    const { key } = req.params
    if (!STAGE_KEYS.includes(key)) {
      return res.status(400).json({ error: 'ขั้นตอนการเซ็นเอกสารไม่ถูกต้อง' })
    }
    const { user_id } = req.body
    if (!user_id) {
      await deleteOne(collections.settings, { _id: key })
      return res.json({ message: 'ยกเลิกผู้เซ็นสำหรับขั้นตอนนี้แล้ว' })
    }
    const uid = toId(user_id)
    const user = uid ? await findOne(collections.users, { _id: uid }) : null
    if (!user || user.role !== 'staff') {
      return res.status(400).json({ error: 'ไม่พบเจ้าหน้าที่ที่เลือก' })
    }
    await updateOne(collections.settings, { _id: key }, { $set: { user_id: user._id } }, { upsert: true })
    // A paper stage with no typed name prints the assigned signer's name.
    const settings = await getDocSettings()
    if (key in settings.paper_signers) await reconcilePaperSigners(settings)
    res.json({ message: 'บันทึกผู้เซ็นสำหรับขั้นตอนนี้แล้ว' })
  } catch (err) {
    sendError(res, err)
  }
})

// ─── LINE SETTINGS (ตั้งค่า → LINE) ───
//
// The Messaging API credentials drivers are notified through (api/lib/line.cjs).
// Admin only: the token and secret are secrets, so they are never sent back —
// only whether they are set and the token's last four characters.

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' })
  next()
}

const WEBHOOK_PATH = '/api/line/webhook'

async function lineSettingsView() {
  const c = await lineConfig()
  return {
    configured: !!(c.token && c.secret),
    source: c.source,
    has_token: !!c.token,
    token_hint: c.token ? c.token.slice(-4) : '',
    has_secret: !!c.secret,
    bot_id: normalizeBotId(c.botId),
    bot_name: c.botName,
    bot_picture: c.botPicture,
    add_friend_url: addFriendUrl(c.botId),
    app_url: c.appUrl,
    webhook_url: c.appUrl ? c.appUrl + WEBHOOK_PATH : '',
    reminder_hour: c.reminderHour,
  }
}

function lineErrorText(err) {
  if (err && err.status === 401) return 'Channel access token ไม่ถูกต้องหรือหมดอายุ'
  return (err && err.message) || 'ติดต่อ LINE ไม่สำเร็จ'
}

router.get('/settings/line', adminOnly, async (req, res) => {
  try {
    res.json(await lineSettingsView())
  } catch (err) {
    sendError(res, err)
  }
})

// Live state from LINE: the OA, the webhook URL LINE has + whether "Use
// webhook" is on, and this month's push quota.
router.get('/settings/line/status', adminOnly, async (req, res) => {
  try {
    const { token, secret, appUrl } = await lineConfig()
    if (!token || !secret) return res.json({ ok: false, error: 'ยังไม่ได้ตั้งค่า' })
    const out = { ok: true, expected_webhook: appUrl ? appUrl + WEBHOOK_PATH : '' }
    try {
      const bot = await fetchBotInfo(token)
      out.bot = { id: bot.basicId, name: bot.displayName, picture: bot.pictureUrl || '' }
    } catch (err) {
      return res.json({ ok: false, error: lineErrorText(err) })
    }
    const [webhook, quota] = await Promise.allSettled([getWebhookInfo(token), messageQuota(token)])
    if (webhook.status === 'fulfilled') out.webhook = { endpoint: webhook.value.endpoint || '', active: !!webhook.value.active }
    if (quota.status === 'fulfilled') out.quota = quota.value
    res.json(out)
  } catch (err) {
    sendError(res, err)
  }
})

// Saving a token checks it with LINE first and fills in the OA's basic ID
// (for the add-friend button) from the answer. With a site URL set, the
// webhook URL is registered with LINE too, so the console needs no copying.
router.put('/settings/line', adminOnly, async (req, res) => {
  try {
    const body = req.body || {}
    const set = { updated_at: new Date() }
    const token = typeof body.channel_access_token === 'string' ? body.channel_access_token.trim() : ''
    const secret = typeof body.channel_secret === 'string' ? body.channel_secret.trim() : ''

    if (token) {
      try {
        const bot = await fetchBotInfo(token)
        set.channel_access_token = token
        set.bot_id = bot.basicId || ''
        set.bot_name = bot.displayName || ''
        set.bot_picture = bot.pictureUrl || ''
      } catch (err) {
        return res.status(400).json({ error: lineErrorText(err) })
      }
    }
    if (secret) {
      if (!/^[0-9a-f]{32}$/i.test(secret)) return res.status(400).json({ error: 'Channel secret ต้องเป็นตัวอักษร 0-9 a-f จำนวน 32 ตัว' })
      set.channel_secret = secret
    }
    if (body.app_url !== undefined) {
      const url = String(body.app_url || '').trim().replace(/\/+$/, '')
      if (url && !/^https?:\/\/[^\s/]+/i.test(url)) return res.status(400).json({ error: 'URL เว็บไซต์ไม่ถูกต้อง (ต้องขึ้นต้นด้วย https://)' })
      set.app_url = url
    }
    if (body.reminder_hour !== undefined) {
      const hour = body.reminder_hour === null ? null : Number(body.reminder_hour)
      if (hour !== null && !(Number.isInteger(hour) && hour >= 0 && hour <= 23)) {
        return res.status(400).json({ error: 'เวลาแจ้งเตือนต้องอยู่ระหว่าง 0–23 น.' })
      }
      set.reminder_hour = hour
    }

    await updateOne(collections.settings, { _id: LINE_SETTINGS_ID }, { $set: set }, { upsert: true })
    invalidateLineConfig()

    const view = await lineSettingsView()
    let webhook = null
    const effective = await lineConfig()
    if (effective.token && effective.appUrl && (token || set.app_url !== undefined)) {
      if (!effective.appUrl.startsWith('https://')) {
        webhook = { ok: false, error: 'LINE รับเฉพาะ Webhook URL ที่เป็น https:// — ตั้งได้หลังเปิดเว็บบนโดเมนจริง' }
      } else {
        try {
          await setWebhookEndpoint(effective.token, view.webhook_url)
          webhook = { ok: true }
        } catch (err) {
          webhook = { ok: false, error: lineErrorText(err) }
        }
      }
    }
    res.json({ message: 'บันทึกการตั้งค่า LINE แล้ว', settings: view, webhook })
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/settings/line/test-webhook', adminOnly, async (req, res) => {
  try {
    const { token } = await lineConfig()
    if (!token) return res.status(400).json({ error: 'ยังไม่ได้ตั้งค่า Channel access token' })
    const result = await testWebhook(token)
    res.json({
      ok: !!result.success,
      status_code: result.statusCode,
      reason: result.reason,
      detail: result.detail,
    })
  } catch (err) {
    res.status(400).json({ error: lineErrorText(err) })
  }
})

// Forget the saved credentials (environment variables, if any, apply again).
router.delete('/settings/line', adminOnly, async (req, res) => {
  try {
    await deleteOne(collections.settings, { _id: LINE_SETTINGS_ID })
    invalidateLineConfig()
    res.json({ message: 'ลบการตั้งค่า LINE แล้ว', settings: await lineSettingsView() })
  } catch (err) {
    sendError(res, err)
  }
})

// Document settings — agency header, number format, stage titles and loan
// rules (api/lib/doc-settings.cjs).
router.get('/settings/document', async (req, res) => {
  try {
    res.json(await getDocSettings())
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/settings/document', async (req, res) => {
  try {
    const { set, error } = parseUpdate(req.body || {})
    if (error) return res.status(400).json({ error })
    const settings = await updateDocSettings(set)
    // Documents still being signed pick up a changed paper/system choice.
    const updated = set.paper_signers ? await reconcilePaperSigners(settings) : 0
    res.json({ message: 'บันทึกการตั้งค่าเอกสารแล้ว', settings, updated_documents: updated })
  } catch (err) {
    sendError(res, err)
  }
})

// Document-number ("เลขที่") sequence — lets an admin choose which number the
// next loan request starts from (e.g. back to 1 at the start of a year).
router.get('/settings/doc-number', async (req, res) => {
  try {
    res.json(await docNumberState())
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/settings/doc-number', async (req, res) => {
  try {
    const next = Number(req.body && req.body.next)
    if (!Number.isInteger(next) || next < 1 || next > 1_000_000_000) {
      return res.status(400).json({ error: 'เลขที่เอกสารต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป' })
    }
    await setNextDocNumber(next)
    res.json({ message: `คำขอยืมถัดไปจะได้เลขที่ ${next}`, ...(await docNumberState()) })
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/users', async (req, res) => {
  try {
    let { name, prefix, email, password, phone, role, id_card, position } = req.body
    if (!name || !email) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อและอีเมล' })
    }
    const finalRole = role || 'driver'
    if (!ALL_ROLES.includes(finalRole)) {
      return res.status(400).json({ error: 'role ไม่ถูกต้อง' })
    }
    // Only drivers skip sign-in — they are records a booking is assigned to,
    // never a sign-in account. Every other role (admin + staff) needs a
    // password. Borrowers are not accounts at all — their name/phone live
    // directly on the booking.
    if (finalRole !== 'driver' && !password) {
      return res.status(400).json({ error: 'กรุณากรอกรหัสผ่าน' })
    }
    if (finalRole !== 'driver' && String(password).length < 6) {
      return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' })
    }
    if (!password) password = ''
    const existing = await findOne(collections.users, { email })
    if (existing) return res.status(409).json({ error: 'อีเมลนี้มีในระบบแล้ว' })

    const hashed = await bcrypt.hash(password, 10)
    const id = await insertOne(collections.users, {
      name, prefix: String(prefix || '').trim(), email, password: hashed, phone: phone || '', position: position || '', id_card: id_card || '',
      avatar: '', role: finalRole, token_version: 0, created_at: new Date(),
    })
    const user = await findOne(collections.users, { _id: id })
    res.status(201).json({ user: publicUser(user) })
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/users/:id', async (req, res) => {
  try {
    const id = toId(req.params.id)
    const user = id ? await findOne(collections.users, { _id: id }) : null
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' })

    const { name, prefix, email, password, phone, role, id_card, position } = req.body
    const data = {}
    let bumpToken = false
    if (name) data.name = name
    if (prefix !== undefined) data.prefix = String(prefix || '').trim()
    if (position !== undefined) data.position = position
    if (email) {
      const dup = await findOne(collections.users, { email, _id: { $ne: user._id } })
      if (dup) return res.status(409).json({ error: 'อีเมลนี้มีผู้ใช้อื่นแล้ว' })
      data.email = email
    }
    if (password) {
      data.password = await bcrypt.hash(password, 10)
      // Changing the password invalidates the user's existing sessions.
      bumpToken = true
    }
    if (phone !== undefined) data.phone = phone
    if (role && role !== user.role) {
      if (!ALL_ROLES.includes(role)) {
        return res.status(400).json({ error: 'role ไม่ถูกต้อง' })
      }
      // Never demote the last remaining admin.
      if (user.role === 'admin') {
        const adminCount = await countDocuments(collections.users, { role: 'admin' })
        if (adminCount <= 1) {
          return res.status(400).json({ error: 'ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน' })
        }
      }
      data.role = role
      bumpToken = true
    }
    if (id_card !== undefined) data.id_card = id_card
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'ไม่มีข้อมูลที่จะแก้ไข' })
    }
    if (bumpToken) data.token_version = (user.token_version || 0) + 1

    await updateOne(collections.users, { _id: user._id }, { $set: data })
    const updated = await findOne(collections.users, { _id: user._id })
    res.json({ user: publicUser(updated) })
  } catch (err) {
    sendError(res, err)
  }
})

router.delete('/users/:id', async (req, res) => {
  try {
    const id = toId(req.params.id)
    if (str(id) === req.user.id) {
      return res.status(400).json({ error: 'ไม่สามารถลบบัญชีตัวเองได้' })
    }
    const user = id ? await findOne(collections.users, { _id: id }) : null
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' })
    if (user.role === 'admin') {
      const adminCount = await countDocuments(collections.users, { role: 'admin' })
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน' })
      }
    }
    await deleteOne(collections.users, { _id: user._id })
    res.json({ message: 'ลบผู้ใช้สำเร็จ' })
  } catch (err) {
    sendError(res, err)
  }
})

// ─── BOOKINGS (Admin) ───

// "อนุมัติแล้ว" must mean the five-person signature chain is complete. An admin
// can still approve a request (assigning a driver) before every signer has
// signed, so those rows are 'approved' in the database yet still await
// signatures. The list exposes that state as its own tab, 'awaiting_signature'
// (รอดำเนินการ), splitting the raw 'approved' status into signed vs. unsigned.
// A stage signed on paper (paper_signers) counts as done — it is never signed
// in the system.
const MISSING_SIGNATURE_MATCH = STAGE_KEYS.map((key) => ({
  [`signatures.${key}`]: { $exists: false },
  [`paper_signers.${key}`]: { $exists: false },
}))
const AWAITING_SIGNATURE_FILTER = { status: 'approved', $or: MISSING_SIGNATURE_MATCH }
const FULLY_SIGNED_FILTER = { status: 'approved', $nor: MISSING_SIGNATURE_MATCH }
// Every request still moving through the signing chain — the admin's single
// "รอดำเนินการ" bucket, since an admin never signs and has no queue of their own.
const IN_PROGRESS_FILTER = { $or: [{ status: 'pending' }, AWAITING_SIGNATURE_FILTER] }
// A signer with no assigned stage has no personal queue.
const MATCH_NOTHING = { _id: null }

/** Stage keys a staff account is the assigned signer for. */
async function staffStageKeys(userId) {
  const uid = toId(userId)
  if (!uid) return []
  const assignments = await find(collections.settings, { _id: { $in: STAGE_KEYS }, user_id: uid })
  return assignments.map((a) => a._id)
}

/**
 * "รออนุมัติ" for a signer: documents still waiting on a stage this account is
 * assigned to — the same rule GET /api/signing/queue uses. The first three
 * stages sign in parallel, so any of them may act while that window is open.
 */
function awaitingMySignatureFilter(stageKeys) {
  const or = []
  for (const key of stageKeys) {
    if (PARALLEL_STAGE_KEYS.includes(key)) {
      or.push({
        approval_stage: { $in: PARALLEL_STAGE_KEYS },
        [`signatures.${key}`]: { $exists: false },
        [`paper_signers.${key}`]: { $exists: false },
      })
    } else {
      or.push({ approval_stage: key })
    }
  }
  if (or.length === 0) return MATCH_NOTHING
  return { status: { $nin: ['rejected', 'returned'] }, approval_stage: { $ne: null }, $or: or }
}

/**
 * "รอดำเนินการ" for a signer: documents they have personally signed that are
 * still short of one or more signatures — their own signature moved the
 * document out of "รออนุมัติ", but it only reads "อนุมัติแล้ว" once every stage
 * has signed.
 */
function signedByMeIncompleteFilter(uid) {
  return {
    status: { $nin: ['rejected', 'returned'] },
    $and: [
      { $or: MISSING_SIGNATURE_MATCH },
      { $or: STAGE_KEYS.map((key) => ({ [`signatures.${key}.user_id`]: uid })) },
    ],
  }
}

// One request, same shape as a list row — used to open a request from a
// notification.
router.get('/bookings/:id', async (req, res) => {
  try {
    const id = toId(req.params.id)
    const row = id ? await findOne(collections.bookings, { _id: id }, { projection: WITHOUT_SIGNATURE_IMAGES }) : null
    if (!row) return res.status(404).json({ error: 'ไม่พบคำขอยืม (อาจถูกยกเลิกไปแล้ว)' })
    const [booking] = await enrichBookings([row])
    res.json({ booking })
  } catch (err) {
    sendError(res, err)
  }
})

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * `filter` narrowed to bookings matching a search text: requester (name,
 * phone, position), purpose, destination, document number, driver, or the
 * car's plate / make / model.
 */
async function withBookingSearch(filter, q) {
  const text = String(q || '').trim().slice(0, 100)
  if (!text) return filter
  const re = new RegExp(escapeRegex(text), 'i')
  const cars = await find(collections.cars, { $or: [{ license_plate: re }, { brand: re }, { model: re }] }, { projection: { _id: 1 } })
  const search = {
    $or: [
      { user_name: re }, { user_phone: re }, { user_position: re }, { purpose: re },
      { destination_place: re }, { destination_district: re }, { destination_province: re },
      { doc_label: re }, { driver_name: re },
      ...(/^\d+$/.test(text) ? [{ doc_number: Number(text) }] : []),
      ...(cars.length ? [{ car_id: { $in: cars.map((c) => c._id) } }] : []),
    ],
  }
  return Object.keys(filter).length ? { $and: [filter, search] } : search
}

router.get('/bookings', async (req, res) => {
  try {
    const status = req.query.status
    // The signing tabs are personal for a signer: "รออนุมัติ" is the set still
    // waiting on *their* stage and "รอดำเนินการ" the set they already signed
    // but which is not fully signed yet. "อนุมัติแล้ว" stays the document-wide
    // "every stage signed" state. An admin never signs, so for them there is
    // no "waiting on me" set: "รอดำเนินการ" is every request still in progress
    // (not yet fully signed, not rejected/returned).
    const isSigner = req.user.role === 'staff'
    const stageKeys = isSigner ? await staffStageKeys(req.user.id) : []
    const uid = toId(req.user.id)
    const pendingFilter = isSigner ? awaitingMySignatureFilter(stageKeys) : { status: 'pending' }
    const awaitingFilter = isSigner ? signedByMeIncompleteFilter(uid) : IN_PROGRESS_FILTER

    const filter = (() => {
      switch (status) {
        case undefined:
        case '':
        case 'all':
          return {}
        case 'awaiting_signature':
          return awaitingFilter
        case 'approved':
          return FULLY_SIGNED_FILTER
        case 'pending':
          return pendingFilter
        default:
          return { status }
      }
    })()

    // Free-text search (`q`) narrows the list; the per-status counts below
    // stay totals so the summary tiles do not jump while typing.
    const listFilter = await withBookingSearch(filter, req.query.q)

    const paging = pageParams(req.query)
    const findOptions = { sort: { created_at: -1 }, projection: WITHOUT_SIGNATURE_IMAGES }
    if (paging) {
      findOptions.skip = paging.offset
      findOptions.limit = paging.limit
    }

    // Per-status totals power the filter chips without shipping every row.
    // The queries below are independent, so they run together.
    const [rows, total, countAll, countPending, countAwaiting, countApproved, countRejected, countReturned] = await Promise.all([
      find(collections.bookings, listFilter, findOptions),
      paging ? countDocuments(collections.bookings, listFilter) : Promise.resolve(null),
      countDocuments(collections.bookings, {}),
      countDocuments(collections.bookings, pendingFilter),
      countDocuments(collections.bookings, awaitingFilter),
      countDocuments(collections.bookings, FULLY_SIGNED_FILTER),
      countDocuments(collections.bookings, { status: 'rejected' }),
      countDocuments(collections.bookings, { status: 'returned' }),
    ])

    const counts = {
      all: countAll,
      pending: countPending,
      awaiting_signature: countAwaiting,
      approved: countApproved,
      rejected: countRejected,
      returned: countReturned,
    }

    if (!paging) {
      return res.json({ bookings: await enrichBookings(rows), counts })
    }

    res.json({
      bookings: await enrichBookings(rows),
      counts,
      total,
      page: paging.page,
      limit: paging.limit,
      pages: Math.max(Math.ceil(total / paging.limit), 1),
    })
  } catch (err) {
    sendError(res, err)
  }
})

// For the approve dialog's driver picker: who is busy during this booking
// (`busy`: { [driverId]: trip }), how many trips each has in its Mon–Sun week
// (`load`), and the free driver with the lightest week (`recommended_id`).
router.get('/bookings/:id/driver-conflicts', bookingManagerMiddleware, async (req, res) => {
  try {
    const id = toId(req.params.id)
    const booking = id ? await findOne(collections.bookings, { _id: id }, { projection: WITHOUT_SIGNATURE_IMAGES }) : null
    if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' })
    const { busy, load, week, recommendedId } = await driverAvailability(booking)
    res.json({ busy: Object.fromEntries(busy), load: Object.fromEntries(load), week, recommended_id: recommendedId })
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/bookings/:id/approve', bookingManagerMiddleware, async (req, res) => {
  try {
    const id = toId(req.params.id)
    const booking = id ? await findOne(collections.bookings, { _id: id }) : null
    if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' })
    if (booking.status !== 'pending') return res.status(400).json({ error: 'รายการนี้ไม่รอการอนุมัติ' })

    const car = await findOne(collections.cars, { _id: booking.car_id })
    if (!car) return res.status(404).json({ error: 'ไม่พบรถยนต์' })

    // Approving also decides who drives: an assigned driver, or the requester
    // driving themselves. A body with no choice at all (legacy callers) is
    // treated as "requester drives". When explicitly assigning, the driver must
    // exist and hold the driver role.
    const { self_drive, driver_id } = req.body || {}
    let driver = null
    if (self_drive === false && !driver_id) {
      return res.status(400).json({ error: 'กรุณาเลือกพนักงานขับรถ หรือเลือกให้ผู้ยืมขับเอง' })
    }
    if (!self_drive && driver_id) {
      const did = toId(driver_id)
      driver = did ? await findOne(collections.users, { _id: did }) : null
      if (!driver || driver.role !== 'driver') {
        return res.status(400).json({ error: 'ไม่พบพนักงานขับรถที่เลือก' })
      }
      // A driver cannot be on two trips at once.
      const clash = await driverClashError(booking, driver)
      if (clash) return res.status(409).json({ error: clash, code: 'driver_busy' })
    }
    const selfDrive = !driver

    // Approving must not create a clash with a booking that was approved while
    // this one sat in the queue.
    const clash = await findClash(booking.car_id, booking, { statuses: ['approved'], excludeId: booking._id })
    if (clash) return res.status(409).json({ error: 'รถยนต์คันนี้ถูกอนุมัติให้ผู้ยืมรายอื่นในช่วงวันและเวลานี้แล้ว' })

    // Guard the transition so a second admin clicking at the same moment fails.
    const changed = await updateOne(
      collections.bookings,
      { _id: booking._id, status: 'pending' },
      {
        $set: {
          status: 'approved',
          self_drive: selfDrive,
          driver_id: driver ? driver._id : null,
          driver_name: driver ? driver.name : '',
          updated_at: new Date(),
        },
      }
    )
    if (!changed.matchedCount) return res.status(409).json({ error: 'รายการนี้ถูกดำเนินการไปแล้ว' })

    // The assigned driver hears about it on LINE (no-op when not linked).
    if (driver) await notifyDriverAssigned({ ...booking, status: 'approved', driver_id: driver._id, driver_name: driver.name })

    const driverNote = driver ? ` มอบหมายพนักงานขับรถ: ${driver.name}` : ' (ผู้ยืมขับเอง)'
    await clearRequestNotifications(booking._id)
    await insertOne(collections.notifications, {
      user_id: booking.user_id,
      message: `✅ อนุมัติการยืม ${carText(car)}${driverNote}`,
      type: 'approved', related_type: 'booking', related_id: booking._id,
      is_read: false, created_at: new Date(),
    })

    broadcastToRole('admin', 'data-changed', { action: 'approve', booking_id: str(booking._id) })
    broadcastToUser(str(booking.user_id), 'data-changed', { action: 'approve', booking_id: str(booking._id) })

    res.json({ message: 'อนุมัติสำเร็จ' })
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/bookings/:id/reject', bookingManagerMiddleware, async (req, res) => {
  try {
    const { admin_notes } = req.body
    const id = toId(req.params.id)
    const booking = id ? await findOne(collections.bookings, { _id: id }) : null
    if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' })
    if (booking.status !== 'pending') return res.status(400).json({ error: 'เฉพาะรายการที่รออนุมัติเท่านั้นที่ปฏิเสธได้' })

    const car = await findOne(collections.cars, { _id: booking.car_id })

    const changed = await updateOne(
      collections.bookings,
      { _id: booking._id, status: 'pending' },
      { $set: { status: 'rejected', admin_notes: admin_notes || '', updated_at: new Date() } }
    )
    if (!changed.matchedCount) return res.status(409).json({ error: 'รายการนี้ถูกดำเนินการไปแล้ว' })

    await clearRequestNotifications(booking._id)
    // Borrowers have no account; the admins are the ones to tell. Open sign
    // requests for this document are closed — nothing is left to sign.
    try {
      await closeSignRequests(booking._id)
      await notifyRejected(booking, car, { note: admin_notes || '' })
    } catch (err) {
      console.error('[notify] reject:', err && err.message)
    }

    broadcastToRole('admin', 'data-changed', { action: 'reject', booking_id: str(booking._id) })
    broadcastToUser(str(booking.user_id), 'data-changed', { action: 'reject', booking_id: str(booking._id) })

    res.json({ message: 'ปฏิเสธสำเร็จ' })
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/bookings/:id/return', bookingManagerMiddleware, async (req, res) => {
  try {
    const id = toId(req.params.id)
    const booking = id ? await findOne(collections.bookings, { _id: id }) : null
    if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' })
    if (booking.status !== 'approved') return res.status(400).json({ error: 'เฉพาะรายการที่อนุมัติแล้วเท่านั้น' })

    const changed = await updateOne(
      collections.bookings,
      { _id: booking._id, status: 'approved' },
      { $set: { status: 'returned', updated_at: new Date() } }
    )
    if (!changed.matchedCount) return res.status(409).json({ error: 'รายการนี้ถูกดำเนินการไปแล้ว' })

    await clearRequestNotifications(booking._id)
    await insertOne(collections.notifications, {
      user_id: booking.user_id,
      message: `🔁 คืนรถเรียบร้อยแล้ว (Booking #${str(booking._id)})`,
      type: 'returned', related_type: 'booking', related_id: booking._id,
      is_read: false, created_at: new Date(),
    })

    broadcastToRole('admin', 'data-changed', { action: 'return', booking_id: str(booking._id) })
    broadcastToUser(str(booking.user_id), 'data-changed', { action: 'return', booking_id: str(booking._id) })

    res.json({ message: 'บันทึกการคืนรถสำเร็จ' })
  } catch (err) {
    sendError(res, err)
  }
})

// ─── REPORTS ───

router.get('/reports', async (req, res) => {
  try {
    // Only the fields the aggregation actually reads are projected — this
    // endpoint loads every row, so dropping password hashes, id cards, notes
    // and images keeps it an order of magnitude lighter.
    const [cars, users, bookings] = await Promise.all([
      find(collections.cars, {}, { projection: { brand: 1, model: 1, license_plate: 1, status: 1 } }),
      find(collections.users, {}, { projection: { _id: 1 } }),
      find(collections.bookings, {}, {
        projection: { car_id: 1, user_name: 1, user_phone: 1, status: 1, created_at: 1, start_date: 1, end_date: 1 },
      }),
    ])

    const today = new Date().toISOString().split('T')[0]
    const stats = {
      totalCars: cars.length,
      availableCars: cars.filter((c) => c.status === 'available').length,
      totalUsers: users.length,
      totalBookings: bookings.length,
      pendingBookings: bookings.filter((b) => b.status === 'pending').length,
      approvedBookings: bookings.filter((b) => b.status === 'approved').length,
      returnedBookings: bookings.filter((b) => b.status === 'returned').length,
      activeToday: bookings.filter((b) => b.status === 'approved' && b.start_date <= today && b.end_date >= today).length,
    }

    const countByCar = new Map()
    for (const b of bookings) {
      const key = str(b.car_id)
      countByCar.set(key, (countByCar.get(key) || 0) + 1)
    }
    const bookingsByCar = cars
      .map((c) => ({
        id: str(c._id),
        brand: c.brand,
        model: c.model,
        license_plate: c.license_plate,
        count: countByCar.get(str(c._id)) || 0,
      }))
      .sort((a, b) => b.count - a.count)

    // Month bucket from created_at, keyed in UTC so it is locale-independent.
    const monthMap = new Map()
    const monthStatusMap = new Map()
    for (const b of bookings) {
      if (!b.created_at) continue
      const month = new Date(b.created_at).toISOString().slice(0, 7)
      monthMap.set(month, (monthMap.get(month) || 0) + 1)
      if (!monthStatusMap.has(month)) monthStatusMap.set(month, {})
      const perStatus = monthStatusMap.get(month)
      perStatus[b.status] = (perStatus[b.status] || 0) + 1
    }
    const bookingsByMonth = [...monthMap.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 12)
      .map(([month, count]) => ({ month, count, breakdown: monthStatusMap.get(month) || {} }))

    // Borrowers are not accounts, so "most frequent borrower" is grouped by
    // the name/phone stored directly on each booking rather than a user join.
    const bookingCountByBorrower = new Map()
    for (const b of bookings) {
      const name = b.user_name || ''
      if (!name) continue
      const key = `${name}\u0000${b.user_phone || ''}`
      const entry = bookingCountByBorrower.get(key) || { name, phone: b.user_phone || '', count: 0 }
      entry.count++
      bookingCountByBorrower.set(key, entry)
    }
    const topUsers = [...bookingCountByBorrower.entries()]
      .map(([key, entry]) => ({ id: key, name: entry.name, email: entry.phone, count: entry.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    res.json({ stats, bookingsByCar, bookingsByMonth, topUsers })
  } catch (err) {
    sendError(res, err)
  }
})

// ── Reports page (src/pages/admin/Reports.jsx) ──
// Range is on the date of use; defaults to the last 12 months.
function reportRange(query) {
  const today = new Date().toLocaleDateString('en-CA')
  let { from, to } = query
  if (!to) to = today
  if (!from) {
    const d = new Date(`${to}T00:00:00Z`)
    d.setUTCFullYear(d.getUTCFullYear() - 1)
    d.setUTCDate(d.getUTCDate() + 1)
    from = d.toISOString().slice(0, 10)
  }
  if (!isValidDate(from) || !isValidDate(to)) return { error: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)' }
  if (from > to) return { error: 'วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด' }
  if (daysBetween(from, to) > 3700) return { error: 'ช่วงเวลารายงานยาวได้ไม่เกิน 10 ปี' }
  return { from, to }
}

// Only what the statistics read — notably each stage's signed_at, never the
// base64 signature images.
const REPORT_PROJECTION = {
  car_id: 1, user_name: 1, user_phone: 1, user_position: 1, status: 1, created_at: 1,
  start_date: 1, end_date: 1, start_time: 1, end_time: 1, destination_place: 1, destination_district: 1, destination_province: 1,
  attendees: 1, purpose: 1, driver_name: 1, self_drive: 1, doc_number: 1, doc_label: 1,
  ...Object.fromEntries(STAGE_KEYS.map((k) => [`signatures.${k}.signed_at`, 1])),
  paper_signers: 1,
}

router.get('/reports/summary', async (req, res) => {
  try {
    const { from, to, error } = reportRange(req.query)
    if (error) return res.status(400).json({ error })
    const { prevFrom, prevTo } = previousRange(from, to)
    const [cars, rows, docSettings] = await Promise.all([
      find(collections.cars, {}, { projection: { brand: 1, model: 1, license_plate: 1, status: 1, type: 1 } }),
      // One query covers both the range and the comparison period before it.
      find(collections.bookings, { start_date: { $lte: to }, end_date: { $gte: prevFrom } }, { projection: REPORT_PROJECTION }),
      getDocSettings(),
    ])
    const inRange = rows.filter((b) => b.start_date <= to && b.end_date >= from)
    const previous = rows.filter((b) => b.start_date <= prevTo && b.end_date >= prevFrom)
    res.json(buildReport({ bookings: inRange, previous, cars, from, to, prevFrom, prevTo, stageTitles: docSettings.stage_titles }))
  } catch (err) {
    sendError(res, err)
  }
})

// ── Dashboard (src/pages/Dashboard.jsx) ──
// Today-focused: each car's state right now, trips in the next 7 days, new
// requests this month vs last, and a 6-month outcome trend. Compact payload —
// no signature images.
router.get('/dashboard', async (req, res) => {
  try {
    const now = new Date()
    const today = now.toLocaleDateString('en-CA')
    const weekAhead = new Date(now.getTime() + 7 * 86400000).toLocaleDateString('en-CA')
    const trendFrom = new Date(now.getFullYear(), now.getMonth() - 5, 1).toLocaleDateString('en-CA')
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const { prevFrom, prevTo } = previousRange(trendFrom, today)

    const [cars, rows, newThisMonth, newLastMonth, docSettings] = await Promise.all([
      find(collections.cars, {}, { projection: { brand: 1, model: 1, license_plate: 1, status: 1, type: 1 }, sort: { brand: 1, model: 1 } }),
      find(collections.bookings, { start_date: { $lte: weekAhead }, end_date: { $gte: prevFrom } }, { projection: REPORT_PROJECTION }),
      countDocuments(collections.bookings, { created_at: { $gte: thisMonthStart } }),
      countDocuments(collections.bookings, { created_at: { $gte: lastMonthStart, $lt: thisMonthStart } }),
      getDocSettings(),
    ])
    const carById = new Map(cars.map((c) => [str(c._id), c]))
    const live = rows.filter((b) => b.status === 'pending' || b.status === 'approved')

    const fleet = cars.map((c) => {
      const id = str(c._id)
      const todays = live.filter((b) => str(b.car_id) === id && b.start_date <= today && b.end_date >= today)
      const trip = todays.find((b) => b.status === 'approved') || todays[0] || null
      let state = 'available'
      if (c.status === 'maintenance' || c.status === 'retired') state = c.status
      else if (trip) state = trip.status === 'approved' ? 'in_use' : 'requested'
      return {
        id, brand: c.brand, model: c.model, license_plate: c.license_plate, type: c.type || '', state,
        trip: trip ? {
          id: str(trip._id), user_name: trip.user_name || '', end_date: trip.end_date,
          destination: trip.destination_province || trip.destination_place || '',
          driver: trip.driver_name || (trip.self_drive ? 'ผู้ยืมขับเอง' : ''),
        } : null,
      }
    })

    const upcoming = live
      .filter((b) => b.start_date > today && b.start_date <= weekAhead)
      .sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0))
      .slice(0, 8)
      .map((b) => {
        const car = carById.get(str(b.car_id)) || {}
        return {
          id: str(b._id), user_name: b.user_name || '', user_position: b.user_position || '',
          brand: car.brand || '', model: car.model || '', license_plate: car.license_plate || '',
          start_date: b.start_date, end_date: b.end_date,
          start_time: b.start_time || '', end_time: b.end_time || '',
          destination: [b.destination_place, b.destination_province].filter(Boolean).join(' · '),
          driver: b.driver_name || (b.self_drive ? 'ผู้ยืมขับเอง' : ''),
          outcome: outcomeOf(b),
          doc_label: b.doc_label || (b.doc_number ? String(b.doc_number) : ''),
        }
      })

    const inTrend = rows.filter((b) => b.start_date <= today && b.end_date >= trendFrom)
    const previous = rows.filter((b) => b.start_date <= prevTo && b.end_date >= prevFrom)
    const report = buildReport({ bookings: inTrend, previous, cars, from: trendFrom, to: today, prevFrom, prevTo, stageTitles: docSettings.stage_titles })

    res.json({
      today,
      fleet,
      upcoming,
      new_requests: { this_month: newThisMonth, last_month: newLastMonth },
      trend: { from: trendFrom, to: today, by_month: report.by_month, kpis: report.kpis },
    })
  } catch (err) {
    sendError(res, err)
  }
})

// Every request in the range as a CSV (UTF-8 with BOM, opens in Excel).
router.get('/reports/export', async (req, res) => {
  try {
    const { from, to, error } = reportRange(req.query)
    if (error) return res.status(400).json({ error })
    const [cars, rows] = await Promise.all([
      find(collections.cars, {}, { projection: { brand: 1, model: 1, license_plate: 1 } }),
      find(collections.bookings, { start_date: { $lte: to }, end_date: { $gte: from } },
        { projection: REPORT_PROJECTION, sort: { start_date: 1, created_at: 1 } }),
    ])
    const carById = new Map(cars.map((c) => [str(c._id), c]))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="loan-requests-${from}-to-${to}.csv"`)
    res.setHeader('Cache-Control', 'no-store')
    res.send(toCsv(exportRows(rows, carById, from, to)))
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
