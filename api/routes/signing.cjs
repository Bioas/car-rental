const { Router } = require('express')
const { collections, find, findOne, updateOne, toId, str } = require('../db.cjs')
const { authMiddleware } = require('../middleware/auth.cjs')
const { broadcastToRole } = require('../sse.cjs')
const { sendError } = require('../lib/http-error.cjs')
const { STAGE_KEYS, PARALLEL_STAGE_KEYS, WITHOUT_SIGNATURE_IMAGES, stageCanReject, paperKeysOf, currentStage, stagesToNotify, driverStageKeys } = require('../lib/signing.cjs')
const { notifyStageSigners, notifyFullySigned, notifyRejected, closeSignRequests, carOf } = require('../lib/notify.cjs')

const router = Router()

router.use(authMiddleware)

// Viewing the signing queue/history is open to both admin and staff accounts
// ('driver' never logs in at all — it is a roster entry, not a sign-in).
function viewMiddleware(req, res, next) {
  if (req.user.role !== 'staff' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: staff only' })
  }
  next()
}
router.use(viewMiddleware)

// Signing, however, is staff-only: an admin oversees and manages the system but
// must not sign loan documents. An admin who somehow still holds a stage
// assignment is refused here too.
function signerMiddleware(req, res, next) {
  if (req.user.role !== 'staff') {
    return res.status(403).json({ error: 'เฉพาะเจ้าหน้าที่ผู้เซ็นเอกสารเท่านั้น' })
  }
  next()
}

const MAX_SIGNATURE_LENGTH = 500_000
function isValidSignature(value) {
  return typeof value === 'string' && value.startsWith('data:image/') && value.length <= MAX_SIGNATURE_LENGTH
}

/** Stage keys this user is the assigned signer for. */
async function assignedStageKeysFor(userId) {
  const uid = toId(userId)
  if (!uid) return []
  const assignments = await find(collections.settings, { _id: { $in: STAGE_KEYS }, user_id: uid })
  return assignments.map((a) => a._id)
}

async function enrichForSigning(bookings) {
  const carIds = [...new Set(bookings.map((b) => str(b.car_id)))]
  const cars = await find(collections.cars, { _id: { $in: carIds.map(toId).filter(Boolean) } })
  const carById = new Map(cars.map((c) => [str(c._id), c]))

  return bookings.map((b) => {
    const c = carById.get(str(b.car_id)) || {}
    return {
      id: str(b._id),
      doc_number: b.doc_number || null,
      doc_label: b.doc_label || (b.doc_number ? String(b.doc_number) : null),
      user_name: b.user_name || '',
      user_email: b.user_email || '',
      user_phone: b.user_phone || '',
      user_position: b.user_position || '',
      admin_notes: b.admin_notes || '',
      car_id: str(b.car_id),
      start_date: b.start_date,
      end_date: b.end_date,
      purpose: b.purpose || '',
      destination_place: b.destination_place || '',
      destination_district: b.destination_district || '',
      destination_province: b.destination_province || '',
      attendees: b.attendees || 0,
      status: b.status,
      // The first three signers pick who drives while they sign, so the sign
      // modal needs the choice already recorded on the document.
      self_drive: !!b.self_drive,
      driver_id: str(b.driver_id),
      driver_name: b.driver_name || '',
      approval_stage: b.approval_stage || null,
      signatures: b.signatures || {},
      paper_signers: b.paper_signers || {},
      created_at: b.created_at,
      license_plate: c.license_plate || '',
      brand: c.brand || '',
      model: c.model || '',
    }
  })
}

// Driver roster for the sign modal. The first three stages choose who drives
// as part of signing the document, so staff must be able to read it too —
// unlike the admin-only GET /api/admin/drivers.
router.get('/drivers', async (req, res) => {
  try {
    const drivers = await find(collections.users, { role: 'driver' }, { sort: { name: 1 } })
    res.json({ drivers: drivers.map((u) => ({ id: str(u._id), name: u.name, phone: u.phone || '' })) })
  } catch (err) {
    sendError(res, err)
  }
})

