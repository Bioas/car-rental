const { Router } = require('express')
const {
  collections, find, findOne, updateOne, updateMany, deleteOne, deleteMany, countDocuments, aggregate, toId, str,
} = require('../db.cjs')
const { authMiddleware } = require('../middleware/auth.cjs')
const { sendError } = require('../lib/http-error.cjs')

const router = Router()

const TYPES = ['sign_request', 'booking_request', 'approved', 'rejected', 'returned', 'cancelled']
const PAGE = 30

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

// GET /api/notifications?type=&unread=1&before=<ISO date>&limit=
// Newest first, `before` pages backwards. Always returns the unread total and
// per-type counts for the whole inbox so the filter chips stay accurate while
// only one page is loaded.
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = toId(req.user.id)
    const filter = { user_id: userId }
    if (TYPES.includes(req.query.type)) filter.type = req.query.type
    if (req.query.unread === '1') filter.is_read = false
    const before = req.query.before ? new Date(req.query.before) : null
    if (before && !Number.isNaN(before.getTime())) filter.created_at = { $lt: before }
    const limit = Math.min(Math.max(Number(req.query.limit) || PAGE, 1), 100)

    const [rows, unread, byType] = await Promise.all([
      find(collections.notifications, filter, { sort: { created_at: -1 }, limit: limit + 1 }),
      countDocuments(collections.notifications, { user_id: userId, is_read: false }),
      aggregate(collections.notifications, [
        { $match: { user_id: userId } },
        { $group: { _id: '$type', total: { $sum: 1 }, unread: { $sum: { $cond: ['$is_read', 0, 1] } } } },
      ]),
    ])
    const counts = { all: 0 }
    for (const g of byType) {
      counts[g._id] = { total: g.total, unread: g.unread }
      counts.all += g.total
    }
    res.json({
      notifications: rows.slice(0, limit).map(serialize),
      has_more: rows.length > limit,
      unread,
      counts,
    })
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

// Clear every notification already read. Declared before '/:id' so "read" is
// not taken for an id.
router.delete('/read', authMiddleware, async (req, res) => {
  try {
    const result = await deleteMany(collections.notifications, { user_id: toId(req.user.id), is_read: true })
    res.json({ message: 'ลบการแจ้งเตือนที่อ่านแล้ว', deleted: result.deletedCount || 0 })
  } catch (err) {
    sendError(res, err)
  }
})

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const id = toId(req.params.id)
    const result = id ? await deleteOne(collections.notifications, { _id: id, user_id: toId(req.user.id) }) : null
    if (!result || !result.deletedCount) return res.status(404).json({ error: 'Not found' })
    res.json({ message: 'ลบการแจ้งเตือนแล้ว' })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
