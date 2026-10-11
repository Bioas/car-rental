import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import {
  prepareDatabase, cleanupDatabase, require,
  loginAs, ADMIN, auth, dateRange, createUser,
} from './helpers.mjs'

await prepareDatabase('signing')
const app = require('../server.cjs')
const db = require('../db.cjs')

const SIGNATURE = 'data:image/png;base64,iVBORw0KGgo='
const STAGE_KEYS = ['vehicle_head', 'supply_officer', 'supply_head', 'deputy_director', 'director']

let adminToken
const signers = {}

beforeAll(async () => {
  await db.initDB()
  adminToken = await loginAs(app, ADMIN.email, ADMIN.password)
  // One staff account per stage, each assigned via the stage-assignment
  // endpoint — the 'staff' role itself no longer implies a specific stage.
  for (const key of STAGE_KEYS) {
    const staff = await createUser(app, adminToken, { role: 'staff', name: `Signer ${key}` })
    const res = await request(app).put(`/api/admin/stage-assignments/${key}`)
      .set(auth(adminToken)).send({ user_id: staff.id })
    expect(res.status).toBe(200)
    signers[key] = staff
  }
})

afterAll(async () => {
  await cleanupDatabase()
})

async function firstCarId() {
  const res = await request(app).get('/api/public/cars')
  return res.body.cars[0].id
}

async function createSignedBooking(index) {
  const carId = await firstCarId()
  const { start_date, end_date } = dateRange(index)
  const res = await request(app).post('/api/public/bookings').send({
    name: `ผู้ยืม ${index}`,
    phone: `0850000${String(index).padStart(3, '0')}`,
    car_id: carId,
    start_date,
    end_date,
    signature: SIGNATURE,
  })
  expect(res.status).toBe(201)
  const row = await db.findOne(db.collections.bookings, { car_id: db.toId(carId), start_date }, { sort: { _id: -1 } })
  return db.str(row._id)
}

