// Small helpers so a transaction body can abort with a specific HTTP status.
//
// Inside `db.transaction(fn)` a plain `return res.status(409).json(...)` would
// leave the transaction open (and eventually roll it back), so the code throws
// instead and the surrounding catch turns it back into a response.

/**
 * @param {number} status HTTP status code
 * @param {string} message message shown to the client
 * @returns {Error & {status: number}}
 */
function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

/**
 * Send a consistent error response. Unexpected (5xx) errors are logged with the
 * stack; client errors are not, to keep the log readable.
 */
function sendError(res, err) {
  const raw = err && err.status
  const status = raw >= 400 && raw < 600 ? raw : 500
  if (status >= 500) console.error('[api]', err)
  res.status(status).json({ error: (err && err.message) || 'Internal Server Error' })
}

module.exports = { httpError, sendError }
