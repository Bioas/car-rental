import React, { useState, useEffect, useRef } from 'react'
import { CalendarMonth } from './CalendarDropdown'

const THAI_SHORT = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

// Listen to viewport width to switch mobile/desktop rendering. Returns
// `true` when window.innerWidth < 640 (Tailwind's `sm` breakpoint). Used
// internally by RangeDatePicker and exported so other surfaces
// (e.g. the PublicBooking modal) can match the same breakpoint
// without duplicating the resize listener / state plumbing.
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  useEffect(() => {
    function handler() {
      const v = window.innerWidth < 640
      setIsMobile(prev => prev !== v ? v : prev)
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

// Trigger button shows (start) → (end) (X วัน). Mobile uses 2-digit Thai
// year to fit narrow viewports; desktop keeps full 4-digit year.
function formatDateStr(date, short = false) {
  if (!date) return ''
  const fullYear = date.getFullYear() + 543
  const yearText = short ? String(fullYear % 100) : String(fullYear)
  return `${date.getDate()} ${THAI_SHORT[date.getMonth() + 1]} ${yearText}`
}

// RangeDatePicker — full-width trigger button that opens an interactive
// calendar panel for picking start_date + end_date as a range. Cell
// rendering reuses CalendarMonth (which in turn owns the unified pill
// logic across the app). State machine:
//   step='start': click any day → setStart, advance step to 'end'
//   step='end': click any day (>= start) → setEnd, close picker
//   step='start' after BOTH set: skip the cancel step, click any day
//     immediately becomes new start_date → step transitions to 'end'
//     (per user feedback "คลิกรอบแรกเลยให้เป็นวันเริ่มต้น" — avoids
//     wasting one click as a no-op "cancel").
//
// On mobile (< 640px): panel renders as a fixed full-screen overlay
// (`fixed inset-0 z-50`) with a ตกลง confirm button at the bottom —
// pickers on narrow viewports need explicit confirm because there's no
// hover capability to preview a range.
// On desktop: panel renders as a positioned dropdown (`absolute`) below
// the trigger button.
//
// Props:
//   startDate, endDate — date string OR... — current range values
//   onChange(start, end) — fires when either side changes (start OR end)
//   min — minimum selectable date (date string); defaults to today
//   size — 'lg' for the vehicle-tab trigger (h-12 px-5 text-base);
//          default 'h-12 px-4 text-sm' for modal pops
// RangeDatePicker — full-width trigger button that opens an interactive
// calendar panel for picking start_date + end_date as a range. Cell
// rendering reuses CalendarMonth (which in turn owns the unified pill
// logic across the app).
//   step='start': click any day → setStart, advance step to 'end'
//   step='end': click any day (>= start) → setEnd, close picker
//   step='start' after BOTH set: skip the cancel step, click any day
//     immediately becomes new start_date → step transitions to 'end'
//     (per user feedback "คลิกรอบแรกเลยให้เป็นวันเริ่มต้น" — avoids
//     wasting one click as a no-op "cancel").
//
// Two render modes:
//   - Default: trigger button + (desktop) positioned dropdown panel
//     OR (mobile < 640px) full-screen overlay panel with a ตกลง
//     confirm button at the bottom. Mobile needs explicit confirm
//     because there's no hover capability to preview a range.
//   - inline=true: no trigger button, no mobile backdrop, panel
//     renders directly inside the parent container (e.g. inside a
//     modal popup). The parent owns the surface layout; clicking
//     outside does NOT close the picker (parent decides).
//
// Props:
//   startDate, endDate — date string — current range values
//   onChange(start, end) — fires when either side changes (start OR end)
//   min — minimum selectable date (date string); defaults to today
//   size — 'lg' for vehicle-tab trigger (h-12 px-5 text-base);
//          default 'h-12 px-4 text-sm' for modal pops
//   inline — if true, omit the trigger button and skip click-outside
//          / body-scroll-lock side-effects (parent owns those)
//   noTrigger — omit the trigger button WITHOUT skipping the click-outside
//          and body-scroll-lock effects. Used when the parent already
//          supplies its own trigger (e.g. the modal's click-anywhere
//          summary pill) and the picker renders as a sibling overlay
//          popup (mobile use case in PublicBooking modal). On mobile this
//          produces the same fullscreen overlay UX as the main-page
//          picker, but triggered by the parent's external affordance.
//   onClose — fires when the panel auto-dismisses (mobile ตกลง confirm,
//          desktop after end-date pick). Lets the parent swap surfaces
//          (e.g. summary pill → inline picker → summary) without the
//          picker permanently owning body-scroll or focus state.
//
// Render-mode matrix:
//   inline=false, noTrigger=false → desktop dropdown OR mobile overlay
//                                   WITH trigger button rendered
//   inline=true,  noTrigger=false → inline panel inside parent (no trigger) — parent owns surface
//   inline=false, noTrigger=true  → overlay popup WITHOUT trigger — parent provides its own (mobile modal flow)
export default function RangeDatePicker({ startDate, endDate, onChange, min, size, inline = false, noTrigger = false, onClose }) {
  const [open, setOpen] = useState(inline || noTrigger)
  const ref = useRef(null)
  const panelRef = useRef(null)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const minDate = min ? new Date(min + 'T00:00:00') : today
  const [step, setStep] = useState('start')
  const [hoverDate, setHoverDate] = useState(null)
  const [viewDate, setViewDate] = useState(today)
  const isMobile = useIsMobile()

  // Sync `step` when startDate/endDate props change AND we're in a
  // mode where the parent owns surfacing (inline or noTrigger). In
  // the trigger-button modes (default mobile+desktop), the trigger
  // button's onClick handler does this sync synchronously on open.
  // Without this useEffect, both inline-edited and the new
  // mobile-overlay (noTrigger) pickers would always enter step='start'
  // on mount even when an end_date is awaited — user would have to
  // click twice (once to reset range, once to commit end) for a
  // partially-selected state to flow through.
  useEffect(() => {
    if (!inline && !noTrigger) return
    if (startDate && !endDate) setStep('end')
    else setStep('start')
  }, [inline, noTrigger, startDate, endDate])

  const vy = viewDate.getFullYear()
  const vm = viewDate.getMonth()

  // 36 first-of-month Dates starting from minDate. Renders 3 years of
  // scrollable months on mobile. Padding the array ensures the
  // scrollable list reaches past the user's likely pick range.
  const monthOptions = []
  const scrollStartMonth = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
  for (let i = 0; i < 36; i++) {
    const d = new Date(scrollStartMonth.getFullYear(), scrollStartMonth.getMonth() + i, 1)
    monthOptions.push(d)
  }

  // Click-outside closes the panel and resets state machine to step='start'.
  // Two refs (trigger + panel) because on mobile the panel is a sibling
  // element outside the trigger's DOM tree. In inline mode the parent
  // owns surfacing — skipping this avoids accidental dismissal when the
  // user clicks sibling form fields above/below the picker.
  useEffect(() => {
    if (inline) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target) && panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false)
        setStep('start')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [inline])

  // Lock body scroll while the calendar overlay is open (mobile mode is
  // `fixed inset-0` so we want full-screen backdrop; desktop mode also
  // benefits from no parent scroll-jitter when the modal panel renders).
  // In `inline` mode AND in `noTrigger` mode the parent surface owns
  // the body-lock — skipping prevents a second lock that would race
  // with the parent's cleanup (e.g. modal closing first vs picker
  // closing first). The default trigger-button modes (desktop dropdown
  // + standalone mobile overlay) DO own their own lock because there's
  // no parent surface competing for body-scroll.
  useEffect(() => {
    if (inline || noTrigger) return
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open, inline, noTrigger])

  // Notify parent when the picker auto-dismisses (mobile ตกลง confirm,
  // desktop after end-date click, or back-out click-outside when not
  // in inline mode). Use a ref to detect the true→false transition
  // and skip the initial mount fire (inline=true opens the panel by
  // default, so we'd otherwise emit onClose on first render).
  const prevOpenRef = useRef(open)
  useEffect(() => {
    if (prevOpenRef.current && !open && onClose) onClose()
    prevOpenRef.current = open
  }, [open, onClose])

  const selStart = startDate ? new Date(startDate + 'T00:00:00') : null
  const selEnd = endDate ? new Date(endDate + 'T00:00:00') : null

  function handlePick(y, m, d) {
    const date = new Date(y, m, d)
    if (date < minDate) return

    // Completed-range reset — when both selStart && selEnd are set
    // but the user has NOT yet confirmed (e.g. mobile ตกลง button
    // still pending), any new click should restart a fresh range.
    // The new pick becomes the new start_date and end_date clears. We
    // KEEP step = 'end' (NOT 'start') so that the *very next* click
    // flows through the `end` branch and becomes the new end_date —
    // yielding a 2-click change workflow (click 1 = new start, click
    // 2 = new end). Per user feedback "คลิกรอบแรกเลยให้เป็นวัน
    // เริ่มต้น" (first click immediately becomes start date) — the
    // earlier setStep('start') shape made click 1 a "wasted cancel"
    // that required an extra click to reach the actual new start.
    if (selStart && selEnd) {
      onChange(date.toLocaleDateString('en-CA'), '')
      setStep('end')
      return
    }

    if (step === 'start' || !selStart) {
      onChange(date.toLocaleDateString('en-CA'), '')
      setStep('end')
    } else {
      if (date < selStart) {
        onChange(date.toLocaleDateString('en-CA'), '')
        return
      }
      onChange(startDate, date.toLocaleDateString('en-CA'))
      if (!isMobile) {
        setOpen(false)
        setStep('start')
      }
    }
  }

  function confirmRange() {
    setOpen(false)
    setStep('start')
  }

  const displayText = selStart
    ? selEnd
      ? `${formatDateStr(selStart, isMobile)} → ${formatDateStr(selEnd, isMobile)} (${Math.round((selEnd - selStart) / (1000 * 60 * 60 * 24)) + 1} วัน)`
      : `${formatDateStr(selStart, isMobile)} → เลือกวันที่คืน`
    : 'เลือกวันที่ใช้งานพาหนะ'

  return (
    <div ref={ref} className={inline ? '' : 'relative'}>
      {!inline && !noTrigger && (
      <button type="button" onClick={() => {
          if (!open) {
            // Pick-up context: if a start_date is already set but no
            // end_date yet, jump straight to step='end' so the next
            // click commits the end_date. Avoids the redundant
            // "re-click start_date" friction — the user can pick a
            // end_date on first re-open without re-declaring the start.
            setStep(selStart && !selEnd ? 'end' : 'start')
          }
          setOpen(!open)
        }}
        className={`w-full flex items-center gap-3 bg-white dark:bg-gray-800 border-2 rounded-xl transition-all duration-200 focus:outline-none ${
          size === 'lg' ? 'h-12 px-5 text-base' : 'h-12 px-4 text-sm'
        } ${
          open ? 'border-brand-400 ring-2 ring-brand-100' : 'border-gray-200 dark:border-gray-600 hover:border-brand-300'
        } ${selStart ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}`}>
        <i className={`bx bx-calendar shrink-0 ${size === 'lg' ? 'text-xl' : 'text-base'} ${selStart ? 'text-brand-500' : 'text-gray-400'}`}></i>
        <span className="flex-1 truncate text-left leading-tight">{displayText}</span>
        <i className={`bx bx-chevron-down shrink-0 ${size === 'lg' ? 'text-xl' : 'text-base'} text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}></i>
      </button>
      )}
      {open && (
        <>
          {!inline && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 sm:hidden" onClick={() => { setOpen(false); setStep('start') }} />}
          <div className={inline ? 'block' : 'fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none sm:absolute sm:inset-auto sm:top-full sm:mt-2 sm:left-0 sm:right-0 sm:block sm:p-0'}>
          <div ref={panelRef} className={inline
            ? "pointer-events-auto w-full max-h-[60vh] overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-2xl shadow-2xl motion-safe:animate-scale-in"
            : "pointer-events-auto w-full max-h-[95vh] overflow-y-auto sm:mx-auto sm:w-[640px] sm:overflow-visible bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-2xl shadow-2xl motion-safe:animate-scale-in"}>
            <div className="p-4 sm:p-6 w-full">
            {isMobile ? (
              <>
                <div className="flex items-center justify-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-4">
                  {selStart ? <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-600"/>ยืม {formatDateStr(selStart)}</span> : null}
                  {selStart && selEnd ? <span className="text-gray-300">|</span> : null}
                  {selEnd ? <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-600"/>คืน {formatDateStr(selEnd)}</span> : null}
                  {selStart && selEnd ? <span className="text-gray-400 font-medium">({Math.round((selEnd - selStart) / (1000 * 60 * 60 * 24)) + 1} วัน)</span> : null}
                  {!selStart ? <span>เลือกวันเริ่มต้น</span> : !selEnd ? <span className="text-amber-500">เลือกวันคืนรถ</span> : null}
                </div>
                <div className="overflow-y-auto max-h-[55vh] scrollbar-none">
                  {monthOptions.map((d, idx) => (
                    <div key={idx} className="mb-4">
                      {/* CalendarMonth (named export of CalendarDropdown.jsx).
                          sparse=true drops prev/next-month bleed days so the
                          mobile year-pick layout stays compact. mobile mode
                          uses CalendarMonth instead of CalendarDropdown
                          because mobile scrolls a vertical list, not the
                          side-by-side 2-month desktop layout. */}
                      <CalendarMonth year={d.getFullYear()} month={d.getMonth()}
                        sparse
                        activeMin={minDate} today={today}
                        selectedDate={null}
                        rangeStart={selStart}
                        rangeEnd={selEnd}
                        previewStart={step === 'end' && selStart && !selEnd ? selStart : null}
                        previewEnd={step === 'end' && !selEnd ? hoverDate : null}
                        onPickDate={(date) => handlePick(date.getFullYear(), date.getMonth(), date.getDate())}
                        onCellMouseEnter={(date) => setHoverDate(date)}
                        onCellMouseLeave={() => setHoverDate(null)} />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-3">
                  {selStart ? <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-600"/>ยืม {formatDateStr(selStart)}</span> : null}
                  {selStart && selEnd ? <span className="text-gray-300">|</span> : null}
                  {selEnd ? <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-600"/>คืน {formatDateStr(selEnd)}</span> : null}
                  {selStart && selEnd ? <span className="text-gray-400 font-medium">({Math.round((selEnd - selStart) / (1000 * 60 * 60 * 24)) + 1} วัน)</span> : null}
                  {!selStart ? <span>เลือกวันเริ่มต้น</span> : !selEnd ? <span className="text-amber-500">เลือกวันคืนรถ</span> : null}
                </div>
                <div className="flex items-center justify-between mb-4">
                  <button type="button" onClick={() => setViewDate(new Date(vy, vm - 1, 1))}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
                    <i className="bx bx-chevron-left text-base"></i>
                  </button>
                  <div className="text-sm font-medium text-neutral-700 dark:text-gray-200">
                    {step === 'end' && selStart ? 'เลือกวันคืนรถ' : 'เลือกวันเริ่มต้น'}
                  </div>
                  <button type="button" onClick={() => setViewDate(new Date(vy, vm + 1, 1))}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
                    <i className="bx bx-chevron-right text-base"></i>
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                  <CalendarMonth year={vy} month={vm}
                    activeMin={minDate} today={today}
                    selectedDate={null}
                    rangeStart={selStart}
                    rangeEnd={selEnd}
                    previewStart={step === 'end' && selStart && !selEnd ? selStart : null}
                    previewEnd={step === 'end' && !selEnd ? hoverDate : null}
                    onPickDate={(date) => handlePick(date.getFullYear(), date.getMonth(), date.getDate())}
                    onCellMouseEnter={(date) => setHoverDate(date)}
                    onCellMouseLeave={() => setHoverDate(null)} />
                  <CalendarMonth year={vy} month={vm + 1}
                    activeMin={minDate} today={today}
                    selectedDate={null}
                    rangeStart={selStart}
                    rangeEnd={selEnd}
                    previewStart={step === 'end' && selStart && !selEnd ? selStart : null}
                    previewEnd={step === 'end' && !selEnd ? hoverDate : null}
                    onPickDate={(date) => handlePick(date.getFullYear(), date.getMonth(), date.getDate())}
                    onCellMouseEnter={(date) => setHoverDate(date)}
                    onCellMouseLeave={() => setHoverDate(null)} />
                </div>
              </>
            )}
            {isMobile && (
              <button type="button" disabled={!selStart || !selEnd}
                onClick={confirmRange}
                className={`w-full mt-4 h-11 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all shadow-md ${
                  selStart && selEnd
                    ? 'text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800'
                    : 'text-gray-400 bg-gray-100 dark:bg-gray-700 cursor-not-allowed'
                }`}>
                <i className="bx bx-check text-base"></i>
                ตกลง
              </button>
            )}
          </div>
        </div>
        </div>
        </>
      )}
    </div>
  )
}