describe('document signing', () => {
  it('rejects a public booking with no signature', async () => {
    const carId = await firstCarId()
    const { start_date, end_date } = dateRange(60)
    const res = await request(app).post('/api/public/bookings')
      .send({ name: 'ไม่มีลายเซ็น', phone: '0860000000', car_id: carId, start_date, end_date })
    expect(res.status).toBe(400)
  })

  it('starts a new booking on the first stage with all five signers remaining', async () => {
    const id = await createSignedBooking(61)
    const row = await db.findOne(db.collections.bookings, { _id: db.toId(id) })
    expect(row.approval_stage).toBe('vehicle_head')
    expect(row.doc_number).toBeGreaterThan(0)
    expect(row.signatures.requester.image).toBe(SIGNATURE)

    const lookup = await request(app).post('/api/public/bookings/lookup').send({ query: '0850000061' })
    expect(lookup.body.bookings[0].remaining_signers).toBe(5)
  })

  it('exposes signing progress to the public lookup without signature images or signer names', async () => {
    const id = await createSignedBooking(71)
    await request(app).put(`/api/signing/${id}/sign`).set(auth(signers.supply_officer.token))
      .send({ decision: 'approve', signature: SIGNATURE })

    const lookup = await request(app).post('/api/public/bookings/lookup').send({ query: '0850000071' })
    const b = lookup.body.bookings.find((row) => row.id === id)
    expect(b.approval_stage).toBe('vehicle_head')
    expect(Object.keys(b.signatures).sort()).toEqual(['requester', 'supply_officer'])
    expect(b.signatures.supply_officer.decision).toBe('approve')
    expect(b.signatures.supply_officer.signed_at).toBeTruthy()
    const raw = JSON.stringify(b.signatures)
    expect(raw).not.toContain('data:image')
    expect(raw).not.toContain('Signer supply_officer')
  })

  it('shows a new booking in every parallel-stage signer\'s queue, but not the sequential ones', async () => {
    const id = await createSignedBooking(62)
    const headQueue = await request(app).get('/api/signing/queue').set(auth(signers.vehicle_head.token))
    expect(headQueue.body.bookings.some((b) => b.id === id)).toBe(true)

    const officerQueue = await request(app).get('/api/signing/queue').set(auth(signers.supply_officer.token))
    expect(officerQueue.body.bookings.some((b) => b.id === id)).toBe(true)

    const deputyQueue = await request(app).get('/api/signing/queue').set(auth(signers.deputy_director.token))
    expect(deputyQueue.body.bookings.some((b) => b.id === id)).toBe(false)
  })

  it('lets any of the first three stages sign first (parallel, no queue between them)', async () => {
    const id = await createSignedBooking(63)
    const res = await request(app).put(`/api/signing/${id}/sign`).set(auth(signers.supply_officer.token))
      .send({ decision: 'approve', signature: SIGNATURE })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('pending') // parallel window still open

    // The two remaining parallel stages may still act in any order.
    const headSign = await request(app).put(`/api/signing/${id}/sign`).set(auth(signers.vehicle_head.token))
      .send({ decision: 'approve', signature: SIGNATURE })
    expect(headSign.status).toBe(200)

    const headQueueAfter = await request(app).get('/api/signing/queue').set(auth(signers.vehicle_head.token))
    expect(headQueueAfter.body.bookings.some((b) => b.id === id)).toBe(false)
    // supply_officer already signed, so it must be out of that signer's queue too…
    const officerQueueAfter = await request(app).get('/api/signing/queue').set(auth(signers.supply_officer.token))
    expect(officerQueueAfter.body.bookings.some((b) => b.id === id)).toBe(false)
    // …while supply_head (the last parallel member) still sees it.
    const supplyHeadQueueAfter = await request(app).get('/api/signing/queue').set(auth(signers.supply_head.token))
    expect(supplyHeadQueueAfter.body.bookings.some((b) => b.id === id)).toBe(true)
  })

  it('refuses to let an admin sign a document, while still letting the admin view the queue', async () => {
    const id = await createSignedBooking(64)
    // An admin oversees the system and may look at the queue, but never signs.
    const queue = await request(app).get('/api/signing/queue').set(auth(adminToken))
    expect(queue.status).toBe(200)
    const res = await request(app).put(`/api/signing/${id}/sign`).set(auth(adminToken))
      .send({ decision: 'approve', signature: SIGNATURE })
    expect(res.status).toBe(403)
  })

  it('still blocks a driver (never logs in, has no token at all) from the signing router', async () => {
    const id = await createSignedBooking(69)
    const res = await request(app).put(`/api/signing/${id}/sign`)
      .send({ decision: 'approve', signature: SIGNATURE })
    expect(res.status).toBe(401)
  })

  it('refuses to sign without a signature image', async () => {
    const id = await createSignedBooking(65)
    const res = await request(app).put(`/api/signing/${id}/sign`).set(auth(signers.vehicle_head.token))
      .send({ decision: 'approve' })
    expect(res.status).toBe(400)
  })

  it('blocks signing a stage that has no assigned staff member yet', async () => {
    const id = await createSignedBooking(68)
    // A staff account with no assignment at all has an empty queue and can't sign.
    const unassigned = await createUser(app, adminToken, { role: 'staff', name: 'Unassigned staff' })
    const res = await request(app).put(`/api/signing/${id}/sign`).set(auth(unassigned.token))
      .send({ decision: 'approve', signature: SIGNATURE })
    expect(res.status).toBe(409)
  })

  it('advances stage by stage and marks the booking approved once the director signs', async () => {
    const id = await createSignedBooking(66)

    for (const key of STAGE_KEYS.slice(0, -1)) {
      const res = await request(app).put(`/api/signing/${id}/sign`).set(auth(signers[key].token))
        .send({ decision: 'approve', signature: SIGNATURE })
      expect(res.status).toBe(200)
      expect(res.body.status).toBe('pending')
    }

    const final = await request(app).put(`/api/signing/${id}/sign`).set(auth(signers.director.token))
      .send({ decision: 'approve', signature: SIGNATURE })
    expect(final.status).toBe(200)
    expect(final.body.status).toBe('approved')
    expect(final.body.approval_stage).toBeNull()

    const row = await db.findOne(db.collections.bookings, { _id: db.toId(id) })
    expect(Object.keys(row.signatures).length).toBe(6) // requester + 5 staff stages
  })

  it('only lets the two decision stages reject, and ends the chain immediately when they do', async () => {
    const id = await createSignedBooking(67)

    const earlyReject = await request(app).put(`/api/signing/${id}/sign`).set(auth(signers.vehicle_head.token))
      .send({ decision: 'reject', signature: SIGNATURE })
    expect(earlyReject.status).toBe(403)

    await request(app).put(`/api/signing/${id}/sign`).set(auth(signers.vehicle_head.token))
      .send({ decision: 'approve', signature: SIGNATURE })
    await request(app).put(`/api/signing/${id}/sign`).set(auth(signers.supply_officer.token))
      .send({ decision: 'approve', signature: SIGNATURE })
    await request(app).put(`/api/signing/${id}/sign`).set(auth(signers.supply_head.token))
      .send({ decision: 'approve', signature: SIGNATURE })

    const reject = await request(app).put(`/api/signing/${id}/sign`).set(auth(signers.deputy_director.token))
      .send({ decision: 'reject', signature: SIGNATURE })
    expect(reject.status).toBe(200)
    expect(reject.body.status).toBe('rejected')
    expect(reject.body.approval_stage).toBeNull()

    const directorQueue = await request(app).get('/api/signing/queue').set(auth(signers.director.token))
    expect(directorQueue.body.bookings.some((b) => b.id === id)).toBe(false)
  })

  it('moves a booking from queue to history for the signer once they act on it', async () => {
    const id = await createSignedBooking(70)

    const beforeHistory = await request(app).get('/api/signing/history').set(auth(signers.vehicle_head.token))
    expect(beforeHistory.body.bookings.some((b) => b.id === id)).toBe(false)

    await request(app).put(`/api/signing/${id}/sign`).set(auth(signers.vehicle_head.token))
      .send({ decision: 'approve', signature: SIGNATURE })

    const afterQueue = await request(app).get('/api/signing/queue').set(auth(signers.vehicle_head.token))
    expect(afterQueue.body.bookings.some((b) => b.id === id)).toBe(false)

    const afterHistory = await request(app).get('/api/signing/history').set(auth(signers.vehicle_head.token))
    const entry = afterHistory.body.bookings.find((b) => b.id === id)
    expect(entry).toBeTruthy()
    expect(entry.signatures.vehicle_head.decision).toBe('approve')

    // A different signer's history must not pick up someone else's signature.
    const officerHistory = await request(app).get('/api/signing/history').set(auth(signers.supply_officer.token))
    expect(officerHistory.body.bookings.some((b) => b.id === id)).toBe(false)
  })
})

