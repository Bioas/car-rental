import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { timeAgo } from '../lib/constants'

const FILTERS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'unread', label: 'ยังไม่ได้อ่าน' },
]

const NOTIF_TYPES = {
  approved: { label: 'อนุมัติแล้ว', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
  rejected: { label: 'ปฏิเสธ', icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z', color: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
  booking_request: { label: 'คำขอจอง', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
  cancelled: { label: 'ยกเลิก', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' },
}

function getNotifType(type) {
  return NOTIF_TYPES[type] || { label: 'ทั่วไป', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', color: 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400' }
}

function NotifIcon({ type }) {
  const t = getNotifType(type)
  return (
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${t.color}`}>
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={t.icon} />
      </svg>
    </div>
  )
}

function SkeletonItem() {
  return (
    <div className="rounded-2xl border border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark p-4 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-16 bg-gray-100 dark:bg-gray-800 rounded" />
          <div className="h-4 w-3/4 bg-gray-100 dark:bg-gray-800 rounded" />
          <div className="h-3 w-20 bg-gray-100 dark:bg-gray-800 rounded" />
        </div>
      </div>
    </div>
  )
}

function groupByDate(notifications) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)

  const groups = { today: [], yesterday: [], older: [] }

  for (const n of notifications) {
    const d = new Date(n.created_at)
    const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    if (dateOnly.getTime() >= today.getTime()) {
      groups.today.push(n)
    } else if (dateOnly.getTime() >= yesterday.getTime()) {
      groups.yesterday.push(n)
    } else {
      groups.older.push(n)
    }
  }

  const result = []
  if (groups.today.length) result.push({ label: 'วันนี้', items: groups.today })
  if (groups.yesterday.length) result.push({ label: 'เมื่อวาน', items: groups.yesterday })
  if (groups.older.length) result.push({ label: 'ก่อนหน้านี้', items: groups.older })
  return result
}

export default function Notifications() {
  const { authHeaders, setNotificationCount } = useApp()
  const [notifications, setNotifications] = useState([])
  const [unread, setUnread] = useState(0)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [animatingIds, setAnimatingIds] = useState(new Set())

  useEffect(() => { fetchNotifications() }, [])

  async function fetchNotifications() {
    try {
      const res = await fetch('/api/notifications', { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
        setUnread(data.unread || 0)
        setNotificationCount(data.unread || 0)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function markRead(id) {
    setAnimatingIds(prev => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: 'PUT',
        headers: authHeaders()
      })
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n))
        setUnread(prev => Math.max(0, prev - 1))
        setNotificationCount(prev => Math.max(0, prev - 1))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setTimeout(() => {
        setAnimatingIds(prev => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }, 400)
    }
  }

  async function readAll() {
    try {
      const res = await fetch('/api/notifications/read-all', {
        method: 'PUT',
        headers: authHeaders()
      })
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })))
        setUnread(0)
        setNotificationCount(0)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const filtered = notifications.filter(n => {
    if (filter === 'unread' && n.is_read) return false
    return true
  })

  const groups = groupByDate(filtered)

  if (loading) {
    return (
      <div className="animate-fade-in max-w-4xl">
        <div className="mb-6">
          <div className="h-8 w-48 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-32 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <SkeletonItem key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white font-heading">การแจ้งเตือน</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {notifications.length === 0
                ? 'คุณยังไม่มีการแจ้งเตือน'
                : `ทั้งหมด ${notifications.length} รายการ`}
            </p>
          </div>
          {unread > 0 && (
            <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-brand-600 text-white text-[11px] font-bold">
              {unread}
            </span>
          )}
        </div>
        {unread > 0 && (
          <button
            onClick={readAll}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            อ่านทั้งหมด
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      {notifications.length > 0 && (
        <div className="flex gap-1.5 mb-6">
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
              <span className={`ml-1.5 ${filter === f.key ? 'text-white/70' : 'text-gray-400 dark:text-gray-500'}`}>
                ({f.key === 'all' ? notifications.length : unread})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Empty States */}
      {notifications.length === 0 && (
        <div className="card py-20">
          <div className="text-center max-w-xs mx-auto">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <h3 className="text-base font-medium text-gray-500 dark:text-gray-400 font-heading mb-1">ยังไม่มีการแจ้งเตือน</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              เมื่อมีการอัปเดตเกี่ยวกับการจองหรือรถยนต์ คุณจะได้รับการแจ้งเตือนที่นี่
            </p>
          </div>
        </div>
      )}

      {notifications.length > 0 && filtered.length === 0 && filter === 'unread' && (
        <div className="card py-16">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-emerald-500 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">อ่านการแจ้งเตือนทั้งหมดแล้ว</p>
          </div>
        </div>
      )}

      {/* Grouped Notification List */}
      {groups.map((group, gi) => (
        <div key={group.label} className={gi > 0 ? 'mt-8' : ''}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3 px-1">
            {group.label}
          </h3>
          <div className="space-y-2">
            {group.items.map((n, i) => {
              const t = getNotifType(n.type)
              const isUnread = !n.is_read
              const isAnimating = animatingIds.has(n.id)

              return (
                <div
                  key={n.id}
                  onClick={() => isUnread && markRead(n.id)}
                  style={{ animationDelay: `${(gi * group.items.length + i) * 50}ms` }}
                  className={`rounded-2xl border p-4 transition-all duration-300 ease-out animate-slide-up-fade opacity-0 [animation-fill-mode:forwards]
                    ${isAnimating
                      ? 'scale-[0.98] opacity-60'
                      : ''
                    }
                    ${isUnread
                      ? 'cursor-pointer bg-brand-50/40 dark:bg-brand-900/10 border-brand-200 dark:border-brand-800/40 shadow-sm hover:shadow-md'
                      : 'cursor-default bg-card-light dark:bg-card-dark border-border-light dark:border-border-dark'
                    }`}
                >
                  <div className="flex items-start gap-4">
                    <NotifIcon type={n.type} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                          isUnread ? 'text-brand-500 dark:text-brand-400' : 'text-gray-400 dark:text-gray-500'
                        }`}>
                          {t.label}
                        </span>
                        <span className="text-[10px] text-gray-300 dark:text-gray-600">·</span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{timeAgo(n.created_at)}</span>
                      </div>
                      <p className={`text-sm leading-snug ${
                        isUnread
                          ? 'font-medium text-gray-900 dark:text-white'
                          : 'text-gray-600 dark:text-gray-400'
                      }`}>
                        {n.message}
                      </p>
                    </div>
                    {isUnread && (
                      <div className="flex-shrink-0 mt-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-brand-500 dark:bg-brand-400 ring-2 ring-brand-100 dark:ring-brand-900/50" />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
