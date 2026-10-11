// Stages signed on paper (ตั้งค่า → เอกสาร). The setting lives in the document
// settings (api/lib/doc-settings.cjs); each booking gets its own frozen copy
// as `paper_signers` (api/lib/signing.cjs explains the shape and the chain).

const { collections, find, updateOne, str } = require('../db.cjs')
const { broadcastToRole } = require('../sse.cjs')
const { PARALLEL_STAGE_KEYS, STAGE_KEYS, currentStage, stagesToNotify } = require('./signing.cjs')
const { notifyStageSigners, notifyFullySigned, closeSignRequests, carOf } = require('./notify.cjs')

/** Stage key → name of the staff account currently assigned to sign it. */
async function assignedSignerNames(keys = STAGE_KEYS) {
  const assignments = await find(collections.settings, { _id: { $in: keys } })
  const userIds = assignments.map((a) => a.user_id).filter(Boolean)
  const users = userIds.length ? await find(collections.users, { _id: { $in: userIds } }, { projection: { name: 1 } }) : []
  const nameById = new Map(users.map((u) => [str(u._id), u.name]))
  return new Map(assignments.map((a) => [a._id, nameById.get(str(a.user_id)) || '']))
}

/**
 * The `paper_signers` map to freeze onto a booking: each paper stage's
 * configured name, or — when left blank — the name of the staff account
 * assigned to that stage (may still be '' if nobody is assigned).
 */
async function resolvePaperSigners(settings) {
  const keys = Object.keys(settings.paper_signers || {})
  if (!keys.length) return {}
  const assignedName = await assignedSignerNames(keys)
  return Object.fromEntries(keys.map((key) => [key, settings.paper_signers[key] || assignedName.get(key) || '']))
}

// Position of a stage in the chain: the parallel group, then deputy, director.
function groupOf(key) {
  if (PARALLEL_STAGE_KEYS.includes(key)) return 0
  return 1 + STAGE_KEYS.filter((k) => !PARALLEL_STAGE_KEYS.includes(k)).indexOf(key)
}

/**
 * Apply a changed paper-stage setting to documents still in the signing chain.
 * Only stages the document has not passed yet take the new setting, so the
 * chain only ever moves forward: a stage switched to paper is skipped (and the
 * document may finish), while a stage switched back to the system only applies
 * if the document has not got past it. Finished/rejected documents are left
 * exactly as they were signed.
 */
async function reconcilePaperSigners(settings) {
  const resolved = await resolvePaperSigners(settings)
  const open = await find(
    collections.bookings,
    { approval_stage: { $ne: null }, status: { $nin: ['rejected', 'returned', 'cancelled'] } },
    { projection: { 'signatures.requester.image': 0, ...Object.fromEntries(STAGE_KEYS.map((k) => [`signatures.${k}.image`, 0])) } },
  )
  const assignments = await find(collections.settings, { _id: { $in: STAGE_KEYS } })
  const assignedUser = new Map(assignments.map((a) => [a._id, a.user_id]))

  let changed = 0
  for (const b of open) {
    const position = groupOf(b.approval_stage)
    const before = b.paper_signers || {}
    const after = {}
    for (const key of STAGE_KEYS) {
      if (b.signatures?.[key]) continue
      const source = groupOf(key) < position ? before : resolved
      if (Object.prototype.hasOwnProperty.call(source, key)) after[key] = source[key]
    }
    const paperKeys = Object.keys(after)
    const stage = currentStage(b.signatures, paperKeys)
    if (JSON.stringify(after) === JSON.stringify(before) && stage === b.approval_stage) continue

    const set = { paper_signers: after, approval_stage: stage, updated_at: new Date() }
    if (!stage && b.status === 'pending') set.status = 'approved'
    await updateOne(collections.bookings, { _id: b._id }, { $set: set })
    changed++

    try {
      const updated = { ...b, ...set }
      // Signers whose stage just moved to paper no longer have anything to do.
      for (const key of paperKeys.filter((k) => !(k in before))) {
        if (assignedUser.get(key)) await closeSignRequests(b._id, assignedUser.get(key))
      }
      const car = await carOf(b)
      if (!stage) {
        await closeSignRequests(b._id)
        await notifyFullySigned(updated, car)
      } else if (stage !== b.approval_stage) {
        await notifyStageSigners(updated, stagesToNotify(stage, paperKeys), car)
      } else {
        // Still inside the same window, but a stage there may have just
        // switched back to the system — that signer now has a document to sign.
        const nowSystem = stagesToNotify(stage, paperKeys).filter((k) => k in before && !b.signatures?.[k])
        if (nowSystem.length) await notifyStageSigners(updated, nowSystem, car)
      }
    } catch (err) {
      console.error('[notify] paper signers:', err && err.message)
    }
  }
  if (changed) {
    broadcastToRole('admin', 'data-changed', { action: 'sign' })
    broadcastToRole('staff', 'data-changed', { action: 'sign' })
  }
  return changed
}

module.exports = { assignedSignerNames, resolvePaperSigners, reconcilePaperSigners }
