import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import crypto from 'node:crypto'
import request from 'supertest'
import {
  prepareDatabase, cleanupDatabase, require,
  loginAs, ADMIN, auth, dateRange, createUser,
} from './helpers.mjs'

await prepareDatabase('driver')
process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-line-token'
process.env.LINE_CHANNEL_SECRET = 'test-line-secret'
process.env.LINE_BOT_ID = '@testbot'
process.env.APP_URL = 'https://cars.example.ac.th'
const app = require('../server.cjs')
const db = require('../db.cjs')
const { sendDriverReminders, addDays } = require('../lib/drivers.cjs')

const SIGNATURE = 'data:image/png;base64,iVBORw0KGgo='
const STAGE_KEYS = ['vehicle_head', 'supply_officer', 'supply_head', 'deputy_director', 'director']

let adminToken
const signers = {}
let driverA
let driverB

// Every outgoing LINE API call lands here instead of the network.
let lineCalls = []
function mockLine() {
  lineCalls = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    lineCalls.push({ url: String(url), body: JSON.parse(init.body) })
    return new Response('{}', { status: 200 })
  })
}

function signedWebhook(body) {
  const raw = JSON.stringify(body)
  const signature = crypto.createHmac('sha256', process.env.LINE_CHANNEL_SECRET).update(raw).digest('base64')
  return request(app).post('/api/line/webhook')
    .set('Content-Type', 'application/json')
    .set('x-line-signature', signature)
    .send(raw)
}

async function createDriver(name, phone) {
  const res = await request(app).post('/api/admin/users').set(auth(adminToken))
    .send({ name, email: `${name.replace(/\s/g, '')}-${Date.now()}@example.com`, role: 'driver', phone })
  expect(res.status).toBe(201)
  return res.body.user
}

async function createBooking(index, { start_date, end_date } = dateRange(index)) {
  const cars = (await request(app).get('/api/public/cars')).body.cars
  const carId = cars[index % cars.length].id
  const res = await request(app).post('/api/public/bookings').send({
    name: `ผู้ยืม ${index}`, phone: `0810000${String(index).padStart(3, '0')}`, position: 'ครู',
    car_id: carId, start_date, end_date, signature: SIGNATURE,
    destination_place: 'ศาลากลาง', destination_province: 'บุรีรัมย์', purpose: `ไปราชการ ${index}`,
  })
  expect(res.status).toBe(201)
  const row = await db.findOne(db.collections.bookings, { car_id: db.toId(carId), start_date }, { sort: { _id: -1 } })
  return db.str(row._id)
}

async function sign(stage, id, extra = {}) {
  const res = await request(app).put(`/api/signing/${id}/sign`).set(auth(signers[stage].token))
    .send({ decision: 'approve', signature: SIGNATURE, ...extra })
  expect(res.status).toBe(200)
  return res
}

async function signAll(id, driverId) {
  await sign('vehicle_head', id, { self_drive: false, driver_id: driverId })
  for (const stage of STAGE_KEYS.slice(1)) await sign(stage, id)
}

beforeAll(async () => {
  await db.initDB()
  adminToken = await loginAs(app, ADMIN.email, ADMIN.password)
  for (const key of STAGE_KEYS) {
    const staff = await createUser(app, adminToken, { role: 'staff', name: `Signer ${key}` })
    await request(app).put(`/api/admin/stage-assignments/${key}`).set(auth(adminToken)).send({ user_id: staff.id })
    signers[key] = staff
  }
  driverA = await createDriver('ทดสอบ ขับดี', '089-111-0001')
  driverB = await createDriver('ทดสอบ ทางไกล', '089-111-0002')
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await cleanupDatabase()
})

