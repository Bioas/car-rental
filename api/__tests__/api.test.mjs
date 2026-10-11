import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import {
  prepareDatabase, cleanupDatabase, require,
  loginAs, ADMIN, auth, dateRange, createAdmin, createUser,
} from './helpers.mjs'

await prepareDatabase('api')
const app = require('../server.cjs')
const db = require('../db.cjs')

let adminToken
// Loan requests are managed by staff only — an admin is a read-only viewer.
let staffToken

beforeAll(async () => {
  await db.initDB()
  adminToken = await loginAs(app, ADMIN.email, ADMIN.password)
  staffToken = (await createUser(app, adminToken, { role: 'staff', name: 'Booking Staff' })).token
})

afterAll(async () => {
  await cleanupDatabase()
})

async function cars() {
  const res = await request(app).get('/api/cars').set(auth(adminToken))
  return res.body.cars
}

// ─────────────────────────── auth ───────────────────────────

describe(`auth`, () => {
  it('logs in and never leaks the password hash or token_version', async () => {
    const res = await request(app).post('/api/auth/login').send(ADMIN)
    expect(res.status).toBe(200)
    expect(res.body.token).toBeTruthy()
    expect(res.body.user.password).toBeUndefined()
    expect(res.body.user.token_version).toBeUndefined()
    expect(res.body.user.role).toBe('admin')
  })

  it('rejects a wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: 'nope' })
    expect(res.status).toBe(401)
  })

  it('refuses to sign a driver in — drivers have no password and cannot log in', async () => {
    const driver = await db.findOne(db.collections.users, { role: 'driver' })
    expect(driver).toBeTruthy()
    const res = await request(app).post('/api/auth/login').send({ email: driver.email, password: 'anything' })
    expect(res.status).toBe(401)
  })

  it('has no public self-registration endpoint', async () => {
    // Every account is provisioned by an existing admin via /api/admin/users —
    // there is no way for an anonymous caller to create one.
    const res = await request(app).post('/api/auth/register')
      .send({ name: 'Sneaky', email: `sneaky-${Date.now()}@example.com`, password: 'secret123', role: 'admin' })
    expect(res.status).toBe(404)
  })

  it('validates password length and duplicate email when an admin creates an account', async () => {
    expect((await request(app).post('/api/admin/users').set(auth(adminToken))
      .send({ name: 'A', email: `short-${Date.now()}@example.com`, password: '123', role: 'admin' })).status).toBe(400)
    expect((await request(app).post('/api/admin/users').set(auth(adminToken))
      .send({ name: 'A', email: ADMIN.email, password: 'secret123', role: 'admin' })).status).toBe(409)
  })

  it('protects /auth/me with a token', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401)
    const res = await request(app).get('/api/auth/me').set(auth(adminToken))
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe(ADMIN.email)
  })
})

// ─────────────────────────── cars ───────────────────────────

describe(`cars`, () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/cars')).status).toBe(401)
  })

  it('lists cars with a numeric has_active_booking flag', async () => {
    const list = await cars()
    expect(list.length).toBeGreaterThan(0)
    expect([0, 1]).toContain(list[0].has_active_booking)
    expect(list[0].image).toBeUndefined()
  })

  it('searches case-insensitively', async () => {
    const lower = await request(app).get('/api/cars?q=toyota').set(auth(adminToken))
    const upper = await request(app).get('/api/cars?q=TOYOTA').set(auth(adminToken))
    expect(lower.body.cars.length).toBeGreaterThan(0)
    expect(lower.body.cars.length).toBe(upper.body.cars.length)
  })
})

// ─────────────────────────── bookings ───────────────────────────

