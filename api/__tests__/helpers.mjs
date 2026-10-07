// Shared test harness.
//
// The tests need a real MongoDB. Each test file gets its own database, so files
// can run in parallel without interfering, and a wipe at start keeps runs
// repeatable. (Atlas free tier forbids `dropDatabase`, so collections are
// emptied with deleteMany instead of dropping the database.)
//
// The API reads its configuration lazily (at connect time), so `prepareDatabase()`
// must run *before* anything issues a query:
//
//   await prepareDatabase('api')     // top-level await
//   const app = require('../server.cjs')

import { createRequire } from 'node:module'
import request from 'supertest'

export const require = createRequire(import.meta.url)

const DEFAULT_URI = 'mongodb://127.0.0.1:27017'

export async function prepareDatabase(name = 'main') {
  // Never let a developer's `.env` (or a stray exported variable) redirect the
  // tests at the real database, or override the test JWT secret.
  process.env.CARRENTAL_NO_ENV_FILE = '1'
  process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || process.env.MONGODB_URI || DEFAULT_URI
  process.env.MONGODB_DB = `car-rental-test-${name}`
  process.env.JWT_SECRET = 'test-secret-key-at-least-16-chars'
  process.env.SSE_REVALIDATE_MS = '150'
  process.env.SSE_KEEPALIVE_MS = '60000'

  const db = require('../db.cjs')
  await db.connect()
  await db.deleteMany(db.collections.users, {})
  await db.deleteMany(db.collections.cars, {})
  await db.deleteMany(db.collections.bookings, {})
  await db.deleteMany(db.collections.notifications, {})

  return 'mongodb'
}

export async function cleanupDatabase() {
  try {
    const db = require('../db.cjs')
    await db.deleteMany(db.collections.users, {})
    await db.deleteMany(db.collections.cars, {})
    await db.deleteMany(db.collections.bookings, {})
    await db.deleteMany(db.collections.notifications, {})
    await db.close()
  } catch {
    /* nothing to clean up */
  }
}

/** Log in through the public API and return the bearer token. */
export async function loginAs(app, email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password })
  if (res.status !== 200) {
    throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`)
  }
  return res.body.token
}

export const ADMIN = { email: 'admin@carrental.local', password: 'admin123' }
export const USER = { email: 'somchai@carrental.local', password: 'user123' }

export function auth(token) {
  return { Authorization: `Bearer ${token}` }
}

/** A list of distinct future date ranges, so tests cannot collide on a car. */
export function dateRange(index, days = 3) {
  const start = new Date(Date.UTC(2031, 0, 1 + index * 10))
  const end = new Date(start.getTime() + (days - 1) * 86_400_000)
  return { start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10) }
}
