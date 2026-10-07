import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prepareDatabase, cleanupDatabase, require } from './helpers.mjs'

await prepareDatabase('db')
const db = require('../db.cjs')

describe('database layer', () => {
  beforeAll(async () => {
    await db.initDB()
  })

  afterAll(async () => {
    await cleanupDatabase()
  })

  it('uses the mongodb driver', () => {
    expect(db.kind).toBe('mongodb')
    expect(db.describe()).toContain('mongodb')
  })

  it('seeds the documented accounts and sample cars', async () => {
    const users = await db.find(db.collections.users, {})
    const emails = users.map((u) => u.email)
    expect(emails).toContain('admin@carrental.local')
    expect(users.find((u) => u.email === 'admin@carrental.local').role).toBe('admin')
    expect(await db.countDocuments(db.collections.cars, {})).toBeGreaterThan(0)
  })

  it('has no dead cars.image field', async () => {
    const car = await db.findOne(db.collections.cars, {})
    expect(car.image).toBeUndefined()
  })

  it('stores users with a token_version', async () => {
    const user = await db.findOne(db.collections.users, { email: 'admin@carrental.local' })
    expect(user.token_version).toBe(0)
  })

  it('returns an ObjectId from insertOne', async () => {
    const id = await db.insertOne(db.collections.cars, { license_plate: 'DRV 001', brand: 'Test', model: 'One', status: 'available', created_at: new Date() })
    expect(id).toBeInstanceOf(db.ObjectId)
    expect(db.str(id)).toMatch(/^[0-9a-f]{24}$/)
  })

  it('counts come back as numbers, not strings', async () => {
    const count = await db.countDocuments(db.collections.cars, {})
    expect(typeof count).toBe('number')
  })

  it('reports how many rows an update touched', async () => {
    const id = await db.insertOne(db.collections.cars, { license_plate: 'DRV 005', brand: 'Counted', model: 'Five', status: 'available', created_at: new Date() })
    const hit = await db.updateOne(db.collections.cars, { _id: id }, { $set: { brand: 'Counted 2' } })
    expect(hit.matchedCount).toBe(1)
    const miss = await db.updateOne(db.collections.cars, { _id: db.toId('000000000000000000000000') }, { $set: { brand: 'nope' } })
    expect(miss.matchedCount).toBe(0)
  })

  it('deletes a document', async () => {
    const id = await db.insertOne(db.collections.cars, { license_plate: 'DRV 007', brand: 'Gone', model: 'Seven', status: 'available', created_at: new Date() })
    const removed = await db.deleteOne(db.collections.cars, { _id: id })
    expect(removed.deletedCount).toBe(1)
    expect(await db.findOne(db.collections.cars, { _id: id })).toBeNull()
  })

  it('enforces the unique email index', async () => {
    await expect(db.insertOne(db.collections.users, {
      name: 'Dup', email: 'admin@carrental.local', password: 'x', role: 'user', token_version: 0, created_at: new Date(),
    })).rejects.toMatchObject({ code: 11000 })
  })

  it('turns a malformed id into null instead of throwing', () => {
    expect(db.toId('not-an-id')).toBeNull()
    expect(db.toId('999999')).toBeNull()
  })

  it('serializes ids back to strings', () => {
    const oid = new db.ObjectId()
    expect(db.str(oid)).toBe(oid.toString())
    expect(db.str(null)).toBeNull()
  })
})
