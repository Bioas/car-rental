import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import {
  prepareDatabase, cleanupDatabase, require,
  loginAs, ADMIN, USER, auth, dateRange,
} from './helpers.mjs'

await prepareDatabase()
const app = require('../server.cjs')
const db = require('../db.cjs')

let adminToken
let userToken

beforeAll(async () => {
  await db.initDB()
  adminToken = await loginAs(app, ADMIN.email, ADMIN.password)
  userToken = await loginAs(app, USER.email, USER.password)
})

afterAll(async () => {
  await db.close()
  cleanupDatabase()
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

  it('always registers a plain user, even when asked for admin', async () => {
    const email = `sneaky-${Date.now()}@example.com`
    const res = await request(app).post('/api/auth/register')
      .send({ name: 'Sneaky', email, password: 'secret123', role: 'admin' })
    expect(res.status).toBe(201)
    expect(res.body.user.role).toBe('user')

    const rows = await db.all('SELECT role FROM users WHERE email = ?', [email])
    expect(rows[0].role).toBe('user')
  })

  it('accepts registration without a phone number (no undefined binding)', async () => {
    const res = await request(app).post('/api/auth/register')
      .send({ name: 'No Phone', email: `nophone-${Date.now()}@example.com`, password: 'secret123' })
    expect(res.status).toBe(201)
  })

  it('validates email, password length and duplicates', async () => {
    expect((await request(app).post('/api/auth/register')
      .send({ name: 'A', email: 'not-an-email', password: 'secret123' })).status).toBe(400)
    expect((await request(app).post('/api/auth/register')
      .send({ name: 'A', email: 'short@example.com', password: '123' })).status).toBe(400)
    expect((await request(app).post('/api/auth/register')
      .send({ name: 'A', email: ADMIN.email, password: 'secret123' })).status).toBe(409)
  })

  it('protects /auth/me with a token', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401)
    const res = await request(app).get('/api/auth/me').set(auth(userToken))
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe(USER.email)
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
      .set(auth(userToken))
      .send({ car_id: bookedCarId, start_date, end_date, purpose: 'ทดสอบ' })

    expect(res.status).toBe(201)
    expect(res.body.booking.status).toBe('pending')
    expect(res.body.booking.car_id).toBe(bookedCarId)
  })

  it('rejects an overlapping booking for the same car', async () => {
    const { start_date, end_date } = dateRange(0)
    const res = await request(app).post('/api/bookings')
      .set(auth(userToken))
      .send({ car_id: bookedCarId, start_date, end_date })
    expect(res.status).toBe(409)
  })

  it('allows a booking for the same car on non-overlapping dates', async () => {
    const { start_date, end_date } = dateRange(1)
    const res = await request(app).post('/api/bookings')
      .set(auth(userToken))
      .send({ car_id: bookedCarId, start_date, end_date })
    expect(res.status).toBe(201)
  })

  it('validates the dates before touching the database', async () => {
    const cases = [
      { car_id: carId, start_date: '01/12/2031', end_date: '05/12/2031' },
      { car_id: carId, start_date: '2031-02-30', end_date: '2031-03-02' },
      { car_id: carId, start_date: '2031-05-10', end_date: '2031-05-01' },
    ]
    for (const body of cases) {
      const res = await request(app).post('/api/bookings').set(auth(userToken)).send(body)
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
  })

  it('404s for a car that does not exist', async () => {
    const { start_date, end_date } = dateRange(5)
    const res = await request(app).post('/api/bookings')
      .set(auth(userToken))
      .send({ car_id: 999_999, start_date, end_date })
    expect(res.status).toBe(404)
  })

  it('exposes bookings on the calendar feed', async () => {
    const res = await request(app).get('/api/bookings/calendar').set(auth(userToken))
    expect(res.status).toBe(200)
    expect(res.body.bookings.some((b) => b.car_id === bookedCarId)).toBe(true)
  })

  it('notifies every admin about a new request', async () => {
    const res = await request(app).get('/api/notifications').set(auth(adminToken))
    expect(res.status).toBe(200)
    expect(res.body.notifications.some((n) => n.type === 'booking_request')).toBe(true)
  })
})

