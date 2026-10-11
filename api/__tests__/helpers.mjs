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
  // Signer assignments, document settings and the document-number counter
  // must not leak from an earlier run either.
  await db.deleteMany(db.collections.settings, {})
  await db.deleteMany(db.collections.counters, {})

  return 'mongodb'
}

export async function cleanupDatabase() {
  try {
    const db = require('../db.cjs')
    // Drop the whole per-suite test database (car-rental-test-*) so nothing is
    // left behind in the developer's MongoDB after a run.
    const database = await db.connect()
    await database.dropDatabase()
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

export function auth(token) {
  return { Authorization: `Bearer ${token}` }
}

// There is no public self-registration and no "user" role anymore — every
// account that can sign in is an admin, and only an existing admin can
// provision another one. Tests that need a second, disposable logged-in
// account (token revocation, account deletion, ...) go through this instead
// of the old /api/auth/register.
export async function createAdmin(app, adminToken, overrides = {}) {
  return createUser(app, adminToken, { name: 'Extra Admin', role: 'admin', ...overrides })
}

/** Provision any login-capable role (admin or one of the five signer roles)
 * through the admin API, the same way createAdmin always has. */
export async function createUser(app, adminToken, overrides = {}) {
  const email = overrides.email || `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  const password = overrides.password || 'secret123'
  const name = overrides.name || 'Extra User'
  const role = overrides.role || 'admin'
  const res = await request(app).post('/api/admin/users')
    .set(auth(adminToken))
    .send({ name, email, password, role })
  if (res.status !== 201) {
    throw new Error(`createUser failed: ${res.status} ${JSON.stringify(res.body)}`)
  }
  const token = await loginAs(app, email, password)
  return { id: res.body.user.id, email, password, token, role }
}

/** A list of distinct future date ranges, so tests cannot collide on a car. */
export function dateRange(index, days = 3) {
  const start = new Date(Date.UTC(2031, 0, 1 + index * 10))
  const end = new Date(start.getTime() + (days - 1) * 86_400_000)
  return { start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10) }
}
