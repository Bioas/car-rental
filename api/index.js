const { initDB } = require('./db.cjs')
const app = require('./server.cjs')

// Kick off DB init on cold start — subsequent warm requests reuse the same promise
const ready = initDB().catch(err => {
  console.error('DB init failed:', err)
  throw err
})

module.exports = async (req, res) => {
  try {
    await ready
    app(req, res)
  } catch (err) {
    console.error('Handler error:', err)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
