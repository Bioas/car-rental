import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { initDB } from './db.js'
import authRoutes from './routes/auth.js'
import carRoutes from './routes/cars.js'
import bookingRoutes from './routes/bookings.js'
import notificationRoutes from './routes/notifications.js'
import adminRoutes from './routes/admin.js'
import publicRoutes from './routes/public.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

// Lazy DB init for serverless (Vercel)
let dbInitialized = false
app.use(async (req, res, next) => {
  try {
    if (!dbInitialized) {
      await initDB()
      dbInitialized = true
      console.log('Database initialized on Vercel')
    }
    next()
  } catch (err) {
    console.error('DB init failed:', err)
    res.status(500).json({ error: 'Database initialization failed' })
  }
})

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')))
}

app.use('/api/auth', authRoutes)
app.use('/api/cars', carRoutes)
app.use('/api/bookings', bookingRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/public', publicRoutes)

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

export { app }
export default app

async function start() {
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
