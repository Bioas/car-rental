// Local MongoDB for `npm run dev:all` — data is kept on disk in `.mongo-data/`
// so it survives restarts.
//
// Nothing to do (exits 0) when MONGODB_URI points somewhere other than this
// machine (e.g. Atlas), or when something is already listening on the port.
// Otherwise it runs a `mongod` binary found in, in order: $MONGOD_PATH, a
// MongoDB Community install, the mongodb-memory-server download cache, PATH.

const fs = require('fs')
const net = require('net')
const os = require('os')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const { loadEnv } = require('../api/lib/load-env.cjs')

loadEnv()

const ROOT = path.join(__dirname, '..')
const DATA_DIR = path.join(ROOT, '.mongo-data')
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'

function log(msg) {
  console.log(`[db] ${msg}`)
}

function localPort(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'mongodb:') return null
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return null
  return Number(url.port) || 27017
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
  })
}

// `mongod`, `mongod.exe`, or a versioned download like `mongod-x64-win32-8.2.6.exe`
// — but not the `.md5` checksum files stored next to them.
function isMongodBinary(name) {
  if (!/^mongod(-|\.|$)/i.test(name)) return false
  return process.platform === 'win32' ? /\.exe$/i.test(name) : !/\.(md5|lock|log)$/i.test(name)
}

// Newest-looking mongod binary in a directory tree (shallow: dir + one level).
function findIn(dir) {
  if (!fs.existsSync(dir)) return null
  const hits = []
  const visit = (d, depth) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory() && depth < 2) visit(full, depth + 1)
      else if (entry.isFile() && isMongodBinary(entry.name)) hits.push(full)
    }
  }
  visit(dir, 0)
  return hits.sort().reverse()[0] || null
}

function findMongod() {
  if (process.env.MONGOD_PATH) return process.env.MONGOD_PATH
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'MongoDB', 'Server'),
    path.join(ROOT, 'node_modules', '.cache', 'mongodb-memory-server'),
    path.join(ROOT, '..', '.mongo-mem', 'node_modules', '.cache', 'mongodb-memory-server'),
    path.join(os.homedir(), '.cache', 'mongodb-binaries'),
  ]
  for (const dir of candidates) {
    const found = findIn(dir)
    if (found) return found
  }
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['mongod'], { encoding: 'utf8' })
  return which.status === 0 ? which.stdout.split(/\r?\n/)[0].trim() : null
}

async function main() {
  const port = localPort(uri)
  if (!port) {
    log('MONGODB_URI is not a local server — not starting MongoDB.')
    return
  }
  if (await portInUse(port)) {
    log(`something is already listening on port ${port} — using it.`)
    return
  }

  const mongod = findMongod()
  if (!mongod) {
    console.error('[db] mongod not found. Install MongoDB Community Server, set MONGOD_PATH, or point MONGODB_URI at Atlas.')
    process.exit(1)
  }

  fs.mkdirSync(DATA_DIR, { recursive: true })
  log(`starting ${path.basename(mongod)} on 127.0.0.1:${port} (data: .mongo-data/)`)
  const child = spawn(mongod, ['--dbpath', DATA_DIR, '--port', String(port), '--bind_ip', '127.0.0.1', '--quiet'], {
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  child.on('exit', (code) => {
    log(`mongod exited (${code})`)
    process.exit(code || 0)
  })
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill())
  }
}

main()
