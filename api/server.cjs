const express = require('express')
const cors = require('cors')
const path = require('path')
const authRoutes = require('./routes/auth.cjs')
const carRoutes = require('./routes/cars.cjs')
const bookingRoutes = require('./routes/bookings.cjs')
const notificationRoutes = require('./routes/notifications.cjs')
const adminRoutes = require('./routes/admin.cjs')
const publicRoutes = require('./routes/public.cjs')
const { addClient } = require('./sse.cjs')
const { verifyToken } = require('./middleware/auth.cjs')

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

// Lazy DB init middleware — works with Vercel's serverless module.exports pattern
const { initDB } = require('./db.cjs')
let dbReady = null
app.use(async (req, res, next) => {
  if (!dbReady) {
    console.log('Starting DB init...')
    dbReady = initDB()
  }
  try {
    await dbReady
    next()
  } catch (err) {
    dbReady = null
    console.error('DB init failed:', err && (err.message || err))
    return res.status(500).json({ error: 'DB init failed', detail: err && err.message })
  }
})

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')))
}

app.use('/api/auth', authRoutes)
app.use('/api/cars', carRoutes)
app.use('/api/bookings', bookingRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/public', publicRoutes)

app.get('/api/events', (req, res) => {
  const token = req.query.token
  if (!token) return res.status(401).json({ error: 'No token' })
  try {
    const decoded = verifyToken(token)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    // Flush headers
    res.write(':ok\n\n')
    addClient(res, decoded.id, decoded.role)
    // Keep-alive every 30s
    const keepAlive = setInterval(() => {
      try { res.write(':keepalive\n\n') } catch { clearInterval(keepAlive) }
    }, 30000)
    req.on('close', () => clearInterval(keepAlive))
  } catch {
    res.status(403).json({ error: 'Invalid token' })
  }
})

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

if (process.env.NODE_ENV === 'production') {
  app.use((req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
    } else {
      res.status(404).json({ error: 'API route not found' })
    }
  })
}

module.exports = app

async function start() {
  const { initDB } = require('./db.cjs')
  await initDB()
  console.log('Database initialized')
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })
}

const isVercel = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
if (!isVercel) {
  start().catch(console.error)
}
