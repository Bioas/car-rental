// Name titles (คำนำหน้า) are stored as part of the name, the way Thai forms
// write them: no space after นาย/นาง/นางสาว or an abbreviation ending in "."
// ("นายสมชาย", "ดร.สมชาย", "ร.ต.ต.สมชาย"), one space after a title written out
// in full ("ว่าที่ร้อยตรี บุญฤทธิ์"). The list itself is admin-editable
// (document settings → name_prefixes). Mirrors joinNamePrefix in
// src/lib/constants.js.
const ATTACHED_PREFIXES = ['นาย', 'นาง', 'นางสาว']

function attachesToName(prefix) {
  return ATTACHED_PREFIXES.includes(prefix) || prefix.endsWith('.')
}

function joinNamePrefix(prefix, name) {
  const p = String(prefix || '').trim()
  const n = String(name || '').trim()
  if (!p) return n
  return attachesToName(p) ? `${p}${n}` : `${p} ${n}`.trim()
}

module.exports = { joinNamePrefix }