describe('public driver page API', () => {
  it('lists drivers without their phone numbers', async () => {
    const res = await request(app).get('/api/driver/drivers')
    expect(res.status).toBe(200)
    const names = res.body.drivers.map((d) => d.name)
    expect(names).toContain(driverA.name)
    expect(JSON.stringify(res.body)).not.toContain('089-111-0001')
    expect(res.body.line.configured).toBe(true)
    expect(res.body.line.add_friend_url).toBe('https://line.me/R/ti/p/%40testbot')
  })

  it("returns only the driver's own trips, pending ones included, without borrower phones", async () => {
    mockLine()
    const mine = await createBooking(1)
    await sign('vehicle_head', mine, { self_drive: false, driver_id: driverA.id })
    const theirs = await createBooking(2)
    await sign('vehicle_head', theirs, { self_drive: false, driver_id: driverB.id })

    const range = dateRange(1)
    const res = await request(app).get(`/api/driver/${driverA.id}/schedule?from=2030-01-01&to=2032-12-31`)
    expect(res.status).toBe(200)
    const ids = res.body.trips.map((t) => t.id)
    expect(ids).toContain(mine)
    expect(ids).not.toContain(theirs)
    const trip = res.body.trips.find((t) => t.id === mine)
    expect(trip.start_date).toBe(range.start_date)
    expect(trip.status).toBe('pending')
    expect(trip.remaining_signers).toBe(4)
    expect(trip.license_plate).toBeTruthy()
    expect(JSON.stringify(res.body)).not.toContain('0810000001')
  })

  it('drops rejected trips from the schedule', async () => {
    const id = await createBooking(3)
    await sign('vehicle_head', id, { self_drive: false, driver_id: driverA.id })
    for (const stage of ['supply_officer', 'supply_head']) await sign(stage, id)
    await request(app).put(`/api/signing/${id}/sign`).set(auth(signers.deputy_director.token))
      .send({ decision: 'reject', signature: SIGNATURE })
    const res = await request(app).get(`/api/driver/${driverA.id}/schedule?from=2030-01-01&to=2032-12-31`)
    expect(res.body.trips.map((t) => t.id)).not.toContain(id)
  })

  it('404s for an unknown driver and for non-driver accounts', async () => {
    expect((await request(app).get('/api/driver/000000000000000000000000/schedule')).status).toBe(404)
    expect((await request(app).get(`/api/driver/${signers.director.id}/schedule`)).status).toBe(404)
  })
})

describe('LINE linking', () => {
  it('needs the driver\'s own phone number to issue a link code', async () => {
    const wrong = await request(app).post(`/api/driver/${driverB.id}/line-code`).send({ phone: '0800000000' })
    expect(wrong.status).toBe(403)
    const ok = await request(app).post(`/api/driver/${driverB.id}/line-code`).send({ phone: '0891110002' })
    expect(ok.status).toBe(200)
    expect(ok.body.code).toMatch(/^\d{6}$/)
  })

  it('rejects webhook calls without a valid signature', async () => {
    const res = await request(app).post('/api/line/webhook')
      .set('x-line-signature', 'bogus').send({ events: [] })
    expect(res.status).toBe(401)
  })

  it('links the LINE account that sends the code, and replies', async () => {
    mockLine()
    const { body } = await request(app).post(`/api/driver/${driverA.id}/line-code`).send({ phone: '089 111 0001' })
    const res = await signedWebhook({
      events: [{ type: 'message', replyToken: 'r1', source: { userId: 'U-driver-a' }, message: { type: 'text', text: body.code } }],
    })
    expect(res.status).toBe(200)
    const user = await db.findOne(db.collections.users, { _id: db.toId(driverA.id) })
    expect(user.line_user_id).toBe('U-driver-a')
    expect(user.line_link_code).toBeUndefined()
    expect(lineCalls[0].url).toContain('/message/reply')
    expect(lineCalls[0].body.messages[0].text).toContain('เชื่อมต่อสำเร็จ')

    const list = await request(app).get('/api/driver/drivers')
    expect(list.body.drivers.find((d) => d.id === driverA.id).line_linked).toBe(true)
  })

  it('refuses a code that was already used', async () => {
    mockLine()
    const { body } = await request(app).post(`/api/driver/${driverB.id}/line-code`).send({ phone: '0891110002' })
    await signedWebhook({ events: [{ type: 'message', replyToken: 'r2', source: { userId: 'U-driver-b' }, message: { type: 'text', text: body.code } }] })
    await signedWebhook({ events: [{ type: 'message', replyToken: 'r3', source: { userId: 'U-someone-else' }, message: { type: 'text', text: body.code } }] })
    const user = await db.findOne(db.collections.users, { _id: db.toId(driverB.id) })
    expect(user.line_user_id).toBe('U-driver-b')
    expect(lineCalls[1].body.messages[0].text).toContain('ไม่ถูกต้อง')
  })

  it('answers "คิว" with the linked driver\'s upcoming trips', async () => {
    mockLine()
    const today = new Date().toLocaleDateString('en-CA')
    const id = await createBooking(4, { start_date: addDays(today, 40), end_date: addDays(today, 40) })
    await sign('vehicle_head', id, { self_drive: false, driver_id: driverA.id })
    lineCalls = []
    await signedWebhook({ events: [{ type: 'message', replyToken: 'r4', source: { userId: 'U-driver-a' }, message: { type: 'text', text: 'ขอดูคิว' } }] })
    expect(lineCalls[0].body.messages[0].text).toContain('ไปราชการ 4')
    expect(lineCalls[0].body.messages[0].text).toContain('https://cars.example.ac.th/driver/')
  })
})

