const { Router } = require('express')
const { collections, find, findOne, insertOne, insertMany, toId, str, withLock } = require('../db.cjs')
const { authMiddleware, bookingManagerMiddleware } = require('../middleware/auth.cjs')
const { isValidDate } = require('../lib/dates.cjs')
const { httpError, sendError } = require('../lib/http-error.cjs')
const { nextDocNumber } = require('../lib/doc-number.cjs')
const { remainingStages, currentStage, stagesToNotify, WITHOUT_SIGNATURE_IMAGES } = require('../lib/signing.cjs')
const { resolvePaperSigners } = require('../lib/paper-signers.cjs')
const { renderBookingPdf } = require('../lib/pdf.cjs')
const { getDocSettings, formatDocLabel, checkBookingRules } = require('../lib/doc-settings.cjs')
const { carText, notifyStageSigners } = require('../lib/notify.cjs')
const { joinNamePrefix } = require('../lib/names.cjs')

const router = Router()

const MAX_SIGNATURE_LENGTH = 500_000
function isValidSignature(value) {
  return typeof value === 'string' && value.startsWith('data:image/') && value.length <= MAX_SIGNATURE_LENGTH
}

/**
 * Find a booking for the same car whose range overlaps [start_date, end_date].
 * Ranges are stored as plain `YYYY-MM-DD` strings, which compare correctly.
 */
function overlapFilter(carId, start_date, end_date, extra = {}) {
  return {
    car_id: carId,
    status: { $in: ['approved', 'pending'] },
    start_date: { $lte: end_date },
    end_date: { $gte: start_date },
    ...extra,
  }
}

