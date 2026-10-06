const { Router } = require('express')
const bcrypt = require('bcryptjs')
const { all, get, insert, update, run, transaction } = require('../db.cjs')
const { broadcastToRole, broadcastToUser } = require('../sse.cjs')
const { authMiddleware, adminMiddleware } = require('../middleware/auth.cjs')
const { pageParams } = require('../lib/pagination.cjs')
const { httpError, sendError } = require('../lib/http-error.cjs')

const router = Router()

router.use(authMiddleware, adminMiddleware)

// Move a booking to `next` only if it is currently in `expected`. Returns the
// number of rows changed, so two admins clicking at the same moment cannot both
// "succeed" (the loser gets a 409 instead of overwriting the decision).
async function transitionBooking(tx, id, expected, next, extra = {}) {
  const data = { status: next, updated_at: new Date().toISOString(), ...extra }
  const columns = Object.keys(data)
  const sql = `UPDATE bookings SET ${columns.map(c => `${c} = ?`).join(', ')} WHERE id = ? AND status = ?`
  const values = [...columns.map(c => data[c]), id, expected]
  // `tx` (not the module-level `run`) so the statement joins the surrounding
  // transaction and is committed (or rolled back) with the rest of it.
  return tx.run(sql, values)
}

// ─── CARS ───

