const { Router } = require('express')
const { collections, find, findOne, toId, str } = require('../db.cjs')
const { authMiddleware } = require('../middleware/auth.cjs')
const { today } = require('../lib/dates.cjs')
const { sendError } = require('../lib/http-error.cjs')

const router = Router()

function serializeCar(car, hasActiveBooking) {
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
    has_active_booking: hasActiveBooking ? 1 : 0,
  }
}

/** Set of car ids (as strings) that have a booking not yet ended. */
async function activeCarIds(now) {
  const rows = await find(collections.bookings, {
    status: { $in: ['pending', 'approved'] },
    end_date: { $gte: now },
  }, { projection: { car_id: 1 } })
  return new Set(rows.map((r) => str(r.car_id)))
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, q } = req.query
    const now = today()

    const filter = {}
    if (status && status !== 'available') filter.status = status
    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ brand: rx }, { model: rx }, { license_plate: rx }]
    }

    const active = await activeCarIds(now)
    let cars = await find(collections.cars, filter, { sort: { created_at: -1 } })

    // `status=available` means "bookable right now": available and not booked
    // for a range that has not ended yet.
    if (status === 'available') {
      cars = cars.filter((c) => c.status === 'available' && !active.has(str(c._id)))
    }

    res.json({ cars: cars.map((c) => serializeCar(c, active.has(str(c._id)))) })
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const id = toId(req.params.id)
    const car = id ? await findOne(collections.cars, { _id: id }) : null
    if (!car) return res.status(404).json({ error: 'ไม่พบรถยนต์' })

    const bookings = await find(collections.bookings, {
      car_id: car._id,
      status: { $in: ['approved', 'pending'] },
      end_date: { $gte: today() },
    }, { sort: { start_date: 1 } })

    const userIds = [...new Set(bookings.map((b) => str(b.user_id)))]
    const users = await find(collections.users, { _id: { $in: userIds.map(toId).filter(Boolean) } })
    const nameById = new Map(users.map((u) => [str(u._id), u.name]))

    const activeBookings = bookings.map((b) => ({
      id: str(b._id),
      user_id: str(b.user_id),
      user_name: nameById.get(str(b.user_id)) || '',
      car_id: str(b.car_id),
      start_date: b.start_date,
      end_date: b.end_date,
      purpose: b.purpose || '',
      status: b.status,
      admin_notes: b.admin_notes || '',
      created_at: b.created_at,
    }))

    res.json({ car: serializeCar(car, activeBookings.length > 0), activeBookings })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
