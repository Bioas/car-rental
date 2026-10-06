import React from 'react'

/**
 * Pagination control shared by the admin list pages.
 * Renders nothing when everything fits on a single page.
 */
export function Pager({ page = 1, pages = 1, total = 0, limit = 20, onChange }) {
  if (!total || pages <= 1) return null

  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  // Show a window of up to five page numbers around the current page.
  const start = Math.max(1, Math.min(page - 2, Math.max(pages - 4, 1)))
  const end = Math.min(pages, start + 4)
  const numbers = []
  for (let p = start; p <= end; p++) numbers.push(p)

  const base = 'inline-flex items-center justify-center min-w-9 h-9 px-2 rounded-xl text-sm font-medium transition-all'
  const idle = `${base} text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-600`
  const active = `${base} text-white bg-brand-600 border border-brand-600 shadow-sm shadow-brand-500/20`
  const disabled = `${base} text-gray-300 dark:text-gray-600 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 cursor-not-allowed`

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
        แสดง {from}–{to} จาก {total} รายการ
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          aria-label="หน้าก่อนหน้า"
          className={page <= 1 ? disabled : idle}
        >
          <i className="bx bx-chevron-left text-lg"></i>
        </button>

        {start > 1 && (
          <>
            <button type="button" onClick={() => onChange(1)} className={idle}>1</button>
            {start > 2 && <span className="px-1 text-gray-400">…</span>}
          </>
        )}

        {numbers.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={p === page ? active : idle}
          >
            {p}
          </button>
        ))}

        {end < pages && (
          <>
            {end < pages - 1 && <span className="px-1 text-gray-400">…</span>}
            <button type="button" onClick={() => onChange(pages)} className={idle}>{pages}</button>
          </>
        )}

        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= pages}
          aria-label="หน้าถัดไป"
          className={page >= pages ? disabled : idle}
        >
          <i className="bx bx-chevron-right text-lg"></i>
        </button>
      </div>
    </div>
  )
}
