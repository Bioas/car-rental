import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { statusLabel } from '../../lib/constants'

export default function CarsManage() {
  const { authHeaders } = useApp()
  const [cars, setCars] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ license_plate: '', brand: '', model: '', color: '', year: '', seats: 5, status: 'available', notes: '' })

  useEffect(() => {
    fetchCars()
  }, [])

  function openModal(car) {
    setError('')
    if (car) {
      setEditing(car)
      setForm({ ...car, year: car.year || '' })
    } else {
      setEditing(null)
      setForm({ license_plate: '', brand: '', model: '', color: '', year: '', seats: 5, status: 'available', notes: '' })
    }
    setShowModal(true)
  }

  function updateForm(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function saveCar(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const isEdit = !!editing
      const url = isEdit ? `/api/admin/cars/${editing.id}` : '/api/admin/cars'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error)
        return
      }
      setShowModal(false)
      await fetchCars()
    } catch {
      setError('เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  async function deleteCar(id) {
    if (!confirm('ลบรถคันนี้?')) return
    try {
      const res = await fetch(`/api/admin/cars/${id}`, { method: 'DELETE', headers: authHeaders() })
      if (res.ok) {
        await fetchCars()
      } else {
        const data = await res.json()
        alert(data.error)
      }
    } catch (e) {
      console.error(e)
    }
  }

  async function fetchCars() {
    try {
      const res = await fetch('/api/admin/cars', { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setCars(data.cars)
      }
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white font-heading">จัดการรถยนต์</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">เพิ่ม แก้ไข ลบข้อมูลยานพาหนะ</p>
        </div>
        <button onClick={() => openModal()} className="btn-primary self-start sm:self-auto">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
          เพิ่มรถ
        </button>
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {cars.length === 0 ? (
          <div className="card py-12 text-center text-gray-400 text-sm">ไม่มีรถยนต์ในระบบ</div>
        ) : (
          cars.map(car => (
            <div key={car.id} className="bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700/50 p-4 space-y-3 shadow-sm">
              {/* Header: Plate + Status */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-mono text-sm font-bold text-gray-900 dark:text-white">{car.license_plate}</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300 block mt-0.5">{car.brand} {car.model}</span>
                </div>
                <span className={`badge-${car.status} shrink-0`}>{statusLabel(car.status)}</span>
              </div>

              {/* Details */}
              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                {car.color && (
                  <div className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    {car.color}
                  </div>
                )}
                {car.year && (
                  <div className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    {car.year}
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  {car.seats} ที่นั่ง
                </div>
              </div>

              {car.notes && (
                <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/30 rounded-lg px-3 py-2">
                  {car.notes}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button onClick={() => openModal(car)} className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-all">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  แก้ไข
                </button>
                <button onClick={() => deleteCar(car.id)} className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  ลบ
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-light/50 dark:border-border-dark/50 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">ทะเบียน</th>
                <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">ยี่ห้อ/รุ่น</th>
                <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">สี</th>
                <th className="text-center p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">ปี</th>
                <th className="text-center p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">ที่นั่ง</th>
                <th className="text-center p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">สถานะ</th>
                <th className="text-right p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light/40 dark:divide-border-dark/40">
              {cars.map(car => (
                <tr key={car.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="p-3 sm:p-4">
                    <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">{car.license_plate}</span>
                  </td>
                  <td className="p-3 sm:p-4">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{car.brand} {car.model}</span>
                  </td>
                  <td className="p-3 sm:p-4 text-sm text-gray-500 dark:text-gray-400">{car.color || '-'}</td>
                  <td className="p-3 sm:p-4 text-sm text-gray-500 dark:text-gray-400 text-center">{car.year || '-'}</td>
                  <td className="p-3 sm:p-4 text-sm text-gray-500 dark:text-gray-400 text-center">{car.seats}</td>
                  <td className="p-3 sm:p-4 text-center">
                    <span className={`badge-${car.status}`}>{statusLabel(car.status)}</span>
                  </td>
                  <td className="p-3 sm:p-4 text-right">
                    <button onClick={() => openModal(car)} className="btn-ghost btn-sm">แก้ไข</button>
                    <button onClick={() => deleteCar(car.id)} className="btn-ghost btn-sm text-red-500 hover:text-red-700">ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="card p-6 w-full max-w-lg relative animate-scale-in" onClick={e => e.stopPropagation()}>
            <h3 className="font-heading font-semibold text-lg text-gray-900 dark:text-white mb-4">
              {editing ? 'แก้ไขรถยนต์' : 'เพิ่มรถยนต์ใหม่'}
            </h3>

            <form onSubmit={saveCar} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">ทะเบียนรถ *</label>
                  <input value={form.license_plate} onChange={e => updateForm('license_plate', e.target.value)} className="input" placeholder="กข 1234" required />
                </div>
                <div>
                  <label className="label">สถานะ</label>
                  <select value={form.status} onChange={e => updateForm('status', e.target.value)} className="input">
                    <option value="available">พร้อมใช้</option>
                    <option value="maintenance">ซ่อมบำรุง</option>
                    <option value="retired">ปลดระวาง</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">ยี่ห้อ *</label>
                  <input value={form.brand} onChange={e => updateForm('brand', e.target.value)} className="input" placeholder="Toyota" required />
                </div>
                <div>
                  <label className="label">รุ่น *</label>
                  <input value={form.model} onChange={e => updateForm('model', e.target.value)} className="input" placeholder="Camry" required />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label">สี</label>
                  <input value={form.color} onChange={e => updateForm('color', e.target.value)} className="input" placeholder="ขาว" />
                </div>
                <div>
                  <label className="label">ปี</label>
                  <input value={form.year} onChange={e => updateForm('year', e.target.value)} type="number" className="input" placeholder="2024" />
                </div>
                <div>
                  <label className="label">ที่นั่ง</label>
                  <input value={form.seats} onChange={e => updateForm('seats', e.target.value)} type="number" className="input" placeholder="5" />
                </div>
              </div>

              <div>
                <label className="label">หมายเหตุ</label>
                <textarea value={form.notes} onChange={e => updateForm('notes', e.target.value)} className="input min-h-[60px]" placeholder="รายละเอียดเพิ่มเติม..." />
              </div>

              {error && <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">{error}</div>}

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="btn-primary flex-1">{editing ? 'บันทึก' : 'เพิ่มรถ'}</button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">ยกเลิก</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