describe(`bookings`, () => {
  let carId
  let bookedCarId

  it('creates a booking for an available car', async () => {
    const list = await cars()
    bookedCarId = list[0].id
    carId = list[1].id
    const { start_date, end_date } = dateRange(0)

    const res = await request(app).post('/api/bookings')
      .set(auth(staffToken))
      .send({ car_id: bookedCarId, start_date, end_date, purpose: 'ทดสอบ', name: 'ผู้ยืมทดสอบ', phone: '0811111111' })

    expect(res.status).toBe(201)
    expect(res.body.booking.status).toBe('pending')
    expect(res.body.booking.car_id).toBe(bookedCarId)
    expect(res.body.booking.user_name).toBe('ผู้ยืมทดสอบ')
  })

  it('prepends the selected title to the stored borrower name', async () => {
    const { start_date, end_date } = dateRange(0)
    const res = await request(app).post('/api/bookings')
      .set(auth(staffToken))
      .send({ car_id: carId, start_date, end_date, prefix: 'นาย', name: 'สมชาย ใจดี', phone: '0822222222' })
    expect(res.status).toBe(201)
    expect(res.body.booking.user_name).toBe('นายสมชาย ใจดี')
  })

  it('requires a borrower name', async () => {
    const { start_date, end_date } = dateRange(0)
    const res = await request(app).post('/api/bookings')
      .set(auth(staffToken))
      .send({ car_id: bookedCarId, start_date, end_date })
    expect(res.status).toBe(400)
  })

  it('rejects an overlapping booking for the same car', async () => {
    const { start_date, end_date } = dateRange(0)
    const res = await request(app).post('/api/bookings')
      .set(auth(staffToken))
      .send({ car_id: bookedCarId, start_date, end_date, name: 'ผู้ยืมทดสอบ', phone: '0811111111' })
    expect(res.status).toBe(409)
  })

  it('allows a booking for the same car on non-overlapping dates', async () => {
    const { start_date, end_date } = dateRange(1)
    const res = await request(app).post('/api/bookings')
      .set(auth(staffToken))
      .send({ car_id: bookedCarId, start_date, end_date, name: 'ผู้ยืมทดสอบ', phone: '0811111111' })
    expect(res.status).toBe(201)
  })

  it('validates the dates before touching the database', async () => {
    const cases = [
      { car_id: carId, start_date: '01/12/2031', end_date: '05/12/2031', name: 'ผู้ยืมทดสอบ', phone: '0811111111' },
      { car_id: carId, start_date: '2031-02-30', end_date: '2031-03-02', name: 'ผู้ยืมทดสอบ', phone: '0811111111' },
      { car_id: carId, start_date: '2031-05-10', end_date: '2031-05-01', name: 'ผู้ยืมทดสอบ', phone: '0811111111' },
    ]
    for (const body of cases) {
      const res = await request(app).post('/api/bookings').set(auth(staffToken)).send(body)
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
  })

  it('404s for a car that does not exist', async () => {
    const { start_date, end_date } = dateRange(5)
    const res = await request(app).post('/api/bookings')
      .set(auth(staffToken))
      .send({ car_id: '000000000000000000000000', start_date, end_date, name: 'ผู้ยืมทดสอบ', phone: '0811111111' })
    expect(res.status).toBe(404)
  })

  it('exposes bookings on the calendar feed', async () => {
    const res = await request(app).get('/api/bookings/calendar').set(auth(adminToken))
    expect(res.status).toBe(200)
    expect(res.body.bookings.some((b) => b.car_id === bookedCarId)).toBe(true)
  })

  it('notifies every admin about a new request', async () => {
    const res = await request(app).get('/api/notifications').set(auth(adminToken))
    expect(res.status).toBe(200)
    expect(res.body.notifications.some((n) => n.type === 'booking_request')).toBe(true)
  })

  it('filters, counts, pages and deletes notifications', async () => {
    const get = (q = '') => request(app).get(`/api/notifications${q}`).set(auth(adminToken))
    const all = await get()
    expect(all.body.counts.all).toBeGreaterThan(0)
    expect(all.body.counts.booking_request.total).toBeGreaterThan(0)

    const typed = await get('?type=booking_request')
    expect(typed.body.notifications.every((n) => n.type === 'booking_request')).toBe(true)

    const page = await get('?limit=1')
    expect(page.body.notifications.length).toBe(1)
    if (all.body.counts.all > 1) {
      expect(page.body.has_more).toBe(true)
      const next = await get(`?limit=1&before=${encodeURIComponent(page.body.notifications[0].created_at)}`)
      expect(next.body.notifications[0].id).not.toBe(page.body.notifications[0].id)
    }

    // The related request opens through the admin single-booking endpoint.
    const related = all.body.notifications.find((n) => n.related_id)
    const booking = await request(app).get(`/api/admin/bookings/${related.related_id}`).set(auth(adminToken))
    expect(booking.status).toBe(200)
    expect(booking.body.booking.id).toBe(related.related_id)

    const target = all.body.notifications[0]
    await request(app).put(`/api/notifications/${target.id}/read`).set(auth(adminToken))
    const onlyUnread = await get('?unread=1')
    expect(onlyUnread.body.notifications.some((n) => n.id === target.id)).toBe(false)

    expect((await request(app).delete(`/api/notifications/${target.id}`).set(auth(adminToken))).status).toBe(200)
    expect((await request(app).delete(`/api/notifications/${target.id}`).set(auth(adminToken))).status).toBe(404)

    await request(app).put('/api/notifications/read-all').set(auth(adminToken))
    const cleared = await request(app).delete('/api/notifications/read').set(auth(adminToken))
    expect(cleared.status).toBe(200)
    expect((await get()).body.counts.all).toBe(0)
  })
})

// ─────────────────────────── admin ───────────────────────────

describe(`admin`, () => {
  let pendingBookingId
  let approvedBookingId

  it('refuses a non-admin session', async () => {
    // The app no longer lets anyone create or sign into a non-admin,
    // non-driver account, but adminMiddleware must still reject one if it
    // ever existed — insert one directly to exercise that defense without
    // going through the (now admin/driver-only) account-creation API.
    const bcrypt = require('bcryptjs')
    const email = `guest-${Date.now()}@example.com`
    await db.insertOne(db.collections.users, {
      name: 'Guest', email, password: await bcrypt.hash('secret123', 10),
      role: 'guest', token_version: 0, created_at: new Date(),
    })
    const token = await loginAs(app, email, 'secret123')
    expect((await request(app).get('/api/admin/bookings').set(auth(token))).status).toBe(403)
    expect((await request(app).get('/api/admin/users').set(auth(token))).status).toBe(403)
  })

  it('returns every booking when no paging is requested', async () => {
    const res = await request(app).get('/api/admin/bookings').set(auth(adminToken))
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.bookings)).toBe(true)
    expect(res.body.counts.all).toBe(res.body.bookings.length)
    expect(res.body.total).toBeUndefined()
  })

  it('pages bookings and reports the totals', async () => {
    const all = await request(app).get('/api/admin/bookings').set(auth(adminToken))
    const total = all.body.counts.all
    expect(total).toBeGreaterThan(1)

    const res = await request(app).get('/api/admin/bookings?page=1&limit=2').set(auth(adminToken))
    expect(res.status).toBe(200)
    expect(res.body.bookings.length).toBe(2)
    expect(res.body.total).toBe(total)
    expect(res.body.limit).toBe(2)
    expect(res.body.pages).toBe(Math.ceil(total / 2))

    const second = await request(app).get('/api/admin/bookings?page=2&limit=2').set(auth(adminToken))
    const firstIds = res.body.bookings.map((b) => b.id)
    expect(second.body.bookings.every((b) => !firstIds.includes(b.id))).toBe(true)
  })

  it('filters by status on the server', async () => {
    const res = await request(app).get('/api/admin/bookings?status=pending&page=1&limit=10').set(auth(adminToken))
    expect(res.status).toBe(200)
    expect(res.body.bookings.every((b) => b.status === 'pending')).toBe(true)
    expect(res.body.total).toBe(res.body.counts.pending)
  })

  it('pages users', async () => {
    const res = await request(app).get('/api/admin/users?page=1&limit=1').set(auth(adminToken))
    expect(res.status).toBe(200)
    expect(res.body.users.length).toBe(1)
    expect(res.body.total).toBeGreaterThan(1)
    expect(res.body.pages).toBeGreaterThan(1)
    expect(res.body.users[0].password).toBeUndefined()
  })

  it('caps an absurd limit instead of honouring it', async () => {
    const res = await request(app).get('/api/admin/bookings?limit=100000').set(auth(adminToken))
    expect(res.body.limit).toBe(100)
  })

  it('lets an admin view loan requests but not manage them', async () => {
    const list = await request(app).get('/api/admin/bookings?status=pending').set(auth(adminToken))
    expect(list.status).toBe(200)
    const id = list.body.bookings[0].id
    for (const action of ['approve', 'reject', 'return']) {
      const res = await request(app).put(`/api/admin/bookings/${id}/${action}`).set(auth(adminToken)).send({})
      expect(res.status).toBe(403)
    }
    const { start_date, end_date } = dateRange(40)
    const create = await request(app).post('/api/bookings').set(auth(adminToken))
      .send({ car_id: (await cars())[0].id, start_date, end_date, name: 'ผู้ดูแล', phone: '0800000001' })
    expect(create.status).toBe(403)
    const row = await db.findOne(db.collections.bookings, { _id: db.toId(id) })
    expect(row.status).toBe('pending')
  })

  it('approves a pending booking once', async () => {
    const list = await request(app).get('/api/admin/bookings?status=pending').set(auth(adminToken))
    pendingBookingId = list.body.bookings[0].id
    approvedBookingId = list.body.bookings[1] ? list.body.bookings[1].id : pendingBookingId

    const res = await request(app).put(`/api/admin/bookings/${pendingBookingId}/approve`).set(auth(staffToken))
    expect(res.status).toBe(200)

    const again = await request(app).put(`/api/admin/bookings/${pendingBookingId}/approve`).set(auth(staffToken))
    expect(again.status).toBe(400)
  })

  it('builds monthly report buckets in a portable way', async () => {
    const res = await request(app).get('/api/admin/reports').set(auth(adminToken))
    expect(res.status).toBe(200)
    expect(typeof res.body.stats.totalBookings).toBe('number')
    expect(res.body.stats.totalBookings).toBeGreaterThan(0)
    for (const month of res.body.bookingsByMonth) {
      expect(month.month).toMatch(/^\d{4}-\d{2}$/)
      expect(typeof month.count).toBe('number')
    }
    expect(Array.isArray(res.body.bookingsByCar)).toBe(true)
  })

  it('refuses to demote or delete the last admin', async () => {
    const admins = await db.find(db.collections.users, { role: 'admin' })
    expect(admins.length).toBe(1)
    const adminId = db.str(admins[0]._id)

    const demote = await request(app).put(`/api/admin/users/${adminId}`)
      .set(auth(adminToken)).send({ role: 'driver' })
    expect(demote.status).toBe(400)

    const remove = await request(app).delete(`/api/admin/users/${adminId}`).set(auth(adminToken))
    expect(remove.status).toBe(400)
  })

  it('rejects an unknown role', async () => {
    const target = await db.findOne(db.collections.users, { role: 'driver' })
    const res = await request(app).put(`/api/admin/users/${db.str(target._id)}`)
      .set(auth(adminToken)).send({ role: 'superuser' })
    expect(res.status).toBe(400)
  })

  it('revokes existing tokens when an admin changes a password', async () => {
    const fresh = await createAdmin(app, adminToken, { name: 'Rotate Me', email: `rotate-${Date.now()}@example.com`, password: 'firstpass' })
    const oldToken = fresh.token
    const id = fresh.id

    expect((await request(app).get('/api/auth/me').set(auth(oldToken))).status).toBe(200)

    const change = await request(app).put(`/api/admin/users/${id}`)
      .set(auth(adminToken)).send({ password: 'secondpass' })
    expect(change.status).toBe(200)

    expect((await request(app).get('/api/auth/me').set(auth(oldToken))).status).toBe(401)
    expect((await request(app).post('/api/auth/login')
      .send({ email: fresh.email, password: 'secondpass' })).status).toBe(200)
    expect((await request(app).post('/api/auth/login')
      .send({ email: fresh.email, password: 'firstpass' })).status).toBe(401)
  })

  it('rejects a booking that is not pending', async () => {
    const res = await request(app).put(`/api/admin/bookings/${pendingBookingId}/reject`)
      .set(auth(staffToken)).send({ admin_notes: 'too late' })
    expect(res.status).toBe(400)
    expect(approvedBookingId).toBeTruthy()
  })

  it('records a return only for approved bookings', async () => {
    const notApproved = await db.findOne(db.collections.bookings, { status: 'pending' })
    if (notApproved) {
      expect((await request(app).put(`/api/admin/bookings/${db.str(notApproved._id)}/return`).set(auth(staffToken))).status).toBe(400)
    }
    const res = await request(app).put(`/api/admin/bookings/${pendingBookingId}/return`).set(auth(staffToken))
    expect(res.status).toBe(200)
  })

  it('does not allow deleting your own account', async () => {
    const me = await db.findOne(db.collections.users, { email: ADMIN.email })
    const res = await request(app).delete(`/api/admin/users/${db.str(me._id)}`).set(auth(adminToken))
    expect(res.status).toBe(400)
  })
})

