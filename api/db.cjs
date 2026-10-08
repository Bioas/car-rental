// Database access layer — MongoDB (Atlas in production, any mongod locally).
//
// The SQLite driver this replaces rewrote a single file after every write, which
// cannot work on Vercel: serverless functions get a fresh, ephemeral filesystem
// and the database file is lost on every cold start. MongoDB is a network
// service, so there is no per-instance state to lose.
//
// Routes talk to this module, not to the driver directly. It exposes the small
// set of operations the app needs plus a few helpers used across routes:
//
//   connect / initDB / close / kind / describe
//   collections.{users,cars,bookings,notifications}()   -> Collection
//   toId / str                                          -> id conversion
//   find / findOne / insertOne / updateOne / updateMany /
//   deleteOne / deleteMany / countDocuments / aggregate
//   withLock(key, fn)                                   -> in-process mutex
//
// Configuration is read lazily (at connect time), so a test can point the whole
// process at a different database by setting `MONGODB_URI` / `MONGODB_DB` before
// the first query.

const { MongoClient, ObjectId } = require('mongodb')
const bcrypt = require('bcryptjs')

const DEFAULT_URI = 'mongodb://127.0.0.1:27017'
const DEFAULT_DB = 'car-rental'

function getUri() {
  return process.env.MONGODB_URI || DEFAULT_URI
}

function getDbName() {
  return process.env.MONGODB_DB || process.env.MONGODB_DATABASE || DEFAULT_DB
}

let client = null
let database = null
let connectPromise = null
let initPromise = null

/** Convert anything id-like into an ObjectId (or null when it cannot be one). */
function toId(value) {
  if (value instanceof ObjectId) return value
  if (typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) return new ObjectId(value)
  return null
}

/** Serialize an id-ish value back to the string form the API exposes. */
function str(value) {
  if (value instanceof ObjectId) return value.toString()
  if (value === null || value === undefined) return null
  return String(value)
}

async function connect() {
  if (database) return database
  if (!connectPromise) {
    connectPromise = (async () => {
      const c = new MongoClient(getUri(), { serverSelectionTimeoutMS: 10000 })
      await c.connect()
      client = c
      database = c.db(getDbName())
      return database
    })().catch((err) => {
      connectPromise = null
      throw err
    })
  }
  await connectPromise
  return database
}

function requireDb() {
  if (!database) throw new Error('Database not initialized — call connect()/initDB() first')
  return database
}

const collections = {
  users: () => requireDb().collection('users'),
  cars: () => requireDb().collection('cars'),
  bookings: () => requireDb().collection('bookings'),
  notifications: () => requireDb().collection('notifications'),
}

// ─── thin CRUD wrappers ──────────────────────────────────────────────────────

async function find(collection, filter = {}, options = {}) {
  const { sort, skip, limit, projection } = options
  let cursor = collection().find(filter, projection ? { projection } : {})
  if (sort) cursor = cursor.sort(sort)
  if (skip) cursor = cursor.skip(skip)
  if (limit) cursor = cursor.limit(limit)
  return cursor.toArray()
}

async function findOne(collection, filter = {}, options = {}) {
  const { projection, sort } = options
  return collection().findOne(filter, {
    ...(projection ? { projection } : {}),
    ...(sort ? { sort } : {}),
  })
}

async function insertOne(collection, doc) {
  const result = await collection().insertOne(doc)
  return result.insertedId
}

async function insertMany(collection, docs) {
  const result = await collection().insertMany(docs)
  return result
}

async function updateOne(collection, filter, update, options = {}) {
  return collection().updateOne(filter, update, options)
}

async function updateMany(collection, filter, update) {
  return collection().updateMany(filter, update)
}

async function deleteOne(collection, filter) {
  return collection().deleteOne(filter)
}

async function deleteMany(collection, filter = {}) {
  return collection().deleteMany(filter)
}

function countDocuments(collection, filter = {}) {
  return collection().countDocuments(filter)
}

function aggregate(collection, pipeline) {
  return collection().aggregate(pipeline).toArray()
}

// ─── in-process write lock ───────────────────────────────────────────────────
//
// The overlap check in the booking routes is a read-then-write. Two requests
// arriving at the same instant must not both see "no conflict". MongoDB has no
// row locks to take, so writes for the same key are queued inside this process.
// (A multi-instance deployment would additionally want a DB-level lock; the
// unique index on cars.license_plate still protects against duplicate cars.)
const locks = new Map()

function withLock(key, fn) {
  const previous = locks.get(key) || Promise.resolve()
  const run = previous.then(fn, fn)
  // Keep the chain alive but never let a rejection poison the next waiter.
  locks.set(key, run.then(() => {}, () => {}))
  return run
}

// ─── initialization + seed ────────────────────────────────────────────────────

