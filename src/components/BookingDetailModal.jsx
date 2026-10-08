import React, { useState, useEffect, useRef } from 'react'
import { STATUS_COLORS, statusLabel } from '../lib/constants'

export default function BookingDetailModal({
  booking,
  publicMode,
  canManageBookings,
  onClose,
  onActionDone,
  setToast,
  onAdminApprove,
  onOpenRejectModal,
  onAdminReturn,
}) {
  const [returnIdCard, setReturnIdCard] = useState('')
  const [returnLoading, setReturnLoading] = useState(false)
  const [returnFormExiting, setReturnFormExiting] = useState(false)
  const [cancelIdCard, setCancelIdCard] = useState('')
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelFormExiting, setCancelFormExiting] = useState(false)
  const returnExitTimer = useRef(null)
  const cancelExitTimer = useRef(null)

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (returnExitTimer.current) clearTimeout(returnExitTimer.current)
      if (cancelExitTimer.current) clearTimeout(cancelExitTimer.current)
    }
  }, [])

  // Body overflow + Escape key
  useEffect(() => {
    if (booking) {
      document.body.style.overflow = 'hidden'
      function handleKey(e) {
        if (e.key === 'Escape') onClose()
      }
      document.addEventListener('keydown', handleKey)
      return () => {
        document.body.style.overflow = ''
        document.removeEventListener('keydown', handleKey)
      }
    }
    document.body.style.overflow = ''
    setReturnIdCard('')
    setReturnLoading(false)
    setReturnFormExiting(false)
    setCancelIdCard('')
    setCancelLoading(false)
    setCancelFormExiting(false)
    if (returnExitTimer.current) clearTimeout(returnExitTimer.current)
    if (cancelExitTimer.current) clearTimeout(cancelExitTimer.current)
    return () => {}
  }, [booking, onClose])

  async function publicReturn() {
    if (!returnIdCard.trim()) {
      setToast({ type: 'error', submessage: 'กรุณากรอกเลขบัตรประชาชน' })
      return
    }
    setReturnLoading(true)
    try {
      const res = await fetch(`/api/public/bookings/${booking.id}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_card: returnIdCard.trim() }),
      })
      const d = await res.json()
      if (!res.ok) {
        setToast({ type: 'error', submessage: d.error })
        return
      }
      setToast({ type: 'success', submessage: 'คืนรถสำเร็จ' })
      setReturnIdCard('')
      onClose()
      if (onActionDone) onActionDone()
    } catch {
      setToast({ type: 'error', submessage: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
    } finally {
      setReturnLoading(false)
    }
  }

  async function publicCancel() {
    if (!cancelIdCard.trim()) {
      setToast({ type: 'error', submessage: 'กรุณากรอกเลขบัตรประชาชน' })
      return
    }
    setCancelLoading(true)
    try {
      const res = await fetch(`/api/public/bookings/${booking.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_card: cancelIdCard.trim() }),
      })
      const d = await res.json()
      if (!res.ok) {
        setToast({ type: 'error', submessage: d.error })
        return
      }
      setToast({ type: 'success', submessage: 'ยกเลิกการจองสำเร็จ' })
      setCancelIdCard('')
      onClose()
      if (onActionDone) onActionDone()
    } catch {
      setToast({ type: 'error', submessage: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
    } finally {
      setCancelLoading(false)
    }
  }

  if (!booking) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" />
      <div className="relative bg-white dark:bg-gray-800 w-full sm:max-w-sm rounded-2xl shadow-2xl border sm:border border-neutral-200 dark:border-gray-700 overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}>

        {/* Status accent bar */}
        <div className="h-[3px] w-full" style={{ backgroundColor: STATUS_COLORS[booking.status] || '#6b7280' }} />

        {/* Close button — floating */}
        <button onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-xl flex items-center justify-center bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-neutral-400 hover:text-neutral-600 dark:hover:text-gray-300 transition-all">
          <i className="bx bx-x text-lg"></i>
        </button>

        {/* Car hero section */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-stretch gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white shadow-lg shadow-brand-500/30 shrink-0">
              <i className="bx bx-car text-2xl"></i>
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="font-bold text-lg text-neutral-800 dark:text-white leading-tight truncate">
                {booking.brand} {booking.model}
              </div>
              <div className="mt-1">
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md"
                  style={{
                    backgroundColor: (STATUS_COLORS[booking.status] || '#6b7280') + '1A',
                    color: STATUS_COLORS[booking.status] || '#6b7280',
                  }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[booking.status] || '#6b7280' }} />
                  {statusLabel(booking.status)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-5 h-px bg-gradient-to-r from-transparent via-neutral-200 dark:via-gray-700 to-transparent" />

        {/* Info rows */}
        <div className="px-5 py-4 space-y-3">
          {/* License plate row */}
          <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-neutral-50 dark:bg-gray-700/40">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <i className="bx bx-id-card text-base"></i>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-medium text-neutral-400 dark:text-gray-500 uppercase tracking-wider">ทะเบียนรถ</div>
              <div className="text-sm font-medium text-neutral-800 dark:text-white truncate">{booking.license_plate}</div>
            </div>
          </div>

          {/* User row */}
          <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-neutral-50 dark:bg-gray-700/40">
            <div className="w-9 h-9 rounded-lg bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-brand-600 dark:text-brand-400 shrink-0">
              <i className="bx bx-user text-base"></i>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-medium text-neutral-400 dark:text-gray-500 uppercase tracking-wider">ผู้ยืม</div>
              <div className="text-sm font-medium text-neutral-800 dark:text-white truncate">{booking.user_name}</div>
            </div>
          </div>

          {/* Date row */}
          <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-neutral-50 dark:bg-gray-700/40">
            <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <i className="bx bx-calendar text-base"></i>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-medium text-neutral-400 dark:text-gray-500 uppercase tracking-wider">วันที่</div>
              <div className="text-sm font-medium text-neutral-800 dark:text-white flex items-center gap-1.5">
                <span>{new Date(booking.start_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <span className="text-neutral-300 dark:text-gray-600">→</span>
                <span>{new Date(booking.end_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
            </div>
          </div>

          {/* Purpose */}
          {booking.purpose && (
            <div className="relative px-3.5 py-3 rounded-xl bg-neutral-50 dark:bg-gray-700/40">
              <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-brand-300 dark:bg-brand-600"></div>
              <div className="pl-3">
                <div className="text-[10px] font-medium text-neutral-400 dark:text-gray-500 uppercase tracking-wider mb-1">วัตถุประสงค์</div>
                <div className="text-sm text-neutral-700 dark:text-gray-300 leading-relaxed">{booking.purpose}</div>
              </div>
            </div>
          )}

          {/* Destination */}
          {(booking.destination_place || booking.destination_district || booking.destination_province) && (
            <div className="flex items-start gap-3 px-3.5 py-3 rounded-xl bg-neutral-50 dark:bg-gray-700/40">
              <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <i className="bx bx-map text-base"></i>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-medium text-neutral-400 dark:text-gray-500 uppercase tracking-wider">สถานที่จะไป</div>
                <div className="text-sm font-medium text-neutral-800 dark:text-white">
                  {[booking.destination_place, booking.destination_district, booking.destination_province].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>
          )}

          {/* Attendees */}
          {booking.attendees > 0 && (
            <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-neutral-50 dark:bg-gray-700/40">
              <div className="w-9 h-9 rounded-lg bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center text-teal-600 dark:text-teal-400 shrink-0">
                <i className="bx bx-group text-base"></i>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-medium text-neutral-400 dark:text-gray-500 uppercase tracking-wider">จำนวนผู้ไปราชการ</div>
                <div className="text-sm font-medium text-neutral-800 dark:text-white">{booking.attendees} คน</div>
              </div>
            </div>
          )}

          {/* Driver — only meaningful once approved */}
          {booking.status === 'approved' && (
            <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-neutral-50 dark:bg-gray-700/40">
              <div className="w-9 h-9 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
                <i className="bx bx-car text-base"></i>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-medium text-neutral-400 dark:text-gray-500 uppercase tracking-wider">ผู้ขับขี่</div>
                <div className="text-sm font-medium text-neutral-800 dark:text-white truncate">
                  {booking.driver_name ? `พนักงานขับรถ: ${booking.driver_name}` : 'ผู้ยืมขับเอง'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Return ID card form */}
        {publicMode && booking.status === 'approved' && (returnIdCard === 'show' || returnFormExiting) && (
          <div className={`mx-5 mb-3 p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 motion-safe:${returnFormExiting ? 'animate-scale-out' : 'animate-scale-in'}`}>
            <label className="block text-xs font-medium text-blue-700 dark:text-blue-300 mb-2">
              <i className="bx bx-lock-alt text-xs mr-1"></i>
              ยืนยันตัวตนด้วยเลขบัตรประชาชน
            </label>
            <div className="flex gap-2">
              <input value={returnIdCard === 'show' ? '' : returnIdCard} onChange={e => setReturnIdCard(e.target.value)}
                className="flex-1 h-10 px-3 rounded-lg bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 text-sm text-neutral-800 dark:text-white placeholder:text-blue-300 dark:placeholder:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all"
                placeholder="เลขบัตรประชาชน 13 หลัก"
                disabled={returnLoading} />
              <button onClick={publicReturn} disabled={returnLoading || returnIdCard === 'show' || !returnIdCard.trim()}
                className="h-10 px-4 inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 shadow-sm">
                {returnLoading ? (
                  <i className="bx bx-loader-alt text-sm animate-spin"></i>
                ) : (
                  <i className="bx bx-check text-sm"></i>
                )}
                <span>ยืนยัน</span>
              </button>
            </div>
          </div>
        )}

        {/* Cancel ID card form */}
        {publicMode && booking.status === 'pending' && (cancelIdCard === 'show' || cancelFormExiting) && (
          <div className={`mx-5 mb-3 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 motion-safe:${cancelFormExiting ? 'animate-scale-out' : 'animate-scale-in'}`}>
            <label className="block text-xs font-medium text-rose-700 dark:text-rose-300 mb-2">
              <i className="bx bx-lock-alt text-xs mr-1"></i>
              ยืนยันตัวตนด้วยเลขบัตรประชาชน
            </label>
            <div className="flex gap-2">
              <input value={cancelIdCard === 'show' ? '' : cancelIdCard} onChange={e => setCancelIdCard(e.target.value)}
                className="flex-1 h-10 px-3 rounded-lg bg-white dark:bg-gray-800 border border-rose-200 dark:border-rose-800 text-sm text-neutral-800 dark:text-white placeholder:text-rose-300 dark:placeholder:text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-300 transition-all"
                placeholder="เลขบัตรประชาชน 13 หลัก"
                disabled={cancelLoading} />
              <button onClick={publicCancel} disabled={cancelLoading || cancelIdCard === 'show' || !cancelIdCard.trim()}
                className="h-10 px-4 inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 shadow-sm">
                {cancelLoading ? (
                  <i className="bx bx-loader-alt text-sm animate-spin"></i>
                ) : (
                  <i className="bx bx-check text-sm"></i>
                )}
                <span>ยืนยัน</span>
              </button>
            </div>
          </div>
        )}

        {/* Admin notes */}
        {!publicMode && booking.admin_notes && (
          <div className="px-5 pt-2 pb-2 -mt-1">
            <div className="text-[10px] text-neutral-400 dark:text-gray-500 flex items-center gap-1">
              <i className="bx bx-notepad text-xs"></i>
              หมายเหตุ: {booking.admin_notes}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="px-5 py-4 bg-neutral-50/80 dark:bg-gray-900/30 border-t border-neutral-100 dark:border-gray-700/50">
          {canManageBookings && booking.status === 'pending' ? (
            <div className="flex gap-2">
              <button onClick={() => onAdminApprove(booking.id)}
                className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 active:from-emerald-700 active:to-emerald-600 shadow-md shadow-emerald-200/50 hover:shadow-lg transition-all">
                <i className="bx bx-check text-sm"></i>
                อนุมัติ
              </button>
              <button onClick={onOpenRejectModal}
                className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-900/20 active:bg-rose-100 transition-all">
                <i className="bx bx-x text-sm"></i>
                ปฏิเสธ
              </button>
            </div>
          ) : canManageBookings && booking.status === 'approved' ? (
            <button onClick={() => onAdminReturn(booking.id)}
              className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-md shadow-blue-200/50 hover:shadow-lg transition-all">
              <i className="bx bx-refresh text-sm"></i>
              คืนรถ
            </button>
          ) : publicMode && booking.status === 'approved' ? (
            <div>
              {returnIdCard !== 'show' ? (
                <button onClick={() => setReturnIdCard('show')}
                  className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 active:from-blue-700 active:to-blue-600 shadow-md shadow-blue-200/50 hover:shadow-lg transition-all">
                  <i className="bx bx-refresh text-sm"></i>
                  คืนรถ
                </button>
              ) : (
                <button onClick={() => {
                  setReturnFormExiting(true)
                  returnExitTimer.current = setTimeout(() => {
                    setReturnIdCard('')
                    setReturnLoading(false)
                    setReturnFormExiting(false)
                  }, 250)
                }}
                  className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-neutral-500 dark:text-gray-400 border border-neutral-200 dark:border-gray-600 hover:bg-neutral-100 dark:hover:bg-gray-700 active:bg-neutral-200 transition-all">
                  <i className="bx bx-chevron-left text-sm"></i>
                  กลับ
                </button>
              )}
            </div>
          ) : publicMode && booking.status === 'pending' ? (
            <div>
              {cancelIdCard !== 'show' ? (
                <button onClick={() => setCancelIdCard('show')}
                  className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 active:from-rose-700 active:to-rose-600 shadow-md shadow-rose-200/50 hover:shadow-lg transition-all">
                  <i className="bx bx-x-circle text-sm"></i>
                  ยกเลิกการจอง
                </button>
              ) : (
                <button onClick={() => {
                  setCancelFormExiting(true)
                  cancelExitTimer.current = setTimeout(() => {
                    setCancelIdCard('')
                    setCancelLoading(false)
                    setCancelFormExiting(false)
                  }, 250)
                }}
                  className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-neutral-500 dark:text-gray-400 border border-neutral-200 dark:border-gray-600 hover:bg-neutral-100 dark:hover:bg-gray-700 active:bg-neutral-200 transition-all">
                  <i className="bx bx-chevron-left text-sm"></i>
                  กลับ
                </button>
              )}
            </div>
          ) : (
            <button onClick={onClose}
              className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-neutral-500 dark:text-gray-400 border border-neutral-200 dark:border-gray-600 hover:bg-neutral-100 dark:hover:bg-gray-700 active:bg-neutral-200 transition-all">
              <i className="bx bx-x text-sm"></i>
              ปิด
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
