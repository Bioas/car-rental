import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { statusLabel } from '../lib/constants'
import { Spinner } from '../components/ui/spinner'
import { BookingModal } from '../components/BookingModal'

const StatusDot = ({ status }) => {
  const map = {
    available: 'bg-emerald-400',
    booked: 'bg-blue-400',
    maintenance: 'bg-amber-400',
    retired: 'bg-gray-300 dark:bg-gray-500',
  }
  return <span className={`inline-block w-2 h-2 rounded-full ${map[status] || 'bg-gray-300'} ring-2 ring-white dark:ring-card-dark`} />
}

export default function Cars() {
  const { authHeaders } = useApp()
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [bookingCarId, setBookingCarId] = useState(null)

  useEffect(() => {
    fetchCars()
  }, [filter, search])

  function displayStatus(car) {
    if (car.status === 'available' && car.has_active_booking) return 'booked'
    return car.status
  }

  const filteredCars = cars.filter(c => {
    if (filter === 'all') return true
    if (filter === 'available') return c.status === 'available' && !c.has_active_booking
    return c.status === filter
  }).filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.brand?.toLowerCase().includes(q) ||
      c.model?.toLowerCase().includes(q) ||
      c.license_plate?.toLowerCase().includes(q)
  })

  function openBooking(carId) {
    setBookingCarId(carId)
  }

  async function fetchCars() {
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') params.set('status', filter)
      if (search) params.set('q', search)
      const res = await fetch(`/api/cars?${params}`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setCars(data.cars)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const filters = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'available', label: 'พร้อมใช้' },
    { key: 'maintenance', label: 'ซ่อมบำรุง' },
    { key: 'retired', label: 'ปลดระวาง' },
  ]

  if (loading) return <Spinner />

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white font-heading tracking-tight">
            รถยนต์ทั้งหมด
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {filteredCars.length} คัน{filter !== 'all' ? ` · ${filters.find(f => f.key === filter)?.label}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:flex-initial">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              type="text"
              className="input pl-10 w-full sm:w-64"
              placeholder="ค้นหารถ..."
            />
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-8 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              filter === f.key
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Car grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-5">
        {filteredCars.map((car, i) => {
          const status = displayStatus(car)
          return (
            <div
              key={car.id}
              className="card overflow-hidden hover:shadow-md transition-all duration-300"
            >
              {/* Status accent strip */}
              <div className={`h-[3px] ${(() => { const m = { available: 'bg-emerald-400 dark:bg-emerald-500', booked: 'bg-blue-400 dark:bg-blue-500', maintenance: 'bg-amber-400 dark:bg-amber-500', retired: 'bg-gray-300 dark:bg-gray-600' }; return m[status] || 'bg-gray-300 dark:bg-gray-600' })()}`} />

              <div className="px-5 pt-5 pb-5">
                {/* Top row: brand + model + status */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-gray-900 dark:text-white font-heading leading-snug truncate">
                      {car.brand} {car.model}
                    </h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 font-mono tracking-wide">
                      {car.license_plate}
                    </p>
                  </div>
                  <span className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    <StatusDot status={status} />
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {statusLabel(status)}
                    </span>
                  </span>
                </div>

                {/* Detail pills */}
                <div className="flex flex-wrap items-center gap-2 mt-3 mb-1">
                  {car.color && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                      <span className="w-2.5 h-2.5 rounded-full border border-black/10" style={{ backgroundColor: car.color === 'ขาว' ? '#f8fafc' : car.color === 'ดำ' ? '#1e293b' : car.color === 'แดง' ? '#ef4444' : car.color === 'น้ำเงิน' ? '#3b82f6' : car.color === 'เงิน' ? '#cbd5e1' : car.color === 'เทา' ? '#6b7280' : car.color === 'เขียว' ? '#22c55e' : car.color === 'ทอง' ? '#eab308' : car.color === 'ส้ม' ? '#f97316' : '#94a3b8' }} />
                      {car.color}
                    </span>
                  )}
                  {car.year && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {car.year}
                    </span>
                  )}
                  {car.seats != null && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {car.seats} ที่นั่ง
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-neutral-100 dark:border-gray-700">
                  <Link
                    to={`/cars/${car.id}`}
                    className="flex-1 text-center text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    ดูรายละเอียด
                  </Link>
                  {status === 'available' && (
                    <button
                      onClick={() => openBooking(car.id)}
                      className="flex-1 btn-primary btn-sm"
                    >
                      จองเลย
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {/* Empty state */}
        {filteredCars.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-5">
              <svg className="w-10 h-10 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">ไม่พบรถยนต์</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm">
              {search ? 'ลองเปลี่ยนคำค้นหา หรือตรวจสอบตัวสะกดอีกครั้ง' : 'ยังไม่มีรถในหมวดหมู่นี้'}
            </p>
            {(search || filter !== 'all') && (
              <button
                onClick={() => { setSearch(''); setFilter('all') }}
                className="mt-4 text-sm text-brand-600 dark:text-brand-400 hover:underline font-medium"
              >
                ล้างตัวกรอง
              </button>
            )}
          </div>
        )}
      </div>

      <BookingModal
        open={!!bookingCarId}
        onClose={() => setBookingCarId(null)}
        initialCarId={bookingCarId}
      />
    </div>
  )
}
