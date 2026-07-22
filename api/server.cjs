const express = require('express')
const cors = require('cors')
const path = require('path')
const authRoutes = require('./routes/auth.cjs')
const carRoutes = require('./routes/cars.cjs')
const bookingRoutes = require('./routes/bookings.cjs')
const notificationRoutes = require('./routes/notifications.cjs')
const adminRoutes = require('./routes/admin.cjs')
const publicRoutes = require('./routes/public.cjs')

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

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
