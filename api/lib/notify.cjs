// Notifications for the signing workflow.
//
//  - Staff are told when a document reaches *their* stage (type 'sign_request'):
//    the three parallel stages when a request is submitted, then the deputy
//    once those three have all signed, then the director after the deputy.
//  - Admins are told when a document is fully signed ('approved') or rejected
//    ('rejected').
//  - A signer's own 'sign_request' for a document is marked read once they act
//    on it, and every open one is closed when the document ends.
//
// Each recipient also gets a realtime 'data-changed' event so their badge and
// open pages refresh (src/context/AppContext.jsx).

const { collections, find, findOne, insertMany, updateMany, str } = require('../db.cjs')
const { broadcastToUser } = require('../sse.cjs')
const { getDocSettings } = require('./doc-settings.cjs')

/** "กข 1234 (Toyota Hiace)" — cars go by their licence plate first. */
function carText(car) {
  if (!car) return 'รถ'
  const model = [car.brand, car.model].filter(Boolean).join(' ')
  if (!car.license_plate) return model || 'รถ'
  return model ? `${car.license_plate} (${model})` : car.license_plate
}

function describe(booking, car) {
  const doc = booking.doc_label || (booking.doc_number ? String(booking.doc_number) : '')
  return { doc: doc ? `เลขที่ ${doc}` : 'คำขอยืมรถ', carText: carText(car), who: booking.user_name || 'ผู้ยืม' }
}

async function send(userIds, { type, message, booking }) {
  const unique = [...new Map(userIds.filter(Boolean).map((id) => [str(id), id])).values()]
  if (!unique.length) return
  await insertMany(collections.notifications, unique.map((user_id) => ({
    user_id, message, type, related_type: 'booking', related_id: booking._id, is_read: false, created_at: new Date(),
  })))
  for (const id of unique) broadcastToUser(str(id), 'data-changed', { action: 'notification', type, booking_id: str(booking._id) })
}

/** Tell the staff assigned to `stageKeys` that the document now waits on them. */
async function notifyStageSigners(booking, stageKeys, car) {
  if (!stageKeys.length) return
  const [assignments, settings] = await Promise.all([
    find(collections.settings, { _id: { $in: stageKeys } }),
    getDocSettings(),
  ])
  const d = describe(booking, car)
  // Group by signer so someone holding two stages gets one notification.
  const bySigner = new Map()
  for (const a of assignments) {
    if (!a.user_id) continue
    const key = str(a.user_id)
    const entry = bySigner.get(key) || { id: a.user_id, titles: [] }
    entry.titles.push(settings.stage_titles[a._id] || a._id)
    bySigner.set(key, entry)
  }
  for (const { id, titles } of bySigner.values()) {
    await send([id], {
      type: 'sign_request',
      booking,
      message: `เอกสาร${d.doc} รอคุณเซ็นในฐานะ${titles.join(' / ')} — ${d.who} · ${d.carText}`,
    })
  }
}

async function adminIds() {
  const admins = await find(collections.users, { role: 'admin' }, { projection: { _id: 1 } })
  return admins.map((a) => a._id)
}

/** Every stage has signed — the request is approved. */
async function notifyFullySigned(booking, car) {
  const d = describe(booking, car)
  await send(await adminIds(), {
    type: 'approved',
    booking,
    message: `เอกสาร${d.doc} เซ็นครบทุกขั้นแล้ว — ${d.who} · ${d.carText}`,
  })
}

/** The request was rejected — at a signing stage (`stageKey`) or by staff. */
async function notifyRejected(booking, car, { stageKey = null, note = '' } = {}) {
  const d = describe(booking, car)
  const byTitle = stageKey ? (await getDocSettings()).stage_titles[stageKey] || stageKey : ''
  await send(await adminIds(), {
    type: 'rejected',
    booking,
    message: `เอกสาร${d.doc} ไม่ได้รับอนุญาต${byTitle ? `โดย${byTitle}` : ''} — ${d.who} · ${d.carText}${note ? ` (${note})` : ''}`,
  })
}

/** Close sign requests: one signer's (when they act) or everyone's (document ended). */
async function closeSignRequests(bookingId, userId = null) {
  const filter = { related_type: 'booking', related_id: bookingId, type: 'sign_request', is_read: false }
  if (userId) filter.user_id = userId
  await updateMany(collections.notifications, filter, { $set: { is_read: true } })
}

async function carOf(booking) {
  return booking.car_id ? findOne(collections.cars, { _id: booking.car_id }) : null
}

module.exports = { carText, notifyStageSigners, notifyFullySigned, notifyRejected, closeSignRequests, carOf }
