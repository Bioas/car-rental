const { initDB } = require('./db.cjs')
const app = require('./server.cjs')

// On Vercel serverless, each cold start is independent.
// Seed the DB once and cache the promise.
let dbReady = null

function getReady() {
  if (!dbReady) {
    dbReady = initDB().then(() => {
      console.log('DB initialized successfully')
    }).catch(err => {
      console.error('DB init failed, will retry next request:', err.message)
      dbReady = null // reset so next request retries
      throw err
    })
  }
  return dbReady
}

module.exports = async (req, res) => {
  try {
    await getReady()
    app(req, res)
  } catch (err) {
    console.error('Handler error:', err && err.message)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
