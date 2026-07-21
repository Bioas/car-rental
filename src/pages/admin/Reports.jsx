import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { StatCard } from '../../components/StatCard'
import { Spinner } from '../../components/ui/spinner'

export default function Reports() {
  const { authHeaders } = useApp()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ totalCars: 0, totalBookings: 0, approvedBookings: 0, returnedBookings: 0 })
  const [bookingsByCar, setBookingsByCar] = useState([])
  const [bookingsByMonth, setBookingsByMonth] = useState([])
  const [topUsers, setTopUsers] = useState([])
  const [maxCount, setMaxCount] = useState(1)
  const [maxMonthly, setMaxMonthly] = useState(1)

  useEffect(() => {
    fetchReports()
  }, [])

  function barWidth(count) {
    return Math.min(150, count * 30)
  }

  function pctCount(count) {
    return maxCount > 0 ? (count / maxCount) * 100 : 0
  }

  function barHeight(count) {
    return maxMonthly > 0 ? (count / maxMonthly) * 85 : 0
  }

  async function fetchReports() {
    try {
      const res = await fetch('/api/admin/reports', { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setStats(data.stats)
        setBookingsByCar(data.bookingsByCar)
        setBookingsByMonth(bookingsByMonth)
        setTopUsers(data.topUsers)
        if (data.bookingsByCar?.length > 0) {
          setMaxCount(Math.max(...data.bookingsByCar.map(c => c.count), 1))
        }
        if (data.bookingsByMonth?.length > 0) {
          setMaxMonthly(Math.max(...data.bookingsByMonth.map(m => m.count), 1))
        }
        setBookingsByMonth(data.bookingsByMonth || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="animate-fade-in">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white font-heading mb-6">รายงานสถิติ</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard title="รถทั้งหมด" value={stats.totalCars} color="brand" />
        <StatCard title="จองทั้งหมด" value={stats.totalBookings} color="amber" />
        <StatCard title="อนุมัติแล้ว" value={stats.approvedBookings} color="emerald" />
        <StatCard title="คืนแล้ว" value={stats.returnedBookings} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="font-heading font-semibold text-gray-900 dark:text-white mb-4">จำนวนการจองแยกตามรถ</h3>
          <div className="space-y-3">
            {bookingsByCar.map(c => (
              <div key={c.id} className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">{c.brand} {c.model} ({c.license_plate})</span>
                <div className="flex items-center gap-2">
                  <div className="h-2 rounded-full bg-brand-200 dark:bg-brand-900/50" style={{ width: barWidth(c.count) + 'px' }}>
                    <div className="h-full rounded-full bg-brand-600" style={{ width: pctCount(c.count) + '%' }} />
                  </div>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-8 text-right">{c.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-heading font-semibold text-gray-900 dark:text-white mb-4">ผู้ใช้ที่จองมากที่สุด</h3>
          <div className="space-y-3">
            {topUsers.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">ไม่มีข้อมูล</div>
            ) : (
              topUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{u.name}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </div>
                  <span className="text-sm font-semibold text-brand-600 dark:text-brand-400">{u.count} ครั้ง</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card p-6 lg:col-span-2">
          <h3 className="font-heading font-semibold text-gray-900 dark:text-white mb-4">การจองรายเดือน</h3>
          {bookingsByMonth.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">ไม่มีข้อมูล</div>
          ) : (
            <div className="flex items-end gap-3 h-48">
              {bookingsByMonth.map(m => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{m.count}</span>
                  <div
                    className="w-full rounded-lg bg-gradient-to-t from-brand-600 to-brand-400 transition-all duration-500"
                    style={{ height: barHeight(m.count) + '%' }}
                  />
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap">{m.month}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
