import React from 'react'
import { SidebarLink } from './SidebarLink'
import { useApp } from '../context/AppContext'

export function Sidebar() {
  const { sidebarOpen, toggleSidebar, notificationCount, sseConnected, connectSSE } = useApp()

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark w-64 transition-transform duration-300 ease-out ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 lg:sticky lg:top-0 lg:bottom-auto lg:left-auto lg:h-screen`}
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

      {/* SSE status — bottom of sidebar */}
      <div className="shrink-0 px-3 py-3 border-t border-border-light/80 dark:border-border-dark/80">
        <button onClick={sseConnected ? undefined : connectSSE}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 ${
            sseConnected
              ? 'hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-default'
              : 'hover:bg-red-50 dark:hover:bg-red-950/20 cursor-pointer active:scale-[0.98]'
          }`}
          title={sseConnected ? 'เชื่อมต่อแบบเรียลไทม์' : 'คลิกเพื่อเชื่อมต่อใหม่'}>
          {/* Icon */}
          <div className={`relative w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-500 ${
            sseConnected
              ? 'bg-emerald-100 dark:bg-emerald-900/30'
              : 'bg-red-100 dark:bg-red-900/30'
          }`}>
            {sseConnected ? (
              <>
                <div className="absolute inset-0 rounded-lg bg-emerald-400/20 dark:bg-emerald-400/10 animate-pulse" />
                <i className="bx bx-wifi text-base text-emerald-600 dark:text-emerald-400 relative"></i>
              </>
            ) : (
              <i className="bx bx-wifi-off text-base text-red-500 dark:text-red-400 relative"></i>
            )}
          </div>
          {/* Text */}
          <div className="min-w-0 text-left">
            <p className={`text-xs font-semibold transition-colors duration-500 ${
              sseConnected ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {sseConnected ? 'เชื่อมต่อเรียลไทม์' : 'หลุดการเชื่อมต่อ'}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">
              {sseConnected ? 'ระบบอัปเดตอัตโนมัติ' : 'คลิกเพื่อเชื่อมต่อใหม่'}
            </p>
          </div>
          {/* Status dot */}
          <div className={`ml-auto w-2 h-2 rounded-full shrink-0 transition-all duration-500 ${
            sseConnected
              ? 'bg-emerald-400 shadow-sm shadow-emerald-300/50'
              : 'bg-red-400'
          }`} />
        </button>
      </div>
    </aside>
  )
}
