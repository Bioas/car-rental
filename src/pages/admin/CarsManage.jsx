import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import { apiGet, invalidateApi } from '../../lib/apiCache'
import { statusLabel, badgeClass, CAR_TYPES } from '../../lib/constants'
import { Toast } from '../../components/ui/toast'
import { SkeletonHeader, SkeletonTable } from '../../components/ui/skeleton'
import { Select } from '../../components/ui/select'
import { StatTile, StatTileRow, SearchInput } from '../../components/ui/stat-tile'
import { useDialog, dialogProps } from '../../lib/useDialog'

// Summary tiles, each also a status filter.
const STATUS_TILES = [
  { key: 'all', label: 'รถทั้งหมด', icon: 'bx-car', tone: 'bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300', ring: 'ring-brand-400' },
  { key: 'available', label: 'พร้อมใช้', icon: 'bx-check-circle', tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300', ring: 'ring-emerald-400' },
  { key: 'maintenance', label: 'ซ่อมบำรุง', icon: 'bx-wrench', tone: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300', ring: 'ring-amber-400' },
  { key: 'retired', label: 'ปลดระวาง', icon: 'bx-archive', tone: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400', ring: 'ring-gray-400' },
]

function carInitials(car) {
  return `${car.brand?.charAt(0) || ''}${car.model?.charAt(0) || ''}` || '?'
}

export default function CarsManage() {
  const { authHeaders } = useApp()
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const [form, setForm] = useState({ license_plate: '', brand: '', model: '', type: '', color: '', year: '', seats: 5, status: 'available', notes: '' })
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const counts = useMemo(() => {
    const c = { all: cars.length }
    for (const car of cars) c[car.status] = (c[car.status] || 0) + 1
    return c
  }, [cars])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return cars.filter((car) => {
      if (statusFilter !== 'all' && car.status !== statusFilter) return false
      if (!q) return true
      return [car.license_plate, car.brand, car.model, car.type, car.color].some((v) => String(v || '').toLowerCase().includes(q))
    })
  }, [cars, query, statusFilter])

  function handleMenuClick(e, id) {
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setOpenMenuId(openMenuId === id ? null : id)
  }

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
      setForm({ license_plate: '', brand: '', model: '', type: '', color: '', year: '', seats: 5, status: 'available', notes: '' })
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
      invalidateApi()
      await fetchCars(true)
      setToast({ type: 'success', message: editing ? 'แก้ไขรถเรียบร้อย' : 'เพิ่มรถใหม่เรียบร้อย' })
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
        invalidateApi()
        await fetchCars(true)
        setToast({ type: 'success', message: 'ลบรถเรียบร้อย' })
      } else {
        const data = await res.json()
        alert(data.error)
      }
    } catch (e) {
      console.error(e)
    }
  }

  async function fetchCars(force = false) {
    try {
      const res = await apiGet('/api/admin/cars', { headers: authHeaders(), force })
      if (res.ok) {
        setCars(res.data.cars)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const modalRef = useRef(null)
  useDialog(showModal, () => setShowModal(false), modalRef)

  if (loading) {
    return (
      <div className="animate-fade-in flex flex-col flex-1 min-h-0">
        <SkeletonHeader />
        <SkeletonTable rows={6} />
      </div>
    )
  }

  return (
    <div className="animate-fade-in flex flex-col flex-1 min-h-0">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white font-heading">จัดการรถยนต์</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">เพิ่ม แก้ไข ลบข้อมูลยานพาหนะ</p>
        </div>
        <button onClick={() => openModal()} className="btn-primary shrink-0">
          <i aria-hidden="true" className="bx bx-plus text-base"></i>
          เพิ่มรถ
        </button>
      </div>

      <StatTileRow className="mb-4 sm:mb-5">
        {STATUS_TILES.map((t) => (
          <StatTile key={t.key} icon={t.icon} label={t.label} value={counts[t.key] || 0} tone={t.tone} ring={t.ring}
            active={statusFilter === t.key}
            onClick={() => setStatusFilter(statusFilter === t.key ? 'all' : t.key)} />
        ))}
      </StatTileRow>

      <div className={`card overflow-hidden flex flex-col min-h-0 ${visible.length === 0 ? 'flex-1' : ''}`}>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border-light/60 dark:border-border-dark/60">
          <SearchInput value={query} onChange={setQuery} placeholder="ค้นหาทะเบียน ยี่ห้อ รุ่น" className="flex-1 min-w-[200px] max-w-md" />
          <span className="text-xs text-gray-400 ml-auto">
            {visible.length === cars.length ? `ทั้งหมด ${cars.length} คัน` : `แสดง ${visible.length} จาก ${cars.length} คัน`}
          </span>
          {statusFilter !== 'all' && (
            <button onClick={() => setStatusFilter('all')} className="text-xs text-brand-600 dark:text-brand-400 hover:underline min-h-[36px] px-2 -mx-2">ล้างตัวกรอง</button>
          )}
        </div>

        {visible.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 py-16 text-gray-400 text-sm">
            <i aria-hidden="true" className="bx bx-car text-4xl opacity-50"></i>
            {cars.length === 0 ? 'ไม่มีรถยนต์ในระบบ' : 'ไม่พบรถที่ตรงกับการค้นหา'}
          </div>
        ) : (
          <>
            {/* Mobile list */}
            <div className="sm:hidden divide-y divide-border-light/40 dark:divide-border-dark/40">
              {visible.map(car => (
                <div key={car.id} className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/50 dark:to-brand-800/50 text-brand-700 dark:text-brand-300 text-sm font-bold flex items-center justify-center shrink-0">{carInitials(car)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-gray-900 dark:text-white">{car.license_plate}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{car.brand} {car.model}</div>
                    </div>
                    <span className={badgeClass(car.status) + ' shrink-0'}>{statusLabel(car.status)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                    {car.type && <span className="px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">{car.type}</span>}
                    <span className="px-2 py-0.5 rounded-md bg-gray-50 dark:bg-gray-700/50">{car.seats} ที่นั่ง</span>
                    {car.color && <span className="px-2 py-0.5 rounded-md bg-gray-50 dark:bg-gray-700/50">สี{car.color}</span>}
                    {car.year && <span className="px-2 py-0.5 rounded-md bg-gray-50 dark:bg-gray-700/50">ปี {car.year}</span>}
                  </div>
                  {car.notes && <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/30 rounded-lg px-3 py-2">{car.notes}</div>}
                  <div className="flex gap-2">
                    <button onClick={() => openModal(car)} className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-all">
                      <i aria-hidden="true" className="bx bx-edit text-sm"></i>แก้ไข
                    </button>
                    <button onClick={() => deleteCar(car.id)} className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all">
                      <i aria-hidden="true" className="bx bx-trash text-sm"></i>ลบ
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-light/50 dark:border-border-dark/50 bg-gray-50/80 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">รถยนต์</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">ประเภท</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">รายละเอียด</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">สถานะ</th>
                    <th className="w-14 px-4 py-3"><span className="sr-only">จัดการ</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light/40 dark:divide-border-dark/40">
                  {visible.map(car => (
                    <tr key={car.id} onDoubleClick={() => openModal(car)} className="group hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/50 dark:to-brand-800/50 text-brand-700 dark:text-brand-300 text-sm font-bold flex items-center justify-center shrink-0">{carInitials(car)}</div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">{car.license_plate}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{car.brand} {car.model}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {car.type
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">{car.type}</span>
                          : <span className="text-sm text-gray-400">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                          <span className="inline-flex items-center gap-1"><i aria-hidden="true" className="bx bx-user text-sm"></i>{car.seats} ที่นั่ง</span>
                          {car.color && <span className="inline-flex items-center gap-1"><i aria-hidden="true" className="bx bx-palette text-sm"></i>{car.color}</span>}
                          {car.year && <span className="inline-flex items-center gap-1"><i aria-hidden="true" className="bx bx-calendar text-sm"></i>{car.year}</span>}
                        </div>
                        {car.notes && <div className="text-[11px] text-gray-400 mt-0.5 truncate max-w-xs" title={car.notes}>{car.notes}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={badgeClass(car.status)}>{statusLabel(car.status)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={(e) => handleMenuClick(e, car.id)} aria-label={`จัดการ ${car.license_plate}`}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 transition-colors">
                          <i aria-hidden="true" className="bx bx-dots-vertical-rounded text-xl"></i>
                        </button>
                        {openMenuId === car.id && (
                          <div style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
                            className="w-36 card p-1 shadow-xl border border-border-light dark:border-border-dark z-50 animate-scale-in text-left">
                            <button onClick={() => { setOpenMenuId(null); openModal(car); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
                              <i aria-hidden="true" className="bx bx-edit text-base"></i> แก้ไข
                            </button>
                            <button onClick={() => { setOpenMenuId(null); deleteCar(car.id); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                              <i aria-hidden="true" className="bx bx-trash text-base"></i> ลบ
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          <div ref={modalRef} {...dialogProps('ข้อมูลรถยนต์')} className="card p-6 w-full max-w-lg relative animate-scale-in max-h-[70vh] overflow-y-auto scrollbar-none sm:max-h-none sm:overflow-visible" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-border-light dark:border-border-dark">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0 ${
                  editing
                    ? 'bg-gradient-to-br from-amber-400 to-orange-500'
                    : 'bg-gradient-to-br from-emerald-400 to-emerald-600'
                }`}>
                  {editing
                    ? <i aria-hidden="true" className="bx bx-edit text-xl"></i>
                    : <i aria-hidden="true" className="bx bx-car text-xl"></i>
                  }
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-base text-gray-900 dark:text-white">
                    {editing ? 'แก้ไขรถยนต์' : 'เพิ่มรถยนต์ใหม่'}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {editing ? `แก้ไขข้อมูล ${form.license_plate || [form.brand, form.model].filter(Boolean).join(' ') || '...'}` : 'กรอกข้อมูลยานพาหนะใหม่'}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} aria-label="ปิด"
                className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-gray-700 text-neutral-400 transition-colors">
                <i aria-hidden="true" className="bx bx-x text-xl"></i>
              </button>
            </div>

            <form onSubmit={saveCar} className="space-y-4">
              {/* License Plate */}
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">ทะเบียนรถ *</label>
                <div className="relative">
                  <i aria-hidden="true" className="bx bx-id-card absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                  <input value={form.license_plate} onChange={e => updateForm('license_plate', e.target.value)}
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all" required placeholder="กข 1234" />
                </div>
              </div>

              {/* Brand + Model */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">ยี่ห้อ *</label>
                  <div className="relative">
                    <i aria-hidden="true" className="bx bx-car absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                    <input value={form.brand} onChange={e => updateForm('brand', e.target.value)}
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all" required placeholder="Toyota" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">รุ่น *</label>
                  <input value={form.model} onChange={e => updateForm('model', e.target.value)}
                    className="w-full h-11 px-4 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all" required placeholder="Camry" />
                </div>
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">ประเภทรถ</label>
                <Select value={form.type} onChange={v => updateForm('type', v)}
                  icon="bx-category" placeholder="— เลือกประเภทรถ —"
                  options={CAR_TYPES.map(t => ({ value: t, label: t }))} />
              </div>

              {/* Color + Year + Seats */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">สี</label>
                  <div className="relative">
                    <i aria-hidden="true" className="bx bx-palette absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                    <input value={form.color} onChange={e => updateForm('color', e.target.value)}
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all" placeholder="ขาว" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">ปี</label>
                  <div className="relative">
                    <i aria-hidden="true" className="bx bx-calendar absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                    <input value={form.year} onChange={e => updateForm('year', e.target.value)} type="number"
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all" placeholder="2024" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">ที่นั่ง</label>
                  <div className="relative">
                    <i aria-hidden="true" className="bx bx-user absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                    <input value={form.seats} onChange={e => updateForm('seats', e.target.value)} type="number"
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all" placeholder="5" />
                  </div>
                </div>
              </div>

              {/* Status - segmented control */}
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">สถานะ</label>
                <div className="flex gap-2 h-11">
                  {[
                    { value: 'available', label: 'พร้อมใช้', icon: 'bx-check-circle', activeClass: 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-300' },
                    { value: 'maintenance', label: 'ซ่อมบำรุง', icon: 'bx-wrench', activeClass: 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-300' },
                    { value: 'retired', label: 'ปลดระวาง', icon: 'bx-archive', activeClass: 'border-gray-400 bg-gray-100 text-gray-600 dark:border-gray-500 dark:bg-gray-700 dark:text-gray-300' },
                  ].map(s => (
                    <button key={s.value} type="button" onClick={() => updateForm('status', s.value)}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                        form.status === s.value
                          ? s.activeClass
                          : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}>
                      <i aria-hidden="true" className={`bx ${s.icon} text-base`}></i>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">หมายเหตุ</label>
                <textarea value={form.notes} onChange={e => updateForm('notes', e.target.value)}
                  className="w-full h-20 px-4 py-3 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all resize-none"
                  placeholder="รายละเอียดเพิ่มเติม..." />
              </div>

              {/* Error */}
              {error && (
                <div key={error} className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2 animate-shake">
                  <i aria-hidden="true" className="bx bx-error-circle text-base shrink-0"></i>
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 h-11 inline-flex items-center justify-center gap-2 px-5 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 active:from-brand-600 active:to-brand-700 shadow-md shadow-brand-200/50 hover:shadow-lg hover:shadow-brand-300/40 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  {saving && <i aria-hidden="true" className="bx bx-loader-alt text-base animate-spin"></i>}
                  <span>{saving ? 'กำลังบันทึก...' : editing ? 'บันทึกการเปลี่ยนแปลง' : 'เพิ่มรถ'}</span>
                </button>
                <button type="button" onClick={() => setShowModal(false)}
                  className="h-11 px-5 inline-flex items-center justify-center rounded-xl text-sm font-medium text-neutral-600 dark:text-gray-200 bg-neutral-100 dark:bg-gray-700 hover:bg-neutral-200 dark:hover:bg-gray-600 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-neutral-300">
                  ยกเลิก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
