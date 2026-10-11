// Client-side CSV download for the report tables. UTF-8 with a BOM so Excel
// shows Thai text correctly; same quoting rules as api/lib/reports.cjs.

export function toCsv(rows) {
  if (!rows.length) return '﻿'
  const headers = Object.keys(rows[0])
  const cell = (v) => {
    const s = String(v ?? '')
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [headers.map(cell).join(','), ...rows.map((r) => headers.map((h) => cell(r[h])).join(','))].join('\r\n')
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadCsv(rows, filename) {
  downloadBlob(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }), filename)
}
