import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { StatCard } from '../components/StatCard'
import { statusLabel, badgeClass } from '../lib/constants'
import { SkeletonStats, SkeletonPanel } from '../components/ui/skeleton'

function ScrollFade({ maxHeight, className, children }) {
  const ref = useRef(null)
  const [maskStyle, setMaskStyle] = useState('')

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function updateMask() {
      const { scrollTop, scrollHeight, clientHeight } = el
      if (scrollHeight <= clientHeight) {
        setMaskStyle('')
        return
      }
      const atTop = scrollTop <= 2
      const atBottom = scrollTop + clientHeight >= scrollHeight - 2
      if (atTop && atBottom) {
        setMaskStyle('')
      } else if (atTop) {
        setMaskStyle('linear-gradient(to bottom, black 88%, transparent 100%)')
      } else if (atBottom) {
        setMaskStyle('linear-gradient(to bottom, transparent 0%, black 12%)')
      } else {
        setMaskStyle('linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)')
      }
    }

    updateMask()
    el.addEventListener('scroll', updateMask)
    const ro = new ResizeObserver(updateMask)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', updateMask)
      ro.disconnect()
    }
  }, [])

  const style = { maxHeight, overflowY: 'auto' }
  if (maskStyle) {
    style.maskImage = maskStyle
    style.WebkitMaskImage = maskStyle
  }

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  )
}

