import { Router } from 'express'
import { all, get, insert, update } from '../db.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

function addNotification(userId, message, type, relatedType, relatedId) {
  insert('notifications', {
    user_id: userId,
    message,
    type,
    related_type: relatedType,
    related_id: relatedId
  })
}

router.post('/', authMiddleware, (req, res) => {
  try {
    const { car_id, start_date, end_date, purpose, user_id } = req.body
    if (!car_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'กรุณาเลือกรถและวันที่' })
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

    const finalUserId = (req.user.role === 'admin' && user_id) ? user_id : req.user.id
    const borrower = get('SELECT id, name FROM users WHERE id = ?', [finalUserId])
    if (!borrower) return res.status(400).json({ error: 'ไม่พบผู้ใช้ที่เลือก' })

    const id = insert('bookings', {
      user_id: finalUserId,
      car_id,
      start_date,
      end_date,
      purpose: purpose || '',
      status: 'pending'
    })

    const booking = get(`SELECT b.*, c.license_plate, c.brand, c.model
      FROM bookings b JOIN cars c ON b.car_id = c.id WHERE b.id = ?`, [id])

    const admins = all('SELECT id FROM users WHERE role = ?', ['admin'])
    admins.forEach(a => {
      addNotification(a.id, `มีคำขอยืมรถใหม่: ${car.brand} ${car.model} (${car.license_plate})`,
        'booking_request', 'booking', id)
    })

    res.status(201).json({ booking })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/calendar', authMiddleware, (req, res) => {
  try {
    const bookings = all(
      `SELECT b.*, u.name as user_name, c.license_plate, c.brand, c.model
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       JOIN cars c ON b.car_id = c.id
       WHERE b.status IN ('pending', 'approved', 'returned')
       ORDER BY b.start_date ASC`
    )
    res.json({ bookings })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
