// Minimal `.env` loader — no dependency, ~30 lines.
//
// It must run BEFORE anything that reads configuration at require time —
// `api/middleware/auth.cjs` resolves the JWT secret while it is being loaded —
// which is why the entry points call it as their first statement.
//
// Real environment variables always win over `.env`, so process managers,
// Docker, CI and Vercel behave as expected.

const fs = require('fs')
const path = require('path')

const DEFAULT_FILE = path.join(__dirname, '..', '..', '.env')

/**
 * @param {string} [file] path to the env file
 * @returns {boolean} whether a file was found and read
 */
function loadEnv(file = DEFAULT_FILE) {
  // The test suite points itself at a throwaway database; it must never be
  // redirected to whatever `.env` happens to point at (e.g. production).
  if (process.env.CARRENTAL_NO_ENV_FILE) return false
  if (!fs.existsSync(file)) return false

  const contents = fs.readFileSync(file, 'utf8')

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separator = line.indexOf('=')
    if (separator === -1) continue

    const key = line.slice(0, separator).trim()
    if (!key) continue

    let value = line.slice(separator + 1).trim()
    const quoted = (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    if (quoted && value.length >= 2) value = value.slice(1, -1)

    // A real environment variable always wins over the file.
    if (process.env[key] === undefined) process.env[key] = value
  }

  return true
}

module.exports = { loadEnv }
