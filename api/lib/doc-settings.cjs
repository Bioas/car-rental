// Admin-editable document settings, stored as one `settings` document
// (`_id: 'document'`) next to the per-stage signer assignments.
//
//  - Agency header printed on the loan-request PDF (api/lib/pdf.cjs).
//  - Document-number format: prefix/suffix around the running number, plus
//    the agency reference ("ที่ …") line. The formatted label is frozen onto
//    each booking when it is created (`doc_label`), so changing the format
//    never rewrites numbers already issued.
//  - Display titles of the five signing stages (api/lib/signing.cjs keeps the
//    keys and order; only the wording is editable).
//  - Loan rules checked when a request is created. 0 means "no limit".
//  - Stages signed on paper instead of in the system (`paper_signers`:
//    stage key → name printed on the PDF; blank = the assigned signer's name).
//    See api/lib/signing.cjs and api/lib/paper-signers.cjs.
//  - Name titles (คำนำหน้า) offered by every title dropdown — booking forms
//    and user accounts (`name_prefixes`, see api/lib/names.cjs).
//
// Unset fields fall back to DEFAULTS, so an empty settings collection behaves
// exactly like the original hard-coded form.

const { collections, findOne, updateOne } = require('../db.cjs')
const { SIGN_STAGES, STAGE_KEYS } = require('./signing.cjs')
const { today } = require('./dates.cjs')

const SETTINGS_ID = 'document'

const DEFAULTS = {
  org_name: 'วิทยาลัยเทคนิคบุรีรัมย์',
  org_phone: '0 4461 1079',
  form_title: 'แบบขออนุญาตใช้รถวิทยาลัยเทคนิคบุรีรัมย์',
  subject: 'ขออนุญาตใช้รถยนต์ของทางราชการ',
  addressee: 'ผู้อำนวยการวิทยาลัยเทคนิคบุรีรัมย์',
  ref_no: '',
  doc_prefix: '',
  doc_suffix: '',
  min_notice_days: 0,
  max_advance_days: 0,
  max_duration_days: 0,
  name_prefixes: ['นาย', 'นาง', 'นางสาว', 'ว่าที่ร้อยตรี'],
}
const MAX_PREFIXES = 30
const MAX_PREFIX_LENGTH = 30

const TEXT_FIELDS = ['org_name', 'org_phone', 'form_title', 'subject', 'addressee', 'ref_no', 'doc_prefix', 'doc_suffix']
// Fields that may be blank; the rest fall back to their default when cleared.
const OPTIONAL_TEXT = new Set(['ref_no', 'doc_prefix', 'doc_suffix'])
const DAY_FIELDS = ['min_notice_days', 'max_advance_days', 'max_duration_days']
const MAX_TEXT = 200
const MAX_DAYS = 3650

const DEFAULT_STAGE_TITLES = Object.fromEntries(SIGN_STAGES.map((s) => [s.key, s.title]))

/** Current settings with defaults filled in, including every stage title. */
async function getDocSettings() {
  const stored = (await findOne(collections.settings, { _id: SETTINGS_ID })) || {}
  const settings = { ...DEFAULTS }
  for (const key of [...TEXT_FIELDS, ...DAY_FIELDS]) {
    if (stored[key] !== undefined && stored[key] !== null) settings[key] = stored[key]
  }
  settings.stage_titles = { ...DEFAULT_STAGE_TITLES, ...(stored.stage_titles || {}) }
  settings.name_prefixes = Array.isArray(stored.name_prefixes) && stored.name_prefixes.length
    ? stored.name_prefixes
    : [...DEFAULTS.name_prefixes]
  settings.paper_signers = Object.fromEntries(
    Object.entries(stored.paper_signers || {}).filter(([key]) => STAGE_KEYS.includes(key)),
  )
  return settings
}

/**
 * Validate a partial update. Returns `{ set }` (Mongo $set paths) or `{ error }`.
 * Unknown keys are ignored.
 */