// ─────────────────────────── admin ───────────────────────────

describe(`admin`, () => {
  let pendingBookingId
  let approvedBookingId

  it('refuses non-admins', async () => {
    expect((await request(app).get('/api/admin/bookings').set(auth(userToken))).status).toBe(403)
    expect((await request(app).get('/api/admin/users').set(auth(userToken))).status).toBe(403)
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

  it('approves a pending booking once', async () => {
    const list = await request(app).get('/api/admin/bookings?status=pending').set(auth(adminToken))
    pendingBookingId = list.body.bookings[0].id
    approvedBookingId = list.body.bookings[1] ? list.body.bookings[1].id : pendingBookingId

    const res = await request(app).put(`/api/admin/bookings/${pendingBookingId}/approve`).set(auth(adminToken))
    expect(res.status).toBe(200)

    const again = await request(app).put(`/api/admin/bookings/${pendingBookingId}/approve`).set(auth(adminToken))
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
    const admins = await db.all("SELECT id FROM users WHERE role = 'admin'")
    expect(admins.length).toBe(1)

    const demote = await request(app).put(`/api/admin/users/${admins[0].id}`)
      .set(auth(adminToken)).send({ role: 'user' })
    expect(demote.status).toBe(400)

    const remove = await request(app).delete(`/api/admin/users/${admins[0].id}`).set(auth(adminToken))
    expect(remove.status).toBe(400)
  })

  it('rejects an unknown role', async () => {
    const target = await db.get("SELECT id FROM users WHERE role = 'user'")
    const res = await request(app).put(`/api/admin/users/${target.id}`)
      .set(auth(adminToken)).send({ role: 'superuser' })
    expect(res.status).toBe(400)
  })

  it('revokes existing tokens when an admin changes a password', async () => {
    const fresh = await request(app).post('/api/auth/register')
      .send({ name: 'Rotate Me', email: `rotate-${Date.now()}@example.com`, password: 'firstpass' })
    expect(fresh.status).toBe(201)
    const oldToken = fresh.body.token
    const id = fresh.body.user.id

    expect((await request(app).get('/api/auth/me').set(auth(oldToken))).status).toBe(200)

    const change = await request(app).put(`/api/admin/users/${id}`)
      .set(auth(adminToken)).send({ password: 'secondpass' })
    expect(change.status).toBe(200)

    expect((await request(app).get('/api/auth/me').set(auth(oldToken))).status).toBe(401)
    expect((await request(app).post('/api/auth/login')
      .send({ email: fresh.body.user.email, password: 'secondpass' })).status).toBe(200)
    expect((await request(app).post('/api/auth/login')
      .send({ email: fresh.body.user.email, password: 'firstpass' })).status).toBe(401)
  })

  it('rejects a booking that is not pending', async () => {
    const res = await request(app).put(`/api/admin/bookings/${pendingBookingId}/reject`)
      .set(auth(adminToken)).send({ admin_notes: 'too late' })
    expect(res.status).toBe(400)
    expect(approvedBookingId).toBeTruthy()
  })

  it('records a return only for approved bookings', async () => {
    const notApproved = await db.get("SELECT id FROM bookings WHERE status = 'pending' LIMIT 1")
    if (notApproved) {
      expect((await request(app).put(`/api/admin/bookings/${notApproved.id}/return`).set(auth(adminToken))).status).toBe(400)
    }
    const res = await request(app).put(`/api/admin/bookings/${pendingBookingId}/return`).set(auth(adminToken))
    expect(res.status).toBe(200)
  })

  it('does not allow deleting your own account', async () => {
    const me = await db.get('SELECT id FROM users WHERE email = ?', [ADMIN.email])
    const res = await request(app).delete(`/api/admin/users/${me.id}`).set(auth(adminToken))
    expect(res.status).toBe(400)
  })
})

// ─────────────────────────── public ───────────────────────────

describe(`public booking`, () => {
  const stamp = Date.now()
  const borrower = { name: `ผู้ยืม ${stamp}`, phone: `08${stamp}` }
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

  it('creates a booking and the borrower in one step', async () => {
    const list = await request(app).get('/api/public/cars')
    bookedCarId = list.body.cars[list.body.cars.length - 1].id
    const { start_date, end_date } = dateRange(21)

    const res = await request(app).post('/api/public/bookings')
      .send({ ...borrower, car_id: bookedCarId, start_date, end_date, id_card: '1-2345-67890-12-3' })
    expect(res.status).toBe(201)

    const row = await db.get('SELECT id FROM bookings WHERE car_id = ? ORDER BY id DESC', [bookedCarId])
    publicBookingId = row.id
  })

  it('gives a second borrower with the same name a distinct account', async () => {
    const { start_date, end_date } = dateRange(22)
    const res = await request(app).post('/api/public/bookings')
      .send({ name: borrower.name, phone: '0899999999', car_id: bookedCarId, start_date, end_date })
    expect(res.status).toBe(201)

    const users = await db.all('SELECT email FROM users WHERE name = ?', [borrower.name])
    expect(users.length).toBe(2)
    expect(new Set(users.map((u) => u.email)).size).toBe(2)
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

  it('does not let national ID numbers be used as a lookup key', async () => {
    const res = await request(app).post('/api/public/bookings/lookup').send({ query: '1-2345-67890-12-3' })
    expect(res.status).toBe(200)
    expect(res.body.bookings).toEqual([])
  })

  it('refuses to cancel with the wrong ID card', async () => {
    const res = await request(app).post(`/api/public/bookings/${publicBookingId}/cancel`)
      .send({ id_card: '9-9999-99999-99-9' })
    expect(res.status).toBe(403)
  })

  it('cancels a pending booking with the right ID card, and only once', async () => {
    const res = await request(app).post(`/api/public/bookings/${publicBookingId}/cancel`)
      .send({ id_card: '1234567890123' })
    expect(res.status).toBe(200)

    const again = await request(app).post(`/api/public/bookings/${publicBookingId}/cancel`)
      .send({ id_card: '1234567890123' })
    expect(again.status).toBe(404)
  })

  it('returns a car through the public flow exactly once', async () => {
    const { start_date, end_date } = dateRange(23)
    await request(app).post('/api/public/bookings')
      .send({ ...borrower, car_id: bookedCarId, start_date, end_date })

    const booking = await db.get(
      "SELECT id FROM bookings WHERE car_id = ? AND status = 'pending' ORDER BY id DESC",
      [bookedCarId]
    )
    expect((await request(app).put(`/api/admin/bookings/${booking.id}/approve`).set(auth(adminToken))).status).toBe(200)

    const first = await request(app).post(`/api/public/bookings/${booking.id}/return`)
      .send({ id_card: '1234567890123' })
    expect(first.status).toBe(200)

    const second = await request(app).post(`/api/public/bookings/${booking.id}/return`)
      .send({ id_card: '1234567890123' })
    expect(second.status).toBe(400)
  })

  it('refuses to return a booking that was never approved', async () => {
    const { start_date, end_date } = dateRange(24)
    await request(app).post('/api/public/bookings')
      .send({ ...borrower, car_id: bookedCarId, start_date, end_date })
    const booking = await db.get(
      "SELECT id FROM bookings WHERE car_id = ? AND status = 'pending' ORDER BY id DESC",
      [bookedCarId]
    )
    const res = await request(app).post(`/api/public/bookings/${booking.id}/return`)
      .send({ id_card: '1234567890123' })
    expect(res.status).toBe(400)
  })
})
