import React, { useState, useEffect, useRef } from 'react'
import CalendarPage from './CalendarPage'

const STATUS_COLORS = { pending: '#f59e0b', approved: '#10b981', rejected: '#ef4444', returned: '#3b82f6' }

function statusLabel(s) {
  const m = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ', returned: 'คืนแล้ว' }
  return m[s] || s
}

const THAI_SHORT = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const DAYS_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

function todayStr() {
  return new Date().toLocaleDateString('en-CA')
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

function DatePicker({ value, onChange, min }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const panelRef = useRef(null)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const minDate = min ? new Date(min + 'T00:00:00') : today
  const [viewDate, setViewDate] = useState(value ? new Date(value + 'T00:00:00') : today)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (value) setViewDate(new Date(value + 'T00:00:00'))
  }, [value])

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target) && panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const vy = viewDate.getFullYear()
  const vm = viewDate.getMonth()
  const dim = new Date(vy, vm + 1, 0).getDate()
  const firstDay = new Date(vy, vm, 1).getDay()
  const prevDim = new Date(vy, vm, 0).getDate()

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push({ d: prevDim - firstDay + 1 + i, other: true })
  for (let i = 1; i <= dim; i++) cells.push({ d: i, other: false })
  const rem = cells.length % 7
  if (rem) for (let i = 1; i <= 7 - rem; i++) cells.push({ d: i, other: true })

  function isSameDay(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  }

  function isDisabled(d) { return new Date(vy, vm, d) < minDate }

  function pickDate(d) {
    const date = new Date(vy, vm, d)
    if (date < minDate) return
    onChange(date.toLocaleDateString('en-CA'))
    if (!isMobile) setOpen(false)
  }

  const selectedDate = value ? new Date(value + 'T00:00:00') : null

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className={`w-full h-12 px-4 flex items-center justify-between bg-white dark:bg-gray-800 border-2 rounded-xl text-sm transition-all duration-200 focus:outline-none ${
          open ? 'border-brand-400 ring-2 ring-brand-100' : 'border-gray-200 dark:border-gray-600 hover:border-brand-300'
        } ${selectedDate ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}`}>
        <span className="truncate">
          {selectedDate
            ? `${selectedDate.getDate()} ${THAI_SHORT[selectedDate.getMonth() + 1]} ${selectedDate.getFullYear() + 543}`
            : 'เลือกวันที่'}
        </span>
        <i className={`bx bx-calendar text-base text-gray-400 shrink-0 ml-2 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}></i>
      </button>
      {open && (
        <div ref={panelRef} className="absolute z-50 top-full mt-1 left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl overflow-hidden origin-top">
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={() => setViewDate(new Date(vy, vm - 1, 1))}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-brand-100 dark:hover:bg-brand-900/40 text-gray-600 dark:text-gray-400 transition-colors text-xs">
                <i className="bx bx-chevron-left text-xs"></i>
              </button>
              <div className="text-xs font-semibold text-gray-800 dark:text-gray-100">{THAI_SHORT[vm + 1]} {vy + 543}</div>
              <button type="button" onClick={() => setViewDate(new Date(vy, vm + 1, 1))}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-brand-100 dark:hover:bg-brand-900/40 text-gray-600 dark:text-gray-400 transition-colors text-xs">
                <i className="bx bx-chevron-right text-xs"></i>
              </button>
            </div>
            <div className="grid grid-cols-7 mb-1">
              {DAYS_TH.map((d, i) => (
                <div key={d} className={`flex items-center justify-center h-6 text-[10px] font-medium ${
                  i === 0 ? 'text-rose-400 dark:text-rose-300' : i === 6 ? 'text-indigo-400 dark:text-indigo-300' : 'text-gray-400 dark:text-gray-500'
                }`}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((c, i) => {
                const d = new Date(vy, vm, c.d)
                const isSel = isSameDay(d, selectedDate)
                const disabled = isDisabled(c.d)
                const isTd = isSameDay(d, today)
                const dow = i % 7
                return (
                  <button key={i} type="button" disabled={disabled}
                    onClick={() => !c.other && pickDate(c.d)}
                    className={`flex items-center justify-center w-full aspect-square text-center text-xs rounded-lg transition-colors ${
                      c.other || disabled ? 'text-gray-200 dark:text-gray-600 cursor-default' 
                        : isSel ? '' 
                        : dow === 0 ? 'text-rose-400 dark:text-rose-300' 
                        : dow === 6 ? 'text-indigo-400 dark:text-indigo-300' 
                        : 'text-gray-700 dark:text-gray-300'
                    } ${!c.other && !isSel && !disabled ? 'hover:bg-brand-50 dark:hover:bg-brand-950/40' : ''} ${isSel ? 'bg-brand-600 text-white font-semibold hover:bg-brand-700' : ''} ${isTd && !isSel ? 'text-brand-600 dark:text-brand-400 font-semibold' : ''} ${
                      disabled ? 'cursor-not-allowed hover:bg-transparent' : ''
                    }`}>
                    {c.d}
                  </button>
                )
              })}
            </div>
            {isMobile && (
              <button type="button" disabled={!selectedDate}
                onClick={() => setOpen(false)}
                className="w-full mt-3 h-10 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all shadow-md ${
                  selectedDate
                    ? 'text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800'
                    : 'text-gray-400 bg-gray-100 dark:bg-gray-700 cursor-not-allowed'
                }">
                <i className="bx bx-check text-base"></i>
                ตกลง
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function RangeDatePicker({ startDate, endDate, onChange, min, size }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const panelRef = useRef(null)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const minDate = min ? new Date(min + 'T00:00:00') : today
  const [step, setStep] = useState('start')
  const [hoverDate, setHoverDate] = useState(null)
  const [viewDate, setViewDate] = useState(today)
  const isMobile = useIsMobile()

  const vy = viewDate.getFullYear()
  const vm = viewDate.getMonth()

  const monthOptions = []
  const scrollStartMonth = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
  for (let i = 0; i < 36; i++) {
    const d = new Date(scrollStartMonth.getFullYear(), scrollStartMonth.getMonth() + i, 1)
    monthOptions.push(d)
  }

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target) && panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false)
        setStep('start')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selStart = startDate ? new Date(startDate + 'T00:00:00') : null
  const selEnd = endDate ? new Date(endDate + 'T00:00:00') : null

  function handlePick(y, m, d) {
    const date = new Date(y, m, d)
    if (date < minDate) return

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

  function renderMonth(y, m) {
    const dim = new Date(y, m + 1, 0).getDate()
    const firstDay = new Date(y, m, 1).getDay()
    const prevDim = new Date(y, m, 0).getDate()
    const cells = []
    for (let i = 0; i < firstDay; i++) cells.push({ d: prevDim - firstDay + 1 + i, other: true })
    for (let i = 1; i <= dim; i++) cells.push({ d: i, other: false })
    const rem = cells.length % 7
    if (rem) for (let i = 1; i <= 7 - rem; i++) cells.push({ d: i, other: true })

    function isSameDay(a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }
    function isDisabled(d) { return new Date(y, m, d) < minDate }
    const isToday = (d) => isSameDay(new Date(y, m, d), today)

    function inRange(d) {
      if (!selStart) return false
      const date = new Date(y, m, d)
      if (selEnd) return date >= selStart && date <= selEnd
      return isSameDay(date, selStart)
    }

    function inPreviewRange(d) {
      if (!selStart || selEnd || step !== 'end' || !hoverDate) return false
      const date = new Date(y, m, d)
      const start = selStart < hoverDate ? selStart : hoverDate
      const end = selStart < hoverDate ? hoverDate : selStart
      return date >= start && date <= end
    }

    return (
      <div className="flex-1 min-w-0">
        <div className="text-center font-semibold text-sm text-gray-800 dark:text-gray-100 mb-3">{THAI_SHORT[m + 1]} {y + 543}</div>        <div className="grid grid-cols-7 mb-1.5">
          {DAYS_TH.map((d, i) => <div key={d} className={`flex items-center justify-center h-7 text-[11px] font-medium ${
            i === 0 ? 'text-rose-400 dark:text-rose-300' : i === 6 ? 'text-indigo-400 dark:text-indigo-300' : 'text-gray-400 dark:text-gray-500'
          }`}>{d}</div>)}</div>
        <div className="grid grid-cols-7">
          {cells.map((c, i) => {
            const date = new Date(y, m, c.d)
            const disabled = isDisabled(c.d)
            const isStart = !c.other && isSameDay(date, selStart)
            const isEnd = !c.other && isSameDay(date, selEnd)
            const isRange = !c.other && inRange(c.d)
            const isPreview = !c.other && inPreviewRange(c.d) && !isStart
            const isTodayDate = isToday(c.d)
            const dow = i % 7
            let rangeRound = ''
            if (isRange && selStart && selEnd && selStart.getTime() !== selEnd.getTime() && !c.other) {
              if (isStart && isEnd) rangeRound = 'rounded-lg'
              else if (isStart) rangeRound = 'rounded-l-lg'
              else if (isEnd) rangeRound = 'rounded-r-lg'
              else rangeRound = ''
            }
            let previewRound = ''
            if (isPreview && selStart && hoverDate && selStart.getTime() !== hoverDate.getTime() && !c.other) {
              const isPreviewStart = isSameDay(date, selStart)
              const isPreviewEnd = isSameDay(date, hoverDate)
              if (isPreviewStart && isPreviewEnd) previewRound = 'rounded-lg'
              else if (isPreviewStart) previewRound = 'rounded-l-lg'
              else if (isPreviewEnd) previewRound = 'rounded-r-lg'
              else previewRound = ''
            }
            return (
              <button key={i} type="button" disabled={disabled}
                onClick={() => { if (!c.other) handlePick(y, m, c.d) }}
                onMouseEnter={() => { if (!c.other && !disabled) setHoverDate(new Date(y, m, c.d)) }}
                onMouseLeave={() => setHoverDate(null)}
                className={`relative flex items-center justify-center w-full h-10 text-sm transition-colors ${
                  c.other ? 'text-gray-200 dark:text-gray-600 cursor-default' : ''
                } ${isRange ? `bg-brand-100 dark:bg-brand-900/30 ${rangeRound}` : ''} ${
                  isPreview && !isRange ? `bg-brand-50 dark:bg-brand-900/20 ${previewRound}` : ''
                } ${
                  isStart || isEnd ? 'z-10' : ''
                } ${disabled ? 'text-gray-200 dark:text-gray-600 cursor-not-allowed hover:bg-transparent' : !c.other ? (
                  dow === 0 ? 'text-rose-400 dark:text-rose-300' : dow === 6 ? 'text-indigo-400 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'
                ) : ''}`}>
                {isStart && isEnd ? (
                  <span className="w-full h-full flex items-center justify-center bg-brand-600 text-white font-semibold rounded-lg">{c.d}</span>
                ) : isStart ? (
                  <span className="w-full h-full flex items-center justify-center bg-brand-600 text-white font-semibold rounded-lg">{c.d}</span>
                ) : isEnd ? (
                  <span className="w-full h-full flex items-center justify-center bg-brand-600 text-white font-semibold rounded-lg">{c.d}</span>
                ) : isRange ? (
                  <span className={`w-full h-full flex items-center justify-center ${isTodayDate ? 'text-brand-600 dark:text-brand-400 font-semibold' : 'text-gray-700 dark:text-gray-300'}`}>{c.d}</span>
                ) : (
                  <span className={`w-full h-full flex items-center justify-center rounded-lg hover:bg-brand-50 dark:hover:bg-brand-950/40 ${isTodayDate && !isStart && !isEnd ? 'text-brand-600 dark:text-brand-400 font-semibold' : ''}`}>{c.d}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  function formatDateStr(date) {
    if (!date) return ''
    return `${date.getDate()} ${THAI_SHORT[date.getMonth() + 1]} ${date.getFullYear() + 543}`
  }

  const displayText = selStart
    ? selEnd
      ? `${formatDateStr(selStart)} → ${formatDateStr(selEnd)} (${Math.round((selEnd - selStart) / (1000 * 60 * 60 * 24)) + 1} วัน)`
      : `${formatDateStr(selStart)} → เลือกวันที่คืน`
    : 'เลือกวันที่ใช้งานพาหนะ'

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => {
          if (!open) setStep('start')
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
      {open && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 sm:hidden" onClick={() => { setOpen(false); setStep('start') }} />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none sm:absolute sm:inset-auto sm:top-full sm:mt-2 sm:left-0 sm:right-0 sm:block sm:p-0">
          <div ref={panelRef} className="
            pointer-events-auto w-full max-h-[95vh] overflow-y-auto
            sm:mx-auto sm:w-[640px] sm:overflow-visible
            bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-2xl shadow-2xl motion-safe:animate-scale-in
          ">
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
                      {renderMonth(d.getFullYear(), d.getMonth())}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <button type="button" onClick={() => setViewDate(new Date(vy, vm - 1, 1))}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
                    <i className="bx bx-chevron-left text-base"></i>
                  </button>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    {selStart ? <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-600"/>ยืม {formatDateStr(selStart)}</span> : null}
                    {selStart && selEnd ? <span className="text-gray-300">|</span> : null}
                    {selEnd ? <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-600"/>คืน {formatDateStr(selEnd)}</span> : null}
                    {selStart && selEnd ? <span className="text-gray-400 font-medium">({Math.round((selEnd - selStart) / (1000 * 60 * 60 * 24)) + 1} วัน)</span> : null}
                    {!selStart ? <span>เลือกวันเริ่มต้น</span> : !selEnd ? <span className="text-amber-500">เลือกวันคืนรถ</span> : null}
                  </div>
                  <button type="button" onClick={() => setViewDate(new Date(vy, vm + 1, 1))}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
                    <i className="bx bx-chevron-right text-base"></i>
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                  {renderMonth(vy, vm)}
                  {renderMonth(vy, vm + 1)}
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

function CarSelect({ value, onChange, options }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = options.find(o => o.id === value)

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className={`w-full h-12 px-4 flex items-center justify-between bg-white dark:bg-gray-800 border-2 rounded-xl text-sm transition-all duration-200 focus:outline-none ${
          open ? 'border-brand-400 ring-2 ring-brand-100' : 'border-gray-200 dark:border-gray-600 hover:border-brand-300'
        } ${selected ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}`}>
        {selected ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/50 dark:to-brand-800/50 flex items-center justify-center text-brand-700 dark:text-brand-300 text-[10px] font-bold shrink-0">
              {selected.brand?.charAt(0)}{selected.model?.charAt(0)}
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-tight">{selected.brand} {selected.model}</div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">{selected.license_plate} · {selected.seats} ที่นั่ง</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400">
              <i className="bx bx-car text-base"></i>
            </div>
            <span>— เลือกรถ —</span>
          </div>
        )}
        <i className={`bx bx-chevron-down text-base text-gray-400 shrink-0 ml-2 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}></i>
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl overflow-hidden origin-top">
          <div className="max-h-60 overflow-y-auto py-1">
            {options.map(c => (
              <button key={c.id} type="button"
                onClick={() => { onChange(c.id); setOpen(false) }}
                className={`w-full px-4 py-3 text-sm flex items-center gap-3 transition-colors hover:bg-brand-50 dark:hover:bg-brand-950/40 ${
                  c.id === value ? 'text-brand-700 dark:text-brand-300 font-medium bg-brand-50/50 dark:bg-brand-950/30' : 'text-gray-700 dark:text-gray-300'
                }`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  c.id === value ? 'bg-brand-500 text-white' : 'bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/50 dark:to-brand-800/50 text-brand-700 dark:text-brand-300'
                }`}>
                  {c.brand?.charAt(0)}{c.model?.charAt(0)}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className="text-sm font-medium leading-tight truncate">{c.brand} {c.model}</div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">{c.license_plate} · {c.seats} ที่นั่ง</div>
                </div>
                {c.id === value && (
                  <i className="bx bx-check text-base text-brand-500 shrink-0"></i>
                )}
              </button>
            ))}
            {options.length === 0 && (
              <div className="px-4 py-3 text-xs text-gray-400 text-center">ไม่มีรถที่พร้อมใช้งาน</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function UserSelect({ value, onChange, options }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = options.find(o => o.id === value)

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className={`w-full h-12 px-4 flex items-center justify-between bg-white dark:bg-gray-800 border-2 rounded-xl text-sm transition-all duration-200 focus:outline-none ${
          open ? 'border-brand-400 ring-2 ring-brand-100' : 'border-gray-200 dark:border-gray-600 hover:border-brand-300'
        } ${selected ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}`}>
        {selected ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/50 dark:to-brand-800/50 flex items-center justify-center text-brand-700 dark:text-brand-300 text-[10px] font-bold shrink-0">
              {selected.name?.charAt(0)}
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-tight">{selected.name}</div>
              {selected.phone && <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">{selected.phone}</div>}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400">
              <i className="bx bx-user text-base"></i>
            </div>
            <span>— เลือกผู้ยืม —</span>
          </div>
        )}
        <i className={`bx bx-chevron-down text-base text-gray-400 shrink-0 ml-2 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}></i>
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl overflow-hidden origin-top">
          <div className="max-h-60 overflow-y-auto py-1">
            {options.map(u => (
              <button key={u.id} type="button"
                onClick={() => { onChange(u.id); setOpen(false) }}
                className={`w-full px-4 py-3 text-sm flex items-center gap-3 transition-colors hover:bg-brand-50 dark:hover:bg-brand-950/40 ${
                  u.id === value ? 'text-brand-700 dark:text-brand-300 font-medium bg-brand-50/50 dark:bg-brand-950/30' : 'text-gray-700 dark:text-gray-300'
                }`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  u.id === value ? 'bg-brand-500 text-white' : 'bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/50 dark:to-brand-800/50 text-brand-700 dark:text-brand-300'
                }`}>
                  {u.name?.charAt(0)}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className="text-sm font-medium leading-tight truncate">{u.name}</div>
                  {u.phone && <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">{u.phone}</div>}
                </div>
                {u.id === value && (
                  <i className="bx bx-check text-base text-brand-500 shrink-0"></i>
                )}
              </button>
            ))}
            {options.length === 0 && (
              <div className="px-4 py-3 text-xs text-gray-400 text-center">ไม่มีผู้ยืม</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PublicBooking() {
  const [availableCars, setAvailableCars] = useState([])
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ user_id: '', car_id: '', start_date: '', end_date: '', purpose: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [lookupQuery, setLookupQuery] = useState('')
  const [lookupResult, setLookupResult] = useState(null)
  const [lookupLoading, setLookupLoading] = useState(false)

  const [activeTab, setActiveTab] = useState('cars')
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0)
  const tabBarRef = useRef(null)

  useEffect(() => {
    if (!tabBarRef.current) return
    const activeBtn = tabBarRef.current.querySelector('button[data-tab="cars"]')
    if (activeBtn) {
      activeBtn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' })
    }
  }, [])

  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    try {
      const res = await fetch('/api/public/users')
      if (res.ok) {
        const d = await res.json()
        setUsers(d.users)
      }
    } catch (e) { console.error(e) }
  }

  async function fetchCars(startDate, endDate) {
    try {
      let url = '/api/public/cars'
      if (startDate && endDate) url += `?start_date=${startDate}&end_date=${endDate}`
      const res = await fetch(url)
      if (res.ok) {
        const d = await res.json()
        setAvailableCars(d.cars)
      }
    } catch (e) { console.error(e) }
  }

  function updateForm(key, value) {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'start_date' && prev.end_date && value > prev.end_date) next.end_date = ''
      return next
    })
  }

  async function submitBooking(e) {
    e.preventDefault()
    setError('')
    setSuccess(false)
    if (!form.user_id) { setError('กรุณาเลือกชื่อผู้ยืม'); return }
    if (!form.car_id) { setError('กรุณาเลือกรถ'); return }
    if (!form.start_date) { setError('กรุณาเลือกวันที่เริ่มต้น'); return }
    if (!form.end_date) { setError('กรุณาเลือกวันที่สิ้นสุด'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error); return }
      setSuccess(true)
      setForm({ user_id: '', car_id: '', start_date: '', end_date: '', purpose: '' })
      setCalendarRefreshKey(k => k + 1)
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  async function handleLookup(e) {
    e.preventDefault()
    if (!lookupQuery) return
    setLookupLoading(true)
    setLookupResult(null)
    try {
      const res = await fetch('/api/public/bookings/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: lookupQuery })
      })
      const d = await res.json()
      setLookupResult(d)
    } catch {
      setLookupResult({ bookings: [] })
    } finally {
      setLookupLoading(false)
    }
  }

  
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 via-white to-brand-50 dark:from-gray-950 dark:via-gray-900 dark:to-brand-950">
      <header className="relative z-10 flex items-center justify-center sm:justify-start px-6 lg:px-12 h-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
            <i className="bx bxs-zap text-xl text-white"></i>
          </div>
          <span className="font-heading font-bold text-lg text-gray-900 dark:text-white">วิทยาลัยเทคนิคบุรีรัมย์</span>
        </div>

      </header>

      <main className="relative px-6 lg:px-12 pb-20 flex flex-col flex-1">
        <div className="max-w-6xl mx-auto w-full flex flex-col flex-1">
          <div className="text-center pt-2 pb-6">
            <h1 className="text-4xl lg:text-5xl font-bold font-heading text-gray-900 dark:text-white mb-4">
              ระบบจอง{' '}
              <span className="text-brand-600">ยานพาหนะ</span>
            </h1>

          </div>

          <div ref={tabBarRef} className="flex justify-center gap-2 mb-6 overflow-x-auto scrollbar-none"
              style={{
                maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
                WebkitMaskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
              }}>
            <button onClick={() => setActiveTab('calendar')} data-tab="calendar"
              className={`h-10 px-5 inline-flex items-center gap-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                activeTab === 'calendar'
                  ? 'text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800'
                  : 'text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-gray-100'
              }`}>
              <i className="bx bx-calendar text-base"></i>
              ปฏิทินยานพาหนะ
            </button>
            <button onClick={() => setActiveTab('cars')} data-tab="cars"
              className={`h-10 px-5 inline-flex items-center gap-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                activeTab === 'cars'
                  ? 'text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800'
                  : 'text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-gray-100'
              }`}>
              <i className="bx bx-car text-base"></i>
              ยานพาหนะ
            </button>
            <button onClick={() => setActiveTab('lookup')} data-tab="lookup"
              className={`h-10 px-5 inline-flex items-center gap-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                activeTab === 'lookup'
                  ? 'text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800'
                  : 'text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-gray-100'
              }`}>
              <i className="bx bx-search text-base"></i>
               ติดตามสถานะ

            </button>
          </div>

          {activeTab === 'cars' && (
          <section className="flex flex-col flex-1 motion-safe:animate-fade-in">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold font-heading text-gray-900 dark:text-white">รถยนต์ที่พร้อมใช้งาน</h2>
              <p className="text-gray-500 dark:text-gray-400 mt-1">เลือกวันที่ต้องการใช้งานและยานพาหนะ</p>
            </div>

            <div className="max-w-4xl mx-auto w-full flex flex-col flex-1">
              <div className={`bg-white dark:bg-gray-800/80 rounded-2xl shadow-xl shadow-gray-200/50 dark:shadow-gray-950/50 border border-gray-100 dark:border-gray-700 p-6 flex flex-col ${!form.start_date || !form.end_date ? 'flex-1' : ''}`}>
                <div className="mb-6">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">เลือกวันที่ต้องการใช้งาน</label>
                  <RangeDatePicker startDate={form.start_date} endDate={form.end_date}
                    onChange={(s, e) => {
                      setForm(prev => ({ ...prev, start_date: s, end_date: e }))
                      if (s && e) fetchCars(s, e)
                    }}
                    min={todayStr()} size="lg" />
                </div>
                {!form.start_date || !form.end_date ? (
                  <div className="flex-1 flex flex-col items-center justify-center border-t border-gray-100 dark:border-gray-700 pt-8">
                    <div className="w-20 h-20 rounded-2xl bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center mx-auto mb-5">
                      <i className="bx bx-calendar text-4xl text-brand-300 dark:text-brand-600"></i>
                    </div>
                    <p className="text-gray-400 dark:text-gray-500 text-base">กรุณาเลือกวันที่ต้องการใช้งาน</p>
                    <p className="text-gray-300 dark:text-gray-600 text-sm mt-1">เลือกวันที่เริ่มต้นและสิ้นสุดเพื่อดูรายการรถที่ว่าง</p>
                  </div>
                ) : availableCars.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-6">ไม่พบรถที่ว่างในวันที่เลือก</div>
                ) : (
                  <>
                    <div className="border-t border-gray-100 dark:border-gray-700 pt-6" />
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
                      {availableCars.map(car => (
                        <button key={car.id} type="button" onClick={() => { updateForm('car_id', car.id); setShowBookingModal(true) }}
                          className={`text-left bg-white dark:bg-gray-800/80 rounded-2xl border-2 p-5 transition-all duration-200 hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-black/30 hover:-translate-y-0.5 ${
                            form.car_id === car.id ? 'border-brand-400 shadow-md shadow-brand-100/50' : 'border-gray-100 dark:border-gray-700 hover:border-brand-200 dark:hover:border-brand-700'
                          }`}>
                          <div className="flex items-center gap-4 mb-3">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
                              form.car_id === car.id ? 'bg-brand-500 text-white' : 'bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/50 dark:to-brand-800/50 text-brand-700 dark:text-brand-300'
                            }`}>
                              {car.brand?.charAt(0)}{car.model?.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-gray-900 dark:text-white truncate">{car.brand} {car.model}</div>
                              <div className="text-xs text-gray-400 truncate">{car.license_plate}</div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-50 dark:bg-gray-700/50">{car.seats} ที่นั่ง</span>
                            {car.color && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-50 dark:bg-gray-700/50">{car.color}</span>}
                            {car.year && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-50 dark:bg-gray-700/50">{car.year}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
          )}

          {activeTab === 'calendar' && (
          <section className="mb-16 animate-fade-in">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold font-heading text-gray-900 dark:text-white">ปฏิทินจองยานพาหนะ</h2>
              <p className="text-gray-500 dark:text-gray-400 mt-1">ดูภาพรวมการจองยานพาหนะ</p>
            </div>
            <CalendarPage publicMode onDateClick={(dateStr, carId) => { updateForm('start_date', dateStr); setShowBookingModal(true) }} refreshKey={calendarRefreshKey} />
          </section>
          )}

          {activeTab === 'lookup' && (
          <section className="mb-16 motion-safe:animate-fade-in">
            <div className="text-center mb-8">
               <h2 className="text-2xl font-bold font-heading text-gray-900 dark:text-white">ติดตามสถานะและประวัติการจอง</h2>
               <p className="text-gray-500 dark:text-gray-400 mt-1">ค้นหาสถานะการจองด้วยชื่อหรือเบอร์โทรศัพท์</p>

            </div>
            <div className="max-w-2xl mx-auto">
              <form onSubmit={handleLookup} className="bg-white dark:bg-gray-800/80 rounded-2xl shadow-xl shadow-gray-200/50 dark:shadow-gray-950/50 border border-gray-100 dark:border-gray-700 p-6 mb-4">
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">ชื่อ / เบอร์โทรศัพท์ / เลขบัตรประชาชน</label>
                  <div className="relative">
                    <i className="bx bx-search absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-gray-400"></i>
                    <input value={lookupQuery} onChange={e => setLookupQuery(e.target.value)}
                      className="w-full h-11 pl-10 pr-4 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all duration-200"
                      placeholder="ชื่อ, เบอร์โทรศัพท์ หรือเลขบัตรประชาชน" />
                  </div>
                </div>
                <button type="submit" disabled={lookupLoading || !lookupQuery}
                  className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-500 hover:to-brand-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md">
                  {lookupLoading ? (
                    <i className="bx bx-loader-alt text-base animate-spin"></i>
                  ) : (
                    <i className="bx bx-search text-base"></i>
                  )}
                  <span>{lookupLoading ? 'กำลังค้นหา...' : 'ค้นหา'}</span>
                </button>
              </form>

              {lookupResult && (
                <div className="bg-white dark:bg-gray-800/80 rounded-2xl shadow-xl shadow-gray-200/50 dark:shadow-gray-950/50 border border-gray-100 dark:border-gray-700 p-6 motion-safe:animate-slide-up-fade">
                  {lookupResult.bookings.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 motion-safe:animate-fade-in">ไม่พบรายการจอง</div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">พบ {lookupResult.bookings.length} รายการ{lookupResult.users?.length > 0 && <> ({lookupResult.users.map(u => u.name).join(', ')})</>}</p>
                      {lookupResult.bookings.map((b, i) => (
                        <div key={b.id} className="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-gray-700/40 motion-safe:animate-slide-up-fade" style={{ animationDelay: `${i * 60}ms` }}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/50 dark:to-brand-800/50 flex items-center justify-center text-brand-700 dark:text-brand-300 text-xs font-bold shrink-0">
                              {b.brand?.charAt(0)}{b.model?.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{b.brand} {b.model}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{b.license_plate}</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500">{b.start_date} → {b.end_date}</p>
                            </div>
                          </div>
                          <span className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full ml-3"
                            style={{
                              backgroundColor: (STATUS_COLORS[b.status] || '#6b7280') + '20',
                              color: STATUS_COLORS[b.status] || '#6b7280',
                            }}>
                            {statusLabel(b.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
          )}

          {/* Booking Modal */}
          {showBookingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { if (!success) setShowBookingModal(false) }}>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 p-4 sm:p-6 animate-scale-in"
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">จองรถ</h2>
                <button onClick={() => { if (!loading) { setShowBookingModal(false); setSuccess(false); setError('') } }}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200">
                  <i className="bx bx-x text-xl"></i>
                </button>
              </div>
              {success ? (
                <div className="text-center py-12 animate-fade-in">
                  <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-6 animate-scale-in">
                    <i className="bx bx-check-circle text-4xl text-emerald-600 dark:text-emerald-400"></i>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">ส่งคำขอยืมเรียบร้อย</h2>
                  <p className="text-gray-500 dark:text-gray-400 mb-8">รอการอนุมัติจากผู้ดูแลระบบ</p>
                    <button onClick={() => { setShowBookingModal(false); setSuccess(false); setForm({ user_id: '', car_id: '', start_date: '', end_date: '', purpose: '' }) }}
                    className="h-11 px-6 inline-flex items-center gap-2 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-all duration-200 shadow-md shadow-brand-200/50">
                    ปิด
                  </button>
                </div>
              ) : (
                <form onSubmit={submitBooking} className="space-y-5">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">ชื่อผู้ยืม</label>
                      <UserSelect value={form.user_id} onChange={v => updateForm('user_id', v)} options={users} />
                    </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">เลือกยานพาหนะ</label>
                    <CarSelect value={form.car_id} onChange={v => updateForm('car_id', v)} options={availableCars.filter(c => c.status === 'available')} />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">วันที่เริ่มต้น</label>
                      <DatePicker value={form.start_date} onChange={v => updateForm('start_date', v)} min={todayStr()} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">วันที่สิ้นสุด</label>
                      <DatePicker value={form.end_date} onChange={v => updateForm('end_date', v)} min={form.start_date || todayStr()} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">เหตุผลการยืม</label>
                    <textarea value={form.purpose} onChange={e => updateForm('purpose', e.target.value)}
                      className="w-full h-24 px-4 py-3 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all duration-200 resize-none"
                      placeholder="ระบุวัตถุประสงค์การใช้งาน..." />
                  </div>

                  {error && (
                    <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2">
                      <i className="bx bx-error-circle text-base shrink-0"></i>
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={loading}
                    className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-500 hover:to-brand-600 active:from-brand-700 active:to-brand-800 shadow-lg shadow-brand-300/40 hover:shadow-xl hover:shadow-brand-400/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
                    {loading && (
                      <i className="bx bx-loader-alt text-base animate-spin"></i>
                    )}
                    <span>{loading ? 'กำลังส่ง...' : 'ส่งคำขอยืม'}</span>
                  </button>
                </form>
              )}
            </div>
          </div>
          )}

        </div>
      </main>
    </div>
  )
}