describe('document number setting', () => {
  it('lets an admin choose the number the next request starts from', async () => {
    const before = await request(app).get('/api/admin/settings/doc-number').set(auth(adminToken))
    expect(before.status).toBe(200)
    expect(before.body.next).toBe(before.body.last_issued + 1)

    const set = await request(app).put('/api/admin/settings/doc-number').set(auth(adminToken)).send({ next: 500 })
    expect(set.status).toBe(200)
    expect(set.body.next).toBe(500)

    const id = await createSignedBooking(76)
    const row = await db.findOne(db.collections.bookings, { _id: db.toId(id) })
    expect(row.doc_number).toBe(500)

    const after = await request(app).get('/api/admin/settings/doc-number').set(auth(adminToken))
    expect(after.body).toMatchObject({ last_issued: 500, next: 501, highest_used: 500 })
  })

  it('rejects a start number that is not a positive integer', async () => {
    for (const next of [0, -3, 1.5, 'abc', null]) {
      const res = await request(app).put('/api/admin/settings/doc-number').set(auth(adminToken)).send({ next })
      expect(res.status).toBe(400)
    }
  })
})

describe('document settings', () => {
  const put = (body) => request(app).put('/api/admin/settings/document').set(auth(adminToken)).send(body)

  it('returns defaults matching the original paper form', async () => {
    const res = await request(app).get('/api/admin/settings/document').set(auth(adminToken))
    expect(res.status).toBe(200)
    expect(res.body.org_name).toBe('วิทยาลัยเทคนิคบุรีรัมย์')
    expect(res.body.max_duration_days).toBe(0)
    expect(Object.keys(res.body.stage_titles)).toEqual(STAGE_KEYS)
  })

  it('freezes the formatted document number onto each new request', async () => {
    expect((await put({ doc_prefix: 'ศธ/', doc_suffix: '/2569' })).status).toBe(200)
    await request(app).put('/api/admin/settings/doc-number').set(auth(adminToken)).send({ next: 42 })
    const id = await createSignedBooking(77)
    const row = await db.findOne(db.collections.bookings, { _id: db.toId(id) })
    expect(row.doc_number).toBe(42)
    expect(row.doc_label).toBe('ศธ/42/2569')

    // Changing the format later does not rewrite an issued number.
    await put({ doc_prefix: '', doc_suffix: '' })
    const list = await request(app).get('/api/admin/bookings?status=all').set(auth(adminToken))
    expect(list.body.bookings.find((b) => b.id === id).doc_label).toBe('ศธ/42/2569')

    const pdf = await request(app).post(`/api/public/bookings/${id}/pdf`).send({ phone: '0850000077' })
    expect(pdf.status).toBe(200)
  })

  it('renames signing stages everywhere titles are served', async () => {
    expect((await put({ stage_titles: { supply_head: 'หัวหน้าพัสดุ (ใหม่)' } })).status).toBe(200)
    const assignments = await request(app).get('/api/admin/stage-assignments').set(auth(adminToken))
    expect(assignments.body.stages.find((s) => s.key === 'supply_head').title).toBe('หัวหน้าพัสดุ (ใหม่)')
    const pub = await request(app).get('/api/public/document-settings')
    expect(pub.body.stage_titles.supply_head).toBe('หัวหน้าพัสดุ (ใหม่)')
    // Clearing a title restores the system default.
    await put({ stage_titles: { supply_head: '' } })
    const reset = await request(app).get('/api/public/document-settings')
    expect(reset.body.stage_titles.supply_head).toBe('หัวหน้างานพัสดุ')
  })

  it('enforces the loan rules on new requests', async () => {
    const carId = await firstCarId()
    const send = (start_date, end_date) => request(app).post('/api/public/bookings').send({
      name: 'กฎการยืม', phone: '0850000078', car_id: carId, start_date, end_date, signature: SIGNATURE,
    })
    const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }

    await put({ max_duration_days: 2, max_advance_days: 400, min_notice_days: 3 })
    expect((await send(day(400), day(402))).status).toBe(400) // 3 days > 2
    expect((await send(day(1), day(1))).status).toBe(400) // under 3 days' notice
    expect((await send(day(401), day(401))).status).toBe(400) // beyond 400 days ahead
    expect((await send(day(390), day(391))).status).toBe(201)

    await put({ max_duration_days: 0, max_advance_days: 0, min_notice_days: 0 })
  })

  it('rejects invalid values', async () => {
    expect((await put({ max_duration_days: -1 })).status).toBe(400)
    expect((await put({ min_notice_days: 1.5 })).status).toBe(400)
    expect((await put({ stage_titles: { nope: 'x' } })).status).toBe(400)
    expect((await put({ org_name: 'ก'.repeat(201) })).status).toBe(400)
  })
})