describe('driver notifications', () => {
  it('pushes the trip, with the borrower phone, to the driver once it is approved', async () => {
    mockLine()
    const id = await createBooking(5)
    await signAll(id, driverA.id)
    const pushes = lineCalls.filter((c) => c.url.endsWith('/message/push'))
    expect(pushes).toHaveLength(1)
    expect(pushes[0].body.to).toBe('U-driver-a')
    const text = pushes[0].body.messages[0].text
    expect(text).toContain('ได้รับมอบหมาย')
    expect(text).toContain('ไปราชการ 5')
    expect(text).toContain('0810000005')
    const row = await db.findOne(db.collections.bookings, { _id: db.toId(id) })
    expect(row.status).toBe('approved')
    expect(row.driver_notified_at).toBeTruthy()
  })

  it('does not push anything while the trip is still being signed', async () => {
    mockLine()
    const id = await createBooking(6)
    await sign('vehicle_head', id, { self_drive: false, driver_id: driverA.id })
    expect(lineCalls.filter((c) => c.url.endsWith('/message/push'))).toHaveLength(0)
  })

  it('reminds the driver the evening before, only once', async () => {
    mockLine()
    const today = new Date().toLocaleDateString('en-CA')
    const tomorrow = addDays(today, 1)
    const id = await createBooking(7, { start_date: tomorrow, end_date: tomorrow })
    await signAll(id, driverB.id)
    lineCalls = []
    expect(await sendDriverReminders()).toBe(1)
    expect(await sendDriverReminders()).toBe(0)
    expect(lineCalls).toHaveLength(1)
    expect(lineCalls[0].body.to).toBe('U-driver-b')
    expect(lineCalls[0].body.messages[0].text).toContain('พรุ่งนี้')
  })

  it('stays silent for a driver who has not linked LINE', async () => {
    const unlinked = await createDriver('ไม่มี ไลน์', '089-111-0009')
    mockLine()
    const id = await createBooking(8)
    await signAll(id, unlinked.id)
    expect(lineCalls).toHaveLength(0)
  })
})

