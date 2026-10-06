// Database access layer — SQLite via sql.js (WASM), one engine by design.
//
// Every route imports this module and gets the same async API:
//   query / run / get / all / insert / update / transaction / lockRow
//
// The API is async even though sql.js itself is synchronous: that keeps the
// call sites identical to a normal remote database and lets `transaction()`
// wrap `fn` in a real BEGIN/COMMIT.
//
// Note on deployment: the database is a single file that is rewritten after
// every write, so a host with an ephemeral filesystem (Vercel `/tmp`) starts
// from an empty file on every cold start. On a normal server or a container with
// a mounted volume the data persists.

const driver = require('./db/sqlite.cjs')

module.exports = {
  kind: driver.kind,
  describe: driver.describe,
  initDB: driver.initDB,
  getDB: driver.getDB,
  save: driver.save,
  query: driver.query,
  run: driver.run,
  get: driver.get,
  all: driver.all,
  insert: driver.insert,
  update: driver.update,
  lockRow: driver.lockRow,
  transaction: driver.transaction,
  close: driver.close,
}
