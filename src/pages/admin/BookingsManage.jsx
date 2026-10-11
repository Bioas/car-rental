import React, { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useApp } from '../../context/AppContext'
import { apiGet, invalidateApi } from '../../lib/apiCache'
import { signStatus, formatThaiDate, docLabel } from '../../lib/constants'
import { Spinner } from '../../components/ui/spinner'
import { EmptyState } from '../../components/ui/empty-state'
import { Toast } from '../../components/ui/toast'
import { Pager } from '../../components/ui/pager'
import { SkeletonHeader, SkeletonTable } from '../../components/ui/skeleton'
import ApproveBookingModal from '../../components/ApproveBookingModal'
import SignDocumentModal from '../../components/SignDocumentModal'
import BookingDetailModal from '../../components/BookingDetailModal'

const CalendarPage = lazy(() => import('../CalendarPage'))

// The list is paged on the server so a long booking history does not have to be
// shipped to the browser before the first paint.
const PAGE_SIZE = 20

export default function BookingsManage() {
  const { authHeaders, fetchNotificationCount, refreshSignal, user, canManageBookings } = useApp()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState({ all: 0, pending: 0, awaiting_signature: 0, approved: 0, rejected: 0, returned: 0 })
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [approveTarget, setApproveTarget] = useState(null)
  const [drivers, setDrivers] = useState([])
  const [approveSaving, setApproveSaving] = useState(false)
  const [viewTab, setViewTab] = useState('list')
  const [toast, setToast] = useState(null)
  const [signQueue, setSignQueue] = useState([])
  const [signTarget, setSignTarget] = useState(null)
  // Approved bookings open their full document (signature chain + PDF) — the
  // standalone "ประวัติการเซ็น" tab was folded into the อนุมัติแล้ว view.
  const [detailTarget, setDetailTarget] = useState(null)

  // An admin never signs, so there is no "รออนุมัติ" (waiting on me) bucket for
  // them — every in-progress request sits under "รอดำเนินการ" until it is fully
  // signed (อนุมัติแล้ว) or rejected (ปฏิเสธ). The backend's admin view of
  // awaiting_signature already includes still-pending requests.
  const viewOnly = !!user && !canManageBookings
  const activeFilter = viewOnly && filter === 'pending' ? 'awaiting_signature' : filter

  const prevRefreshRef = useRef(0)

  useEffect(() => {
    // Reuse a fresh cache entry on mount / page change; a realtime event must
    // always hit the network.
    const force = prevRefreshRef.current !== refreshSignal
    prevRefreshRef.current = refreshSignal
    fetchBookings(force)
  }, [refreshSignal, page, activeFilter])

  // Only a 'staff' account may sign a loan document — an admin oversees and
  // manages the system but never signs, so the queue is not even fetched for
  // them (and the backend refuses the sign call regardless).
  const canSign = user?.role === 'staff'

  // Bookings waiting on a stage this signed-in staff member is assigned to.
  // Used to decide whether a row's "อนุมัติ" button signs (their stage) or
  // opens the driver-assignment modal.
  useEffect(() => {
    if (!canSign) { setSignQueue([]); return }
    let cancelled = false
    fetch('/api/signing/queue', { headers: authHeaders() })
      .then(res => res.json())
      .then(data => { if (!cancelled) setSignQueue(data.bookings || []) })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal, canSign])

  async function refreshSignQueue() {
    if (!canSign) return
    try {
      const res = await fetch('/api/signing/queue', { headers: authHeaders() })
      const data = await res.json()
      if (res.ok) setSignQueue(data.bookings || [])
    } catch (e) { console.error(e) }
  }

  // Totals come from the server — the client only holds the current page.
  const pendingCount = counts.pending
  const awaitingCount = counts.awaiting_signature
  const rejectedCount = counts.rejected
  const returnedCount = counts.returned
  // Bookings currently waiting on this signed-in user's stage. Approving one of
  // these is the same act as signing it, so the row opens the sign modal
  // instead of the driver-assignment modal.
  const signingIds = new Set(canSign ? signQueue.map(b => b.id) : [])
  const filteredBookings = bookings

  async function fetchBookings(force = false) {
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
      if (activeFilter !== 'all') params.set('status', activeFilter)
      const res = await apiGet(`/api/admin/bookings?${params}`, { headers: authHeaders(), force })
      if (res.ok) {
        const data = res.data
        const rows = data.bookings || []
        setBookings(rows)
        if (data.counts) setCounts(data.counts)
        setPages(data.pages || 1)
        setTotal(data.total || 0)
        // Acting on the last row of a page can leave it empty — step back.
        if (rows.length === 0 && page > 1) setPage(p => Math.max(p - 1, 1))
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function handleSigned(message) {
    setSignTarget(null)
    invalidateApi()
    await Promise.all([fetchBookings(true), refreshSignQueue()])
    fetchNotificationCount()
    setToast({ type: 'success', message })
  }

  // Approving a booking that waits on this user's signing stage is the same act
  // as signing it, so it opens the sign modal — using the queue entry, which
  // carries the stage this user actually signs as (sign_stage) plus the driver
  // already chosen. Every other approval asks who drives, and the driver list is
  // fetched lazily.
  async function openApprove(b) {
    if (signingIds.has(b.id)) {
      setSignTarget(signQueue.find(q => q.id === b.id) || b)
      return
    }
    setApproveTarget(b)
    if (drivers.length === 0) {
      try {
        const res = await apiGet('/api/admin/drivers', { headers: authHeaders(), ttl: 30000 })
        if (res.ok) setDrivers(res.data.drivers || [])
      } catch (e) { console.error(e) }
    }
  }

  async function confirmApprove({ self_drive, driver_id }) {
    if (!approveTarget) return
    setApproveSaving(true)
    try {
      const res = await fetch(`/api/admin/bookings/${approveTarget.id}/approve`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ self_drive, driver_id }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setToast({ type: 'error', message: d.error || 'อนุมัติไม่สำเร็จ' })
        return
      }
      setApproveTarget(null)
      invalidateApi()
      await fetchBookings(true)
      fetchNotificationCount()
      setToast({ type: 'success', message: 'อนุมัติคำขอยืมเรียบร้อย' })
    } catch (e) { console.error(e) }
    finally { setApproveSaving(false) }
  }

  function showRejectForm(b) {
    setRejectTarget(b)
    setRejectReason('')
    setShowRejectModal(true)
  }

  async function confirmReject() {
    try {
      const res = await fetch(`/api/admin/bookings/${rejectTarget.id}/reject`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_notes: rejectReason })
      })
      if (res.ok) { setShowRejectModal(false); invalidateApi(); await fetchBookings(true); fetchNotificationCount(); setToast({ type: 'success', message: 'ปฏิเสธคำขอยืมเรียบร้อย' }) }
    } catch (e) { console.error(e) }
  }

  async function returnBooking(id) {
    if (!confirm('ยืนยันการคืนรถ?')) return
    try {
      const res = await fetch(`/api/admin/bookings/${id}/return`, { method: 'PUT', headers: authHeaders() })
      if (res.ok) { invalidateApi(); await fetchBookings(true); fetchNotificationCount(); setToast({ type: 'success', message: 'คืนรถเรียบร้อย' }) }
    } catch (e) { console.error(e) }
  }

  // The list itself carries no action buttons — every action lives in the
  // detail popup, which opens from a click anywhere on a row/card. These close
  // the popup first so the follow-up modal (approve / sign / reject) is not
  // stacked behind it.
  function handleDetailApprove() {
    const b = detailTarget
    setDetailTarget(null)
    if (b) openApprove(b)
  }

  function handleDetailReject() {
    const b = detailTarget
    setDetailTarget(null)
    if (b) showRejectForm(b)
  }

  function handleDetailReturn(id) {
    setDetailTarget(null)
    returnBooking(id)
  }

  if (loading) {
    return (
      <div className="animate-fade-in flex flex-col flex-1 min-h-0">
        <SkeletonHeader />
        <SkeletonTable rows={6} />
      </div>
    )
  }

  return (
    <div className="animate-fade-in flex flex-col flex-1 min-h-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white font-heading">{canManageBookings ? 'จัดการคำขอยืม' : 'คำขอยืม'}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {canManageBookings ? 'อนุมัติหรือปฏิเสธคำขอยืมยานพาหนะ' : 'ดูรายการและสถานะคำขอยืมยานพาหนะ'}
          </p>
        </div>
        {/* Admins only view loan requests — staff are the ones who act on them. */}
        {!canManageBookings && (
          <span className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            <i className="bx bx-show text-sm"></i>
            ดูได้อย่างเดียว · การจัดการคำขอยืมเป็นหน้าที่ของเจ้าหน้าที่
          </span>
        )}
      </div>

      {/* Tab bar — horizontal scroll on mobile so the tabs never get cramped
          (same fade-edge pattern as the filter chips below). */}
      <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 mb-6 overflow-x-auto scrollbar-none"
        style={{
          maskImage: 'linear-gradient(to right, black 92%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, black 92%, transparent 100%)',
        }}>
        {[
          { key: 'list', icon: 'bx-list-ul', label: 'รายการ', badge: viewOnly ? awaitingCount : pendingCount },
          { key: 'calendar', icon: 'bx-calendar', label: 'ปฏิทิน', badge: 0 },
        ].map(tab => (
          <button key={tab.key} onClick={() => { setViewTab(tab.key); setShowRejectModal(false) }}
            className={`shrink-0 flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition-all border-b-2 -mb-px whitespace-nowrap ${
              viewTab === tab.key
                ? 'border-brand-600 text-brand-600 dark:text-brand-400 dark:border-brand-400'
                : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}>
            <i className={`bx ${tab.icon} text-base`}></i>
            {tab.label}
            {tab.badge > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${viewTab === tab.key ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {viewTab === 'calendar' ? (
        <Suspense fallback={<Spinner />}>
          <CalendarPage publicMode={false} embedded={true} />
        </Suspense>
      ) : (
      <>

      {/* Filter chips — horizontal scroll on mobile (fade edge), plain on desktop */}
      <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-none pb-1 sm:overflow-visible sm:flex-wrap sm:pb-0 sm:![mask-image:none]"
        style={{
          maskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
        }}>
        {[
          { key: 'all', label: 'ทั้งหมด', count: null },
          { key: 'pending', label: 'รออนุมัติ', count: pendingCount },
          { key: 'awaiting_signature', label: 'รอดำเนินการ', count: awaitingCount },
          { key: 'approved', label: 'อนุมัติแล้ว', count: null },
          { key: 'rejected', label: 'ปฏิเสธ', count: rejectedCount },
          { key: 'returned', label: 'คืนแล้ว', count: returnedCount },
        ].filter(f => !(viewOnly && f.key === 'pending')).map(f => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setPage(1) }}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
              activeFilter === f.key
                ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
                : 'bg-white dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            }`}>
            {f.label}
            {f.count !== null && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                activeFilter === f.key
                  ? 'bg-white/20 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}>{f.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Mobile Card View */}
      <div className={`sm:hidden flex flex-col min-h-0 ${filteredBookings.length === 0 ? 'flex-1' : ''}`}>
        <div className={`card p-4 divide-y divide-gray-200 dark:divide-gray-600 flex flex-col min-h-0 ${filteredBookings.length === 0 ? 'flex-1' : ''}`}>
          {filteredBookings.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon="bx-calendar"
                message={activeFilter === 'all' ? 'ยังไม่มีรายการขอยืมเข้ามา' : activeFilter === 'pending' ? 'ไม่มีรายการรออนุมัติ' : activeFilter === 'awaiting_signature' ? 'ไม่มีรายการรอดำเนินการ' : activeFilter === 'approved' ? 'ไม่มีรายการที่อนุมัติแล้ว' : activeFilter === 'rejected' ? 'ไม่มีรายการที่ปฏิเสธ' : 'ไม่มีรายการที่คืนแล้ว'}
              />
            </div>
          ) : (
            filteredBookings.map(b => (
            <div key={b.id} onClick={() => setDetailTarget(b)}
              className="bg-white dark:bg-card-dark py-3 first:pt-0 space-y-3 cursor-pointer">
              {/* Header: Name + Status */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
                      <i className="bx bx-user text-sm text-brand-600 dark:text-brand-400"></i>
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white truncate block">{b.user_name}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate block">{b.user_email}</span>
                    </div>
                  </div>
                </div>
                <span className={signStatus(b).className + ' shrink-0'}>{signStatus(b).label}</span>
              </div>

              {/* Details */}
              <div className="bg-gray-50 dark:bg-gray-800/30 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <i className="bx bx-car text-base text-gray-400 shrink-0"></i>
                  <span className="text-gray-700 dark:text-gray-300 font-medium">{b.license_plate}</span>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-500 dark:text-gray-400 text-xs">{b.brand} {b.model}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <i className="bx bx-calendar text-base text-gray-400 shrink-0"></i>
                  <span className="text-gray-600 dark:text-gray-400">{formatThaiDate(b.start_date)}</span>
                  <i className="bx bx-right-arrow-alt text-xs text-gray-300"></i>
                  <span className="text-gray-600 dark:text-gray-400">{formatThaiDate(b.end_date)}</span>
                </div>
                {b.purpose && (
                  <div className="flex items-start gap-2 text-sm">
                    <i className="bx bx-file text-base text-gray-400 shrink-0 mt-0.5"></i>
                    <span className="text-gray-600 dark:text-gray-400">{b.purpose}</span>
                  </div>
                )}
                {(b.destination_place || b.destination_district || b.destination_province) && (
                  <div className="flex items-start gap-2 text-sm">
                    <i className="bx bx-map text-base text-gray-400 shrink-0 mt-0.5"></i>
                    <span className="text-gray-600 dark:text-gray-400">{[b.destination_place, b.destination_district, b.destination_province].filter(Boolean).join(' · ')}</span>
                  </div>
                )}
                {b.attendees > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <i className="bx bx-group text-base text-gray-400 shrink-0"></i>
                    <span className="text-gray-600 dark:text-gray-400">ผู้ไปราชการ {b.attendees} คน</span>
                  </div>
                )}
                {b.doc_number && (
                  <div className="flex items-center gap-2 text-sm">
                    <i className="bx bx-receipt text-base text-gray-400 shrink-0"></i>
                    <span className="text-gray-600 dark:text-gray-400">เลขที่เอกสาร {docLabel(b)}</span>
                  </div>
                )}
                {b.status === 'approved' && (
                  <div className="flex items-center gap-2 text-sm">
                    <i className="bx bx-car text-base text-gray-400 shrink-0"></i>
                    <span className="text-gray-600 dark:text-gray-400">{b.driver_name ? `พนักงานขับรถ: ${b.driver_name}` : 'ผู้ยืมขับเอง'}</span>
                  </div>
                )}
                {b.admin_notes && (
                  <div className="flex items-start gap-2 text-sm">
                    <i className="bx bx-message-detail text-base text-gray-400 shrink-0 mt-0.5"></i>
                    <span className="text-gray-500 dark:text-gray-400 text-xs">{b.admin_notes}</span>
                  </div>
                )}
              </div>
            </div>
            ))
          )}
        </div>
      </div>

      {/* Desktop Table View */}
      <div className={`hidden sm:flex card overflow-hidden flex-col min-h-0 ${filteredBookings.length === 0 ? 'flex-1' : ''}`}>
        {filteredBookings.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon="bx-calendar"
              message={activeFilter === 'all' ? 'ยังไม่มีรายการขอยืมเข้ามา' : activeFilter === 'pending' ? 'ไม่มีรายการรออนุมัติ' : activeFilter === 'awaiting_signature' ? 'ไม่มีรายการรอดำเนินการ' : activeFilter === 'approved' ? 'ไม่มีรายการที่อนุมัติแล้ว' : activeFilter === 'rejected' ? 'ไม่มีรายการที่ปฏิเสธ' : 'ไม่มีรายการที่คืนแล้ว'}
            />
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-light/50 dark:border-border-dark/50 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">เลขที่</th>
                <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">ผู้ยืม</th>
                <th className="text-center p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">รถยนต์</th>
                <th className="text-center p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">วันที่</th>
                <th className="text-center p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">เหตุผล</th>
                <th className="text-center p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light/40 dark:divide-border-dark/40">
              {filteredBookings.map(b => (
                <tr key={b.id} onClick={() => setDetailTarget(b)}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer">
                  <td className="p-3 sm:p-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {docLabel(b) || '-'}
                  </td>
                  <td className="p-3 sm:p-4">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{b.user_name}</span>
                    <span className="text-xs text-gray-500 block">{b.user_email}</span>
                  </td>
                  <td className="p-3 sm:p-4 text-center">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{b.license_plate}</span>
                    <span className="text-xs text-gray-500 block">{b.brand} {b.model}</span>
                    {b.status === 'approved' && (
                      <span className={`text-[10px] block mt-0.5 ${b.driver_name ? 'text-sky-600 dark:text-sky-400' : 'text-gray-400'}`}>
                        {b.driver_name ? `ขับโดย: ${b.driver_name}` : 'ผู้ยืมขับเอง'}
                      </span>
                    )}
                  </td>
                  <td className="p-3 sm:p-4 text-center">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{formatThaiDate(b.start_date)}</span>
                    <span className="text-xs text-gray-400 block">→ {formatThaiDate(b.end_date)}</span>
                  </td>
                  <td className="p-3 sm:p-4 text-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{b.purpose || '-'}</span>
                    {(b.destination_place || b.destination_district || b.destination_province) && (
                      <span className="text-[10px] text-gray-400 block">{[b.destination_place, b.destination_district, b.destination_province].filter(Boolean).join(' · ')}</span>
                    )}
                    {b.attendees > 0 && <span className="text-[10px] text-gray-400 block">ผู้ไปราชการ {b.attendees} คน</span>}
                  </td>
                  <td className="p-3 sm:p-4 text-center">
                    <span className={signStatus(b).className}>{signStatus(b).label}</span>
                    {b.admin_notes && <span className="block text-[10px] text-gray-400 mt-0.5">{b.admin_notes}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      <Pager page={page} pages={pages} total={total} limit={PAGE_SIZE} onChange={setPage} />

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      <ApproveBookingModal
        booking={approveTarget}
        drivers={drivers}
        saving={approveSaving}
        onClose={() => { if (!approveSaving) setApproveTarget(null) }}
        onConfirm={confirmApprove}
      />

      <SignDocumentModal
        booking={signTarget}
        onClose={() => setSignTarget(null)}
        onSigned={handleSigned}
      />

      {/* Full document (signature chain + PDF) plus every action on the
          booking. Opened by clicking anywhere on a list row/card, so
          approve / reject / return now live here instead of a list column. */}
      <BookingDetailModal
        booking={detailTarget}
        publicMode={false}
        canManageBookings={canManageBookings}
        // Whether THIS staff signer still owes a signature on the open
        // document (from /api/signing/queue) — decides if the popup offers
        // "เซ็นเอกสาร" instead of the admin actions.
        canSign={canSign && !!detailTarget && signingIds.has(detailTarget.id)}
        onClose={() => setDetailTarget(null)}
        onActionDone={() => { fetchBookings(true); fetchNotificationCount() }}
        onAdminApprove={handleDetailApprove}
        onOpenRejectModal={handleDetailReject}
        onAdminReturn={handleDetailReturn}
        setToast={(t) => setToast({ type: t.type, message: t.message || t.submessage })}
      />

      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowRejectModal(false)}>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="card p-6 w-full max-w-md relative animate-scale-in max-h-[70vh] overflow-y-auto scrollbar-none sm:max-h-none sm:overflow-visible" onClick={e => e.stopPropagation()}>
            <h3 className="font-heading font-semibold text-lg text-gray-900 dark:text-white mb-2">ปฏิเสธคำขอยืม</h3>
            <p className="text-sm text-gray-500 mb-4">ระบุเหตุผลในการปฏิเสธ</p>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} className="input min-h-[100px]" placeholder="เหตุผลที่ปฏิเสธ..." />
            <div className="flex gap-3 mt-4">
              <button onClick={confirmReject} className="btn-danger flex-1">ยืนยันปฏิเสธ</button>
              <button onClick={() => setShowRejectModal(false)} className="btn-secondary">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  )
}
