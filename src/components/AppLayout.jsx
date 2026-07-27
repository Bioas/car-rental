import React from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Navbar } from './Navbar'
import { Toast } from './ui/toast'
import { useApp } from '../context/AppContext'

export function AppLayout() {
  const navigate = useNavigate()
  const { sidebarOpen, toggleSidebar, globalToast, setGlobalToast } = useApp()

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-gray-50 via-white to-brand-50 dark:from-gray-950 dark:via-gray-900 dark:to-brand-950 transition-colors duration-300">
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <Navbar />
        <main className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 min-w-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile backdrop overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={toggleSidebar}
        />
      )}

      {/* Global toast for real-time notifications */}
      {globalToast && (
        <div onClick={() => navigate('/app/bookings')}>
          <Toast
            type="success"
            submessage={globalToast.submessage}
            message={globalToast.message}
            onClose={() => setGlobalToast(null)}
            duration={5000}
          />
        </div>
      )}
    </div>
  )
}
