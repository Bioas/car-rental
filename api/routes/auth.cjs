const { Router } = require('express')
const bcrypt = require('bcryptjs')
const { get, insert, update } = require('../db.cjs')
const { generateToken, authMiddleware } = require('../middleware/auth.cjs')
const { sendError } = require('../lib/http-error.cjs')

const router = Router()

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, id_card } = req.body
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อ อีเมล และรหัสผ่าน' })
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return res.status(400).json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' })
    }

    const existing = await get('SELECT id FROM users WHERE email = ?', [email])
    if (existing) {
      return res.status(409).json({ error: 'อีเมลนี้มีในระบบแล้ว' })
    }

    const hashed = await bcrypt.hash(password, 10)
    // Public self-registration always creates a plain user. Admin accounts are
    // provisioned by `npm run seed` or by an existing admin — never by being the
    // first row in the table (which previously let anyone become admin on a
    // fresh/ephemeral database).
    const id = await insert('users', { name, email, password: hashed, phone: phone || '', id_card: id_card || '', role: 'user' })
    const user = await get('SELECT id, name, email, role, phone, id_card, created_at FROM users WHERE id = ?', [id])
    const token = generateToken(user)

    res.status(201).json({ user, token })
  } catch (err) {
    console.error('[auth] register failed:', err)
    res.status(500).json({ error: (err && err.message) || 'Registration failed' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' })
    }

    const user = await get('SELECT * FROM users WHERE email = ?', [email])
    if (!user) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })
    }

    const valid = bcrypt.compareSync(password, user.password)
    if (!valid) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })
    }

    const token = generateToken(user)
    const { password: _, token_version, ...safe } = user
    res.json({ user: safe, token })
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await get('SELECT id, name, email, role, phone, id_card, avatar, created_at FROM users WHERE id = ?', [req.user.id])
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ user })
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/me', authMiddleware, async (req, res) => {
  try {
    const { name, phone, id_card } = req.body
    const updates = {}
    if (name) updates.name = name
    if (phone !== undefined) updates.phone = phone
    if (id_card !== undefined) updates.id_card = id_card
    if (Object.keys(updates).length > 0) {
      await update('users', updates, 'id', req.user.id)
    }
    const user = await get('SELECT id, name, email, role, phone, id_card, avatar, created_at FROM users WHERE id = ?', [req.user.id])
    res.json({ user })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
