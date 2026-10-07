import React, { useState, useEffect, useRef } from 'react'
import { Skeleton } from '../components/ui/skeleton'
import BookingDetailModal from '../components/BookingDetailModal'
import { Toast } from '../components/ui/toast'
import RangeDatePicker, { useIsMobile } from '../components/RangeDatePicker'

const CalendarPage = React.lazy(() => import('./CalendarPage'))

const STATUS_COLORS = { pending: '#f59e0b', approved: '#10b981', rejected: '#ef4444', returned: '#3b82f6' }

function statusLabel(s) {
  const m = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ', returned: 'คืนแล้ว' }
  return m[s] || s
}


function todayStr() {
  return new Date().toLocaleDateString('en-CA')
}

// `useIsMobile` is imported from RangeDatePicker — same 640px
// breakpoint (Tailwind `sm`) and resize logic — so the modal's
// viewport branch stays in sync with the picker's mobile/desktop
// rendering. Used here to decide whether the modal's date block
// shows the inline picker (desktop) or pops the picker out as a
// sibling fullscreen overlay (mobile).

// Read-only date-rendering helpers used by the booking modal below.
// The modal no longer hosts an interactive datepicker (per user
// feedback "ตัว datepicker ใน pop up ของโหมด desktop ปรับไม่ให้อยู่ใน
// pop up"); dates are picked from the main page's RangeDatePicker
// trigger bar above, and the modal is a pure confirm step. Labels
// show "X → Y (N วัน)" using Thai-buddhist formatting aligned with
// the vehicle-tab trigger bar so the dates read identically across
// both surfaces. Inline (rather than extracted to a shared module)
// to keep PublicBooking self-contained and avoid a new cross-file
// dependency.
const MODAL_THAI_SHORT = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
function fmtModalDate(dStr) {
  if (!dStr) return ''
  const d = new Date(dStr + 'T00:00:00')
  return `${d.getDate()} ${MODAL_THAI_SHORT[d.getMonth() + 1]} ${d.getFullYear() + 543}`
}
function modalDayDiff(start, end) {
  if (!start || !end) return 0
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  return Math.round((e - s) / 86400000) + 1
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
        className={`w-full h-11 px-3.5 flex items-center justify-between bg-white dark:bg-gray-800 border rounded-xl text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 ${
          open ? 'border-brand-400 ring-2 ring-brand-100' : 'border-neutral-200 dark:border-gray-600'
        } ${selected ? 'text-neutral-800 dark:text-gray-100' : 'text-neutral-400'}`}>
        {selected ? (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/50 dark:to-brand-800/50 flex items-center justify-center text-brand-700 dark:text-brand-300 text-[10px] font-bold shrink-0">
              {selected.brand?.charAt(0)}{selected.model?.charAt(0)}
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-neutral-800 dark:text-gray-100 leading-tight">{selected.brand} {selected.model}</div>
              <div className="text-[10px] text-neutral-400 dark:text-gray-500 leading-tight">{selected.license_plate} · {selected.seats} ที่นั่ง</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-neutral-100 dark:bg-gray-700 flex items-center justify-center text-neutral-400">
              <i className="bx bx-car text-sm"></i>
            </div>
            <span>— เลือกรถ —</span>
          </div>
        )}
        <i className={`bx bx-chevron-down text-base text-neutral-400 shrink-0 ml-2 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}></i>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white dark:bg-gray-800 border border-neutral-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden origin-top">
          <div className="max-h-60 overflow-y-auto py-1">
            {options.map(c => (
              <button key={c.id} type="button"
                onClick={() => { onChange(c.id); setOpen(false) }}
                className={`w-full px-3.5 py-2.5 text-sm flex items-center gap-2.5 transition-colors hover:bg-brand-50 dark:hover:bg-brand-950/40 ${
                  c.id === value ? 'text-brand-700 dark:text-brand-300 font-medium bg-brand-50/50 dark:bg-brand-950/30' : 'text-neutral-700 dark:text-gray-300'
                }`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  c.id === value
                    ? 'bg-brand-500 text-white'
                    : 'bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/50 dark:to-brand-800/50 text-brand-700 dark:text-brand-300'
                }`}>
                  {c.brand?.charAt(0)}{c.model?.charAt(0)}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className="text-sm font-medium leading-tight truncate">{c.brand} {c.model}</div>
                  <div className="text-[10px] text-neutral-400 dark:text-gray-500 leading-tight">{c.license_plate} · {c.seats} ที่นั่ง</div>
                </div>
                {c.id === value && (
                  <i className="bx bx-check text-base text-brand-500 shrink-0"></i>
                )}
              </button>
            ))}
            {options.length === 0 && (
              <div className="px-3.5 py-3 text-xs text-neutral-400 text-center">ไม่มีรถที่พร้อมใช้งาน</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PublicBooking() {
  const [availableCars, setAvailableCars] = useState([])
  const [carsLoading, setCarsLoading] = useState(false)
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ user_id: '', car_id: '', start_date: '', end_date: '', purpose: '' })
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)
  const [success, setSuccess] = useState(false)

  const [lookupQuery, setLookupQuery] = useState('')
  const [lookupResult, setLookupResult] = useState(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [detailBooking, setDetailBooking] = useState(null)

  const [activeTab, setActiveTab] = useState('cars')
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0)
  // isEditingDate: toggles the modal's date block between the
  // read-only summary pill (false) and the date-edit surface (true).
  // On desktop this swaps the modal's date block to an inline
  // RangeDatePicker; on mobile it instead opens a sibling overlay
  // popup (z-60) above the modal so the user gets the same exact
  // fullscreen-overlay picker UX as the main-page mobile picker.
  // Either way, clicking the picker's confirm/back-out fires onClose
  // → setIsEditingDate(false) → summary reappears with updated dates.
  const [isEditingDate, setIsEditingDate] = useState(false)
  const isMobile = useIsMobile()

  // closeModal: hides the modal, resets form/success/toast state, and
  // plays the 300ms scale-out animation. Plain const-arrow function
  // (no useCallback) — fresh closure per render is safe because we
  // only call state setters, which React guarantees are stable
  // references. Earlier this was useCallback([isClosing]) with a
  // `if (isClosing) return` guard that occasionally stale-closed
  // over `isClosing = true` after rapid close paths, blocking the
  // next click. Plain const-arrow removes that footgun. The two
  // close paths share the same pattern so behavior matches
  // share the same pattern so their behavior matches.
  const closeModal = () => {
    setIsClosing(true)
    setTimeout(() => {
      setShowBookingModal(false)
      setSuccess(false)
      setToast(null)
      setIsClosing(false)
      setIsEditingDate(false)
      // Keep start_date + end_date (the date range the user picked)
      // so closing the modal doesn't throw away the date selection.
      // Only clear per-booking fields: user, car, purpose.
      setForm(prev => ({ ...prev, user_id: '', car_id: '', purpose: '' }))
    }, 300)
  }
  const tabBarRef = useRef(null)

  useEffect(() => {
    if (!tabBarRef.current) return
    const activeBtn = tabBarRef.current.querySelector('button[data-tab="cars"]')
    if (activeBtn) {
      activeBtn.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' })
    }
  }, [])

  useEffect(() => { fetchUsers() }, [])

  useEffect(() => {
    if (showBookingModal) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [showBookingModal])

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
    setCarsLoading(true)
    try {
      let url = '/api/public/cars'
      if (startDate && endDate) url += `?start_date=${startDate}&end_date=${endDate}`
      const res = await fetch(url)
      if (res.ok) {
        const d = await res.json()
        setAvailableCars(d.cars)
      }
    } catch (e) { console.error(e) }
    finally { setCarsLoading(false) }
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
    setToast(null)
    setSuccess(false)
    if (!form.user_id) { setToast({ type: 'error', submessage: 'กรุณาเลือกชื่อผู้ยืม' }); return }
    if (!form.car_id) { setToast({ type: 'error', submessage: 'กรุณาเลือกรถ' }); return }
    if (!form.start_date) { setToast({ type: 'error', submessage: 'กรุณาเลือกวันที่เริ่มต้น' }); return }
    if (!form.end_date) { setToast({ type: 'error', submessage: 'กรุณาเลือกวันที่สิ้นสุด' }); return }

    setLoading(true)
    try {
      const res = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const d = await res.json()
      if (!res.ok) { setToast({ type: 'error', submessage: d.error }); return }
      setSuccess(true)
      // Keep start_date + end_date so the user can reuse the same date
      // range for another booking without re-picking. Only clear the
      // per-booking fields (user, car, purpose).
      setForm(prev => ({ ...prev, user_id: '', car_id: '', purpose: '' }))
      // Re-fetch cars so the just-booked car disappears from the grid
      // (the API already filters out pending/approved bookings for this
      // date range). Keep the date selection and let the user pick another
      // car for the same dates.
      if (form.start_date && form.end_date) {
        await fetchCars(form.start_date, form.end_date)
        // Also bump the calendar refresh key so the calendar tab (when
        // the user switches to it) re-fetches with the latest booking list.
        setCalendarRefreshKey(k => k + 1)
      }
    } catch {
      setToast({ type: 'error', submessage: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
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

  async function refetchLookup() {
    if (lookupQuery) {
      try {
        const res = await fetch('/api/public/bookings/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: lookupQuery })
        })
        if (res.ok) {
          const d = await res.json()
          setLookupResult(d)
        }
      } catch {}
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
                ) : carsLoading ? (
                  <div className="border-t border-gray-100 dark:border-gray-700 pt-6">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {Array.from({ length: 6 }, (_, i) => (
                        <div key={i} className="rounded-2xl border-2 border-gray-100 dark:border-gray-700 p-5">
                          <div className="flex items-center gap-4 mb-3">
                            <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
                            <div className="min-w-0 flex-1">
                              <Skeleton className="h-4 w-24" />
                              <Skeleton className="h-3 w-16 mt-2" />
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Skeleton className="h-5 w-16 rounded-md" />
                            <Skeleton className="h-5 w-14 rounded-md" />
                          </div>
                        </div>
                      ))}
                    </div>
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
            <React.Suspense fallback={
              <div className="card p-4">
                <div className="grid grid-cols-7 gap-2 mb-4">
                  {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-4" />)}
                </div>
                <div className="space-y-3">
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-10 w-28 rounded-lg shrink-0" />
                      <Skeleton className="h-10 flex-1 rounded-lg" />
                    </div>
                  ))}
                </div>
              </div>
            }>
              <CalendarPage publicMode onDateClick={(dateStr) => { updateForm('start_date', dateStr); setShowBookingModal(true) }} refreshKey={calendarRefreshKey} />
            </React.Suspense>
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
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">ชื่อ / เบอร์โทรศัพท์</label>
                  <div className="relative">
                    <i className="bx bx-search absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-gray-400"></i>
                    <input value={lookupQuery} onChange={e => setLookupQuery(e.target.value)}
                      className="w-full h-11 pl-10 pr-4 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all duration-200"
                      placeholder="ชื่อ หรือ เบอร์โทรศัพท์" />
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
                        <button key={b.id}
                          onClick={() => setDetailBooking(b)}
                          className="w-full text-left p-4 rounded-xl bg-gray-50 dark:bg-gray-700/40 motion-safe:animate-slide-up-fade hover:bg-gray-100 dark:hover:bg-gray-600/40 transition-colors cursor-pointer"
                          style={{ animationDelay: `${i * 60}ms` }}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/50 dark:to-brand-800/50 flex items-center justify-center text-brand-700 dark:text-brand-300 text-xs font-bold shrink-0">
                                {b.brand?.charAt(0)}{b.model?.charAt(0)}
                              </div>
                              <div className="min-w-0 text-left">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{b.brand} {b.model}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{b.license_plate}</p>
                                <p className="text-xs text-gray-400 dark:text-gray-500">{b.start_date} → {b.end_date}</p>
                              </div>
                            </div>
                            <span className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                              style={{
                                backgroundColor: (STATUS_COLORS[b.status] || '#6b7280') + '20',
                                color: STATUS_COLORS[b.status] || '#6b7280',
                              }}>
                              {statusLabel(b.status)}
                            </span>
                          </div>
                        </button>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeModal}>
            <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isClosing ? 'opacity-0' : ''}`} />
            <div className={`relative w-full max-w-xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 p-4 sm:p-6 animate-scale-in ${isClosing ? 'animate-scale-out' : ''}`}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">จองรถ</h2>
                <button onClick={() => { if (!loading) closeModal() }}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200">
                  <i className="bx bx-x text-xl"></i>
                </button>
              </div>
              {success ? (
                <div className="text-center py-12 animate-fade-in">
                  <div className="relative w-20 h-20 mx-auto mb-6">
                    {/* Ripple rings */}
                    <div className="absolute inset-0 rounded-full bg-emerald-400/30 dark:bg-emerald-400/20 animate-success-ring"></div>
                    <div className="absolute inset-0 rounded-full bg-emerald-400/20 dark:bg-emerald-400/10 animate-success-ring" style={{ animationDelay: '0.6s' }}></div>
                    {/* Circle */}
                    <div className="w-full h-full rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center animate-success-pop">
                      <i className="bx bx-check-circle text-4xl text-emerald-600 dark:text-emerald-400"></i>
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 animate-bounce-up" style={{ animationDelay: '0.2s', opacity: 0 }}>ส่งคำขอยืมเรียบร้อย</h2>
                  <p className="text-gray-500 dark:text-gray-400 mb-8 animate-bounce-up" style={{ animationDelay: '0.35s', opacity: 0 }}>รอการอนุมัติจากผู้ดูแลระบบ</p>
                    <button onClick={closeModal}
                    className="h-11 px-6 inline-flex items-center gap-2 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-all duration-200 shadow-md shadow-brand-200/50 animate-bounce-up"
                    style={{ animationDelay: '0.5s', opacity: 0 }}>
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

                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">ช่วงวันที่ใช้รถ</label>
                    {/* Two-mode date block — toggles between:
                        (A) click-anywhere summary pill — the entire
                            pill (calendar icon + date text + chevron
                            hint) is a single <button>, so clicking
                            ANYWHERE inside the box enters edit mode.
                            This removes the small "แก้ไข" text
                            affordance and signals editability through
                            a chevron-down hint + cursor-pointer +
                            hover lighten + focus ring instead, per
                            user feedback "อยากแก้ไขให้กดตรงไหนใน
                            กรอบก็ได้ไม่ต้องกดแค่ตรงแก้ไข เอาปุ่ม
                            แก้ไขออกเลยก็ได้";
                        (B) inline RangeDatePicker panel rendered
                            inside the modal — the user picks new
                            dates without leaving the popup.
                        On desktop the picker auto-dismisses after a
                        full range is committed (handlePick → setOpen
                        (false) → onClose fires); on mobile the user
                        confirms with the in-picker ตกลง button. Both
                        paths call onClose, which flips isEditingDate
                        back to false → mode (A) re-appears with the
                        new dates.
                        The "ยกเลิก" affordance in mode (B) returns to
                        summary without committing any change. Modal
                        stays open across the entire toggle — only
                        the inner block swaps. */}
                    {/* In-modal date block — branches on viewport:
                          (A) Desktop + isEditingDate → inline picker
                              renders inside the modal container (the
                              panel grows, scroll inside it).
                          (B) Mobile + isEditingDate    → nothing here;
                              the overlay picker is rendered as a
                              sibling `<div fixed inset-0 z-60>` ABOVE
                              the modal (see the matching render block
                              after the modal). Modal stays visible
                              underneath, summary pill is briefly visible
                              behind the overlay until the picker
                              disclaims.
                          (C) !isEditingDate          → the click-anywhere
                              summary pill (default state). On mobile
                              this serves both before and during the
                              overlay-picker-open window because the
                              overlay covers it visually. */}
                    {isEditingDate && !isMobile ? (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">เลือกวันที่ใช้รถใหม่</span>
                          <button type="button" onClick={() => setIsEditingDate(false)}
                            className="text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline underline-offset-2">
                            ยกเลิก
                          </button>
                        </div>
                        <RangeDatePicker
                          startDate={form.start_date}
                          endDate={form.end_date}
                          onChange={(s, e) => {
                            setForm(prev => ({ ...prev, start_date: s, end_date: e }))
                            if (s && e) fetchCars(s, e)
                          }}
                          onClose={() => setIsEditingDate(false)}
                          min={todayStr()}
                          inline />
                      </div>
                    ) : (
                      <button type="button" onClick={() => setIsEditingDate(true)}
                        aria-label="แก้ไขวันที่ใช้รถ"
                        className="w-full flex items-center justify-between px-4 py-3 bg-brand-50 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-800 rounded-xl gap-3 cursor-pointer hover:bg-brand-100 dark:hover:bg-brand-950/50 active:bg-brand-200 dark:active:bg-brand-950/70 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand-300 text-left">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm shrink-0">
                            <i className="bx bx-calendar text-brand-500" aria-hidden="true"></i>
                          </div>
                          <div className="text-sm font-medium text-brand-900 dark:text-brand-100 truncate">
                            {form.start_date && form.end_date
                              ? <>{fmtModalDate(form.start_date)} → {fmtModalDate(form.end_date)} ({modalDayDiff(form.start_date, form.end_date)} วัน)</>
                              : form.start_date
                                ? <>{fmtModalDate(form.start_date)} → <span className="text-amber-500">เลือกวันคืน</span></>
                                : <span className="text-gray-400">ยังไม่ได้เลือกวันที่</span>}
                          </div>
                        </div>
                        <i className="bx bx-chevron-down text-base text-brand-500 dark:text-brand-400 shrink-0 ml-3" aria-hidden="true"></i>
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">เหตุผลการยืม</label>
                    <textarea value={form.purpose} onChange={e => updateForm('purpose', e.target.value)}
                      className="w-full h-24 px-4 py-3 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all duration-200 resize-none"
                      placeholder="ระบุวัตถุประสงค์การใช้งาน..." />
                  </div>

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

          {/* Mobile date-picker overlay — sibling of the modal, stacked
              above (z-60 vs modal z-50). Only renders on mobile when
              the user has clicked the modal's summary pill and the
              picker needs to appear as a fullscreen popup (matching
              the original mobile picker UX). RangeDatePicker's
              `noTrigger` flag omits its internal trigger button — the
              modal's summary pill is the external trigger. The
              picker fires onClose on mobile ตกลง confirm OR on
              backdrop dismiss → sets isEditingDate=false → overlay
              unmounts, modal summary updates. */}
          {showBookingModal && isMobile && isEditingDate && (
            <div className="fixed inset-0 z-[60]">
              <RangeDatePicker
                noTrigger
                startDate={form.start_date}
                endDate={form.end_date}
                onChange={(s, e) => {
                  setForm(prev => ({ ...prev, start_date: s, end_date: e }))
                  if (s && e) fetchCars(s, e)
                }}
                onClose={() => setIsEditingDate(false)}
                min={todayStr()} />
            </div>
          )}

          <BookingDetailModal
            booking={detailBooking}
            publicMode={true}
            canManageBookings={false}
            onClose={() => setDetailBooking(null)}
            onActionDone={refetchLookup}
            setToast={setToast}
          />

          {toast && <Toast type={toast.type} message={toast.message} submessage={toast.submessage} onClose={() => setToast(null)} />}

        </div>
      </main>
    </div>
  )
}
