const { Router } = require('express')
const {
  collections, find, findOne, insertOne, insertMany, updateOne, updateMany,
  deleteOne, toId, str, withLock,
} = require('../db.cjs')
const { broadcastToRole } = require('../sse.cjs')
const { today, isValidDate } = require('../lib/dates.cjs')
const { httpError, sendError } = require('../lib/http-error.cjs')
const { nextDocNumber } = require('../lib/doc-number.cjs')
const { renderBookingPdf } = require('../lib/pdf.cjs')
const { SIGN_STAGES, remainingStages, currentStage, stagesToNotify, WITHOUT_SIGNATURE_IMAGES } = require('../lib/signing.cjs')
const { resolvePaperSigners } = require('../lib/paper-signers.cjs')
const { getDocSettings, formatDocLabel, checkBookingRules } = require('../lib/doc-settings.cjs')
const { carText, notifyStageSigners } = require('../lib/notify.cjs')
const { joinNamePrefix } = require('../lib/names.cjs')

// A data: URI image, capped well above anything a signature pad or a phone
// photo of a signature needs — guards against someone posting an enormous
// upload through this public, unauthenticated endpoint.
const MAX_SIGNATURE_LENGTH = 500_000
function isValidSignature(value) {
  return typeof value === 'string' && value.startsWith('data:image/') && value.length <= MAX_SIGNATURE_LENGTH
}

const router = Router()

// Public cancel/return authenticate with the borrower's phone number, which is
// a weak shared secret. We at least normalize the value (strip spaces/dashes)
// before comparing so the check is deterministic.
function normalizePhone(value) {
  return String(value || '').replace(/[\s-]/g, '')
}

// Signing progress for the borrower's tracking timeline: per stage only when it
// was signed and the decision. Signature images, signer names and positions
// stay out — the lookup is matched on a name substring, so anything here is
// effectively public.
function publicSignatureProgress(signatures) {
  const out = {}
  for (const key of ['requester', ...SIGN_STAGES.map((s) => s.key)]) {
    const entry = signatures?.[key]
    if (!entry) continue
    out[key] = { signed_at: entry.signed_at || null, decision: entry.decision || 'approve' }
  }
  return out
}

function serializePublicCar(car, activeCount, upcomingCount) {
  const { _id, ...rest } = car
  delete rest.image
  return {
    ...rest,
    id: str(_id),
    active_booking_count: activeCount,
    upcoming_booking_count: upcomingCount,
  }
}

