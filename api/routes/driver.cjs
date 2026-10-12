// Public driver page API (/driver). Drivers have no password, so — like the
// public booking calendar — this is readable without signing in: the driver
// list and each driver's assigned trips. Borrower phone numbers are never
// included (they are the borrower's cancel/return credential).
//
// Linking LINE is the one write, and it needs the driver's own phone number:
// otherwise anyone could pick a name and route that driver's notifications —
// which do carry the borrower's phone — to their own LINE.

const { Router } = require('express')
const { collections, findOne, toId } = require('../db.cjs')
const { sendError } = require('../lib/http-error.cjs')
const { linePublicInfo, isLineConfigured } = require('../lib/line.cjs')
const { findTrips, rangeFromQuery, listDrivers, publicDriver, issueLinkCode } = require('../lib/drivers.cjs')

const router = Router()

function normalizePhone(value) {
  return String(value || '').replace(/[\s-]/g, '')
}

// Phone guesses per driver: 5 wrong tries lock the code request for 15 minutes.
const MAX_TRIES = 5
const LOCK_MS = 15 * 60 * 1000
const failures = new Map()

function locked(driverId) {
  const entry = failures.get(driverId)
  if (!entry) return false
  if (Date.now() - entry.since > LOCK_MS) {
    failures.delete(driverId)
    return false
  }
  return entry.count >= MAX_TRIES
}

function recordFailure(driverId) {
  const entry = failures.get(driverId)
  if (!entry || Date.now() - entry.since > LOCK_MS) failures.set(driverId, { count: 1, since: Date.now() })
  else entry.count++
}

async function findDriver(id) {
  const _id = toId(id)
  if (!_id) return null
  const user = await findOne(collections.users, { _id })
  return user && user.role === 'driver' ? user : null
}

router.get('/drivers', async (req, res) => {
  try {
    const drivers = await listDrivers()
    res.json({ drivers: drivers.map(publicDriver), line: await linePublicInfo() })
  } catch (err) {
    sendError(res, err)
  }
})

router.get('/:id/schedule', async (req, res) => {
  try {
    const driver = await findDriver(req.params.id)
    if (!driver) return res.status(404).json({ error: 'ไม่พบพนักงานขับรถ' })
    const { from, to } = rangeFromQuery(req.query)
    const trips = await findTrips({ driverIds: [req.params.id], from, to })
    res.json({ driver: publicDriver(driver), line: await linePublicInfo(), from, to, trips })
  } catch (err) {
    sendError(res, err)
  }
})

router.post('/:id/line-code', async (req, res) => {
  try {
    if (!(await isLineConfigured())) return res.status(503).json({ error: 'ระบบแจ้งเตือนผ่าน LINE ยังไม่เปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ' })
    const driver = await findDriver(req.params.id)
    if (!driver) return res.status(404).json({ error: 'ไม่พบพนักงานขับรถ' })
    const key = String(driver._id)
    if (locked(key)) return res.status(429).json({ error: 'กรอกเบอร์ผิดหลายครั้ง กรุณาลองใหม่ในอีก 15 นาที' })
    if (!driver.phone) return res.status(400).json({ error: 'ยังไม่มีเบอร์โทรของคุณในระบบ กรุณาติดต่อผู้ดูแลระบบเพื่อขอรหัส' })
    const phone = normalizePhone(req.body && req.body.phone)
    if (!phone) return res.status(400).json({ error: 'กรุณากรอกเบอร์โทรศัพท์' })
    if (phone !== normalizePhone(driver.phone)) {
      recordFailure(key)
      return res.status(403).json({ error: 'เบอร์โทรศัพท์ไม่ตรงกับข้อมูลในระบบ' })
    }
    failures.delete(key)
    const { code, expires_at } = await issueLinkCode(driver._id)
    res.json({ code, expires_at, line: await linePublicInfo() })
  } catch (err) {
    sendError(res, err)
  }
})

module.exports = router
