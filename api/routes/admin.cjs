const { Router } = require('express')
const bcrypt = require('bcryptjs')
const {
  collections, find, findOne, insertOne, updateOne, updateMany,
  deleteOne, countDocuments, aggregate, toId, str,
} = require('../db.cjs')
const { broadcastToRole, broadcastToUser } = require('../sse.cjs')
const { authMiddleware, adminMiddleware } = require('../middleware/auth.cjs')
const { pageParams } = require('../lib/pagination.cjs')
const { sendError } = require('../lib/http-error.cjs')

const router = Router()

router.use(authMiddleware, adminMiddleware)

function serializeCar(car) {
  return {
    id: str(car._id),
    license_plate: car.license_plate,
    brand: car.brand,
    model: car.model,
    color: car.color,
    year: car.year,
    seats: car.seats,
    status: car.status,
    notes: car.notes || '',
    created_at: car.created_at,
  }
}

function serializeBooking(b, extras = {}) {
  return {
    id: str(b._id),
    user_id: str(b.user_id),
    car_id: str(b.car_id),
    start_date: b.start_date,
    end_date: b.end_date,
    purpose: b.purpose || '',
    status: b.status,
    admin_notes: b.admin_notes || '',
    created_at: b.created_at,
    updated_at: b.updated_at,
    ...extras,
  }
}

