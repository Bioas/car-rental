const express = require('express')
const app = express()

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ts: Date.now() })
})

// SPA fallback
app.use((req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(require('path').join(__dirname, '..', 'dist', 'index.html'))
  } else {
    res.status(404).json({ error: 'Not found' })
  }
})

module.exports = app
