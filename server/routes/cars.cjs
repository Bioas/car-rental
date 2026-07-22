const { Router } = require('express')
const { all, get } = require('../db.cjs')
const { authMiddleware } = require('../middleware/auth.cjs')

const router = Router()

router.get('/', authMiddleware, (req, res) => {
  try {
    const { status, q } = req.query
    let sql = `SELECT c.*,
      CASE WHEN EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.car_id = c.id
        AND b.status IN ('pending', 'approved')
        AND b.end_date >= date('now')
      ) THEN 1 ELSE 0 END as has_active_booking
      FROM cars c`
    const conditions = []
    const params = []

    if (status) {
      if (status === 'available') {
        conditions.push("c.status = ? AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.car_id = c.id AND b.status IN ('pending', 'approved') AND b.end_date >= date('now'))")
        params.push('available')
      } else {
        conditions.push('c.status = ?')
        params.push(status)
      }
    }
    if (q) {
      conditions.push('(c.brand LIKE ? OR c.model LIKE ? OR c.license_plate LIKE ?)')
      params.push(`%${q}%`, `%${q}%`, `%${q}%`)
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }
    sql += ' ORDER BY c.created_at DESC'

    const cars = all(sql, params)
    res.json({ cars })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', authMiddleware, (req, res) => {
  try {
    const car = get('SELECT * FROM cars WHERE id = ?', [req.params.id])
    if (!car) return res.status(404).json({ error: 'ไม่พบรถยนต์' })

    const today = new Date().toISOString().split('T')[0]
    const activeBookings = all(
      `SELECT b.*, u.name as user_name FROM bookings b
       JOIN users u ON b.user_id = u.id
       WHERE b.car_id = ? AND b.status IN ('approved','pending') AND b.end_date >= ?
       ORDER BY b.start_date ASC`,
      [req.params.id, today]
    )

    res.json({ car, activeBookings })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
