const { Router } = require('express')
const { all, get, update, run } = require('../db.cjs')
const { authMiddleware } = require('../middleware/auth.cjs')
const { sendError } = require('../lib/http-error.cjs')

const router = Router()

router.get('/', authMiddleware, async (req, res) => {
  try {
    const notifications = await all(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    )
    const unread = await all(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    )
    res.json({ notifications, unread: unread[0].count })
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const notif = await get('SELECT * FROM notifications WHERE id = ? AND user_id = ?', [req.params.id, req.user.id])
    if (!notif) return res.status(404).json({ error: 'Not found' })
    await update('notifications', { is_read: 1 }, 'id', req.params.id)
    res.json({ message: 'Marked as read' })
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    await run('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [req.user.id])
    res.json({ message: 'All marked as read' })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
