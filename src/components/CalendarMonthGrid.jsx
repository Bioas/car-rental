import React, { useEffect, useMemo, useState } from 'react'
import { STATUS_COLORS } from '../lib/constants'

// Same-hue PALER/lighter text colors for the trailing status chip on
// multi-day bars. Each is 3 Tailwind shades LIGHTER than the chip bg
// (which is the 500-level STATUS_COLORS[status]). Pastel 200-level
// versions of each status hue read as "highlight tint" of the chip's own
// color family — opposite of the previous 800-level "deepened hue"
// direction. Per user feedback "ขอลองปรับเป็นตัวอักษรเป็นสีอ่อนแทน" —
// trial exploring the lighter direction; previous iterations used 800
// (same hue, darker) which feels "deeper", 200 reads as "lighter taffy /
// cream highlight". Like the previous version, contrast against 500-level
// bg is intentionally low (the chip text is meant to feel native to the
// chip, not separate from it); the textShadow is flipped from a
// white-halo + dark-drop combo to a pure dark-drop combo because a white
// halo would blend INTO light text (both have white-ish luminance) and
// defeat its purpose. Dark shadow alone now lifts the pale text off the
// bg enough to read at 8–9px bold size.
const STATUS_TEXT_COLORS = {
  pending: '#fde68a', // amber-200   (bg #f59e0b amber-500)
  approved: '#a7f3d0', // emerald-200 (bg #10b981 emerald-500)
  rejected: '#fecaca', // red-200     (bg #ef4444 red-500)
  cancelled: '#e5e7eb', // gray-200    (bg #6b7280 gray-500)
  returned: '#bfdbfe', // blue-200    (bg #3b82f6 blue-500)
}

// Module-level Set dedupes dev warnings about unknown chip statuses. A
// calendar with many rows of misconfigured bookings would otherwise spam
// the console once per render.
const _warnedChipStatuses = new Set()

// Returns the same-hue darker text color for a booking chip. Honors the
// chips STATUS_TEXT_COLORS map; if a future status slipped through, falls
// back to the chip's own bg color so the mismatch renders visibly
// (same-color text on same-color bg = obviously broken) AND logs a one-time
// dev warning with the bookingId / userId so admins can trace the issue
// back to the data layer. Uses `import.meta.env.DEV` (Vite-native, replaced
// at build time) instead of `process.env.NODE_ENV !== 'production'` so
// Vite tree-shakes the warning branch out of production bundles.
function chipTextColor(status, fallback, booking) {
  const mapped = STATUS_TEXT_COLORS[status]
  if (mapped) return mapped
  if (import.meta.env.DEV && !_warnedChipStatuses.has(status)) {
    _warnedChipStatuses.add(status)
    console.warn(
      'CalendarMonthGrid: unknown chip status — text will render in fallback color',
      {
        status,
        bookingId: booking?.id,
        userId: booking?.user_id,
        brand: booking?.brand,
        model: booking?.model,
        start: booking?.start_date,
        end: booking?.end_date,
      }
    )
  }
  return fallback
}

// Monday-first day-of-week headers. The grid below uses Monday-first
// ordering so column 0 = จันทร์ and column 6 = อาทิตย์. The rose color on
// the last cell matches the FC view that previously lived in src/styles.
const THAI_DOW_HEADERS_MON_FIRST = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

function dateStr(d) {
  // YYYY-MM-DD in en-CA format (matches the rest of the app)
  return d.toLocaleDateString('en-CA')
}

function todayMidnight() {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return t
}

function makeDay(d, isOutOfMonth, todayMs, outOfDirection) {
  return {
    date: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
    dateStr: dateStr(d),
    day: d.getDate(),
    isToday: d.getTime() === todayMs,
    isOutOfMonth,
    outOfDirection, // 'prev' | 'next' | undefined (in-month cells have neither)
  }
}

// Build a 6×7 grid for any view month (Monday-first column order).
function getMonthGrid(viewDate, todayMs) {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  // Convert Sun=0..Sat=6 to Mon=0..Sun=6 column index.
  const firstCol = (firstOfMonth.getDay() + 6) % 7
  const cells = []
  for (let i = firstCol; i > 0; i--) {
    const d = new Date(firstOfMonth)
    d.setDate(d.getDate() - i)
    cells.push(makeDay(d, true, todayMs, 'prev'))
  }
  const lastDay = new Date(year, month + 1, 0).getDate()
  for (let i = 1; i <= lastDay; i++) {
    cells.push(makeDay(new Date(year, month, i), false, todayMs))
  }
  // Variable weeks: only render enough rows to fit the month + required
  // prev/next padding. Don't inflate to a fixed 6-row grid when the last row
  // would be entirely padding cells — e.g. July 2026 (Wed start, 31 days)
  // fits in 5 rows, so the trailing Aug 3-9 row would be all-padding noise.
  // Months that actually need 6 rows (e.g. Aug 2026 starting Sat) still
  // render 6. weekCount = ceil((firstCol + lastDay) / 7).
  const weekCount = Math.ceil(cells.length / 7)
  while (cells.length < weekCount * 7) {
    const d = new Date(cells[cells.length - 1].date)
    d.setDate(d.getDate() + 1)
    cells.push(makeDay(d, true, todayMs, 'next'))
  }
  return Array.from({ length: weekCount }, (_, r) => cells.slice(r * 7, r * 7 + 7))
}

