import React from 'react'

const THAI_SHORT = [
  '', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]
const DAYS_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

function isSameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// Pre-compute `twoEndpoint` vs `single-endpoint` flags plus min/max timestamps
// for both range and preview. Caller passes these to each cell for O(1)
// comparison vs the costly repeated Date comparisons. Single-endpoint
// variant renders as a solid brand-600 rounded cell (matching the OLD
// DateRangeBar `isSel` style); two-endpoint variant renders as a pill
// with brand-600 inner endpoints (rounded-l/r-lg on outer) and brand-100
// bg bridge. Same shape for preview but with brand-50 + brand-700 text.
function buildCellPrereqs(rangeStart, rangeEnd, previewStart, previewEnd) {
  const twoEndpointRange = rangeStart && rangeEnd && !isSameDay(rangeStart, rangeEnd)
  const singleRange = (rangeStart || rangeEnd) && !twoEndpointRange
  const twoEndpointPreview = previewStart && previewEnd && !isSameDay(previewStart, previewEnd)
  const singlePreview = (previewStart || previewEnd) && !twoEndpointPreview
  const rLow = twoEndpointRange ? Math.min(rangeStart.getTime(), rangeEnd.getTime()) : null
  const rHigh = twoEndpointRange ? Math.max(rangeStart.getTime(), rangeEnd.getTime()) : null
  const pLow = twoEndpointPreview ? Math.min(previewStart.getTime(), previewEnd.getTime()) : null
  const pHigh = twoEndpointPreview ? Math.max(previewStart.getTime(), previewEnd.getTime()) : null
  return { twoEndpointRange, singleRange, twoEndpointPreview, singlePreview, rLow, rHigh, pLow, pHigh }
}

