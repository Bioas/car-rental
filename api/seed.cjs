// Seed script — run with `npm run seed`.
// Ensures the documented test accounts exist (idempotent) and reports the
// current state of the database. Safe to run repeatedly.
//
// db.cjs already auto-creates an admin and one user plus sample cars the first
// time it initializes an empty database. This script additionally guarantees the
// accounts documented in README.md exist, so the login instructions there always
// work even on an already-populated database.

require('./lib/load-env.cjs').loadEnv()

const bcrypt = require('bcryptjs')
const { initDB, describe: describeDb, close, collections, find, findOne, insertOne, countDocuments } = require('./db.cjs')

const SEED_USERS = [
  { name: 'ผู้ดูแลระบบ', email: 'admin@carrental.local', password: 'admin123', role: 'admin', phone: '081-000-0000', position: 'ผู้ดูแลระบบ' },
  { name: 'สมชาย ใจดี', email: 'somchai@carrental.local', password: 'user123', role: 'user', phone: '082-111-1111', position: 'ครู' },
  { name: 'ณัฐธิภัทร์', email: 'nantipat44@gmail.com', password: '123456', role: 'user', phone: '089-444-4444', position: 'เจ้าหน้าที่ธุรการ' },
]

// Drivers are seeded without a password — they are only assigned to bookings by
// an admin and cannot sign in.
const SEED_DRIVERS = [
  { name: 'สมศักดิ์ ขับดี', email: 'driver1@carrental.local', phone: '086-555-5551', position: 'พนักงานขับรถ' },
  { name: 'ประเสริฐ ทางไกล', email: 'driver2@carrental.local', phone: '086-555-5552', position: 'พนักงานขับรถ' },
]

async function seed() {
  await initDB()

  let created = 0
  for (const u of SEED_USERS) {
    const existing = await findOne(collections.users, { email: u.email })
    if (existing) continue
    const hashed = await bcrypt.hash(u.password, 10)
    await insertOne(collections.users, {
      name: u.name,
      email: u.email,
      password: hashed,
      role: u.role,
      phone: u.phone || '',
      position: u.position || '',
      id_card: '',
      avatar: '',
      token_version: 0,
      created_at: new Date(),
    })
    created++
  }

  for (const d of SEED_DRIVERS) {
    const existing = await findOne(collections.users, { email: d.email })
    if (existing) continue
    await insertOne(collections.users, {
      name: d.name,
      email: d.email,
      password: '',
      role: 'driver',
      phone: d.phone || '',
      position: d.position || '',
      id_card: '',
      avatar: '',
      token_version: 0,
      created_at: new Date(),
    })
    created++
  }

  const userCount = await countDocuments(collections.users, {})
  const carCount = await countDocuments(collections.cars, {})
  const cars = await find(collections.cars, {}, { projection: { license_plate: 1, brand: 1, model: 1 } })

  console.log(`\n✅ Seed เสร็จสิ้น (${describeDb()})`)
  console.log(`   ผู้ใช้ที่เพิ่มใหม่: ${created} คน (รวมทั้งหมด ${userCount} คน)`)
  console.log(`   รถในระบบ: ${carCount} คัน`)
  console.log('')
  console.log('บัญชีทดสอบ:')
  for (const u of SEED_USERS) {
    console.log(`   - ${u.email} / ${u.password} (${u.role})`)
  }
  console.log('')
  if (cars.length) {
    console.log('รถตัวอย่าง:')
    for (const c of cars) console.log(`   - ${c.license_plate} ${c.brand} ${c.model}`)
    console.log('')
  }

  await close()
  process.exit(0)
}

seed().catch(async (err) => {
  console.error('❌ Seed ล้มเหลว:', err && (err.message || err))
  try { await close() } catch { /* already closed */ }
  process.exit(1)
})
