import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { STATUS_COLORS, statusLabel, todayStr } from '../lib/constants'
import { BookingModal } from '../components/BookingModal'
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
  const [FullCal, setFullCal] = useState(null)
  const [plugins, setPlugins] = useState([])
  const [locale, setLocale] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [events, setEvents] = useState([])
  const [rawBookings, setRawBookings] = useState([])
  const [cars, setCars] = useState([])
  const [bookingOpen, setBookingOpen] = useState(false)
  const [bookingDate, setBookingDate] = useState('')
  const [bookingCarId, setBookingCarId] = useState(null)
  const [detailBooking, setDetailBooking] = useState(null)
  const [rejectModal, setRejectModal] = useState({ open: false, reason: '' })
  const [viewMode, setViewMode] = useState('week')
  const [viewDate, setViewDate] = useState(new Date())
  const calendarRef = useRef(null)
  const weekContainerRef = useRef(null)
  const fcContainerRef = useRef(null)
  const [calHeight, setCalHeight] = useState(600)

  useEffect(() => {
    if (viewMode !== 'month' || !fcContainerRef.current) return
    const el = fcContainerRef.current
    const ro = new ResizeObserver(([entry]) => {
      const h = Math.floor(entry.contentRect.height)
      if (h > 0) setCalHeight(h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [viewMode, loaded])

  useEffect(() => {
    Promise.all([
      import('@fullcalendar/react'),
      import('@fullcalendar/daygrid'),
      import('@fullcalendar/interaction'),
      import('@fullcalendar/core/locales/th'),
    ]).then(([fc, dg, ip, th]) => {
      setFullCal(() => fc.default)
      setPlugins([dg.default, ip.default])
      setLocale(() => th.default)
      setLoaded(true)
    })
  }, [])

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

  async function fetchData() {
    try {
      const carsUrl = publicMode ? '/api/public/cars' : '/api/cars'
      const calendarUrl = publicMode ? '/api/public/calendar' : '/api/bookings/calendar'
      const headers = publicMode ? {} : authHeaders()
      const [carsRes, bookingsRes] = await Promise.all([
        fetch(carsUrl, { headers }),
        fetch(calendarUrl, { headers }),
      ])
      if (carsRes.ok) {
        const d = await carsRes.json()
        setCars(d.cars)
      }
      if (bookingsRes.ok) {
        const d = await bookingsRes.json()
        setRawBookings(d.bookings)
        setEvents(d.bookings.map(b => {
          const endDate = new Date(b.end_date)
          endDate.setDate(endDate.getDate() + 1)
          const USER_PALETTE = ['#2563eb','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16','#3b82f6','#d946ef','#22c55e','#eab308','#0ea5e9','#a855f7','#fb923c','#2dd4bf','#f472b6','#38bdf8']
          const eventColor = publicMode
            ? USER_PALETTE[b.user_id % USER_PALETTE.length]
            : STATUS_COLORS[b.status] || '#6b7280'
          return {
            id: String(b.id),
            title: `${b.brand} ${b.model} - ${b.user_name}`,
            start: b.start_date,
            end: endDate.toLocaleDateString('en-CA'),
            allDay: true,
            backgroundColor: eventColor,
            borderColor: eventColor,
            textColor: '#ffffff',
          }
        }))
      }
    } catch (e) {
      console.error(e)
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

  function handleDatesSet(arg) {
    setViewDate(arg.view.currentStart)
  }

  function handlePrev() {
    if (viewMode === 'month' && calendarRef.current) {
      calendarRef.current.getApi().prev()
    } else if (viewMode === 'week') {
      const d = new Date(viewDate)
      d.setDate(d.getDate() - 7)
      setViewDate(d)
    }
  }

  function handleNext() {
    if (viewMode === 'month' && calendarRef.current) {
      calendarRef.current.getApi().next()
    } else if (viewMode === 'week') {
      const d = new Date(viewDate)
      d.setDate(d.getDate() + 7)
      setViewDate(d)
    }
  }

  function handleToday() {
    if (viewMode === 'month' && calendarRef.current) {
      calendarRef.current.getApi().today()
    } else if (viewMode === 'week') {
      setViewDate(new Date())
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

  function bookingBarColor(status, userId) {
    if (publicMode && userId) {
      const colors = ['#2563eb','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16','#3b82f6','#d946ef','#22c55e','#eab308','#0ea5e9','#a855f7','#fb923c','#2dd4bf','#f472b6','#38bdf8']
      return colors[userId % colors.length]
    }
    return STATUS_COLORS[status] || '#6b7280'
  }

  async function adminApprove(id) {
    await fetch(`/api/admin/bookings/${id}/approve`, { method: 'PUT', headers: authHeaders() })
    fetchData()
    fetchNotificationCount()
    setDetailBooking(null)
  }

  async function adminReject() {
    await fetch(`/api/admin/bookings/${detailBooking.id}/reject`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_notes: rejectModal.reason }),
    })
    setRejectModal({ open: false, reason: '' })
    fetchData()
    fetchNotificationCount()
    setDetailBooking(null)
  }

  async function adminReturn(id) {
    await fetch(`/api/admin/bookings/${id}/return`, { method: 'PUT', headers: authHeaders() })
    fetchData()
    fetchNotificationCount()
    setDetailBooking(null)
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 px-3 sm:px-6 py-2 sm:py-4 border-b border-neutral-100 dark:border-gray-700 shrink-0">
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
          {viewMode === 'week' && weekDays.length > 0 && (
            <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-neutral-400">
              <span>{visibleCars.length} คัน</span>
              <span className="w-1 h-1 rounded-full bg-neutral-300" />
              <span>{rawBookings.length} การจอง</span>
            </div>
          )}
        </div>

        {viewMode === 'month' && (!loaded || !FullCal ? (
          <div className="flex items-center justify-center flex-1">
            <i className="bx bx-loader-alt text-3xl animate-spin text-brand-600"></i>
          </div>
        ) : (
          <div ref={fcContainerRef} className="fc-custom p-3 sm:p-4 flex flex-col flex-1 min-h-0 month-view-enter">
            <FullCal
              ref={calendarRef}
              plugins={plugins}
              initialView="dayGridMonth"
              firstDay={1}
              locale={locale}
              height={Math.max(300, calHeight)}
              expandRows={true}
              dayMaxEvents={false}
              headerToolbar={false}
              events={events}
              datesSet={handleDatesSet}
              dateClick={(info) => openBooking(info.dateStr, null)}
              eventClick={(info) => {
                const b = rawBookings.find(r => String(r.id) === info.event.id)
                if (b) setDetailBooking(b)
              }}
              fixedWeekCount={false}
            />
          </div>
        ))}

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
                            return (
                              <div key={b.id}
                                onClick={() => setDetailBooking(b)}
                                className="absolute rounded flex items-center justify-between px-2 cursor-pointer transition-all overflow-hidden z-20 border border-white/20 week-booking-bar"
                                style={{
                                  '--delay': `${bi * 0.08}s`,
                                  left: b.barLeftPct + '%',
                                  width: Math.max(0.5, b.barWidthPct) + '%',
                                  top: maxTracks > 1 ? `calc(${b.track} * ((100% - ${gapPx}px) / ${maxTracks}) + 2px)` : '2px',
                                  height: maxTracks > 1 ? `calc((100% - ${gapPx}px) / ${maxTracks})` : 'calc(100% - 4px)',
                                  backgroundColor: bgColor,
                                }}>
                                <span className="truncate text-xs font-medium text-white drop-shadow-sm">{b.user_name}</span>
                                <span className="shrink-0 text-[9px] font-medium text-white/80 ml-1">{statusLabel(b.status)}</span>
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

      {detailBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setDetailBooking(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-neutral-200 dark:border-gray-700 w-full max-w-sm overflow-hidden animate-fade-in"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 dark:border-gray-700">
              <h3 className="font-bold text-neutral-800 dark:text-white text-base">รายละเอียดการจอง</h3>
              <button onClick={() => setDetailBooking(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-400 hover:bg-neutral-100 dark:hover:bg-gray-700 hover:text-neutral-600 transition-colors">
                <i className="bx bx-x text-base"></i>
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900 flex items-center justify-center text-brand-600 dark:text-brand-300 shrink-0">
                  <i className="bx bx-calendar text-xl"></i>
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-neutral-800 dark:text-white truncate">{detailBooking.brand} {detailBooking.model}</div>
                  <div className="text-xs text-neutral-500 dark:text-gray-400 truncate">{detailBooking.license_plate}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-gray-300">
                <i className="bx bx-user text-base text-neutral-400 shrink-0"></i>
                <span className="truncate">{detailBooking.user_name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-gray-300">
                <i className="bx bx-calendar text-base text-neutral-400 shrink-0"></i>
                <span>{new Date(detailBooking.start_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span className="text-neutral-300 dark:text-gray-600">→</span>
                <span>{new Date(detailBooking.end_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              {detailBooking.purpose && (
                <div className="text-sm text-neutral-600 dark:text-gray-300 bg-neutral-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                  <span className="text-neutral-400 text-xs block mb-0.5">วัตถุประสงค์</span>
                  {detailBooking.purpose}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-neutral-100 dark:border-gray-700">              {canManageBookings && detailBooking.status === 'pending' ? (
                <div className="flex gap-2">
                  <button onClick={() => adminApprove(detailBooking.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 h-9 text-xs font-semibold rounded-lg text-white bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 transition-colors">
                    <i className="bx bx-check text-sm"></i>
                    อนุมัติ
                  </button>
                  <button onClick={() => setRejectModal({ open: true, reason: '' })}
                    className="flex-1 flex items-center justify-center gap-1.5 h-9 text-xs font-semibold rounded-lg text-white bg-rose-500 hover:bg-rose-600 active:bg-rose-700 transition-colors">
                    <i className="bx bx-x text-sm"></i>
                    ปฏิเสธ
                  </button>
                </div>
              ) : canManageBookings && detailBooking.status === 'approved' ? (
                <button onClick={() => adminReturn(detailBooking.id)}
                  className="w-full flex items-center justify-center gap-1.5 h-9 text-xs font-semibold rounded-lg text-white bg-blue-500 hover:bg-blue-600 active:bg-blue-700 transition-colors">
                  <i className="bx bx-refresh text-sm"></i>
                  คืนรถ
                </button>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{
                      backgroundColor: (STATUS_COLORS[detailBooking.status] || '#6b7280') + '20',
                      color: STATUS_COLORS[detailBooking.status] || '#6b7280',
                    }}>
                    {statusLabel(detailBooking.status)}
                  </span>
                  <button onClick={() => setDetailBooking(null)}
                    className="text-xs font-semibold text-neutral-400 hover:text-neutral-600 dark:hover:text-gray-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-gray-700">
                    ปิด
                  </button>
                </div>
              )}
            </div>
            {!publicMode && detailBooking.admin_notes && (
              <div className="px-5 pb-3 -mt-1">
                <span className="text-[10px] text-neutral-400">หมายเหตุ: {detailBooking.admin_notes}</span>
              </div>
            )}
          </div>
        </div>
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