function publicUser(u) {
  return {
    id: str(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    phone: u.phone || '',
    id_card: u.id_card || '',
    avatar: u.avatar || '',
    created_at: u.created_at,
  }
}

/** Attach user and car fields to a list of bookings (small in-memory join). */
async function enrichBookings(bookings) {
  const userIds = [...new Set(bookings.map((b) => str(b.user_id)))]
  const carIds = [...new Set(bookings.map((b) => str(b.car_id)))]
  const [users, cars] = await Promise.all([
    find(collections.users, { _id: { $in: userIds.map(toId).filter(Boolean) } }),
    find(collections.cars, { _id: { $in: carIds.map(toId).filter(Boolean) } }),
  ])
  const userById = new Map(users.map((u) => [str(u._id), u]))
  const carById = new Map(cars.map((c) => [str(c._id), c]))

  return bookings.map((b) => {
    const u = userById.get(str(b.user_id)) || {}
    const c = carById.get(str(b.car_id)) || {}
    return serializeBooking(b, {
      user_name: u.name || '',
      user_email: u.email || '',
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
    const { license_plate, brand, model, color, year, seats, status, notes } = req.body
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
        license_plate, brand, model, color: color || '', year: year || null,
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

    const { license_plate, brand, model, color, year, seats, status, notes } = req.body
    const data = {}
    if (license_plate) data.license_plate = license_plate
    if (brand) data.brand = brand
    if (model) data.model = model
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
      const users = await find(collections.users, {}, { sort: { created_at: -1 } })
      return res.json({ users: users.map(publicUser) })
    }

    const total = await countDocuments(collections.users, {})
    const users = await find(collections.users, {}, { sort: { created_at: -1 }, skip: paging.offset, limit: paging.limit })
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

router.post('/users', async (req, res) => {
  try {
    let { name, email, password, phone, role, id_card } = req.body
    if (!name || !email) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อและอีเมล' })
    }
    if (role && !['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'role ไม่ถูกต้อง' })
    }
    if (role === 'admin' && !password) {
      return res.status(400).json({ error: 'กรุณากรอกรหัสผ่านสำหรับผู้ดูแล' })
    }
    if (role === 'admin' && String(password).length < 6) {
      return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' })
    }
    if (!role || role === 'user') {
      if (!password) password = ''
    }
    const existing = await findOne(collections.users, { email })
    if (existing) return res.status(409).json({ error: 'อีเมลนี้มีในระบบแล้ว' })

    const hashed = await bcrypt.hash(password, 10)
    const id = await insertOne(collections.users, {
      name, email, password: hashed, phone: phone || '', id_card: id_card || '',
      avatar: '', role: role || 'user', token_version: 0, created_at: new Date(),
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

    const { name, email, password, phone, role, id_card } = req.body
    const data = {}
    let bumpToken = false
    if (name) data.name = name
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
      if (!['admin', 'user'].includes(role)) {
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

router.get('/bookings', async (req, res) => {
  try {
    const { status } = req.query
    const useStatusFilter = status && status !== 'all'
    const filter = useStatusFilter ? { status } : {}
    const paging = pageParams(req.query)
    const findOptions = { sort: { created_at: -1 } }
    if (paging) {
      findOptions.skip = paging.offset
      findOptions.limit = paging.limit
    }

    // Per-status totals power the filter chips without shipping every row.
    // The three queries below are independent, so they run together.
    const [countRows, rows, total] = await Promise.all([
      aggregate(collections.bookings, [
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      find(collections.bookings, filter, findOptions),
      paging ? countDocuments(collections.bookings, filter) : Promise.resolve(null),
    ])

    const counts = { all: 0, pending: 0, approved: 0, rejected: 0, returned: 0 }
    for (const row of countRows) {
      counts[row._id] = row.count
      counts.all += row.count
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

router.put('/bookings/:id/approve', async (req, res) => {
  try {
    const id = toId(req.params.id)
    const booking = id ? await findOne(collections.bookings, { _id: id }) : null
    if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' })
    if (booking.status !== 'pending') return res.status(400).json({ error: 'รายการนี้ไม่รอการอนุมัติ' })

    const car = await findOne(collections.cars, { _id: booking.car_id })
    if (!car) return res.status(404).json({ error: 'ไม่พบรถยนต์' })

    // Approving must not create a clash with a booking that was approved while
    // this one sat in the queue.
    const clash = await findOne(collections.bookings, {
      car_id: booking.car_id,
      status: 'approved',
      _id: { $ne: booking._id },
      start_date: { $lte: booking.end_date },
      end_date: { $gte: booking.start_date },
    })
    if (clash) return res.status(409).json({ error: 'รถยนต์คันนี้ถูกอนุมัติให้ผู้ยืมรายอื่นในช่วงวันที่นี้แล้ว' })

    // Guard the transition so a second admin clicking at the same moment fails.
    const changed = await updateOne(
      collections.bookings,
      { _id: booking._id, status: 'pending' },
      { $set: { status: 'approved', updated_at: new Date() } }
    )
    if (!changed.matchedCount) return res.status(409).json({ error: 'รายการนี้ถูกดำเนินการไปแล้ว' })

    await clearRequestNotifications(booking._id)
    await insertOne(collections.notifications, {
      user_id: booking.user_id,
      message: `✅ อนุมัติการยืม ${car.brand} ${car.model} (${car.license_plate})`,
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

router.put('/bookings/:id/reject', async (req, res) => {
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
    await insertOne(collections.notifications, {
      user_id: booking.user_id,
      message: `❌ ปฏิเสธการยืม ${car ? car.brand : ''} ${car ? car.model : ''} (${car ? car.license_plate : ''})${admin_notes ? ': ' + admin_notes : ''}`,
      type: 'rejected', related_type: 'booking', related_id: booking._id,
      is_read: false, created_at: new Date(),
    })

    broadcastToRole('admin', 'data-changed', { action: 'reject', booking_id: str(booking._id) })
    broadcastToUser(str(booking.user_id), 'data-changed', { action: 'reject', booking_id: str(booking._id) })

    res.json({ message: 'ปฏิเสธสำเร็จ' })
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/bookings/:id/return', async (req, res) => {
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
      find(collections.users, {}, { projection: { name: 1, email: 1 } }),
      find(collections.bookings, {}, {
        projection: { car_id: 1, user_id: 1, status: 1, created_at: 1, start_date: 1, end_date: 1 },
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

    const userById = new Map(users.map((u) => [str(u._id), u]))
    const bookingCountByUser = new Map()
    for (const b of bookings) {
      const key = str(b.user_id)
      bookingCountByUser.set(key, (bookingCountByUser.get(key) || 0) + 1)
    }
    const topUsers = [...bookingCountByUser.entries()]
      .map(([userId, count]) => {
        const u = userById.get(userId) || {}
        return { id: userId, name: u.name || '', email: u.email || '', count }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    res.json({ stats, bookingsByCar, bookingsByMonth, topUsers })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
