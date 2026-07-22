import { initDB } from '../server/db.js'
import app from '../server/index.js'

try {
  await initDB()
  console.log('Database initialized on Vercel')
} catch (err) {
  console.error('DB init failed (will retry on request):', err.message)
}

export default app
