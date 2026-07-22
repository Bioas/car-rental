const { Router } = require('express')
const { all, get, update, run } = require('../db.cjs')
const { authMiddleware } = require('../middleware/auth.cjs')

const router = Router()

router.get('/', authMiddleware, (req, res) => {
  try {
    const notifications = all(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    )
    const unread = all(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    )
    res.json({ notifications, unread: unread[0].count })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id/read', authMiddleware, (req, res) => {
  try {
    const notif = get('SELECT * FROM notifications WHERE id = ? AND user_id = ?', [req.params.id, req.user.id])
    if (!notif) return res.status(404).json({ error: 'Not found' })
    update('notifications', { is_read: 1 }, 'id', req.params.id)
    res.json({ message: 'Marked as read' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/read-all', authMiddleware, (req, res) => {
  try {
    run('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [req.user.id])
    res.json({ message: 'All marked as read' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
