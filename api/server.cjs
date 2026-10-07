// Must run before the requires below: the database driver and the JWT secret
// are both resolved from the environment at require time.
require('./lib/load-env.cjs').loadEnv()

const express = require('express')
const cors = require('cors')
const compression = require('compression')
const path = require('path')
const authRoutes = require('./routes/auth.cjs')
const carRoutes = require('./routes/cars.cjs')
const bookingRoutes = require('./routes/bookings.cjs')
const notificationRoutes = require('./routes/notifications.cjs')
const adminRoutes = require('./routes/admin.cjs')
const publicRoutes = require('./routes/public.cjs')
const { addClient } = require('./sse.cjs')
const { verifyToken, resolveTokenUser } = require('./middleware/auth.cjs')
const db = require('./db.cjs')

const app = express()
const PORT = process.env.PORT || 3000

// How often an open SSE stream re-checks its token against the database.
const SSE_REVALIDATE_MS = Number(process.env.SSE_REVALIDATE_MS || 15000)
const SSE_KEEPALIVE_MS = Number(process.env.SSE_KEEPALIVE_MS || 30000)

app.use(cors())
app.use(express.json())

// Gzip/deflate JSON and static assets — the vendor bundle and every API
// payload are several times smaller on the wire. The SSE stream is excluded:
// compressing a long-lived event stream buffers chunks and delays events.
app.use(compression({
  filter(req, res) {
    if (req.url.startsWith('/api/events')) return false
    const type = res.getHeader('Content-Type')
    if (typeof type === 'string' && type.startsWith('text/event-stream')) return false
    return compression.filter(req, res)
  },
}))

const DIST_DIR = path.join(__dirname, '..', 'dist')

// Static assets are served before the database middleware: they do not need a
// connection, and a database outage must not take the app shell down.
// Vite fingerprints everything under /assets, so those files are cacheable
// forever; index.html must always be revalidated or browsers keep an old asset
// graph after a deploy.
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(DIST_DIR, {
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      } else {
        res.setHeader('Cache-Control', 'no-cache')
      }
    },
  }))
}

// Lazy DB init middleware — works with Vercel's serverless module.exports pattern
// initDB() is idempotent (see db.cjs), so this is safe to call on every request
// without re-reading the database file.
app.use(async (req, res, next) => {
  try {
    await db.initDB()
    next()
  } catch (err) {
    console.error('DB init failed:', err && (err.message || err))
    return res.status(500).json({ error: 'DB init failed', detail: err && err.message })
  }
})

app.use('/api/auth', authRoutes)
app.use('/api/cars', carRoutes)
app.use('/api/bookings', bookingRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/public', publicRoutes)

app.get('/api/events', async (req, res) => {
  const token = req.query.token
  if (!token) return res.status(401).json({ error: 'No token' })

  let decoded
  try {
    decoded = verifyToken(token)
  } catch {
    return res.status(403).json({ error: 'Invalid token' })
  }

  // An SSE stream is long-lived, so the token is not just checked once at
  // connect time: a revoked token (password change, role change, deleted
  // account) would otherwise keep receiving broadcasts for up to 7 days.
  let user
  try {
    user = await resolveTokenUser(decoded)
  } catch (err) {
    console.error('[sse] initial validation failed:', err && err.message)
    return res.status(503).json({ error: 'Service unavailable' })
  }
  if (!user) return res.status(403).json({ error: 'Invalid token' })

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  // Flush headers
  res.write(':ok\n\n')
  addClient(res, user.id, user.role)

  // Keep-alive every 30s
  const keepAlive = setInterval(() => {
    try { res.write(':keepalive\n\n') } catch { clearInterval(keepAlive) }
  }, SSE_KEEPALIVE_MS)

  // Re-validate the session every 15s and drop the stream once it is revoked.
  const revalidate = setInterval(async () => {
    try {
      const current = await resolveTokenUser(decoded)
      if (!current) {
        res.write(`event: session-expired\ndata: ${JSON.stringify({ reason: 'revoked' })}\n\n`)
        res.end()
      }
    } catch (err) {
      // A transient database error must not kill an otherwise valid stream.
      console.error('[sse] revalidation failed:', err && err.message)
    }
  }, SSE_REVALIDATE_MS)

  req.on('close', () => {
    clearInterval(keepAlive)
    clearInterval(revalidate)
  })
})

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: db.describe(), timestamp: new Date().toISOString() })
})

if (process.env.NODE_ENV === 'production') {
  app.use((req, res) => {
    if (!req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(path.join(DIST_DIR, 'index.html'))
    } else {
      res.status(404).json({ error: 'API route not found' })
    }
  })
}

module.exports = app

async function start() {
  await db.initDB()
  console.log(`Database initialized: ${db.describe()}`)
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })
}

// Only listen when this file is the entry point (`npm start`). Importing the
// app — `api/index.js` on Vercel, or the test suite — must not open a socket.
const isVercel = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
if (!isVercel && require.main === module) {
  start().catch(console.error)
}
