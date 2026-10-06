const { Router } = require('express')
const { all, get } = require('../db.cjs')
const { authMiddleware } = require('../middleware/auth.cjs')
const { today } = require('../lib/dates.cjs')
const { sendError } = require('../lib/http-error.cjs')

const router = Router()

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, q } = req.query
    // "Active booking" means one that has not ended yet. `date('now')` was
    // evaluated in UTC; the date is bound as a parameter so the local calendar
    // day is used and the query stays testable.
    const now = today()
    let sql = `SELECT c.*,
      CASE WHEN EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.car_id = c.id
        AND b.status IN ('pending', 'approved')
        AND b.end_date >= ?
      ) THEN 1 ELSE 0 END as has_active_booking
      FROM cars c`
    // The SELECT-list placeholder above binds first, so `params` is seeded with
    // `now` and every later condition must append in the same order.
    const params = [now]
    const conditions = []

    if (status) {
      if (status === 'available') {
        conditions.push("c.status = ? AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.car_id = c.id AND b.status IN ('pending', 'approved') AND b.end_date >= ?)")
        params.push('available', now)
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

    const cars = await all(sql, params)
    res.json({ cars })
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const car = await get('SELECT * FROM cars WHERE id = ?', [req.params.id])
    if (!car) return res.status(404).json({ error: 'ไม่พบรถยนต์' })

    const activeBookings = await all(
      `SELECT b.*, u.name as user_name FROM bookings b
       JOIN users u ON b.user_id = u.id
       WHERE b.car_id = ? AND b.status IN ('approved','pending') AND b.end_date >= ?
       ORDER BY b.start_date ASC`,
      [req.params.id, today()]
    )

    res.json({ car, activeBookings })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