export function CalendarMonthGrid({
  viewDate,
  rawBookings,
  bookingBarColor,
  statusLabel,
  onCellClick,
  onBarClick,
}) {
  // Re-evaluate "today" every minute so the highlight stays correct if the
  // page is left open across midnight, without requiring user navigation.
  const [todayMs, setTodayMs] = useState(() => todayMidnight().getTime())
  useEffect(() => {
    const id = setInterval(() => setTodayMs(todayMidnight().getTime()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Track the booking id currently under the cursor so multi-day bookings
  // spanning multiple week rows (e.g. Honda Civic 23–27 July 2569, which
  // crosses Thu→Mon between two rows) light up ALL their segments together
  // — including segments in OTHER rows. Without this state, brightness would
  // be row-scoped only. React 18 batches the leave+enter state changes so
  // moving between adjacent segments of the same booking never flickers.
  const [hoveredBookingId, setHoveredBookingId] = useState(null)

  const weeks = useMemo(() => getMonthGrid(viewDate, todayMs), [viewDate, todayMs])

  // For each week row, compute bars that overlap the week plus their track.
  // Multi-week bookings are rendered as a separate bar per row — clicking any
  // of the segments opens the SAME booking object, since the original `b`
  // reference is preserved with all of its fields (id, dates, car, user…).
  const weekBars = useMemo(() => {
    return weeks.map((week, rowIdx) => {
      const weekStart = new Date(week[0].date)
      weekStart.setHours(0, 0, 0, 0)
      const weekEnd = new Date(week[6].date)
      weekEnd.setHours(23, 59, 59, 999)

      const rawBars = rawBookings
        .filter(b => {
          const s = new Date(b.start_date)
          const e = new Date(b.end_date)
          e.setHours(23, 59, 59, 999)
          return s <= weekEnd && e >= weekStart
        })
        .map(b => {
          const s = new Date(b.start_date)
          const e = new Date(b.end_date)
          let startCol = Math.floor((s - weekStart) / 86400000)
          let endCol = Math.floor((e - weekStart) / 86400000)
          startCol = Math.max(0, Math.min(6, startCol))
          endCol = Math.max(0, Math.min(6, endCol))
          return {
            ...b,
            rowIdx,
            startCol,
            endCol,
            leftPct: (startCol / 7) * 100,
            widthPct: ((endCol - startCol + 1) / 7) * 100,
            track: 0,
            totalTracks: 1,
          }
        })

      // Greedy interval scheduling — same algorithm as the week view.
      if (rawBars.length > 1) {
        const sorted = [...rawBars].sort((a, b) => a.startCol - b.startCol)
        const tracks = []
        for (const bar of sorted) {
          let placed = false
          for (let t = 0; t < tracks.length; t++) {
            if (tracks[t] < bar.startCol) {
              tracks[t] = bar.endCol
              bar.track = t
              placed = true
              break
            }
          }
          if (!placed) {
            tracks.push(bar.endCol)
            bar.track = tracks.length - 1
          }
        }
        for (const bar of rawBars) bar.totalTracks = tracks.length
      }
      return rawBars
    })
  }, [weeks, rawBookings])

  return (
    <div className="cal-month-grid relative flex-1 flex flex-col min-h-[480px] sm:min-h-[560px] month-view-enter">
      {/* Header row (Thai day names, Mon-first) */}
      <div className="grid grid-cols-7 shrink-0 border-b border-neutral-100 dark:border-gray-700" style={{ height: 32 }}>
        {THAI_DOW_HEADERS_MON_FIRST.map((h, i) => (
          <div
            key={h}
            className={`px-1 flex items-center justify-center text-[10px] sm:text-xs font-semibold uppercase tracking-wider transition-colors border-r border-neutral-100/40 dark:border-gray-700/40 last:border-r-0 ${
              i === 6 ? 'text-rose-500 dark:text-rose-300' : 'text-neutral-500 dark:text-gray-400'
            }`}
          >
            {h}
          </div>
        ))}
      </div>

      {/* Variable week rows (5 or 6 depending on month). The grid template
          count comes from weeks.length so months that fit in 5 rows (e.g.
          July 2026) render 5 rows and skip trailing all-padding rows.
          Each row also has a min-h baseline so the calendar remains
          comfortable when the flex chain collapses. */}
      <div className="flex-1 grid min-h-0" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(96px, 1fr))` }}>
        {weeks.map((week, rowIdx) => {
          const bars = weekBars[rowIdx] || []
          return (
            <div
              key={rowIdx}
              className="cal-month-week relative grid grid-cols-7 min-h-[96px] sm:min-h-[120px] border-b border-neutral-100/50 dark:border-gray-700/40 last:border-b-0"
            >
              {/* 7 day cells (background layer) */}
              {week.map((day, colIdx) => (
                <div
                  key={day.dateStr}
                  onClick={() => onCellClick && onCellClick(day.dateStr, null)}
                  className={`cal-month-day relative border-r border-neutral-100/50 dark:border-gray-700/40 last:border-r-0 cursor-pointer transition-colors ${
                    day.isOutOfMonth
                      ? 'opacity-30 hover:bg-transparent pointer-events-none'
                      : 'hover:bg-brand-50/50 dark:hover:bg-brand-950/30'
                  } ${day.isToday ? 'bg-brand-50/60 dark:bg-brand-950/40' : ''}`}
                  aria-label={
                    day.isOutOfMonth
                      ? `${day.day} ${day.outOfDirection === 'prev' ? 'เดือนก่อนหน้า' : 'เดือนถัดไป'}`
                      : undefined
                  }
                >
                  <div className="px-1 pt-1 sm:px-1.5 sm:pt-1.5 text-right">
                    <span
                      className={[
                        'inline-flex items-center justify-center text-[10px] sm:text-xs',
                        day.isToday
                          ? 'h-5 w-5 sm:h-6 sm:w-6 rounded-full bg-brand-600 text-white dark:bg-brand-500 font-bold shadow-sm'
                          : '',
                        day.isOutOfMonth
                          ? 'font-normal text-neutral-400 dark:text-gray-500 italic'
                          : 'font-medium',
                        colIdx === 6 && !day.isToday && !day.isOutOfMonth
                          ? 'text-rose-500 dark:text-rose-300'
                          : '',
                        !day.isToday && !day.isOutOfMonth ? 'text-neutral-600 dark:text-gray-300' : '',
                      ].join(' ')}
                    >
                      {day.day}
                    </span>
                  </div>
                </div>
              ))}

              {/* Bars layer for THIS row (over the cells). pointer-events:none
                  on the layer so clicks fall through to cells unless they land
                  on a bar segment (which flips pointer-events:auto). Each
                  segment's onClick stopPropagation()s so the cell underneath
                  never opens a conflicting "create booking" modal.

                  Each row booking is expanded into PER-CELL segments using
                  flatMap — so a 4-day booking renders as 4 visually-connected
                  elements (one per day cell it touches in this row), with -2px
                  negative-margin overlap on inner edges and rounded corners
                  retained only on the row's first/last column. This matches
                  FullCalendar's compact bar look: dates are fully visible,
                  bars fit below them, and multi-day bookings read as one
                  continuous strip. */}
              <div className="cal-month-bars-layer absolute inset-0 pointer-events-none">
                {bars.map((b, bi) => {
                  const bgColor = bookingBarColor(b.status, b.user_id)
                  // Fixed FC-style dimensions: bar sits below the date number
                  // zone, leaves ~10px empty at the bottom of the row for
                  // visual breathing room, and stacks vertically into tracks.
                  const BAR_TOP = 32
                  const BAR_HEIGHT = 22
                  const BAR_GAP = 3
                  // Normalize booking dates to YYYY-MM-DD so we can match the
                  // segment date string exactly. Without this we couldn't
                  // distinguish "first/last segment of the booking across
                  // multiple rows" because `week[col].dateStr` comes from
                  // constructed local Dates while `b.start_date` may carry a
                  // time component or UTC offset.
                  const bookingStartStr = new Date(b.start_date).toLocaleDateString('en-CA')
                  const bookingEndStr = new Date(b.end_date).toLocaleDateString('en-CA')
                  // Status color for the badge AND the left stripe — solid
                  // hex from STATUS_COLORS so admins can scan status
                  // visually at a glance across many bars, regardless of
                  // the user. NOTE: the BAR BG is intentionally a
                  // DIFFERENT color now — bookingBarColor hashes the
                  // user_id to pick a per-user hue, so badge/stripe
                  // (status) and bar bg (user identity) communicate
                  // orthogonal channels. Per user feedback
                  // "ปรับระบบการสุ่มสี bar มาไม่ให้ใช้สีเดียวกันกับสี
                  // ของ badge ที่มีอยู่ตอนนี้" — the chip and bar are now
                  // visually distinct without needing the inset ring as a
                  // same-color separator. The 1px white inset ring + 8px
                  // glow are still kept for chip polish (depth + legibility
                  // against any per-user background that drifts close to
                  // a status hue).
                  const statusColor = STATUS_COLORS[b.status] || '#6b7280'
                  // BOOKING-LEVEL MULTI-DAY FLAG (cross-row aware). True iff
                  // the booking's start and end dates differ — drives the
                  // label-overflow behavior on the start-segment bar (see
                  // isMultiDayStart comment block inside the per-cell loop).
                  const isMultiDayBooking = bookingStartStr !== bookingEndStr
                  const segments = [] 
                  // Track whether the booking's actual first day falls
                  // in THIS row — i.e. the row contains the start segment
                  // of a multi-day booking. Used below to decide whether
                  // to render an extending row-level label element (1-day
                  // bookings skip this and keep their inline chrome label).
                  let isMultiDayStartInThisRow = false
                  for (let col = b.startCol; col <= b.endCol; col++) {
                    const isStart = col === b.startCol
                    const isEnd = col === b.endCol
                    const segmentDateStr = week[col]?.dateStr
                    // Booking-level first/last day (cross-row aware): the
                    // ACTUAL first and last day of the booking — not the
                    // first/last visible cell segment per row. For Honda Civic
                    // 23→27 July 2569 the booking crosses Thu→Mon between two
                    // rows, so we want chrome to render on day 23 (row N) AND
                    // day 27 (row N+1), regardless of which column each sits in.
                    const isBookingStart = segmentDateStr === bookingStartStr
                    const isBookingEnd = segmentDateStr === bookingEndStr
                    if (isBookingStart && isMultiDayBooking) {
                      isMultiDayStartInThisRow = true
                    }
                    const showChrome = isBookingStart || isBookingEnd
                    const isMultiDay = b.startCol !== b.endCol
                    // PER-ROW + BOOKING-LEVEL FLAG — drives three visual
                    // changes on the start-segment bar so its inline label
                    // can extend VISUALLY past cell 1 into cells 2-3 of the
                    // multi-day bar: (a) bar overflow-hidden → overflow-
                    // visible so the label text can render past the cell
                    // edge, (b) bar zIndex b.track+5 (vs inner's +1) so
                    // the extension paints ON TOP of inner segments'
                    // same-color bg fill, (c) label truncate → whitespace-
                    // nowrap overflow-visible so text continues without
                    // an ellipsis. False on 1-day bookings and on cross-
                    // row last-day standalone segments (no inner cells to
                    // overflow into in this row).
                    const isMultiDayStart = isBookingStart && isMultiDayBooking
                    // Gap policy per edge — keeps label/bar fill inside
                    // the appropriate day's cell:
                    //   leftGap   +4 on start segment (prev padding), 0 on
                    //             end segment of multi-day (does NOT extend
                    //             back into the previous day's column),
                    //             -2 on inner segments (overlap into
                    //             previous inner segment for visual
                    //             continuity).
                    //   rightGap  +4 on end segment (prev padding), 0 on
                    //             start segment of multi-day (does NOT extend
                    //             into the next day's column — the user's
                    //             "Toyota Fortuner · สมชาย ใ..." label
                    //             must truncate cleanly inside day 30),
                    //             -2 on inner segments.
                    // Edge cases:
                    //   • 1-day booking (isStart==isEnd): both `+4`s apply
                    //     symmetrically — unchanged from original.
                    //   • Multi-day first segment edges: both 0 —
                    //     first segment MEETS the next day exactly at the
                    //     cell boundary (0 + (-2) overlap is replaced by
                    //     0 + 0 meet). Bar fill is still visually
                    //     continuous because both segments carry the
                    //     same user_id color.
                    const leftGap = isStart ? 4 : (isEnd ? 0 : -2)
                    const rightGap = isEnd ? 4 : (isStart ? 0 : -2)
                    let roundedClass = 'rounded-md'
                    if (!isStart && !isEnd) roundedClass = 'rounded-none border-x-0'
                    else if (!isStart) roundedClass = 'rounded-l-none rounded-r-md border-l-0'
                    else if (!isEnd) roundedClass = 'rounded-l-md rounded-r-none border-r-0'
                    segments.push(
                      <div
                        key={b.id + '_r' + rowIdx + '_c' + col}
                        onClick={(e) => {
                          e.stopPropagation()
                          onBarClick && onBarClick(b)
                        }}
                        onMouseEnter={() => setHoveredBookingId(String(b.id))}
                        onMouseLeave={() => setHoveredBookingId(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            e.stopPropagation()
                            onBarClick && onBarClick(b)
                          }
                        }}
                        // Accessibility contract — for 1-day bookings the
                        // FIRST segment is the canonical interactive
                        // surface (role=button + tabIndex:0 + aria-label).
                        // For multi-day bookings, the row-level extending
                        // label (rendered above) takes over as the canonical
                        // button role so AT users hear the aria-label
                        // ONCE across the whole bar visual area; the
                        // per-cell segments here (start + inner + end)
                        // drop to `aria-hidden=true` decorative status
                        // since the bar's interactivity already lives on
                        // the covering extending label. This keeps AT
                        // reading clean — no double-announcement of
                        // "Honda Civic - สมชาย - คืนแล้ว".
                        {...(isMultiDayBooking || !isStart
                          ? { 'aria-hidden': true, tabIndex: -1 }
                          : {
                              role: 'button',
                              tabIndex: 0,
                              'aria-label': `${b.brand} ${b.model} - ${b.user_name} - ${statusLabel(b.status)}`,
                            })}
                        style={{
                          left: `calc(${(col / 7) * 100}% + ${leftGap}px)`,
                          width: `calc(${(100 / 7)}% - ${leftGap + rightGap}px)`,
                          top: `${BAR_TOP + b.track * (BAR_HEIGHT + BAR_GAP)}px`,
                          height: `${BAR_HEIGHT}px`,
                          backgroundColor: bgColor,
                          animationDelay: `${bi * 0.04}s`,
                          // Multi-day start gets b.track+5 so the overflowing
                          // label paints ON TOP of inner segments' bg fill
                          // (which sit at b.track+1, later in DOM order).
                          // 1-day + non-start segments stay at b.track+1.
                          zIndex: isMultiDayStart ? b.track + 5 : b.track + 1,
                        }}
                        className={[
                          'cal-month-bar absolute flex items-center',
                          roundedClass,
                          isMultiDayStart
                            ? 'overflow-visible cursor-pointer border-[0.5px] border-white/30'
                            : 'overflow-hidden cursor-pointer border-[0.5px] border-white/30',
                          'transition-all duration-200 ease-out',
                          // Same-row fallback hover (works without React state
                          // for very old browsers; harmless on top of state).
                          'hover:brightness-110',
                          isMultiDay
                            ? 'shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-1px_0_rgba(0,0,0,0.15)]'
                            : 'shadow-sm',
                          'pointer-events-auto',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300',
                          // Inner segments fade-in (no horizontal slide) so the
                          // mid-row segments don't jitter from a fake origin.
                          isStart
                            ? 'animate-[slide-right-fade_0.25s_cubic-bezier(0.25,1,0.5,1)_both]'
                            : 'animate-[fade-in_0.2s_ease-out_both]',
                          // CROSS-ROW BOOKING HIGHLIGHT — when ANY segment of
                          // this booking is hovered (via React state captured
                          // at component level above the row scope), every
                          // segment of the same booking lights up, including
                          // ones sitting in adjacent rows (e.g. the Honda
                          // Civic booking that crosses Thu→Mon between two
                          // week rows).
                          hoveredBookingId === String(b.id)
                            ? 'brightness-110 saturate-150'
                            : '',
                        ].join(' ')}                        >
                        {/* Visual chrome (label, stripe, status badge). Cross-row
                            aware: a 5-day booking from 23→27 July 2569 has
                            segments in two rows, and chrome is rendered on
                            day 23 (row N) AND day 27 (row N+1). Inner
                            segments stay chrome-free so the bar reads as one
                            continuous strip instead of duplicated text.

                            Layout summary:
                              • First segment (start of the booking):
                                [Stripe | brand model · user_name]
                              • Last segment (end of the booking, may be in
                                a different row): [Badge-R] (just the
                                colored status chip — no duplicate brand)
                              • 1-day booking (start === end):
                                [Stripe | brand model · user_name | Badge-R]
                              • Inner segments: no chrome at all

                            The status badge is SINGLE and ALWAYS at the very
                            trailing right edge of the bar. It is colored
                            with STATUS_COLORS[status] and wrapped in a 1px
                            white inner ring + drop shadow so admins can scan
                            status visually without parsing the text label.
                            Bar fill is also status-colored via
                            bookingBarColor, so the inner ring + drop shadow
                            are what keep the badge visually distinct from
                            the same-color background. The label
                            (`brand model · user_name`) renders ONLY on the
                            start segment so the brand never appears twice
                            on a multi-day booking. The status chip alone
                            provides the “this is the end” visual anchor on
                            the trailing segment. */}
                        {showChrome && (
                          <div className="flex w-full items-center pl-1 sm:pl-1.5 pr-1 sm:pr-1.5 gap-1 h-full">
                            {/* LEFT STRIPE — anchors the first segment of the
                                booking on the left edge of the bar. Rendered
                                for both multi-day first-segment AND 1-day
                                (start===end) variants. Removed when this is
                                an end-only segment because the colored badge
                                is the visual edge.
                                Filled with STATUS_COLORS[status] (matching
                                the same color as the bar bg) plus a 0.5px
                                white inset stroke — removed per user feedback "stripe + badge ไม่ต้องมีกรอบสีขาว"
                                when stripe and bar share a hue. Per user
                                feedback "อยากให้เส้นแทบ | ด้านหน้า bar
                                เปลี่ยนสีตามสถานะด้วย" — the stripe now
                                echoes the status color symmetrically with
                                the trailing badge on the right.
                                Also wrapped in a centered status-color GLOW
                                (0 0 8px 0 statusColor, no offset) so the
                                stripe radiates a faint halo of the same
                                hue. Per user feedback "Harden แถบสีซ้าย
                                -ขวา" — the aura makes approved=green,
                                returned=blue, pending=yellow easy to tell
                                apart even when the bar fill itself is the
                                same color. The glow bleeds ~4px outside the
                                stripe into the bar bg (still same hue, no
                                clash) and ~4px further into the cell air on
                                the editorial side, which is acceptable for
                                a small 3px-wide accent — the surrounding
                                white bar border and adjacent cell bg can
                                absorb the soft halo without visual
                                confusion. Wrapper padding is
                                SYMMETRIC (pl + pr both 4/6px) so the badge
                                gets breathing room from the segment right
                                edge instead of abutting it. Per user
                                feedback:
                                “badge สถานะย้ายไปชิดขวา”). */}
                            {isBookingStart && (
                              <span
                                /* VISIBLE ON ALL VIEWPORTS (mobile +
                                 * desktop): the leading stripe is the
                                 * primary visual status indicator on
                                 * mobile (where the trailing badge is
                                 * sr-only per MOBILE-NO-BADGE) AND the
                                 * secondary on desktop (paired with the
                                 * glowing trailing badge). Previously
                                 * the className was `hidden sm:block`,
                                 * making the stripe darken only from
                                 * 640px upward — which contradicted the
                                 * MOBILE-NO-BADGE comment block below
                                 * stating that mobile should show "only
                                 * the leading | stripe + brand/model/user
                                 * label". Per user feedback "ในโหมดมือถือ
                                 * ใส่ | สถานะที่ด้านหน้ามาด้วย" = "On
                                 * mobile also include the | status at
                                 * the front." — just `block` makes the
                                 * element visible everywhere. Sized
                                 * 3px wide / 14px tall so it's a thin
                                 * accent that doesn't crowd the cell-
                                 * width bar on narrow mobile rows.
                                 */
                                className="cal-month-bar-stripe shrink-0 w-[3px] h-[14px] rounded-[1px] block"
                                style={{
                                  backgroundColor: statusColor,
                                  boxShadow:
                                    '0 0 8px 0 ' + statusColor,
                                }}
                                title={statusLabel(b.status)}
                              />
                            )}
                            {/* LABEL — renders ONLY on the first segment of
                                the booking. We deliberately do NOT repeat
                                `brand model` on the end segment because a
                                multi-day booking would otherwise flash the
                                same car brand twice (once on the start day,
                                once on the end day) — the previous mirror
                                layout had this issue and the user flagged
                                "bar แลดงยี่ห้อรถ 2 รอบ". End-only chrome
                                now shows just the colored status badge at
                                the trailing edge — the brand/model/user
                                context lives on the start segment alone. */}
                            {isBookingStart && !isMultiDayBooking && (
                              <span
                                className="cal-month-bar-label cal-bar-label min-w-0 truncate text-[10px] sm:text-[11px] font-medium text-white leading-tight flex-1"
                                title={`${b.brand} ${b.model} · ${b.user_name}`}
                              >
                                {`${b.brand} ${b.model} · ${b.user_name}`}
                              </span>
                            )}
                            {/* TRAILING STATUS BADGE — single per booking,
                                anchored at the very back of the bar (the
                                rightmost edge of the trailing segment).
                                Filled with STATUS_COLORS[status] so admins
                                can scan status at a glance across many bars
                                without reading labels. Boxing uses only the
                                status-color glow only (no white inset ring — per user "ไม่ต้องมีกรอบสีขาว", no outer drop shadow either)
                                because the badge sits just inside the
                                segment right edge. Wrapper padding
                                (pr-1 sm:pr-1.5) gives 4–6px breathing
                                room from the segment right edge — the
                                cell-border gap is set separately by the
                                inline `rightGap = isEnd ? 4 : -2` style on
                                the segment itself, not by the wrapper.
                                An OUT-OF-FLOW drop shadow would bleed 2px
                                into the neighboring cell and visually
                                clash with that cell's day number, so we
                                omit that style. But a CENTERED status-
                                color GLOW (`0 0 8px 0 statusColor`, no
                                offset) is fine because it has no
                                directional bias — it just radiates a
                                soft halo in every direction. Per user
                                feedback "Harden แถบสีซ้าย-ขวา" — the
                                glow matches the same pattern used on the
                                left stripe, so the bar has a paired
                                framed "light at both ends" look that
                                distinguishes approved=green from
                                returned=blue from pending=yellow even
                                when the bar fill itself is the same
                                color. The 8px glow + text shadow combine to
                                give the chip depth: (1) the glow halo
                                separates the chip from any per-user pastel
                                bar fill, (2) text shadow keeps the white
                                label legible on mid-saturation status hues.
                                Title attr provides full status text +
                                end-date for end-only segments. */}
                            {isBookingEnd && (
                              // MOBILE-NO-BADGE: trailing status chip is
                              // visually hidden below the sm breakpoint
                              // (640px) — only the leading | stripe +
                              // brand/model/user label remain visible.
                              // The badge's status info is already encoded
                              // in the stripe's color on the start-segment,
                              // so duplicating it as a chip in a ~50px-wide
                              // mobile cell adds visual noise without
                              // informational gain. Trade-off: on cross-row
                              // multi-day bookings, the end-row segment
                              // (e.g. day 27 of Honda Civic 23→27 July
                              // 2569) loses its badge on mobile and shows
                              // only the bar fill — this is intentional per
                              // user feedback "ในโหมด moblie ไม่ต้องแสดง
                              // badge แต่ให้แสดงแค่ | หน้าชื่อข้อมูลแทน".
                              //
                              // ACCESSIBILITY: we use `sr-only` (screen-
                              // reader-only) instead of `hidden` because
                              // the chip text "อนุมัติแล้ว" / "คืนแล้ว"
                              // carries status info that screen-reader
                              // users need on cross-row multi-day end
                              // segments where the only aria-friendly
                              // indicator (the start-segment's aria-label)
                              // lives in a different row. `sr-only` keeps
                              // the text in the accessibility tree while
                              // hiding it visually below sm: — sighted
                              // mobile users see just the stripe + label,
                              // non-sighted users still hear the status
                              // word on every segment.
                              <span
                                // `ml-auto` is the key fix here. When this is
                                // an end-only chrome (isBookingEnd &&
                                // !isBookingStart, e.g. day 27 of Honda Civic
                                // 23→27 July 2569 = row N+1 col 0), there is
                                // no Stripe-L or Label sibling. By default a
                                // flex container's single child sits at
                                // flex-start = left edge of the segment. But
                                // for cells at col 0 (the leftmost column) of
                                // ANY row, this makes the badge visually
                                // appear on the left-of-row — the user
                                // complained the badge was "ยังเห็นอยู่ซ้าย".
                                // `ml-auto` consumes all available margin
                                // space, pushing the badge to the segment's
                                // right edge (= trailing edge of the bar
                                // visual extent) regardless of which column
                                // the last-day cell sits in. On 1-day
                                // bookings (or any segment where Stripe and
                                // Label exist as siblings), `ml-auto` is a
                                // harmless redundant push to flex-end.
                                aria-hidden={isBookingStart ? 'true' : undefined}
                                className="cal-month-bar-status ml-auto shrink-0 sr-only sm:inline-flex text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-[1px] rounded-[3px] font-bold leading-tight whitespace-nowrap"
                                style={{
                                  backgroundColor: statusColor,
                                  // chipTextColor() helper handles mapping +
                                  // dev-only deduped warning on unknown
                                  // statuses — see top of file.
                                  color: chipTextColor(b.status, statusColor, b),
                                  boxShadow:
                                    '0 0 8px 0 ' + statusColor,
                                  // 2-layer dark shadow (no white halo
                                  // here — unlike the previous dark-text
                                  // version, the chip text is now LIGHT
                                  // pastel 200-level, so a white halo
                                  // would blend INTO the light text and
                                  // become invisible. The dark drop alone
                                  // still lifts the pale text off the
                                  // saturated 500-level bg enough to read
                                  // at 8–9px bold, even when the same-hue
                                  // contrast is borderline ~1.4:1.
                                  textShadow:
                                    '0 1px 2px rgba(0,0,0,0.55), 0 0 1px rgba(0,0,0,0.3)',
                                }}
                                title={
                                  isBookingStart
                                    ? `สถานะ: ${statusLabel(b.status)}`
                                    : `ถึงวันที่ ${b.end_date} • สถานะ: ${statusLabel(b.status)}`
                                }
                              >
                                {statusLabel(b.status)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  }
                  // EXTENDING LABEL (multi-day only) — row-level sibling that
                  // escapes the per-cell chrome container's 1-cell
                  // containing block (which previously produced negative
                  // max-width ⇒ invisible text on mobile). Renders as a
                  // sibling of the per-cell segments so its percentage is
                  // relative to the row's width (bar-group) instead of
                  // one cell. WHY we shift back: user feedback
                  // "ตัวอักษรล้นไปด้านหน้าเยอะไป — ขยับถอยหลังมาได้ไหม
                  // ทั้ง 2 โหมดเลย" → but uneven: cap = right reserve
                  // around the trailing badge, floor = 20px graceful for
                  // narrow rows (otherwise col==2 on R<200 would compute
                  // ~1px and collapse — same bug class as earlier
                  // "ไม่มีข้อความ mobile"). WHY `truncate` only (no sm:
                  // variants): user also re-confirmed "อย่ายาวเกิน bar"
                  // / "ข้อความเลย bar แทน" applies on BOTH viewports,
                  // so desktop also bounds (vs the earlier free-extend
                  // revert). textShadow parity with status badge keeps
                  // white text legible on pastel fills.
                  if (isMultiDayStartInThisRow) {
                    const numCells = b.endCol - b.startCol + 1
                    segments.push(
                      // Canonical interactive surface for multi-day
                      // bookings: role=button + aria-label fires ONCE
                      // across the bar (per-cell segments aria-hidden,
                      // see below); tabIndex/Enter/Space mirror native
                      // button behavior for keyboard + AT users.
                      <div
                        key={b.id + '_r' + rowIdx + '_extlabel'}
                        role="button"
                        tabIndex={0}
                        aria-label={`${b.brand} ${b.model} - ${b.user_name} - ${statusLabel(b.status)}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            e.stopPropagation()
                            onBarClick && onBarClick(b)
                          }
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          onBarClick && onBarClick(b)
                        }}
                        onMouseEnter={() => setHoveredBookingId(String(b.id))}
                        onMouseLeave={() => setHoveredBookingId(null)}
                        // `truncate` = overflow:hidden + ellipsis + nowrap
                        // — text clips WITH ellipsis at the bounded right
                        // edge on BOTH viewports. Right reserve via the
                        // `--extlabel-reserve` CSS var (mobile 28 / desktop
                        // 32) and LEFT padding via `--extlabel-left` (mobile
                        // 14 / desktop 20). See the style comment block
                        // below for the WHY behind the values (buffer-not-
                        // guard rationale for the right reserve + the
                        // full 44→36→28 mobile progression history).
                        className="cal-month-bar-extlabel absolute flex items-center pointer-events-auto cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 rounded-sm truncate text-[10px] sm:text-[11px] font-medium leading-tight pt-[2px] text-white [--extlabel-reserve:28px] sm:[--extlabel-reserve:32px] [--extlabel-left:14px] sm:[--extlabel-left:20px]"
                        style={{
                          // left +var(--extlabel-left) (mobile 14, sm+
                          // 20) / width -var(--extlabel-reserve) (mobile
                          // 28, desktop 32) / floor 20px. Mobile reserve
                          // is a buffer for the invisible (sr-only)
                          // trailing badge area, NOT a visual collision
                          // guard — so reducing it is safe on mobile and
                          // gives more visible text. After sequential
                          // user tunes (44 → 36 → 28) mobile label width
                          // has grown ~16px vs baseline, ~1 Thai char
                          // more visible per row on typical mobile
                          // widths.
                          left: `calc(${(b.startCol / 7) * 100}% + var(--extlabel-left))`,
                          top: `${BAR_TOP + b.track * (BAR_HEIGHT + BAR_GAP)}px`,
                          height: `${BAR_HEIGHT}px`,
                          // clamp(20px, expr 100%) = min 20px floor +
                          // max 100% ceiling. 20px = narrow-row graceful
                          // degrade; 100% = defensive ceiling (any real
                          // bar < 100% of row, so it's unreachable).
                          // Reserve is now viewport-dependent via the
                          // --extlabel-reserve CSS var set on className.
                          width: `clamp(20px, calc(${(numCells / 7) * 100}% - var(--extlabel-reserve)), 100%)`,
                          zIndex: b.track + 10,
                          textShadow: '0 1px 2px rgba(0,0,0,0.55)',
                        }}
                        title={`${b.brand} ${b.model} · ${b.user_name}`}
                      >
                        {`${b.brand} ${b.model} · ${b.user_name}`}
                      </div>
                    )
                  }
                  // Wrap each booking's segments in a group div so a
                  // hover on any one segment can brighten the entire bar
                  // via the :has() rule in calendar-overrides.css.
                  // pointer-events:none on the wrapper keeps segments as
                  // the only hit-test surface, but :has() reads hover
                  // state from segment children regardless.
                  return (
                    <div
                      key={b.id + '_r' + rowIdx}
                      className="cal-month-bar-group absolute inset-0 pointer-events-none"
                      data-booking-id={b.id}
                    >
                      {segments}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