describe('signing notifications', () => {
  const inbox = async (token, type) => {
    const res = await request(app).get(`/api/notifications?type=${type}`).set(auth(token))
    return res.body.notifications
  }
  const openFor = async (token, id) =>
    (await inbox(token, 'sign_request')).filter((n) => n.related_id === id && !n.is_read)
  const sign = (id, key, decision = 'approve') => request(app).put(`/api/signing/${id}/sign`)
    .set(auth(signers[key].token)).send({ decision, signature: SIGNATURE })

  it('tells each stage when the document reaches it, and admins when it is fully signed', async () => {
    const id = await createSignedBooking(80)
    // The three parallel stages are notified on submission; later stages are not.
    for (const key of STAGE_KEYS.slice(0, 3)) expect(await openFor(signers[key].token, id)).toHaveLength(1)
    expect(await openFor(signers.deputy_director.token, id)).toHaveLength(0)

    await sign(id, 'vehicle_head')
    expect(await openFor(signers.vehicle_head.token, id)).toHaveLength(0) // closed once they sign
    expect(await openFor(signers.deputy_director.token, id)).toHaveLength(0) // parallel window still open
    await sign(id, 'supply_officer')
    await sign(id, 'supply_head')
    expect(await openFor(signers.deputy_director.token, id)).toHaveLength(1)
    expect(await openFor(signers.director.token, id)).toHaveLength(0)

    await sign(id, 'deputy_director')
    expect(await openFor(signers.director.token, id)).toHaveLength(1)

    await sign(id, 'director')
    expect(await openFor(signers.director.token, id)).toHaveLength(0)
    const approved = (await inbox(adminToken, 'approved')).filter((n) => n.related_id === id)
    expect(approved).toHaveLength(1)
    expect(approved[0].message).toContain('เซ็นครบทุกขั้นแล้ว')
  })

  it('tells admins when a stage rejects the document', async () => {
    const id = await createSignedBooking(81)
    for (const key of STAGE_KEYS.slice(0, 3)) await sign(id, key)
    await sign(id, 'deputy_director', 'reject')
    const rejected = (await inbox(adminToken, 'rejected')).filter((n) => n.related_id === id)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].message).toContain('ไม่ได้รับอนุญาต')
    expect(await openFor(signers.director.token, id)).toHaveLength(0)
  })

  it('tells admins when staff reject a request outright, and closes open sign requests', async () => {
    const id = await createSignedBooking(82)
    const res = await request(app).put(`/api/admin/bookings/${id}/reject`)
      .set(auth(signers.vehicle_head.token)).send({ admin_notes: 'รถไม่ว่าง' })
    expect(res.status).toBe(200)
    const rejected = (await inbox(adminToken, 'rejected')).filter((n) => n.related_id === id)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].message).toContain('รถไม่ว่าง')
    for (const key of STAGE_KEYS.slice(0, 3)) expect(await openFor(signers[key].token, id)).toHaveLength(0)
  })
})

