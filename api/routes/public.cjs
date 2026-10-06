const { Router } = require('express')
const { all, get, insert, run, transaction } = require('../db.cjs')
const { broadcastToRole } = require('../sse.cjs')
const { today, isValidDate } = require('../lib/dates.cjs')
const { httpError, sendError } = require('../lib/http-error.cjs')

const router = Router()

// Public cancel/return authenticate with the borrower's national ID card, which
// is a weak shared secret. We at least normalize the value (strip spaces/dashes)
// before comparing so the check is deterministic. NOTE: fully replacing this
// factor requires a product decision (e.g. per-booking code or OTP).
function normalizeIdCard(value) {
  return String(value || '').replace(/[\s-]/g, '')
}

// Public bookings derive an email from the borrower's name. The same name can
// legitimately appear with a different phone, so make sure the generated email
// never collides with an existing row (which previously caused a 500).
async function uniquePublicEmail(conn, name) {
  const base = (String(name || '').replace(/\s+/g, '').toLowerCase() || 'user').slice(0, 60)
  let email = `${base}@public.carrental`
  let n = 1
  while (await conn.get('SELECT id FROM users WHERE email = ?', [email])) {
    email = `${base}+${n}@public.carrental`
    n++
  }
  return email
}

router.get('/cars', async (req, res) => {
  try {
    const { start_date, end_date } = req.query
    let whereClause = ''
    // `date('now')` was SQLite-only and UTC-based; the local calendar day is
    // bound as a parameter instead (three times, in SELECT-list order).
    const now = today()
    const params = [now, now, now]
    if (start_date && end_date) {
      if (!isValidDate(start_date) || !isValidDate(end_date)) {
        return res.status(400).json({ error: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)' })
      }
      whereClause = `AND c.id NOT IN (
        SELECT b.car_id FROM bookings b
        WHERE b.status IN ('approved', 'pending')
        AND b.start_date <= ? AND b.end_date >= ?
      )`
      params.push(end_date, start_date)
    }
    const cars = await all(`
      SELECT c.*,
        (SELECT COUNT(*) FROM bookings b
         WHERE b.car_id = c.id
         AND b.status IN ('approved', 'pending')
         AND b.start_date <= ?
         AND b.end_date >= ?
        ) as active_booking_count,
        (SELECT COUNT(*) FROM bookings b
         WHERE b.car_id = c.id
         AND b.status IN ('approved', 'pending')
         AND b.start_date > ?
        ) as upcoming_booking_count
      FROM cars c
      WHERE c.status = 'available' ${whereClause}
      ORDER BY c.brand, c.model
    `, params)
    res.json({ cars })
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/users', async (req, res) => {
  try {
    const users = await all("SELECT id, name, phone FROM users WHERE role = 'user' ORDER BY name ASC")
    res.json({ users })
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/calendar', async (req, res) => {
  try {
    const rows = await all(
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
    const users = await all(
      'SELECT id, name, phone FROM users WHERE name LIKE ? OR phone = ?',
      [`%${query}%`, query]
    )

    if (users.length === 0) {
      return res.json({ bookings: [] })
    }

    const ids = users.map(u => u.id)
    const placeholders = ids.map(() => '?').join(',')
    const rows = await all(
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
    sendError(res, err)
  }
})

router.post('/bookings/:id/return', async (req, res) => {
  try {
    const { id_card } = req.body
    if (!id_card) {
      return res.status(400).json({ error: 'กรุณากรอกเลขบัตรประชาชน' })
    }

    const booking = await get('SELECT * FROM bookings WHERE id = ?', [req.params.id])
    if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' })

    if (booking.status !== 'approved') {
      return res.status(400).json({ error: 'เฉพาะรายการที่อนุมัติแล้วเท่านั้นที่สามารถคืนรถได้' })
    }

    const user = await get('SELECT id_card FROM users WHERE id = ?', [booking.user_id])
    if (!user || !user.id_card) {
      return res.status(400).json({ error: 'ไม่พบข้อมูลบัตรประชาชนของผู้ยืม' })
    }

    if (normalizeIdCard(user.id_card) !== normalizeIdCard(id_card)) {
      return res.status(403).json({ error: 'เลขบัตรประชาชนไม่ถูกต้อง' })
    }

    const car = await get('SELECT * FROM cars WHERE id = ?', [booking.car_id])

    // The `AND status = 'approved'` guard makes the transition one-shot: a
    // second request arriving in parallel matches no row.
    const changed = await run(
      "UPDATE bookings SET status = 'returned', updated_at = ? WHERE id = ? AND status = 'approved'",
      [new Date().toISOString(), booking.id]
    )
    if (!changed) {
      return res.status(409).json({ error: 'รายการนี้ถูกคืนรถไปแล้ว' })
    }

    // Mark old booking-request notifications as read
    await run("UPDATE notifications SET is_read = 1 WHERE related_type = 'booking' AND related_id = ? AND type = 'booking_request'", [booking.id])

    // Notify admins
    const admins = await all('SELECT id FROM users WHERE role = ?', ['admin'])
    for (const a of admins) {
      await insert('notifications', {
        user_id: a.id,
        message: `🔁 ${car.brand} ${car.model} (${car.license_plate}) คืนรถเรียบร้อยแล้ว`,
        type: 'returned',
        related_type: 'booking',
        related_id: booking.id
      })
    }

    broadcastToRole('admin', 'data-changed', { action: 'public-return', booking_id: booking.id })

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

    const booking = await get('SELECT * FROM bookings WHERE id = ?', [req.params.id])
    if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' })

    if (booking.status !== 'pending') {
      return res.status(400).json({ error: 'เฉพาะรายการที่รออนุมัติเท่านั้นที่สามารถยกเลิกได้' })
    }

    const user = await get('SELECT id_card FROM users WHERE id = ?', [booking.user_id])
    if (!user || !user.id_card) {
      return res.status(400).json({ error: 'ไม่พบข้อมูลบัตรประชาชนของผู้ยืม' })
    }

    if (normalizeIdCard(user.id_card) !== normalizeIdCard(id_card)) {
      return res.status(403).json({ error: 'เลขบัตรประชาชนไม่ถูกต้อง' })
    }

    const car = await get('SELECT * FROM cars WHERE id = ?', [booking.car_id])

    // Only cancel a booking that is still pending — guards against a race with
    // an admin approving it at the same moment.
    const changed = await run('DELETE FROM bookings WHERE id = ? AND status = ?', [booking.id, 'pending'])
    if (!changed) {
      return res.status(409).json({ error: 'รายการนี้ถูกอนุมัติหรือเปลี่ยนแปลงไปแล้ว' })
    }

    // Mark old booking-request notifications as read
    await run("UPDATE notifications SET is_read = 1 WHERE related_type = 'booking' AND related_id = ? AND type = 'booking_request'", [booking.id])

    // Notify admins about the cancellation
    const admins = await all('SELECT id FROM users WHERE role = ?', ['admin'])
    for (const a of admins) {
      await insert('notifications', {
        user_id: a.id,
        message: `❌ ${car.brand} ${car.model} (${car.license_plate}) ถูกยกเลิกโดยผู้ยืม`,
        type: 'cancelled',
        related_type: 'booking',
        related_id: booking.id
      })
    }

    broadcastToRole('admin', 'data-changed', { action: 'cancel', booking_id: booking.id })

    res.json({ message: 'ยกเลิกการจองสำเร็จ' })
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/bookings', async (req, res) => {
  try {
    const { name, phone, car_id, start_date, end_date, purpose, user_id } = req.body
    if ((!user_id && !name) || !car_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ยืม เลือกรถ และวันที่' })
    }
    if (!isValidDate(start_date) || !isValidDate(end_date)) {
      return res.status(400).json({ error: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)' })
    }
    if (start_date > end_date) {
      return res.status(400).json({ error: 'วันที่เริ่มต้นต้องมาก่อนวันที่สิ้นสุด' })
    }

    const result = await transaction(async (tx) => {
      // Same reasoning as the authenticated route: lock the car so two public
      // submissions for the same car cannot both pass the overlap check.
      await tx.lockRow('cars', car_id)

      const car = await tx.get('SELECT * FROM cars WHERE id = ?', [car_id])
      if (!car) throw httpError(404, 'ไม่พบรถยนต์')
      if (car.status !== 'available') {
        throw httpError(400, 'รถยนต์นี้ไม่พร้อมให้เช่า')
      }

      const overlap = await tx.get(
        `SELECT id FROM bookings WHERE car_id = ? AND status IN ('approved','pending')
         AND start_date <= ? AND end_date >= ?`,
        [car_id, end_date, start_date]
      )
      if (overlap) {
        throw httpError(409, 'รถยนต์นี้ถูกจองในช่วงวันที่เลือกแล้ว')
      }

      let user = null
      if (user_id) {
        user = await tx.get('SELECT id, name, phone FROM users WHERE id = ?', [user_id])
      }
      if (!user) {
        user = phone
          ? await tx.get('SELECT id, name, phone FROM users WHERE name = ? AND phone = ?', [name, phone])
          : await tx.get('SELECT id, name, phone FROM users WHERE name = ?', [name])
      }

      if (!user) {
        const userId = await tx.insert('users', {
          name,
          email: await uniquePublicEmail(tx, name),
          password: '',
          phone: phone || '',
          id_card: req.body.id_card || '',
          role: 'user'
        })
        user = { id: userId, name }
      }

      const bookingId = await tx.insert('bookings', {
        user_id: user.id,
        car_id,
        start_date,
        end_date,
        purpose: purpose || '',
        status: 'pending'
      })

      return { car, user, bookingId }
    })

    const { car, user: borrower, bookingId } = result
    const admins = await all('SELECT id FROM users WHERE role = ?', ['admin'])
    const notifMsg = `มีคำขอยืมรถใหม่: ${car.brand} ${car.model} (${car.license_plate})`
    for (const a of admins) {
      await insert('notifications', {
        user_id: a.id,
        message: notifMsg,
        type: 'booking_request',
        related_type: 'booking',
        related_id: bookingId
      })
    }

    broadcastToRole('admin', 'data-changed', {
      action: 'new-booking',
      booking_id: bookingId,
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
