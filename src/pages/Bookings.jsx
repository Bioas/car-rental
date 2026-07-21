import React, { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { statusLabel, badgeClass } from '../lib/constants'
import { Spinner } from '../components/ui/spinner'
import { BookingModal } from '../components/BookingModal'

const FILTERS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'pending', label: 'รออนุมัติ' },
  { key: 'approved', label: 'อนุมัติแล้ว' },
  { key: 'returned', label: 'คืนแล้ว' },
  { key: 'rejected', label: 'ปฏิเสธ' },
]

function StatBox({ label, value, color }) {
  return (
    <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700/50 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl ${color.bg} flex items-center justify-center shrink-0`}>
        {color.icon}
      </div>
      <div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
        <div className="text-xl font-bold text-gray-900 dark:text-white font-heading leading-tight">{value}</div>
      </div>
    </div>
  )
}

export default function Bookings() {
  const { isAdmin, authHeaders } = useApp()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [cancelTarget, setCancelTarget] = useState(null)
  const [menuOpenId, setMenuOpenId] = useState(null)
  const menuRef = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpenId(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    fetchBookings()
  }, [])

  async function fetchBookings() {
    try {
      const endpoint = isAdmin ? '/api/admin/bookings' : '/api/bookings'
      const res = await fetch(endpoint, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setBookings(data.bookings || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function cancelBooking(id) {
    try {
      const res = await fetch(`/api/bookings/${id}/cancel`, {
        method: 'PUT',
        headers: authHeaders()
      })
      if (res.ok) {
        setCancelTarget(null)
        await fetchBookings()
      }
    } catch (e) {
      console.error(e)
    }
  }

  async function returnBooking(id) {
    try {
      const res = await fetch(`/api/bookings/${id}/return`, {
        method: 'PUT',
        headers: authHeaders()
      })
      if (res.ok) {
        setMenuOpenId(null)
        await fetchBookings()
      }
    } catch (e) {
      console.error(e)
    }
  }

  const stats = {
    total: bookings.length,
    pending: bookings.filter(b => b.status === 'pending').length,
    approved: bookings.filter(b => b.status === 'approved').length,
    returned: bookings.filter(b => b.status === 'returned').length,
  }

  const filtered = bookings.filter(b => {
    if (filter !== 'all' && b.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      const match = `${b.brand} ${b.model} ${b.license_plate} ${b.purpose || ''} ${b.user_name || ''}`
      if (!match.toLowerCase().includes(q)) return false
    }
    return true
  })

  if (loading) return <Spinner />

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white font-heading">ประวัติการจอง</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">รายการจองทั้งหมดของคุณ</p>
        </div>
        <button onClick={() => setBookingOpen(true)} className="btn-primary self-start sm:self-auto">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
          จองรถ
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatBox label="ทั้งหมด" value={stats.total} color={{
          bg: 'bg-gray-100 dark:bg-gray-700/50',
          icon: <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        }} />
        <StatBox label="รออนุมัติ" value={stats.pending} color={{
          bg: 'bg-amber-100 dark:bg-amber-900/30',
          icon: <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        }} />
        <StatBox label="อนุมัติแล้ว" value={stats.approved} color={{
          bg: 'bg-emerald-100 dark:bg-emerald-900/30',
          icon: <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        }} />
        <StatBox label="คืนแล้ว" value={stats.returned} color={{
          bg: 'bg-blue-100 dark:bg-blue-900/30',
          icon: <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" /></svg>
        }} />
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                filter === f.key
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-600 hover:text-brand-600 dark:hover:text-brand-400'
              }`}
            >
              {f.label}
              {f.key !== 'all' && (
                <span className={`ml-1.5 ${filter === f.key ? 'text-white/70' : 'text-gray-400 dark:text-gray-500'}`}>
                  ({bookings.filter(b => b.status === f.key).length})
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหารถยนต์..."
            className="w-full h-10 pl-10 pr-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all"
          />
        </div>
      </div>

      {/* Booking Cards (Mobile) */}
      {filtered.length === 0 ? (
        <div className="card py-16">
          <div className="text-center text-gray-400">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <p className="text-sm">{search ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีประวัติการจอง'}</p>
            {!search && (
              <button onClick={() => setBookingOpen(true)} className="text-brand-600 dark:text-brand-400 hover:underline text-sm mt-2 inline-block">จองรถเลย</button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="sm:hidden space-y-3">
                      {filtered.map((b, i) => {
                        return (
                <div key={b.id} className="bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700/50 p-4 space-y-3 shadow-sm">
                  {/* Header: Number + Car Info */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700/50 px-2 py-0.5 rounded-lg">#{filtered.length - i}</span>
                      <div>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{b.brand} {b.model}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block">{b.license_plate}</span>
                      </div>
                    </div>
                    <span className={badgeClass(b.status)}>{statusLabel(b.status)}</span>
                  </div>

                  {/* Details */}
                  <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs">
                    {isAdmin && b.user_name && (
                      <div>
                        <span className="text-gray-400 dark:text-gray-500">ผู้ยืม: </span>
                        <span className="text-gray-700 dark:text-gray-300 font-medium">{b.user_name}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-gray-400 dark:text-gray-500">วันที่: </span>
                      <span className="text-gray-700 dark:text-gray-300">{b.start_date}</span>
                      <span className="text-gray-400"> → {b.end_date}</span>
                    </div>
                    {b.purpose && (
                      <div className="w-full">
                        <span className="text-gray-400 dark:text-gray-500">เหตุผล: </span>
                        <span className="text-gray-600 dark:text-gray-400">{b.purpose}</span>
                      </div>
                    )}
                    {b.admin_notes && (
                      <div className="w-full">
                        <span className="text-gray-400 dark:text-gray-500">หมายเหตุ: </span>
                        <span className="text-gray-600 dark:text-gray-400">{b.admin_notes}</span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons (Mobile) */}
                  {(b.status === 'pending' || b.status === 'approved') && (
                    <div className="pt-2 border-t border-gray-100 dark:border-gray-700/50 flex gap-2">
                      {b.status === 'approved' && (
                        <button onClick={() => returnBooking(b.id)} className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z"/></svg>
                          คืนรถ
                        </button>
                      )}
                      <button onClick={() => setCancelTarget(b)} className={`${b.status === 'approved' ? 'flex-1' : 'w-full'} h-9 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors`}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        ยกเลิก
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200/50 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">#</th>
                    <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">รถยนต์</th>
                    {isAdmin && <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">ผู้ยืม</th>}
                    <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">วันที่</th>
                    <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">เหตุผล</th>
                    <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">สถานะ</th>
                    <th className="text-right p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200/40 dark:divide-gray-700/40">
                  {filtered.map((b, i) => {
                    return (
                      <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="p-3 sm:p-4 text-sm text-gray-500 dark:text-gray-400">{filtered.length - i}</td>
                        <td className="p-3 sm:p-4">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{b.brand} {b.model}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 block">{b.license_plate}</span>
                        </td>
                        {isAdmin && (
                          <td className="p-3 sm:p-4">
                            <span className="text-sm text-gray-700 dark:text-gray-300">{b.user_name}</span>
                          </td>
                        )}
                        <td className="p-3 sm:p-4">
                          <span className="text-sm text-gray-700 dark:text-gray-300">{b.start_date}</span>
                          <span className="text-xs text-gray-400 block">→ {b.end_date}</span>
                        </td>
                        <td className="p-3 sm:p-4">
                          <span className="text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate block">{b.purpose || '-'}</span>
                        </td>
                        <td className="p-3 sm:p-4">
                          <span className={badgeClass(b.status)}>{statusLabel(b.status)}</span>
                          {b.admin_notes && <span className="text-xs text-gray-400 block mt-0.5">{b.admin_notes}</span>}
                        </td>
                        <td className="p-3 sm:p-4 text-right relative">
                          {(b.status === 'pending' || b.status === 'approved') && (
                            <div ref={menuOpenId === b.id ? menuRef : null}>
                              <button onClick={() => setMenuOpenId(menuOpenId === b.id ? null : b.id)}
                                className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                              </button>
                              {menuOpenId === b.id && (
                                <div className="absolute right-4 top-full w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden z-10 motion-safe:animate-scale-in origin-top-right">
                                  {b.status === 'approved' && (
                                    <button onClick={() => { returnBooking(b.id) }} className="w-full px-4 py-3 text-sm text-left flex items-center gap-2.5 text-gray-700 dark:text-gray-300 hover:bg-brand-50 dark:hover:bg-brand-950/40 transition-colors">
                                      <svg className="w-4 h-4 text-brand-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z"/></svg>
                                      คืนรถ
                                    </button>
                                  )}
                                  <button onClick={() => { setCancelTarget(b); setMenuOpenId(null) }} className="w-full px-4 py-3 text-sm text-left flex items-center gap-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                    ยกเลิก
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Cancel Confirmation Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setCancelTarget(null)}>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="card p-6 w-full max-w-sm relative animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100 dark:border-gray-700">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              </div>
              <div>
                <h3 className="font-heading font-semibold text-base text-gray-900 dark:text-white">ยกเลิกการจอง</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {cancelTarget.brand} {cancelTarget.model} · {cancelTarget.license_plate}
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              คุณต้องการยกเลิกรายการจองนี้ใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้
            </p>
            <div className="flex gap-3">
              <button onClick={() => cancelBooking(cancelTarget.id)}
                className="flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-2">
                ยืนยันยกเลิก
              </button>
              <button onClick={() => setCancelTarget(null)}
                className="h-11 px-5 inline-flex items-center justify-center rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200">
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      <BookingModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
      />
    </div>
  )
}
