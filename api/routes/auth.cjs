const { Router } = require('express')
const bcrypt = require('bcryptjs')
const { collections, findOne, insertOne, updateOne, toId, str } = require('../db.cjs')
const { generateToken, authMiddleware } = require('../middleware/auth.cjs')
const { sendError } = require('../lib/http-error.cjs')

const router = Router()

/** Public projection of a user document — never the password or token_version. */
function publicUser(u) {
  return {
    id: str(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    phone: u.phone || '',
    position: u.position || '',
    id_card: u.id_card || '',
    avatar: u.avatar || '',
    created_at: u.created_at,
  }
}

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

    const existing = await findOne(collections.users, { email })
    if (existing) {
      return res.status(409).json({ error: 'อีเมลนี้มีในระบบแล้ว' })
    }

    const hashed = await bcrypt.hash(password, 10)
    // Public self-registration always creates a plain user. Admin accounts are
    // provisioned by `npm run seed` or by an existing admin — never by being the
    // first row (which previously let anyone become admin on a fresh database).
    let id
    try {
      id = await insertOne(collections.users, {
        name, email, password: hashed, phone: phone || '', id_card: id_card || '',
        avatar: '', role: 'user', token_version: 0, created_at: new Date(),
      })
    } catch (err) {
      // Lost a race with another registration for the same email.
      if (err && err.code === 11000) return res.status(409).json({ error: 'อีเมลนี้มีในระบบแล้ว' })
      throw err
    }

    const user = await findOne(collections.users, { _id: id })
    const token = generateToken(user)
    res.status(201).json({ user: publicUser(user), token })
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

    const user = await findOne(collections.users, { email })
    if (!user) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })
    }
    // Drivers are assignment records, not sign-in accounts.
    if (user.role === 'driver') {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })
    }

    const valid = await bcrypt.compare(password, user.password || '')
    if (!valid) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })
    }

    const token = generateToken(user)
    res.json({ user: publicUser(user), token })
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await findOne(collections.users, { _id: toId(req.user.id) })
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ user: publicUser(user) })
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
      await updateOne(collections.users, { _id: toId(req.user.id) }, { $set: updates })
    }
    const user = await findOne(collections.users, { _id: toId(req.user.id) })
    res.json({ user: publicUser(user) })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
