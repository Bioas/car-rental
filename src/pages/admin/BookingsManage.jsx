import React, { useState, useEffect, lazy, Suspense } from 'react'
import { useApp } from '../../context/AppContext'
import { statusLabel } from '../../lib/constants'
import { Spinner } from '../../components/ui/spinner'

const CalendarPage = lazy(() => import('../CalendarPage'))

export default function BookingsManage() {
  const { authHeaders, fetchNotificationCount } = useApp()
  const [bookings, setBookings] = useState([])
  const [filter, setFilter] = useState('pending')
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [viewTab, setViewTab] = useState('list')

  useEffect(() => {
    fetchBookings()
  }, [])

  const pendingCount = bookings.filter(b => b.status === 'pending').length
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
      if (res.ok) { await fetchBookings(); fetchNotificationCount() }
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
      if (res.ok) { setShowRejectModal(false); await fetchBookings(); fetchNotificationCount() }
    } catch (e) { console.error(e) }
  }

  async function returnBooking(id) {
    if (!confirm('ยืนยันการคืนรถ?')) return
    try {
      const res = await fetch(`/api/admin/bookings/${id}/return`, { method: 'PUT', headers: authHeaders() })
      if (res.ok) { await fetchBookings(); fetchNotificationCount() }
    } catch (e) { console.error(e) }
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white font-heading">จัดการคำขอยืม</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">อนุมัติหรือปฏิเสธคำขอยืมยานพาหนะ</p>
        </div>
        {/* View toggle */}
        <div className="flex rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden shrink-0">
          <button onClick={() => { setViewTab('list'); setShowRejectModal(false) }}
            className={`px-4 h-9 text-sm font-semibold transition-all ${viewTab === 'list' ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
            <svg className="w-4 h-4 inline mr-1.5 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
            รายการ
          </button>
          <button onClick={() => { setViewTab('calendar'); setShowRejectModal(false) }}
            className={`px-4 h-9 text-sm font-semibold transition-all ${viewTab === 'calendar' ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
            <svg className="w-4 h-4 inline mr-1.5 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            ปฏิทิน
          </button>
        </div>
      </div>

      {viewTab === 'calendar' ? (
        <Suspense fallback={<Spinner />}>
          <CalendarPage publicMode={false} embedded={true} />
        </Suspense>
      ) : (
      <>

      <div className="flex gap-2 mb-6 flex-wrap">
        <button onClick={() => setFilter('all')} className={filter === 'all' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>ทั้งหมด</button>
        <button onClick={() => setFilter('pending')} className={filter === 'pending' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>รออนุมัติ ({pendingCount})</button>
        <button onClick={() => setFilter('approved')} className={filter === 'approved' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>อนุมัติแล้ว</button>
        <button onClick={() => setFilter('rejected')} className={filter === 'rejected' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>ปฏิเสธ</button>
        <button onClick={() => setFilter('returned')} className={filter === 'returned' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>คืนแล้ว</button>
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {filteredBookings.length === 0 ? (
          <div className="card py-12 text-center text-gray-400 text-sm">ไม่มีรายการ</div>
        ) : (
          filteredBookings.map(b => (
            <div key={b.id} className="bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700/50 p-4 space-y-3 shadow-sm">
              {/* Header: Name + Status */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white truncate block">{b.user_name}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate block">{b.user_email}</span>
                    </div>
                  </div>
                </div>
                <span className={`badge-${b.status} shrink-0`}>{statusLabel(b.status)}</span>
              </div>

              {/* Details */}
              <div className="bg-gray-50 dark:bg-gray-800/30 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13.5 4.5L21 12l-7.5 7.5M3 12h15" /></svg>
                  <span className="text-gray-700 dark:text-gray-300 font-medium">{b.brand} {b.model}</span>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-500 dark:text-gray-400 text-xs">{b.license_plate}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <span className="text-gray-600 dark:text-gray-400">{b.start_date}</span>
                  <svg className="w-3 h-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                  <span className="text-gray-600 dark:text-gray-400">{b.end_date}</span>
                </div>
                {b.purpose && (
                  <div className="flex items-start gap-2 text-sm">
                    <svg className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <span className="text-gray-600 dark:text-gray-400">{b.purpose}</span>
                  </div>
                )}
                {b.admin_notes && (
                  <div className="flex items-start gap-2 text-sm">
                    <svg className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                    <span className="text-gray-500 dark:text-gray-400 text-xs">{b.admin_notes}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              {b.status === 'pending' && (
                <div className="flex gap-2">
                  <button onClick={() => approveBooking(b.id)} className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-sm transition-all">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                    อนุมัติ
                  </button>
                  <button onClick={() => showRejectForm(b)} className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    ปฏิเสธ
                  </button>
                </div>
              )}
              {b.status === 'approved' && (
                <button onClick={() => returnBooking(b.id)} className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 shadow-sm transition-all">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  คืนรถ
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-light/50 dark:border-border-dark/50 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">#</th>
                <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">ผู้ยืม</th>
                <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">รถยนต์</th>
                <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">วันที่</th>
                <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">เหตุผล</th>
                <th className="text-center p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">สถานะ</th>
                <th className="text-right p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">ดำเนินการ</th>
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
                  <td className="p-3 sm:p-4">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{b.brand} {b.model}</span>
                    <span className="text-xs text-gray-500 block">{b.license_plate}</span>
                  </td>
                  <td className="p-3 sm:p-4">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{b.start_date}</span>
                    <span className="text-xs text-gray-400 block">→ {b.end_date}</span>
                  </td>
                  <td className="p-3 sm:p-4">
                    <span className="text-sm text-gray-600 dark:text-gray-400">{b.purpose || '-'}</span>
                  </td>
                  <td className="p-3 sm:p-4 text-center">
                    <span className={`badge-${b.status}`}>{statusLabel(b.status)}</span>
                    {b.admin_notes && <span className="block text-[10px] text-gray-400 mt-0.5">{b.admin_notes}</span>}
                  </td>
                  <td className="p-3 sm:p-4 text-right">
                    {b.status === 'pending' && (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => approveBooking(b.id)} className="btn-success btn-sm">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                          อนุมัติ
                        </button>
                        <button onClick={() => showRejectForm(b)} className="btn-danger btn-sm">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                          ปฏิเสธ
                        </button>
                      </div>
                    )}
                    {b.status === 'approved' && (
                      <button onClick={() => returnBooking(b.id)} className="btn-primary btn-sm">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        คืนรถ
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
