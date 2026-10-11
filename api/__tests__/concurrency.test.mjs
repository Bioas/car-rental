import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { prepareDatabase, cleanupDatabase, require, loginAs, ADMIN, auth, dateRange, createUser } from './helpers.mjs'

// The overlap check is a read-then-write, so without serialization two requests
// arriving at the same instant would both see "no conflict" and both insert.
// These tests fire many identical requests at once and assert that exactly one
// wins: writes for the same car are serialized, so the loser always sees the
// winner's booking.

await prepareDatabase('concurrency')
const app = require('../server.cjs')
const db = require('../db.cjs')

let adminToken
let staffToken // only staff may create/manage loan requests

beforeAll(async () => {
  await db.initDB()
  adminToken = await loginAs(app, ADMIN.email, ADMIN.password)
  staffToken = (await createUser(app, adminToken, { role: 'staff', name: 'Concurrency Staff' })).token
})

afterAll(async () => {
  await cleanupDatabase()
})

async function firstCarId() {
  const res = await request(app).get('/api/cars').set(auth(adminToken))
  return res.body.cars[0].id
}

function tally(results) {
  const created = results.filter((r) => r.status === 201)
  const conflicts = results.filter((r) => r.status === 409)
  const other = results.filter((r) => r.status !== 201 && r.status !== 409)
  return { created, conflicts, other }
}

describe(`concurrent authenticated bookings`, () => {
  it('lets exactly one of 10 simultaneous identical requests win', async () => {
    const carId = await firstCarId()
    const { start_date, end_date } = dateRange(31)

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).post('/api/bookings').set(auth(staffToken))
          .send({ car_id: carId, start_date, end_date, name: 'ผู้ยืมพร้อมกัน', phone: '0811111111' })
      )
    )

    const { created, conflicts, other } = tally(results)
    expect(other.map((r) => r.status)).toEqual([])
    expect(created.length).toBe(1)
    expect(conflicts.length).toBe(9)

    const rows = await db.find(db.collections.bookings, {
      car_id: db.toId(carId),
      status: { $in: ['pending', 'approved'] },
      start_date: { $lte: end_date },
      end_date: { $gte: start_date },
    })
    expect(rows.length).toBe(1)
  })

  it('keeps two overlapping ranges racing against each other, not just identical ones', async () => {
    const carId = await firstCarId()
    const { start_date, end_date } = dateRange(33)
    const shifted = {
      start_date: start_date.slice(0, 8) + String(Number(start_date.slice(8)) + 1).padStart(2, '0'),
      end_date,
    }

    const results = await Promise.all([
      request(app).post('/api/bookings').set(auth(staffToken)).send({ car_id: carId, start_date, end_date, name: 'ผู้ยืมพร้อมกัน', phone: '0811111111' }),
      request(app).post('/api/bookings').set(auth(staffToken)).send({ car_id: carId, ...shifted, name: 'ผู้ยืมพร้อมกัน', phone: '0811111111' }),
    ])

    const { created, conflicts, other } = tally(results)
    expect(other.map((r) => r.status)).toEqual([])
    expect(created.length).toBe(1)
    expect(conflicts.length).toBe(1)
  })
})

describe(`concurrent public bookings`, () => {
  it('lets exactly one of 8 simultaneous requests win', async () => {
    const carId = await firstCarId()
    const { start_date, end_date } = dateRange(35)
    const name = `ผู้ยืมพร้อมกัน ${Date.now()}`

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app).post('/api/public/bookings')
          .send({ name, phone: '0877777777', car_id: carId, start_date, end_date, signature: 'data:image/png;base64,iVBORw0KGgo=' })
      )
    )

    const { created, conflicts, other } = tally(results)
    expect(other.map((r) => r.status)).toEqual([])
    expect(created.length).toBe(1)
    expect(conflicts.length).toBe(7)

    // Borrowers are never accounts at all — winning or losing, nothing should
    // ever land in the users collection, and exactly one booking should exist.
    expect(await db.countDocuments(db.collections.users, { name })).toBe(0)
    expect(await db.countDocuments(db.collections.bookings, { user_name: name })).toBe(1)
  })
})
