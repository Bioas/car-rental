import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { timeAgo } from '../lib/constants'

const FILTERS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'unread', label: 'ยังไม่ได้อ่าน' },
]

const NOTIF_TYPES = {
  approved: { label: 'อนุมัติแล้ว', icon: 'bxs-check-circle', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
  rejected: { label: 'ปฏิเสธ', icon: 'bxs-x-circle', color: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
  booking_request: { label: 'คำขอจอง', icon: 'bx-calendar', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
  cancelled: { label: 'ยกเลิก', icon: 'bxs-info-circle', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' },
}

const TYPE_ORDER = ['booking_request', 'approved', 'rejected', 'cancelled']

function getNotifType(type) {
  return NOTIF_TYPES[type] || { label: 'ทั่วไป', icon: 'bxs-info-circle', color: 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400' }
}

function NotifIcon({ type }) {
  const t = getNotifType(type)
  return (
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${t.color}`}>
      <i className={`bx ${t.icon} text-xl`}></i>
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

function StatCard({ label, value, icon, color, sublabel }) {
  return (
    <div className="flex items-center gap-3 p-3 sm:p-4 rounded-xl border border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <i className={`bx ${icon} text-xl`}></i>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{value}</p>
        {sublabel && (
          <p className="text-[10px] text-gray-400 dark:text-gray-500">{sublabel}</p>
        )}
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

  // Compute stats from notifications
  const byType = {}
  for (const n of notifications) {
    byType[n.type] = (byType[n.type] || 0) + 1
  }

  const filtered = notifications.filter(n => {
    if (filter === 'unread' && n.is_read) return false
    return true
  })

  const groups = groupByDate(filtered)

  if (loading) {
    return (
      <div className="animate-fade-in flex flex-col flex-1 min-h-0 w-full">
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
    <div className="animate-fade-in flex flex-col flex-1 min-h-0 w-full max-w-none">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 sm:mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white font-heading">การแจ้งเตือน</h2>
            {unread > 0 && (
              <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold">
                {unread}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {notifications.length === 0
              ? 'คุณยังไม่มีการแจ้งเตือน'
              : `ทั้งหมด ${notifications.length} รายการ · ยังไม่ได้อ่าน ${unread} รายการ`}
          </p>
        </div>
        {unread > 0 && (
          <button
            onClick={readAll}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
          >
            <i className="bx bx-check-double text-base"></i>
            อ่านทั้งหมด
          </button>
        )}
      </div>

      {/* Stats Summary — only show when there are notifications */}
      {notifications.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-5 sm:mb-6">
          <StatCard
            label="ทั้งหมด"
            value={notifications.length}
            icon="bx-bell"
            color="bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400"
          />
          <StatCard
            label="ยังไม่ได้อ่าน"
            value={unread}
            icon="bxs-bell-ring"
            color="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
          />
          <StatCard
            label="คำขอจอง"
            value={byType.booking_request || 0}
            icon="bx-calendar"
            color="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
            sublabel={byType.approved ? `อนุมัติ ${byType.approved || 0}` : undefined}
          />
          <StatCard
            label="อื่นๆ"
            value={(byType.rejected || 0) + (byType.cancelled || 0)}
            icon="bxs-info-circle"
            color="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
            sublabel={byType.rejected ? `ปฏิเสธ ${byType.rejected} รายการ` : undefined}
          />
        </div>
      )}

      {/* Filter Tabs + Type Filters */}
      {notifications.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-5 sm:mb-6">
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
          {/* Type indicator chips — non-interactive, just show counts */}
          {TYPE_ORDER.map(type => {
            const t = getNotifType(type)
            const count = byType[type] || 0
            if (count === 0) return null
            return (
              <span
                key={type}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium ${
                  t.color
                } opacity-80`}
              >
                <i className={`bx ${t.icon} text-xs`}></i>
                {count}
              </span>
            )
          })}
        </div>
      )}

      {/* Empty States */}
      {notifications.length === 0 && (
        <div className="card flex-1 flex items-center justify-center">
          <div className="text-center max-w-xs mx-auto">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center">
              <i className="bx bx-bell text-4xl text-gray-300 dark:text-gray-600"></i>
            </div>
            <h3 className="text-base font-medium text-gray-500 dark:text-gray-400 font-heading mb-1">ยังไม่มีการแจ้งเตือน</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              เมื่อมีการอัปเดตเกี่ยวกับการจองหรือรถยนต์ คุณจะได้รับการแจ้งเตือนที่นี่
            </p>
          </div>
        </div>
      )}

      {notifications.length > 0 && filtered.length === 0 && filter === 'unread' && (
        <div className="card flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
              <i className="bx bxs-check-circle text-3xl text-emerald-500 dark:text-emerald-400"></i>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">อ่านการแจ้งเตือนทั้งหมดแล้ว</p>
          </div>
        </div>
      )}

      {/* Grouped Notification List — full width */}
      {groups.map((group, gi) => (
        <div key={group.label} className={gi > 0 ? 'mt-8' : ''}>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {group.label}
              </span>
              <span className="text-[10px] text-gray-300 dark:text-gray-600">·</span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">{group.items.length} รายการ</span>
            </div>
            <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
          </div>
          <div className="grid grid-cols-1 gap-2">
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
                    <div className="relative">
                      <NotifIcon type={n.type} />
                      {isUnread && (
                        <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-brand-500 dark:bg-brand-400 ring-2 ring-white dark:ring-gray-900" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-0.5">
                        <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                          isUnread ? 'text-brand-500 dark:text-brand-400' : 'text-gray-400 dark:text-gray-500'
                        }`}>
                          {t.label}
                        </span>
                        <span className="hidden sm:inline text-[10px] text-gray-300 dark:text-gray-600">·</span>
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
                      <div className="hidden sm:flex flex-shrink-0 mt-1.5">
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
