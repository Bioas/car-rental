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

export const PAGE_TITLES = {
  '/': 'แดชบอร์ด',
  '/notifications': 'การแจ้งเตือน',
  '/bookings': 'จัดการคำขอยืม',
  '/cars': 'จัดการรถยนต์',
  '/users': 'จัดการผู้ใช้',
  '/reports': 'รายงานสถิติ',
}

export function statusLabel(s) {
  return STATUS_LABELS[s] || s
}

const BADGE_CLASSES = {
  pending: 'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300',
  approved: 'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300',
  rejected: 'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 dark:bg-red-900/50 dark:text-red-300',
  cancelled: 'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  returned: 'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300',
  booked: 'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300',
  available: 'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300',
  maintenance: 'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300',
  retired: 'inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-gray-50 text-gray-600 dark:bg-gray-900/50 dark:text-gray-300',
}

export function badgeClass(status) {
  return BADGE_CLASSES[status] || BADGE_CLASSES.pending
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
  return new Date().toISOString().split('T')[0]
}
