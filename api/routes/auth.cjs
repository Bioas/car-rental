const { Router } = require('express')
const bcrypt = require('bcryptjs')
const { collections, findOne, updateOne, toId, str } = require('../db.cjs')
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

// There is no public self-registration: the only accounts in this system are
// admins and drivers, both provisioned by an existing admin (or `npm run
// seed`) via /api/admin/users. Borrowers are not accounts at all.

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' })
    }

    const user = await findOne(collections.users, { email }, { projection: { saved_signature: 0 } })
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
    const user = await findOne(collections.users, { _id: toId(req.user.id) }, { projection: { saved_signature: 0 } })
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ user: publicUser(user) })
  } catch (err) {
    sendError(res, err)
  }
})

// Profile edits (src/pages/Profile.jsx). Email and role stay admin-managed
// (/api/admin/users) — they are the login and the permission level.
const MAX_PROFILE_TEXT = 200
router.put('/me', authMiddleware, async (req, res) => {
  try {
    const { name, phone, id_card, position } = req.body || {}
    const updates = {}
    if (name !== undefined) {
      const value = String(name).trim()
      if (!value) return res.status(400).json({ error: 'กรุณากรอกชื่อ' })
      updates.name = value
    }
    if (phone !== undefined) updates.phone = String(phone).trim()
    if (position !== undefined) updates.position = String(position).trim()
    if (id_card !== undefined) updates.id_card = String(id_card).trim()
    if (Object.values(updates).some((v) => v.length > MAX_PROFILE_TEXT)) {
      return res.status(400).json({ error: `ข้อความยาวเกิน ${MAX_PROFILE_TEXT} ตัวอักษร` })
    }
    if (Object.keys(updates).length > 0) {
      await updateOne(collections.users, { _id: toId(req.user.id) }, { $set: updates })
    }
    const user = await findOne(collections.users, { _id: toId(req.user.id) }, { projection: { saved_signature: 0 } })
    res.json({ user: publicUser(user) })
  } catch (err) {
    sendError(res, err)
  }
})

// Change your own password. Bumping token_version signs out every other
// session (api/middleware/auth.cjs checks it on each request); this one gets a
// fresh token back so the person changing it stays signed in.
router.put('/me/password', authMiddleware, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {}
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'กรุณากรอกรหัสผ่านปัจจุบันและรหัสผ่านใหม่' })
    }
    if (String(new_password).length < 6) {
      return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' })
    }
    const user = await findOne(collections.users, { _id: toId(req.user.id) }, { projection: { saved_signature: 0 } })
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (!(await bcrypt.compare(String(current_password), user.password || ''))) {
      return res.status(400).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' })
    }
    if (await bcrypt.compare(String(new_password), user.password || '')) {
      return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม' })
    }
    const tokenVersion = (user.token_version || 0) + 1
    await updateOne(collections.users, { _id: user._id }, {
      $set: { password: await bcrypt.hash(String(new_password), 10), token_version: tokenVersion },
    })
    res.json({ message: 'เปลี่ยนรหัสผ่านแล้ว', token: generateToken({ ...user, token_version: tokenVersion }) })
  } catch (err) {
    sendError(res, err)
  }
})

// ── Saved signature ──
// A staff signer can keep one signature image on their account and reuse it
// with one tap in the sign modal (src/components/SignDocumentModal.jsx). It is
// kept out of publicUser() — it can be hundreds of KB — and served on its own.
// Signing still sends the image with each signature, so a saved signature
// changes nothing about how a document is signed or checked.
const MAX_SIGNATURE_LENGTH = 500_000
function isValidSignature(value) {
  return typeof value === 'string' && value.startsWith('data:image/') && value.length <= MAX_SIGNATURE_LENGTH
}

// Only staff sign documents (admins oversee, drivers never log in).
function signerOnly(req, res, next) {
  if (req.user.role !== 'staff') return res.status(403).json({ error: 'เฉพาะเจ้าหน้าที่ผู้เซ็นเอกสารเท่านั้น' })
  next()
}

router.get('/me/signature', authMiddleware, signerOnly, async (req, res) => {
  try {
    const user = await findOne(collections.users, { _id: toId(req.user.id) }, { projection: { saved_signature: 1, saved_signature_at: 1 } })
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ signature: user.saved_signature || '', updated_at: user.saved_signature_at || null })
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/me/signature', authMiddleware, signerOnly, async (req, res) => {
  try {
    const { signature } = req.body || {}
    if (!isValidSignature(signature)) {
      return res.status(400).json({ error: 'ลายเซ็นไม่ถูกต้อง หรือไฟล์ใหญ่เกินไป' })
    }
    const now = new Date()
    await updateOne(collections.users, { _id: toId(req.user.id) }, { $set: { saved_signature: signature, saved_signature_at: now } })
    res.json({ signature, updated_at: now })
  } catch (err) {
    sendError(res, err)
  }
})

router.delete('/me/signature', authMiddleware, signerOnly, async (req, res) => {
  try {
    await updateOne(collections.users, { _id: toId(req.user.id) }, { $unset: { saved_signature: '', saved_signature_at: '' } })
    res.json({ signature: '', updated_at: null })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