router.get('/cars', async (req, res) => {
  try {
    const { start_date, end_date } = req.query
    const now = today()

    if (start_date && end_date && (!isValidDate(start_date) || !isValidDate(end_date))) {
      return res.status(400).json({ error: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)' })
    }

    // One projected scan of the booking rows serves both the date-range clash
    // filter and the active/upcoming counters — previously these were two
    // separate full queries run one after the other.
    const [cars, bookings] = await Promise.all([
      find(collections.cars, { status: 'available' }, { sort: { brand: 1, model: 1 } }),
      find(collections.bookings, { status: { $in: ['approved', 'pending'] } }, {
        projection: { car_id: 1, start_date: 1, end_date: 1 },
      }),
    ])

    let visibleCars = cars
    if (start_date && end_date) {
      const busy = new Set(
        bookings
          .filter((b) => b.start_date <= end_date && b.end_date >= start_date)
          .map((b) => str(b.car_id))
      )
      visibleCars = cars.filter((c) => !busy.has(str(c._id)))
    }

    const activeCount = new Map()
    const upcomingCount = new Map()
    for (const b of bookings) {
      const key = str(b.car_id)
      if (b.start_date <= now && b.end_date >= now) {
        activeCount.set(key, (activeCount.get(key) || 0) + 1)
      } else if (b.start_date > now) {
        upcomingCount.set(key, (upcomingCount.get(key) || 0) + 1)
      }
    }

    res.json({
      cars: visibleCars.map((c) => serializePublicCar(
        c,
        activeCount.get(str(c._id)) || 0,
        upcomingCount.get(str(c._id)) || 0
      )),
    })
  } catch (err) {
    sendError(res, err)
  }
})

// The parts of the document settings the public and staff screens need: the
// signing-stage titles (timeline labels) and the loan rules (date limits).
router.get('/document-settings', async (req, res) => {
  try {
    const s = await getDocSettings()
    res.json({
      stage_titles: s.stage_titles,
      min_notice_days: s.min_notice_days,
      max_advance_days: s.max_advance_days,
      max_duration_days: s.max_duration_days,
      name_prefixes: s.name_prefixes,
    })
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/calendar', async (req, res) => {
  try {
    const rows = await find(collections.bookings, {
      status: { $in: ['pending', 'approved', 'returned'] },
    }, { sort: { start_date: 1 }, projection: WITHOUT_SIGNATURE_IMAGES })

    const carIds = [...new Set(rows.map((b) => str(b.car_id)))]
    const cars = await find(collections.cars, { _id: { $in: carIds.map(toId).filter(Boolean) } })
    const carById = new Map(cars.map((c) => [str(c._id), c]))

    const bookings = rows.map((b) => {
      const car = carById.get(str(b.car_id)) || {}
      return {
        id: str(b._id),
        user_name: b.user_name || '',
        // user_phone deliberately omitted: it is the credential for the public
        // cancel/return/pdf endpoints, and this calendar is readable by anyone.
        user_position: b.user_position || '',
        car_id: str(b.car_id),
        start_date: b.start_date,
        end_date: b.end_date,
        purpose: b.purpose || '',
        destination_place: b.destination_place || '',
        destination_district: b.destination_district || '',
        destination_province: b.destination_province || '',
        attendees: b.attendees || 0,
        self_drive: !!b.self_drive,
        driver_name: b.driver_name || '',
        status: b.status,
        doc_number: b.doc_number || null,
        doc_label: b.doc_label || (b.doc_number ? String(b.doc_number) : null),
        remaining_signers: remainingStages(b.signatures, b.paper_signers),
        created_at: b.created_at,
        brand: car.brand || '',
        model: car.model || '',
        license_plate: car.license_plate || '',
      }
    })

    res.json({ bookings })
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/bookings/lookup', async (req, res) => {
  try {
    const { query } = req.body
    if (!query) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อหรือเบอร์โทรศัพท์' })
    }

    // Search by name/phone directly on the booking — borrowers are not user
    // accounts, so there is no users collection to join against. National ID
    // cards must not be a searchable key here: it would let anyone
    // cross-reference a person's ID against their booking history, and the ID
    // card is also the factor used to cancel/return.
    const escaped = String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const rows = await find(collections.bookings, {
      $or: [
        { user_name: { $regex: escaped, $options: 'i' } },
        { user_phone: query },
      ],
    }, { sort: { created_at: -1 }, projection: WITHOUT_SIGNATURE_IMAGES })

    if (rows.length === 0) {
      return res.json({ bookings: [] })
    }

    const carIds = [...new Set(rows.map((b) => str(b.car_id)))]
    const cars = await find(collections.cars, { _id: { $in: carIds.map(toId).filter(Boolean) } })
    const carById = new Map(cars.map((c) => [str(c._id), c]))

    // Strip internal admin_notes — public lookup must not leak them.
    const bookings = rows.map((b) => {
      const car = carById.get(str(b.car_id)) || {}
      return {
        id: str(b._id),
        user_name: b.user_name || '',
        user_position: b.user_position || '',
        car_id: str(b.car_id),
        start_date: b.start_date,
        end_date: b.end_date,
        purpose: b.purpose || '',
        destination_place: b.destination_place || '',
        destination_district: b.destination_district || '',
        destination_province: b.destination_province || '',
        attendees: b.attendees || 0,
        self_drive: !!b.self_drive,
        driver_name: b.driver_name || '',
        status: b.status,
        doc_number: b.doc_number || null,
        doc_label: b.doc_label || (b.doc_number ? String(b.doc_number) : null),
        remaining_signers: remainingStages(b.signatures, b.paper_signers),
        approval_stage: b.approval_stage || null,
        signatures: publicSignatureProgress(b.signatures),
        // Which stages are signed on paper — keys only, names stay private.
        paper_signers: Object.fromEntries(Object.keys(b.paper_signers || {}).map((key) => [key, ''])),
        created_at: b.created_at,
        brand: car.brand || '',
        model: car.model || '',
        license_plate: car.license_plate || '',
      }
    })

    const names = [...new Set(rows.map((b) => b.user_name).filter(Boolean))]
    res.json({ bookings, users: names.map((name) => ({ name })) })
  } catch (err) {
    sendError(res, err)
  }
})

// Public document fetch for the tracking page. The PDF prints the borrower's
// phone — the same credential that cancels/returns the booking — so it is
// released only to someone who already knows that phone number. A name match
// is NOT enough: the lookup matches name substrings, which anyone can guess.
router.post('/bookings/:id/pdf', async (req, res) => {
  try {
    const { phone } = req.body || {}
    if (!phone) {
      return res.status(400).json({ error: 'กรุณากรอกเบอร์โทรศัพท์' })
    }

    const id = toId(req.params.id)
    const booking = id ? await findOne(collections.bookings, { _id: id }) : null
    if (!booking || !booking.doc_number) return res.status(404).json({ error: 'ไม่พบเอกสาร' })

    if (!booking.user_phone || normalizePhone(booking.user_phone) !== normalizePhone(phone)) {
      return res.status(403).json({ error: 'เบอร์โทรศัพท์ไม่ตรงกับคำขอนี้' })
    }

    const car = await findOne(collections.cars, { _id: booking.car_id })
    const pdfBytes = await renderBookingPdf(booking, car)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="booking-${booking.doc_number}.pdf"`)
    res.send(Buffer.from(pdfBytes))
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/bookings/:id/return', async (req, res) => {
  try {
    const { phone } = req.body
    if (!phone) {
      return res.status(400).json({ error: 'กรุณากรอกเบอร์โทรศัพท์' })
    }

    const id = toId(req.params.id)
    const booking = id ? await findOne(collections.bookings, { _id: id }) : null
    if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' })

    if (booking.status !== 'approved') {
      return res.status(400).json({ error: 'เฉพาะรายการที่อนุมัติแล้วเท่านั้นที่สามารถคืนรถได้' })
    }

    if (!booking.user_phone) {
      return res.status(400).json({ error: 'ไม่พบข้อมูลเบอร์โทรศัพท์ของผู้ยืม' })
    }

    if (normalizePhone(booking.user_phone) !== normalizePhone(phone)) {
      return res.status(403).json({ error: 'เบอร์โทรศัพท์ไม่ถูกต้อง' })
    }

    const car = await findOne(collections.cars, { _id: booking.car_id })

    // The `status: 'approved'` guard makes the transition one-shot: a second
    // request arriving in parallel matches no row.
    const changed = await updateOne(
      collections.bookings,
      { _id: booking._id, status: 'approved' },
      { $set: { status: 'returned', updated_at: new Date() } }
    )
    if (!changed.matchedCount) {
      return res.status(409).json({ error: 'รายการนี้ถูกคืนรถไปแล้ว' })
    }

    await updateMany(
      collections.notifications,
      { related_type: 'booking', related_id: booking._id, type: 'booking_request' },
      { $set: { is_read: true } }
    )

    const admins = await find(collections.users, { role: 'admin' }, { projection: { _id: 1 } })
    if (admins.length) {
      const message = `🔁 ${carText(car)} คืนรถเรียบร้อยแล้ว`
      await insertMany(collections.notifications, admins.map((a) => ({
        user_id: a._id,
        message,
        type: 'returned', related_type: 'booking', related_id: booking._id,
        is_read: false, created_at: new Date(),
      })))
    }

    broadcastToRole('admin', 'data-changed', { action: 'public-return', booking_id: str(booking._id) })

    res.json({ message: 'คืนรถสำเร็จ' })
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/bookings/:id/cancel', async (req, res) => {
  try {
    const { phone } = req.body
    if (!phone) {
      return res.status(400).json({ error: 'กรุณากรอกเบอร์โทรศัพท์' })
    }

    const id = toId(req.params.id)
    const booking = id ? await findOne(collections.bookings, { _id: id }) : null
    if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' })

    if (booking.status !== 'pending') {
      return res.status(400).json({ error: 'เฉพาะรายการที่รออนุมัติเท่านั้นที่สามารถยกเลิกได้' })
    }

    if (!booking.user_phone) {
      return res.status(400).json({ error: 'ไม่พบข้อมูลเบอร์โทรศัพท์ของผู้ยืม' })
    }

    if (normalizePhone(booking.user_phone) !== normalizePhone(phone)) {
      return res.status(403).json({ error: 'เบอร์โทรศัพท์ไม่ถูกต้อง' })
    }

    const car = await findOne(collections.cars, { _id: booking.car_id })

    // Only cancel a booking that is still pending — guards against a race with
    // an admin approving it at the same moment.
    const removed = await deleteOne(collections.bookings, { _id: booking._id, status: 'pending' })
    if (!removed.deletedCount) {
      return res.status(409).json({ error: 'รายการนี้ถูกอนุมัติหรือเปลี่ยนแปลงไปแล้ว' })
    }

    await updateMany(
      collections.notifications,
      { related_type: 'booking', related_id: booking._id, type: { $in: ['booking_request', 'sign_request'] } },
      { $set: { is_read: true } }
    )

    const admins = await find(collections.users, { role: 'admin' }, { projection: { _id: 1 } })
    if (admins.length) {
      const message = `❌ ${carText(car)} ถูกยกเลิกโดยผู้ยืม`
      await insertMany(collections.notifications, admins.map((a) => ({
        user_id: a._id,
        message,
        type: 'cancelled', related_type: 'booking', related_id: booking._id,
        is_read: false, created_at: new Date(),
      })))
    }

    broadcastToRole('admin', 'data-changed', { action: 'cancel', booking_id: str(booking._id) })

    res.json({ message: 'ยกเลิกการจองสำเร็จ' })
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/bookings', async (req, res) => {
  try {
    const {
      name, prefix, phone, position, car_id, start_date, end_date, purpose, signature,
      destination_place, destination_district, destination_province, attendees,
    } = req.body
    // Title (นาย/นาง/นางสาว) folded into the stored display name — see the
    // matching comment in routes/bookings.cjs.
    const borrowerName = joinNamePrefix(prefix, name)
    const borrowerPhone = String(phone || '').trim()
    const borrowerPosition = String(position || '').trim()
    // The phone number doubles as the self-service cancel/return credential,
    // so it has to exist for every booking, not just be nice-to-have.
    if (!borrowerName || !borrowerPhone || !car_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ยืม เบอร์โทรศัพท์ เลือกรถ และวันที่' })
    }
    if (!isValidSignature(signature)) {
      return res.status(400).json({ error: 'กรุณาเซ็นชื่อหรืออัปโหลดรูปลายเซ็นก่อนส่งคำขอยืม' })
    }
    if (!isValidDate(start_date) || !isValidDate(end_date)) {
      return res.status(400).json({ error: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)' })
    }
    if (start_date > end_date) {
      return res.status(400).json({ error: 'วันที่เริ่มต้นต้องมาก่อนวันที่สิ้นสุด' })
    }
    const docSettings = await getDocSettings()
    const ruleError = checkBookingRules(start_date, end_date, docSettings)
    if (ruleError) return res.status(400).json({ error: ruleError })
    // Stages signed on paper are frozen onto the document and skipped in the
    // system chain (api/lib/signing.cjs).
    const paperSigners = await resolvePaperSigners(docSettings)
    const paperKeys = Object.keys(paperSigners)
    const firstStage = currentStage({}, paperKeys)

    const carObjectId = toId(car_id)

    const result = await withLock(`car:${str(car_id)}`, async () => {
      const car = carObjectId ? await findOne(collections.cars, { _id: carObjectId }) : null
      if (!car) throw httpError(404, 'ไม่พบรถยนต์')
      if (car.status !== 'available') {
        throw httpError(400, 'รถยนต์นี้ไม่พร้อมให้เช่า')
      }

      const overlap = await findOne(collections.bookings, {
        car_id: car._id,
        status: { $in: ['approved', 'pending'] },
        start_date: { $lte: end_date },
        end_date: { $gte: start_date },
      })
      if (overlap) {
        throw httpError(409, 'รถยนต์นี้ถูกจองในช่วงวันที่เลือกแล้ว')
      }

      // The borrower is not a user account — their name/phone are stored
      // directly on the booking, and nothing is written to the users
      // collection for them.
      const docNumber = await nextDocNumber()
      const bookingId = await insertOne(collections.bookings, {
        user_id: null,
        user_name: borrowerName,
        user_phone: borrowerPhone,
        user_position: borrowerPosition,
        car_id: car._id,
        start_date,
        end_date,
        purpose: purpose || '',
        destination_place: destination_place || '',
        destination_district: destination_district || '',
        destination_province: destination_province || '',
        attendees: Number(attendees) > 0 ? Number(attendees) : 0,
        self_drive: false,
        driver_id: null,
        driver_name: '',
        status: 'pending',
        admin_notes: '',
        // Document / signature chain — see api/lib/signing.cjs for the fixed
        // five-stage order the staff roles sign in after the requester.
        doc_number: docNumber,
        doc_label: formatDocLabel(docNumber, docSettings),
        approval_stage: firstStage,
        paper_signers: paperSigners,
        signatures: {
          requester: {
            name: borrowerName,
            position: borrowerPosition,
            image: signature,
            signed_at: new Date(),
          },
        },
        created_at: new Date(),
        updated_at: new Date(),
      })

      return { car, bookingId, docLabel: formatDocLabel(docNumber, docSettings) }
    })

    const { car, bookingId, docLabel } = result
    // The first in-system stages can sign straight away — tell their signers.
    try {
      await notifyStageSigners({ _id: bookingId, doc_label: docLabel, user_name: borrowerName }, stagesToNotify(firstStage, paperKeys), car)
    } catch (err) {
      console.error('[notify] new booking:', err && err.message)
    }
    const admins = await find(collections.users, { role: 'admin' }, { projection: { _id: 1 } })
    if (admins.length) {
      const notifMsg = `มีคำขอยืมรถใหม่: ${carText(car)}`
      await insertMany(collections.notifications, admins.map((a) => ({
        user_id: a._id,
        message: notifMsg,
        type: 'booking_request',
        related_type: 'booking',
        related_id: bookingId,
        is_read: false,
        created_at: new Date(),
      })))
    }

    broadcastToRole('admin', 'data-changed', {
      action: 'new-booking',
      booking_id: str(bookingId),
      user_name: borrowerName || 'ผู้ยืม',
      car_brand: car.brand,
      car_model: car.model,
      car_label: carText(car),
    })

    res.status(201).json({ message: 'ส่งคำขอยืมเรียบร้อย' })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
