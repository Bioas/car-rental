export const STATUS_LABELS = {
  pending: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธ',
  cancelled: 'ยกเลิกแล้ว',
  returned: 'คืนแล้ว',
  available: 'พร้อมใช้',
  booked: 'กำลังถูกจอง',
  maintenance: 'ซ่อมบำรุง',
  retired: 'ปลดระวาง',
}

export const STATUS_COLORS = {
  pending: '#f59e0b',
  approved: '#10b981',
  rejected: '#ef4444',
  cancelled: '#6b7280',
  returned: '#3b82f6',
}

export const CAR_TYPES = ['รถเก๋ง', 'รถตู้', 'รถกระบะ', 'รถ SUV', 'รถบรรทุก', 'รถไฟฟ้า', 'อื่น ๆ']

export const ROLE_LABELS = {
  admin: 'ผู้ดูแล',
  driver: 'พนักงานขับรถ',
  staff: 'เจ้าหน้าที่',
}

// The fixed five-stage order the loan document is signed in, after the
// requester's own signature — see api/lib/signing.cjs on the backend. These
// are document stages, not login roles: every signer logs in as 'staff',
// and an admin assigns which staff account handles each stage (Settings
// page, backed by /api/admin/stage-assignments).
export const SIGN_STAGES = [
  { key: 'vehicle_head', title: 'พนักงานขับเครื่องจักรกลขนาดกลาง' },
  { key: 'supply_officer', title: 'เจ้าหน้าที่งานพัสดุ' },
  { key: 'supply_head', title: 'หัวหน้างานพัสดุ' },
  { key: 'deputy_director', title: 'รองผู้อำนวยการฝ่ายบริหารทรัพยากร' },
  { key: 'director', title: 'ผู้อำนวยการวิทยาลัยเทคนิคบุรีรัมย์' },
]

// The first three stages are signed in parallel (no queuing between them);
// the last two stay strictly sequential. Mirrors api/lib/signing.cjs.
export const PARALLEL_STAGE_KEYS = SIGN_STAGES.slice(0, 3).map((s) => s.key)

// Cars are identified by their licence plate first (what staff and the paper
// form go by), with brand/model as the secondary detail.
export function carModel(car) {
  return [car?.brand, car?.model].filter(Boolean).join(' ')
}
/** One-line label: "กข 1234 (Toyota Hiace)". */
export function carLabel(car) {
  const model = carModel(car)
  if (!car?.license_plate) return model
  return model ? `${car.license_plate} (${model})` : car.license_plate
}

// Default name titles for the title dropdowns (PrefixSelect). The live list
// is admin-editable (ตั้งค่า → เอกสาร → คำนำหน้าชื่อ, served as
// `name_prefixes` by the document settings). A stored name already begins
// with its title: "นายสมชาย", "ดร.สมชาย", or — for a title written out in
// full, with a space — "ว่าที่ร้อยตรี บุญฤทธิ์".
export const NAME_PREFIXES = ['นาย', 'นาง', 'นางสาว', 'ว่าที่ร้อยตรี']
const ATTACHED_PREFIXES = ['นาย', 'นาง', 'นางสาว']

/** Whether a title is written straight onto the name (no space). */
export function attachesToName(prefix) {
  return ATTACHED_PREFIXES.includes(prefix) || String(prefix).endsWith('.')
}

/** Title + name as stored. Mirrors joinNamePrefix in api/lib/names.cjs. */
export function joinNamePrefix(prefix, name) {
  const p = String(prefix || '').trim()
  const n = String(name || '').trim()
  if (!p) return n
  return attachesToName(p) ? `${p}${n}` : `${p} ${n}`.trim()
}

/**
 * Split a full name into `{ prefix, name }` for an edit form: the stored
 * prefix when the name starts with it, otherwise any title from `prefixes`
 * (longest first, so นางสาว isn't read as นาง).
 */
export function splitNamePrefix(fullName, storedPrefix = '', prefixes = NAME_PREFIXES) {
  const full = String(fullName || '')
  const candidates = storedPrefix ? [storedPrefix] : [...prefixes].sort((a, b) => b.length - a.length)
  const prefix = candidates.find(p => p && full.startsWith(p)) || ''
  return { prefix, name: full.slice(prefix.length).trimStart() }
}

export function roleLabel(r) {
  return ROLE_LABELS[r] || r
}

export function statusLabel(s) {
  return STATUS_LABELS[s] || s
}

const BADGE_CLASSES = {
  pending: 'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  approved: 'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  rejected: 'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-900/50 dark:text-red-300',
  cancelled: 'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  returned: 'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  booked: 'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  available: 'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  maintenance: 'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  retired: 'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-gray-50 text-gray-600 dark:bg-gray-900/50 dark:text-gray-300',
}

export function badgeClass(status) {
  return BADGE_CLASSES[status] || BADGE_CLASSES.pending
}

// Flat list of the five staff signature stages.
export const SIGN_STAGE_KEYS = SIGN_STAGES.map((s) => s.key)

// Stages this document signs on paper instead of in the system (admin setting,
// frozen on the booking as `paper_signers: { stageKey: printedName }`). They
// are skipped in the system chain; the PDF prints the name for a pen signature.
export function isPaperStage(booking, key) {
  return !!booking?.paper_signers && Object.prototype.hasOwnProperty.call(booking.paper_signers, key)
}

// Whether every staff signer has signed. The admin list and the calendar
// expose this as `remaining_signers`; admin booking objects instead carry the
// raw `signatures` map. A payload with neither (a partial row) is treated as
// signed, so a status is never downgraded just because data was omitted.
export function isFullySigned(booking) {
  if (!booking) return false
  if (typeof booking.remaining_signers === 'number') return booking.remaining_signers === 0
  const signatures = booking.signatures
  if (signatures && typeof signatures === 'object') {
    return SIGN_STAGE_KEYS.every((key) => signatures[key] || isPaperStage(booking, key))
  }
  return true
}

