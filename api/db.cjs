const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')
const bcrypt = require('bcryptjs')

const isVercel = process.env.VERCEL
const DB_PATH = isVercel
  ? '/tmp/data.sqlite'
  : path.join(__dirname, '..', 'data.sqlite')
let db = null

async function initDB() {
  // Vercel bundles node_modules inside api/ but may miss WASM binaries.
  // Try filesystem paths first, then fall back to CDN.
  const sqlJsDir = path.dirname(require.resolve('sql.js'))
  const locateFile = (file) => {
    const candidates = [
      path.join(sqlJsDir, 'dist', file),
      path.join(sqlJsDir, file),
      path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file),
      path.join(__dirname, '..', 'node_modules', 'sql.js', file),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) return p
    }
    // CDN fallback — used on Vercel where WASM isn't bundled
    return `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/${file}`
  }
  const SQL = await initSqlJs({ locateFile })
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`PRAGMA foreign_keys=ON`)

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
      phone TEXT DEFAULT '',
      id_card TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  try { db.run(`ALTER TABLE users ADD COLUMN id_card TEXT DEFAULT ''`) } catch {}

  db.run(`
    CREATE TABLE IF NOT EXISTS cars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_plate TEXT UNIQUE NOT NULL,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      color TEXT DEFAULT '',
      year INTEGER DEFAULT NULL,
      seats INTEGER DEFAULT 4,
      status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','maintenance','retired')),
      image TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      car_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      purpose TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','returned')),
      admin_notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE CASCADE
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      is_read INTEGER DEFAULT 0,
      related_type TEXT DEFAULT '',
      related_id INTEGER DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

  // Auto-seed if empty
  const result = db.exec('SELECT COUNT(*) as c FROM users')
  const userCount = result?.[0]?.values?.[0]?.[0]
  if (userCount === 0) {
    const adminPass = await bcrypt.hash('admin123', 10)
    const userPass = await bcrypt.hash('user123', 10)

    db.run('INSERT INTO users (name, email, password, role, phone) VALUES (?,?,?,?,?)', ['ผู้ดูแลระบบ', 'admin@carrental.local', adminPass, 'admin', '081-000-0000'])
    db.run('INSERT INTO users (name, email, password, role, phone) VALUES (?,?,?,?,?)', ['สมชาย ใจดี', 'somchai@carrental.local', userPass, 'user', '082-111-1111'])

    const cars = [
      ['กข 1234', 'Toyota', 'Camry', 'ขาว', 2023, 5, 'รถประจำตำแหน่งผู้บริหาร'],
      ['กค 5678', 'Honda', 'Civic', 'ดำ', 2022, 5, ''],
      ['กง 9012', 'Isuzu', 'D-Max', 'เงิน', 2023, 4, 'รถกระบะสำหรับขนของ'],
      ['กจ 3456', 'Toyota', 'Fortuner', 'ดำ', 2024, 7, 'รถ SUV สำหรับเดินทางไกล'],
      ['กช 2345', 'Nissan', 'Almera', 'แดง', 2023, 5, 'ประหยัดน้ำมัน'],
      ['กซ 6789', 'Ford', 'Ranger', 'ขาว', 2022, 5, 'รถกระบะ 4 ประตู'],
      ['กด 0123', 'MG', 'ZS EV', 'ฟ้า', 2024, 5, 'รถไฟฟ้า'],
    ]
    const stmt = db.prepare('INSERT INTO cars (license_plate, brand, model, color, year, seats, notes, status) VALUES (?,?,?,?,?,?,?,?)')
    for (const c of cars) {
      stmt.run([...c, 'available'])
    }
    stmt.free()
  }

  save()
  return db
}

function getDB() {
  if (!db) throw new Error('Database not initialized')
  return db
}

function save() {
  if (!db) return
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(DB_PATH, buffer)
}

function query(sql, params = []) {
  const stmt = db.prepare(sql)
  if (params.length > 0) stmt.bind(params)
  const cols = stmt.getColumnNames()
  const rows = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return { rows, cols }
}

function run(sql, params = []) {
  db.run(sql, params)
  save()
}

function get(sql, params = []) {
  const result = query(sql, params)
  return result.rows.length > 0 ? result.rows[0] : null
}

function all(sql, params = []) {
  return query(sql, params).rows
}

function insert(table, data) {
  const keys = Object.keys(data)
  const values = Object.values(data)
  const placeholders = keys.map(() => '?').join(', ')
  const cols = keys.join(', ')
  db.run(`INSERT INTO ${table} (${cols}) VALUES (${placeholders})`, values)
  const result = get('SELECT last_insert_rowid() as id')
  save()
  return result ? result.id : null
}

function update(table, data, whereCol, whereVal) {
  const keys = Object.keys(data)
  const values = Object.values(data)
  const setClause = keys.map(k => `${k} = ?`).join(', ')
  values.push(whereVal)
  run(`UPDATE ${table} SET ${setClause} WHERE ${whereCol} = ?`, values)
}

module.exports = { initDB, getDB, save, query, run, get, all, insert, update }
