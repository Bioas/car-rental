const express = require('express')
const app = express()

// Test if db.cjs loads
require('../server/db.cjs')

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ts: Date.now() })
})

module.exports = app
