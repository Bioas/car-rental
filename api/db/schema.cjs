// The database schema and its migrations — SQLite (sql.js).
//
// Timestamps are TEXT (`YYYY-MM-DD HH:MM:SS`, UTC) produced by
// CURRENT_TIMESTAMP. The application orders bookings by `created_at` and reads
// `substr(created_at, 1, 7)` for the monthly report, both of which rely on that
// string format.
//
// `cars.image` is gone — nothing has ever read or written it.

/**
 * The complete set of CREATE TABLE / CREATE INDEX statements.
 * @returns {string[]}
 */
function ddl() {
  return [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
      phone TEXT DEFAULT '',
      id_card TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      token_version INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS cars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_plate TEXT UNIQUE NOT NULL,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      color TEXT DEFAULT '',
      year INTEGER DEFAULT NULL,
      seats INTEGER DEFAULT 4,
      status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','maintenance','retired')),
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      car_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      purpose TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','returned','cancelled')),
      admin_notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      is_read INTEGER DEFAULT 0,
      related_type TEXT DEFAULT '',
      related_id INTEGER DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // The overlap check runs on every booking attempt.
    `CREATE INDEX IF NOT EXISTS idx_bookings_car_status_dates
       ON bookings (car_id, status, start_date, end_date)`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings (user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, is_read)`,
  ]
}

/**
 * Bring an existing database file up to the current schema. Safe to run on
 * every boot: every step checks first and is individually non-fatal.
 * @param {{run: Function, all: Function, get: Function}} db internal runner (does not save)
 */
async function migrate(db) {
  const userCols = (await db.all('PRAGMA table_info(users)')).map((c) => c.name)
  if (!userCols.includes('id_card')) {
    await db.run("ALTER TABLE users ADD COLUMN id_card TEXT DEFAULT ''")
  }
  if (!userCols.includes('token_version')) {
    await db.run('ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0')
  }

  // Older databases predate the 'cancelled' status; rebuild the table because
  // the CHECK constraint cannot be altered in place.
  const tableRow = await db.get(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='bookings'"
  )
  const currentSql = (tableRow && tableRow.sql) || ''
  if (currentSql && !currentSql.includes('cancelled')) {
    await db.run('PRAGMA foreign_keys = OFF')
    await db.run('BEGIN TRANSACTION')
    await db.run(`CREATE TABLE bookings_migrated (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      car_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      purpose TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','returned','cancelled')),
      admin_notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE CASCADE
    )`)
    await db.run('INSERT INTO bookings_migrated SELECT * FROM bookings')
    await db.run('DROP TABLE bookings')
    await db.run('ALTER TABLE bookings_migrated RENAME TO bookings')
    await db.run('COMMIT')
    await db.run('PRAGMA foreign_keys = ON')
  }

  // Drop the dead `cars.image` column (SQLite >= 3.35, which sql.js bundles).
  const carCols = (await db.all('PRAGMA table_info(cars)')).map((c) => c.name)
  if (carCols.includes('image')) {
    try {
      await db.run('ALTER TABLE cars DROP COLUMN image')
    } catch (err) {
      console.warn('[db] could not drop cars.image:', err && err.message)
    }
  }
}

module.exports = { ddl, migrate }
