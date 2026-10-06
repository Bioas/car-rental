// Date helpers.
//
// Booking dates are compared as plain `YYYY-MM-DD` strings, so they sort
// chronologically. `date('now')` used to be evaluated inside SQL: it uses UTC,
// which is still "yesterday" for the first seven hours of a Thai (UTC+7)
// morning, and it made the queries impossible to unit test. Callers now bind
// `today()` as a parameter.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Today in the server's local timezone as `YYYY-MM-DD`.
 *
 * `toISOString()` would return the UTC date, which is still "yesterday" for the
 * first seven hours of a Thai (UTC+7) morning.
 * @returns {string}
 */
function today() {
  return new Date().toLocaleDateString('en-CA')
}

/**
 * True only for real calendar dates in `YYYY-MM-DD` form — `2026-02-30` and
 * `01/12/2026` are both rejected.
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidDate(value) {
  const s = String(value || '')
  if (!DATE_RE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

module.exports = { today, isValidDate, DATE_RE }