describe('admin driver schedule', () => {
  it('lists every driver with link state and the trips in range', async () => {
    const res = await request(app).get('/api/admin/driver-schedule?from=2030-01-01&to=2032-12-31').set(auth(adminToken))
    expect(res.status).toBe(200)
    const a = res.body.drivers.find((d) => d.id === driverA.id)
    expect(a.line_linked).toBe(true)
    expect(a.phone).toBe('089-111-0001')
    expect(res.body.trips.some((t) => t.driver_id === driverB.id)).toBe(true)
  })

  it('re-sends a trip to its driver on request', async () => {
    mockLine()
    const id = await createBooking(9)
    await signAll(id, driverA.id)
    lineCalls = []
    const res = await request(app).post(`/api/admin/bookings/${id}/notify-driver`).set(auth(adminToken))
    expect(res.status).toBe(200)
    expect(lineCalls[0].body.messages[0].text).toContain('ส่งซ้ำ')
  })

  it('unlinks a driver', async () => {
    const res = await request(app).delete(`/api/admin/drivers/${driverB.id}/line`).set(auth(adminToken))
    expect(res.status).toBe(200)
    const user = await db.findOne(db.collections.users, { _id: db.toId(driverB.id) })
    expect(user.line_user_id).toBeUndefined()
  })

  it('is not readable without signing in', async () => {
    expect((await request(app).get('/api/admin/driver-schedule')).status).toBe(401)
  })
})

describe('LINE settings page', () => {
  function mockLineApi({ tokenOk = true } = {}) {
    lineCalls = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
      lineCalls.push({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null })
      if (!tokenOk) return new Response(JSON.stringify({ message: 'Authentication failed' }), { status: 401 })
      if (String(url).endsWith('/v2/bot/info')) {
        return new Response(JSON.stringify({ basicId: '@college', displayName: 'วิทยาลัยเทคนิค', pictureUrl: 'https://img/x.png' }), { status: 200 })
      }
      return new Response('{}', { status: 200 })
    })
  }

  it('is admin-only', async () => {
    const res = await request(app).get('/api/admin/settings/line').set(auth(signers.director.token))
    expect(res.status).toBe(403)
  })

  it('reports the environment fallback without exposing secrets', async () => {
    const res = await request(app).get('/api/admin/settings/line').set(auth(adminToken))
    expect(res.status).toBe(200)
    expect(res.body.source).toBe('env')
    expect(res.body.configured).toBe(true)
    expect(JSON.stringify(res.body)).not.toContain('test-line-secret')
    expect(JSON.stringify(res.body)).not.toContain('test-line-token')
  })

  it('rejects a token LINE does not accept', async () => {
    mockLineApi({ tokenOk: false })
    const res = await request(app).put('/api/admin/settings/line').set(auth(adminToken))
      .send({ channel_access_token: 'bad-token' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('ไม่ถูกต้อง')
  })

  it('saves a checked token, fills in the bot ID and registers the webhook URL', async () => {
    mockLineApi()
    const res = await request(app).put('/api/admin/settings/line').set(auth(adminToken)).send({
      channel_access_token: 'good-token-abcd',
      channel_secret: '0123456789abcdef0123456789abcdef',
      app_url: 'https://cars.college.ac.th/',
      reminder_hour: 18,
    })
    expect(res.status).toBe(200)
    expect(res.body.settings).toMatchObject({
      source: 'database', bot_id: '@college', token_hint: 'abcd', app_url: 'https://cars.college.ac.th',
      webhook_url: 'https://cars.college.ac.th/api/line/webhook', reminder_hour: 18,
    })
    expect(res.body.webhook.ok).toBe(true)
    const put = lineCalls.find((c) => c.url.endsWith('/channel/webhook/endpoint') && c.method === 'PUT')
    expect(put.body.endpoint).toBe('https://cars.college.ac.th/api/line/webhook')

    // The new secret now verifies webhooks; the old one no longer does.
    const raw = JSON.stringify({ events: [] })
    const sig = (key) => crypto.createHmac('sha256', key).update(raw).digest('base64')
    const good = await request(app).post('/api/line/webhook').set('Content-Type', 'application/json')
      .set('x-line-signature', sig('0123456789abcdef0123456789abcdef')).send(raw)
    expect(good.status).toBe(200)
    const old = await request(app).post('/api/line/webhook').set('Content-Type', 'application/json')
      .set('x-line-signature', sig('test-line-secret')).send(raw)
    expect(old.status).toBe(401)

    const pub = await request(app).get('/api/driver/drivers')
    expect(pub.body.line.add_friend_url).toBe('https://line.me/R/ti/p/%40college')
  })

  it('validates the secret format and reminder hour', async () => {
    expect((await request(app).put('/api/admin/settings/line').set(auth(adminToken)).send({ channel_secret: 'nope' })).status).toBe(400)
    expect((await request(app).put('/api/admin/settings/line').set(auth(adminToken)).send({ reminder_hour: 25 })).status).toBe(400)
    const off = await request(app).put('/api/admin/settings/line').set(auth(adminToken)).send({ reminder_hour: null })
    expect(off.body.settings.reminder_hour).toBeNull()
  })

  it('forgets saved settings and falls back to the environment', async () => {
    const res = await request(app).delete('/api/admin/settings/line').set(auth(adminToken))
    expect(res.status).toBe(200)
    expect(res.body.settings.source).toBe('env')
    expect(res.body.settings.bot_id).toBe('@testbot')
  })
})

