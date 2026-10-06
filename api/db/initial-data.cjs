// Sample data created the first time an *empty* database is initialised, so a
// fresh checkout has a usable admin account and some cars to book.

const bcrypt = require('bcryptjs')

const SEED_CARS = [
  ['กข 1234', 'Toyota', 'Camry', 'ขาว', 2023, 5, 'รถประจำตำแหน่งผู้บริหาร'],
  ['กค 5678', 'Honda', 'Civic', 'ดำ', 2022, 5, ''],
  ['กง 9012', 'Isuzu', 'D-Max', 'เงิน', 2023, 4, 'รถกระบะสำหรับขนของ'],
  ['กจ 3456', 'Toyota', 'Fortuner', 'ดำ', 2024, 7, 'รถ SUV สำหรับเดินทางไกล'],
  ['กช 2345', 'Nissan', 'Almera', 'แดง', 2023, 5, 'ประหยัดน้ำมัน'],
  ['กซ 6789', 'Ford', 'Ranger', 'ขาว', 2022, 5, 'รถกระบะ 4 ประตู'],
  ['กด 0123', 'MG', 'ZS EV', 'ฟ้า', 2024, 5, 'รถไฟฟ้า'],
]

/**
 * @param {{run: Function, get: Function}} db internal runner (does not save)
 * @returns {Promise<boolean>} true when seeding actually happened
 */
async function seedInitialData(db) {
  const row = await db.get('SELECT COUNT(*) as c FROM users')
  if (!row || Number(row.c) !== 0) return false

  const adminPass = await bcrypt.hash('admin123', 10)
  const userPass = await bcrypt.hash('user123', 10)

  await db.run(
    'INSERT INTO users (name, email, password, role, phone) VALUES (?,?,?,?,?)',
    ['ผู้ดูแลระบบ', 'admin@carrental.local', adminPass, 'admin', '081-000-0000']
  )
  await db.run(
    'INSERT INTO users (name, email, password, role, phone) VALUES (?,?,?,?,?)',
    ['สมชาย ใจดี', 'somchai@carrental.local', userPass, 'user', '082-111-1111']
  )

  for (const car of SEED_CARS) {
    await db.run(
      'INSERT INTO cars (license_plate, brand, model, color, year, seats, notes, status) VALUES (?,?,?,?,?,?,?,?)',
      [...car, 'available']
    )
  }

  return true
}

module.exports = { seedInitialData, SEED_CARS }