// === CALENDAR MONTH (SINGLE-MONTH GRID) ===
// ONE calendar implementation: RangeDatePicker.jsx mobile mode stacks
// 36 of these vertically, and <CalendarDropdown> default export composes
// two side-by-side. All callers share the same cell-state pill logic so
// the visual is unified across surfaces.
//
// Props:
//   year/year of the LEFT month; month is 0-indexed
//   activeMin — minimum selectable Date (cells before this are disabled)
//   today — Date for today indicator
//   selectedDate — single brand-600 cell highlight (explicit override)
//   rangeStart/End — TWO endpoints → pill; ONE endpoint → single brand-600 cell
//   previewStart/End — TWO endpoints → preview pill (brand-50, brand-700
//     text, rounded-l/r-lg); ONE endpoint → brand-50 single rounded cell
//   sparse — when true (mobile), drops `c.isOtherMonth` bleed cells from
//     the layout (replaced with empty grid placeholders so the calendar
//     frame retains its shape but the bleed days aren't visible)
//
// Year rollover: callers may pass month=12 (December of next year instead
// of January — Date math wraps). This module normalizes via modulo so the
// title + day math stay correct.
export function CalendarMonth({
  year,
  month,
  activeMin,
  today,
  selectedDate = null,
  rangeStart = null,
  rangeEnd = null,
  previewStart = null,
  previewEnd = null,
  sparse = false,
  onPickDate,
  onCellMouseDown,
  onCellMouseEnter,
  onCellMouseLeave,
}) {
  // Year-rollover normalization: caller may pass month=12 (e.g. November
  // → next January) or negative; modulo + floor guard.
  const nm = ((month % 12) + 12) % 12
  const ny = year + Math.floor(month / 12)
  const dim = new Date(ny, nm + 1, 0).getDate()
  const firstDay = new Date(ny, nm, 1).getDay()
  const prevDim = new Date(ny, nm, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) {
    cells.push({ row: 1, col: i + 1, d: prevDim - firstDay + 1 + i, isOtherMonth: true })
  }
  let cellIdx = firstDay
  for (let i = 1; i <= dim; i++) {
    const row = Math.floor(cellIdx / 7) + 1
    const col = (cellIdx % 7) + 1
    cells.push({ row, col, d: i, isOtherMonth: false })
    cellIdx++
  }
  while (cellIdx % 7 !== 0) {
    const row = Math.floor(cellIdx / 7) + 1
    const col = (cellIdx % 7) + 1
    cells.push({ row, col, d: cellIdx - dim - firstDay + 1, isOtherMonth: true })
    cellIdx++
  }
  const totalRows = Math.ceil(cellIdx / 7)

  const { twoEndpointRange, singleRange, twoEndpointPreview, singlePreview, rLow, rHigh, pLow, pHigh } =
    buildCellPrereqs(rangeStart, rangeEnd, previewStart, previewEnd)

  return (
    <div className="flex-1 min-w-0">
      <div className="text-center font-semibold text-sm text-neutral-800 dark:text-gray-100 mb-3">
        {THAI_SHORT[nm + 1]} {ny + 543}
      </div>
      <div className="grid grid-cols-7 mb-1.5">
        {DAYS_TH.map((d, i) => (
          <div key={d} className={`flex items-center justify-center h-7 text-[11px] font-medium ${
            i === 0 ? 'text-rose-400 dark:text-rose-300'
            : i === 6 ? 'text-indigo-400 dark:text-indigo-300'
            : 'text-gray-400 dark:text-gray-500'
          }`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7" style={{ gridTemplateRows: `repeat(${totalRows}, minmax(2.5rem, auto))` }}>
        {cells.map((c, i) => {
          // Sparse mode drops bleed days but keeps the grid slot so the
          // calendar frame retains its shape (no layout jitter).
          if (sparse && c.isOtherMonth) {
            return <div key={`${ny}-${nm}-${i}`} style={{ gridColumn: c.col, gridRow: c.row }} className="w-full h-10" />
          }
          // Adjacent-month overflow cells live in the bleed month, NOT
          // the viewing month. Build the date from the correct
          // (ny, nm, ±1) pair so comparisons and disabled checks are
          // accurate AND respect the normalized ny/nm.
          const cellDate = c.isOtherMonth
            ? (i < firstDay ? new Date(ny, nm - 1, c.d) : new Date(ny, nm + 1, c.d))
            : new Date(ny, nm, c.d)
          const cellMs = cellDate.getTime()
          const disabled = !c.isOtherMonth && activeMin && cellDate < activeMin
          const todayHit = !c.isOtherMonth && today && isSameDay(cellDate, today)
          const dow = c.col - 1
          // State flags
          const isSel = selectedDate && isSameDay(cellDate, selectedDate)
          const isRStart = rangeStart && isSameDay(cellDate, rangeStart)
          const isREnd = rangeEnd && isSameDay(cellDate, rangeEnd)
          const inRange = twoEndpointRange && cellMs > rLow && cellMs < rHigh
          const isPStart = previewStart && isSameDay(cellDate, previewStart)
          const isPEnd = previewEnd && isSameDay(cellDate, previewEnd)
          const inPreview = twoEndpointPreview && cellMs >= pLow && cellMs <= pHigh

          // Cell-class assembly — priority order (top wins):
          //   1. selectedDate (explicit brand-600 single)
          //   2. two-endpoint range endpoints (brand-100 pill + brand-600 inner)
          //   3. ONE-endpoint range (single brand-600 rounded cell)
          //   4. range middle cells (brand-100 bg)
          //   5. two-endpoint preview endpoints (brand-50 pill + brand-700 text)
          //   6. ONE-endpoint preview (single brand-50 rounded cell)
          //   7. preview middle cells (plain brand-50 bg)
          //   8. today bold
          //   9. dow color
          let classes = 'relative flex items-center justify-center w-full h-10 text-sm transition-colors '
          let innerSpan = null

          if (c.isOtherMonth) {
            classes += 'text-neutral-300 dark:text-neutral-600 cursor-default'
          } else if (disabled) {
            classes += 'text-neutral-200 dark:text-gray-600 cursor-not-allowed hover:bg-transparent'
          } else if (isSel) {
            classes += 'bg-brand-600 text-white font-semibold hover:bg-brand-700 z-10 rounded-lg'
          } else if (isRStart && twoEndpointRange) {
            classes += 'bg-brand-100 dark:bg-brand-900/30 rounded-l-lg z-10'
            innerSpan = { className: 'w-full h-full flex items-center justify-center bg-brand-600 text-white font-semibold rounded-l-lg' }
          } else if (isREnd && twoEndpointRange) {
            classes += 'bg-brand-100 dark:bg-brand-900/30 rounded-r-lg z-10'
            innerSpan = { className: 'w-full h-full flex items-center justify-center bg-brand-600 text-white font-semibold rounded-r-lg' }
          } else if (singleRange && (isRStart || isREnd)) {
            // Only ONE endpoint set: brand-600 rounded cell.
            classes += 'bg-brand-600 text-white font-semibold z-10 rounded-lg'
          } else if (inRange) {
            classes += 'bg-brand-100 dark:bg-brand-900/30 text-neutral-700 dark:text-gray-300'
          } else if (isPStart && twoEndpointPreview) {
            // Preview START cell uses solid bg-brand-200 (vs
            // bg-brand-50 middle) to mark the dragStart anchor — the
            // user's earlier explicit preference was a solid tone
            // here, not a washed-out opacity variant. The pill
            // connection to the right cell happens via in-preview
            // cells' bg-brand-50, so the eye sees: stronger tone on
            // the grab spot fading across the span to the drop endpoint.
            classes += 'bg-brand-200 dark:bg-brand-900/40 rounded-l-lg'
            innerSpan = { className: 'w-full h-full flex items-center justify-center text-brand-700 dark:text-brand-300 font-semibold rounded-l-lg' }
          } else if (isPEnd && twoEndpointPreview) {
            classes += 'bg-brand-50 dark:bg-brand-950/40 rounded-r-lg'
            innerSpan = { className: 'w-full h-full flex items-center justify-center text-brand-700 dark:text-brand-300 rounded-r-lg' }
          } else if (singlePreview && (isPStart || isPEnd)) {
            classes += 'bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 rounded-lg'
          } else if (inPreview) {
            classes += 'bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
          } else if (todayHit) {
            classes += dow === 0 ? 'text-rose-400 dark:text-rose-300'
              : dow === 6 ? 'text-indigo-400 dark:text-indigo-300'
              : 'font-semibold text-brand-600 dark:text-brand-400'
          } else {
            classes += dow === 0 ? 'text-rose-400 dark:text-rose-300'
              : dow === 6 ? 'text-indigo-400 dark:text-indigo-300'
              : 'text-neutral-700 dark:text-gray-300'
          }
          // Hover-only on cells with no existing background tint or pill.
          if (!c.isOtherMonth && !disabled && !isSel &&
              !(isRStart && twoEndpointRange) && !(isREnd && twoEndpointRange) && !(singleRange && (isRStart || isREnd)) && !inRange &&
              !(isPStart && twoEndpointPreview) && !(isPEnd && twoEndpointPreview) && !(singlePreview && (isPStart || isPEnd)) && !inPreview &&
              !todayHit) {
            classes += ' hover:bg-brand-50 dark:hover:bg-brand-950/40'
          }

          return (
            <button key={`${ny}-${nm}-${i}`} type="button"
              disabled={disabled || c.isOtherMonth}
              onClick={() => { if (!c.isOtherMonth && onPickDate) onPickDate(cellDate) }}
              onMouseDown={onCellMouseDown ? (e) => { if (!c.isOtherMonth) onCellMouseDown(cellDate, e) } : undefined}
              onMouseEnter={onCellMouseEnter ? () => { if (!c.isOtherMonth) onCellMouseEnter(cellDate) } : undefined}
              onMouseLeave={onCellMouseLeave}
              style={{ gridColumn: c.col, gridRow: c.row }}
              className={classes}>
              {innerSpan ? <span className={innerSpan.className}>{c.d}</span> : c.d}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// === CALENDAR DROPDOWN (TWO-MONTH SIDE-BY-SIDE PANEL) ===
// Default export — composes two <CalendarMonth> side-by-side, with
// chevron navigation header and optional drag-hint text below. Used by:
//   - DateRangeBar.jsx modal (admin + public booking popups)
//   - PublicBooking.jsx RangeDatePicker desktop mode (vehicle-tab)
export default function CalendarDropdown({
  year,
  month,
  headerLabel = '',
  activeMin,
  today,
  selectedDate,
  rangeStart,
  rangeEnd,
  previewStart,
  previewEnd,
  showDragHint = false,
  onPrev,
  onNext,
  onPickDate,
  onCellMouseDown,
  onCellMouseEnter,
  onCellMouseLeave,
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button type="button" onClick={onPrev}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-gray-700 text-neutral-500 dark:text-gray-400 transition-colors">
          <i className="bx bx-chevron-left text-base"></i>
        </button>
        {/* key={headerLabel} keeps the animation class re-firing on
            every step flip (e.g. `เลือกวันเริ่มต้น` → `เลือกวันคืนรถ`).
            The `motion-safe:` prefix respects OS prefers-reduced-motion. */}
        <div key={headerLabel} className="motion-safe:animate-fade-in text-sm font-medium text-neutral-700 dark:text-gray-200 min-w-0 px-1">
          {headerLabel}
        </div>
        <button type="button" onClick={onNext}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-gray-700 text-neutral-500 dark:text-gray-400 transition-colors">
          <i className="bx bx-chevron-right text-base"></i>
        </button>
      </div>
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
        <CalendarMonth year={year} month={month}
          activeMin={activeMin} today={today}
          selectedDate={selectedDate}
          rangeStart={rangeStart} rangeEnd={rangeEnd}
          previewStart={previewStart} previewEnd={previewEnd}
          onPickDate={onPickDate}
          onCellMouseDown={onCellMouseDown}
          onCellMouseEnter={onCellMouseEnter}
          onCellMouseLeave={onCellMouseLeave} />
        <CalendarMonth year={year} month={month + 1}
          activeMin={activeMin} today={today}
          selectedDate={selectedDate}
          rangeStart={rangeStart} rangeEnd={rangeEnd}
          previewStart={previewStart} previewEnd={previewEnd}
          onPickDate={onPickDate}
          onCellMouseDown={onCellMouseDown}
          onCellMouseEnter={onCellMouseEnter}
          onCellMouseLeave={onCellMouseLeave} />
      </div>
      {showDragHint && (
        <div className="hidden sm:block text-center text-[10px] text-neutral-400 dark:text-gray-500 mt-3 italic">
          <i className="bx bx-cursor text-xs align-[-1px]"></i> ลากเมาส์เลือกช่วง หรือคลิกทีละวัน
        </div>
      )}
    </div>
  )
}
