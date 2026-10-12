import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { prepareDatabase, cleanupDatabase, require, loginAs, ADMIN, auth, createUser } from './helpers.mjs'

// Booking times: a car can be booked several times on one day as long as the
// time spans do not overlap; bookings without times still take whole days.

await prepareDatabase('booking-time')
const app = require('../server.cjs')
const db = require('../db.cjs')
const { spansOverlap, parseBookingTimes } = require('../lib/booking-time.cjs')

const signature = 'data:image/png;base64,iVBORw0KGgo='
const DAY = '2032-03-10'
let carId
let staffToken

const book = (body) => request(app).post('/api/public/bookings')
  .send({ name: 'ผู้ยืมตามเวลา', phone: '0812345678', car_id: carId, signature, start_date: DAY, end_date: DAY, ...body })

beforeAll(async () => {
  await db.initDB()
  const adminToken = await loginAs(app, ADMIN.email, ADMIN.password)
  staffToken = (await createUser(app, adminToken, { role: 'staff', name: 'Time Staff' })).token
  carId = (await request(app).get('/api/public/cars')).body.cars[0].id
})

afterAll(async () => {
  await cleanupDatabase()
})

describe('booking time spans', () => {
  it('treats missing times as the whole day and lets back-to-back spans pass', () => {
    const d = { start_date: DAY, end_date: DAY }
    expect(spansOverlap({ ...d, start_time: '08:00', end_time: '12:00' }, { ...d, start_time: '12:00', end_time: '17:00' })).toBe(false)
    expect(spansOverlap({ ...d, start_time: '08:00', end_time: '12:00' }, { ...d, start_time: '11:00', end_time: '13:00' })).toBe(true)
    expect(spansOverlap(d, { ...d, start_time: '20:00', end_time: '23:00' })).toBe(true)
    // An overnight trip ends the next morning.
    expect(spansOverlap({ start_date: DAY, end_date: '2032-03-11', start_time: '18:00', end_time: '09:00' },
      { start_date: '2032-03-11', end_date: '2032-03-11', start_time: '09:00', end_time: '12:00' })).toBe(false)
  })

  it('validates the times', () => {
    expect(parseBookingTimes({ start_date: DAY, end_date: DAY })).toEqual({ start_time: '', end_time: '' })
    expect(parseBookingTimes({ start_date: DAY, end_date: DAY, start_time: '08:00' }).error).toBeTruthy()
    expect(parseBookingTimes({ start_date: DAY, end_date: DAY, start_time: '8:00', end_time: '12:00' }).error).toBeTruthy()
    expect(parseBookingTimes({ start_date: DAY, end_date: DAY, start_time: '12:00', end_time: '12:00' }).error).toBeTruthy()
    expect(parseBookingTimes({ start_date: DAY, end_date: '2032-03-11', start_time: '18:00', end_time: '09:00' }))
      .toEqual({ start_time: '18:00', end_time: '09:00' })
  })
})

describe('booking the same car on one day', () => {
  it('stores the times on the booking', async () => {
    const res = await book({ start_time: '08:00', end_time: '12:00' })
    expect(res.status).toBe(201)
    const row = await db.findOne(db.collections.bookings, { car_id: db.toId(carId), start_time: '08:00' })
    expect(row.end_time).toBe('12:00')
  })

  it('allows a later, non-overlapping booking the same day', async () => {
    expect((await book({ start_time: '12:00', end_time: '17:00' })).status).toBe(201)
  })

  it('rejects an overlapping time span with 409', async () => {
    const res = await book({ start_time: '11:00', end_time: '13:00' })
    expect(res.status).toBe(409)
    expect(res.body.error).toContain('เวลา')
  })

  it('rejects a whole-day booking on a day that already has timed bookings', async () => {
    expect((await book({})).status).toBe(409)
  })

  it('rejects bad times with 400', async () => {
    expect((await book({ start_time: '13:00', end_time: '10:00', start_date: '2032-03-12', end_date: '2032-03-12' })).status).toBe(400)
    expect((await book({ start_time: '25:00', end_time: '26:00', start_date: '2032-03-12', end_date: '2032-03-12' })).status).toBe(400)
  })

  it('applies the same rule to staff-created bookings', async () => {
    const send = (body) => request(app).post('/api/bookings').set(auth(staffToken))
      .send({ name: 'ผู้ยืมโดยเจ้าหน้าที่', phone: '0899999999', car_id: carId, start_date: DAY, end_date: DAY, ...body })
    expect((await send({ start_time: '16:00', end_time: '18:00' })).status).toBe(409)
    const ok = await send({ start_time: '17:00', end_time: '20:00' })
    expect(ok.status).toBe(201)
    expect(ok.body.booking.start_time).toBe('17:00')
    expect(ok.body.booking.end_time).toBe('20:00')
  })
})

describe('available cars for a time span', () => {
  const ids = async (q) => (await request(app).get(`/api/public/cars?${q}`)).body.cars.map((c) => c.id)

  it('hides the car only when the requested span overlaps a booking', async () => {
    expect(await ids(`start_date=${DAY}&end_date=${DAY}&start_time=09:00&end_time=10:00`)).not.toContain(carId)
    expect(await ids(`start_date=${DAY}&end_date=${DAY}&start_time=20:00&end_time=22:00`)).toContain(carId)
    // Without times the whole day is checked.
    expect(await ids(`start_date=${DAY}&end_date=${DAY}`)).not.toContain(carId)
  })

  it('rejects an incomplete time filter', async () => {
    expect((await request(app).get(`/api/public/cars?start_date=${DAY}&end_date=${DAY}&start_time=09:00`)).status).toBe(400)
  })

  it('returns the times in the public calendar and lookup', async () => {
    const cal = await request(app).get('/api/public/calendar')
    const timed = cal.body.bookings.find((b) => b.start_time === '08:00')
    expect(timed).toBeTruthy()
    expect(timed.end_time).toBe('12:00')
  })
})