describe('admin booking search', () => {
  it('finds requests by purpose, requester phone and car plate, keeping status counts as totals', async () => {
    const byPurpose = await request(app).get('/api/admin/bookings?status=all&page=1&limit=50&q=' + encodeURIComponent('ไปราชการ 5')).set(auth(adminToken))
    expect(byPurpose.status).toBe(200)
    expect(byPurpose.body.bookings.length).toBe(1)
    expect(byPurpose.body.bookings[0].purpose).toBe('ไปราชการ 5')
    expect(byPurpose.body.counts.all).toBeGreaterThan(1)

    const byPhone = await request(app).get('/api/admin/bookings?q=0810000007').set(auth(adminToken))
    expect(byPhone.body.bookings.map((b) => b.purpose)).toEqual(['ไปราชการ 7'])

    const plate = byPurpose.body.bookings[0].license_plate
    const byPlate = await request(app).get('/api/admin/bookings?q=' + encodeURIComponent(plate)).set(auth(adminToken))
    expect(byPlate.body.bookings.length).toBeGreaterThan(0)
    expect(byPlate.body.bookings.every((b) => b.license_plate === plate)).toBe(true)

    const none = await request(app).get('/api/admin/bookings?q=' + encodeURIComponent('(ไม่มีแน่นอน*')).set(auth(adminToken))
    expect(none.status).toBe(200)
    expect(none.body.bookings).toHaveLength(0)
  })
})

