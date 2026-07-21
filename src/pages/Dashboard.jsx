import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { StatCard } from '../components/StatCard'
import { statusLabel, badgeClass } from '../lib/constants'

export default function Dashboard() {
  const { isAdmin, authHeaders } = useApp()
  const [stats, setStats] = useState({ totalCars: 0, availableCars: 0, pendingBookings: 0 })
  const [recentBookings, setRecentBookings] = useState([])
  const [availableCarsList, setAvailableCarsList] = useState([])
  const [activeBookings, setActiveBookings] = useState(0)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      const headers = authHeaders()
      const [carsRes, bookingsRes] = await Promise.all([
        fetch('/api/cars', { headers }),
        isAdmin ? fetch('/api/admin/bookings', { headers }) : fetch('/api/bookings', { headers }),
      ])

      if (carsRes.ok) {
        const carsData = await carsRes.json()
        setAvailableCarsList(carsData.cars.filter(c => c.status === 'available' && !c.has_active_booking).slice(0, 6))
        setStats(prev => ({ ...prev, totalCars: carsData.cars.length, availableCars: carsData.cars.filter(c => c.status === 'available').length }))
      }

      if (bookingsRes.ok) {
        const bookingData = await bookingsRes.json()
        const all = bookingData.bookings || []
        setRecentBookings(all.slice(0, 5))
        const today = new Date().toISOString().split('T')[0]
        setActiveBookings(all.filter(b => b.status === 'approved' && b.start_date <= today && b.end_date >= today).length)
      }

      if (isAdmin) {
        const adminRes = await fetch('/api/admin/reports', { headers })
        if (adminRes.ok) {
          const reportData = await adminRes.json()
          setStats(prev => ({ ...prev, pendingBookings: reportData.stats?.pendingBookings || 0 }))
        }
      }
    } catch (e) {
      console.error('Dashboard fetch error:', e)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        <StatCard title="รถยนต์ทั้งหมด" value={stats.totalCars} color="brand">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" /></svg>
        </StatCard>
        <StatCard title="พร้อมใช้งาน" value={stats.availableCars} color="emerald">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </StatCard>
        <StatCard title="กำลังใช้งานวันนี้" value={activeBookings} color="amber">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        </StatCard>
        {isAdmin && (
          <StatCard title="รออนุมัติ" value={stats.pendingBookings} color="red">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </StatCard>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-semibold text-gray-900 dark:text-white">การจองล่าสุด</h3>
            <Link to="/app/bookings" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">ดูทั้งหมด</Link>
          </div>
          {recentBookings.length === 0 ? (
            <div className="text-center py-8 text-gray-400"><p>ยังไม่มีการจอง</p></div>
          ) : (
            <div className="space-y-3">
              {recentBookings.map(b => (
                <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
                      <span className="text-sm font-semibold text-brand-700 dark:text-brand-300 font-heading">
                        {b.brand?.charAt(0)}{b.model?.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{b.brand} {b.model}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{b.start_date} → {b.end_date}</p>
                    </div>
                  </div>
                  <span className={badgeClass(b.status)}>{statusLabel(b.status)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-semibold text-gray-900 dark:text-white">รถยนต์พร้อมใช้</h3>
            <Link to="/app/cars" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">ดูทั้งหมด</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {availableCarsList.map(car => (
              <div key={car.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" /></svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{car.brand} {car.model}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{car.license_plate}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
