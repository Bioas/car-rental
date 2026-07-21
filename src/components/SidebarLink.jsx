import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export function SidebarLink({ to, label, collapsed, admin, badge, onClick, children }) {
  const { isAdmin } = useApp()
  const location = useLocation()

  if (admin && !isAdmin) return null

  const isActive = location.pathname === to

  return (
    <Link
      to={to}
      onClick={onClick}
      className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
        isActive
          ? 'text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/25'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100/80 dark:hover:bg-gray-800/50'
      }`}
    >
      {/* Active indicator bar */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-brand-500 dark:bg-brand-400 rounded-r-full" />
      )}

      <span className="flex-shrink-0 relative">
        {children}
        {/* Notification badge */}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1 shadow-sm shadow-red-500/30">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>

      {!collapsed && (
        <span className="truncate tracking-wide">{label}</span>
      )}

      {collapsed && (
        <div className="absolute left-full ml-3 px-3 py-1.5 bg-gray-900/90 dark:bg-gray-700/90 backdrop-blur-sm text-white text-xs rounded-lg whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 shadow-xl translate-x-1 group-hover:translate-x-0">
          <span className="relative">
            {label}
            {badge !== undefined && badge > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[14px] h-3.5 rounded-full bg-red-500 text-white text-[8px] font-bold px-1">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </span>
        </div>
      )}
    </Link>
  )
}
