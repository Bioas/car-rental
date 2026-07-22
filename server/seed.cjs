const { initDB, insert, all, run } = require('./db.cjs')
const bcrypt = require('bcryptjs')

async function seed() {
  await initDB()

  run('DELETE FROM notifications')
  run('DELETE FROM bookings')
  run('DELETE FROM cars')
  run('DELETE FROM users')

  const adminPass = await bcrypt.hash('admin123', 10)
  const userPass = await bcrypt.hash('user123', 10)

  insert('users', { name: 'ผู้ดูแลระบบ', email: 'admin@carrental.local', password: adminPass, role: 'admin', phone: '081-000-0000' })
  insert('users', { name: 'สมชาย ใจดี', email: 'somchai@carrental.local', password: userPass, role: 'user', phone: '082-111-1111' })
  insert('users', { name: 'สมหญิง รักดี', email: 'somying@carrental.local', password: userPass, role: 'user', phone: '083-222-2222' })
  insert('users', { name: 'ประยุทธ์ ขับเก่ง', email: 'prayut@carrental.local', password: userPass, role: 'user', phone: '084-333-3333' })
  insert('users', { name: 'อนุชา รักษ์รถ', email: 'anucha@carrental.local', password: userPass, role: 'user', phone: '085-444-4444' })

  const cars = [
    { license_plate: 'กข 1234', brand: 'Toyota', model: 'Camry', color: 'ขาว', year: 2023, seats: 5, status: 'available', notes: 'รถประจำตำแหน่งผู้บริหาร' },
    { license_plate: 'กค 5678', brand: 'Honda', model: 'Civic', color: 'ดำ', year: 2022, seats: 5, status: 'available', notes: '' },
    { license_plate: 'กง 9012', brand: 'Isuzu', model: 'D-Max', color: 'เงิน', year: 2023, seats: 4, status: 'available', notes: 'รถกระบะสำหรับขนของ' },
    { license_plate: 'กจ 3456', brand: 'Toyota', model: 'Fortuner', color: 'ดำ', year: 2024, seats: 7, status: 'available', notes: 'รถ SUV สำหรับเดินทางไกล' },
    { license_plate: 'กฉ 7890', brand: 'Mitsubishi', model: 'Pajero', color: 'เทา', year: 2021, seats: 7, status: 'maintenance', notes: 'อยู่ระหว่างเข้าศูนย์' },
    { license_plate: 'กช 2345', brand: 'Nissan', model: 'Almera', color: 'แดง', year: 2023, seats: 5, status: 'available', notes: 'ประหยัดน้ำมัน' },
    { license_plate: 'กซ 6789', brand: 'Ford', model: 'Ranger', color: 'ขาว', year: 2022, seats: 5, status: 'available', notes: 'รถกระบะ 4 ประตู' },
    { license_plate: 'กด 0123', brand: 'MG', model: 'ZS EV', color: 'ฟ้า', year: 2024, seats: 5, status: 'available', notes: 'รถไฟฟ้า' },
  ]

  cars.forEach(c => insert('cars', c))

  console.log('✅ Seed data inserted successfully!')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Admin: admin@carrental.local / admin123')
  console.log('User:  somchai@carrental.local / user123')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

seed().catch(console.error)
