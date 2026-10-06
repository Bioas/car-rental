// Seed script — run with `npm run seed`.
// Ensures the documented test accounts exist (idempotent) and reports the
// current state of the database. Safe to run repeatedly.
//
// The database setup in db.cjs already auto-creates an admin and one user plus
// sample cars the first time it initializes an empty database. This script
// additionally guarantees the accounts documented in README.md exist, so the
// login instructions there always work even on an already-populated database.

require('./lib/load-env.cjs').loadEnv()

const bcrypt = require('bcryptjs')
const { initDB, get, insert, all, close, describe: describeDb } = require('./db.cjs')

const SEED_USERS = [
  { name: 'ผู้ดูแลระบบ', email: 'admin@carrental.local', password: 'admin123', role: 'admin', phone: '081-000-0000' },
  { name: 'สมชาย ใจดี', email: 'somchai@carrental.local', password: 'user123', role: 'user', phone: '082-111-1111' },
  { name: 'ณัฐธิภัทร์', email: 'nantipat44@gmail.com', password: '123456', role: 'user', phone: '089-444-4444' },
]

async function seed() {
  await initDB()

  let created = 0
  for (const u of SEED_USERS) {
    const existing = await get('SELECT id FROM users WHERE email = ?', [u.email])
    if (existing) continue
    const hashed = await bcrypt.hash(u.password, 10)
    await insert('users', {
      name: u.name,
      email: u.email,
      password: hashed,
      role: u.role,
      phone: u.phone || '',
      id_card: '',
    })
    created++
  }

  const userCount = (await all('SELECT id FROM users')).length
  const carCount = (await all('SELECT id FROM cars')).length

  console.log(`\n✅ Seed เสร็จสิ้น (${describeDb()})`)
  console.log(`   ผู้ใช้ที่เพิ่มใหม่: ${created} คน (รวมทั้งหมด ${userCount} คน)`)
  console.log(`   รถในระบบ: ${carCount} คัน\n`)
  console.log('บัญชีทดสอบ:')
  for (const u of SEED_USERS) {
    console.log(`   - ${u.email} / ${u.password} (${u.role})`)
  }
  console.log('')

  await close()
  process.exit(0)
}

seed().catch(async (err) => {
  console.error('❌ Seed ล้มเหลว:', err && (err.message || err))
  try { await close() } catch { /* already closed */ }
  process.exit(1)
})
