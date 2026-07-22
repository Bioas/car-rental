import React from 'react'
import { SidebarLink } from './SidebarLink'
import { useApp } from '../context/AppContext'

export function Sidebar() {
  const { sidebarOpen, toggleSidebar, notificationCount } = useApp()

  return (
    <aside
      className={`fixed left-0 top-0 h-full z-40 flex flex-col border-r border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark w-64 transition-transform duration-300 ease-out lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Logo Section */}
      <div className="flex items-center h-20 px-4 border-b border-border-light/80 dark:border-border-dark/80 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-9 h-9 flex-shrink-0">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-500/25" />
            <div className="relative w-full h-full flex items-center justify-center">
              <i className="bx bxs-zap text-base text-white"></i>
            </div>
          </div>
          <div className="min-w-0">
            <h1 className="font-heading font-semibold text-sm text-gray-900 dark:text-white truncate">
              ยานพาหนะ
            </h1>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 -mt-0.5 truncate font-medium tracking-wide">
              ระบบบริหารจัดการ
            </p>
          </div>
        </div>
        {/* Close button — visible only on mobile */}
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all duration-200 flex-shrink-0"
        >
          <i className="bx bx-x text-xl"></i>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 overflow-y-auto scrollbar-thin">
        <div className="space-y-0.5">
          <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            เมนู
          </p>
          <SidebarLink to="/app" label="แดชบอร์ด" onClick={() => sidebarOpen && toggleSidebar()}>
            <i className="bx bx-home text-xl"></i>
          </SidebarLink>

          <SidebarLink to="/app/bookings" label="คำขอจอง" onClick={() => sidebarOpen && toggleSidebar()}>
            <i className="bx bxs-check-circle text-xl"></i>
          </SidebarLink>

          <SidebarLink to="/app/cars" label="รถยนต์" onClick={() => sidebarOpen && toggleSidebar()}>
            <i className="bx bx-car text-xl"></i>
          </SidebarLink>

          <SidebarLink to="/app/users" label="ผู้ใช้" onClick={() => sidebarOpen && toggleSidebar()}>
            <i className="bx bx-group text-xl"></i>
          </SidebarLink>

          <SidebarLink to="/app/reports" label="รายงาน" onClick={() => sidebarOpen && toggleSidebar()}>
            <i className="bx bx-bar-chart-alt-2 text-xl"></i>
          </SidebarLink>

          <SidebarLink to="/app/notifications" label="การแจ้งเตือน" badge={notificationCount} onClick={() => sidebarOpen && toggleSidebar()}>
            <i className="bx bx-bell text-xl"></i>
          </SidebarLink>
        </div>
      </nav>
    </aside>
  )
}