router.post('/', authMiddleware, bookingManagerMiddleware, async (req, res) => {
  try {
    const {
      car_id, start_date, end_date, purpose, name, prefix, phone, position, signature,
      destination_place, destination_district, destination_province, attendees,
    } = req.body
    // The title (นาย/นาง/นางสาว) is folded into the stored display name so
    // every existing surface — list, calendar, lookup, PDF — shows the full
    // "นายสมชาย ใจดี" form without a schema change.
    const borrowerName = joinNamePrefix(prefix, name)
    const borrowerPhone = String(phone || '').trim()
    const borrowerPosition = String(position || '').trim()
    // The phone number doubles as the self-service cancel/return credential,
    // so it has to exist for every booking, not just be nice-to-have.
    if (!borrowerName || !borrowerPhone || !car_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ยืม เบอร์โทรศัพท์ เลือกรถ และวันที่' })
    }
    // Unlike the public self-service form, an admin filling this in on the
    // borrower's behalf may not have a captured signature yet — that still
    // gets collected before the document reaches the staff sign queue, so
    // it's optional here but validated when present.
    if (signature !== undefined && signature !== null && signature !== '' && !isValidSignature(signature)) {
      return res.status(400).json({ error: 'รูปลายเซ็นไม่ถูกต้อง' })
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

    // The overlap check is a read-then-write. Serialize bookings for the same
    // car so two requests arriving at the same instant cannot both pass the
    // check and double-book.
    const { booking, car } = await withLock(`car:${str(car_id)}`, async () => {
      const car = carObjectId ? await findOne(collections.cars, { _id: carObjectId }) : null
      if (!car) throw httpError(404, 'ไม่พบรถยนต์')
      if (car.status !== 'available') {
        throw httpError(400, 'รถยนต์นี้ไม่พร้อมให้เช่า')
      }

      const overlap = await findOne(collections.bookings, overlapFilter(car._id, start_date, end_date))
      if (overlap) {
        throw httpError(409, 'รถยนต์นี้ถูกจองในช่วงวันที่เลือกแล้ว')
      }

      const docNumber = await nextDocNumber()

      // The borrower is not a user account — their name/phone are stored
      // directly on the booking, same as a public booking request.
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
        signatures: signature
          ? {
              requester: {
                name: borrowerName,
                position: borrowerPosition,
                image: signature,
                signed_at: new Date(),
              },
            }
          : {},
        created_at: new Date(),
        updated_at: new Date(),
      })

      const booking = await findOne(collections.bookings, { _id: bookingId })
      return { booking, car }
    })

    // Notifications are a side effect of a stored booking; a failure here must
    // not fail the booking request.
    try {
      const admins = await find(collections.users, { role: 'admin' }, { projection: { _id: 1 } })
      if (admins.length) {
        const message = `มีคำขอยืมรถใหม่: ${carText(car)}`
        await insertMany(collections.notifications, admins.map((a) => ({
          user_id: a._id,
          message,
          type: 'booking_request',
          related_type: 'booking',
          related_id: booking._id,
          is_read: false,
          created_at: new Date(),
        })))
      }
    } catch (err) {
      console.error('[bookings] notify admins failed:', err.message)
    }
    // The first in-system stages can sign straight away — tell their signers.
    try {
      await notifyStageSigners(booking, stagesToNotify(firstStage, paperKeys), car)
    } catch (err) {
      console.error('[notify] new booking:', err && err.message)
    }

    res.status(201).json({
      booking: {
        id: str(booking._id),
        user_name: booking.user_name || '',
        user_phone: booking.user_phone || '',
        user_position: booking.user_position || '',
        car_id: str(booking.car_id),
        start_date: booking.start_date,
        end_date: booking.end_date,
        purpose: booking.purpose || '',
        destination_place: booking.destination_place || '',
        destination_district: booking.destination_district || '',
        destination_province: booking.destination_province || '',
        attendees: booking.attendees || 0,
        status: booking.status,
        admin_notes: booking.admin_notes || '',
        doc_number: booking.doc_number || null,
        doc_label: booking.doc_label || (booking.doc_number ? String(booking.doc_number) : null),
        remaining_signers: remainingStages(booking.signatures, booking.paper_signers),
        created_at: booking.created_at,
        license_plate: car.license_plate,
        brand: car.brand,
        model: car.model,
      },
    })
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/calendar', authMiddleware, async (req, res) => {
  try {
    const bookings = await find(collections.bookings, {
      status: { $in: ['pending', 'approved', 'returned'] },
    }, { sort: { start_date: 1 }, projection: WITHOUT_SIGNATURE_IMAGES })

    const carIds = [...new Set(bookings.map((b) => str(b.car_id)))]
    const cars = await find(collections.cars, { _id: { $in: carIds.map(toId).filter(Boolean) } })
    const carById = new Map(cars.map((c) => [str(c._id), c]))

    res.json({
      bookings: bookings.map((b) => {
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
          admin_notes: b.admin_notes || '',
          doc_number: b.doc_number || null,
          doc_label: b.doc_label || (b.doc_number ? String(b.doc_number) : null),
          approval_stage: b.approval_stage || null,
          remaining_signers: remainingStages(b.signatures, b.paper_signers),
          // The full signature chain (name/position/timestamp/decision per
          // stage) is only meaningful to staff reviewing a document — this
          // authed admin route is the one place it is exposed; the public
          // lookup only gets per-stage signed_at/decision (no images/names).
          signatures: b.signatures || {},
          paper_signers: b.paper_signers || {},
          created_at: b.created_at,
          license_plate: car.license_plate || '',
          brand: car.brand || '',
          model: car.model || '',
        }
      }),
    })
  } catch (err) {
    sendError(res, err)
  }
})

// Renders the loan-request document as a PDF — any authenticated user may
// fetch it (drivers aside, everyone who can reach the booking detail modal
// is either the admin or a staff signer; there is nothing in the PDF that
// isn't already visible in that modal to those roles).
router.get('/:id/pdf', authMiddleware, async (req, res) => {
  try {
    const id = toId(req.params.id)
    const booking = id ? await findOne(collections.bookings, { _id: id }) : null
    if (!booking || !booking.doc_number) return res.status(404).json({ error: 'ไม่พบเอกสาร' })

    const car = await findOne(collections.cars, { _id: booking.car_id })
    const pdfBytes = await renderBookingPdf(booking, car)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="booking-${booking.doc_number}.pdf"`)
    res.send(Buffer.from(pdfBytes))
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
