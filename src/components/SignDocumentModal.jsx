import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../context/AppContext'
import SignaturePad from './SignaturePad'
import DriverSelect from './DriverSelect'
import { driverStageKeys, formatBookingRange, docLabel, carLabel } from '../lib/constants'
import { useStageTitle } from '../lib/docSettings'
import { useSavedSignature } from '../lib/savedSignature'
import { useDialog, dialogProps } from '../lib/useDialog'

// Mirrors api/lib/signing.cjs's stageCanReject — only the two stages whose
// paper form has an "อนุญาต/ไม่อนุญาต" checkbox may reject a request outright.
const DECISION_STAGE_KEYS = ['deputy_director', 'director']

/** The "เซ็นเอกสาร" modal: shows the loan document's key fields, captures a
 * signature, then PUTs /api/signing/:id/sign with the decision. The signer's
 * position is the stage itself (its title prints on the PDF), so it isn't asked.
 * Opened from BookingsManage's list rows — the sign queue used to be its own
 * "เอกสารรอเซ็น" tab; it now lives inline in the list.
 *
 * The first three stages (the ones responsible for the vehicle) also decide who
 * drives as part of signing; later stages see the choice but don't set it. */
export default function SignDocumentModal({ booking, onClose, onSigned }) {
  const { authHeaders } = useApp()
  const stageTitle = useStageTitle()
  const [signature, setSignature] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [drivers, setDrivers] = useState([])
  // Tied to the booking it was computed for (see ApproveBookingModal).
  const [recommended, setRecommended] = useState({ bookingId: null, id: null })
  const recommendedId = recommended.bookingId === booking?.id ? recommended.id : null
  const [driverMode, setDriverMode] = useState('driver')
  const [driverId, setDriverId] = useState('')
  // A signature saved on the account (navbar → ลายเซ็นของฉัน) fills the
  // signature in one tap; otherwise the drawn one can be kept for next time.
  const saved = useSavedSignature(authHeaders)
  const [usingSaved, setUsingSaved] = useState(false)
  const [remember, setRemember] = useState(false)

  // Inside the parallel window approval_stage keeps pointing at the first
  // member, so the queue tells us (sign_stage) which stage THIS user signs as.
  const actionStage = booking?.sign_stage || booking?.approval_stage
  const canReject = DECISION_STAGE_KEYS.includes(actionStage)
  const assignsDriver = driverStageKeys(booking).includes(actionStage)

  // Reset the form every time a new document is opened.
  useEffect(() => {
    if (!booking) return
    setSignature('')
    setUsingSaved(false)
    setRemember(false)
    setSaving(false)
    setError('')
    // Default to assigning a driver; keep "ผู้ยืมขับเอง" only when an earlier
    // signer already chose it for this document.
    setDriverMode(booking.self_drive && !booking.driver_id ? 'self' : 'driver')
    setDriverId(booking.driver_id || '')
  }, [booking])

  // The driver roster is only relevant to the first three stages.
  useEffect(() => {
    if (!booking || !assignsDriver) return
    let cancelled = false
    fetch(`/api/signing/drivers?booking_id=${encodeURIComponent(booking.id)}`, { headers: authHeaders() })
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        setDrivers(data.drivers || [])
        setRecommended({ bookingId: booking.id, id: data.recommended_id || null })
      })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking, assignsDriver])

  // Nobody chosen yet (no earlier signer picked one): start on the suggestion.
  useEffect(() => {
    if (assignsDriver && driverMode === 'driver' && !driverId && recommendedId) setDriverId(recommendedId)
  }, [assignsDriver, driverMode, driverId, recommendedId])

  const panelRef = useRef(null)
  useDialog(!!booking, () => !saving && onClose(), panelRef)

  if (!booking) return null

  async function submitDecision(decision) {
    if (saving) return
    if (!signature) {
      setError('กรุณาเซ็นชื่อหรืออัปโหลดรูปลายเซ็นก่อนยืนยัน')
      return
    }
    if (decision === 'approve' && assignsDriver && driverMode === 'driver' && !driverId) {
      setError('กรุณาเลือกพนักงานขับรถ หรือเลือกให้ผู้ยืมขับเอง')
      return
    }
    if (decision === 'approve' && assignsDriver && driverMode === 'driver' && drivers.find(d => d.id === driverId)?.busy) {
      setError('พนักงานขับรถที่เลือกติดงานในช่วงเวลานี้ กรุณาเลือกคนอื่น หรือให้ผู้ยืมขับเอง')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/signing/${booking.id}/sign`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision, signature,
          // Only the first three stages record the driver — later signers leave
          // whatever was already chosen untouched.
          ...(decision === 'approve' && assignsDriver
            ? { self_drive: driverMode === 'self', driver_id: driverMode === 'driver' ? driverId : null }
            : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่')
        return
      }
      // Keeping the signature for next time never blocks the signing itself.
      if (remember && !usingSaved) saved.save(signature).catch(() => {})
      // The chain may still have later stages to sign, so only call it fully
      // approved once the backend says so (the final stage approves it).
      onSigned(decision === 'reject'
        ? 'ไม่อนุญาตคำขอนี้แล้ว'
        : data.status === 'approved'
          ? 'อนุมัติคำขอยืมเรียบร้อย'
          : 'เซ็นเอกสารเรียบร้อย — ส่งต่อให้ผู้เซ็นท่านถัดไป')
    } catch {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  // Portalled to <body> so no parent layout can shift the full-screen
  // backdrop — e.g. a `space-y-*` parent gives it a top margin, leaving an
  // unblurred strip at the top of the screen.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !saving && onClose()}>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div ref={panelRef} {...dialogProps('เซ็นเอกสาร')} className="card p-6 w-full max-w-lg relative animate-scale-in max-h-[70vh] sm:max-h-[92vh] overflow-y-auto scrollbar-none" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-border-light dark:border-border-dark">
          <div>
            <h3 className="font-heading font-semibold text-base text-gray-900 dark:text-white">เซ็นเอกสารเลขที่ {docLabel(booking) || '-'}</h3>
            <p className="text-xs text-neutral-500">ในฐานะ{stageTitle(actionStage)} — ตรวจสอบข้อมูลแล้วลงลายมือชื่อยืนยัน</p>
          </div>
          <button onClick={() => !saving && onClose()} aria-label="ปิด"
            className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-gray-700 text-neutral-400 transition-colors">
            <i aria-hidden="true" className="bx bx-x text-xl"></i>
          </button>
        </div>

        <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-4 border border-gray-100 dark:border-gray-700 space-y-1.5 text-sm mb-4">
          <div className="flex justify-between gap-3">
            <span className="text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap">ผู้ยืม</span>
            <span className="font-medium text-gray-900 dark:text-white text-right min-w-0">{booking.user_name}{booking.user_position ? ` (${booking.user_position})` : ''}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap">ยานพาหนะ</span>
            <span className="font-medium text-gray-900 dark:text-white text-right min-w-0">{carLabel(booking)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap">ช่วงวันที่ใช้รถ</span>
            <span className="font-medium text-gray-900 dark:text-white text-right min-w-0">{formatBookingRange(booking)}</span>
          </div>
          {booking.purpose && (
            <div className="flex justify-between gap-3">
              <span className="text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap">เหตุผล</span>
              <span className="font-medium text-gray-900 dark:text-white text-right min-w-0">{booking.purpose}</span>
            </div>
          )}
        </div>

        {assignsDriver && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">ผู้ขับขี่</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDriverMode('driver')}
                className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all ${
                  driverMode === 'driver'
                    ? 'border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}>
                <i aria-hidden="true" className={`bx bx-car text-lg ${driverMode === 'driver' ? 'text-sky-500' : 'text-gray-400'}`}></i>
                <span className="text-xs font-semibold text-gray-900 dark:text-white">มอบหมายพนักงานขับรถ</span>
              </button>
              <button type="button" onClick={() => setDriverMode('self')}
                className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all ${
                  driverMode === 'self'
                    ? 'border-brand-400 bg-brand-50 dark:border-brand-500 dark:bg-brand-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}>
                <i aria-hidden="true" className={`bx bx-user text-lg ${driverMode === 'self' ? 'text-brand-500' : 'text-gray-400'}`}></i>
                <span className="text-xs font-semibold text-gray-900 dark:text-white">ผู้ยืมขับเอง</span>
              </button>
            </div>
            {driverMode === 'driver' && (
              <div className="mt-2 animate-fade-in">
                <DriverSelect drivers={drivers} recommendedId={recommendedId} value={driverId} onChange={(v) => { setDriverId(v); setError('') }} />
                {drivers.length === 0 && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <i aria-hidden="true" className="bx bx-info-circle text-sm"></i>
                    ยังไม่มีพนักงานขับรถในระบบ — เพิ่มได้ที่ ตั้งค่า → ผู้ใช้
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mb-5">
          <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">ลายเซ็น</label>
          {usingSaved ? (
            <div className="rounded-xl border-2 border-brand-300 dark:border-brand-600 bg-white p-3">
              <div className="h-28 flex items-center justify-center">
                <img src={saved.signature} alt="ลายเซ็นที่บันทึกไว้" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t border-gray-100">
                <span className="text-xs text-brand-700 font-medium flex items-center gap-1">
                  <i aria-hidden="true" className="bx bx-check-circle text-sm"></i> ใช้ลายเซ็นที่บันทึกไว้
                </span>
                <button type="button" onClick={() => { setUsingSaved(false); setSignature('') }}
                  className="text-xs font-medium text-gray-500 hover:text-brand-600 flex items-center gap-1">
                  <i aria-hidden="true" className="bx bx-pencil text-sm"></i> เซ็นใหม่แทน
                </button>
              </div>
            </div>
          ) : (
            <>
              {saved.signature && (
                <button type="button" onClick={() => { setUsingSaved(true); setSignature(saved.signature); setError('') }}
                  className="w-full mb-3 flex items-center gap-3 p-2.5 rounded-xl border-2 border-brand-200 dark:border-brand-700 bg-brand-50/60 dark:bg-brand-900/20 hover:border-brand-400 dark:hover:border-brand-500 transition-colors text-left">
                  <span className="w-24 h-12 shrink-0 rounded-lg bg-white flex items-center justify-center overflow-hidden">
                    <img src={saved.signature} alt="" className="max-h-full max-w-full object-contain" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-brand-700 dark:text-brand-300">ใช้ลายเซ็นที่บันทึกไว้</span>
                    <span className="block text-[11px] text-gray-500 dark:text-gray-400">แตะเพื่อใส่ลายเซ็นของคุณทันที</span>
                  </span>
                  <i aria-hidden="true" className="bx bx-chevron-right text-xl text-brand-400 shrink-0"></i>
                </button>
              )}
              <SignaturePad value={signature} onChange={setSignature} />
              {saved.loaded && !saved.signature && signature && (
                <label className="mt-2 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                  <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-300" />
                  บันทึกลายเซ็นนี้ไว้ใช้ครั้งต่อไป
                </label>
              )}
            </>
          )}
        </div>

        {error && <p className="text-sm text-red-500 dark:text-red-400 mb-3">{error}</p>}

        <div className="flex gap-3">
          {canReject && (
            <button type="button" disabled={saving} onClick={() => submitDecision('reject')}
              className="h-11 px-5 inline-flex items-center justify-center rounded-xl text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all disabled:opacity-50">
              ไม่อนุญาต
            </button>
          )}
          <button type="button" disabled={saving || !signature} onClick={() => submitDecision('approve')}
            className="flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 shadow-md shadow-brand-200/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {saving && <i aria-hidden="true" className="bx bx-loader-alt text-base animate-spin"></i>}
            <span>{saving ? 'กำลังบันทึก...' : 'เซ็นยืนยัน'}</span>
          </button>
        </div>
      </div>
    </div>
  , document.body)
}
