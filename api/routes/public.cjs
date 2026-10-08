const { Router } = require('express')
const {
  collections, find, findOne, insertOne, insertMany, updateOne, updateMany,
  deleteOne, toId, str, withLock,
} = require('../db.cjs')
const { broadcastToRole } = require('../sse.cjs')
const { today, isValidDate } = require('../lib/dates.cjs')
const { httpError, sendError } = require('../lib/http-error.cjs')

const router = Router()

// Public cancel/return authenticate with the borrower's national ID card, which
// is a weak shared secret. We at least normalize the value (strip spaces/dashes)
// before comparing so the check is deterministic.
function normalizeIdCard(value) {
  return String(value || '').replace(/[\s-]/g, '')
}

// Public bookings derive an email from the borrower's name. The same name can
// legitimately appear with a different phone, so make sure the generated email
// never collides with an existing row (which previously caused a 500).
async function uniquePublicEmail(name) {
  const base = (String(name || '').replace(/\s+/g, '').toLowerCase() || 'user').slice(0, 60)
  let email = `${base}@public.carrental`
  let n = 1
  while (await findOne(collections.users, { email })) {
    email = `${base}+${n}@public.carrental`
    n++
  }
  return email
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

router.get('/users', async (req, res) => {
  try {
    const users = await find(collections.users, { role: 'user' }, { sort: { name: 1 } })
    res.json({ users: users.map((u) => ({ id: str(u._id), name: u.name, phone: u.phone || '' })) })
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/calendar', async (req, res) => {
  try {
    const rows = await find(collections.bookings, {
      status: { $in: ['pending', 'approved', 'returned'] },
    }, { sort: { start_date: 1 } })

    const userIds = [...new Set(rows.map((b) => str(b.user_id)))]
    const carIds = [...new Set(rows.map((b) => str(b.car_id)))]
    const [users, cars] = await Promise.all([
      find(collections.users, { _id: { $in: userIds.map(toId).filter(Boolean) } }),
      find(collections.cars, { _id: { $in: carIds.map(toId).filter(Boolean) } }),
    ])
    const nameById = new Map(users.map((u) => [str(u._id), u.name]))
    const carById = new Map(cars.map((c) => [str(c._id), c]))

    const bookings = rows.map((b) => {
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

    // Search by name/phone only. National ID cards must not be a searchable key
    // here: it would let anyone cross-reference a person's ID against their
    // booking history, and the ID card is also the factor used to cancel/return.
    const escaped = String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const users = await find(collections.users, {
      $or: [
        { name: { $regex: escaped, $options: 'i' } },
        { phone: query },
      ],
    })

    if (users.length === 0) {
      return res.json({ bookings: [] })
    }

    const ids = users.map((u) => u._id)
    const rows = await find(collections.bookings, { user_id: { $in: ids } }, { sort: { created_at: -1 } })

    const userById = new Map(users.map((u) => [str(u._id), u]))
    const carIds = [...new Set(rows.map((b) => str(b.car_id)))]
    const cars = await find(collections.cars, { _id: { $in: carIds.map(toId).filter(Boolean) } })
    const carById = new Map(cars.map((c) => [str(c._id), c]))

    // Strip internal admin_notes — public lookup must not leak them.
    const bookings = rows.map((b) => {
      const car = carById.get(str(b.car_id)) || {}
      const u = userById.get(str(b.user_id)) || {}
      return {
        id: str(b._id),
        user_id: str(b.user_id),
        user_name: u.name || '',
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
        created_at: b.created_at,
        brand: car.brand || '',
        model: car.model || '',
        license_plate: car.license_plate || '',
      }
    })

    res.json({ bookings, users: users.map((u) => ({ id: str(u._id), name: u.name, phone: u.phone || '' })) })
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/bookings/:id/return', async (req, res) => {
  try {
    const { id_card } = req.body
    if (!id_card) {
      return res.status(400).json({ error: 'กรุณากรอกเลขบัตรประชาชน' })
    }

    const id = toId(req.params.id)
    const booking = id ? await findOne(collections.bookings, { _id: id }) : null
    if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' })

    if (booking.status !== 'approved') {
      return res.status(400).json({ error: 'เฉพาะรายการที่อนุมัติแล้วเท่านั้นที่สามารถคืนรถได้' })
    }

    const user = await findOne(collections.users, { _id: booking.user_id })
    if (!user || !user.id_card) {
      return res.status(400).json({ error: 'ไม่พบข้อมูลบัตรประชาชนของผู้ยืม' })
    }

    if (normalizeIdCard(user.id_card) !== normalizeIdCard(id_card)) {
      return res.status(403).json({ error: 'เลขบัตรประชาชนไม่ถูกต้อง' })
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
      const message = `🔁 ${car ? car.brand : ''} ${car ? car.model : ''} (${car ? car.license_plate : ''}) คืนรถเรียบร้อยแล้ว`
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
    const { id_card } = req.body
    if (!id_card) {
      return res.status(400).json({ error: 'กรุณากรอกเลขบัตรประชาชน' })
    }

    const id = toId(req.params.id)
    const booking = id ? await findOne(collections.bookings, { _id: id }) : null
    if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' })

    if (booking.status !== 'pending') {
      return res.status(400).json({ error: 'เฉพาะรายการที่รออนุมัติเท่านั้นที่สามารถยกเลิกได้' })
    }

    const user = await findOne(collections.users, { _id: booking.user_id })
    if (!user || !user.id_card) {
      return res.status(400).json({ error: 'ไม่พบข้อมูลบัตรประชาชนของผู้ยืม' })
    }

    if (normalizeIdCard(user.id_card) !== normalizeIdCard(id_card)) {
      return res.status(403).json({ error: 'เลขบัตรประชาชนไม่ถูกต้อง' })
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
      { related_type: 'booking', related_id: booking._id, type: 'booking_request' },
      { $set: { is_read: true } }
    )

    const admins = await find(collections.users, { role: 'admin' }, { projection: { _id: 1 } })
    if (admins.length) {
      const message = `❌ ${car ? car.brand : ''} ${car ? car.model : ''} (${car ? car.license_plate : ''}) ถูกยกเลิกโดยผู้ยืม`
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
      name, phone, car_id, start_date, end_date, purpose, user_id,
      destination_place, destination_district, destination_province, attendees,
    } = req.body
    if ((!user_id && !name) || !car_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ยืม เลือกรถ และวันที่' })
    }
    if (!isValidDate(start_date) || !isValidDate(end_date)) {
      return res.status(400).json({ error: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)' })
    }
    if (start_date > end_date) {
      return res.status(400).json({ error: 'วันที่เริ่มต้นต้องมาก่อนวันที่สิ้นสุด' })
    }

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

      let borrower = null
      if (user_id) {
        const uid = toId(user_id)
        borrower = uid ? await findOne(collections.users, { _id: uid }) : null
      }
      if (!borrower) {
        borrower = phone
          ? await findOne(collections.users, { name, phone })
          : await findOne(collections.users, { name })
      }

      if (!borrower) {
        const userId = await insertOne(collections.users, {
          name,
          email: await uniquePublicEmail(name),
          password: '',
          phone: phone || '',
          id_card: req.body.id_card || '',
          avatar: '',
          role: 'user',
          token_version: 0,
          created_at: new Date(),
        })
        borrower = { _id: userId, name }
      }

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

      return { car, borrower, bookingId }
    })

    const { car, borrower, bookingId } = result
    const admins = await find(collections.users, { role: 'admin' }, { projection: { _id: 1 } })
    if (admins.length) {
      const notifMsg = `มีคำขอยืมรถใหม่: ${car.brand} ${car.model} (${car.license_plate})`
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
      user_name: (borrower && borrower.name) || name || 'ผู้ยืม',
      car_brand: car.brand,
      car_model: car.model,
    })

    res.status(201).json({ message: 'ส่งคำขอยืมเรียบร้อย' })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
