const { Router } = require('express')
const { collections, find, findOne, updateOne, updateMany, countDocuments, toId, str } = require('../db.cjs')
const { authMiddleware } = require('../middleware/auth.cjs')
const { sendError } = require('../lib/http-error.cjs')

const router = Router()

function serialize(n) {
  return {
    id: str(n._id),
    message: n.message,
    type: n.type,
    is_read: !!n.is_read,
    related_type: n.related_type || '',
    related_id: n.related_id ? str(n.related_id) : null,
    created_at: n.created_at,
  }
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = toId(req.user.id)
    const notifications = await find(collections.notifications, { user_id: userId }, { sort: { created_at: -1 }, limit: 50 })
    const unread = await countDocuments(collections.notifications, { user_id: userId, is_read: false })
    res.json({ notifications: notifications.map(serialize), unread })
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const id = toId(req.params.id)
    const notif = id ? await findOne(collections.notifications, { _id: id, user_id: toId(req.user.id) }) : null
    if (!notif) return res.status(404).json({ error: 'Not found' })
    await updateOne(collections.notifications, { _id: notif._id }, { $set: { is_read: true } })
    res.json({ message: 'Marked as read' })
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    await updateMany(collections.notifications, { user_id: toId(req.user.id), is_read: false }, { $set: { is_read: true } })
    res.json({ message: 'All marked as read' })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