// ─────────────────────────── public ───────────────────────────

describe(`public booking`, () => {
  const stamp = Date.now()
  const borrower = { name: `ผู้ยืม ${stamp}`, phone: `08${stamp}` }
  const signature = 'data:image/png;base64,iVBORw0KGgo='
  let bookedCarId
  let publicBookingId

  it('lists available cars without authentication', async () => {
    const res = await request(app).get('/api/public/cars')
    expect(res.status).toBe(200)
    expect(res.body.cars.length).toBeGreaterThan(0)
    expect(typeof res.body.cars[0].active_booking_count).toBe('number')
  })

  it('rejects a malformed date filter', async () => {
    const res = await request(app).get('/api/public/cars?start_date=01/12/2031&end_date=05/12/2031')
    expect(res.status).toBe(400)
  })

  it('creates a booking with the borrower name/phone stored directly on it, not as an account', async () => {
    const list = await request(app).get('/api/public/cars')
    bookedCarId = list.body.cars[list.body.cars.length - 1].id
    const { start_date, end_date } = dateRange(21)

    const res = await request(app).post('/api/public/bookings')
      .send({ ...borrower, car_id: bookedCarId, start_date, end_date, signature })
    expect(res.status).toBe(201)

    const row = await db.findOne(db.collections.bookings, { car_id: db.toId(bookedCarId) }, { sort: { _id: -1 } })
    publicBookingId = db.str(row._id)
    expect(row.user_id).toBeNull()
    expect(row.user_name).toBe(borrower.name)
    expect(row.user_phone).toBe(borrower.phone)

    expect(await db.countDocuments(db.collections.users, { name: borrower.name })).toBe(0)
  })

  it('folds the selected title into the borrower name and the requester signature', async () => {
    const { start_date, end_date } = dateRange(25)
    const res = await request(app).post('/api/public/bookings')
      .send({ prefix: 'นางสาว', name: 'ทดสอบคำนำหน้า', phone: '0833333333', car_id: bookedCarId, start_date, end_date, signature })
    expect(res.status).toBe(201)

    const row = await db.findOne(db.collections.bookings, { user_name: 'นางสาวทดสอบคำนำหน้า' })
    expect(row).toBeTruthy()
    expect(row.signatures.requester.name).toBe('นางสาวทดสอบคำนำหน้า')
  })

  it('lets a second booking reuse the same borrower name without ever touching the users collection', async () => {
    const { start_date, end_date } = dateRange(22)
    const res = await request(app).post('/api/public/bookings')
      .send({ name: borrower.name, phone: '0899999999', car_id: bookedCarId, start_date, end_date, signature })
    expect(res.status).toBe(201)

    expect(await db.countDocuments(db.collections.users, { name: borrower.name })).toBe(0)
    const bookings = await db.find(db.collections.bookings, { user_name: borrower.name })
    expect(bookings.length).toBe(2)
  })

  it('hides the booked car for a clashing date range', async () => {
    const { start_date, end_date } = dateRange(21)
    const res = await request(app)
      .get(`/api/public/cars?start_date=${start_date}&end_date=${end_date}`)
    expect(res.status).toBe(200)
    expect(res.body.cars.some((c) => c.id === bookedCarId)).toBe(false)
    expect(res.body.cars.every((c) => typeof c.active_booking_count === 'number')).toBe(true)
  })

  it('looks bookings up by phone without leaking admin notes', async () => {
    const res = await request(app).post('/api/public/bookings/lookup').send({ query: borrower.phone })
    expect(res.status).toBe(200)
    expect(res.body.bookings.length).toBeGreaterThan(0)
    expect(res.body.bookings.every((b) => b.admin_notes === undefined)).toBe(true)
  })

  it('returns nothing for a phone number that matches no booking', async () => {
    const res = await request(app).post('/api/public/bookings/lookup').send({ query: '9999999999' })
    expect(res.status).toBe(200)
    expect(res.body.bookings).toEqual([])
  })

  it('refuses to cancel with the wrong phone number', async () => {
    const res = await request(app).post(`/api/public/bookings/${publicBookingId}/cancel`)
      .send({ phone: '0899999998' })
    expect(res.status).toBe(403)
  })

  it('cancels a pending booking with the right phone number, and only once', async () => {
    const res = await request(app).post(`/api/public/bookings/${publicBookingId}/cancel`)
      .send({ phone: borrower.phone })
    expect(res.status).toBe(200)

    const again = await request(app).post(`/api/public/bookings/${publicBookingId}/cancel`)
      .send({ phone: borrower.phone })
    expect(again.status).toBe(404)
  })

  it('returns a car through the public flow exactly once', async () => {
    const { start_date, end_date } = dateRange(23)
    await request(app).post('/api/public/bookings')
      .send({ ...borrower, car_id: bookedCarId, start_date, end_date, signature })

    const booking = await db.findOne(
      db.collections.bookings,
      { car_id: db.toId(bookedCarId), status: 'pending' },
      { sort: { _id: -1 } }
    )
    expect((await request(app).put(`/api/admin/bookings/${db.str(booking._id)}/approve`).set(auth(staffToken))).status).toBe(200)

    const first = await request(app).post(`/api/public/bookings/${db.str(booking._id)}/return`)
      .send({ phone: borrower.phone })
    expect(first.status).toBe(200)

    const second = await request(app).post(`/api/public/bookings/${db.str(booking._id)}/return`)
      .send({ phone: borrower.phone })
    expect(second.status).toBe(400)
  })

  it('refuses to return a booking that was never approved', async () => {
    const { start_date, end_date } = dateRange(24)
    await request(app).post('/api/public/bookings')
      .send({ ...borrower, car_id: bookedCarId, start_date, end_date, signature })
    const booking = await db.findOne(
      db.collections.bookings,
      { car_id: db.toId(bookedCarId), status: 'pending' },
      { sort: { _id: -1 } }
    )
    const res = await request(app).post(`/api/public/bookings/${db.str(booking._id)}/return`)
      .send({ phone: borrower.phone })
    expect(res.status).toBe(400)
  })
})

