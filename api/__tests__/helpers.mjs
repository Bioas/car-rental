// Shared test harness.
//
// Each test file gets its own throwaway SQLite file, so files are isolated from
// each other and from the developer's real `data.sqlite`.
//
// The API reads its configuration when it is required, so `prepareDatabase()`
// must run *before* anything requires `../db.cjs` or `../server.cjs`:
//
//   await prepareDatabase()          // top-level await
//   const app = require('../server.cjs')

import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import request from 'supertest'

export const require = createRequire(import.meta.url)

let tempDir = null

export async function prepareDatabase() {
  // Never let a developer's `.env` (or a stray exported variable) redirect the
  // tests at the real database, or override the test JWT secret.
  process.env.CARRENTAL_NO_ENV_FILE = '1'
  process.env.JWT_SECRET = 'test-secret-key-at-least-16-chars'
  process.env.SSE_REVALIDATE_MS = '150'

  tempDir = mkdtempSync(path.join(tmpdir(), 'car-rental-test-'))
  process.env.SQLITE_PATH = path.join(tempDir, 'data.sqlite')

  return 'sqlite'
}

export function cleanupDatabase() {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = null
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
