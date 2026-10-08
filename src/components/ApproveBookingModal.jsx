import React, { useState } from 'react'
import { Select } from './ui/select'

/**
 * Approval dialog shown when an admin approves a pending booking.
 *
 * The admin must decide who drives: either assign one of the driver-role users
 * ("ส่งพนักงานขับรถ") or let the requester drive themselves ("ให้ผู้ยืมขับเอง").
 * The choice is sent to PUT /api/admin/bookings/:id/approve.
 */
export default function ApproveBookingModal({ booking, drivers = [], onClose, onConfirm, saving = false }) {
  const [mode, setMode] = useState('self')
  const [driverId, setDriverId] = useState('')
  const [error, setError] = useState('')

  if (!booking) return null

  const canConfirm = mode === 'self' || !!driverId

  function confirm() {
    if (mode === 'driver' && !driverId) {
      setError('กรุณาเลือกพนักงานขับรถ')
      return
    }
    onConfirm({ self_drive: mode === 'self', driver_id: mode === 'driver' ? driverId : null })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !saving && onClose()}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="card p-6 w-full max-w-md relative animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-border-light dark:border-border-dark">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0 bg-gradient-to-br from-emerald-400 to-emerald-600">
              <i className="bx bx-check-shield text-xl"></i>
            </div>
            <div>
              <h3 className="font-heading font-semibold text-base text-gray-900 dark:text-white">อนุมัติคำขอยืมรถ</h3>
              <p className="text-xs text-neutral-500">เลือกผู้ขับขี่สำหรับการยืมครั้งนี้</p>
            </div>
          </div>
          <button onClick={onClose} disabled={saving}
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-gray-700 text-neutral-400 transition-colors disabled:opacity-50">
            <i className="bx bx-x text-xl"></i>
          </button>
        </div>

        <div className="mb-4 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <i className="bx bx-car text-sm"></i>
          <span className="font-medium text-gray-700 dark:text-gray-300">{booking.brand} {booking.model}</span>
          <span className="text-gray-400">·</span>
          <span className="font-mono">{booking.license_plate}</span>
          {booking.user_name && (
            <>
              <span className="text-gray-400">·</span>
              <span>ผู้ยืม: {booking.user_name}</span>
            </>
          )}
        </div>

        <div className="space-y-2">
          {/* Self drive */}
          <button type="button" onClick={() => { setMode('self'); setError('') }}
            className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${
              mode === 'self'
                ? 'border-brand-400 bg-brand-50 dark:border-brand-500 dark:bg-brand-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              mode === 'self' ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
            }`}>
              <i className="bx bx-user text-lg"></i>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-gray-900 dark:text-white">ให้ผู้ยืมขับเอง</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">อนุมัติให้ผู้ขอยืมเป็นผู้ขับขี่เอง</div>
            </div>
            {mode === 'self' && <i className="bx bxs-check-circle text-lg text-brand-500 shrink-0"></i>}
          </button>

          {/* Assign driver */}
          <button type="button" onClick={() => { setMode('driver'); setError('') }}
            className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${
              mode === 'driver'
                ? 'border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              mode === 'driver' ? 'bg-sky-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
            }`}>
              <i className="bx bx-car text-lg"></i>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-gray-900 dark:text-white">ส่งพนักงานขับรถไป</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">มอบหมายพนักงานขับรถให้การยืมครั้งนี้</div>
            </div>
            {mode === 'driver' && <i className="bx bxs-check-circle text-lg text-sky-500 shrink-0"></i>}
          </button>

          {mode === 'driver' && (
            <div className="pt-1 animate-fade-in">
              <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">เลือกพนักงานขับรถ</label>
              <Select value={driverId} onChange={v => { setDriverId(v); setError('') }}
                icon="bx-user-pin" placeholder="— เลือกพนักงานขับรถ —"
                options={drivers.map(d => ({ value: d.id, label: d.phone ? `${d.name} (${d.phone})` : d.name }))} />
              {drivers.length === 0 && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <i className="bx bx-info-circle text-sm"></i>
                  ยังไม่มีพนักงานขับรถในระบบ — เพิ่มได้ที่เมนู "ผู้ใช้"
                </p>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <i className="bx bx-error-circle text-base shrink-0"></i>
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-5">
          <button type="button" onClick={confirm} disabled={saving || !canConfirm}
            className="flex-1 h-11 inline-flex items-center justify-center gap-2 px-5 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 active:from-emerald-600 active:to-emerald-700 shadow-md shadow-emerald-200/50 hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? <i className="bx bx-loader-alt text-base animate-spin"></i> : <i className="bx bx-check text-base"></i>}
            <span>{saving ? 'กำลังอนุมัติ...' : 'ยืนยันอนุมัติ'}</span>
          </button>
          <button type="button" onClick={onClose} disabled={saving}
            className="h-11 px-5 inline-flex items-center justify-center rounded-xl text-sm font-medium text-neutral-600 dark:text-gray-400 bg-neutral-100 dark:bg-gray-700 hover:bg-neutral-200 dark:hover:bg-gray-600 transition-all duration-200 disabled:opacity-50">
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  )
}