// ─────────────────── per-user signing status tabs ───────────────────

// The three signature tabs are personal to the signed-in signer: "รออนุมัติ" is
// what still waits on *their* stage, "รอดำเนินการ" is what they have already
// signed but which is not fully signed, and "อนุมัติแล้ว" is document-wide and
// only fills up once every stage has signed.
describe(`per-user signing status`, () => {
  let signerA // assigned เจ้าหน้าที่งานพัสดุ — a parallel, first-three stage
  let signerB // assigned รองผู้อำนวยการ — a later, sequential decision stage
  let bookingId

  async function insertBooking(extra = {}) {
    const car = await db.findOne(db.collections.cars, {})
    return db.insertOne(db.collections.bookings, {
      user_id: null,
      user_name: 'ผู้ยืม ทดสอบ',
      user_phone: '0800000000',
      car_id: car._id,
      start_date: '2035-05-01',
      end_date: '2035-05-03',
      purpose: 'ทดสอบสถานะรายบุคคล',
      status: 'pending',
      approval_stage: 'vehicle_head',
      signatures: {
        requester: { name: 'ผู้ยืม ทดสอบ', image: 'data:image/png;base64,iVBORw0KGgo=', decision: 'approve', signed_at: new Date() },
      },
      created_at: new Date(),
      updated_at: new Date(),
      ...extra,
    })
  }

  beforeAll(async () => {
    signerA = await createUser(app, adminToken, { name: 'ผู้เซ็น A', role: 'staff' })
    signerB = await createUser(app, adminToken, { name: 'ผู้เซ็น B', role: 'staff' })
    await db.updateOne(db.collections.settings, { _id: 'supply_officer' },
      { $set: { user_id: db.toId(signerA.id) } }, { upsert: true })
    await db.updateOne(db.collections.settings, { _id: 'deputy_director' },
      { $set: { user_id: db.toId(signerB.id) } }, { upsert: true })
    bookingId = db.str(await insertBooking())
  })

  afterAll(async () => {
    await db.deleteOne(db.collections.settings, { _id: 'supply_officer' })
    await db.deleteOne(db.collections.settings, { _id: 'deputy_director' })
    await db.deleteMany(db.collections.bookings, { start_date: '2035-05-01' })
  })

  it('shows the document as รออนุมัติ for the signer it waits on, not for the others', async () => {
    const a = await request(app).get('/api/admin/bookings?status=pending').set(auth(signerA.token))
    expect(a.body.bookings.some((b) => b.id === bookingId)).toBe(true)

    const b = await request(app).get('/api/admin/bookings?status=pending').set(auth(signerB.token))
    expect(b.body.bookings.some((x) => x.id === bookingId)).toBe(false)
  })

  it('moves it to รอดำเนินการ for that signer once they sign', async () => {
    const sign = await request(app).put(`/api/signing/${bookingId}/sign`).set(auth(signerA.token))
      .send({
        decision: 'approve',
        signature: 'data:image/png;base64,iVBORw0KGgo=',
        position: 'เจ้าหน้าที่งานพัสดุ',
        self_drive: true,
      })
    expect(sign.status).toBe(200)
    // Not every stage has signed, so the document is not approved yet.
    expect(sign.body.status).toBe('pending')

    const pending = await request(app).get('/api/admin/bookings?status=pending').set(auth(signerA.token))
    expect(pending.body.bookings.some((b) => b.id === bookingId)).toBe(false)

    const awaiting = await request(app).get('/api/admin/bookings?status=awaiting_signature').set(auth(signerA.token))
    expect(awaiting.body.bookings.some((b) => b.id === bookingId)).toBe(true)
    expect(awaiting.body.counts.awaiting_signature).toBeGreaterThan(0)
  })

  it('records the driver a first-three signer chose while signing', async () => {
    const doc = await db.findOne(db.collections.bookings, { _id: db.toId(bookingId) })
    expect(doc.self_drive).toBe(true)
    expect(doc.driver_id).toBeFalsy()
  })

  it('keeps อนุมัติแล้ว empty while a stage is still unsigned', async () => {
    const approved = await request(app).get('/api/admin/bookings?status=approved').set(auth(adminToken))
    expect(approved.body.bookings.some((b) => b.id === bookingId)).toBe(false)
  })

  it('still lets a signer sign a document that was approved early', async () => {
    const id = await insertBooking({
      status: 'approved',
      approval_stage: 'supply_officer',
      self_drive: true,
      signatures: {
        requester: { name: 'ผู้ยืม ทดสอบ', image: 'x', decision: 'approve', signed_at: new Date() },
        vehicle_head: { user_id: db.toId(signerB.id), name: 'หัวหน้า', image: 'x', decision: 'approve', signed_at: new Date() },
      },
    })
    const sid = db.str(id)

    const queue = await request(app).get('/api/signing/queue').set(auth(signerA.token))
    expect(queue.body.bookings.some((b) => b.id === sid)).toBe(true)

    const sign = await request(app).put(`/api/signing/${sid}/sign`).set(auth(signerA.token))
      .send({ decision: 'approve', signature: 'data:image/png;base64,iVBORw0KGgo=', position: 'เจ้าหน้าที่งานพัสดุ' })
    expect(sign.status).toBe(200)
  })
})