describe('reports', () => {
  it('summarises a range and exports it as CSV', async () => {
    const id = await createSignedBooking(79)
    for (const key of STAGE_KEYS) {
      await request(app).put(`/api/signing/${id}/sign`).set(auth(signers[key].token))
        .send({ decision: 'approve', signature: SIGNATURE })
    }
    const row = await db.findOne(db.collections.bookings, { _id: db.toId(id) })
    const q = `from=${row.start_date}&to=${row.end_date}`

    const res = await request(app).get(`/api/admin/reports/summary?${q}`).set(auth(adminToken))
    expect(res.status).toBe(200)
    expect(res.body.kpis.requests).toBeGreaterThanOrEqual(1)
    expect(res.body.kpis.approved).toBeGreaterThanOrEqual(1)
    expect(res.body.kpis.car_days).toBeGreaterThanOrEqual(1)
    expect(res.body.stage_times.map((s) => s.key)).toEqual(STAGE_KEYS)
    expect(res.body.stage_times.every((s) => s.samples >= 1)).toBe(true)
    expect(res.body.by_month.length).toBeGreaterThanOrEqual(1)
    expect(JSON.stringify(res.body)).not.toContain('data:image')

    const csv = await request(app).get(`/api/admin/reports/export?${q}`).set(auth(adminToken))
    expect(csv.status).toBe(200)
    expect(csv.headers['content-type']).toContain('text/csv')
    expect(csv.text.charCodeAt(0)).toBe(0xFEFF)
    expect(csv.text).toContain('เลขที่เอกสาร')
    expect(csv.text).toContain('ผู้ยืม 79')
    expect(csv.text).toContain('อนุมัติแล้ว')
  })

  it('serves a compact dashboard payload', async () => {
    const res = await request(app).get('/api/admin/dashboard').set(auth(adminToken))
    expect(res.status).toBe(200)
    expect(res.body.fleet.length).toBeGreaterThan(0)
    expect(res.body.fleet.every((c) => ['available', 'in_use', 'requested', 'maintenance', 'retired'].includes(c.state))).toBe(true)
    expect(Array.isArray(res.body.upcoming)).toBe(true)
    expect(res.body.new_requests.this_month).toBeGreaterThanOrEqual(1)
    expect(res.body.trend.by_month.length).toBe(6)
    expect(JSON.stringify(res.body)).not.toContain('data:image')
  })

  it('rejects an invalid range', async () => {
    const bad = await request(app).get('/api/admin/reports/summary?from=2026-05-01&to=2026-01-01').set(auth(adminToken))
    expect(bad.status).toBe(400)
    const junk = await request(app).get('/api/admin/reports/export?from=nope').set(auth(adminToken))
    expect(junk.status).toBe(400)
  })
})

describe('admin booking filters', () => {
  // An admin never signs, so every in-progress request sits under
  // "รอดำเนินการ" (awaiting_signature) until it is fully signed or rejected.
  async function adminList(status) {
    const res = await request(app).get(`/api/admin/bookings?status=${status}`).set(auth(adminToken))
    expect(res.status).toBe(200)
    return res.body.bookings.map((b) => b.id)
  }
  const sign = (id, key, decision = 'approve') => request(app).put(`/api/signing/${id}/sign`)
    .set(auth(signers[key].token)).send({ decision, signature: SIGNATURE })

  it('keeps a request under รอดำเนินการ until fully signed, then moves it to อนุมัติแล้ว', async () => {
    const id = await createSignedBooking(74)
    expect(await adminList('awaiting_signature')).toContain(id)
    expect(await adminList('approved')).not.toContain(id)

    for (const key of STAGE_KEYS.slice(0, -1)) await sign(id, key)
    expect(await adminList('awaiting_signature')).toContain(id)

    await sign(id, 'director')
    expect(await adminList('awaiting_signature')).not.toContain(id)
    expect(await adminList('approved')).toContain(id)
  })

  it('moves a rejected request from รอดำเนินการ to ปฏิเสธ', async () => {
    const id = await createSignedBooking(75)
    for (const key of STAGE_KEYS.slice(0, 3)) await sign(id, key)
    await sign(id, 'deputy_director', 'reject')
    expect(await adminList('awaiting_signature')).not.toContain(id)
    expect(await adminList('rejected')).toContain(id)
  })
})

