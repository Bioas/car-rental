import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { todayStr, DEFAULT_START_TIME, DEFAULT_END_TIME } from '../lib/constants'
import { apiGet, invalidateApi } from '../lib/apiCache'
import RangeDatePicker from './RangeDatePicker'
import TimeRangePicker from './TimeRangePicker'
import PrefixSelect from './PrefixSelect'
import { useDialog, dialogProps } from '../lib/useDialog'

// Red invalid styling applied to a required field after a failed submit,
// overriding the normal border + focus ring (Tailwind `!` importance).
const INVALID_FIELD = '!border-red-400 dark:!border-red-500 focus:!border-red-400 focus:!ring-red-100 dark:focus:!ring-red-900/40'

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
              <div className="text-sm font-medium text-neutral-800 dark:text-gray-100 leading-tight">{selected.license_plate}</div>
              <div className="text-[10px] text-neutral-400 dark:text-gray-500 leading-tight">{selected.brand} {selected.model} · {selected.seats} ที่นั่ง</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-neutral-100 dark:bg-gray-700 flex items-center justify-center text-neutral-400">
              <i aria-hidden="true" className="bx bx-car text-sm"></i>
            </div>
            <span>— เลือกรถ —</span>
          </div>
        )}
        <i aria-hidden="true" className={`bx bx-chevron-down text-base text-neutral-400 shrink-0 ml-2 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}></i>
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
                  <div className="text-sm font-medium leading-tight truncate">{c.license_plate}</div>
                  <div className="text-[10px] text-neutral-400 dark:text-gray-500 leading-tight">{c.brand} {c.model} · {c.seats} ที่นั่ง</div>
                </div>
                {c.id === value && (
                  <i aria-hidden="true" className="bx bx-check text-base text-brand-500 shrink-0"></i>
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

export function BookingModal({ open, onClose, initialCarId, initialDate }) {
  const { authHeaders } = useApp()
  const [availableCars, setAvailableCars] = useState([])
  const [form, setForm] = useState({ prefix: '', name: '', phone: '', position: '', car_id: initialCarId || '', start_date: initialDate || '', end_date: '', start_time: DEFAULT_START_TIME, end_time: DEFAULT_END_TIME, purpose: '', destination_place: '', destination_district: '', destination_province: '', attendees: '' })
  // Which required fields were empty the last time the user pressed submit —
  // drives the red invalid styling, and clears as soon as a field is filled.
  const [formErrors, setFormErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const today = todayStr()

  useEffect(() => {
    if (open) {
      setForm({ prefix: '', name: '', phone: '', position: '', car_id: initialCarId || '', start_date: initialDate || '', end_date: '', start_time: DEFAULT_START_TIME, end_time: DEFAULT_END_TIME, purpose: '', destination_place: '', destination_district: '', destination_province: '', attendees: '' })
      setError('')
      setSuccess('')
      fetchCars()
    }
  }, [open, initialCarId, initialDate])

  async function fetchCars() {
    try {
      const res = await apiGet('/api/cars?status=available', { headers: authHeaders(), ttl: 15000 })
      if (res.ok) {
        setAvailableCars(res.data.cars)
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

  // Drop a field's red invalid state the moment it holds a value, no matter
  // which control filled it (text input, car select, calendar, date picker).
  useEffect(() => {
    setFormErrors(prev => {
      const next = { ...prev }
      let changed = false
      const clear = (k, ok) => { if (next[k] && ok) { next[k] = false; changed = true } }
      clear('prefix', !!form.prefix)
      clear('name', !!form.name.trim())
      clear('phone', !!form.phone.trim())
      clear('position', !!form.position.trim())
      clear('car_id', !!form.car_id)
      clear('start_date', !!form.start_date)
      clear('end_date', !!form.end_date)
      clear('destination_place', !!form.destination_place.trim())
      clear('destination_district', !!form.destination_district.trim())
      clear('destination_province', !!form.destination_province.trim())
      clear('attendees', !!String(form.attendees).trim())
      clear('purpose', !!form.purpose.trim())
      return changed ? next : prev
    })
  }, [form])

  async function submitBooking(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    const errs = {}
    if (!form.prefix) errs.prefix = true
    if (!form.name.trim()) errs.name = true
    // The phone number doubles as the credential for self-service
    // cancel/return later, so it cannot be left blank.
    if (!form.phone.trim()) errs.phone = true
    if (!form.position.trim()) errs.position = true
    if (!form.car_id) errs.car_id = true
    if (!form.start_date) errs.start_date = true
    if (!form.end_date) errs.end_date = true
    if (!form.destination_place.trim()) errs.destination_place = true
    if (!form.destination_district.trim()) errs.destination_district = true
    if (!form.destination_province.trim()) errs.destination_province = true
    if (!String(form.attendees).trim()) errs.attendees = true
    if (!form.purpose.trim()) errs.purpose = true
    setFormErrors(errs)
    if (Object.keys(errs).length) {
      setError('กรุณากรอกข้อมูลให้ครบถ้วน')
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
      invalidateApi()
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  const panelRef = useRef(null)
  useDialog(open, onClose, panelRef)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div ref={panelRef} {...dialogProps('สร้างคำขอยืม')} className="card p-6 w-full max-w-lg relative animate-scale-in max-h-[70vh] overflow-y-auto scrollbar-none sm:max-h-none sm:overflow-visible" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-neutral-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center text-white shadow-sm">
              <i aria-hidden="true" className="bx bx-plus text-xl"></i>
            </div>
            <div>
              <h3 className="font-heading font-semibold text-base text-neutral-800 dark:text-white">จองรถ</h3>
              <p className="text-xs text-neutral-400">กรอกข้อมูลเพื่อส่งคำขอยืม</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-gray-700 text-neutral-400 transition-colors">
            <i aria-hidden="true" className="bx bx-x text-xl"></i>
          </button>
        </div>

        <form onSubmit={submitBooking} className="space-y-4" noValidate>
          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">ชื่อผู้ยืม</label>
            <div className="flex gap-2">
              <PrefixSelect value={form.prefix} onChange={v => updateForm('prefix', v)}
                buttonClassName={`h-11 w-32 px-3 rounded-xl border bg-white dark:bg-gray-800 border-neutral-200 dark:border-gray-600 text-sm text-neutral-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all ${formErrors.prefix ? INVALID_FIELD : ''}`} />
              <div className="relative flex-1 min-w-0">
                <i aria-hidden="true" className="bx bx-user absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                <input value={form.name} onChange={e => updateForm('name', e.target.value)}
                  className={`w-full h-11 pl-10 pr-3 rounded-xl border bg-white dark:bg-gray-800 border-neutral-200 dark:border-gray-600 text-sm text-neutral-800 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all ${formErrors.name ? INVALID_FIELD : ''}`}
                  placeholder="ชื่อ-นามสกุล" required />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">เบอร์โทรศัพท์</label>
              <div className="relative">
                <i aria-hidden="true" className="bx bx-phone absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                <input value={form.phone} onChange={e => updateForm('phone', e.target.value)} type="tel"
                  className={`w-full h-11 pl-10 pr-3 rounded-xl border bg-white dark:bg-gray-800 border-neutral-200 dark:border-gray-600 text-sm text-neutral-800 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all ${formErrors.phone ? INVALID_FIELD : ''}`}
                  placeholder="เบอร์โทรศัพท์" required />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">ตำแหน่ง</label>
              <div className="relative">
                <i aria-hidden="true" className="bx bx-briefcase absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                <input value={form.position} onChange={e => updateForm('position', e.target.value)}
                  className={`w-full h-11 pl-10 pr-3 rounded-xl border bg-white dark:bg-gray-800 border-neutral-200 dark:border-gray-600 text-sm text-neutral-800 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all ${formErrors.position ? INVALID_FIELD : ''}`}
                  placeholder="เช่น ครู, เจ้าหน้าที่" />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">เลือกยานพาหนะ</label>
            <div className={formErrors.car_id ? 'rounded-xl ring-2 ring-red-400 dark:ring-red-500' : ''}>
              <CarSelect value={form.car_id} onChange={v => updateForm('car_id', v)} options={availableCars} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">ช่วงวันและเวลาที่ใช้งาน</label>
            {/* RangeDatePicker (vehicle-tab style) replaces the prior
                2-half-bar DateRangeBar. Trigger button shows
                start→end (X วัน) summary + opens step='start'/'end'
                state machine panel. Pre-fill from CalendarPage is
                passed via initialDate → form.start_date → RangeDatePicker's
                selStart prop. min={today} blocks past dates from being
                picked. */}
            <div className={formErrors.start_date || formErrors.end_date ? 'rounded-xl ring-2 ring-red-400 dark:ring-red-500' : ''}>
              <RangeDatePicker
                startDate={form.start_date}
                endDate={form.end_date}
                onChange={(s, e) => { updateForm('start_date', s); updateForm('end_date', e) }}
                min={today} />
            </div>
            <div className="mt-3">
              <TimeRangePicker startTime={form.start_time} endTime={form.end_time}
                sameDay={!!form.start_date && form.start_date === form.end_date}
                onChange={(start_time, end_time) => setForm(prev => ({ ...prev, start_time, end_time }))} />
            </div>
          </div>

          {/* Trip details — 2×2 grid so all four short fields share one width
              and no field is left orphaned on its own half-empty row. */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5 truncate">ชื่อสถานที่</label>
              <div className="relative">
                <i aria-hidden="true" className="bx bx-map-pin absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                <input value={form.destination_place} onChange={e => updateForm('destination_place', e.target.value)}
                  className={`w-full h-11 pl-10 pr-3 rounded-xl border bg-white dark:bg-gray-800 border-neutral-200 dark:border-gray-600 text-sm text-neutral-800 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all ${formErrors.destination_place ? INVALID_FIELD : ''}`}
                  placeholder="ชื่อสถานที่" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5 truncate">ชื่ออำเภอ</label>
              <div className="relative">
                <i aria-hidden="true" className="bx bx-buildings absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                <input value={form.destination_district} onChange={e => updateForm('destination_district', e.target.value)}
                  className={`w-full h-11 pl-10 pr-3 rounded-xl border bg-white dark:bg-gray-800 border-neutral-200 dark:border-gray-600 text-sm text-neutral-800 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all ${formErrors.destination_district ? INVALID_FIELD : ''}`}
                  placeholder="ชื่ออำเภอ" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5 truncate">ชื่อจังหวัด</label>
              <div className="relative">
                <i aria-hidden="true" className="bx bx-map absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                <input value={form.destination_province} onChange={e => updateForm('destination_province', e.target.value)}
                  className={`w-full h-11 pl-10 pr-3 rounded-xl border bg-white dark:bg-gray-800 border-neutral-200 dark:border-gray-600 text-sm text-neutral-800 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all ${formErrors.destination_province ? INVALID_FIELD : ''}`}
                  placeholder="ชื่อจังหวัด" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5 truncate">จำนวนผู้ไปราชการ</label>
              <div className="relative">
                <i aria-hidden="true" className="bx bx-group absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                <input value={form.attendees} onChange={e => updateForm('attendees', e.target.value)} type="number" min="1"
                  className={`w-full h-11 pl-10 pr-3 rounded-xl border bg-white dark:bg-gray-800 border-neutral-200 dark:border-gray-600 text-sm text-neutral-800 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all ${formErrors.attendees ? INVALID_FIELD : ''}`}
                  placeholder="จำนวนคน" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">เหตุผลการยืม</label>
            <textarea value={form.purpose} onChange={e => updateForm('purpose', e.target.value)}
              className={`w-full h-20 px-3.5 py-2.5 rounded-xl border text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 resize-none
                bg-white dark:bg-gray-800 border-neutral-200 dark:border-gray-600 text-neutral-800 dark:text-gray-100 placeholder:text-neutral-400 ${formErrors.purpose ? INVALID_FIELD : ''}`}
              placeholder="ระบุวัตถุประสงค์การใช้งาน..." />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <i aria-hidden="true" className="bx bx-error-circle text-base shrink-0"></i>
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <i aria-hidden="true" className="bx bx-check-circle text-base shrink-0"></i>
              {success}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading}
              className="flex-1 h-11 inline-flex items-center justify-center gap-2 px-5 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 active:from-brand-600 active:to-brand-700 shadow-md shadow-brand-200/50 hover:shadow-lg hover:shadow-brand-300/40 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading && (
                <i aria-hidden="true" className="bx bx-loader-alt text-base animate-spin"></i>
              )}
              <span>{loading ? 'กำลังส่ง...' : 'ส่งคำขอยืม'}</span>
            </button>
            <button type="button" onClick={onClose}
              className="h-11 px-5 inline-flex items-center justify-center rounded-xl text-sm font-medium text-neutral-600 dark:text-gray-200 bg-neutral-100 dark:bg-gray-700 hover:bg-neutral-200 dark:hover:bg-gray-600 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-neutral-300">
              ยกเลิก
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
