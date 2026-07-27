import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { todayStr } from '../lib/constants'
import RangeDatePicker from './RangeDatePicker'

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
              <i className="bx bx-user text-sm"></i>
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-neutral-800 dark:text-gray-100 leading-tight">{selected.name}</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-neutral-100 dark:bg-gray-700 flex items-center justify-center text-neutral-400">
              <i className="bx bx-user text-sm"></i>
            </div>
            <span>— เลือกผู้ยืม —</span>
          </div>
        )}
        <i className={`bx bx-chevron-down text-base text-neutral-400 shrink-0 ml-2 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}></i>
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
                  <i className="bx bx-user text-sm"></i>
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className="text-sm font-medium leading-tight truncate">{u.name}</div>
                </div>
                {u.id === value && (
                  <i className="bx bx-check text-base text-violet-500 shrink-0"></i>
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
              <i className="bx bx-plus text-xl"></i>
            </div>
            <div>
              <h3 className="font-heading font-semibold text-base text-neutral-800 dark:text-white">จองรถ</h3>
              <p className="text-xs text-neutral-400">กรอกข้อมูลเพื่อส่งคำขอยืม</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-gray-700 text-neutral-400 transition-colors">
            <i className="bx bx-x text-xl"></i>
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

          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">ช่วงวันที่ใช้งาน</label>
            {/* RangeDatePicker (vehicle-tab style) replaces the prior
                2-half-bar DateRangeBar. Trigger button shows
                start→end (X วัน) summary + opens step='start'/'end'
                state machine panel. Pre-fill from CalendarPage is
                passed via initialDate → form.start_date → RangeDatePicker's
                selStart prop. min={today} blocks past dates from being
                picked. */}
            <RangeDatePicker
              startDate={form.start_date}
              endDate={form.end_date}
              onChange={(s, e) => { updateForm('start_date', s); updateForm('end_date', e) }}
              min={today} />
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
              <i className="bx bx-error-circle text-base shrink-0"></i>
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <i className="bx bx-check-circle text-base shrink-0"></i>
              {success}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading}
              className="flex-1 h-11 inline-flex items-center justify-center gap-2 px-5 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 active:from-brand-600 active:to-brand-700 shadow-md shadow-brand-200/50 hover:shadow-lg hover:shadow-brand-300/40 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading && (
                <i className="bx bx-loader-alt text-base animate-spin"></i>
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
