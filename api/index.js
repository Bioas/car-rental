import { initDB } from '../server/db.js'
import app from '../server/index.js'

// Initialize database on serverless cold start
await initDB()
console.log('Database initialized on Vercel')

export default app