// Bookings currently waiting on a stage this signed-in staff member is
// assigned to. The first three stages are signed in parallel — anyone in that
// group may act as soon as the document is created, so all of them see it in
// their queue even though approval_stage still points at the first member.
router.get('/queue', async (req, res) => {
  try {
    const stageKeys = await assignedStageKeysFor(req.user.id)
    if (stageKeys.length === 0) return res.json({ bookings: [] })

    const parallelKeys = stageKeys.filter((k) => PARALLEL_STAGE_KEYS.includes(k))
    const sequentialKeys = stageKeys.filter((k) => !PARALLEL_STAGE_KEYS.includes(k))

    // A booking shows up for this user when either:
    //  - one of their first-three (parallel) stages has not signed yet, while
    //    the document is still inside the parallel window; or
    //  - approval_stage is exactly one of their remaining (sequential) stages.
    const or = []
    for (const key of parallelKeys) {
      // A stage this document signs on paper never shows up in a queue.
      or.push({
        approval_stage: { $in: PARALLEL_STAGE_KEYS },
        [`signatures.${key}`]: { $exists: false },
        [`paper_signers.${key}`]: { $exists: false },
      })
    }
    for (const key of sequentialKeys) {
      or.push({ approval_stage: key })
    }

    // A document stays in the signer's queue while their stage is unsigned,
    // whether it is still 'pending' or was approved early (an admin-approved
    // booking keeps its approval_stage until every signer has signed) — so the
    // status is deliberately not pinned to 'pending' here. approval_stage is
    // cleared once the chain finishes, which keeps completed documents out.
    const bookings = await find(
      collections.bookings,
      { status: { $nin: ['rejected', 'returned'] }, approval_stage: { $ne: null }, $or: or },
      { sort: { created_at: 1 }, projection: WITHOUT_SIGNATURE_IMAGES }
    )
    const enriched = await enrichForSigning(bookings)
    // Tell the UI which stage THIS user acts on — inside the parallel group
    // approval_stage keeps pointing at the first member, so the modal must not
    // guess from it.
    for (const b of enriched) {
      if (PARALLEL_STAGE_KEYS.includes(b.approval_stage)) {
        b.sign_stage = stageKeys.find((k) => PARALLEL_STAGE_KEYS.includes(k) && !b.signatures?.[k] && !(k in b.paper_signers)) || null
      } else {
        b.sign_stage = b.approval_stage
      }
    }
    res.json({ bookings: enriched })
  } catch (err) {
    sendError(res, err)
  }
})

// Bookings this signed-in user has personally signed at any stage, most
// recently acted on first — the "history" counterpart to /queue.
router.get('/history', async (req, res) => {
  try {
    const uid = toId(req.user.id)
    const bookings = await find(
      collections.bookings,
      { $or: STAGE_KEYS.map((key) => ({ [`signatures.${key}.user_id`]: uid })) },
      { sort: { updated_at: -1 }, limit: 100, projection: WITHOUT_SIGNATURE_IMAGES }
    )
    res.json({ bookings: await enrichForSigning(bookings) })
  } catch (err) {
    sendError(res, err)
  }
})

