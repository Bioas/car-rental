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
  const [bookingsByCar, setBookingsByCar] = useState([])
  const [bookingsByMonth, setBookingsByMonth] = useState([])
  const [topUsers, setTopUsers] = useState([])
  const [maxCarCount, setMaxCarCount] = useState(1)
  const [maxMonthly, setMaxMonthly] = useState(1)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      const headers = authHeaders()
      const [carsRes, bookingsRes] = await Promise.all([
        fetch('/api/cars', { headers }),
        isAdmin ? fetch('/api/admin/bookings', { headers }) : fetch('/api/admin/bookings', { headers }),
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
          setBookingsByCar(reportData.bookingsByCar || [])
          setBookingsByMonth(reportData.bookingsByMonth || [])
          setTopUsers(reportData.topUsers || [])
          if (reportData.bookingsByCar?.length > 0) {
            setMaxCarCount(Math.max(...reportData.bookingsByCar.map(c => c.count), 1))
          }
          if (reportData.bookingsByMonth?.length > 0) {
            setMaxMonthly(Math.max(...reportData.bookingsByMonth.map(m => m.count), 1))
          }
        }
      }
    } catch (e) {
      console.error('Dashboard fetch error:', e)
    }
  }

  function pctCount(count) { return maxCarCount > 0 ? (count / maxCarCount) * 100 : 0 }
  function barHeight(count) { return maxMonthly > 0 ? (count / maxMonthly) * 85 : 0 }

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

      {isAdmin && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading font-semibold text-gray-900 dark:text-white">จำนวนการจองแยกตามรถ</h3>
                <Link to="/app/reports" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">ดูทั้งหมด</Link>
              </div>
              {bookingsByCar.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">ยังไม่มีข้อมูล</div>
              ) : (
                <div className="space-y-3">
                  {bookingsByCar.slice(0, 6).map(c => (
                    <div key={c.id} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1 min-w-0">{c.brand} {c.model}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="h-2 w-28 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 transition-all duration-500" style={{ width: pctCount(c.count) + '%' }} />
                        </div>
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 w-6 text-right">{c.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading font-semibold text-gray-900 dark:text-white">ผู้ใช้ที่จองมากที่สุด</h3>
                <Link to="/app/users" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">ดูทั้งหมด</Link>
              </div>
              {topUsers.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">ยังไม่มีข้อมูล</div>
              ) : (
                <div className="space-y-2">
                  {topUsers.map((u, i) => (
                    <div key={u.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                          i === 1 ? 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400' :
                          i === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                          'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'
                        }`}>{i + 1}</div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-brand-600 dark:text-brand-400 shrink-0 ml-2">{u.count} ครั้ง</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-semibold text-gray-900 dark:text-white">การจองรายเดือน</h3>
              <Link to="/app/reports" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">ดูทั้งหมด</Link>
            </div>
            {bookingsByMonth.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">ยังไม่มีข้อมูล</div>
            ) : (
              <div className="flex items-end gap-2 sm:gap-3 h-44">
                {[...bookingsByMonth].reverse().map(m => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                    <span className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400">{m.count}</span>
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-brand-600 to-brand-400 hover:from-brand-500 hover:to-brand-300 transition-all duration-300 min-h-[4px]"
                      style={{ height: barHeight(m.count) + '%' }}
                      title={`${m.month}: ${m.count} การจอง`}
                    />
                    <span className="text-[9px] sm:text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                      {(() => {
                        const [y, mo] = m.month.split('-')
                        const thai = ['', 'ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
                        return `${thai[parseInt(mo)]} ${(parseInt(y)+543).toString().slice(2)}`
                      })()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
