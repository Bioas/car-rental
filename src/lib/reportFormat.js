// Outcome buckets and month labels shared by the report charts, the reports
// page and the dashboard (buckets mirror api/lib/reports.cjs outcomeOf).

export const OUTCOMES = [
  { key: 'approved', label: 'อนุมัติแล้ว', color: '#10b981' },
  { key: 'returned', label: 'คืนแล้ว', color: '#3b82f6' },
  { key: 'in_progress', label: 'รอดำเนินการ', color: '#f59e0b' },
  { key: 'rejected', label: 'ปฏิเสธ', color: '#ef4444' },
]

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number)
  return `${THAI_MONTHS_SHORT[m - 1]} ${String(y + 543).slice(2)}`
}