describe('borrower phone privacy', () => {
  // The phone is the credential for public cancel/return, so no public
  // endpoint may hand it to someone who doesn't already know it.
  it('keeps borrower phone numbers out of the public calendar', async () => {
    await createSignedBooking(72)
    const res = await request(app).get('/api/public/calendar')
    expect(res.status).toBe(200)
    expect(res.body.bookings.length).toBeGreaterThan(0)
    expect(res.body.bookings.every((b) => b.user_phone === undefined)).toBe(true)
    expect(JSON.stringify(res.body)).not.toContain('0850000072')
  })

  it('releases the public PDF only for the booking\'s phone number', async () => {
    const id = await createSignedBooking(73)

    const byName = await request(app).post(`/api/public/bookings/${id}/pdf`).send({ query: 'ผู้ยืม 73' })
    expect(byName.status).toBe(400)
    const wrong = await request(app).post(`/api/public/bookings/${id}/pdf`).send({ phone: '0899999999' })
    expect(wrong.status).toBe(403)

    const ok = await request(app).post(`/api/public/bookings/${id}/pdf`).send({ phone: '085-000-0073' })
    expect(ok.status).toBe(200)
    expect(ok.headers['content-type']).toContain('application/pdf')
  })
})

describe('stages signed on paper', () => {
  const setPaper = (paper_signers) => request(app).put('/api/admin/settings/document')
    .set(auth(adminToken)).send({ paper_signers })
  const sign = (id, key, decision = 'approve') => request(app).put(`/api/signing/${id}/sign`)
    .set(auth(signers[key].token)).send({ decision, signature: SIGNATURE })
  const row = (id) => db.findOne(db.collections.bookings, { _id: db.toId(id) })
  const openFor = async (key, id) => {
    const res = await request(app).get('/api/notifications?type=sign_request').set(auth(signers[key].token))
    return res.body.notifications.filter((n) => n.related_id === id && !n.is_read)
  }
  async function adminList(status) {
    const res = await request(app).get(`/api/admin/bookings?status=${status}`).set(auth(adminToken))
    return res.body.bookings.map((b) => b.id)
  }

  afterAll(async () => {
    await setPaper({})
  })

  it('refuses to put every stage on paper', async () => {
    const res = await setPaper(Object.fromEntries(STAGE_KEYS.map((k) => [k, ''])))
    expect(res.status).toBe(400)
  })

  it('skips paper stages: approved once the in-system stages sign, names frozen for the PDF', async () => {
    expect((await setPaper({ deputy_director: '', director: 'ผอ. ทดสอบ' })).status).toBe(200)
    const id = await createSignedBooking(90)

    const created = await row(id)
    // A blank name falls back to the assigned signer's name.
    expect(created.paper_signers).toEqual({ deputy_director: 'Signer deputy_director', director: 'ผอ. ทดสอบ' })
    expect(created.approval_stage).toBe('vehicle_head')
    const lookup = await request(app).post('/api/public/bookings/lookup').send({ query: '0850000090' })
    expect(lookup.body.bookings[0].remaining_signers).toBe(3)
    // The public lookup learns which stages are on paper, never the names.
    expect(lookup.body.bookings[0].paper_signers).toEqual({ deputy_director: '', director: '' })

    for (const key of STAGE_KEYS.slice(0, 3)) expect((await sign(id, key)).status).toBe(200)
    const done = await row(id)
    expect(done.status).toBe('approved')
    expect(done.approval_stage).toBe(null)
    expect(await openFor('deputy_director', id)).toHaveLength(0)
    expect(await adminList('approved')).toContain(id)
    expect(await adminList('awaiting_signature')).not.toContain(id)

    const pdf = await request(app).get(`/api/bookings/${id}/pdf`).set(auth(adminToken))
    expect(pdf.status).toBe(200)
  })

  it('keeps a paper parallel stage out of its signer\'s queue and refuses its signature', async () => {
    await setPaper({ vehicle_head: 'หัวหน้าหมวด ทดสอบ' })
    const id = await createSignedBooking(91)
    const queue = await request(app).get('/api/signing/queue').set(auth(signers.vehicle_head.token))
    expect(queue.body.bookings.map((b) => b.id)).not.toContain(id)
    expect(await openFor('vehicle_head', id)).toHaveLength(0)
    expect((await sign(id, 'vehicle_head')).status).toBe(409)

    await sign(id, 'supply_officer')
    await sign(id, 'supply_head')
    expect((await row(id)).approval_stage).toBe('deputy_director')
    expect(await openFor('deputy_director', id)).toHaveLength(1)
  })

  it('applies a changed setting to documents still in progress, moving them forward only', async () => {
    await setPaper({})
    const id = await createSignedBooking(92)
    for (const key of STAGE_KEYS.slice(0, 3)) await sign(id, key)
    expect((await row(id)).approval_stage).toBe('deputy_director')

    // Deputy switches to paper: the document skips ahead to the director.
    const res = await setPaper({ deputy_director: '' })
    expect(res.body.updated_documents).toBeGreaterThan(0)
    expect((await row(id)).approval_stage).toBe('director')
    expect(await openFor('deputy_director', id)).toHaveLength(0)
    expect(await openFor('director', id)).toHaveLength(1)

    // Director too: nothing is left to sign in the system → approved.
    await setPaper({ deputy_director: '', director: '' })
    const done = await row(id)
    expect(done.status).toBe('approved')
    expect(done.approval_stage).toBe(null)

    // Switching back never reopens a finished document.
    await setPaper({})
    expect((await row(id)).approval_stage).toBe(null)
    expect((await row(id)).paper_signers).toEqual({ deputy_director: 'Signer deputy_director', director: 'Signer director' })
  })

  it('lets the first in-system stage pick the driver when the first three sign on paper', async () => {
    await setPaper({ vehicle_head: '', supply_officer: '', supply_head: '' })
    const id = await createSignedBooking(93)
    expect((await row(id)).approval_stage).toBe('deputy_director')
    const res = await request(app).put(`/api/signing/${id}/sign`).set(auth(signers.deputy_director.token))
      .send({ decision: 'approve', signature: SIGNATURE, self_drive: true })
    expect(res.status).toBe(200)
    expect((await row(id)).self_drive).toBe(true)
  })
})

