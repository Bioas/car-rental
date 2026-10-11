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
    // One flat background shared by the page, navbar and sidebar (like
    // YouTube) so the shell reads as a single surface; cards sit on top of it.
    <div className="min-h-screen flex bg-white dark:bg-surface-dark transition-colors duration-300">
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