describe('a driver cannot be on two trips at once', () => {
  const DAY = '2033-05-10'
  let carIdx = 0
  async function timedBooking(start_time, end_time, day = DAY) {
    const cars = (await request(app).get('/api/public/cars')).body.cars
    const carId = cars[carIdx++ % cars.length].id
    const res = await request(app).post('/api/public/bookings').send({
      name: `ผู้ยืมเวลา ${start_time}`, phone: '0820000000', car_id: carId, start_date: day, end_date: day,
      start_time, end_time, signature: SIGNATURE,
    })
    expect(res.status).toBe(201)
    const row = await db.findOne(db.collections.bookings, { car_id: db.toId(carId), start_date: day, start_time }, { sort: { _id: -1 } })
    return db.str(row._id)
  }
  const signDriver = (id, driverId) => request(app).put(`/api/signing/${id}/sign`).set(auth(signers.vehicle_head.token))
    .send({ decision: 'approve', signature: SIGNATURE, self_drive: false, driver_id: driverId })

  let morning
  it('assigns the driver to a first trip', async () => {
    mockLine()
    morning = await timedBooking('08:00', '12:00')
    expect((await signDriver(morning, driverA.id)).status).toBe(200)
  })

  it('lists the driver as busy for an overlapping booking', async () => {
    const overlapping = await timedBooking('10:00', '14:00')
    const res = await request(app).get(`/api/signing/drivers?booking_id=${overlapping}`).set(auth(signers.vehicle_head.token))
    const a = res.body.drivers.find((d) => d.id === driverA.id)
    const b = res.body.drivers.find((d) => d.id === driverB.id)
    expect(a.busy.id).toBe(morning)
    expect(a.busy.start_time).toBe('08:00')
    expect(b.busy).toBeNull()

    const clash = await signDriver(overlapping, driverA.id)
    expect(clash.status).toBe(409)
    expect(clash.body.code).toBe('driver_busy')
    expect(clash.body.error).toContain(driverA.name)
    expect(clash.body.error).toContain('08.00–12.00')
    // Nothing was signed by the rejected attempt.
    const row = await db.findOne(db.collections.bookings, { _id: db.toId(overlapping) })
    expect(row.signatures.vehicle_head).toBeUndefined()

    mockLine()
    expect((await signDriver(overlapping, driverB.id)).status).toBe(200)
  })

  it('allows a back-to-back trip', async () => {
    mockLine()
    const afternoon = await timedBooking('12:00', '15:00')
    expect((await signDriver(afternoon, driverA.id)).status).toBe(200)
  })

  it('applies the same rule when approving, and reports conflicts for the dialog', async () => {
    const evening = await timedBooking('14:00', '18:00')
    const staff = signers.supply_officer.token
    const conflicts = await request(app).get(`/api/admin/bookings/${evening}/driver-conflicts`).set(auth(staff))
    expect(conflicts.status).toBe(200)
    expect(Object.keys(conflicts.body.busy)).toContain(driverA.id) // 12:00–15:00
    expect(Object.keys(conflicts.body.busy)).not.toContain(driverB.id) // 10:00–14:00 ends as this starts

    const busy = await request(app).put(`/api/admin/bookings/${evening}/approve`).set(auth(staff)).send({ self_drive: false, driver_id: driverA.id })
    expect(busy.status).toBe(409)
    expect(busy.body.code).toBe('driver_busy')
    expect((await db.findOne(db.collections.bookings, { _id: db.toId(evening) })).status).toBe('pending')

    mockLine()
    const ok = await request(app).put(`/api/admin/bookings/${evening}/approve`).set(auth(staff)).send({ self_drive: false, driver_id: driverB.id })
    expect(ok.status).toBe(200)
  })

  it('treats a trip without times as the whole day', async () => {
    mockLine()
    const cars = (await request(app).get('/api/public/cars')).body.cars
    const res = await request(app).post('/api/public/bookings').send({
      name: 'ผู้ยืมทั้งวัน', phone: '0830000000', car_id: cars[carIdx++ % cars.length].id,
      start_date: DAY, end_date: DAY, signature: SIGNATURE,
    })
    expect(res.status).toBe(201)
    const row = await db.findOne(db.collections.bookings, { user_name: 'ผู้ยืมทั้งวัน' })
    expect((await signDriver(db.str(row._id), driverA.id)).status).toBe(409)
  })
})

