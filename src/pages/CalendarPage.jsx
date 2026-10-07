import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { apiGet, invalidateApi } from '../lib/apiCache'
import { STATUS_COLORS, statusLabel, todayStr } from '../lib/constants'
import { BookingModal } from '../components/BookingModal'
import BookingDetailModal from '../components/BookingDetailModal'
import { Toast } from '../components/ui/toast'
import { CalendarMonthGrid } from '../components/CalendarMonthGrid'
import { Skeleton } from '../components/ui/skeleton'
import '../styles/calendar-overrides.css'

const THAI_MONTHS = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const DAY_HEADERS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

function getMonday(d) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function fmtThai(d) {
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CalendarPage({ publicMode, onDateClick, embedded }) {
  const { authHeaders, isAdmin, fetchNotificationCount } = useApp()
  const canManageBookings = isAdmin && !publicMode
  const [rawBookings, setRawBookings] = useState([])
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [bookingDate, setBookingDate] = useState('')
  const [bookingCarId, setBookingCarId] = useState(null)
  const [detailBooking, setDetailBooking] = useState(null)
  const [rejectModal, setRejectModal] = useState({ open: false, reason: '' })
  const [toast, setToast] = useState(null)
  const [viewMode, setViewMode] = useState('week')
  const [viewDate, setViewDate] = useState(new Date())
  const weekContainerRef = useRef(null)

  useEffect(() => {
    fetchData()
  }, [])

  const weekDays = useMemo(() => {
    if (viewMode !== 'week') return []
    const start = getMonday(viewDate)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const arr = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      const dateStr = d.toLocaleDateString('en-CA')
      arr.push({
        day: d.getDate(),
        dayOfWeek: d.getDay(),
        dateStr,
        isToday: d.getTime() === today.getTime(),
        month: d.getMonth(),
        year: d.getFullYear(),
      })
    }
    return arr
  }, [viewMode, viewDate])

  const weekStart = weekDays.length > 0 ? new Date(weekDays[0].dateStr) : null
  const weekEnd = weekDays.length > 0 ? new Date(weekDays[6].dateStr) : null
  if (weekEnd) weekEnd.setHours(23, 59, 59, 999)

  const carBookingBars = useMemo(() => {
    if (!weekDays.length || !weekStart || !weekEnd) return {}
    const map = {}
    for (const car of cars) {
      let bars = rawBookings
        .filter(b => {
          if (b.car_id !== car.id) return false
          const inD = new Date(b.start_date)
          const outD = new Date(b.end_date)
          return inD <= weekEnd && outD >= weekStart
        })
        .map(b => {
          const inD = new Date(b.start_date)
          const outD = new Date(b.end_date)
          let barStart = Math.round((inD - weekStart) / 86400000)
          let barEnd = Math.round((outD - weekStart) / 86400000)
          if (barStart < 0) barStart = 0
          if (barEnd > 6) barEnd = 6
          return {
            ...b,
            barStart,
            barEnd,
            barLeftPct: (barStart / 7) * 100,
            barWidthPct: ((barEnd - barStart + 1) / 7) * 100,
            track: 0,
            totalTracks: 1,
          }
        })
      if (bars.length > 1) {
        const sorted = [...bars].sort((a, b) => a.barStart - b.barStart)
        const tracks = []
        for (const b of sorted) {
          let placed = false
          for (let t = 0; t < tracks.length; t++) {
            if (tracks[t] < b.barStart) {
              tracks[t] = b.barEnd
              b.track = t
              placed = true
              break
            }
          }
          if (!placed) {
            tracks.push(b.barEnd)
            b.track = tracks.length - 1
          }
        }
        for (const b of bars) b.totalTracks = tracks.length
      }
      if (bars.length > 0) map[car.id] = bars
    }
    return map
  }, [weekDays, weekStart, weekEnd, cars, rawBookings])

  const visibleCars = viewMode === 'week'
    ? cars.filter(c => carBookingBars[c.id] || c.status === 'available')
    : []

  async function fetchData(force = false) {
    try {
      const carsUrl = publicMode ? '/api/public/cars' : '/api/cars'
      const calendarUrl = publicMode ? '/api/public/calendar' : '/api/bookings/calendar'
      const headers = publicMode ? {} : authHeaders()
      const [carsRes, bookingsRes] = await Promise.all([
        apiGet(carsUrl, { headers, force }),
        apiGet(calendarUrl, { headers, force }),
      ])
      if (carsRes.ok) {
        setCars(carsRes.data.cars)
      }
      if (bookingsRes.ok) {
        setRawBookings(bookingsRes.data.bookings)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const viewTitle = useMemo(() => {
    if (viewMode === 'week' && weekDays.length > 0) {
      const start = new Date(weekDays[0].dateStr)
      const end = new Date(weekDays[6].dateStr)
      if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
        return `${start.getDate()} - ${fmtThai(end)}`
      }
      return `${fmtThai(start)} - ${fmtThai(end)}`
    }
    if (viewMode === 'month') {
      return `${THAI_MONTHS[viewDate.getMonth() + 1]} ${viewDate.getFullYear() + 543}`
    }
    return ''
  }, [viewMode, weekDays, viewDate])

  function handlePrev() {
    if (viewMode === 'month') {
      const d = new Date(viewDate)
      d.setDate(1) // anchor to day 1 so setMonth doesn't skip months at month-end boundaries
      d.setMonth(d.getMonth() - 1)
      setViewDate(d)
    } else if (viewMode === 'week') {
      const d = new Date(viewDate)
      d.setDate(d.getDate() - 7)
      setViewDate(d)
    }
  }

  function handleNext() {
    if (viewMode === 'month') {
      const d = new Date(viewDate)
      d.setDate(1)
      d.setMonth(d.getMonth() + 1)
      setViewDate(d)
    } else if (viewMode === 'week') {
      const d = new Date(viewDate)
      d.setDate(d.getDate() + 7)
      setViewDate(d)
    }
  }

  function switchView(mode) {
    setViewMode(mode)
    if (mode === 'week') setViewDate(new Date())
  }

  function openBooking(dateStr, carId) {
    if (publicMode) {
      if (onDateClick) onDateClick(dateStr, carId)
      return
    }
    setBookingDate(dateStr)
    setBookingCarId(carId)
    setBookingOpen(true)
  }

  // Bar bg color policy: a PER-USER deterministic hash picks one of 16
  // distinguishable PASTEL hues (userId % 16 keeps the same color across
  // all of one user's bookings). The bar bg therefore encodes "WHO owns
  // the booking", while the left stripe + trailing badge on each bar
  // encode "WHAT status the booking is in" via STATUS_COLORS[status].
  // Decoupling those two channels lets the badge/stripe be visually
  // distinct from the bar bg WITHOUT requiring the previous inset-ring
  // / 8px-glow workarounds for "same-color same-hue" clashes. Per user
  // feedback: "ปรับระบบการสุ่มสี bar มาไม่ให้ใช้สีเดียวกันกับสีของ badge
  // ที่มีอยู่ตอนนี้" / "ขอ bar เป็น pastel color" — the pre-existing
  // random palette was scoped to publicMode only; we now apply it across
  // admin + public alike AND use soft pastel rather than fully-saturated
  // hues. Falls back to status color (then neutral gray) only when
  // userId is missing — e.g. legacy rows or test fixtures without a
  // user reference.
  function bookingBarColor(status, userId) {
    if (userId) {
      // Curated 16-color PASTEL palette (Tailwind 300-400 levels). The
      // previous saturated palette had EXACT hex matches against
      // STATUS_COLORS at index 1 (#f59e0b amber = STATUS_COLORS.pending)
      // and index 2 (#10b981 emerald = STATUS_COLORS.approved), so
      // user_id=2 (= สมชาย in seed data) with an approved booking
      // rendered as uniform green. The user reported "ยังเห็นเป็นสี
      // เขียวอยู่" — that exact-hue collision was the cause. Pastel
      // hexes are inherently lighter (lightness 70-85%) so they don't
      // share the perceptual identity of fully-saturated status colors
      // even within the same hue family — e.g. pink-400 #f472b6 reads
      // as soft rose vs rejected red #ef4444 which reads as hot
      // crimson. White label text contrast is preserved via a stronger
      // textShadow (replacing drop-shadow-sm on label spans), since
      // drop-shadow is too subtle on light pastel backgrounds.
      const colors = [
        '#f472b6', // pink-400 (pastel)
        '#e879f9', // fuchsia-400 (pastel)
        '#a78bfa', // violet-400 (pastel)
        '#c084fc', // purple-400 (pastel)
        '#c4b5fd', // violet-300 (light pastel)
        '#f0abfc', // fuchsia-300 (light pastel)
        '#fda4af', // rose-300 (light pastel — visually distinct from saturated rejected)
        '#bef264', // lime-400 (pastel — distinct hue from emerald 160°)
        '#67e8f9', // cyan-300 (pastel — distinct hue from emerald+blue)
        '#22d3ee', // cyan-400 (pastel)
        '#a5f3fc', // cyan-200 (very light cyan — kept for variety)
        '#7dd3fc', // sky-300 (light pastel — distant from blue 217°)
        '#fb7185', // rose-400 (replaces ultra-light violet-200)
        '#d8b4fe', // purple-300 (light pastel)
        '#fdba74', // orange-300 (light pastel accent — replaces pale pink-100)
        '#fb923c', // orange-400 (pastel orange — distinct from saturated pending amber)
      ]
      // userId arrives as a string (ObjectId from the API). Coerce to a
      // numeric hash so the modulo picks a stable pastel per user.
      const hash = userId.split('').reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 0)
      return colors[Math.abs(hash) % colors.length]
    }
    return STATUS_COLORS[status] || '#6b7280'
  }

  async function adminApprove(id) {
    const res = await fetch(`/api/admin/bookings/${id}/approve`, { method: 'PUT', headers: authHeaders() })
    if (!res.ok) {
      const d = await res.json().catch(() => ({ error: 'เกิดข้อผิดพลาด' }))
      setToast({ type: 'error', submessage: d.error || 'อนุมัติไม่สำเร็จ' })
      return
    }
    invalidateApi()
    fetchData(true)
    fetchNotificationCount()
    setDetailBooking(null)
  }

  async function adminReject() {
    const res = await fetch(`/api/admin/bookings/${detailBooking.id}/reject`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_notes: rejectModal.reason }),
    })
    setRejectModal({ open: false, reason: '' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({ error: 'เกิดข้อผิดพลาด' }))
      setToast({ type: 'error', submessage: d.error || 'ปฏิเสธไม่สำเร็จ' })
      return
    }
    invalidateApi()
    fetchData(true)
    fetchNotificationCount()
    setDetailBooking(null)
  }

  async function adminReturn(id) {
    const res = await fetch(`/api/admin/bookings/${id}/return`, { method: 'PUT', headers: authHeaders() })
    if (!res.ok) {
      const d = await res.json().catch(() => ({ error: 'เกิดข้อผิดพลาด' }))
      setToast({ type: 'error', submessage: d.error || 'คืนรถไม่สำเร็จ' })
      return
    }
    invalidateApi()
    fetchData(true)
    fetchNotificationCount()
    setDetailBooking(null)
  }

  if (loading) {
    return (
      <div className="animate-fade-in flex flex-col h-full">
        <div className="mb-6">
          <Skeleton className="h-7 w-40 rounded-lg" />
          <Skeleton className="h-4 w-56 mt-2.5" />
        </div>
        <div className="card p-4 flex-1">
          <div className="grid grid-cols-7 gap-2 mb-4">
            {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-4" />)}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-32 rounded-lg shrink-0" />
                <Skeleton className="h-10 flex-1 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in flex flex-col h-full">
      {!embedded && (
      <div className={`flex flex-row items-center justify-between gap-2 sm:gap-3 shrink-0 ${publicMode ? 'mb-1' : 'mb-4 sm:mb-10'}`}>
        <div className="min-w-0">
          {!publicMode && <h1 className="text-lg sm:text-3xl font-bold text-neutral-800 dark:text-white tracking-tight font-heading truncate">ปฏิทินการจอง</h1>}
          {!publicMode && <p className="text-[10px] sm:text-sm text-neutral-500 dark:text-gray-400 mt-0 sm:mt-1.5">ภาพรวมการใช้งานยานพาหนะ</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!publicMode && (
          <button onClick={() => openBooking(todayStr(), null)}
            className="inline-flex items-center justify-center gap-1.5 sm:gap-2 h-9 sm:h-10 px-3 sm:px-5 text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl text-white bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 active:from-brand-600 active:to-brand-700 shadow-md shadow-brand-200/50 hover:shadow-lg hover:shadow-brand-300/40 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2">
            <i className="bx bx-plus text-sm sm:text-base"></i>
            <span className="hidden sm:inline">จองรถ</span>
          </button>
          )}
        </div>
      </div>
      )}

      <div className="card overflow-hidden flex flex-col flex-1">
        {/* Header bar — `justify-between` removed: prior layout pushed
            a "X คัน • Y การจอง" counter block to the right. With that
            counter gone (per user feedback "ใน week view ไม่ต้องใส่
            ข้อความบอก 8 คัน 7 การจอง ที่ด้านบนมุมขวามา") the right
            cluster is empty on both week and month views, so the
            justify rule is now a no-op. Left cluster (nav arrows +
            title + seg-week/seg-month toggle) sits at flex-start
            identical to before — no visual change, just dead-code
            cleanup. */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 sm:px-6 py-2 sm:py-4 border-b border-neutral-100 dark:border-gray-700 shrink-0">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
            <div className="flex items-center gap-0.5 sm:gap-1">
              <button onClick={handlePrev}
                className="h-7 w-7 sm:h-9 sm:w-9 rounded-lg sm:rounded-xl border border-neutral-200 dark:border-gray-600 flex items-center justify-center text-neutral-500 dark:text-gray-400 hover:bg-neutral-100 dark:hover:bg-gray-700 hover:text-neutral-700 dark:hover:text-gray-200 active:bg-neutral-200 transition-all">
                <i className="bx bx-chevron-left text-xs sm:text-sm"></i>
              </button>
              <h2 className="text-xs sm:text-base font-bold text-neutral-800 dark:text-white min-w-[100px] sm:min-w-[160px] text-center select-none leading-tight">
                {viewTitle}
              </h2>
              <button onClick={handleNext}
                className="h-7 w-7 sm:h-9 sm:w-9 rounded-lg sm:rounded-xl border border-neutral-200 dark:border-gray-600 flex items-center justify-center text-neutral-500 dark:text-gray-400 hover:bg-neutral-100 dark:hover:bg-gray-700 hover:text-neutral-700 dark:hover:text-gray-200 active:bg-neutral-200 transition-all">
                <i className="bx bx-chevron-right text-xs sm:text-sm"></i>
              </button>
            </div>
            <div className="flex rounded-lg sm:rounded-xl border border-neutral-200 dark:border-gray-600 overflow-hidden">
              <button onClick={() => switchView('week')}
                className={`px-2 sm:px-3 h-7 sm:h-9 text-[10px] sm:text-xs font-semibold transition-all ${viewMode === 'week' ? 'bg-brand-600 text-white shadow-sm' : 'text-neutral-500 dark:text-gray-400 hover:bg-neutral-50 dark:hover:bg-gray-700'}`}>
                สัปดาห์
              </button>
              <button onClick={() => switchView('month')}
                className={`px-2 sm:px-3 h-7 sm:h-9 text-[10px] sm:text-xs font-semibold transition-all ${viewMode === 'month' ? 'bg-brand-600 text-white shadow-sm' : 'text-neutral-500 dark:text-gray-400 hover:bg-neutral-50 dark:hover:bg-gray-700'}`}>
                เดือน
              </button>
            </div>
          </div>
          {/* Counter block ("X คัน • Y การจอง") removed per user
              feedback — admin counts visible from row labels +
              bars themselves. visibleCars/rawBookings state still
              computed; only the human-facing display is gone. */}
        </div>

        {viewMode === 'month' && (
          <div className="p-2 sm:p-3 flex-1 min-h-0 flex">
            <CalendarMonthGrid
              viewDate={viewDate}
              rawBookings={rawBookings}
              bookingBarColor={bookingBarColor}
              statusLabel={statusLabel}
              onCellClick={openBooking}
              onBarClick={(b) => setDetailBooking(prev => (prev && prev.id === b.id ? prev : b))}
            />
          </div>
        )}

        {viewMode === 'week' && (
          <div ref={weekContainerRef} className="overflow-x-auto flex-1 min-h-[400px] flex flex-col week-view-enter">
            {visibleCars.length === 0 ? (
              <div className="text-center py-16 px-4">
                <i className="bx bx-calendar text-4xl mx-auto mb-3 text-neutral-300"></i>
                <h3 className="text-base font-semibold text-neutral-700 dark:text-gray-300 mb-1">ไม่มีรถยนต์</h3>
                <p className="text-sm text-neutral-400">กรุณาเพิ่มรถยนต์ก่อน</p>
              </div>
            ) : (
              <>
                <div className="min-w-0 flex flex-col flex-1">
                  <div className="grid shrink-0" style={{ gridTemplateColumns: `clamp(90px, 18vw, 180px) repeat(7, 1fr)` }}>
                    <div className="sticky left-0 z-10 bg-white dark:bg-gray-800 px-2 sm:px-3 py-3 border-b border-r border-neutral-100/30 dark:border-gray-700/30 text-[10px] sm:text-xs font-semibold text-neutral-500">
                      รถยนต์
                    </div>
                    {weekDays.map((d, i) => (
                      <div key={d.dateStr} style={{ '--delay': `${i * 0.04}s` }}
                        className={`px-0.5 sm:px-1 py-2 sm:py-3 border-b border-r border-neutral-100/30 dark:border-gray-700/30 text-center font-medium transition-colors week-day-header ${
                          d.isToday ? 'bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300 font-bold' : 'text-neutral-500 dark:text-gray-400'
                        } ${d.dayOfWeek === 0 ? 'text-rose-400' : ''}`}>
                        <div className="text-xs sm:text-base">{d.day}</div>
                        <div className="text-[8px] sm:text-[10px] opacity-60">{DAY_HEADERS[d.dayOfWeek]}</div>
                      </div>
                    ))}
                  </div>

                  {visibleCars.map((car, ci) => {
                    const bars = carBookingBars[car.id] || []
                    const maxTracks = Math.max(1, ...bars.map(b => b.totalTracks || 1))
                    return (
                      <div key={car.id} className="grid flex-1 min-h-[60px] sm:min-h-[80px] week-car-row" style={{ '--delay': `${ci * 0.05}s`, gridTemplateColumns: `clamp(90px, 18vw, 180px) repeat(7, 1fr)` }}>
                        <div className="sticky left-0 z-10 bg-white dark:bg-gray-800 px-2 sm:px-3 border-b border-r border-neutral-100/30 dark:border-gray-700/30 flex items-center h-full">
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-medium text-neutral-800 dark:text-gray-100 leading-tight">{car.brand} {car.model}</div>
                            <div className="text-[9px] sm:text-[10px] text-neutral-400 dark:text-gray-500 truncate">{car.license_plate}</div>
                          </div>
                        </div>
                        <div className="relative col-span-full h-full" style={{ gridColumn: '2 / 9' }}>
                          <div className="grid h-full" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
                            {weekDays.map(d => (
                              <div key={d.dateStr}
                                onClick={() => openBooking(d.dateStr, car.id)}
                                className={`border-b border-r border-neutral-100/30 dark:border-gray-700/30 transition-colors cursor-pointer hover:bg-brand-50/30 dark:hover:bg-brand-950/30 ${
                                  d.isToday ? 'bg-brand-50/40 dark:bg-brand-950/40' : ''
                                }`} />
                            ))}
                          </div>
                          {bars.map((b, bi) => {
                            const bgColor = bookingBarColor(b.status, b.user_id)
                            const gapPx = (maxTracks - 1) * 4
                            // Solid hex from STATUS_COLORS so admins can scan
                            // status visually at a glance across the row,
                            // independent of the (per-user pastel) bar bg.
                            // STATUS_COLORS lives in src/lib/constants.js and
                            // is the same map used by month-view's leading
                            // stripe + trailing badge + bookings table
                            // status chips — keeping the entire app's status
                            // palette identical. Fallback to the bar's own
                            // bgColor (then neutral gray) if a future status
                            // isn't registered in the map, so the stripe
                            // remains readable rather than disappearing.
                            // Solid hex from STATUS_COLORS so admins can scan
                            // status visually at a glance across the row,
                            // independent of the (per-user pastel) bar bg.
                            // Fallback is neutral gray ONLY — falling back
                            // to bgColor would re-introduce the exact
                            // same-color collision bug the user flagged
                            // previously ("ปรับระบบการสุ่มสี bar มาไม่ให้
                            // ใช้สีเดียวกันกับสีของ badge ที่มีอยู่ตอนนี้"):
                            // a stripe in the SAME hue as the bar fill
                            // loses its discriminator role. Gray is fine
                            // because the fallback path is unreachable for
                            // any status registered in STATUS_COLORS
                            // (pending/approved/rejected/cancelled/returned).
                            const statusColor = STATUS_COLORS[b.status] || '#6b7280'
                            return (
                              <div key={b.id}
                                onClick={() => setDetailBooking(prev => (prev && prev.id === b.id ? prev : b))}
                                className="absolute rounded flex items-center gap-1.5 px-2 cursor-pointer transition-all overflow-hidden z-20 border border-white/20 week-booking-bar"
                                style={{
                                  '--delay': `${bi * 0.08}s`,
                                  left: b.barLeftPct + '%',
                                  width: Math.max(0.5, b.barWidthPct) + '%',
                                  top: maxTracks > 1 ? `calc(${b.track} * ((100% - ${gapPx}px) / ${maxTracks}) + 2px)` : '2px',
                                  height: maxTracks > 1 ? `calc((100% - ${gapPx}px) / ${maxTracks})` : 'calc(100% - 4px)',
                                  backgroundColor: bgColor,
                                }}>
                                {/* HORIZONTAL-TOP STATUS ACCENT — mirrors the
                                    BookingDetailModal popup's pattern
                                    (`Status accent bar` in
                                    src/components/BookingDetailModal.jsx):
                                    a 3px-tall, full-width, solid-status-color
                                    stripe at the very top of the card.
                                    Chosen over the previous vertical-left
                                    stripe with 8px glow halo per user
                                    feedback "ถ้าเป็นแทบยาวแนวนอนไว้
                                    ด้านบนจะสวยกว่าไหม เหมือนแทบในหน้า
                                    popup รายละเอียดการจอง" — a horizontal
                                    top accent gives week-view bars + popup
                                    modal the SAME visual status vocabulary
                                    so admins see the same 3px color edge
                                    whether scanning the calendar or
                                    reviewing detail. No glow halo here
                                    because the popup modal also has none;
                                    the parity is the point. Renders as a
                                    positioned-absolute child of the bar
                                    (which itself is `position: absolute`,
                                    so it acts as the containing block) so
                                    the accent OVERLAYS the top without
                                    stealing 3px of flex content area. The
                                    bar's `rounded` + `overflow-hidden`
                                    clips the accent's top corners to the
                                    bar's border radius for visual cohesion
                                    (the accent doesn't need its own
                                    rounded-t utility since the parent
                                    already rounds + clips it).
                                    Solid STATUS_COLORS bg only (no
                                    boxShadow halo) — the previous 8px glow
                                    on the vertical-stripe design was the
                                    one piece that diverged from the popup
                                    pattern and the user explicitly wants
                                    the popup feel. Status word text on AT
                                    /keyboard is still anchored to the
                                    trailing badge below, plus the title
                                    attr surfaces the status word on
                                    hover for screen-reader fallback on
                                    cross-row end segments. Visible on ALL
                                    viewports including mobile (`block`,
                                    no `hidden sm:block`) so mobile parity
                                    with month view holds. */}
                                <div
                                  className="cal-week-bar-accent absolute top-0 left-0 right-0 h-[3px] block"
                                  style={{
                                    backgroundColor: statusColor,
                                  }}
                                  title={statusLabel(b.status)}
                                />
                                <span className="cal-bar-label min-w-0 truncate text-xs font-medium text-white flex-1">{b.user_name}</span>
                                {/* TRAILING STATUS WORD — desktop only. Hidden
                                    below sm (640px) because the top 3px
                                    status accent already encodes status via
                                    STATUS_COLORS[status], so the keyword is
                                    redundant on mobile. Mirrors month
                                    view's MOBILE-NO-BADGE decision (where
                                    the trailing colored chip is sr-only on
                                    mobile). On desktop, the accent AND the
                                    word give admins a dual-channel status
                                    cue (color + text) for accessibility +
                                    glance-readability. whitespace-nowrap
                                    keeps "อนุมัติแล้ว" on one line so the
                                    trailing right edge feels anchored. */}
                                <span className="cal-bar-label hidden sm:inline shrink-0 text-[9px] font-medium text-white/80 whitespace-nowrap">{statusLabel(b.status)}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="px-3 sm:px-6 py-2 sm:py-3 text-[10px] sm:text-xs text-neutral-400 border-t border-neutral-100/30 dark:border-gray-700/30 leading-relaxed">
                  คลิกแถบจองเพื่อดูรายละเอียด • คลิกช่องว่างเพื่อเพิ่มการจอง
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {!publicMode && (
      <BookingModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        initialDate={bookingDate}
        initialCarId={bookingCarId}
      />
      )}

      <BookingDetailModal
        booking={detailBooking}
        publicMode={!!publicMode}
        canManageBookings={canManageBookings}
        onClose={() => setDetailBooking(null)}
                onActionDone={() => { invalidateApi(); fetchData(true) }}
        setToast={setToast}
        onAdminApprove={(id) => adminApprove(id)}
        onOpenRejectModal={() => setRejectModal({ open: true, reason: '' })}
        onAdminReturn={(id) => adminReturn(id)}
      />

      {toast && (
        <Toast type={toast.type} submessage={toast.submessage} onClose={() => setToast(null)} />
      )}

      {rejectModal.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={() => setRejectModal({ open: false, reason: '' })}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-neutral-200 dark:border-gray-700 w-full max-w-sm overflow-hidden animate-fade-in"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-neutral-100 dark:border-gray-700">
              <h3 className="font-bold text-neutral-800 dark:text-white text-base">ปฏิเสธคำขอยืม</h3>
              <p className="text-xs text-neutral-500 mt-1">ระบุเหตุผลในการปฏิเสธ</p>
            </div>
            <div className="px-5 py-4">
              <textarea value={rejectModal.reason} onChange={e => setRejectModal({ ...rejectModal, reason: e.target.value })}
                className="w-full rounded-lg border border-neutral-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-neutral-800 dark:text-white placeholder-neutral-400 resize-none focus:outline-none focus:ring-2 focus:ring-brand-300 min-h-[80px]"
                placeholder="เหตุผล..." />
            </div>
            <div className="px-5 py-3 border-t border-neutral-100 dark:border-gray-700 flex gap-2">
              <button onClick={adminReject}
                className="flex-1 h-9 text-xs font-semibold rounded-lg text-white bg-rose-500 hover:bg-rose-600 transition-colors">
                ยืนยันปฏิเสธ
              </button>
              <button onClick={() => setRejectModal({ open: false, reason: '' })}
                className="flex-1 h-9 text-xs font-semibold rounded-lg text-neutral-500 bg-neutral-100 dark:bg-gray-700 hover:bg-neutral-200 dark:hover:bg-gray-600 transition-colors">
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
