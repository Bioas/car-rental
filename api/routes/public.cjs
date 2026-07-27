const { Router } = require('express')
const { all, get, insert, run } = require('../db.cjs')
const { broadcastToRole } = require('../sse.cjs')

const router = Router()

router.get('/cars', (req, res) => {
  try {
    const { start_date, end_date } = req.query
    let whereClause = ''
    let params = []
    if (start_date && end_date) {
      whereClause = `AND c.id NOT IN (
        SELECT b.car_id FROM bookings b
        WHERE b.status IN ('approved', 'pending')
        AND b.start_date <= ? AND b.end_date >= ?
      )`
      params = [end_date, start_date]
    }
    const cars = all(`
      SELECT c.*,
        (SELECT COUNT(*) FROM bookings b
         WHERE b.car_id = c.id
         AND b.status IN ('approved', 'pending')
         AND b.start_date <= date('now')
         AND b.end_date >= date('now')
        ) as active_booking_count,
        (SELECT COUNT(*) FROM bookings b
         WHERE b.car_id = c.id
         AND b.status IN ('approved', 'pending')
         AND b.start_date > date('now')
        ) as upcoming_booking_count
      FROM cars c
      WHERE c.status = 'available' ${whereClause}
      ORDER BY c.brand, c.model
    `, params)
    res.json({ cars })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/users', (req, res) => {
  try {
    const users = all("SELECT id, name, phone FROM users WHERE role = 'user' ORDER BY name ASC")
    res.json({ users })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/calendar', (req, res) => {
  try {
    const rows = all(
      `SELECT b.*, u.name as user_name, c.brand, c.model, c.license_plate
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       JOIN cars c ON b.car_id = c.id
       WHERE b.status IN ('pending', 'approved', 'returned')
       ORDER BY b.start_date ASC`
    )
    // Strip internal admin_notes from the public projection
    const bookings = rows.map(({ admin_notes, ...rest }) => rest)
    res.json({ bookings })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/bookings/lookup', (req, res) => {
  try {
    const { query } = req.body
    if (!query) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อหรือเบอร์โทรศัพท์' })
    }

    let users = all(
      'SELECT id, name, phone FROM users WHERE name LIKE ? OR phone = ? OR id_card = ?',
      [`%${query}%`, query, query]
    )

    if (users.length === 0) {
      return res.json({ bookings: [] })
    }

    const ids = users.map(u => u.id)
    const placeholders = ids.map(() => '?').join(',')
    const rows = all(
      `SELECT b.*, u.name as user_name, c.brand, c.model, c.license_plate
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       JOIN cars c ON b.car_id = c.id
       WHERE b.user_id IN (${placeholders})
       ORDER BY b.created_at DESC`,
      ids
    )

    // Strip internal admin_notes — public lookup must not leak them.
    const bookings = rows.map(({ admin_notes, ...rest }) => rest)

    res.json({ bookings, users })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/bookings/:id/return', async (req, res) => {
  try {
    const { id_card } = req.body
    if (!id_card) {
      return res.status(400).json({ error: 'กรุณากรอกเลขบัตรประชาชน' })
    }

    const booking = get('SELECT * FROM bookings WHERE id = ?', [req.params.id])
    if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' })

    if (booking.status !== 'approved') {
      return res.status(400).json({ error: 'เฉพาะรายการที่อนุมัติแล้วเท่านั้นที่สามารถคืนรถได้' })
    }

    const user = get('SELECT id_card FROM users WHERE id = ?', [booking.user_id])
    if (!user || !user.id_card) {
      return res.status(400).json({ error: 'ไม่พบข้อมูลบัตรประชาชนของผู้ยืม' })
    }

    if (user.id_card !== id_card) {
      return res.status(403).json({ error: 'เลขบัตรประชาชนไม่ถูกต้อง' })
    }

    const car = get('SELECT * FROM cars WHERE id = ?', [booking.car_id])

    update('bookings', {
      status: 'returned',
      updated_at: new Date().toISOString()
    }, 'id', booking.id)

    // Notify admins
    const admins = all('SELECT id FROM users WHERE role = ?', ['admin'])
    admins.forEach(a => {
      insert('notifications', {
        user_id: a.id,
        message: `🔁 ${car.brand} ${car.model} (${car.license_plate}) คืนรถเรียบร้อยแล้ว`,
        type: 'returned',
        related_type: 'booking',
        related_id: booking.id
      })
    })

    broadcastToRole('admin', 'data-changed', { action: 'public-return', booking_id: booking.id })

    res.json({ message: 'คืนรถสำเร็จ' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/bookings/:id/cancel', async (req, res) => {
  try {
    const { id_card } = req.body
    if (!id_card) {
      return res.status(400).json({ error: 'กรุณากรอกเลขบัตรประชาชน' })
    }

    const booking = get('SELECT * FROM bookings WHERE id = ?', [req.params.id])
    if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' })

    if (booking.status !== 'pending') {
      return res.status(400).json({ error: 'เฉพาะรายการที่รออนุมัติเท่านั้นที่สามารถยกเลิกได้' })
    }

    const user = get('SELECT id_card FROM users WHERE id = ?', [booking.user_id])
    if (!user || !user.id_card) {
      return res.status(400).json({ error: 'ไม่พบข้อมูลบัตรประชาชนของผู้ยืม' })
    }

    if (user.id_card !== id_card) {
      return res.status(403).json({ error: 'เลขบัตรประชาชนไม่ถูกต้อง' })
    }

    const car = get('SELECT * FROM cars WHERE id = ?', [booking.car_id])

    // Mark old booking-request notifications as read
    run("UPDATE notifications SET is_read = 1 WHERE related_type = 'booking' AND related_id = ? AND type = 'booking_request'", [booking.id])

    // Notify admins about the cancellation
    const admins = all('SELECT id FROM users WHERE role = ?', ['admin'])
    admins.forEach(a => {
      insert('notifications', {
        user_id: a.id,
        message: `❌ ${car.brand} ${car.model} (${car.license_plate}) ถูกยกเลิกโดยผู้ยืม`,
        type: 'cancelled',
        related_type: 'booking',
        related_id: booking.id
      })
    })

    // Delete the booking record entirely
    run('DELETE FROM bookings WHERE id = ?', [booking.id])

    broadcastToRole('admin', 'data-changed', { action: 'cancel', booking_id: booking.id })

    res.json({ message: 'ยกเลิกการจองสำเร็จ' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/bookings', async (req, res) => {
  try {
    const { name, phone, car_id, start_date, end_date, purpose, user_id } = req.body
    if ((!user_id && !name) || !car_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ยืม เลือกรถ และวันที่' })
    }
    if (start_date > end_date) {
      return res.status(400).json({ error: 'วันที่เริ่มต้นต้องมาก่อนวันที่สิ้นสุด' })
    }

    const car = get('SELECT * FROM cars WHERE id = ?', [car_id])
    if (!car) return res.status(404).json({ error: 'ไม่พบรถยนต์' })
    if (car.status !== 'available') {
      return res.status(400).json({ error: 'รถยนต์นี้ไม่พร้อมให้เช่า' })
    }

    const overlap = get(
      `SELECT id FROM bookings WHERE car_id = ? AND status IN ('approved','pending')
       AND start_date <= ? AND end_date >= ?`,
      [car_id, end_date, start_date]
    )
    if (overlap) {
      return res.status(409).json({ error: 'รถยนต์นี้ถูกจองในช่วงวันที่เลือกแล้ว' })
    }

    let user = null
    if (user_id) {
      user = get('SELECT id, name, phone FROM users WHERE id = ?', [user_id])
    }
    if (!user) {
      user = phone
        ? get('SELECT id FROM users WHERE name = ? AND phone = ?', [name, phone])
        : get('SELECT id FROM users WHERE name = ?', [name])
    }

    if (!user) {
      const cleanName = name.replace(/\s+/g, '').toLowerCase()
      const userId = insert('users', {
        name,
        email: `${cleanName}@public.carrental`,
        password: '',
        phone: phone || '',
        id_card: req.body.id_card || '',
        role: 'user'
      })
      user = { id: userId }
    }

    const bookingId = insert('bookings', {
      user_id: user.id,
      car_id,
      start_date,
      end_date,
      purpose: purpose || '',
      status: 'pending'
    })

    const admins = all('SELECT id FROM users WHERE role = ?', ['admin'])
    const notifMsg = `มีคำขอยืมรถใหม่: ${car.brand} ${car.model} (${car.license_plate})`
    admins.forEach(a => {
      insert('notifications', {
        user_id: a.id,
        message: notifMsg,
        type: 'booking_request',
        related_type: 'booking',
        related_id: bookingId
      })
    })

    broadcastToRole('admin', 'data-changed', {
      action: 'new-booking',
      booking_id: bookingId,
      user_name: user?.name || name || 'ผู้ยืม',
      car_brand: car.brand,
      car_model: car.model,
    })

    res.status(201).json({ message: 'ส่งคำขอยืมเรียบร้อย' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