router.get('/cars', async (req, res) => {
  try {
    const cars = await all('SELECT * FROM cars ORDER BY created_at DESC')
    res.json({ cars })
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

    const existing = await get('SELECT id FROM cars WHERE license_plate = ?', [license_plate])
    if (existing) {
      return res.status(409).json({ error: 'ทะเบียนรถนี้มีในระบบแล้ว' })
    }

    const data = { license_plate, brand, model, color: color || '', year: year || null, seats: seats || 4, status: status || 'available', notes: notes || '' }

    const id = await insert('cars', data)
    const car = await get('SELECT * FROM cars WHERE id = ?', [id])
    res.status(201).json({ car })
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/cars/:id', async (req, res) => {
  try {
    const car = await get('SELECT * FROM cars WHERE id = ?', [req.params.id])
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

    await update('cars', data, 'id', req.params.id)
    const updated = await get('SELECT * FROM cars WHERE id = ?', [req.params.id])
    res.json({ car: updated })
  } catch (err) {
    sendError(res, err)
  }
})

router.delete('/cars/:id', async (req, res) => {
  try {
    const car = await get('SELECT * FROM cars WHERE id = ?', [req.params.id])
    if (!car) return res.status(404).json({ error: 'ไม่พบรถยนต์' })

    const active = await get("SELECT id FROM bookings WHERE car_id = ? AND status IN ('pending','approved')", [req.params.id])
    if (active) {
      return res.status(400).json({ error: 'ไม่สามารถลบรถที่มีการจองค้างอยู่' })
    }

    await run('DELETE FROM cars WHERE id = ?', [req.params.id])
    res.json({ message: 'ลบรถยนต์สำเร็จ' })
  } catch (err) {
    sendError(res, err)
  }
})

// ─── USERS ───

router.get('/users', async (req, res) => {
  try {
    const columns = 'SELECT id, name, email, role, phone, id_card, avatar, created_at FROM users'
    const paging = pageParams(req.query)

    if (!paging) {
      const users = await all(`${columns} ORDER BY created_at DESC`)
      return res.json({ users })
    }

    const totalRow = await get('SELECT COUNT(*) as count FROM users')
    const total = totalRow ? totalRow.count : 0
    const users = await all(
      `${columns} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [paging.limit, paging.offset]
    )
    res.json({ users, total, page: paging.page, limit: paging.limit, pages: Math.max(Math.ceil(total / paging.limit), 1) })
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
    const existing = await get('SELECT id FROM users WHERE email = ?', [email])
    if (existing) return res.status(409).json({ error: 'อีเมลนี้มีในระบบแล้ว' })

    const hashed = await bcrypt.hash(password, 10)
    const id = await insert('users', { name, email, password: hashed, phone: phone || '', id_card: id_card || '', role: role || 'user' })
    const user = await get('SELECT id, name, email, role, phone, id_card, created_at FROM users WHERE id = ?', [id])
    res.status(201).json({ user })
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/users/:id', async (req, res) => {
  try {
    const user = await get('SELECT id, role, token_version FROM users WHERE id = ?', [req.params.id])
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' })

    const { name, email, password, phone, role, id_card } = req.body
    const data = {}
    let bumpToken = false
    if (name) data.name = name
    if (email) {
      const dup = await get('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.params.id])
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
        const adminCount = await get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")
        if (adminCount.count <= 1) {
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

    await update('users', data, 'id', req.params.id)
    const updated = await get('SELECT id, name, email, role, phone, id_card, created_at FROM users WHERE id = ?', [req.params.id])
    res.json({ user: updated })
  } catch (err) {
    sendError(res, err)
  }
})

router.delete('/users/:id', async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'ไม่สามารถลบบัญชีตัวเองได้' })
    }
    const user = await get('SELECT id, role FROM users WHERE id = ?', [req.params.id])
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' })
    if (user.role === 'admin') {
      const adminCount = await get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")
      if (adminCount.count <= 1) {
        return res.status(400).json({ error: 'ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน' })
      }
    }
    await run('DELETE FROM users WHERE id = ?', [req.params.id])
    res.json({ message: 'ลบผู้ใช้สำเร็จ' })
  } catch (err) {
    sendError(res, err)
  }
})

// ─── BOOKINGS (Admin) ───

router.get('/bookings', async (req, res) => {
  try {
    const { status } = req.query

    // Per-status totals power the filter chips without shipping every row.
    const countRows = await all('SELECT status, COUNT(*) as count FROM bookings GROUP BY status')
    const counts = { all: 0, pending: 0, approved: 0, rejected: 0, returned: 0 }
    for (const row of countRows) {
      counts[row.status] = row.count
      counts.all += row.count
    }

    const useStatusFilter = status && status !== 'all'
    const whereSql = useStatusFilter ? ' WHERE b.status = ?' : ''
    const whereParams = useStatusFilter ? [status] : []

    let sql = `SELECT b.*, u.name as user_name, u.email as user_email,
               c.license_plate, c.brand, c.model, c.color
               FROM bookings b
               JOIN users u ON b.user_id = u.id
               JOIN cars c ON b.car_id = c.id${whereSql}
               ORDER BY b.created_at DESC`

    const paging = pageParams(req.query)
    if (!paging) {
      const bookings = await all(sql, whereParams)
      return res.json({ bookings, counts })
    }

    const totalRow = await get(`SELECT COUNT(*) as count FROM bookings b${whereSql}`, whereParams)
    const total = totalRow ? totalRow.count : 0

    sql += ' LIMIT ? OFFSET ?'
    const bookings = await all(sql, [...whereParams, paging.limit, paging.offset])

    res.json({
      bookings,
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
    const booking = await get('SELECT * FROM bookings WHERE id = ?', [req.params.id])
    if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' })
    if (booking.status !== 'pending') return res.status(400).json({ error: 'รายการนี้ไม่รอการอนุมัติ' })

    const car = await get('SELECT * FROM cars WHERE id = ?', [booking.car_id])
    if (!car) return res.status(404).json({ error: 'ไม่พบรถยนต์' })

    await transaction(async (tx) => {
      await tx.lockRow('cars', booking.car_id)

      // Approving must not create a clash with a booking that was approved
      // while this one sat in the queue.
      const clash = await tx.get(
        `SELECT id FROM bookings WHERE car_id = ? AND id != ? AND status = 'approved'
         AND start_date <= ? AND end_date >= ?`,
        [booking.car_id, booking.id, booking.end_date, booking.start_date]
      )
      if (clash) throw httpError(409, 'รถยนต์คันนี้ถูกอนุมัติให้ผู้ยืมรายอื่นในช่วงวันที่นี้แล้ว')

      const changed = await transitionBooking(tx, booking.id, 'pending', 'approved')
      if (!changed) throw httpError(409, 'รายการนี้ถูกดำเนินการไปแล้ว')

      // Mark old booking-request notifications as read
      await tx.run("UPDATE notifications SET is_read = 1 WHERE related_type = 'booking' AND related_id = ? AND type = 'booking_request'", [booking.id])

      await tx.insert('notifications', {
        user_id: booking.user_id,
        message: `✅ อนุมัติการยืม ${car.brand} ${car.model} (${car.license_plate})`,
        type: 'approved',
        related_type: 'booking',
        related_id: booking.id
      })
    })

    broadcastToRole('admin', 'data-changed', { action: 'approve', booking_id: booking.id })
    broadcastToUser(booking.user_id, 'data-changed', { action: 'approve', booking_id: booking.id })

    res.json({ message: 'อนุมัติสำเร็จ' })
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/bookings/:id/reject', async (req, res) => {
  try {
    const { admin_notes } = req.body
    const booking = await get('SELECT * FROM bookings WHERE id = ?', [req.params.id])
    if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' })
    if (booking.status !== 'pending') return res.status(400).json({ error: 'เฉพาะรายการที่รออนุมัติเท่านั้นที่ปฏิเสธได้' })

    const car = await get('SELECT * FROM cars WHERE id = ?', [booking.car_id])

    await transaction(async (tx) => {
      const changed = await transitionBooking(tx, booking.id, 'pending', 'rejected', { admin_notes: admin_notes || '' })
      if (!changed) throw httpError(409, 'รายการนี้ถูกดำเนินการไปแล้ว')

      // Mark old booking-request notifications as read
      await tx.run("UPDATE notifications SET is_read = 1 WHERE related_type = 'booking' AND related_id = ? AND type = 'booking_request'", [booking.id])

      await tx.insert('notifications', {
        user_id: booking.user_id,
        message: `❌ ปฏิเสธการยืม ${car.brand} ${car.model} (${car.license_plate})${admin_notes ? ': ' + admin_notes : ''}`,
        type: 'rejected',
        related_type: 'booking',
        related_id: booking.id
      })
    })

    broadcastToRole('admin', 'data-changed', { action: 'reject', booking_id: booking.id })
    broadcastToUser(booking.user_id, 'data-changed', { action: 'reject', booking_id: booking.id })

    res.json({ message: 'ปฏิเสธสำเร็จ' })
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/bookings/:id/return', async (req, res) => {
  try {
    const booking = await get('SELECT * FROM bookings WHERE id = ?', [req.params.id])
    if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' })
    if (booking.status !== 'approved') return res.status(400).json({ error: 'เฉพาะรายการที่อนุมัติแล้วเท่านั้น' })

    await transaction(async (tx) => {
      const changed = await transitionBooking(tx, booking.id, 'approved', 'returned')
      if (!changed) throw httpError(409, 'รายการนี้ถูกดำเนินการไปแล้ว')

      // Mark old booking-request notifications as read
      await tx.run("UPDATE notifications SET is_read = 1 WHERE related_type = 'booking' AND related_id = ? AND type = 'booking_request'", [booking.id])

      await tx.insert('notifications', {
        user_id: booking.user_id,
        message: `🔁 คืนรถเรียบร้อยแล้ว (Booking #${booking.id})`,
        type: 'returned',
        related_type: 'booking',
        related_id: booking.id
      })
    })

    broadcastToRole('admin', 'data-changed', { action: 'return', booking_id: booking.id })
    broadcastToUser(booking.user_id, 'data-changed', { action: 'return', booking_id: booking.id })

    res.json({ message: 'บันทึกการคืนรถสำเร็จ' })
  } catch (err) {
    sendError(res, err)
  }
})

