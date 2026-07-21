import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { todayStr } from '../lib/constants'

const THAI_SHORT = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const DAYS_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

function pad(n) { return String(n).padStart(2, '0') }

function DatePicker({ value, onChange, min }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const panelRef = useRef(null)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const minDate = min ? new Date(min + 'T00:00:00') : today
  const [viewDate, setViewDate] = useState(value ? new Date(value + 'T00:00:00') : today)

  useEffect(() => {
    if (value) setViewDate(new Date(value + 'T00:00:00'))
  }, [value])

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target) && panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false)
      }
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

  function isDisabled(d) {
    const date = new Date(vy, vm, d)
    return date < minDate
  }

  function pickDate(d) {
    const date = new Date(vy, vm, d)
    if (date < minDate) return
    onChange(date.toLocaleDateString('en-CA'))
    setOpen(false)
  }

  function goPrev() {
    setViewDate(new Date(vy, vm - 1, 1))
  }

  function goNext() {
    setViewDate(new Date(vy, vm + 1, 1))
  }

  function formatDisplay(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'T00:00:00')
    return `${d.getDate()} ${THAI_SHORT[d.getMonth() + 1]} ${d.getFullYear() + 543}`
  }

  const selectedDate = value ? new Date(value + 'T00:00:00') : null

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className={`w-full h-11 px-3.5 flex items-center justify-between bg-white dark:bg-gray-800 border rounded-xl text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 ${
          open ? 'border-brand-400 ring-2 ring-brand-100' : 'border-neutral-200 dark:border-gray-600'
        } ${selectedDate ? 'text-neutral-800 dark:text-gray-100' : 'text-neutral-400'}`}>
        <span className="truncate">{selectedDate ? formatDisplay(value) : 'เลือกวันที่'}</span>
        <svg className={`w-4 h-4 text-neutral-400 shrink-0 ml-2 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </button>

      {open && (
        <div ref={panelRef}
          className="absolute z-50 top-full mt-1 left-0 right-0 bg-white dark:bg-gray-800 border border-neutral-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden origin-top">
          <div className="p-3">
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={goPrev}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-brand-100 dark:hover:bg-brand-900/40 text-neutral-600 dark:text-gray-400 transition-colors text-xs">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <div className="text-xs font-semibold text-neutral-800 dark:text-gray-100">
                {THAI_SHORT[vm + 1]} {vy + 543}
              </div>
              <button type="button" onClick={goNext}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-brand-100 dark:hover:bg-brand-900/40 text-neutral-600 dark:text-gray-400 transition-colors text-xs">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>

            <div className="grid grid-cols-7 mb-1">
              {DAYS_TH.map(d => (
                <div key={d} className="flex items-center justify-center h-6 text-[10px] text-neutral-400 dark:text-gray-500 font-medium">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((c, i) => {
                const d = new Date(vy, vm, c.d)
                const isSel = isSameDay(d, selectedDate)
                const disabled = isDisabled(c.d)
                const isTd = isSameDay(d, today)
                return (
                  <button key={i} type="button" disabled={disabled}
                    onClick={() => !c.other && pickDate(c.d)}
                    className={`flex items-center justify-center w-full aspect-square text-center text-xs rounded-lg transition-colors ${
                      c.other ? 'text-neutral-200 dark:text-gray-600 cursor-default' : 'text-neutral-700 dark:text-gray-300 hover:bg-brand-50 dark:hover:bg-brand-950/40'
                    } ${isSel ? 'bg-brand-600 text-white font-semibold hover:bg-brand-700' : ''} ${isTd && !isSel ? 'text-brand-600 dark:text-brand-400 font-semibold' : ''} ${
                      disabled ? 'text-neutral-200 dark:text-gray-600 cursor-not-allowed hover:bg-transparent' : ''
                    }`}>
                    {c.d}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {selectedDate && (
        <p className="text-[11px] text-neutral-400 dark:text-gray-500 mt-1">{formatDisplay(value)}</p>
      )}
    </div>
  )
}

function CarSelect({ value, onChange, options }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false) }
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
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" /></svg>
            </div>
            <span>— เลือกรถ —</span>
          </div>
        )}
        <svg className={`w-4 h-4 text-neutral-400 shrink-0 ml-2 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
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
                  <svg className="w-4 h-4 text-brand-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
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

function UserSelect({ value, onChange, options }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false) }
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
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-100 to-violet-200 dark:from-violet-900/50 dark:to-violet-800/50 flex items-center justify-center text-violet-700 dark:text-violet-300 text-[10px] font-bold shrink-0">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-neutral-800 dark:text-gray-100 leading-tight">{selected.name}</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-neutral-100 dark:bg-gray-700 flex items-center justify-center text-neutral-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <span>— เลือกผู้ยืม —</span>
          </div>
        )}
        <svg className={`w-4 h-4 text-neutral-400 shrink-0 ml-2 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white dark:bg-gray-800 border border-neutral-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden origin-top">
          <div className="max-h-60 overflow-y-auto py-1">
            {options.map(u => (
              <button key={u.id} type="button"
                onClick={() => { onChange(u.id); setOpen(false) }}
                className={`w-full px-3.5 py-2.5 text-sm flex items-center gap-2.5 transition-colors hover:bg-violet-50 dark:hover:bg-violet-950/40 ${
                  u.id === value ? 'text-violet-700 dark:text-violet-300 font-medium bg-violet-50/50 dark:bg-violet-950/30' : 'text-neutral-700 dark:text-gray-300'
                }`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  u.id === value
                    ? 'bg-violet-500 text-white'
                    : 'bg-gradient-to-br from-violet-100 to-violet-200 dark:from-violet-900/50 dark:to-violet-800/50 text-violet-700 dark:text-violet-300'
                }`}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className="text-sm font-medium leading-tight truncate">{u.name}</div>
                </div>
                {u.id === value && (
                  <svg className="w-4 h-4 text-violet-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                )}
              </button>
            ))}
            {options.length === 0 && (
              <div className="px-3.5 py-3 text-xs text-neutral-400 text-center">ไม่มีผู้ใช้ในระบบ</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function BookingModal({ open, onClose, initialCarId, initialDate }) {
  const { authHeaders } = useApp()
  const [availableCars, setAvailableCars] = useState([])
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ user_id: '', car_id: initialCarId || '', start_date: initialDate || '', end_date: '', purpose: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const today = todayStr()

  useEffect(() => {
    if (open) {
      setForm({ user_id: '', car_id: initialCarId || '', start_date: initialDate || '', end_date: '', purpose: '' })
      setError('')
      setSuccess('')
      fetchCars()
      fetchUsers()
    }
  }, [open, initialCarId, initialDate])

  async function fetchCars() {
    try {
      const res = await fetch('/api/cars?status=available', { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setAvailableCars(data.cars)
      }
    } catch (e) {
      console.error(e)
    }
  }

  async function fetchUsers() {
    try {
      const res = await fetch('/api/admin/users', { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users)
      }
    } catch (e) {
      console.error(e)
    }
  }

  function updateForm(key, value) {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      if (key === 'start_date' && prev.end_date && value > prev.end_date) {
        next.end_date = ''
      }
      return next
    })
  }

  const minEnd = form.start_date || today

  async function submitBooking(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!form.user_id) {
      setError('กรุณาเลือกผู้ยืม')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error)
        return
      }

      setSuccess('ส่งคำขอยืมเรียบร้อย รอการอนุมัติจากผู้ดูแลระบบ')
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="card p-6 w-full max-w-lg relative animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-neutral-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center text-white shadow-sm">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            </div>
            <div>
              <h3 className="font-heading font-semibold text-base text-neutral-800 dark:text-white">จองรถ</h3>
              <p className="text-xs text-neutral-400">กรอกข้อมูลเพื่อส่งคำขอยืม</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-gray-700 text-neutral-400 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={submitBooking} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">ผู้ยืม</label>
            <UserSelect value={form.user_id} onChange={v => updateForm('user_id', v)} options={users} />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">เลือกยานพาหนะ</label>
            <CarSelect value={form.car_id} onChange={v => updateForm('car_id', v)} options={availableCars} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">วันที่เริ่มต้น</label>
              <DatePicker value={form.start_date} onChange={v => updateForm('start_date', v)} min={today} />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">วันที่สิ้นสุด</label>
              <DatePicker value={form.end_date} onChange={v => updateForm('end_date', v)} min={minEnd} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">เหตุผลการยืม</label>
            <textarea value={form.purpose} onChange={e => updateForm('purpose', e.target.value)}
              className="w-full h-20 px-3.5 py-2.5 rounded-xl border text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 resize-none
                bg-white dark:bg-gray-800 border-neutral-200 dark:border-gray-600 text-neutral-800 dark:text-gray-100 placeholder:text-neutral-400"
              placeholder="ระบุวัตถุประสงค์การใช้งาน..." />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              {success}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading}
              className="flex-1 h-11 inline-flex items-center justify-center gap-2 px-5 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 active:from-brand-600 active:to-brand-700 shadow-md shadow-brand-200/50 hover:shadow-lg hover:shadow-brand-300/40 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              )}
              <span>{loading ? 'กำลังส่ง...' : 'ส่งคำขอยืม'}</span>
            </button>
            <button type="button" onClick={onClose}
              className="h-11 px-5 inline-flex items-center justify-center rounded-xl text-sm font-medium text-neutral-600 dark:text-gray-400 bg-neutral-100 dark:bg-gray-700 hover:bg-neutral-200 dark:hover:bg-gray-600 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-neutral-300">
              ยกเลิก
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
