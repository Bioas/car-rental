let appPromise = null

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const mod = await import('../server/index.js')
      const { initDB } = await import('../server/db.js')
      await initDB()
      console.log('DB initialized on Vercel')
      return mod.default
    })()
  }
  return appPromise
}

module.exports = async (req, res) => {
  const app = await getApp()
  app(req, res)
}