describe('saved signature', () => {
  const token = () => signers.director.token

  it('lets a staff signer save, read back and delete their own signature', async () => {
    const empty = await request(app).get('/api/auth/me/signature').set(auth(token()))
    expect(empty.status).toBe(200)
    expect(empty.body.signature).toBe('')

    const put = await request(app).put('/api/auth/me/signature').set(auth(token())).send({ signature: SIGNATURE })
    expect(put.status).toBe(200)
    const got = await request(app).get('/api/auth/me/signature').set(auth(token()))
    expect(got.body.signature).toBe(SIGNATURE)
    expect(got.body.updated_at).toBeTruthy()

    // Never leaks into the regular profile / user listings.
    const me = await request(app).get('/api/auth/me').set(auth(token()))
    expect(JSON.stringify(me.body)).not.toContain('saved_signature')
    const users = await request(app).get('/api/admin/users').set(auth(adminToken))
    expect(JSON.stringify(users.body)).not.toContain(SIGNATURE)

    expect((await request(app).delete('/api/auth/me/signature').set(auth(token()))).status).toBe(200)
    expect((await request(app).get('/api/auth/me/signature').set(auth(token()))).body.signature).toBe('')
  })

  it('rejects anything that is not an image data URI', async () => {
    const res = await request(app).put('/api/auth/me/signature').set(auth(token())).send({ signature: 'hello' })
    expect(res.status).toBe(400)
  })

  it('is only for staff signers', async () => {
    expect((await request(app).get('/api/auth/me/signature').set(auth(adminToken))).status).toBe(403)
    expect((await request(app).get('/api/auth/me/signature')).status).toBe(401)
  })
})

