import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { prepareDatabase, cleanupDatabase, require, loginAs, ADMIN, USER, auth, dateRange } from './helpers.mjs'

// The overlap check is a read-then-write, so without a transaction two requests
// arriving at the same instant would both see "no conflict" and both insert.
// These tests fire many identical requests at once and assert that exactly one
// wins: transactions are queued, so the loser always sees the winner's booking.

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
        request(app).post('/api/bookings').set(auth(userToken))
          .send({ car_id: carId, start_date, end_date })
      )
    )

    const { created, conflicts, other } = tally(results)
    expect(other.map((r) => r.status)).toEqual([])
    expect(created.length).toBe(1)
    expect(conflicts.length).toBe(9)

    const rows = await db.all(
      "SELECT id FROM bookings WHERE car_id = ? AND status IN ('pending','approved') AND start_date <= ? AND end_date >= ?",
      [carId, end_date, start_date]
    )
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
      request(app).post('/api/bookings').set(auth(userToken)).send({ car_id: carId, start_date, end_date }),
      request(app).post('/api/bookings').set(auth(userToken)).send({ car_id: carId, ...shifted }),
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
          .send({ name, phone: '0877777777', car_id: carId, start_date, end_date })
      )
    )

    const { created, conflicts, other } = tally(results)
    expect(other.map((r) => r.status)).toEqual([])
    expect(created.length).toBe(1)
    expect(conflicts.length).toBe(7)

    // The losing attempts must not have left stray borrower accounts behind.
    const users = await db.all('SELECT id FROM users WHERE name = ?', [name])
    expect(users.length).toBe(1)
  })
})