function parseUpdate(body) {
  const set = {}
  for (const key of TEXT_FIELDS) {
    if (body[key] === undefined) continue
    const value = String(body[key] ?? '').trim()
    if (value.length > MAX_TEXT) return { error: `ข้อความยาวเกิน ${MAX_TEXT} ตัวอักษร` }
    if (!value && !OPTIONAL_TEXT.has(key)) {
      set[key] = DEFAULTS[key]
    } else {
      set[key] = value
    }
  }
  for (const key of DAY_FIELDS) {
    if (body[key] === undefined) continue
    const value = Number(body[key])
    if (!Number.isInteger(value) || value < 0 || value > MAX_DAYS) {
      return { error: `จำนวนวันต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง ${MAX_DAYS}` }
    }
    set[key] = value
  }
  if (body.stage_titles !== undefined) {
    if (!body.stage_titles || typeof body.stage_titles !== 'object') return { error: 'ชื่อตำแหน่งไม่ถูกต้อง' }
    for (const [key, raw] of Object.entries(body.stage_titles)) {
      if (!STAGE_KEYS.includes(key)) return { error: 'ขั้นตอนการเซ็นเอกสารไม่ถูกต้อง' }
      const value = String(raw ?? '').trim()
      if (value.length > MAX_TEXT) return { error: `ชื่อตำแหน่งยาวเกิน ${MAX_TEXT} ตัวอักษร` }
      set[`stage_titles.${key}`] = value || DEFAULT_STAGE_TITLES[key]
    }
  }
  if (body.name_prefixes !== undefined) {
    if (!Array.isArray(body.name_prefixes)) return { error: 'รายการคำนำหน้าไม่ถูกต้อง' }
    const list = []
    for (const raw of body.name_prefixes) {
      const value = String(raw ?? '').trim().replace(/\s+/g, ' ')
      if (!value) continue
      if (value.length > MAX_PREFIX_LENGTH) return { error: `คำนำหน้ายาวเกิน ${MAX_PREFIX_LENGTH} ตัวอักษร` }
      if (!list.includes(value)) list.push(value)
    }
    if (!list.length) return { error: 'ต้องมีคำนำหน้าอย่างน้อย 1 รายการ' }
    if (list.length > MAX_PREFIXES) return { error: `คำนำหน้าได้ไม่เกิน ${MAX_PREFIXES} รายการ` }
    set.name_prefixes = list
  }
  if (body.paper_signers !== undefined) {
    const raw = body.paper_signers
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'การตั้งค่าการเซ็นบนกระดาษไม่ถูกต้อง' }
    const clean = {}
    for (const [key, name] of Object.entries(raw)) {
      if (!STAGE_KEYS.includes(key)) return { error: 'ขั้นตอนการเซ็นเอกสารไม่ถูกต้อง' }
      const value = String(name ?? '').trim()
      if (value.length > MAX_TEXT) return { error: `ชื่อยาวเกิน ${MAX_TEXT} ตัวอักษร` }
      clean[key] = value
    }
    // Someone has to approve in the system, or every request would be
    // approved the moment it is submitted.
    if (Object.keys(clean).length >= STAGE_KEYS.length) {
      return { error: 'ต้องมีอย่างน้อย 1 ขั้นที่เซ็นในระบบ' }
    }
    set.paper_signers = clean
  }
  return { set }
}

async function updateDocSettings(set) {
  if (Object.keys(set).length) {
    await updateOne(collections.settings, { _id: SETTINGS_ID }, { $set: set }, { upsert: true })
  }
  return getDocSettings()
}

/** The printed document number, e.g. prefix "ศธ/" + 12 + suffix "/2569". */
function formatDocLabel(number, settings) {
  return `${settings.doc_prefix || ''}${number}${settings.doc_suffix || ''}`
}

function dayDiff(from, to) {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  return Math.round((b - a) / 86400000)
}

/**
 * Check a request's dates against the configured loan rules. Returns an error
 * message, or null when allowed. Dates are already-validated YYYY-MM-DD.
 */
function checkBookingRules(startDate, endDate, settings) {
  const lead = dayDiff(today(), startDate)
  if (settings.min_notice_days > 0 && lead < settings.min_notice_days) {
    return `ต้องส่งคำขอล่วงหน้าอย่างน้อย ${settings.min_notice_days} วันก่อนวันใช้รถ`
  }
  if (settings.max_advance_days > 0 && lead > settings.max_advance_days) {
    return `จองล่วงหน้าได้ไม่เกิน ${settings.max_advance_days} วัน`
  }
  const days = dayDiff(startDate, endDate) + 1
  if (settings.max_duration_days > 0 && days > settings.max_duration_days) {
    return `ยืมรถได้ครั้งละไม่เกิน ${settings.max_duration_days} วัน`
  }
  return null
}

module.exports = {
  DEFAULTS, DEFAULT_STAGE_TITLES,
  getDocSettings, parseUpdate, updateDocSettings, formatDocLabel, checkBookingRules,
}
