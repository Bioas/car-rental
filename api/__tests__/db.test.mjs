import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prepareDatabase, cleanupDatabase, require } from './helpers.mjs'

await prepareDatabase()
const db = require('../db.cjs')

describe('database layer', () => {
  beforeAll(async () => {
    await db.initDB()
  })

  afterAll(async () => {
    await db.close()
    cleanupDatabase()
  })

  async function columns(table) {
    return (await db.all(`PRAGMA table_info(${table})`)).map((c) => c.name)
  }

  it('uses the sqlite driver', () => {
    expect(db.kind).toBe('sqlite')
  })

  it('seeds the documented accounts and sample cars', async () => {
    const users = await db.all('SELECT email, role FROM users ORDER BY email')
    expect(users.map((u) => u.email)).toContain('admin@carrental.local')
    expect(users.find((u) => u.email === 'admin@carrental.local').role).toBe('admin')
    expect((await db.all('SELECT id FROM cars')).length).toBeGreaterThan(0)
  })

  it('dropped the dead cars.image column', async () => {
    expect(await columns('cars')).not.toContain('image')
  })

  it('still exposes users.token_version', async () => {
    expect(await columns('users')).toContain('token_version')
  })

  it('returns a numeric generated id from insert()', async () => {
    const id = await db.insert('cars', { license_plate: 'DRV 001', brand: 'Test', model: 'One' })
    expect(typeof id).toBe('number')
    expect(id).toBeGreaterThan(0)
  })

  it('counts come back as numbers, not strings', async () => {
    const row = await db.get('SELECT COUNT(*) as count FROM cars')
    expect(typeof row.count).toBe('number')
  })

  it('binds undefined as NULL instead of throwing', async () => {
    const row = await db.get('SELECT ? as value', [undefined])
    expect(row.value).toBeNull()
  })

  it('reports how many rows an update touched', async () => {
    const id = await db.insert('cars', { license_plate: 'DRV 005', brand: 'Counted', model: 'Five' })
    expect(await db.run('UPDATE cars SET brand = ? WHERE id = ?', ['Counted 2', id])).toBe(1)
    expect(await db.run('UPDATE cars SET brand = ? WHERE id = ?', ['nope', 999_999])).toBe(0)
  })

  it('commits a transaction', async () => {
    const id = await db.insert('cars', { license_plate: 'DRV 002', brand: 'Before', model: 'Two' })
    await db.transaction(async (tx) => {
      await tx.run('UPDATE cars SET brand = ? WHERE id = ?', ['After', id])
    })
    expect((await db.get('SELECT brand FROM cars WHERE id = ?', [id])).brand).toBe('After')
  })

  it('rolls the whole transaction back when something throws', async () => {
    const id = await db.insert('cars', { license_plate: 'DRV 003', brand: 'Original', model: 'Three' })
    await expect(db.transaction(async (tx) => {
      await tx.run('UPDATE cars SET brand = ? WHERE id = ?', ['ShouldNotPersist', id])
      await tx.insert('cars', { license_plate: 'DRV 004', brand: 'Ghost', model: 'Four' })
      throw new Error('boom')
    })).rejects.toThrow('boom')

    expect((await db.get('SELECT brand FROM cars WHERE id = ?', [id])).brand).toBe('Original')
    expect(await db.get("SELECT id FROM cars WHERE license_plate = 'DRV 004'")).toBeNull()
  })

  it('runs transactions one at a time', async () => {
    const id = await db.insert('cars', { license_plate: 'DRV 006', brand: 'Queue', model: 'Six' })
    const order = []
    await Promise.all([
      db.transaction(async (tx) => {
        order.push('first:start')
        await tx.run('UPDATE cars SET brand = ? WHERE id = ?', ['First', id])
        order.push('first:end')
      }),
      db.transaction(async (tx) => {
        order.push('second:start')
        await tx.run('UPDATE cars SET brand = ? WHERE id = ?', ['Second', id])
        order.push('second:end')
      }),
    ])
    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
  })

  it('can take a row lock inside a transaction', async () => {
    const car = await db.get('SELECT id FROM cars LIMIT 1')
    await expect(db.transaction(async (tx) => {
      await tx.lockRow('cars', car.id)
    })).resolves.toBeUndefined()
  })
})