async function initDB() {
  if (!initPromise) {
    initPromise = doInitDB().catch((err) => {
      initPromise = null
      throw err
    })
  }
  return initPromise
}

async function doInitDB() {
  const db = await connect()
  // createIndex is idempotent, and every index below matches a query shape the
  // routes actually issue (list sorts, status filters, availability clash
  // scans). They are created in parallel — a cold start pays one round trip
  // instead of one per index.
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('users').createIndex({ created_at: -1 }),
    db.collection('users').createIndex({ role: 1, name: 1 }),
    db.collection('cars').createIndex({ license_plate: 1 }, { unique: true }),
    db.collection('cars').createIndex({ status: 1, brand: 1, model: 1 }),
    db.collection('bookings').createIndex({ car_id: 1, status: 1, start_date: 1, end_date: 1 }),
    db.collection('bookings').createIndex({ user_id: 1, created_at: -1 }),
    db.collection('bookings').createIndex({ status: 1, created_at: -1 }),
    db.collection('bookings').createIndex({ created_at: -1 }),
    db.collection('bookings').createIndex({ status: 1, start_date: 1, end_date: 1 }),
    db.collection('notifications').createIndex({ user_id: 1, created_at: -1 }),
    db.collection('notifications').createIndex({ user_id: 1, is_read: 1 }),
  ])

  const userCount = await db.collection('users').countDocuments()
  if (userCount === 0) await seedInitialData(db)
  return db
}

const SEED_CARS = [
  // [license_plate, brand, model, type, color, year, seats, notes]
  ['กข 1234', 'Toyota', 'Camry', 'รถเก๋ง', 'ขาว', 2023, 5, 'รถประจำตำแหน่งผู้บริหาร'],
  ['กค 5678', 'Honda', 'Civic', 'รถเก๋ง', 'ดำ', 2022, 5, ''],
  ['กง 9012', 'Isuzu', 'D-Max', 'รถกระบะ', 'เงิน', 2023, 4, 'รถกระบะสำหรับขนของ'],
  ['กจ 3456', 'Toyota', 'Fortuner', 'รถ SUV', 'ดำ', 2024, 7, 'รถ SUV สำหรับเดินทางไกล'],
  ['กช 2345', 'Nissan', 'Almera', 'รถเก๋ง', 'แดง', 2023, 5, 'ประหยัดน้ำมัน'],
  ['กซ 6789', 'Ford', 'Ranger', 'รถกระบะ', 'ขาว', 2022, 5, 'รถกระบะ 4 ประตู'],
  ['กด 0123', 'MG', 'ZS EV', 'รถเก๋ง', 'ฟ้า', 2024, 5, 'รถไฟฟ้า'],
]

// Sample drivers have no password: a driver is only ever assigned to a booking
// by an admin, never able to sign in on their own.
const SEED_DRIVERS = [
  { name: 'สมศักดิ์ ขับดี', email: 'driver1@carrental.local', phone: '086-555-5551', position: 'พนักงานขับรถ' },
  { name: 'ประเสริฐ ทางไกล', email: 'driver2@carrental.local', phone: '086-555-5552', position: 'พนักงานขับรถ' },
]

async function seedInitialData(db) {
  const [adminPass, userPass] = await Promise.all([
    bcrypt.hash('admin123', 10),
    bcrypt.hash('user123', 10),
  ])

  const now = new Date()
  await db.collection('users').insertMany([
    { name: 'ผู้ดูแลระบบ', email: 'admin@carrental.local', password: adminPass, role: 'admin', phone: '081-000-0000', id_card: '', avatar: '', position: 'ผู้ดูแลระบบ', token_version: 0, created_at: now },
    { name: 'สมชาย ใจดี', email: 'somchai@carrental.local', password: userPass, role: 'user', phone: '082-111-1111', id_card: '', avatar: '', position: 'ครู', token_version: 0, created_at: now },
    ...SEED_DRIVERS.map((d) => ({ ...d, password: '', id_card: '', avatar: '', role: 'driver', token_version: 0, created_at: now })),
  ])

  await db.collection('cars').insertMany(SEED_CARS.map(([license_plate, brand, model, type, color, year, seats, notes]) => ({
    license_plate, brand, model, type, color, year, seats, notes, status: 'available', created_at: now,
  })))
}

async function close() {
  if (client) {
    await client.close()
  }
  client = null
  database = null
  connectPromise = null
  initPromise = null
}

function describe() {
  return `mongodb (${getDbName()})`
}

module.exports = {
  kind: 'mongodb',
  describe,
  connect,
  initDB,
  close,
  collections,
  toId,
  str,
  find,
  findOne,
  insertOne,
  insertMany,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
  countDocuments,
  aggregate,
  withLock,
  ObjectId,
}
