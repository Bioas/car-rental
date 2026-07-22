const { Router } = require('express')
const bcrypt = require('bcryptjs')
const multer = require('multer')
const path = require('path')
const crypto = require('crypto')
const uuidv4 = () => crypto.randomUUID()
const { all, get, insert, update, run } = require('../db.cjs')
const { authMiddleware, adminMiddleware } = require('../middleware/auth.cjs')

const router = Router()

router.use(authMiddleware, adminMiddleware)

const isVercel = process.env.VERCEL
const storage = multer.diskStorage({
  destination: isVercel ? '/tmp' : path.join(__dirname, '..', '..', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${uuidv4()}${ext}`)
  }
})
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } })

// ─── CARS ───

router.get('/cars', (req, res) => {
  try {
    const cars = all('SELECT * FROM cars ORDER BY created_at DESC')
    res.json({ cars })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/cars', upload.single('image'), (req, res) => {
  try {
    const { license_plate, brand, model, color, year, seats, status, notes } = req.body
    if (!license_plate || !brand || !model) {
      return res.status(400).json({ error: 'กรุณากรอกทะเบียนรถ ยี่ห้อ และรุ่น' })
    }

    const existing = get('SELECT id FROM cars WHERE license_plate = ?', [license_plate])
    if (existing) {
      return res.status(409).json({ error: 'ทะเบียนรถนี้มีในระบบแล้ว' })
    }

    const data = { license_plate, brand, model, color: color || '', year: year || null, seats: seats || 4, status: status || 'available', notes: notes || '' }
    if (req.file) data.image = '/uploads/' + req.file.filename

    const id = insert('cars', data)
    const car = get('SELECT * FROM cars WHERE id = ?', [id])
    res.status(201).json({ car })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/cars/:id', upload.single('image'), (req, res) => {
  try {
    const car = get('SELECT * FROM cars WHERE id = ?', [req.params.id])
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
    if (req.file) data.image = '/uploads/' + req.file.filename

    update('cars', data, 'id', req.params.id)
    const updated = get('SELECT * FROM cars WHERE id = ?', [req.params.id])
    res.json({ car: updated })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/cars/:id', (req, res) => {
  try {
    const car = get('SELECT * FROM cars WHERE id = ?', [req.params.id])
    if (!car) return res.status(404).json({ error: 'ไม่พบรถยนต์' })

    const active = get("SELECT id FROM bookings WHERE car_id = ? AND status IN ('pending','approved')", [req.params.id])
    if (active) {
      return res.status(400).json({ error: 'ไม่สามารถลบรถที่มีการจองค้างอยู่' })
    }

    run('DELETE FROM cars WHERE id = ?', [req.params.id])
    res.json({ message: 'ลบรถยนต์สำเร็จ' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── USERS ───

router.get('/users', (req, res) => {
  try {
    const users = all('SELECT id, name, email, role, phone, id_card, avatar, created_at FROM users ORDER BY created_at DESC')
    res.json({ users })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/users', async (req, res) => {
  try {
    let { name, email, password, phone, role, id_card } = req.body
    if (!name || !email) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อและอีเมล' })
    }
    if (role === 'admin' && !password) {
      return res.status(400).json({ error: 'กรุณากรอกรหัสผ่านสำหรับผู้ดูแล' })
    }
    if (!role || role === 'user') {
      if (!password) password = ''
    }
    const existing = get('SELECT id FROM users WHERE email = ?', [email])
    if (existing) return res.status(409).json({ error: 'อีเมลนี้มีในระบบแล้ว' })

    const hashed = await bcrypt.hash(password, 10)
    const id = insert('users', { name, email, password: hashed, phone: phone || '', id_card: id_card || '', role: role || 'user' })
    const user = get('SELECT id, name, email, role, phone, id_card, created_at FROM users WHERE id = ?', [id])
    res.status(201).json({ user })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/users/:id', async (req, res) => {
  try {
    const user = get('SELECT id FROM users WHERE id = ?', [req.params.id])
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' })

    const { name, email, password, phone, role, id_card } = req.body
    const data = {}
    if (name) data.name = name
    if (email) {
      const dup = get('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.params.id])
      if (dup) return res.status(409).json({ error: 'อีเมลนี้มีผู้ใช้อื่นแล้ว' })
      data.email = email
    }
    if (password) data.password = await bcrypt.hash(password, 10)
    if (phone !== undefined) data.phone = phone
    if (role) data.role = role
    if (id_card !== undefined) data.id_card = id_card

    update('users', data, 'id', req.params.id)
    const updated = get('SELECT id, name, email, role, phone, id_card, created_at FROM users WHERE id = ?', [req.params.id])
    res.json({ user: updated })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/users/:id', (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'ไม่สามารถลบบัญชีตัวเองได้' })
    }
    const user = get('SELECT id FROM users WHERE id = ?', [req.params.id])
    if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' })
    run('DELETE FROM users WHERE id = ?', [req.params.id])
    res.json({ message: 'ลบผู้ใช้สำเร็จ' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── BOOKINGS (Admin) ───

router.get('/bookings', (req, res) => {
  try {
    const { status } = req.query
    let sql = `SELECT b.*, u.name as user_name, u.email as user_email,
               c.license_plate, c.brand, c.model, c.color
               FROM bookings b
               JOIN users u ON b.user_id = u.id
               JOIN cars c ON b.car_id = c.id`
    const params = []
    if (status) {
      sql += ' WHERE b.status = ?'
      params.push(status)
    }
    sql += ' ORDER BY b.created_at DESC'
    const bookings = all(sql, params)
    res.json({ bookings })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/bookings/:id/approve', (req, res) => {
  try {
    const booking = get('SELECT * FROM bookings WHERE id = ?', [req.params.id])
    if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' })
    if (booking.status !== 'pending') return res.status(400).json({ error: 'รายการนี้ไม่รอการอนุมัติ' })

    update('bookings', { status: 'approved', updated_at: new Date().toISOString() }, 'id', booking.id)

    const car = get('SELECT * FROM cars WHERE id = ?', [booking.car_id])
    insert('notifications', {
      user_id: booking.user_id,
      message: `✅ อนุมัติการยืม ${car.brand} ${car.model} (${car.license_plate})`,
      type: 'approved',
      related_type: 'booking',
      related_id: booking.id
    })

    res.json({ message: 'อนุมัติสำเร็จ' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/bookings/:id/reject', (req, res) => {
  try {
    const { admin_notes } = req.body
    const booking = get('SELECT * FROM bookings WHERE id = ?', [req.params.id])
    if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' })

    update('bookings', { status: 'rejected', admin_notes: admin_notes || '', updated_at: new Date().toISOString() }, 'id', booking.id)

    const car = get('SELECT * FROM cars WHERE id = ?', [booking.car_id])
    insert('notifications', {
      user_id: booking.user_id,
      message: `❌ ปฏิเสธการยืม ${car.brand} ${car.model} (${car.license_plate})${admin_notes ? ': ' + admin_notes : ''}`,
      type: 'rejected',
      related_type: 'booking',
      related_id: booking.id
    })

    res.json({ message: 'ปฏิเสธสำเร็จ' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/bookings/:id/return', (req, res) => {
  try {
    const booking = get('SELECT * FROM bookings WHERE id = ?', [req.params.id])
    if (!booking) return res.status(404).json({ error: 'ไม่พบรายการจอง' })
    if (booking.status !== 'approved') return res.status(400).json({ error: 'เฉพาะรายการที่อนุมัติแล้วเท่านั้น' })

    update('bookings', { status: 'returned', updated_at: new Date().toISOString() }, 'id', booking.id)

    insert('notifications', {
      user_id: booking.user_id,
      message: `🔁 คืนรถเรียบร้อยแล้ว (Booking #${booking.id})`,
      type: 'returned',
      related_type: 'booking',
      related_id: booking.id
    })

    res.json({ message: 'บันทึกการคืนรถสำเร็จ' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── REPORTS ───

router.get('/reports', (req, res) => {
  try {
    const totalCars = get('SELECT COUNT(*) as count FROM cars')
    const availableCars = get("SELECT COUNT(*) as count FROM cars WHERE status = 'available'")
    const totalUsers = get('SELECT COUNT(*) as count FROM users')
    const totalBookings = get('SELECT COUNT(*) as count FROM bookings')
    const pendingBookings = get("SELECT COUNT(*) as count FROM bookings WHERE status = 'pending'")
    const approvedBookings = get("SELECT COUNT(*) as count FROM bookings WHERE status = 'approved'")
    const returnedBookings = get("SELECT COUNT(*) as count FROM bookings WHERE status = 'returned'")

    const bookingsByCar = all(
      `SELECT c.id, c.brand, c.model, c.license_plate, COUNT(b.id) as count
       FROM cars c LEFT JOIN bookings b ON c.id = b.car_id
       GROUP BY c.id ORDER BY count DESC`
    )

    const bookingsByMonth = all(
      `SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count
       FROM bookings GROUP BY month ORDER BY month DESC LIMIT 12`
    )

    const topUsers = all(
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
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
