import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { STATUS_COLORS, chainStepState, effectiveStatus, docLabel } from '../lib/constants'
import { useChainSteps, useAssignedSigners } from '../lib/docSettings'
import { useApp } from '../context/AppContext'

function fmtSignedAt(dateStr) {
  return new Date(dateStr).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Header status symbol — replaces the borrower avatar so the document's
// current state is readable at a glance. Colours follow STATUS_COLORS.
const STATUS_ICONS = {
  pending: 'bx-time-five',
  approved: 'bx-check-circle',
  rejected: 'bx-x-circle',
  cancelled: 'bx-x',
  returned: 'bx-rotate-left',
}

const STEP_STYLES = {
  signed: { icon: 'bx-check', className: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' },
  rejected: { icon: 'bx-x', className: 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400' },
  current: { icon: 'bx-time-five', className: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400' },
  waiting: { icon: 'bx-minus', className: 'bg-neutral-200 dark:bg-gray-600/40 text-neutral-400 dark:text-gray-500' },
  skipped: { icon: 'bx-minus', className: 'bg-neutral-100 dark:bg-gray-700/40 text-neutral-300 dark:text-gray-600' },
  paper: { icon: 'bx-printer', className: 'bg-sky-50 dark:bg-sky-900/30 text-sky-500 dark:text-sky-400' },
}

// Vertical timeline of the document's signatures. Admins get the raw chain
// (signer name/position); the public lookup only carries signed_at/decision
// per stage, so those rows fall back to a plain "เซ็นแล้ว". Stages still to
// sign show who is assigned to them (`assigned`, admin/staff only).
function SignatureChain({ booking, assigned = {} }) {
  const CHAIN_STEPS = useChainSteps()
  return (
    <div className="col-span-2 px-3.5 py-2.5 rounded-xl bg-neutral-50 dark:bg-gray-700/40">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-neutral-400 dark:text-gray-500 uppercase tracking-wider">ลำดับการเซ็นเอกสาร</span>
        {booking.doc_number && (
          <span className="text-[10px] font-medium text-neutral-400 dark:text-gray-500">เลขที่ {docLabel(booking)}</span>
        )}
      </div>
      <ol>
        {CHAIN_STEPS.map((step, i) => {
          const entry = booking.signatures?.[step.key]
          const state = chainStepState(booking, step.key)
          const { icon, className } = STEP_STYLES[state]
          const isLast = i === CHAIN_STEPS.length - 1

          return (
            <li key={step.key} className="relative flex items-start gap-2.5 pb-2.5 last:pb-0">
              {/* Connector to the next step — green once this one is signed. */}
              {!isLast && (
                <span aria-hidden="true"
                  className={`absolute left-3 top-6 bottom-0 w-px -translate-x-1/2 ${state === 'signed' ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-neutral-200 dark:bg-gray-600'}`} />
              )}
              <div className={`relative w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${className}`}>
                {state === 'current' && (
                  <span aria-hidden="true" className="absolute inset-0 rounded-full bg-amber-300/50 dark:bg-amber-500/30 motion-safe:animate-ping" />
                )}
                <i className={`relative bx ${icon} text-sm`}></i>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-medium truncate ${state === 'skipped' ? 'text-neutral-400 dark:text-gray-500' : 'text-neutral-700 dark:text-gray-200'}`}>{step.title}</span>
                  {entry?.signed_at && (
                    <span className="text-[10px] text-neutral-400 dark:text-gray-500 shrink-0">{fmtSignedAt(entry.signed_at)}</span>
                  )}
                </div>
                {entry ? (
                  <div className="text-[11px] text-neutral-500 dark:text-gray-400 truncate">
                    {entry.name
                      ? <>{entry.name}{entry.position ? ` · ${entry.position}` : ''}</>
                      : state === 'rejected' ? null : 'เซ็นแล้ว'}
                    {state === 'rejected' && <span className={`${entry.name ? 'ml-1.5 ' : ''}text-rose-500 dark:text-rose-400 font-medium`}>ไม่อนุญาต</span>}
                  </div>
                ) : state === 'paper' ? (
                  <div className="text-[11px] text-sky-600 dark:text-sky-400 truncate">
                    เซ็นบนเอกสารจริง{booking.paper_signers?.[step.key] ? ` · ${booking.paper_signers[step.key]}` : ''}
                  </div>
                ) : state === 'current' ? (
                  <div className="text-[11px] text-amber-600 dark:text-amber-400 truncate">
                    รอดำเนินการ{assigned[step.key] && <span className="text-neutral-500 dark:text-gray-400"> · {assigned[step.key]}</span>}
                  </div>
                ) : state === 'skipped' ? (
                  <div className="text-[11px] text-neutral-300 dark:text-gray-600">ไม่ต้องดำเนินการ</div>
                ) : (
                  <div className="text-[11px] text-neutral-400 dark:text-gray-500 truncate">
                    ยังไม่ถึงคิว{assigned[step.key] ? ` · ${assigned[step.key]}` : ''}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// Strip the separators people type in phone numbers, matching the backend's
// normalizePhone() in api/routes/public.cjs.
function normalizePhone(value) {
  return String(value || '').replace(/[\s-]/g, '')
}

// Fetches the booking's rendered PDF (api/lib/pdf.cjs) as a blob URL — a plain
// `src` can't carry an Authorization header or a POST body — and shows it as
// an inline preview on desktop or open/download buttons on mobile. Only shown
// once the booking has a doc_number (went through the signing flow).
//
// Admin/staff fetch the protected endpoint with their bearer token. The public
// endpoint releases the document only for the borrower's phone number (the PDF
// prints it, and it is the cancel/return credential), so a lookup made by
// phone opens straight away while one made by name asks for the phone first.
function PdfPreview({ bookingId, docNumber, authHeaders, wide, publicMode, lookupQuery }) {
  const [pdfUrl, setPdfUrl] = useState(null)
  const [error, setError] = useState(false)
  const lookupIsPhone = /^\+?\d{6,}$/.test(normalizePhone(lookupQuery))
  const [phone, setPhone] = useState(lookupIsPhone ? lookupQuery : '')
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneDenied, setPhoneDenied] = useState(false)
  const needsPhone = publicMode && !phone

  useEffect(() => {
    if (needsPhone) return
    let cancelled = false
    let objectUrl = null
    setPdfUrl(null)
    setError(false)

    const request = publicMode
      ? fetch(`/api/public/bookings/${bookingId}/pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        })
      : fetch(`/api/bookings/${bookingId}/pdf`, { headers: authHeaders() })

    request
      .then(res => {
        if (publicMode && res.status === 403) {
          if (!cancelled) { setPhoneDenied(true); setPhone('') }
          return null
        }
        if (!res.ok) throw new Error('pdf fetch failed')
        return res.blob()
      })
      .then(blob => {
        if (cancelled || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setPdfUrl(objectUrl)
      })
      .catch(() => { if (!cancelled) setError(true) })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [bookingId, authHeaders, publicMode, phone, needsPhone])

  function submitPhone(e) {
    e.preventDefault()
    if (!phoneInput.trim()) return
    setPhoneDenied(false)
    setPhone(phoneInput.trim())
  }

  const fileName = `booking-${docNumber || bookingId}.pdf`
  const gate = needsPhone && (
    <PhoneGate value={phoneInput} onChange={setPhoneInput} onSubmit={submitPhone} denied={phoneDenied} />
  )

  return (
    <>
      {/* Desktop: inline preview in the left column. */}
      <div className={`hidden sm:flex sm:flex-[1.6] min-h-0 flex-col border-b sm:border-b-0 sm:border-r border-neutral-100 dark:border-gray-700 bg-neutral-50 dark:bg-gray-900/40 ${wide ? 'h-full' : ''}`}>
        <div className="px-4 pt-4 pb-2 flex items-center justify-between shrink-0">
          <span className="text-xs font-semibold text-neutral-500 dark:text-gray-400 flex items-center gap-1.5">
            <i className="bx bxs-file-pdf text-sm text-rose-500"></i>
            ตัวอย่างเอกสาร
          </span>
          {pdfUrl && (
            <a href={pdfUrl} download={fileName}
              className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
              <i className="bx bx-download text-xs"></i> ดาวน์โหลด
            </a>
          )}
        </div>
        <div className="flex-1 min-h-0 px-3 pb-3">
          {needsPhone ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-white dark:bg-gray-800 border border-neutral-200 dark:border-gray-700 flex items-center justify-center text-neutral-400 dark:text-gray-500 mb-3">
                <i className="bx bx-lock-alt text-2xl"></i>
              </div>
              <p className="text-sm font-medium text-neutral-700 dark:text-gray-200">กรอกเบอร์โทรศัพท์เพื่อดูเอกสาร</p>
              <p className="text-xs text-neutral-400 dark:text-gray-500 mt-1 mb-4">ใช้เบอร์เดียวกับที่กรอกตอนส่งคำขอยืม</p>
              <div className="w-full max-w-xs">{gate}</div>
            </div>
          ) : error ? (
            <div className="w-full h-full flex items-center justify-center text-xs text-neutral-400 dark:text-gray-500 text-center px-4">
              ไม่สามารถโหลดตัวอย่างเอกสารได้
            </div>
          ) : pdfUrl ? (
            <iframe src={pdfUrl} title="เอกสารขออนุญาตใช้รถ"
              className="w-full h-full rounded-lg border border-neutral-200 dark:border-gray-700 bg-white" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <i className="bx bx-loader-alt text-xl animate-spin text-neutral-300 dark:text-gray-600"></i>
            </div>
          )}
        </div>
      </div>

      {/* Mobile: phone browsers can't reliably render a PDF inside an iframe,
          so a bar pinned under the details offers open-in-new-tab (the
          browser's own PDF viewer) and download instead. */}
      <div className="sm:hidden order-last shrink-0 px-4 py-3 border-t border-neutral-100 dark:border-gray-700 bg-neutral-50 dark:bg-gray-900/40">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-semibold text-neutral-500 dark:text-gray-400 flex items-center gap-1.5">
            <i className="bx bxs-file-pdf text-sm text-rose-500"></i>
            เอกสารขออนุญาตใช้รถ
          </span>
          {docNumber && <span className="text-[11px] text-neutral-400 dark:text-gray-500">เลขที่ {docNumber}</span>}
        </div>
        {needsPhone ? (
          <>
            <p className="text-[11px] text-neutral-400 dark:text-gray-500 mb-2">กรอกเบอร์โทรศัพท์ที่ใช้ตอนส่งคำขอเพื่อดูเอกสาร</p>
            {gate}
          </>
        ) : error ? (
          <p className="text-xs text-neutral-400 dark:text-gray-500">ไม่สามารถโหลดเอกสารได้ กรุณาลองใหม่อีกครั้ง</p>
        ) : pdfUrl ? (
          <div className="grid grid-cols-2 gap-2">
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
              className="h-11 rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 transition-colors">
              <i className="bx bx-show text-base"></i> เปิดเอกสาร
            </a>
            <a href={pdfUrl} download={fileName}
              className="h-11 rounded-xl inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-brand-700 dark:text-brand-300 bg-white dark:bg-gray-800 border border-neutral-200 dark:border-gray-700 hover:bg-neutral-100 dark:hover:bg-gray-700 transition-colors">
              <i className="bx bx-download text-base"></i> ดาวน์โหลด
            </a>
          </div>
        ) : (
          <div className="h-11 flex items-center justify-center gap-2 text-xs text-neutral-400 dark:text-gray-500">
            <i className="bx bx-loader-alt text-base animate-spin"></i> กำลังเตรียมเอกสาร…
          </div>
        )}
      </div>
    </>
  )
}

// Phone-number form gating the public PDF — shared by the desktop panel and
// the mobile document bar.
function PhoneGate({ value, onChange, onSubmit, denied }) {
  return (
    <form onSubmit={onSubmit}>
      <div className="flex gap-2">
        <input value={value} onChange={e => onChange(e.target.value)} type="tel" inputMode="tel" autoComplete="tel"
          placeholder="เบอร์โทรศัพท์" aria-label="เบอร์โทรศัพท์" aria-invalid={denied}
          className={`flex-1 min-w-0 h-11 sm:h-10 px-3 rounded-lg bg-white dark:bg-gray-800 border text-sm text-neutral-800 dark:text-white placeholder:text-neutral-300 dark:placeholder:text-gray-600 focus:outline-none focus:ring-2 transition-all ${denied ? 'border-red-300 dark:border-red-700 focus:ring-red-100 dark:focus:ring-red-900/40' : 'border-neutral-200 dark:border-gray-700 focus:ring-brand-200 dark:focus:ring-brand-900/40'}`} />
        <button type="submit" disabled={!value.trim()}
          className="h-11 sm:h-10 px-4 rounded-lg text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          ดูเอกสาร
        </button>
      </div>
      {denied && (
        <p role="alert" className="text-xs text-red-500 dark:text-red-400 mt-2">เบอร์โทรศัพท์ไม่ตรงกับคำขอนี้</p>
      )}
    </form>
  )
}

export default function BookingDetailModal({
  booking,
  publicMode,
  lookupQuery,
  canManageBookings,
  canSign,
  onClose,
  onActionDone,
  setToast,
  onAdminApprove,
  onOpenRejectModal,
  onAdminReturn,
}) {
  const { authHeaders } = useApp()
  const assignedSigners = useAssignedSigners(publicMode ? undefined : authHeaders(), !publicMode)
  // Admins always see the document. In public mode only the lookup-opened
  // modal offers it (PdfPreview then needs the borrower's phone) — the public
  // calendar's detail stays document-free.
  const showPdf = !!booking?.doc_number && (!publicMode || !!lookupQuery)
  const [returnPhone, setReturnPhone] = useState('')
  const [returnLoading, setReturnLoading] = useState(false)
  const [returnFormExiting, setReturnFormExiting] = useState(false)
  const [cancelPhone, setCancelPhone] = useState('')
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
    setReturnPhone('')
    setReturnLoading(false)
    setReturnFormExiting(false)
    setCancelPhone('')
    setCancelLoading(false)
    setCancelFormExiting(false)
    if (returnExitTimer.current) clearTimeout(returnExitTimer.current)
    if (cancelExitTimer.current) clearTimeout(cancelExitTimer.current)
    return () => {}
  }, [booking, onClose])

  async function publicReturn() {
    if (!returnPhone.trim()) {
      setToast({ type: 'error', submessage: 'กรุณากรอกเบอร์โทรศัพท์' })
      return
    }
    setReturnLoading(true)
    try {
      const res = await fetch(`/api/public/bookings/${booking.id}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: returnPhone.trim() }),
      })
      const d = await res.json()
      if (!res.ok) {
        setToast({ type: 'error', submessage: d.error })
        return
      }
      setToast({ type: 'success', submessage: 'คืนรถสำเร็จ' })
      setReturnPhone('')
      onClose()
      if (onActionDone) onActionDone()
    } catch {
      setToast({ type: 'error', submessage: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
    } finally {
      setReturnLoading(false)
    }
  }

  async function publicCancel() {
    if (!cancelPhone.trim()) {
      setToast({ type: 'error', submessage: 'กรุณากรอกเบอร์โทรศัพท์' })
      return
    }
    setCancelLoading(true)
    try {
      const res = await fetch(`/api/public/bookings/${booking.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cancelPhone.trim() }),
      })
      const d = await res.json()
      if (!res.ok) {
        setToast({ type: 'error', submessage: d.error })
        return
      }
      setToast({ type: 'success', submessage: 'ยกเลิกการจองสำเร็จ' })
      setCancelPhone('')
      onClose()
      if (onActionDone) onActionDone()
    } catch {
      setToast({ type: 'error', submessage: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
    } finally {
      setCancelLoading(false)
    }
  }

  if (!booking) return null

  // Approved-but-unsigned requests must not look "อนุมัติแล้ว": the header
  // symbol and accent bar follow the displayed status instead.
  const displayStatus = effectiveStatus(booking)

  // Portalled to <body> so no parent layout can shift the full-screen
  // backdrop — e.g. a `space-y-*` parent gives it a top margin, leaving an
  // unblurred strip at the top of the screen.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" />
      <div className={`relative bg-white dark:bg-gray-800 w-full ${showPdf ? 'sm:max-w-[1400px] sm:h-[92vh]' : 'sm:max-w-sm'} rounded-2xl shadow-2xl border sm:border border-neutral-200 dark:border-gray-700 overflow-hidden animate-scale-in flex flex-col max-h-[70vh] sm:max-h-[92vh]`}
        onClick={e => e.stopPropagation()}>

        {/* Status accent bar */}
        <div className="h-[3px] w-full shrink-0" style={{ backgroundColor: STATUS_COLORS[displayStatus] || '#6b7280' }} />

        {/* Close button — floating */}
        <button onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-xl flex items-center justify-center bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-neutral-400 hover:text-neutral-600 dark:hover:text-gray-300 transition-all">
          <i className="bx bx-x text-lg"></i>
        </button>

        <div className="flex flex-col sm:flex-row min-h-0 flex-1 overflow-hidden">
          {/* PDF — left column on desktop, a bar pinned under the details on
              mobile. In public mode it is released only for the borrower's
              phone number. */}
          {showPdf && <PdfPreview key={booking.id} bookingId={booking.id} docNumber={booking.doc_number} authHeaders={authHeaders} wide publicMode={publicMode} lookupQuery={lookupQuery} />}

          <div className="flex-1 min-w-0 flex flex-col overflow-y-auto scrollbar-none sm:overflow-y-auto sm:min-w-0 sm:max-w-[480px]">

        {/* Borrower hero section */}
        <div className="px-5 pt-5 pb-4 xl:px-7 xl:pt-6 xl:pb-5">
          <div className="flex items-stretch gap-4 sm:gap-5">
            <div className="w-[47px] h-[47px] rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0"
              style={{
                backgroundColor: STATUS_COLORS[displayStatus] || '#6b7280',
                boxShadow: `0 10px 20px -6px ${(STATUS_COLORS[displayStatus] || '#6b7280')}66`,
              }}>
              <i className={`bx ${STATUS_ICONS[displayStatus] || 'bx-time-five'} text-2xl`}></i>
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="font-bold text-lg sm:text-xl text-neutral-800 dark:text-white leading-tight truncate">
                {booking.user_name}
              </div>
              {booking.user_position && (
                <div className="text-xs text-neutral-400 dark:text-gray-500 truncate">{booking.user_position}</div>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-5 h-px bg-gradient-to-r from-transparent via-neutral-200 dark:via-gray-700 to-transparent" />

        {/* Info rows — 2-column grid */}
        <div className="px-5 py-3.5 grid grid-cols-2 gap-2.5">
          {/* License plate */}
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-neutral-50 dark:bg-gray-700/40">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <i className="bx bx-id-card text-base"></i>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-medium text-neutral-400 dark:text-gray-500 uppercase tracking-wider">ทะเบียนรถ</div>
              <div className="text-sm font-medium text-neutral-800 dark:text-white truncate">{booking.license_plate}</div>
            </div>
          </div>

          {/* Car brand/model — moved down from hero */}
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-neutral-50 dark:bg-gray-700/40">
            <div className="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-brand-600 dark:text-brand-400 shrink-0">
              <i className="bx bx-car text-base"></i>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-medium text-neutral-400 dark:text-gray-500 uppercase tracking-wider">ยานพาหนะ</div>
              <div className="text-sm font-medium text-neutral-800 dark:text-white truncate">
                {booking.brand} {booking.model}
              </div>
            </div>
          </div>

          {/* Date — full width, dates are long */}
          <div className="col-span-2 flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-neutral-50 dark:bg-gray-700/40">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
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

          {/* Destination — full width, text can wrap */}
          {(booking.destination_place || booking.destination_district || booking.destination_province) && (
            <div className="col-span-2 flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-neutral-50 dark:bg-gray-700/40">
              <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
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
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-neutral-50 dark:bg-gray-700/40">
              <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center text-teal-600 dark:text-teal-400 shrink-0">
                <i className="bx bx-group text-base"></i>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-medium text-neutral-400 dark:text-gray-500 uppercase tracking-wider">ผู้ไปราชการ</div>
                <div className="text-sm font-medium text-neutral-800 dark:text-white">{booking.attendees} คน</div>
              </div>
            </div>
          )}

          {/* Driver — only meaningful once approved */}
          {booking.status === 'approved' && (
            <div className={`${booking.attendees > 0 ? '' : 'col-span-2'} flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-neutral-50 dark:bg-gray-700/40`}>
              <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
                <i className="bx bx-car text-base"></i>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-medium text-neutral-400 dark:text-gray-500 uppercase tracking-wider">ผู้ขับขี่</div>
                <div className="text-sm font-medium text-neutral-800 dark:text-white truncate">
                  {booking.driver_name ? booking.driver_name : 'ผู้ยืมขับเอง'}
                </div>
              </div>
            </div>
          )}

          {/* Purpose — full width, paragraph text */}
          {booking.purpose && (
            <div className="col-span-2 relative px-3 py-2.5 rounded-xl bg-neutral-50 dark:bg-gray-700/40">
              <div className="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full bg-brand-300 dark:bg-brand-600"></div>
              <div className="pl-3">
                <div className="text-[10px] font-medium text-neutral-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">วัตถุประสงค์</div>
                <div className="text-sm text-neutral-700 dark:text-gray-300 leading-snug">{booking.purpose}</div>
              </div>
            </div>
          )}

          {/* Signature chain — only for bookings that went through the
              document flow (have a doc_number). In public mode it shows only
              when the payload carries signing progress (the lookup does; the
              public calendar doesn't), so it never renders a blank chain. */}
          {booking.doc_number && (!publicMode || booking.signatures) && <SignatureChain booking={booking} assigned={assignedSigners} />}
        </div>

        {/* Return phone confirmation form */}
        {publicMode && booking.status === 'approved' && (returnPhone === 'show' || returnFormExiting) && (
          <div className={`mx-5 mb-3 p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 motion-safe:${returnFormExiting ? 'animate-scale-out' : 'animate-scale-in'}`}>
            <label className="block text-xs font-medium text-blue-700 dark:text-blue-300 mb-2">
              <i className="bx bx-lock-alt text-xs mr-1"></i>
              ยืนยันตัวตนด้วยเบอร์โทรศัพท์
            </label>
            <div className="flex gap-2">
              <input value={returnPhone === 'show' ? '' : returnPhone} onChange={e => setReturnPhone(e.target.value)} type="tel"
                className="flex-1 h-10 px-3 rounded-lg bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 text-sm text-neutral-800 dark:text-white placeholder:text-blue-300 dark:placeholder:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all"
                placeholder="เบอร์โทรศัพท์ที่ใช้ตอนจอง"
                disabled={returnLoading} />
              <button onClick={publicReturn} disabled={returnLoading || returnPhone === 'show' || !returnPhone.trim()}
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

        {/* Cancel phone confirmation form */}
        {publicMode && booking.status === 'pending' && (cancelPhone === 'show' || cancelFormExiting) && (
          <div className={`mx-5 mb-3 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 motion-safe:${cancelFormExiting ? 'animate-scale-out' : 'animate-scale-in'}`}>
            <label className="block text-xs font-medium text-rose-700 dark:text-rose-300 mb-2">
              <i className="bx bx-lock-alt text-xs mr-1"></i>
              ยืนยันตัวตนด้วยเบอร์โทรศัพท์
            </label>
            <div className="flex gap-2">
              <input value={cancelPhone === 'show' ? '' : cancelPhone} onChange={e => setCancelPhone(e.target.value)} type="tel"
                className="flex-1 h-10 px-3 rounded-lg bg-white dark:bg-gray-800 border border-rose-200 dark:border-rose-800 text-sm text-neutral-800 dark:text-white placeholder:text-rose-300 dark:placeholder:text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-300 transition-all"
                placeholder="เบอร์โทรศัพท์ที่ใช้ตอนจอง"
                disabled={cancelLoading} />
              <button onClick={publicCancel} disabled={cancelLoading || cancelPhone === 'show' || !cancelPhone.trim()}
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
          {canSign && booking.status !== 'rejected' && booking.status !== 'returned' ? (
            // A signer acting on their own stage signs the document. This must
            // come before the admin branches: an approved-but-unsigned document
            // still waits on signatures and must not offer "คืนรถ" instead.
            <button onClick={() => onAdminApprove(booking.id)}
              className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 active:from-brand-700 active:to-brand-600 shadow-md shadow-brand-200/50 hover:shadow-lg transition-all">
              <i className="bx bx-pen text-sm"></i>
              เซ็นเอกสาร
            </button>
          ) : canManageBookings && booking.status === 'pending' ? (
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
              {returnPhone !== 'show' ? (
                <button onClick={() => setReturnPhone('show')}
                  className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 active:from-blue-700 active:to-blue-600 shadow-md shadow-blue-200/50 hover:shadow-lg transition-all">
                  <i className="bx bx-refresh text-sm"></i>
                  คืนรถ
                </button>
              ) : (
                <button onClick={() => {
                  setReturnFormExiting(true)
                  returnExitTimer.current = setTimeout(() => {
                    setReturnPhone('')
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
              {cancelPhone !== 'show' ? (
                <button onClick={() => setCancelPhone('show')}
                  className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 active:from-rose-700 active:to-rose-600 shadow-md shadow-rose-200/50 hover:shadow-lg transition-all">
                  <i className="bx bx-x-circle text-sm"></i>
                  ยกเลิกการจอง
                </button>
              ) : (
                <button onClick={() => {
                  setCancelFormExiting(true)
                  cancelExitTimer.current = setTimeout(() => {
                    setCancelPhone('')
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

      </div>
    </div>
  , document.body)
}