export default function Dashboard() {
  const { isAdmin, authHeaders, fetchNotificationCount, refreshSignal } = useApp()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ totalCars: 0, availableCars: 0, pendingBookings: 0 })
  const [pendingList, setPendingList] = useState([])
  const [availableCarsList, setAvailableCarsList] = useState([])
  const [activeBookings, setActiveBookings] = useState(0)
  const [bookingsByCar, setBookingsByCar] = useState([])
  const [bookingsByMonth, setBookingsByMonth] = useState([])
  const [topUsers, setTopUsers] = useState([])
  const [maxCarCount, setMaxCarCount] = useState(1)
  const [leavingBookings, setLeavingBookings] = useState([])

  useEffect(() => {
    fetchData()
  }, [refreshSignal])

  async function fetchData() {
    try {
      const headers = authHeaders()
      const [carsRes, bookingsRes] = await Promise.all([
        fetch('/api/cars', { headers }),
        isAdmin ? fetch('/api/admin/bookings', { headers }) : fetch('/api/admin/bookings', { headers }),
      ])

      const today = new Date().toISOString().split('T')[0]
      if (bookingsRes.ok) {
        const bookingData = await bookingsRes.json()
        const all = bookingData.bookings || []
        const newList = all.filter(b => b.status === 'pending').slice(0, 6)
        setPendingList(prev => {
          const leaving = prev.filter(b => !newList.some(n => n.id === b.id))
          if (leaving.length > 0) {
            setLeavingBookings(leaving)
            setTimeout(() => setLeavingBookings([]), 300)
          }
          return newList
        })
        setActiveBookings(all.filter(b => b.status === 'approved' && b.start_date <= today && b.end_date >= today).length)
      }

      if (carsRes.ok) {
        const carsData = await carsRes.json()
        setAvailableCarsList(carsData.cars
          .filter(c => c.status === 'available' && !c.has_active_booking)
          .slice(0, 6)
        )
        setStats(prev => ({ ...prev, totalCars: carsData.cars.length, availableCars: carsData.cars.filter(c => c.status === 'available').length }))
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

        }
      }
    } catch (e) {
      console.error('Dashboard fetch error:', e)
    } finally {
      setLoading(false)
    }
  }

  async function approveBooking(id) {
    try {
      const res = await fetch(`/api/admin/bookings/${id}/approve`, { method: 'PUT', headers: authHeaders() })
      if (res.ok) { fetchData(); fetchNotificationCount() }
    } catch (e) { console.error(e) }
  }

  async function rejectBooking(id) {
    try {
      const res = await fetch(`/api/admin/bookings/${id}/reject`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_notes: '' })
      })
      if (res.ok) { fetchData(); fetchNotificationCount() }
    } catch (e) { console.error(e) }
  }

  function pctCount(count) { return maxCarCount > 0 ? (count / maxCarCount) * 100 : 0 }

  if (loading) {
    return (
      <div className="animate-fade-in flex flex-col flex-1 min-h-0 space-y-6">
        <SkeletonStats count={isAdmin ? 4 : 3} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <SkeletonPanel lines={3} />
          <SkeletonPanel lines={4} />
        </div>
        {isAdmin && <SkeletonPanel lines={3} />}
      </div>
    )
  }

  return (
    <div className="animate-fade-in flex flex-col flex-1 min-h-0 space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        <StatCard title="รถยนต์ทั้งหมด" value={stats.totalCars} color="brand">
          <i className="bx bx-car text-xl"></i>
        </StatCard>
        <StatCard title="พร้อมใช้งาน" value={stats.availableCars} color="emerald">
          <i className="bx bxs-check-circle text-xl"></i>
        </StatCard>
        <StatCard title="กำลังใช้งานวันนี้" value={activeBookings} color="amber">
          <i className="bx bx-calendar text-xl"></i>
        </StatCard>
        {isAdmin && (
          <StatCard title="รออนุมัติ" value={stats.pendingBookings} color="red">
            <i className="bx bx-time-five text-xl"></i>
          </StatCard>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="card p-6 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="font-heading font-semibold text-gray-900 dark:text-white">คำขอจอง</h3>
              {pendingList.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-500 text-white dark:bg-red-600">
                  {pendingList.length}
                </span>
              )}
            </div>
            <Link to="/app/bookings" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">ดูทั้งหมด</Link>
          </div>
          {pendingList.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <i className="bx bxs-check-circle text-3xl opacity-40 mb-2 block"></i>
              <p className="text-sm">ไม่มีคำขอรออนุมัติ</p>
            </div>
          ) : (
            <ScrollFade maxHeight="250px" className="space-y-3 scrollbar-none">
              {/* Leaving items — fade out */}
              {leavingBookings.map(b => (
                <div key={b.id} className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 transition-all duration-300 opacity-0 scale-95 pointer-events-none">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                        <i className="bx bx-user text-sm text-gray-600 dark:text-gray-400"></i>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{b.user_name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{b.user_email}</p>
                      </div>
                    </div>
                    <span className={badgeClass(b.status) + ' shrink-0 ml-2'}>{statusLabel(b.status)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
                    <i className="bx bx-car text-sm"></i>
                    <span>{b.brand} {b.model} · {b.license_plate}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 mb-3">
                    <i className="bx bx-calendar text-sm"></i>
                    <span>{b.start_date} → {b.end_date}</span>
                  </div>
                  <div className="flex gap-2 opacity-30">
                    <div className="flex-1 h-8 rounded-lg bg-gray-200 dark:bg-gray-700"></div>
                    <div className="flex-1 h-8 rounded-lg bg-gray-200 dark:bg-gray-700"></div>
                  </div>
                </div>
              ))}
              {/* Current items — fade in */}
              {pendingList.map((b, i) => (
                <div key={b.id} className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 motion-safe:animate-slide-up-fade" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                        <i className="bx bx-user text-sm text-gray-600 dark:text-gray-400"></i>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{b.user_name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{b.user_email}</p>
                      </div>
                    </div>
                    <span className={badgeClass(b.status) + ' shrink-0 ml-2'}>{statusLabel(b.status)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
                    <i className="bx bx-car text-sm"></i>
                    <span>{b.brand} {b.model} · {b.license_plate}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 mb-3">
                    <i className="bx bx-calendar text-sm"></i>
                    <span>{b.start_date} → {b.end_date}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => approveBooking(b.id)}
                      className="flex-1 h-8 inline-flex items-center justify-center gap-1 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors">
                      <i className="bx bx-check text-sm"></i> อนุมัติ
                    </button>
                    <button onClick={() => rejectBooking(b.id)}
                      className="flex-1 h-8 inline-flex items-center justify-center gap-1 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
                      <i className="bx bx-x text-sm"></i> ปฏิเสธ
                    </button>
                  </div>
                </div>
              ))}
            </ScrollFade>
          )}
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-semibold text-gray-900 dark:text-white">รถยนต์พร้อมใช้</h3>
            <Link to="/app/cars" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">ดูทั้งหมด</Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {availableCarsList.map((car, i) => (
              <div key={car.id} className={`flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 ${i >= 4 ? 'hidden sm:flex' : ''}`}>
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                  <i className="bx bx-car text-xl text-emerald-600 dark:text-emerald-400"></i>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{car.brand} {car.model}</p>
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
            {(() => {
              const now = new Date()
              const months = Array.from({ length: 3 }, (_, i) => {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                const found = bookingsByMonth.find(m => m.month === key)
                return {
                  month: key,
                  count: found ? found.count : 0
                }
              }).reverse()
              const max = Math.max(...months.map(m => m.count), 1)

              // Helper for Thai month label
              function thaiLabel(key) {
                const [y, mo] = key.split('-')
                const thai = ['', 'ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
                return `${thai[parseInt(mo)]} ${(parseInt(y)+543).toString().slice(2)}`
              }

              // Generate smart Y-axis ticks
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

              const ticks = getTicks(max)
              const barAreaHeight = 168

              return (
                <div className="flex h-52">
                  {/* Y-axis */}
                  <div className="flex flex-col justify-between items-end text-[10px] font-medium text-gray-400 dark:text-gray-500 pb-7 shrink-0 pr-1 sm:pr-1.5 w-5 sm:w-6">
                    {[...ticks].reverse().map(t => (
                      <span key={t} className="leading-none -mb-px">{t}</span>
                    ))}
                  </div>

                  {/* Bars area with grid-line background */}
                  <div className="relative flex-1 min-w-0">
                    {/* Grid lines (background) */}
                    <div className="absolute inset-0 flex flex-col justify-between pb-7 pointer-events-none">
                      {[...ticks].reverse().map(t => (
                        <div key={t} className="border-t border-dashed border-gray-200 dark:border-gray-700/50 -mb-px" />
                      ))}
                    </div>

                    {/* Bars (foreground) */}
                    <div className="relative flex items-end gap-2 sm:gap-3 h-full">
                      {months.map(m => {
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
            })()}
          </div>
        </>
      )}
    </div>
  )
}