// ─── REPORTS ───

router.get('/reports', async (req, res) => {
  try {
    const totalCars = await get('SELECT COUNT(*) as count FROM cars')
    const availableCars = await get("SELECT COUNT(*) as count FROM cars WHERE status = 'available'")
    const totalUsers = await get('SELECT COUNT(*) as count FROM users')
    const totalBookings = await get('SELECT COUNT(*) as count FROM bookings')
    const pendingBookings = await get("SELECT COUNT(*) as count FROM bookings WHERE status = 'pending'")
    const approvedBookings = await get("SELECT COUNT(*) as count FROM bookings WHERE status = 'approved'")
    const returnedBookings = await get("SELECT COUNT(*) as count FROM bookings WHERE status = 'returned'")

    const bookingsByCar = await all(
      `SELECT c.id, c.brand, c.model, c.license_plate, COUNT(b.id) as count
       FROM cars c LEFT JOIN bookings b ON c.id = b.car_id
       GROUP BY c.id ORDER BY count DESC`
    )

    // `substr` keeps the month bucket independent of locale/TZ formatting;
    // created_at is stored as 'YYYY-MM-DD HH:MM:SS'.
    const bookingsByMonth = await all(
      `SELECT substr(created_at, 1, 7) as month, COUNT(*) as count
       FROM bookings GROUP BY month ORDER BY month DESC LIMIT 12`
    )

    // Per-status breakdown per month
    const bookingsByMonthDetail = await all(
      `SELECT substr(created_at, 1, 7) as month, status, COUNT(*) as count
       FROM bookings GROUP BY month, status ORDER BY month DESC`
    )

    // Enrich each month with its status breakdown
    const monthDetailMap = {}
    for (const d of bookingsByMonthDetail) {
      if (!monthDetailMap[d.month]) monthDetailMap[d.month] = {}
      monthDetailMap[d.month][d.status] = d.count
    }
    for (const m of bookingsByMonth) {
      m.breakdown = monthDetailMap[m.month] || {}
    }

    const topUsers = await all(
      `SELECT u.id, u.name, u.email, COUNT(b.id) as count
       FROM users u JOIN bookings b ON u.id = b.user_id
       GROUP BY u.id ORDER BY count DESC LIMIT 5`
    )

    res.json({
      stats: {
        totalCars: totalCars.count,
        availableCars: availableCars.count,
        totalUsers: totalUsers.count,
        totalBookings: totalBookings.count,
        pendingBookings: pendingBookings.count,
        approvedBookings: approvedBookings.count,
        returnedBookings: returnedBookings.count
      },
      bookingsByCar,
      bookingsByMonth,
      topUsers
    })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
