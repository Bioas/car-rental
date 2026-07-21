import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { statusLabel } from '../lib/constants'
import { Spinner } from '../components/ui/spinner'
import { BookingModal } from '../components/BookingModal'

export default function CarDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { authHeaders } = useApp()
  const [car, setCar] = useState(null)
  const [activeBookings, setActiveBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [bookingOpen, setBookingOpen] = useState(false)

  useEffect(() => {
    fetchCar()
  }, [id])

  function bookNow() {
    setBookingOpen(true)
  }

  async function fetchCar() {
    try {
      const res = await fetch(`/api/cars/${id}`, { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setCar(data.car)
        setActiveBookings(data.activeBookings || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <Spinner />
  if (!car) return <div className="text-center py-20 text-gray-400"><p>ไม่พบรถยนต์</p></div>

  return (
    <div className="animate-fade-in max-w-4xl">
      <button onClick={() => navigate(-1)} className="btn-ghost btn-sm mb-4">← กลับ</button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white font-heading">{car.brand} {car.model}</h2>
                <p className="text-gray-500 dark:text-gray-400">{car.license_plate}</p>
              </div>
              <span className={`badge-${car.status} text-sm px-3 py-1`}>{statusLabel(car.status)}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">สี</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{car.color || '-'}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">ปี</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{car.year || '-'}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">ที่นั่ง</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{car.seats}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">สถานะ</p>
                <p className={`text-sm font-medium ${car.status === 'available' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{statusLabel(car.status)}</p>
              </div>
            </div>

            {car.notes && <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">{car.notes}</p>}
          </div>

          <div className="card p-6">
            <h3 className="font-heading font-semibold text-gray-900 dark:text-white mb-4">การจองที่กำลังดำเนินการ</h3>
            {activeBookings.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-sm">ไม่มีการจองในขณะนี้</div>
            ) : (
              <div className="space-y-3">
                {activeBookings.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{b.user_name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{b.start_date} → {b.end_date}</p>
                    </div>
                    <span className={`badge-${b.status}`}>{b.status === 'pending' ? 'รออนุมัติ' : 'อนุมัติแล้ว'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-6">
            <h3 className="font-heading font-semibold text-gray-900 dark:text-white mb-4">ดำเนินการ</h3>
            <button onClick={bookNow} className="btn-primary w-full" disabled={car.status !== 'available'}>
              จองรถคันนี้
            </button>
            <Link to={`/calendar?car_id=${car.id}`} className="btn-ghost w-full mt-2 inline-flex items-center justify-center">
              ดูในปฏิทิน
            </Link>
          </div>
        </div>
      </div>

      <BookingModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        initialCarId={id}
      />
    </div>
  )
}
