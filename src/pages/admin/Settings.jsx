import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useApp } from '../../context/AppContext'

// Back-office configuration lives under one "ตั้งค่า" page: each tab is a
// nested route (/app/settings/<tab>) rendering an existing management page.
const TABS = [
  { to: 'cars', icon: 'bx-car', label: 'รถยนต์' },
  { to: 'users', icon: 'bx-group', label: 'ผู้ใช้' },
  { to: 'document', icon: 'bx-file', label: 'เอกสาร' },
  // LINE credentials are secrets — admins only (api/routes/admin.cjs adminOnly).
  { to: 'line', icon: 'bx-message-rounded-dots', label: 'LINE', adminOnly: true },
]

export default function Settings() {
  const { user } = useApp()
  const tabs = TABS.filter((tab) => !tab.adminOnly || user?.role === 'admin')
  return (
    <div className="animate-fade-in flex flex-col flex-1 min-h-0">
      {/* Tab bar — horizontal scroll on mobile, same pattern as คำขอจอง. */}
      <nav aria-label="หมวดการตั้งค่า"
        className="flex gap-0 border-b border-gray-200 dark:border-gray-700 mb-6 overflow-x-auto scrollbar-none shrink-0"
        style={{
          maskImage: 'linear-gradient(to right, black 92%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, black 92%, transparent 100%)',
        }}>
        {tabs.map(tab => (
          <NavLink key={tab.to} to={tab.to}
            className={({ isActive }) => `shrink-0 flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition-all border-b-2 -mb-px whitespace-nowrap ${
              isActive
                ? 'border-brand-600 text-brand-600 dark:text-brand-400 dark:border-brand-400'
                : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}>
            <i aria-hidden="true" className={`bx ${tab.icon} text-base`}></i>
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col flex-1 min-h-0">
        <Outlet />
      </div>
    </div>
  )
}
