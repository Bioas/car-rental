const { Router } = require('express')
const { collections, find, findOne, insertOne, insertMany, toId, str, withLock } = require('../db.cjs')
const { authMiddleware } = require('../middleware/auth.cjs')
const { isValidDate } = require('../lib/dates.cjs')
const { httpError, sendError } = require('../lib/http-error.cjs')

const router = Router()

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

router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      car_id, start_date, end_date, purpose, user_id,
      destination_place, destination_district, destination_province, attendees,
    } = req.body
    if (!car_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'กรุณาเลือกรถและวันที่' })
    }

    if (!isValidDate(start_date) || !isValidDate(end_date)) {
      return res.status(400).json({ error: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)' })
    }
    if (start_date > end_date) {
      return res.status(400).json({ error: 'วันที่เริ่มต้นต้องมาก่อนวันที่สิ้นสุด' })
    }

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

      const finalUserId = (req.user.role === 'admin' && user_id) ? toId(user_id) : toId(req.user.id)
      const borrower = finalUserId ? await findOne(collections.users, { _id: finalUserId }) : null
      if (!borrower) throw httpError(400, 'ไม่พบผู้ใช้ที่เลือก')

      const bookingId = await insertOne(collections.bookings, {
        user_id: borrower._id,
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
        const message = `มีคำขอยืมรถใหม่: ${car.brand} ${car.model} (${car.license_plate})`
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

    res.status(201).json({
      booking: {
        id: str(booking._id),
        user_id: str(booking.user_id),
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
    }, { sort: { start_date: 1 } })

    const userIds = [...new Set(bookings.map((b) => str(b.user_id)))]
    const carIds = [...new Set(bookings.map((b) => str(b.car_id)))]
    const [users, cars] = await Promise.all([
      find(collections.users, { _id: { $in: userIds.map(toId).filter(Boolean) } }),
      find(collections.cars, { _id: { $in: carIds.map(toId).filter(Boolean) } }),
    ])
    const nameById = new Map(users.map((u) => [str(u._id), u.name]))
    const carById = new Map(cars.map((c) => [str(c._id), c]))

    res.json({
      bookings: bookings.map((b) => {
        const car = carById.get(str(b.car_id)) || {}
        return {
          id: str(b._id),
          user_id: str(b.user_id),
          user_name: nameById.get(str(b.user_id)) || '',
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

module.exports = router