describe('recommending a driver for a booking', () => {
  // Week of Mon 2034-01-02 … Sun 2034-01-08. The booking to staff is Tue 10–11.
  let carIdx = 3
  async function booking(day, start_time, end_time, name) {
    const cars = (await request(app).get('/api/public/cars')).body.cars
    const carId = cars[carIdx++ % cars.length].id
    const res = await request(app).post('/api/public/bookings').send({
      name, phone: '0840000000', car_id: carId, start_date: day, end_date: day, start_time, end_time, signature: SIGNATURE,
    })
    expect(res.status).toBe(201)
    return db.str((await db.findOne(db.collections.bookings, { user_name: name }))._id)
  }
  async function assign(id, driverId) {
    mockLine()
    const res = await request(app).put(`/api/signing/${id}/sign`).set(auth(signers.vehicle_head.token))
      .send({ decision: 'approve', signature: SIGNATURE, self_drive: false, driver_id: driverId })
    expect(res.status).toBe(200)
  }

  it('suggests the free driver with the fewest trips that week', async () => {
    const all = (await request(app).get('/api/admin/drivers').set(auth(adminToken))).body.drivers
    const [s1, s2] = all.filter((d) => d.id !== driverA.id && d.id !== driverB.id)
    // A: 1 trip, overlapping the target → busy. B: 2. s1: 1. s2: 2. (Plus one
    // trip the week before, which must not count.)
    await assign(await booking('2034-01-03', '08:00', '12:00', 'แนะนำ A อังคาร'), driverA.id)
    await assign(await booking('2034-01-04', '08:00', '12:00', 'แนะนำ B พุธ'), driverB.id)
    await assign(await booking('2034-01-05', '08:00', '12:00', 'แนะนำ B พฤหัส'), driverB.id)
    await assign(await booking('2034-01-06', '08:00', '12:00', 'แนะนำ s1 ศุกร์'), s1.id)
    await assign(await booking('2034-01-06', '13:00', '16:00', 'แนะนำ s2 ศุกร์'), s2.id)
    await assign(await booking('2034-01-07', '13:00', '16:00', 'แนะนำ s2 เสาร์'), s2.id)
    await assign(await booking('2033-12-30', '08:00', '12:00', 'แนะนำ s1 สัปดาห์ก่อน'), s1.id)
    carIdx++ // not the car of A's Tuesday trip
    const target = await booking('2034-01-03', '10:00', '11:00', 'แนะนำ เป้าหมาย')

    const res = await request(app).get(`/api/admin/bookings/${target}/driver-conflicts`).set(auth(signers.supply_officer.token))
    expect(res.status).toBe(200)
    expect(res.body.week).toEqual({ from: '2034-01-02', to: '2034-01-08' })
    expect(res.body.load[driverA.id]).toBe(1)
    expect(res.body.load[driverB.id]).toBe(2)
    expect(res.body.load[s1.id]).toBe(1)
    expect(res.body.load[s2.id]).toBe(2)
    // A is busy at that hour, so never suggested; the suggestion is a free
    // driver with the lowest count (other tests may have added idle drivers).
    expect(Object.keys(res.body.busy)).toEqual([driverA.id])
    const freeLoads = Object.entries(res.body.load).filter(([id]) => id !== driverA.id).map(([, n]) => n)
    expect(res.body.recommended_id).not.toBe(driverA.id)
    expect(res.body.load[res.body.recommended_id]).toBe(Math.min(...freeLoads))

    // With the idle drivers taken out of the picture, s1 (1 trip) beats B and s2 (2 each).
    const idle = all.filter((d) => ![driverA.id, driverB.id, s1.id, s2.id].includes(d.id))
    for (const d of idle) await assign(await booking('2034-01-08', '08:00', '09:00', `แนะนำ ว่าง ${d.id}`), d.id)
    for (const d of idle) await assign(await booking('2034-01-08', '10:00', '11:00', `แนะนำ ว่างสอง ${d.id}`), d.id)
    const again = await request(app).get(`/api/admin/bookings/${target}/driver-conflicts`).set(auth(signers.supply_officer.token))
    expect(again.body.recommended_id).toBe(s1.id)

    const signing = await request(app).get(`/api/signing/drivers?booking_id=${target}`).set(auth(signers.vehicle_head.token))
    expect(signing.body.recommended_id).toBe(s1.id)
    expect(signing.body.drivers.find((d) => d.id === s2.id).week_trips).toBe(2)
  })
})
