const { Router } = require('express')
const { all, insert, transaction } = require('../db.cjs')
const { authMiddleware } = require('../middleware/auth.cjs')
const { isValidDate } = require('../lib/dates.cjs')
const { httpError, sendError } = require('../lib/http-error.cjs')

const router = Router()

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { car_id, start_date, end_date, purpose, user_id } = req.body
    if (!car_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'กรุณาเลือกรถและวันที่' })
    }

    if (!isValidDate(start_date) || !isValidDate(end_date)) {
      return res.status(400).json({ error: 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)' })
    }
    if (start_date > end_date) {
      return res.status(400).json({ error: 'วันที่เริ่มต้นต้องมาก่อนวันที่สิ้นสุด' })
    }

    const { booking, car } = await transaction(async (tx) => {
      // Lock the car first. Two people booking the same car at the same instant
      // queue up here, so the overlap check below always sees the booking that
      // was committed a moment earlier — checking and inserting can no longer
      // interleave into a double booking.
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

      const finalUserId = (req.user.role === 'admin' && user_id) ? user_id : req.user.id
      const borrower = await tx.get('SELECT id, name FROM users WHERE id = ?', [finalUserId])
      if (!borrower) throw httpError(400, 'ไม่พบผู้ใช้ที่เลือก')

      const id = await tx.insert('bookings', {
        user_id: finalUserId,
        car_id,
        start_date,
        end_date,
        purpose: purpose || '',
        status: 'pending'
      })

      const booking = await tx.get(`SELECT b.*, c.license_plate, c.brand, c.model
        FROM bookings b JOIN cars c ON b.car_id = c.id WHERE b.id = ?`, [id])

      return { booking, car }
    })

    // Notifications are a side effect of a stored booking; a failure here must
    // not roll the booking back.
    const admins = await all('SELECT id FROM users WHERE role = ?', ['admin'])
    for (const a of admins) {
      await insert('notifications', {
        user_id: a.id,
        message: `มีคำขอยืมรถใหม่: ${car.brand} ${car.model} (${car.license_plate})`,
        type: 'booking_request',
        related_type: 'booking',
        related_id: booking.id
      })
    }

    res.status(201).json({ booking })
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/calendar', authMiddleware, async (req, res) => {
  try {
    const bookings = await all(
      `SELECT b.*, u.name as user_name, c.license_plate, c.brand, c.model
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       JOIN cars c ON b.car_id = c.id
       WHERE b.status IN ('pending', 'approved', 'returned')
       ORDER BY b.start_date ASC`
    )
    res.json({ bookings })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
