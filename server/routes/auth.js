import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { all, get, insert } from '../db.js'
import { generateToken, authMiddleware } from '../middleware/auth.js'

const router = Router()

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, id_card } = req.body
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อ อีเมล และรหัสผ่าน' })
    }

    const existing = get('SELECT id FROM users WHERE email = ?', [email])
    if (existing) {
      return res.status(409).json({ error: 'อีเมลนี้มีในระบบแล้ว' })
    }

    const hashed = await bcrypt.hash(password, 10)
    const role = all('SELECT COUNT(*) as count FROM users')[0].count === 0 ? 'admin' : 'user'

    const id = insert('users', { name, email, password: hashed, phone, id_card: id_card || '', role })
    const user = get('SELECT id, name, email, role, phone, id_card, created_at FROM users WHERE id = ?', [id])
    const token = generateToken(user)

    res.status(201).json({ user, token })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' })
    }

    const user = get('SELECT * FROM users WHERE email = ?', [email])
    if (!user) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })
    }

    const valid = bcrypt.compareSync(password, user.password)
    if (!valid) {
      return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' })
    }

    const token = generateToken(user)
    const { password: _, ...safe } = user
    res.json({ user: safe, token })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/me', authMiddleware, (req, res) => {
  const user = get('SELECT id, name, email, role, phone, id_card, avatar, created_at FROM users WHERE id = ?', [req.user.id])
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ user })
})

router.put('/me', authMiddleware, (req, res) => {
  const { name, phone, id_card } = req.body
  const updates = {}
  if (name) updates.name = name
  if (phone !== undefined) updates.phone = phone
  if (id_card !== undefined) updates.id_card = id_card
  if (Object.keys(updates).length > 0) {
    update('users', updates, 'id', req.user.id)
  }
  const user = get('SELECT id, name, email, role, phone, id_card, avatar, created_at FROM users WHERE id = ?', [req.user.id])
  res.json({ user })
})

export default router
