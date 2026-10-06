// Opt-in pagination.
//
// List endpoints return everything when no `page`/`limit` is supplied, so older
// callers (the dashboard, which needs every booking to compute its counters)
// keep working unchanged. Passing `page` or `limit` switches to a paged
// response: { items, total, page, limit, pages }.

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

/**
 * @param {object} query express `req.query`
 * @param {{defaultLimit?: number, maxLimit?: number}} [options]
 * @returns {{limit: number, page: number, offset: number} | null} null = no paging
 */
function pageParams(query, options = {}) {
  const defaultLimit = options.defaultLimit || DEFAULT_LIMIT
  const maxLimit = options.maxLimit || MAX_LIMIT

  const requested = query && (query.page !== undefined || query.limit !== undefined)
  if (!requested) return null

  const parsedLimit = parseInt(query.limit, 10)
  const parsedPage = parseInt(query.page, 10)

  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : defaultLimit, 1), maxLimit)
  const page = Math.max(Number.isFinite(parsedPage) ? parsedPage : 1, 1)

  return { limit, page, offset: (page - 1) * limit }
}

/**
 * Shape a page of rows plus a total count into a stable response payload.
 * @param {any[]} items
 * @param {number} total
 * @param {{limit: number, page: number}} paging
 */
function pagePayload(items, total, paging) {
  return {
    items,
    total,
    page: paging.page,
    limit: paging.limit,
    pages: Math.max(Math.ceil(total / paging.limit), 1),
  }
}

module.exports = { pageParams, pagePayload, DEFAULT_LIMIT, MAX_LIMIT }
