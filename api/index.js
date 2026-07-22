const express = require('express')
const app = express()

// Test if db.cjs loads (sql.js, bcryptjs, etc.)
let dbLoaded = false
try {
  require('./db.cjs')
  dbLoaded = true
} catch (e) {
  dbLoaded = false
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ts: Date.now(), dbLoaded })
})

const path = require('path')
app.use((req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
  } else {
    res.status(404).json({ error: 'Not found' })
  }
})

module.exports = app