describe('name titles', () => {
  const put = (body) => request(app).put('/api/admin/settings/document').set(auth(adminToken)).send(body)

  it('serves the default list publicly and lets an admin replace it', async () => {
    const before = await request(app).get('/api/public/document-settings')
    expect(before.body.name_prefixes).toEqual(['นาย', 'นาง', 'นางสาว', 'ว่าที่ร้อยตรี'])

    const res = await put({ name_prefixes: [' ดร. ', 'นาย', 'นาย', '', 'ร.ต.ต.'] })
    expect(res.status).toBe(200)
    expect(res.body.settings.name_prefixes).toEqual(['ดร.', 'นาย', 'ร.ต.ต.']) // trimmed, de-duplicated, blanks dropped
    expect((await request(app).get('/api/public/document-settings')).body.name_prefixes).toEqual(['ดร.', 'นาย', 'ร.ต.ต.'])

    expect((await put({ name_prefixes: [] })).status).toBe(400)
    expect((await put({ name_prefixes: 'นาย' })).status).toBe(400)
    await put({ name_prefixes: ['นาย', 'นาง', 'นางสาว', 'ว่าที่ร้อยตรี'] })
  })

  it('writes abbreviations onto the name and spaces out full titles', async () => {
    const { joinNamePrefix } = require('../lib/names.cjs')
    expect(joinNamePrefix('นางสาว', 'สุดา ใจดี')).toBe('นางสาวสุดา ใจดี')
    expect(joinNamePrefix('ดร.', 'สมชาย ใจดี')).toBe('ดร.สมชาย ใจดี')
    expect(joinNamePrefix('ว่าที่ร้อยตรี', 'บุญฤทธิ์ ใจดี')).toBe('ว่าที่ร้อยตรี บุญฤทธิ์ ใจดี')
    expect(joinNamePrefix('', 'สมชาย')).toBe('สมชาย')
  })
})

describe('own profile', () => {
  it('lets a user edit their name, phone and position but not email or role', async () => {
    const u = await createUser(app, adminToken, { role: 'staff', name: 'Profile User' })
    const res = await request(app).put('/api/auth/me').set(auth(u.token))
      .send({ name: '  นายใหม่ ชื่อใหม่ ', phone: '081-111-2222', position: 'ครู', email: 'hacker@x.com', role: 'admin' })
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ name: 'นายใหม่ ชื่อใหม่', phone: '081-111-2222', position: 'ครู', email: u.email, role: 'staff' })

    expect((await request(app).put('/api/auth/me').set(auth(u.token)).send({ name: '   ' })).status).toBe(400)
  })

  it('changes the password, keeps this session via a new token and signs out the old ones', async () => {
    const u = await createUser(app, adminToken, { role: 'staff', name: 'Password User' })
    const change = (body, token = u.token) => request(app).put('/api/auth/me/password').set(auth(token)).send(body)

    expect((await change({ current_password: 'wrong-one', new_password: 'newsecret1' })).status).toBe(400)
    expect((await change({ current_password: u.password, new_password: '123' })).status).toBe(400)
    expect((await change({ current_password: u.password, new_password: u.password })).status).toBe(400)

    const ok = await change({ current_password: u.password, new_password: 'newsecret1' })
    expect(ok.status).toBe(200)
    expect(ok.body.token).toBeTruthy()

    // The old token is revoked; the returned one works.
    expect((await request(app).get('/api/auth/me').set(auth(u.token))).status).toBe(401)
    expect((await request(app).get('/api/auth/me').set(auth(ok.body.token))).status).toBe(200)
    // Only the new password logs in.
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: u.password })).status).toBe(401)
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: 'newsecret1' })).status).toBe(200)
  })
})

describe('stage assignments', () => {
  it('lets an admin list and reassign stage signers', async () => {
    const res = await request(app).get('/api/admin/stage-assignments').set(auth(adminToken))
    expect(res.status).toBe(200)
    expect(res.body.stages.length).toBe(5)
    const vehicleHead = res.body.stages.find((s) => s.key === 'vehicle_head')
    expect(vehicleHead.user_id).toBe(signers.vehicle_head.id)
  })

  it('refuses to assign a non-staff user to a stage', async () => {
    const driver = await request(app).post('/api/admin/users').set(auth(adminToken))
      .send({ name: 'Some Driver', email: `driver-${Date.now()}@example.com`, role: 'driver' })
    expect(driver.status).toBe(201)
    const res = await request(app).put('/api/admin/stage-assignments/vehicle_head')
      .set(auth(adminToken)).send({ user_id: driver.body.user.id })
    expect(res.status).toBe(400)
  })

  it('rejects an invalid stage key', async () => {
    const res = await request(app).put('/api/admin/stage-assignments/not-a-stage')
      .set(auth(adminToken)).send({ user_id: signers.vehicle_head.id })
    expect(res.status).toBe(400)
  })
})
