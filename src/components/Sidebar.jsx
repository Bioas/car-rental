import React from 'react'
import { Logo } from './Logo'
import { SidebarLink } from './SidebarLink'
import { useApp } from '../context/AppContext'

export function Sidebar() {
  const { sidebarOpen, toggleSidebar, notificationCount, sseConnected, connectSSE } = useApp()

  return (
    <aside aria-label="เมนูหลัก"
      className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-white dark:bg-gray-950 lg:bg-transparent lg:dark:bg-transparent w-72 lg:w-64 transition-transform duration-300 ease-out ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 lg:sticky lg:top-0 lg:bottom-auto lg:left-auto lg:h-screen`}
    >
      {/* Logo Section */}
      <div className="flex items-center h-20 px-4 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Logo size={46} />
          <div className="min-w-0">
            <h1 className="font-heading font-semibold text-base leading-snug text-gray-900 dark:text-white truncate" title="วิทยาลัยเทคนิคบุรีรัมย์">
              วิทยาลัยเทคนิคบุรีรัมย์
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate font-medium">
              ระบบบริหารจัดการยานพาหนะ
            </p>
          </div>
        </div>
        {/* Close button — visible only on mobile */}
        <button
          onClick={toggleSidebar}
          aria-label="ปิดเมนู"
          className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all duration-200 flex-shrink-0"
        >
          <i aria-hidden="true" className="bx bx-x text-xl"></i>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 overflow-y-auto scrollbar-thin">
        <div className="space-y-0.5">
          <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            เมนู
          </p>
          {/* 'admin' and 'staff' are equally privileged accounts (see
              AppContext's isAdmin and api/middleware/auth.cjs's
              adminMiddleware) — every logged-in user sees the same full
              menu, so there is no role branching here. */}
          <SidebarLink to="/app" label="แดชบอร์ด" onClick={() => sidebarOpen && toggleSidebar()}>
            <i aria-hidden="true" className="bx bx-home text-xl"></i>
          </SidebarLink>

          <SidebarLink to="/app/bookings" label="คำขอจอง" onClick={() => sidebarOpen && toggleSidebar()}>
            <i aria-hidden="true" className="bx bxs-check-circle text-xl"></i>
          </SidebarLink>

          <SidebarLink to="/app/drivers" label="ตารางคนขับ" onClick={() => sidebarOpen && toggleSidebar()}>
            <i aria-hidden="true" className="bx bx-id-card text-xl"></i>
          </SidebarLink>

          <SidebarLink to="/app/reports" label="รายงาน" onClick={() => sidebarOpen && toggleSidebar()}>
            <i aria-hidden="true" className="bx bx-bar-chart-alt-2 text-xl"></i>
          </SidebarLink>

          {/* เอกสารรอเซ็น lives inline in "คำขอจอง" (BookingsManage), and the
              signing record sits behind an approved booking's เอกสาร button
              there — there is no separate signing page. */}

          <SidebarLink to="/app/notifications" label="การแจ้งเตือน" badge={notificationCount} onClick={() => sidebarOpen && toggleSidebar()}>
            <i aria-hidden="true" className="bx bx-bell text-xl"></i>
          </SidebarLink>
        </div>

        {/* รถยนต์, ผู้ใช้ and เอกสาร are tabs of one settings page
            (src/pages/admin/Settings.jsx). */}
        <div className="space-y-0.5 mt-5">
          <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            ระบบ
          </p>
          <SidebarLink to="/app/settings" matchPrefix label="ตั้งค่า" onClick={() => sidebarOpen && toggleSidebar()}>
            <i aria-hidden="true" className="bx bx-cog text-xl"></i>
          </SidebarLink>
        </div>
      </nav>

      {/* SSE status — bottom of sidebar */}
      <div className="shrink-0 px-3 py-3">
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
                <i aria-hidden="true" className="bx bx-wifi text-base text-emerald-600 dark:text-emerald-400 relative"></i>
              </>
            ) : (
              <i aria-hidden="true" className="bx bx-wifi-off text-base text-red-500 dark:text-red-400 relative"></i>
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