router.put('/:id/sign', signerMiddleware, async (req, res) => {
  try {
    const { decision, signature, position, self_drive, driver_id } = req.body
    if (decision !== 'approve' && decision !== 'reject') {
      return res.status(400).json({ error: 'กรุณาระบุ decision เป็น approve หรือ reject' })
    }
    if (!isValidSignature(signature)) {
      return res.status(400).json({ error: 'กรุณาเซ็นชื่อหรืออัปโหลดรูปลายเซ็นก่อนยืนยัน' })
    }

    const id = toId(req.params.id)
    if (!id) return res.status(404).json({ error: 'ไม่พบคำขอยืม' })

    const booking = await findOne(collections.bookings, { _id: id })
    if (!booking) return res.status(404).json({ error: 'ไม่พบคำขอยืม' })
    // Signing is allowed while the document still awaits a signature, whatever
    // its raw status: an admin may approve (assign a driver) before the chain
    // is complete. 'rejected'/'returned' are terminal, and a finished document
    // has no approval_stage left.
    if (!booking.approval_stage || booking.status === 'rejected' || booking.status === 'returned') {
      return res.status(409).json({ error: 'เอกสารนี้ไม่อยู่ในขั้นตอนที่ท่านต้องเซ็นแล้ว' })
    }

    const assignedKeys = await assignedStageKeysFor(req.user.id)

    // Find the stage this user actually acts on for this document. Inside the
    // parallel window (first three stages) any of those three may sign as soon
    // as the document exists — their own stage just has to be unsigned. Once
    // the parallel group is complete the chain is strict again.
    // Stages this document signs on paper are skipped in the system.
    const paperKeys = paperKeysOf(booking)
    let stageKey = null
    if (PARALLEL_STAGE_KEYS.includes(booking.approval_stage)) {
      stageKey = assignedKeys.find((k) => PARALLEL_STAGE_KEYS.includes(k) && !booking.signatures?.[k] && !paperKeys.includes(k)) || null
    } else if (assignedKeys.includes(booking.approval_stage)) {
      stageKey = booking.approval_stage
    }
    if (!stageKey) {
      return res.status(409).json({ error: 'เอกสารนี้ไม่อยู่ในขั้นตอนที่ท่านต้องเซ็นแล้ว' })
    }

    const assignment = await findOne(collections.settings, { _id: stageKey })
    if (!assignment) {
      return res.status(409).json({ error: 'ยังไม่ได้กำหนดผู้เซ็นสำหรับขั้นตอนนี้ กรุณาตั้งค่าในหน้าผู้ดูแลระบบก่อน' })
    }
    if (decision === 'reject' && !stageCanReject(stageKey)) {
      return res.status(403).json({ error: 'ขั้นตอนนี้ไม่สามารถไม่อนุญาตคำขอได้' })
    }

    const signatureEntry = {
      // user_id (absent on the requester's own entry, which isn't a logged-in
      // account) is what GET /history filters on to find "documents I've
      // signed" — name alone isn't a safe/stable identity key.
      user_id: toId(req.user.id),
      name: req.user.name,
      position: String(position || '').trim(),
      image: signature,
      decision,
      signed_at: new Date(),
    }

    // The first three stages (the ones responsible for the vehicle) decide who
    // drives as part of signing (or the first in-system stage, if those three
    // all sign on paper): the requester drives themselves, or one of the
    // driver-role roster accounts is assigned. Later stages leave it alone.
    let driverFields = null
    if (decision === 'approve' && driverStageKeys(paperKeys).includes(stageKey) && (self_drive === true || driver_id)) {
      let driver = null
      if (!self_drive && driver_id) {
        const did = toId(driver_id)
        driver = did ? await findOne(collections.users, { _id: did }) : null
        if (!driver || driver.role !== 'driver') {
          return res.status(400).json({ error: 'ไม่พบพนักงานขับรถที่เลือก' })
        }
      }
      driverFields = {
        self_drive: !driver,
        driver_id: driver ? driver._id : null,
        driver_name: driver ? driver.name : '',
      }
    }

    const set = {
      [`signatures.${stageKey}`]: signatureEntry,
      updated_at: new Date(),
    }
    if (driverFields) Object.assign(set, driverFields)

    if (decision === 'reject') {
      set.status = 'rejected'
      set.approval_stage = null
    } else {
      // The parallel window stays open until every in-system parallel stage
      // has signed; after that the next in-system stage, skipping paper ones.
      // Nothing left to sign in the system → the request is approved.
      const next = currentStage({ ...booking.signatures, [stageKey]: signatureEntry }, paperKeys)
      if (next !== booking.approval_stage) set.approval_stage = next
      if (!next) set.status = 'approved'
    }

    await updateOne(collections.bookings, { _id: id }, { $set: set })

    // Notifications never fail the signature itself.
    try {
      const updated = { ...booking, ...set }
      const car = await carOf(booking)
      await closeSignRequests(id, toId(req.user.id))
      if (decision === 'reject') {
        await closeSignRequests(id)
        await notifyRejected(updated, car, { stageKey })
      } else if (set.status === 'approved') {
        await closeSignRequests(id)
        await notifyFullySigned(updated, car)
      } else if (set.approval_stage && set.approval_stage !== booking.approval_stage) {
        await notifyStageSigners(updated, stagesToNotify(set.approval_stage, paperKeys), car)
      }
    } catch (err) {
      console.error('[notify] sign:', err && err.message)
    }

    broadcastToRole('admin', 'data-changed', { action: 'sign', booking_id: str(id) })
    broadcastToRole('staff', 'data-changed', { action: 'sign', booking_id: str(id) })

    res.json({ ok: true, status: set.status || booking.status, approval_stage: 'approval_stage' in set ? set.approval_stage : booking.approval_stage })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
