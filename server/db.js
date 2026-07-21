import initSqlJs from 'sql.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'data.sqlite')
let db = null

export async function initDB() {
  const SQL = await initSqlJs()
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`PRAGMA journal_mode=WAL`)
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

  save()
  return db
}

export function getDB() {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function save() {
  if (!db) return
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(DB_PATH, buffer)
}

export function query(sql, params = []) {
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

export function run(sql, params = []) {
  db.run(sql, params)
  save()
}

export function get(sql, params = []) {
  const result = query(sql, params)
  return result.rows.length > 0 ? result.rows[0] : null
}

export function all(sql, params = []) {
  return query(sql, params).rows
}

export function insert(table, data) {
  const keys = Object.keys(data)
  const values = Object.values(data)
  const placeholders = keys.map(() => '?').join(', ')
  const cols = keys.join(', ')
  run(`INSERT INTO ${table} (${cols}) VALUES (${placeholders})`, values)
  const result = get('SELECT last_insert_rowid() as id')
  return result ? result.id : null
}

export function update(table, data, whereCol, whereVal) {
  const keys = Object.keys(data)
  const values = Object.values(data)
  const setClause = keys.map(k => `${k} = ?`).join(', ')
  values.push(whereVal)
  run(`UPDATE ${table} SET ${setClause} WHERE ${whereCol} = ?`, values)
}
