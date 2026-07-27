import React, { useState, useEffect, lazy, Suspense } from 'react'
import { useApp } from '../../context/AppContext'
import { statusLabel, badgeClass } from '../../lib/constants'
import { Spinner } from '../../components/ui/spinner'
import { EmptyState } from '../../components/ui/empty-state'
import { Toast } from '../../components/ui/toast'

const CalendarPage = lazy(() => import('../CalendarPage'))

export default function BookingsManage() {
  const { authHeaders, fetchNotificationCount, refreshSignal } = useApp()
  const [bookings, setBookings] = useState([])
  const [filter, setFilter] = useState('pending')
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [viewTab, setViewTab] = useState('list')
  const [toast, setToast] = useState(null)

  useEffect(() => {
    fetchBookings()
  }, [refreshSignal])

  const pendingCount = bookings.filter(b => b.status === 'pending').length
  const rejectedCount = bookings.filter(b => b.status === 'rejected').length
  const returnedCount = bookings.filter(b => b.status === 'returned').length
  const filteredBookings = filter === 'all' ? bookings : bookings.filter(b => b.status === filter)

  async function fetchBookings() {
    try {
      const res = await fetch('/api/admin/bookings', { headers: authHeaders() })
      if (res.ok) { const data = await res.json(); setBookings(data.bookings || []) }
    } catch (e) { console.error(e) }
  }

  async function approveBooking(id) {
    try {
      const res = await fetch(`/api/admin/bookings/${id}/approve`, { method: 'PUT', headers: authHeaders() })
      if (res.ok) { await fetchBookings(); fetchNotificationCount(); setToast({ type: 'success', message: 'อนุมัติคำขอยืมเรียบร้อย' }) }
    } catch (e) { console.error(e) }
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
      if (res.ok) { setShowRejectModal(false); await fetchBookings(); fetchNotificationCount(); setToast({ type: 'success', message: 'ปฏิเสธคำขอยืมเรียบร้อย' }) }
    } catch (e) { console.error(e) }
  }

  async function returnBooking(id) {
    if (!confirm('ยืนยันการคืนรถ?')) return
    try {
      const res = await fetch(`/api/admin/bookings/${id}/return`, { method: 'PUT', headers: authHeaders() })
      if (res.ok) { await fetchBookings(); fetchNotificationCount(); setToast({ type: 'success', message: 'คืนรถเรียบร้อย' }) }
    } catch (e) { console.error(e) }
  }

  return (
    <div className="animate-fade-in flex flex-col flex-1 min-h-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white font-heading">จัดการคำขอยืม</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">อนุมัติหรือปฏิเสธคำขอยืมยานพาหนะ</p>
        </div>
      </div>

      {/* Tab bar — full width on mobile */}
      <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 mb-6">
        <button onClick={() => { setViewTab('list'); setShowRejectModal(false) }}
          className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition-all border-b-2 -mb-px whitespace-nowrap ${
            viewTab === 'list'
              ? 'border-brand-600 text-brand-600 dark:text-brand-400 dark:border-brand-400'
              : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
          }`}>
          <i className={`bx bx-list-ul text-base ${viewTab === 'list' ? '' : ''}`}></i>
          รายการ
          {pendingCount > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${viewTab === 'list' ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
              {pendingCount}
            </span>
          )}
        </button>
        <button onClick={() => { setViewTab('calendar'); setShowRejectModal(false) }}
          className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition-all border-b-2 -mb-px whitespace-nowrap ${
            viewTab === 'calendar'
              ? 'border-brand-600 text-brand-600 dark:text-brand-400 dark:border-brand-400'
              : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
          }`}>
          <i className="bx bx-calendar text-base"></i>
          ปฏิทิน
        </button>
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
          { key: 'approved', label: 'อนุมัติแล้ว', count: null },
          { key: 'rejected', label: 'ปฏิเสธ', count: rejectedCount },
          { key: 'returned', label: 'คืนแล้ว', count: returnedCount },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
              filter === f.key
                ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
                : 'bg-white dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            }`}>
            {f.label}
            {f.count !== null && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                filter === f.key
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
                message={filter === 'all' ? 'ยังไม่มีรายการขอยืมเข้ามา' : filter === 'pending' ? 'ไม่มีรายการรออนุมัติ' : filter === 'approved' ? 'ไม่มีรายการที่อนุมัติแล้ว' : filter === 'rejected' ? 'ไม่มีรายการที่ปฏิเสธ' : 'ไม่มีรายการที่คืนแล้ว'}
              />
            </div>
          ) : (
            filteredBookings.map(b => (
            <div key={b.id} className="bg-white dark:bg-card-dark py-3 first:pt-0 space-y-3">
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
                <span className={badgeClass(b.status) + ' shrink-0'}>{statusLabel(b.status)}</span>
              </div>

              {/* Details */}
              <div className="bg-gray-50 dark:bg-gray-800/30 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <i className="bx bx-car text-base text-gray-400 shrink-0"></i>
                  <span className="text-gray-700 dark:text-gray-300 font-medium">{b.brand} {b.model}</span>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-500 dark:text-gray-400 text-xs">{b.license_plate}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <i className="bx bx-calendar text-base text-gray-400 shrink-0"></i>
                  <span className="text-gray-600 dark:text-gray-400">{b.start_date}</span>
                  <i className="bx bx-right-arrow-alt text-xs text-gray-300"></i>
                  <span className="text-gray-600 dark:text-gray-400">{b.end_date}</span>
                </div>
                {b.purpose && (
                  <div className="flex items-start gap-2 text-sm">
                    <i className="bx bx-file text-base text-gray-400 shrink-0 mt-0.5"></i>
                    <span className="text-gray-600 dark:text-gray-400">{b.purpose}</span>
                  </div>
                )}
                {b.admin_notes && (
                  <div className="flex items-start gap-2 text-sm">
                    <i className="bx bx-message-detail text-base text-gray-400 shrink-0 mt-0.5"></i>
                    <span className="text-gray-500 dark:text-gray-400 text-xs">{b.admin_notes}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              {b.status === 'pending' && (
                <div className="flex gap-2">
                  <button onClick={() => approveBooking(b.id)} className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-sm transition-all">
                    <i className="bx bx-check text-lg"></i>
                    อนุมัติ
                  </button>
                  <button onClick={() => showRejectForm(b)} className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all">
                    <i className="bx bx-x text-lg"></i>
                    ปฏิเสธ
                  </button>
                </div>
              )}
              {b.status === 'approved' && (
                <button onClick={() => returnBooking(b.id)} className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 shadow-sm transition-all">
                  <i className="bx bx-refresh text-lg"></i>
                  คืนรถ
                </button>
              )}
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
              message={filter === 'all' ? 'ยังไม่มีรายการขอยืมเข้ามา' : filter === 'pending' ? 'ไม่มีรายการรออนุมัติ' : filter === 'approved' ? 'ไม่มีรายการที่อนุมัติแล้ว' : filter === 'rejected' ? 'ไม่มีรายการที่ปฏิเสธ' : 'ไม่มีรายการที่คืนแล้ว'}
            />
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-light/50 dark:border-border-dark/50 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">#</th>
                <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">ผู้ยืม</th>
                <th className="text-center p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">รถยนต์</th>
                <th className="text-center p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">วันที่</th>
                <th className="text-center p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">เหตุผล</th>
                <th className="text-center p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">สถานะ</th>
                <th className="text-center p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light/40 dark:divide-border-dark/40">
              {filteredBookings.map(b => (
                <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="p-3 sm:p-4 text-sm text-gray-500 dark:text-gray-400">{b.id}</td>
                  <td className="p-3 sm:p-4">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{b.user_name}</span>
                    <span className="text-xs text-gray-500 block">{b.user_email}</span>
                  </td>
                  <td className="p-3 sm:p-4 text-center">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{b.brand} {b.model}</span>
                    <span className="text-xs text-gray-500 block">{b.license_plate}</span>
                  </td>
                  <td className="p-3 sm:p-4 text-center">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{b.start_date}</span>
                    <span className="text-xs text-gray-400 block">→ {b.end_date}</span>
                  </td>
                  <td className="p-3 sm:p-4 text-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{b.purpose || '-'}</span>
                  </td>
                  <td className="p-3 sm:p-4 text-center">
                    <span className={badgeClass(b.status)}>{statusLabel(b.status)}</span>
                    {b.admin_notes && <span className="block text-[10px] text-gray-400 mt-0.5">{b.admin_notes}</span>}
                  </td>
                  <td className="p-3 sm:p-4 text-center">
                    {b.status === 'pending' && (
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => approveBooking(b.id)} className="btn-success btn-sm">
                          <i className="bx bx-check text-base"></i>
                          อนุมัติ
                        </button>
                        <button onClick={() => showRejectForm(b)} className="btn-danger btn-sm">
                          <i className="bx bx-x text-base"></i>
                          ปฏิเสธ
                        </button>
                      </div>
                    )}
                    {b.status === 'approved' && (
                      <button onClick={() => returnBooking(b.id)} className="btn-primary btn-sm">
                        <i className="bx bx-refresh text-base"></i>
                        คืนรถ
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowRejectModal(false)}>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="card p-6 w-full max-w-md relative animate-scale-in" onClick={e => e.stopPropagation()}>
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
