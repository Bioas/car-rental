import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { prepareDatabase, cleanupDatabase, require, loginAs, ADMIN, auth } from './helpers.mjs'

// SSE connections are long-lived. The token is validated when the stream opens
// AND periodically afterwards (SSE_REVALIDATE_MS is shortened in helpers.mjs),
// so revoking a session must tear the stream down.

await prepareDatabase('sse')
const app = require('../server.cjs')
const db = require('../db.cjs')

let server
let base
// Streams left open by a test keep their socket alive, and `server.close()`
// waits for every socket, so they are tracked and aborted before teardown.
const openStreams = []

beforeAll(async () => {
  await db.initDB()
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  base = `http://127.0.0.1:${server.address().port}`
})

afterAll(async () => {
  openStreams.forEach((controller) => controller.abort())
  await new Promise((resolve) => {
    server.close(resolve)
    server.closeAllConnections?.()
  })
  await cleanupDatabase()
})

/** Open an SSE connection and remember it so teardown cannot hang. */
async function openStream(token) {
  const controller = new AbortController()
  openStreams.push(controller)
  const res = await fetch(`${base}/api/events?token=${encodeURIComponent(token)}`, { signal: controller.signal })
  return { res, stream: streamText(res.body) }
}

function streamText(body) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let text = ''

  async function pull(timeoutMs) {
    const winner = await Promise.race([
      reader.read(),
      new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), timeoutMs)),
    ])
    if (winner.timedOut) return { timedOut: true }
    if (winner.done) return { done: true }
    text += decoder.decode(winner.value, { stream: true })
    return {}
  }

  return {
    get text() { return text },
    /** Read until `predicate(text)` is true, the stream ends, or we time out. */
    async readUntil(predicate, timeoutMs = 10000) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const step = await pull(Math.max(deadline - Date.now(), 1))
        if (step.timedOut) break
        if (step.done) break
        if (predicate(text)) break
      }
      return { matched: predicate(text) }
    },
    /** Read until the server closes the stream. */
    async waitForClose(timeoutMs = 10000) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const step = await pull(Math.max(deadline - Date.now(), 1))
        if (step.timedOut) return false
        if (step.done) return true
      }
      return false
    },
  }
}

describe(`SSE session validation`, () => {
  it('refuses to open a stream without a valid token', async () => {
    expect((await fetch(`${base}/api/events`)).status).toBe(401)
    expect((await fetch(`${base}/api/events?token=not-a-jwt`)).status).toBe(403)
  })

  it('rejects a well-formed token that is not signed by this server', async () => {
    const forged = [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ id: '1', role: 'admin', tv: 0 })).toString('base64url'),
      'not-a-real-signature',
    ].join('.')
    expect((await fetch(`${base}/api/events?token=${forged}`)).status).toBe(403)
  })

  it('opens and keeps a stream for a live session', async () => {
    const token = await loginAs(app, ADMIN.email, ADMIN.password)
    const { res, stream } = await openStream(token)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')

    expect((await stream.readUntil((t) => t.includes(':ok'))).matched).toBe(true)
    // Still open after several revalidation cycles (150ms each).
    expect(await stream.waitForClose(600)).toBe(false)
  })

  it('closes the stream once the token is revoked', async () => {
    const email = `sse-${Date.now()}@example.com`
    const created = await request(app).post('/api/auth/register')
      .send({ name: 'SSE User', email, password: 'firstpass' })
    expect(created.status).toBe(201)

    const { res, stream } = await openStream(created.body.token)
    expect(res.status).toBe(200)
    expect((await stream.readUntil((t) => t.includes(':ok'))).matched).toBe(true)

    // Revoke the session the same way a password change does.
    const adminToken = await loginAs(app, ADMIN.email, ADMIN.password)
    const changed = await request(app)
      .put(`/api/admin/users/${created.body.user.id}`)
      .set(auth(adminToken))
      .send({ password: 'secondpass' })
    expect(changed.status).toBe(200)

    expect((await stream.readUntil((t) => t.includes('session-expired'))).matched).toBe(true)
    expect(await stream.waitForClose()).toBe(true)
  })

  it('drops the stream when the account is deleted', async () => {
    const email = `gone-${Date.now()}@example.com`
    const created = await request(app).post('/api/auth/register')
      .send({ name: 'Deleted User', email, password: 'firstpass' })
    const { stream } = await openStream(created.body.token)
    expect((await stream.readUntil((t) => t.includes(':ok'))).matched).toBe(true)

    const adminToken = await loginAs(app, ADMIN.email, ADMIN.password)
    expect((await request(app).delete(`/api/admin/users/${created.body.user.id}`).set(auth(adminToken))).status).toBe(200)

    expect((await stream.readUntil((t) => t.includes('session-expired'))).matched).toBe(true)
    expect(await stream.waitForClose()).toBe(true)
  })
})
