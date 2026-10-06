// Generic INSERT/UPDATE builders used by the database layer, so column handling
// lives in one place instead of being repeated at every call site.
//
// Values are always bound as parameters, never interpolated: `data` comes from
// request bodies. Identifiers (table/column names) do come from code, but they
// are still validated because `update(table, data, whereCol, ...)` builds its
// WHERE clause from a caller-supplied column name.

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

function assertIdentifier(name, what) {
  if (!IDENTIFIER.test(String(name || ''))) {
    throw new Error(`Invalid SQL ${what}: ${JSON.stringify(name)}`)
  }
  return name
}

function assertData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('data must be a plain object')
  }
  const keys = Object.keys(data)
  if (keys.length === 0) throw new Error('data must not be empty')
  keys.forEach((k) => assertIdentifier(k, 'column'))
  return keys
}

/**
 * @param {string} table
 * @param {object} data
 * @returns {{ sql: string, values: any[], keys: string[] }}
 */
function buildInsert(table, data) {
  assertIdentifier(table, 'table')
  const keys = assertData(data)
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  return { sql, values: keys.map((k) => data[k]), keys }
}

/**
 * @param {string} table
 * @param {object} data
 * @param {string} whereCol
 * @param {any} whereVal
 * @returns {{ sql: string, values: any[] }}
 */
function buildUpdate(table, data, whereCol, whereVal) {
  assertIdentifier(table, 'table')
  assertIdentifier(whereCol, 'column')
  const keys = assertData(data)
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${whereCol} = ?`
  return { sql, values: [...keys.map((k) => data[k]), whereVal] }
}

/**
 * sql.js cannot bind `undefined` at all. Missing values are normalised to NULL
 * so a caller forgetting an optional field cannot turn a validation error into
 * a 500.
 * @param {any[]} params
 * @returns {any[]}
 */
function normalizeParams(params) {
  if (!Array.isArray(params)) return []
  return params.map((value) => (value === undefined ? null : value))
}

module.exports = { buildInsert, buildUpdate, assertIdentifier, normalizeParams }
