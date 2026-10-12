import React, { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useApp } from '../../context/AppContext'
import { apiGet, invalidateApi } from '../../lib/apiCache'
import { signStatus, formatThaiDate, docLabel, timeRangeLabel } from '../../lib/constants'
import { Spinner } from '../../components/ui/spinner'
import { EmptyState } from '../../components/ui/empty-state'
import { Toast } from '../../components/ui/toast'
import { Pager } from '../../components/ui/pager'
import { SkeletonHeader, SkeletonTable } from '../../components/ui/skeleton'
import { StatTile, StatTileRow, SearchInput } from '../../components/ui/stat-tile'
import ApproveBookingModal from '../../components/ApproveBookingModal'
import SignDocumentModal from '../../components/SignDocumentModal'
import BookingDetailModal from '../../components/BookingDetailModal'
import { useDialog, dialogProps } from '../../lib/useDialog'

const CalendarPage = lazy(() => import('../CalendarPage'))

// The list is paged on the server so a long booking history does not have to be
// shipped to the browser before the first paint.
const PAGE_SIZE = 20

// Summary tiles, each also the status filter (counts come from the server).
const STATUS_TILES = [
  { key: 'all', label: 'ทั้งหมด', icon: 'bx-list-ul', tone: 'bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300', ring: 'ring-brand-400' },
  { key: 'pending', label: 'รออนุมัติ', icon: 'bx-time-five', tone: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300', ring: 'ring-amber-400' },
  { key: 'awaiting_signature', label: 'รอดำเนินการ', icon: 'bx-loader-circle', tone: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300', ring: 'ring-sky-400' },
  { key: 'approved', label: 'อนุมัติแล้ว', icon: 'bx-check-circle', tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300', ring: 'ring-emerald-400' },
  { key: 'rejected', label: 'ปฏิเสธ', icon: 'bx-x-circle', tone: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300', ring: 'ring-red-400' },
  { key: 'returned', label: 'คืนแล้ว', icon: 'bx-revision', tone: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300', ring: 'ring-indigo-400' },
]

const EMPTY_MESSAGES = {
  all: 'ยังไม่มีรายการขอยืมเข้ามา',
  pending: 'ไม่มีรายการรออนุมัติ',
  awaiting_signature: 'ไม่มีรายการรอดำเนินการ',
  approved: 'ไม่มีรายการที่อนุมัติแล้ว',
  rejected: 'ไม่มีรายการที่ปฏิเสธ',
  returned: 'ไม่มีรายการที่คืนแล้ว',
}

function nameInitial(name) {
  const bare = String(name || '').replace(/^(นาย|นางสาว|นาง|ว่าที่ร้อยตรี|ดร\.)\s*/, '').trim()
  return bare.charAt(0) || '?'
}

function dayCount(start, end) {
  if (!start || !end) return 0
  return Math.round((new Date(end) - new Date(start)) / 86400000) + 1
}

export default function BookingsManage() {
  const { authHeaders, fetchNotificationCount, refreshSignal, user, canManageBookings } = useApp()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [page, setPage] = useState(1)
  // `query` follows the input; `search` is the debounced value sent to the server.
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
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
  }, [refreshSignal, page, activeFilter, search])

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

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
  // Bookings currently waiting on this signed-in user's stage. Approving one of
  // these is the same act as signing it, so the row opens the sign modal
  // instead of the driver-assignment modal.
  const signingIds = new Set(canSign ? signQueue.map(b => b.id) : [])
  const filteredBookings = bookings

  async function fetchBookings(force = false) {
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
      if (activeFilter !== 'all') params.set('status', activeFilter)
      if (search) params.set('q', search)
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

  const rejectRef = useRef(null)
  useDialog(showRejectModal, () => setShowRejectModal(false), rejectRef)

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
            <i aria-hidden="true" className="bx bx-show text-sm"></i>
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
            <i aria-hidden="true" className={`bx ${tab.icon} text-base`}></i>
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

      <StatTileRow grid={`sm:grid-cols-3 ${viewOnly ? 'lg:grid-cols-5' : 'xl:grid-cols-6'}`} className="mb-4 sm:mb-5">
        {STATUS_TILES.filter(t => !(viewOnly && t.key === 'pending')).map(t => (
          <StatTile key={t.key} icon={t.icon} label={t.label} value={counts[t.key] ?? 0} tone={t.tone} ring={t.ring}
            active={activeFilter === t.key}
            onClick={() => { setFilter(activeFilter === t.key && t.key !== 'all' ? 'all' : t.key); setPage(1) }} />
        ))}
      </StatTileRow>

      <div className={`card overflow-hidden flex flex-col min-h-0 ${filteredBookings.length === 0 ? 'flex-1' : ''}`}>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border-light/60 dark:border-border-dark/60">
          <SearchInput value={query} onChange={setQuery} placeholder="ค้นหาชื่อผู้ยืม เบอร์โทร ทะเบียนรถ สถานที่ เลขที่" className="flex-1 min-w-[220px] max-w-lg" />
          <span className="text-xs text-gray-400 ml-auto">
            {search ? `พบ ${total} รายการ` : `${STATUS_TILES.find(t => t.key === activeFilter)?.label || ''} ${total} รายการ`}
          </span>
          {(search || activeFilter !== 'all') && (
            <button onClick={() => { setQuery(''); setFilter('all'); setPage(1) }} className="text-xs text-brand-600 dark:text-brand-400 hover:underline min-h-[36px] px-2 -mx-2">ล้างตัวกรอง</button>
          )}
        </div>

        {filteredBookings.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-6">
            <EmptyState icon={search ? 'bx-search' : 'bx-calendar'}
              message={search ? `ไม่พบคำขอที่ตรงกับ "${search}"` : EMPTY_MESSAGES[activeFilter] || EMPTY_MESSAGES.all} />
          </div>
        ) : (
          <>
            {/* Mobile list */}
            <div className="sm:hidden divide-y divide-border-light/40 dark:divide-border-dark/40">
              {filteredBookings.map(b => (
                <div key={b.id} onClick={() => setDetailTarget(b)} role="button" tabIndex={0} aria-label={`เปิดคำขอของ ${b.user_name}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailTarget(b) } }}
                  className="p-4 space-y-3 cursor-pointer active:bg-gray-50 dark:active:bg-gray-800/40">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-indigo-500 text-white text-sm font-bold flex items-center justify-center shrink-0">{nameInitial(b.user_name)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{b.user_name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{b.user_position || b.user_phone || '-'}</div>
                    </div>
                    <span className={signStatus(b).className + ' shrink-0'}>{signStatus(b).label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1.5 min-w-0"><i aria-hidden="true" className="bx bx-car text-sm text-gray-400"></i><span className="truncate"><b className="text-gray-800 dark:text-gray-200 font-semibold">{b.license_plate}</b> {b.brand} {b.model}</span></span>
                    <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="bx bx-calendar text-sm text-gray-400"></i>{formatThaiDate(b.start_date)}{b.end_date !== b.start_date && ` – ${formatThaiDate(b.end_date)}`}{timeRangeLabel(b) && ` · ${timeRangeLabel(b)}`}</span>
                    {(b.destination_place || b.destination_province) && (
                      <span className="col-span-2 inline-flex items-center gap-1.5 min-w-0"><i aria-hidden="true" className="bx bx-map text-sm text-gray-400"></i><span className="truncate">{[b.destination_place, b.destination_province].filter(Boolean).join(' · ')}</span></span>
                    )}
                    {b.purpose && <span className="col-span-2 inline-flex items-center gap-1.5 min-w-0"><i aria-hidden="true" className="bx bx-target-lock text-sm text-gray-400"></i><span className="truncate">{b.purpose}</span></span>}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-400">
                    <span>{b.doc_number ? `เลขที่ ${docLabel(b)}` : ''}</span>
                    <span>{b.status === 'approved' ? (b.driver_name ? `ขับโดย ${b.driver_name}` : 'ผู้ยืมขับเอง') : ''}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-light/50 dark:border-border-dark/50 bg-gray-50/80 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 w-20 whitespace-nowrap">เลขที่</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">ผู้ยืม</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">รถยนต์</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">วันที่</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 hidden xl:table-cell">วัตถุประสงค์</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light/40 dark:divide-border-dark/40">
                  {filteredBookings.map(b => {
                    const days = dayCount(b.start_date, b.end_date)
                    const dest = [b.destination_place, b.destination_province].filter(Boolean).join(' · ')
                    return (
                      <tr key={b.id} onClick={() => setDetailTarget(b)} tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailTarget(b) } }}
                        className="hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-colors cursor-pointer">
                        <td className="px-4 py-3 text-sm font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">{docLabel(b) || '-'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-indigo-500 text-white text-sm font-bold flex items-center justify-center shrink-0">{nameInitial(b.user_name)}</div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[220px]">{b.user_name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[220px]">{b.user_position || b.user_phone || '-'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">{b.license_plate}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{b.brand} {b.model}</div>
                          {b.status === 'approved' && (
                            <div className={`text-[11px] mt-0.5 ${b.driver_name ? 'text-sky-600 dark:text-sky-400' : 'text-gray-400'}`}>
                              {b.driver_name ? `ขับโดย ${b.driver_name}` : 'ผู้ยืมขับเอง'}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm text-gray-700 dark:text-gray-300">{formatThaiDate(b.start_date)}</div>
                          <div className="text-xs text-gray-400">{days > 1 ? `ถึง ${formatThaiDate(b.end_date)} · ${days} วัน` : '1 วัน'}{timeRangeLabel(b) && ` · ${timeRangeLabel(b)}`}</div>
                        </td>
                        <td className="px-4 py-3 hidden xl:table-cell max-w-xs">
                          <div className="text-sm text-gray-700 dark:text-gray-300 truncate" title={b.purpose}>{b.purpose || '-'}</div>
                          {dest && <div className="text-xs text-gray-400 truncate" title={dest}><i aria-hidden="true" className="bx bx-map align-[-2px] mr-0.5"></i>{dest}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={signStatus(b).className + ' whitespace-nowrap'}>{signStatus(b).label}</span>
                          {b.admin_notes && <div className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[160px]" title={b.admin_notes}>{b.admin_notes}</div>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
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
          <div ref={rejectRef} {...dialogProps('ปฏิเสธคำขอยืม')} className="card p-6 w-full max-w-md relative animate-scale-in max-h-[70vh] overflow-y-auto scrollbar-none sm:max-h-none sm:overflow-visible" onClick={e => e.stopPropagation()}>
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