// The printed document number ("เลขที่"), including any prefix/suffix the
// admin configured when it was issued. Older bookings only have doc_number.
export function docLabel(booking) {
  return booking?.doc_label || (booking?.doc_number ? String(booking.doc_number) : '')
}

// The stages that pick who drives while signing — mirrors driverStageKeys in
// api/lib/signing.cjs: the in-system first-three stages, or the first
// in-system stage when all three sign on paper.
export function driverStageKeys(booking) {
  const parallel = PARALLEL_STAGE_KEYS.filter((key) => !isPaperStage(booking, key))
  if (parallel.length) return parallel
  const first = SIGN_STAGE_KEYS.find((key) => !isPaperStage(booking, key))
  return first ? [first] : []
}

// The full chain as the borrower sees it: their own signature (collected on
// the booking form) followed by the five fixed staff stages.
export const CHAIN_STEPS = [{ key: 'requester', title: 'ผู้ยืม (เซ็นตอนส่งคำขอ)' }, ...SIGN_STAGES]

// Where one step of the chain stands: 'signed' | 'rejected' | 'current'
// (waiting on this signer now) | 'waiting' (not their turn yet) | 'skipped'
// (the document ended — e.g. rejected — before reaching it) | 'paper' (signed
// with a pen on the printed form, never in the system). Inside the parallel
// window every unsigned in-system first-three stage is 'current', not queued.
export function chainStepState(booking, key) {
  const entry = booking?.signatures?.[key]
  if (entry) return entry.decision === 'reject' ? 'rejected' : 'signed'
  if (isPaperStage(booking, key)) return 'paper'
  const stage = booking?.approval_stage
  if (!stage || booking.status === 'rejected' || booking.status === 'returned') return 'skipped'
  if (stage === key) return 'current'
  if (PARALLEL_STAGE_KEYS.includes(stage) && PARALLEL_STAGE_KEYS.includes(key)) return 'current'
  return 'waiting'
}

// An admin may approve a request (assigning a driver) before the signature
// chain is complete. What people are *shown* therefore stays 'pending'
// ("รอดำเนินการ") until every signer has signed — only then does an approved
// booking read "อนุมัติแล้ว".
export function effectiveStatus(booking) {
  if (booking?.status === 'approved' && !isFullySigned(booking)) return 'pending'
  return booking?.status
}

// The label + colour pair for a booking's status, shared by the admin list and
// the document popup: an approved-but-unsigned request reads "รอดำเนินการ".
export function signStatus(booking) {
  const status = effectiveStatus(booking)
  if (booking?.status === 'approved' && status === 'pending') {
    return { label: 'รอดำเนินการ', className: badgeClass('pending') }
  }
  return { label: statusLabel(status), className: badgeClass(status) }
}

export function timeAgo(dateStr) {
  const now = new Date()
  const date = new Date(dateStr)
  const diff = Math.floor((now - date) / 1000)
  if (diff < 60) return 'เมื่อสักครู่'
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`
  return `${Math.floor(diff / 86400)} วันที่แล้ว`
}

export function todayStr() {
  // Local calendar date as YYYY-MM-DD. Using toISOString() returns the UTC date,
  // which is still "yesterday" in UTC+7 during the early morning.
  return new Date().toLocaleDateString('en-CA')
}

// Formats a YYYY-MM-DD (or full ISO) date as Thai day-month-year (พ.ศ.),
// e.g. "11 ต.ค. 2569". Parses date-only strings manually so they don't shift
// by one day in timezones behind UTC.
export function formatThaiDate(dateStr) {
  if (!dateStr) return '-'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr))
  let d
  if (m) {
    d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  } else {
    d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return String(dateStr)
  }
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Booking times ───
// Bookings run from `start_date start_time` to `end_date end_time` (HH:MM,
// picked by the hour). Bookings made before times existed have none and take
// their days in full — every helper below falls back to dates only for them.
export const BOOKING_HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)
export const DEFAULT_START_TIME = '08:00'
export const DEFAULT_END_TIME = '17:00'

/** "08:00" → "08.00" (Thai clock style; add " น." where it ends a phrase). */
export function formatTime(t) {
  return t ? t.replace(':', '.') : ''
}

/** "08.00–17.00 น." for a booking with times, '' for a whole-day one. */
export function timeRangeLabel(b) {
  if (!b?.start_time || !b?.end_time) return ''
  return `${formatTime(b.start_time)}–${formatTime(b.end_time)} น.`
}

/**
 * Date + time range of a booking:
 *   same day  → "12 ต.ค. 2569 · 08.00–17.00 น."
 *   multi-day → "12 ต.ค. 2569 08.00 น. → 14 ต.ค. 2569 17.00 น."
 *   no times  → "12 ต.ค. 2569 → 14 ต.ค. 2569" (or one date)
 */
export function formatBookingRange(b, fmt = formatThaiDate) {
  if (!b) return '-'
  const timed = b.start_time && b.end_time
  if (b.start_date === b.end_date) {
    return timed ? `${fmt(b.start_date)} · ${timeRangeLabel(b)}` : fmt(b.start_date)
  }
  if (!timed) return `${fmt(b.start_date)} → ${fmt(b.end_date)}`
  return `${fmt(b.start_date)} ${formatTime(b.start_time)} น. → ${fmt(b.end_date)} ${formatTime(b.end_time)} น.`
}
