module.exports = async (req, res) => {
  const mod = await import('../server/index.js')
  mod.default(req, res)
}
