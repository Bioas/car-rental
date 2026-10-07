import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { StatCard } from '../../components/StatCard'
import { Skeleton, SkeletonStats, SkeletonPanel } from '../../components/ui/skeleton'

export default function Reports() {
  const { authHeaders } = useApp()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ totalCars: 0, totalBookings: 0, approvedBookings: 0, returnedBookings: 0 })
  const [bookingsByCar, setBookingsByCar] = useState([])
  const [bookingsByMonth, setBookingsByMonth] = useState([])
  const [topUsers, setTopUsers] = useState([])
  const [maxCount, setMaxCount] = useState(1)

  useEffect(() => {
    fetchReports()
  }, [])

  function barWidth(count) {
    return Math.min(150, count * 30)
  }

  function pctCount(count) {
    return maxCount > 0 ? (count / maxCount) * 100 : 0
  }

  async function fetchReports() {
    try {
      const res = await fetch('/api/admin/reports', { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setStats(data.stats)
        setBookingsByCar(data.bookingsByCar)
        setTopUsers(data.topUsers)
        if (data.bookingsByCar?.length > 0) {
          setMaxCount(Math.max(...data.bookingsByCar.map(c => c.count), 1))
        }
        setBookingsByMonth(data.bookingsByMonth || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="animate-fade-in flex flex-col flex-1 min-h-0">
        <Skeleton className="h-7 w-40 rounded-lg mb-6" />
        <SkeletonStats className="mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonPanel lines={6} />
          <SkeletonPanel lines={5} />
          <SkeletonPanel lines={3} className="lg:col-span-2" />
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in flex flex-col flex-1 min-h-0">
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
            (() => {
              const sorted = [...bookingsByMonth].reverse()
              const max = Math.max(...sorted.map(m => m.count), 1)

              // Smart Y-axis ticks
              function getTicks(maxVal) {
                if (maxVal <= 3) {
                  const arr = []
                  for (let i = 0; i <= maxVal; i++) arr.push(i)
                  return arr
                }
                const step = Math.ceil(maxVal / 3)
                const arr = []
                for (let i = 0; i <= maxVal; i += step) arr.push(i)
                if (arr[arr.length - 1] !== maxVal) arr.push(maxVal)
                return arr
              }

              // Thai month label
              function thaiLabel(key) {
                const [y, mo] = key.split('-')
                const thai = ['', 'ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
                return `${thai[parseInt(mo)]} ${(parseInt(y)+543).toString().slice(2)}`
              }

              const ticks = getTicks(max)
              const barAreaHeight = 152

              return (
                <div className="flex h-48">
                  {/* Y-axis */}
                  <div className="flex flex-col justify-between items-end text-[10px] font-medium text-gray-400 dark:text-gray-500 pb-7 shrink-0 pr-1 sm:pr-1.5 w-5 sm:w-6">
                    {[...ticks].reverse().map(t => (
                      <span key={t} className="leading-none -mb-px">{t}</span>
                    ))}
                  </div>

                  {/* Bars area with grid-line background */}
                  <div className="relative flex-1 min-w-0">
                    <div className="absolute inset-0 flex flex-col justify-between pb-7 pointer-events-none">
                      {[...ticks].reverse().map(t => (
                        <div key={t} className="border-t border-dashed border-gray-200 dark:border-gray-700/50 -mb-px" />
                      ))}
                    </div>

                    <div className="relative flex items-end gap-2 sm:gap-3 h-full">
                      {sorted.map(m => {
                        const barH = (m.count / max) * barAreaHeight
                        return (
                          <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                            <span className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400">{m.count}</span>
                            <div
                              className="w-full rounded-t-lg bg-gradient-to-t from-brand-600 to-brand-400 hover:from-brand-500 hover:to-brand-300 transition-all duration-300 min-h-[4px]"
                              style={{ height: Math.max(barH, 4) + 'px' }}
                              title={`${m.month}: ${m.count} การจอง`}
                            />
                            <span className="text-[9px] sm:text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                              {thaiLabel(m.month)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })()
          )}
        </div>
      </div>
    </div>
  )
}
