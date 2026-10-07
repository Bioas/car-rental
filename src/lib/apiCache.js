// In-memory cache for GET requests with a short TTL.
//
// Every admin page used to re-download its data on every mount, so switching
// between tabs always cost a full round trip to the database. Entries here are
// only reused inside the TTL window; anything older is refetched normally, and
// mutations call `invalidateApi()` so no screen can show data that a write has
// already changed.

const DEFAULT_TTL = 15000

const entries = new Map()
const inflight = new Map()

/**
 * Fetch JSON with caching.
 * @param {string} url
 * @param {{headers?: object, ttl?: number, force?: boolean}} [options]
 *   `force: true` skips the cache but still stores the fresh response — used
 *   when a realtime event tells us the data changed.
 * @returns {Promise<{ok: boolean, status: number, data: any}>}
 */
export function apiGet(url, { headers, ttl = DEFAULT_TTL, force = false } = {}) {
  if (!force) {
    const hit = entries.get(url)
    if (hit && Date.now() - hit.at < ttl) {
      return Promise.resolve({ ok: true, status: 200, data: hit.data })
    }
    const pending = inflight.get(url)
    if (pending) return pending
  }

  const request = fetch(url, { headers })
    .then(async (res) => {
      let data = null
      const type = res.headers.get('content-type') || ''
      if (type.includes('application/json')) {
        data = await res.json()
      }
      if (res.ok) entries.set(url, { data, at: Date.now() })
      return { ok: res.ok, status: res.status, data }
    })
    .finally(() => {
      if (inflight.get(url) === request) inflight.delete(url)
    })

  inflight.set(url, request)
  return request
}

/** Drop cached responses — every entry, or only those whose URL starts with `prefix`. */
export function invalidateApi(prefix = '') {
  if (!prefix) {
    entries.clear()
    return
  }
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) entries.delete(key)
  }
}
