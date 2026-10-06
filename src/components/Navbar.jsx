import React, { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { timeAgo } from '../lib/constants'

const NOTIF_TYPES = {
  approved: { label: 'อนุมัติแล้ว', icon: 'bxs-check-circle', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
  rejected: { label: 'ปฏิเสธ', icon: 'bxs-x-circle', color: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
  booking_request: { label: 'คำขอจอง', icon: 'bx-calendar', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
  cancelled: { label: 'ยกเลิก', icon: 'bxs-info-circle', color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' },
}

function getNotifType(type) {
  return NOTIF_TYPES[type] || { label: 'ทั่วไป', icon: 'bxs-info-circle', color: 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400' }
}

export function Navbar() {
  const { toggleSidebar, darkMode, toggleDark, notificationCount, setNotificationCount, user, isAdmin, logout, authHeaders } = useApp()
  const navigate = useNavigate()
  const [showDropdown, setShowDropdown] = useState(false)
  const [showNotifDropdown, setShowNotifDropdown] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [darkAnimating, setDarkAnimating] = useState(false)
  const dropdownRef = useRef(null)
  const notifDropdownRef = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target)) {
        setShowNotifDropdown(false)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  function handleToggleDark() {
    setDarkAnimating(true)
    toggleDark()
    setTimeout(() => setDarkAnimating(false), 400)
  }

  async function fetchNotifications() {
    try {
      const res = await fetch('/api/notifications', { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
        setNotificationCount(data.unread || 0)
      }
    } catch (e) {
      console.error(e)
    }
  }

  function unreadNotifCount() {
    return notifications.filter(n => !n.is_read).length
  }

  function notifLink(n) {
    if (n.related_type === 'booking') return '/app/bookings'
    return null
  }

  async function handleClickNotif(n) {
    setShowNotifDropdown(false)
    if (!n.is_read) {
      try {
        await fetch(`/api/notifications/${n.id}/read`, {
          method: 'PUT',
          headers: authHeaders()
        })
        setNotificationCount(prev => Math.max(0, prev - 1))
      } catch (e) {
        console.error(e)
      }
    }
    const link = notifLink(n)
    if (link) navigate(link)
  }

  async function readAll() {
    try {
      const res = await fetch('/api/notifications/read-all', {
        method: 'PUT',
        headers: authHeaders()
      })
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })))
        setNotificationCount(0)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const initials = user?.name ? user.name.charAt(0).toUpperCase() : '?'

  return (
    <header className="h-20 border-b border-border-light dark:border-border-dark bg-card-light/80 dark:bg-card-dark/80 backdrop-blur-md flex items-center justify-between px-4 sm:px-6 lg:px-8 sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button onClick={toggleSidebar} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 lg:hidden transition-colors">
          <i className="bx bx-menu text-xl"></i>
        </button>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Dark mode toggle */}
        <button
          onClick={handleToggleDark}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
          title={darkMode ? 'โหมดสว่าง' : 'โหมดมืด'}
        >
          <div className={`transition-transform duration-300 ease-out ${darkAnimating ? 'rotate-180 scale-75' : 'rotate-0 scale-100'}`}>
            {darkMode ? (
              <i className="bx bx-sun text-xl"></i>
            ) : (
              <i className="bx bx-moon text-xl"></i>
            )}
          </div>
        </button>

        {/* Notification bell + dropdown */}
        <div className="relative" ref={notifDropdownRef}>
          <button
            onClick={() => {
              if (!showNotifDropdown) fetchNotifications()
              setShowNotifDropdown(!showNotifDropdown)
            }}
            className="relative p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <i className="bx bx-bell text-xl"></i>
            {notificationCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 ring-2 ring-white dark:ring-card-dark">
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            )}
          </button>

          {showNotifDropdown && (
            <div className="absolute right-0 mt-2 w-80 card p-0 shadow-xl border border-border-light dark:border-border-dark z-50 overflow-hidden animate-scale-in">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border-light dark:border-border-dark">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white font-heading">การแจ้งเตือน</h3>
                  {unreadNotifCount() > 0 && (
                    <span className="min-w-[18px] h-[18px] rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center px-1">
                      {unreadNotifCount()}
                    </span>
                  )}
                </div>
                {unreadNotifCount() > 0 && (
                  <button onClick={readAll} className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 font-medium transition-colors">
                    อ่านทั้งหมด
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto scrollbar-thin">
                {notifications.length > 0 ? (
                  notifications.slice(0, 6).map(n => {
                    const t = getNotifType(n.type)
                    const isUnread = !n.is_read
                    const linkTo = notifLink(n)
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleClickNotif(n)}
                        className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors
                          ${isUnread
                            ? 'bg-brand-50/40 dark:bg-brand-900/10 hover:bg-brand-50/60 dark:hover:bg-brand-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'
                          }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${t.color}`}>
                          <i className={`bx ${t.icon} text-base`}></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                              isUnread ? 'text-brand-500 dark:text-brand-400' : 'text-gray-400 dark:text-gray-500'
                            }`}>{t.label}</span>
                            <span className="text-[10px] text-gray-300 dark:text-gray-600">·</span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">{timeAgo(n.created_at)}</span>
                          </div>
                          <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">{n.message}</p>
                          {linkTo && (
                            <span className="inline-block mt-1.5 text-xs text-brand-600 dark:text-brand-400 font-medium">ดูรายละเอียด →</span>
                          )}
                        </div>
                        {isUnread && (
                          <div className="w-2 h-2 rounded-full bg-brand-500 dark:bg-brand-400 flex-shrink-0 mt-1.5" />
                        )}
                      </button>
                    )
                  })
                ) : (
                  <div className="text-center py-10 text-gray-400">
                    <i className="bx bx-bell text-4xl mx-auto mb-2 opacity-40 block"></i>
                    <p className="text-sm">ไม่มีการแจ้งเตือน</p>
                  </div>
                )}
              </div>
              <Link
                to="/app/notifications"
                onClick={() => setShowNotifDropdown(false)}
                className="block text-center py-2.5 text-sm text-brand-600 dark:text-brand-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 border-t border-border-light dark:border-border-dark font-medium transition-colors"
              >
                ดูทั้งหมด
              </Link>
            </div>
          )}
        </div>

        {/* User avatar + dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/50 flex items-center justify-center ring-2 ring-brand-100/50 dark:ring-brand-900/30">
              <span className="text-sm font-semibold text-brand-700 dark:text-brand-300 font-heading">{initials}</span>
            </div>
            <span className="hidden sm:block text-sm font-medium text-gray-700 dark:text-gray-300">{user?.name?.split(' ')[0]}</span>
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-2 w-56 card p-0 shadow-xl border border-border-light dark:border-border-dark z-50 overflow-hidden animate-scale-in">
              <div className="px-4 py-3">
                <p className="text-sm font-semibold text-gray-900 dark:text-white font-heading">{user?.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{user?.email}</p>
                {isAdmin && (
                  <span className="inline-block mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
                    ผู้ดูแลระบบ
                  </span>
                )}
              </div>
              <div className="border-t border-border-light dark:border-border-dark" />
              <div className="p-1">
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <i className="bx bx-log-out text-base"></i>
                  ออกจากระบบ
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
