import React from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Navbar } from './Navbar'
import { useApp } from '../context/AppContext'

export function AppLayout() {
  const { sidebarOpen, toggleSidebar } = useApp()

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-gray-50 via-white to-brand-50 dark:from-gray-950 dark:via-gray-900 dark:to-brand-950 transition-colors duration-300">
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen lg:ml-64 min-w-0">
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
    </div>
  )
}
