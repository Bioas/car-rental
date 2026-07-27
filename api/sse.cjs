// SSE (Server-Sent Events) client manager
// Maintains a set of connected admin/user clients and provides broadcast helpers.

const clients = new Set()

/**
 * Register a new SSE client connection.
 * @param {object} res - Express response object (kept open)
 * @param {number} userId
 * @param {string} role - 'admin' or 'user'
 */
function addClient(res, userId, role) {
  const client = { res, userId, role }
  clients.add(client)

  // Clean up on disconnect
  res.on('close', () => {
    clients.delete(client)
  })
}

/**
 * Send event to all connected clients with the given role.
 * @param {string} role - 'admin' or 'user'
 * @param {string} event - event name (e.g. 'data-changed')
 * @param {object} data - payload
 */
function broadcastToRole(role, event, data = {}) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  clients.forEach(c => {
    if (c.role === role) {
      try { c.res.write(msg) } catch {}
    }
  })
}

/**
 * Send event to a specific user.
 * @param {number} userId
 * @param {string} event
 * @param {object} data
 */
function broadcastToUser(userId, event, data = {}) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  clients.forEach(c => {
    if (c.userId === userId) {
      try { c.res.write(msg) } catch {}
    }
  })
}

module.exports = { addClient, broadcastToRole, broadcastToUser }
