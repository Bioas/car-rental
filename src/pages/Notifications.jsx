import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { invalidateApi } from '../lib/apiCache'
import { timeAgo } from '../lib/constants'
import { Skeleton, SkeletonList } from '../components/ui/skeleton'
import { Toast } from '../components/ui/toast'
import BookingDetailModal from '../components/BookingDetailModal'

// การแจ้งเตือน — inbox with server-side filters (type / unread), "load more"
// paging, per-item read & delete, and "ดูคำขอ" opening the related request.
// Refetches whenever a realtime event bumps refreshSignal.
// API: api/routes/notifications.cjs, GET /api/admin/bookings/:id.

const TYPES = {
  sign_request: { label: 'รอคุณเซ็น', icon: 'bx-pen', color: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400' },
  booking_request: { label: 'คำขอใหม่', icon: 'bx-file-blank', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
  approved: { label: 'อนุมัติแล้ว', icon: 'bxs-check-circle', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
  rejected: { label: 'ปฏิเสธ', icon: 'bxs-x-circle', color: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
  returned: { label: 'คืนรถ', icon: 'bx-rotate-left', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
  cancelled: { label: 'ยกเลิก', icon: 'bx-block', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' },
}
const TYPE_ORDER = ['sign_request', 'booking_request', 'approved', 'rejected', 'returned', 'cancelled']
const FALLBACK = { label: 'ทั่วไป', icon: 'bxs-info-circle', color: 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400' }
const typeOf = (t) => TYPES[t] || FALLBACK

// The icon already says what happened — drop the emoji older messages start with.
const cleanMessage = (m) => String(m || '').replace(/^[\p{Extended_Pictographic}️\s]+/u, '')

function groupByDate(items) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = 86400000
  const buckets = [
    { label: 'วันนี้', from: today },
    { label: 'เมื่อวาน', from: today - day },
    { label: '7 วันที่ผ่านมา', from: today - 7 * day },
    { label: 'ก่อนหน้านี้', from: -Infinity },
  ].map(b => ({ ...b, items: [] }))
  for (const n of items) {
    const t = new Date(n.created_at).getTime()
    buckets.find(b => t >= b.from).items.push(n)
  }
  return buckets.filter(b => b.items.length)
}

function FilterButton({ active, onClick, icon, iconClass, label, count, unread }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${active
        ? 'bg-brand-50 dark:bg-brand-900/25 text-brand-700 dark:text-brand-300 font-semibold'
        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/60'}`}>
      <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconClass}`}>
        <i className={`bx ${icon} text-base`}></i>
      </span>
      <span className="flex-1 text-left truncate">{label}</span>
      {unread > 0 && <span className="w-2 h-2 rounded-full bg-brand-500" title={`ยังไม่ได้อ่าน ${unread}`} />}
      <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500">{count}</span>
    </button>
  )
}

export default function Notifications() {
  const { authHeaders, setNotificationCount, refreshSignal } = useApp()
  const [items, setItems] = useState([])
  const [counts, setCounts] = useState({ all: 0 })
  const [unread, setUnread] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [type, setType] = useState('all')
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [detail, setDetail] = useState(null)
  const [opening, setOpening] = useState(null)
  const requestId = useRef(0)

  const query = useCallback((before) => {
    const p = new URLSearchParams()
    if (type !== 'all') p.set('type', type)
    if (onlyUnread) p.set('unread', '1')
    if (before) p.set('before', before)
    return `/api/notifications?${p}`
  }, [type, onlyUnread])

  const applyMeta = useCallback((data) => {
    setCounts(data.counts || { all: 0 })
    setUnread(data.unread || 0)
    setNotificationCount(data.unread || 0)
    setHasMore(!!data.has_more)
  }, [setNotificationCount])

  useEffect(() => {
    const id = ++requestId.current
    fetch(query(), { headers: authHeaders() })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => {
        if (id !== requestId.current) return
        setItems(data.notifications || [])
        applyMeta(data)
      })
      .catch(() => setToast({ type: 'error', submessage: 'โหลดการแจ้งเตือนไม่สำเร็จ' }))
      .finally(() => { if (id === requestId.current) setLoading(false) })
  }, [query, refreshSignal, authHeaders, applyMeta])

  async function loadMore() {
    if (!items.length) return
    setLoadingMore(true)
    try {
      const r = await fetch(query(items[items.length - 1].created_at), { headers: authHeaders() })
      const data = await r.json()
      if (r.ok) {
        setItems(prev => [...prev, ...(data.notifications || []).filter(n => !prev.some(p => p.id === n.id))])
        applyMeta(data)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  function bump(n, delta) {
    setUnread(u => Math.max(0, u + delta))
    setNotificationCount(c => Math.max(0, c + delta))
    setCounts(c => {
      const t = c[n.type]
      return t ? { ...c, [n.type]: { ...t, unread: Math.max(0, t.unread + delta) } } : c
    })
  }

  async function markRead(n) {
    if (n.is_read) return
    const res = await fetch(`/api/notifications/${n.id}/read`, { method: 'PUT', headers: authHeaders() })
    if (!res.ok) return
    invalidateApi('/api/notifications')
    setItems(prev => onlyUnread ? prev.filter(x => x.id !== n.id) : prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    bump(n, -1)
  }

  async function remove(n) {
    const res = await fetch(`/api/notifications/${n.id}`, { method: 'DELETE', headers: authHeaders() })
    if (!res.ok) return
    invalidateApi('/api/notifications')
    setItems(prev => prev.filter(x => x.id !== n.id))
    setCounts(c => {
      const t = c[n.type]
      if (!t) return c
      return { ...c, all: Math.max(0, c.all - 1), [n.type]: { total: t.total - 1, unread: t.unread - (n.is_read ? 0 : 1) } }
    })
    // Per-type counts were adjusted above; the global unread totals here.
    if (!n.is_read) {
      setUnread(u => Math.max(0, u - 1))
      setNotificationCount(c => Math.max(0, c - 1))
    }
  }

  async function readAll() {
    setBusy(true)
    try {
      const res = await fetch('/api/notifications/read-all', { method: 'PUT', headers: authHeaders() })
      if (!res.ok) return
      invalidateApi('/api/notifications')
      setItems(prev => onlyUnread ? [] : prev.map(n => ({ ...n, is_read: true })))
      setUnread(0)
      setNotificationCount(0)
      setCounts(c => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, k === 'all' ? v : { ...v, unread: 0 }])))
    } finally {
      setBusy(false)
    }
  }

  async function clearRead() {
    setBusy(true)
    try {
      const res = await fetch('/api/notifications/read', { method: 'DELETE', headers: authHeaders() })
      const data = await res.json()
      if (!res.ok) return
      invalidateApi('/api/notifications')
      setItems(prev => prev.filter(n => !n.is_read))
      setCounts(c => {
        const next = { all: 0 }
        for (const [k, v] of Object.entries(c)) {
          if (k === 'all') continue
          if (v.unread > 0) { next[k] = { total: v.unread, unread: v.unread }; next.all += v.unread }
        }
        return next
      })
      setToast({ type: 'success', message: 'ล้างแล้ว', submessage: `ลบการแจ้งเตือนที่อ่านแล้ว ${data.deleted} รายการ` })
    } finally {
      setBusy(false)
    }
  }

  async function openRelated(n) {
    markRead(n)
    setOpening(n.id)
    try {
      const res = await fetch(`/api/admin/bookings/${n.related_id}`, { headers: authHeaders() })
      const data = await res.json()
      if (!res.ok) { setToast({ type: 'error', submessage: data.error || 'เปิดคำขอไม่สำเร็จ' }); return }
      setDetail(data.booking)
    } catch {
      setToast({ type: 'error', submessage: 'เปิดคำขอไม่สำเร็จ' })
    } finally {
      setOpening(null)
    }
  }

  const readCount = counts.all - unread
  const groups = groupByDate(items)
  const activeLabel = type === 'all' ? 'ทั้งหมด' : typeOf(type).label

  if (loading) {
    return (
      <div className="animate-fade-in flex flex-col flex-1 min-h-0 w-full">
        <div className="mb-6">
          <Skeleton className="h-8 w-48 rounded-lg mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
        <SkeletonList rows={5} />
      </div>
    )
  }

  const typeFilters = [
    { key: 'all', label: 'ทั้งหมด', icon: 'bx-bell', iconClass: 'bg-gray-100 dark:bg-gray-800 text-gray-500', count: counts.all, unread },
    ...TYPE_ORDER.map(k => ({ key: k, label: TYPES[k].label, icon: TYPES[k].icon, iconClass: TYPES[k].color, count: counts[k]?.total || 0, unread: counts[k]?.unread || 0 })),
  ]

  return (
    <div className="animate-fade-in flex flex-col flex-1 min-h-0 w-full pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5 sm:mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white font-heading">การแจ้งเตือน</h2>
            {unread > 0 && (
              <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold">{unread}</span>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {counts.all === 0 ? 'ยังไม่มีการแจ้งเตือน' : `ทั้งหมด ${counts.all} รายการ · ยังไม่ได้อ่าน ${unread} รายการ`}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={readAll} disabled={!unread || busy}
            className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <i className="bx bx-check-double text-base"></i> อ่านทั้งหมด
          </button>
          <button type="button" onClick={clearRead} disabled={!readCount || busy}
            className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <i className="bx bx-trash text-base"></i> ล้างที่อ่านแล้ว
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
        <div className="min-w-0">
          {/* Read-state toggle + type chips (chips replace the side panel below lg) */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <div className="inline-flex p-1 rounded-xl bg-gray-100 dark:bg-gray-800/70" role="group" aria-label="สถานะการอ่าน">
              {[[false, 'ทั้งหมด'], [true, 'ยังไม่ได้อ่าน']].map(([v, label]) => (
                <button key={label} type="button" onClick={() => setOnlyUnread(v)} aria-pressed={onlyUnread === v}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${onlyUnread === v
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                  {label}{v && unread > 0 ? ` (${unread})` : ''}
                </button>
              ))}
            </div>
            <div className="lg:hidden flex flex-wrap gap-2">
              {typeFilters.filter(f => f.key === 'all' || f.count > 0).map(f => (
                <button key={f.key} type="button" onClick={() => setType(f.key)} aria-pressed={type === f.key}
                  className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold transition-colors ${type === f.key
                    ? 'bg-brand-600 text-white'
                    : 'bg-white dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}>
                  <i className={`bx ${f.icon} text-sm`}></i>{f.label}
                  <span className={type === f.key ? 'text-white/70' : 'text-gray-400'}>{f.count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Empty states */}
          {items.length === 0 && (
            <div className="card py-16 flex items-center justify-center">
              <div className="text-center max-w-xs mx-auto px-4">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center">
                  <i className={`bx ${onlyUnread ? 'bxs-check-circle text-emerald-500' : 'bx-bell text-gray-300 dark:text-gray-600'} text-3xl`}></i>
                </div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                  {onlyUnread ? 'อ่านครบทุกรายการแล้ว' : counts.all === 0 ? 'ยังไม่มีการแจ้งเตือน' : `ไม่มีการแจ้งเตือนประเภท "${activeLabel}"`}
                </p>
                {counts.all === 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">เมื่อมีคำขอใหม่ การอนุมัติ หรือการคืนรถ จะแจ้งเตือนที่นี่</p>
                )}
              </div>
            </div>
          )}

          {/* Grouped list */}
          {groups.map((group, gi) => (
            <section key={group.label} className={gi > 0 ? 'mt-6' : ''}>
              <div className="flex items-center gap-3 mb-2.5">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400">{group.label}</h3>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">{group.items.length} รายการ</span>
                <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
              </div>
              <ul className="card divide-y divide-gray-100 dark:divide-gray-700/50 overflow-hidden">
                {group.items.map(n => {
                  const t = typeOf(n.type)
                  const isUnread = !n.is_read
                  return (
                    <li key={n.id} className={`group relative flex items-start gap-3 sm:gap-4 px-4 py-3.5 transition-colors ${isUnread ? 'bg-brand-50/50 dark:bg-brand-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}>
                      {isUnread && <span className="absolute left-0 top-3 bottom-3 w-0.5 rounded-r bg-brand-500" aria-hidden="true" />}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.color}`}>
                        <i className={`bx ${t.icon} text-xl`}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className={`font-semibold ${isUnread ? 'text-brand-600 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400'}`}>{t.label}</span>
                          <span className="text-gray-300 dark:text-gray-600">·</span>
                          <time className="text-gray-400 dark:text-gray-500" dateTime={n.created_at}
                            title={new Date(n.created_at).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' })}>
                            {timeAgo(n.created_at)}
                          </time>
                          {isUnread && <span className="sr-only">ยังไม่ได้อ่าน</span>}
                        </div>
                        <p className={`text-sm leading-snug mt-0.5 break-words ${isUnread ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                          {cleanMessage(n.message)}
                        </p>
                        {n.related_type === 'booking' && n.related_id && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                            <button type="button" onClick={() => openRelated(n)} disabled={opening === n.id}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-60">
                              {opening === n.id ? <i className="bx bx-loader-alt animate-spin text-sm"></i> : <i className="bx bx-file text-sm"></i>}
                              ดูคำขอ
                            </button>
                            {/* Signing happens on คำขอจอง, where the sign modal lives. */}
                            {n.type === 'sign_request' && isUnread && (
                              <Link to="/app/bookings" onClick={() => markRead(n)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline">
                                <i className="bx bx-pen text-sm"></i> ไปเซ็นเอกสาร
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
                        {isUnread && (
                          <button type="button" onClick={() => markRead(n)} title="ทำเครื่องหมายว่าอ่านแล้ว" aria-label="ทำเครื่องหมายว่าอ่านแล้ว"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-brand-600 hover:bg-white dark:hover:bg-gray-700 transition-colors">
                            <i className="bx bx-check text-lg"></i>
                          </button>
                        )}
                        <button type="button" onClick={() => remove(n)} title="ลบ" aria-label="ลบการแจ้งเตือน"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-white dark:hover:bg-gray-700 transition-colors">
                          <i className="bx bx-trash text-base"></i>
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}

          {hasMore && (
            <div className="flex justify-center mt-6">
              <button type="button" onClick={loadMore} disabled={loadingMore}
                className="h-10 px-5 inline-flex items-center gap-2 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 transition-colors">
                {loadingMore ? <i className="bx bx-loader-alt animate-spin"></i> : <i className="bx bx-chevron-down"></i>}
                โหลดเพิ่ม
              </button>
            </div>
          )}
        </div>

        {/* Side panel (lg+): type filters with counts, unread markers */}
        <aside className="hidden lg:block sticky top-24 space-y-4">
          <div className="card p-2">
            <p className="px-3 pt-2 pb-1.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500">ประเภท</p>
            {typeFilters.map(f => (
              <FilterButton key={f.key} active={type === f.key} onClick={() => setType(f.key)}
                icon={f.icon} iconClass={f.iconClass} label={f.label} count={f.count} unread={f.key === 'all' ? 0 : f.unread} />
            ))}
          </div>
          <div className="card p-4 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1 flex items-center gap-1.5">
              <i className="bx bx-info-circle text-sm"></i> เคล็ดลับ
            </p>
            กด "ดูคำขอ" เพื่อเปิดรายละเอียดคำขอและเอกสาร · ชี้ที่เวลาเพื่อดูวันเวลาเต็ม
          </div>
        </aside>
      </div>

      <BookingDetailModal
        booking={detail}
        publicMode={false}
        canManageBookings={false}
        canSign={false}
        onClose={() => setDetail(null)}
        onActionDone={() => setDetail(null)}
        setToast={setToast}
      />

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}
