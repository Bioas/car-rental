// SQLite driver — sql.js (WASM), in-process and zero-setup.
//
// The whole database is a single buffer that is rewritten to disk after every
// write, so it needs a filesystem that persists between requests. `data.sqlite`
// in the project directory (or whatever SQLITE_PATH points at) is ideal; on
// Vercel the only writable path is `/tmp`, which is ephemeral and per-instance,
// so data there is lost on every cold start.

const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')
const { ddl, migrate } = require('./schema.cjs')
const { seedInitialData } = require('./initial-data.cjs')
const { buildInsert, buildUpdate, normalizeParams } = require('./sql-builders.cjs')

const isVercel = process.env.VERCEL
const DB_PATH = process.env.SQLITE_PATH
  || (isVercel ? '/tmp/data.sqlite' : path.join(__dirname, '..', '..', 'data.sqlite'))

let db = null
let initPromise = null

// sql.js is synchronous and lives in one in-process buffer, so two overlapping
// BEGIN/COMMIT pairs would interleave. Write transactions are queued instead.
let txQueue = Promise.resolve()

function initDB() {
  if (!initPromise) {
    initPromise = doInitDB().catch((err) => {
      initPromise = null
      throw err
    })
  }
  return initPromise
}

async function doInitDB() {
  const CDN = 'https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/sql-wasm.wasm'
  let wasmBinary
  if (isVercel) {
    // Vercel doesn't bundle .wasm files, fetch from CDN as binary
    const resp = await fetch(CDN)
    wasmBinary = new Uint8Array(await resp.arrayBuffer())
  } else {
    const sqlJsDir = path.dirname(require.resolve('sql.js'))
    const candidates = [
      path.join(sqlJsDir, 'dist', 'sql-wasm.wasm'),
      path.join(sqlJsDir, 'sql-wasm.wasm'),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) { wasmBinary = fs.readFileSync(p); break }
    }
    if (!wasmBinary) {
      const resp = await fetch(CDN)
      wasmBinary = new Uint8Array(await resp.arrayBuffer())
    }
  }

  const SQL = await initSqlJs({ wasmBinary })
  db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database()

  db.run('PRAGMA foreign_keys=ON')

  for (const statement of ddl()) db.run(statement)
  await migrate(runner())
  await seedInitialData(runner())

  save()
  return db
}

function getDB() {
  if (!db) throw new Error('Database not initialized')
  return db
}

function save() {
  if (!db) return
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()))
}

/**
 * A runner executes SQL but never persists. Callers decide when to `save()`,
 * which is what makes transactions possible: only the commit flushes.
 */
function runner() {
  function exec(sql, params) {
    const values = normalizeParams(params)
    if (values.length > 0) db.run(sql, values)
    else db.run(sql)
    // Number of rows touched by the last INSERT/UPDATE/DELETE — `run()` returns
    // it so callers can detect a guarded update that matched nothing.
    return db.getRowsModified()
  }

  function query(sql, params = []) {
    const values = normalizeParams(params)
    const stmt = db.prepare(sql)
    if (values.length > 0) stmt.bind(values)
    const cols = stmt.getColumnNames()
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return { rows, cols }
  }

  function get(sql, params = []) {
    const result = query(sql, params)
    return result.rows.length > 0 ? result.rows[0] : null
  }

  return {
    query,
    all: (sql, params = []) => query(sql, params).rows,
    get,
    run: exec,
    insert(table, data) {
      const { sql, values } = buildInsert(table, data)
      exec(sql, values)
      const row = get('SELECT last_insert_rowid() as id')
      return row ? row.id : null
    },
    update(table, data, whereCol, whereVal) {
      const { sql, values } = buildUpdate(table, data, whereCol, whereVal)
      exec(sql, values)
    },
    // SQLite has a single writer per process; there is no row lock to take.
    lockRow: async () => null,
  }
}

let sharedRunner = null
function baseRunner() {
  if (!sharedRunner) sharedRunner = runner()
  return sharedRunner
}

// ── Public API — identical statements, but writes are flushed to disk ──────

async function run(sql, params = []) {
  const changes = baseRunner().run(sql, params)
  save()
  return changes
}

async function insert(table, data) {
  const id = baseRunner().insert(table, data)
  save()
  return id
}

async function update(table, data, whereCol, whereVal) {
  baseRunner().update(table, data, whereCol, whereVal)
  save()
}

/**
 * Run `fn` inside a single write transaction. `fn` receives a runner bound to
 * the open transaction; every statement it issues commits together — or rolls
 * back together.
 */
function transaction(fn) {
  const task = txQueue.then(async () => {
    const tx = runner()
    tx.run('BEGIN')
    try {
      const result = await fn(tx)
      tx.run('COMMIT')
      save()
      return result
    } catch (err) {
      try { tx.run('ROLLBACK') } catch { /* transaction already closed */ }
      throw err
    }
  })
  // Keep the queue alive even when this transaction rejects.
  txQueue = task.catch(() => {})
  return task
}

async function close() {
  if (db) {
    save()
    db.close()
    db = null
    initPromise = null
    sharedRunner = null
  }
}

module.exports = {
  kind: 'sqlite',
  initDB,
  getDB,
  save,
  query: (sql, params) => baseRunner().query(sql, params),
  get: (sql, params) => baseRunner().get(sql, params),
  all: (sql, params) => baseRunner().all(sql, params),
  run,
  insert,
  update,
  lockRow: async () => null,
  transaction,
  close,
  describe: () => `sqlite (${DB_PATH})`,
}
