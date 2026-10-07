const jwt = require('jsonwebtoken')
const { collections, findOne, toId, str, initDB } = require('../db.cjs')

// Never ship a hard-coded production secret. In production a real JWT_SECRET
// must be provided via env; in local dev we fall back to an obvious, insecure
// value so the app still runs out of the box.
const DEV_FALLBACK_SECRET = 'insecure-dev-only-secret-do-not-use-in-production'
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL

function resolveSecret() {
  const secret = process.env.JWT_SECRET
  if (secret) {
    if (secret.length < 16) {
      throw new Error('JWT_SECRET must be at least 16 characters long')
    }
    return secret
  }
  if (isProduction) {
    throw new Error('JWT_SECRET is required in production. Set it in your environment variables.')
  }
  console.warn('[auth] WARNING: JWT_SECRET is not set — using an insecure development-only secret. Set JWT_SECRET before deploying.')
  return DEV_FALLBACK_SECRET
}

const JWT_SECRET = resolveSecret()

/** Sign a token for a user document (Mongo `_id`) or a plain `{ id }` object. */
function generateToken(user) {
  const id = user._id !== undefined ? str(user._id) : String(user.id)
  return jwt.sign(
    { id, email: user.email, role: user.role, name: user.name, tv: user.token_version || 0 },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET)
}

/**
 * Validate a decoded token against the live database. Returns the current user
 * shape, or null when the account is gone or the token has been revoked.
 */
async function resolveTokenUser(decoded) {
  await initDB()
  const id = toId(decoded && decoded.id)
  if (!id) return null
  const dbUser = await findOne(collections.users, { _id: id })
  if (!dbUser) return null
  if ((dbUser.token_version || 0) !== (decoded.tv || 0)) return null
  return { id: str(dbUser._id), email: dbUser.email, role: dbUser.role, name: dbUser.name, token_version: dbUser.token_version || 0 }
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  let decoded
  try {
    decoded = verifyToken(header.slice(7))
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }

  // Re-check the user against the database on every request so that a deleted
  // account, a changed role, or a password change (which bumps token_version)
  // invalidates existing tokens immediately instead of lingering for the
  // token's full 7-day lifetime.
  let dbUser
  try {
    dbUser = await resolveTokenUser(decoded)
  } catch (err) {
    // A database outage must not masquerade as an auth failure.
    console.error('[auth] token validation failed:', err && err.message)
    return res.status(500).json({ error: 'Internal Server Error' })
  }
  if (!dbUser) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  req.user = {
    id: dbUser.id,
    email: dbUser.email,
    role: dbUser.role,
    name: dbUser.name,
  }
  next()
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admins only' })
  }
  next()
}

module.exports = { generateToken, verifyToken, authMiddleware, adminMiddleware, resolveTokenUser, JWT_SECRET }
