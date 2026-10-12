import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { carText, destinationText, thaiRange, tripDays, tripState } from '../lib/trips'
import { effectiveStatus, timeRangeLabel } from '../lib/constants'
import { useDialog, dialogProps } from '../lib/useDialog'

function Row({ icon, label, children }) {
  return (
    <div className="flex gap-3 py-2.5">
      <div className="w-9 h-9 rounded-xl bg-gray-50 dark:bg-gray-700/50 flex items-center justify-center shrink-0">
        <i aria-hidden="true" className={`bx ${icon} text-lg text-brand-500 dark:text-brand-400`}></i>
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-gray-400 dark:text-gray-500">{label}</div>
        <div className="text-sm text-gray-900 dark:text-gray-100 break-words">{children}</div>
      </div>
    </div>
  )
}

/** One trip of a driver's schedule. `actions` renders extra buttons (admin only). */
export default function TripDetailModal({ trip, driverName, onClose, actions }) {
  const panelRef = useRef(null)
  useDialog(!!trip, onClose, panelRef)
  useEffect(() => {
    if (!trip) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [trip])

  if (!trip) return null
  const state = tripState(trip)
  const dest = destinationText(trip)
  const days = tripDays(trip)

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm motion-safe:animate-fade-in" onClick={onClose} />
      <div ref={panelRef} {...dialogProps('รายละเอียดงานขับรถ')}
        className="relative w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-3xl shadow-2xl motion-safe:animate-scale-in">
        <div className="sticky top-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${state.chip}`}>
                <i aria-hidden="true" className={`bx ${state.icon}`}></i>{state.label}
              </span>
              <h3 className="mt-2 text-xl font-bold font-heading text-gray-900 dark:text-white">{trip.license_plate || 'งานขับรถ'}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{[trip.brand, trip.model].filter(Boolean).join(' ')}</p>
            </div>
            <button onClick={onClose} aria-label="ปิด"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <i aria-hidden="true" className="bx bx-x text-2xl"></i>
            </button>
          </div>
        </div>

        <div className="px-6 py-3 divide-y divide-gray-50 dark:divide-gray-700/60">
          <Row icon="bx-calendar" label="วันที่">
            {thaiRange(trip.start_date, trip.end_date)} <span className="text-gray-400">· {timeRangeLabel(trip) ? `${timeRangeLabel(trip)} · ` : ''}{days} วัน</span>
          </Row>
          {driverName && <Row icon="bx-id-card" label="พนักงานขับรถ">{driverName}</Row>}
          {dest && <Row icon="bx-map" label="สถานที่ไป">{dest}</Row>}
          {trip.purpose && <Row icon="bx-target-lock" label="วัตถุประสงค์">{trip.purpose}</Row>}
          <Row icon="bx-user" label="ผู้ขอใช้รถ">
            {trip.user_name}{trip.user_position && <span className="text-gray-400"> · {trip.user_position}</span>}
          </Row>
          {trip.attendees > 0 && <Row icon="bx-group" label="ผู้ไปราชการ">{trip.attendees} คน</Row>}
          <Row icon="bx-car" label="รถ">{carText(trip)}</Row>
          {trip.doc_label && <Row icon="bx-file" label="เลขที่เอกสาร">{trip.doc_label}</Row>}
          {effectiveStatus(trip) === 'pending' && (
            <p className="py-3 text-xs text-amber-600 dark:text-amber-400">
              <i aria-hidden="true" className="bx bx-info-circle mr-1"></i>
              คำขอนี้ยังเซ็นอนุมัติไม่ครบ{trip.remaining_signers ? ` (เหลืออีก ${trip.remaining_signers} ขั้น)` : ''} — งานอาจมีการเปลี่ยนแปลง
            </p>
          )}
        </div>

        {actions && <div className="px-6 pb-6 pt-1 flex flex-col gap-2">{actions}</div>}
        {!actions && <div className="h-4" />}
      </div>
    </div>,
    document.body,
  )
}
