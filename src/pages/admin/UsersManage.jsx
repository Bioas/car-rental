import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { apiGet, invalidateApi } from '../../lib/apiCache'
import { roleLabel, badgeClass } from '../../lib/constants'
import { Pager } from '../../components/ui/pager'
import { SkeletonHeader, SkeletonTable } from '../../components/ui/skeleton'

const PAGE_SIZE = 20

export default function UsersManage() {
  const { authHeaders } = useApp()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', position: '', id_card: '', role: 'user' })
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })

  function handleMenuClick(e, id) {
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setOpenMenuId(openMenuId === id ? null : id)
  }

  useEffect(() => {
    fetchUsers()
  }, [page])

  function openModal(user) {
    setError('')
    setPasswordConfirm('')
    if (user) {
      setEditing(user)
      setForm({ name: user.name, email: user.email, password: '', phone: user.phone || '', position: user.position || '', id_card: user.id_card || '', role: user.role })
    } else {
      setEditing(null)
      setForm({ name: '', email: '', password: '', phone: '', position: '', id_card: '', role: 'user' })
    }
    setShowModal(true)
  }

  function updateForm(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function saveUser(e) {
    e.preventDefault()
    setError('')
    if (form.role === 'admin' && form.password !== passwordConfirm) {
      setError('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน')
      setSaving(false)
      return
    }
    setSaving(true)
    try {
      const isEdit = !!editing
      const url = isEdit ? `/api/admin/users/${editing.id}` : '/api/admin/users'
      const method = isEdit ? 'PUT' : 'POST'

      const body = { ...form }
      if (isEdit && !body.password) delete body.password

      const res = await fetch(url, {
        method,
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setShowModal(false)
      invalidateApi()
      // A new user lands at the top of page 1; jump there so it is visible.
      if (!isEdit && page !== 1) setPage(1)
      else await fetchUsers(true)
    } catch {
      setError('เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  async function deleteUser(id) {
    if (!confirm('ลบผู้ใช้นี้?')) return
    try {
      await fetch(`/api/admin/users/${id}`, { method: 'DELETE', headers: authHeaders() })
      invalidateApi()
      await fetchUsers(true)
    } catch (e) { console.error(e) }
  }

  async function fetchUsers(force = false) {
    try {
      const res = await apiGet(`/api/admin/users?page=${page}&limit=${PAGE_SIZE}`, { headers: authHeaders(), force })
      if (res.ok) {
        const data = res.data
        const rows = data.users || []
        setUsers(rows)
        setPages(data.pages || 1)
        setTotal(data.total || 0)
        // Deleting the last row of a page can leave it empty — step back.
        if (rows.length === 0 && page > 1) setPage(p => Math.max(p - 1, 1))
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

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
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white font-heading">จัดการผู้ใช้</h2>
          <button onClick={() => openModal()} className="btn-primary shrink-0">
            <i className="bx bx-user-plus text-base"></i>
            เพิ่มผู้ใช้
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">เพิ่ม แก้ไข ลบผู้ใช้งานระบบ</p>
      </div>

      {/* Mobile Card View */}
      <div className={`sm:hidden flex flex-col min-h-0 ${users.length === 0 ? 'flex-1' : ''}`}>
        <div className={`card p-4 divide-y divide-gray-200 dark:divide-gray-600 flex flex-col min-h-0 ${users.length === 0 ? 'flex-1' : ''}`}>
        {users.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">ไม่มีผู้ใช้ในระบบ</div>
        ) : (
          users.map(u => (
            <div key={u.id} className="bg-white dark:bg-card-dark py-3 first:pt-0 space-y-3">
              {/* Header: Name + Role */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm">
                    {u.name ? u.name.charAt(0).toUpperCase() : '?'}
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white truncate block">{u.name}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate block">{u.email}</span>
                  </div>
                </div>
                <span className={badgeClass(u.role === 'admin' ? 'approved' : u.role === 'driver' ? 'returned' : 'pending') + ' shrink-0'}>
                  {roleLabel(u.role)}
                </span>
              </div>

              {/* Details */}
              <div className="bg-gray-50 dark:bg-gray-800/30 rounded-xl p-3 space-y-2">
                {(u.phone || u.id_card || u.position) && (
                  <>
                    {u.position && (
                      <div className="flex items-center gap-2 text-xs">
                        <i className="bx bx-briefcase text-sm text-gray-400 shrink-0"></i>
                        <span className="text-gray-600 dark:text-gray-400">{u.position}</span>
                      </div>
                    )}
                    {u.phone && (
                      <div className="flex items-center gap-2 text-xs">
                        <i className="bx bx-phone text-sm text-gray-400 shrink-0"></i>
                        <span className="text-gray-600 dark:text-gray-400">{u.phone}</span>
                      </div>
                    )}
                    {u.id_card && (
                      <div className="flex items-center gap-2 text-xs">
                        <i className="bx bx-id-card text-sm text-gray-400 shrink-0"></i>
                        <span className="text-gray-600 dark:text-gray-400 font-mono">{u.id_card}</span>
                      </div>
                    )}
                  </>
                )}
                {!u.phone && !u.id_card && !u.position && (
                  <span className="text-xs text-gray-400">ไม่มีข้อมูลเพิ่มเติม</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button onClick={() => openModal(u)} className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-all">
                  <i className="bx bx-edit text-sm"></i>
                  แก้ไข
                </button>
                <button onClick={() => deleteUser(u.id)} className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all">
                  <i className="bx bx-trash text-sm"></i>
                  ลบ
                </button>
              </div>
            </div>
          ))
        )}
        </div>
      </div>

      {/* Desktop Table View */}
      <div className={`hidden sm:flex card overflow-hidden flex-col min-h-0 ${users.length === 0 ? 'flex-1' : ''}`}>
        {users.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">ไม่มีผู้ใช้ในระบบ</div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-light/50 dark:border-border-dark/50 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">ชื่อ</th>
                <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">อีเมล</th>
                <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">ตำแหน่ง</th>
                <th className="text-center p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">เบอร์</th>
                <th className="text-center p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">เลขบัตร ปชช</th>
                <th className="text-center p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">สิทธิ์</th>
                <th className="text-center p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light/40 dark:divide-border-dark/40">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="p-3 sm:p-4">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{u.name}</span>
                  </td>
                  <td className="p-3 sm:p-4 text-sm text-gray-500 dark:text-gray-400">{u.email}</td>
                  <td className="p-3 sm:p-4 text-sm text-gray-600 dark:text-gray-300">{u.position || '-'}</td>
                  <td className="p-3 sm:p-4 text-sm text-gray-500 dark:text-gray-400 text-center">{u.phone || '-'}</td>
                  <td className="p-3 sm:p-4 text-sm text-gray-500 dark:text-gray-400 font-mono text-center">{u.id_card || '-'}</td>
                  <td className="p-3 sm:p-4 text-center">
                    <span className={badgeClass(u.role === 'admin' ? 'approved' : u.role === 'driver' ? 'returned' : 'pending')}>
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td className="p-3 sm:p-4 text-center">
                    <button onClick={(e) => handleMenuClick(e, u.id)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 transition-colors">
                      <i className="bx bx-dots-vertical-rounded text-xl"></i>
                    </button>
                    {openMenuId === u.id && (
                      <div style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
                        className="w-36 card p-1 shadow-xl border border-border-light dark:border-border-dark z-50 animate-scale-in">
                        <button onClick={() => { setOpenMenuId(null); openModal(u); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
                          <i className="bx bx-edit text-base"></i> แก้ไข
                        </button>
                        <button onClick={() => { setOpenMenuId(null); deleteUser(u.id); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                          <i className="bx bx-trash text-base"></i> ลบ
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      <Pager page={page} pages={pages} total={total} limit={PAGE_SIZE} onChange={setPage} />

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="card p-6 w-full max-w-lg relative animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-border-light dark:border-border-dark">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0 ${
                  editing
                    ? 'bg-gradient-to-br from-amber-400 to-orange-500'
                    : 'bg-gradient-to-br from-brand-500 to-brand-600'
                }`}>
                  {editing
                    ? <i className="bx bx-edit text-xl"></i>
                    : <i className="bx bx-user-plus text-xl"></i>
                  }
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-base text-gray-900 dark:text-white">
                    {editing ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'}
                  </h3>
                  <p className="text-xs text-neutral-500">{editing ? 'แก้ไขข้อมูลผู้ใช้ในระบบ' : 'กรอกข้อมูลสำหรับผู้ใช้ใหม่'}</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-gray-700 text-neutral-400 transition-colors">
                <i className="bx bx-x text-xl"></i>
              </button>
            </div>

            <form onSubmit={saveUser} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">ชื่อผู้ใช้</label>
                <div className="relative">
                  <i className="bx bx-user absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                  <input value={form.name} onChange={e => updateForm('name', e.target.value)}
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all" required placeholder="ชื่อ-นามสกุล" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">อีเมล</label>
                  <div className="relative">
                    <i className="bx bx-envelope absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                    <input value={form.email} onChange={e => updateForm('email', e.target.value)} type="email"
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all" required placeholder="user@example.com" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">เบอร์โทร</label>
                  <div className="relative">
                    <i className="bx bx-phone absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                    <input value={form.phone} onChange={e => updateForm('phone', e.target.value)} type="tel"
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all" placeholder="เบอร์โทร" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">เลขบัตรประชาชน</label>
                  <div className="relative">
                    <i className="bx bx-id-card absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                    <input value={form.id_card} onChange={e => updateForm('id_card', e.target.value)}
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all" placeholder="เลขบัตรประชาชน 13 หลัก" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">ตำแหน่ง</label>
                  <div className="relative">
                    <i className="bx bx-briefcase absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                    <input value={form.position} onChange={e => updateForm('position', e.target.value)}
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all" placeholder="เช่น ครู, เจ้าหน้าที่" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">สิทธิ์</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button type="button" onClick={() => updateForm('role', 'user')}
                    className={`h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                      form.role === 'user'
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}>
                    <i className="bx bx-user text-base"></i>
                    ผู้ใช้
                  </button>
                  <button type="button" onClick={() => updateForm('role', 'admin')}
                    className={`h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                      form.role === 'admin'
                        ? 'border-purple-400 bg-purple-50 text-purple-700 dark:border-purple-500 dark:bg-purple-900/30 dark:text-purple-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}>
                    <i className="bx bxs-check-shield text-base"></i>
                    ผู้ดูแล
                  </button>
                  <button type="button" onClick={() => updateForm('role', 'driver')}
                    className={`h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                      form.role === 'driver'
                        ? 'border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-900/30 dark:text-sky-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}>
                    <i className="bx bx-car text-base"></i>
                    พนักงานขับรถ
                  </button>
                </div>
                {form.role === 'driver' && (
                  <p className="mt-2 text-xs text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                    <i className="bx bx-info-circle text-sm"></i>
                    พนักงานขับรถไม่ต้องใช้รหัสผ่าน และไม่สามารถเข้าสู่ระบบได้
                  </p>
                )}
              </div>

              <div className={`grid transition-[grid-template-rows] motion-safe:duration-300 ${form.role === 'admin' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden min-h-0">
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800/50">
                    <div className="mb-3">
                      <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">รหัสผ่านผู้ดูแล {editing && <span className="font-normal text-amber-600 dark:text-amber-400">(เว้นว่างไว้ไม่เปลี่ยน)</span>}</span>
                    </div>
                    <div className="space-y-3">
                      <div className="relative max-w-sm">
                        <label className="block text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">รหัสผ่าน</label>
                        <div className="relative">
                          <i className="bx bx-key absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-amber-400"></i>
                          <input value={form.password} onChange={e => updateForm('password', e.target.value)} type="password"
                            className="w-full h-11 pl-10 pr-4 rounded-xl border-2 border-amber-200 dark:border-amber-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-900/50 transition-all" required={form.role === 'admin' && !editing} placeholder="รหัสผ่าน" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">ยืนยันรหัสผ่าน</label>
                        <div className="flex items-center gap-2">
                          <div className="relative max-w-sm flex-1">
                            <i className="bx bx-key absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-amber-400"></i>
                            <input value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} type="password"
                              className={`w-full h-11 pl-10 pr-4 rounded-xl border-2 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all ${
                                !passwordConfirm
                                  ? 'border-amber-200 dark:border-amber-700 focus:border-amber-400 focus:ring-amber-100 dark:focus:ring-amber-900/50'
                                  : passwordConfirm === form.password
                                    ? 'border-emerald-400 dark:border-emerald-500 focus:border-emerald-400 focus:ring-emerald-100 dark:focus:ring-emerald-900/50'
                                    : 'border-red-400 dark:border-red-500 focus:border-red-400 focus:ring-red-100 dark:focus:ring-red-900/50'
                              }`} required={form.role === 'admin' && !editing} placeholder="ยืนยันรหัสผ่าน" />
                          </div>
                          {passwordConfirm && (
                            <span className="shrink-0">
                              {passwordConfirm === form.password ? (
                                <i className="bx bxs-check-circle text-xl text-emerald-500"></i>
                              ) : (
                                <i className="bx bxs-x-circle text-xl text-red-500"></i>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <i className="bx bx-error-circle text-base shrink-0"></i>
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 h-11 inline-flex items-center justify-center gap-2 px-5 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 active:from-brand-600 active:to-brand-700 shadow-md shadow-brand-200/50 hover:shadow-lg hover:shadow-brand-300/40 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  {saving && (
                    <i className="bx bx-loader-alt text-base animate-spin"></i>
                  )}
                  <span>{editing ? 'บันทึกการเปลี่ยนแปลง' : 'เพิ่มผู้ใช้'}</span>
                </button>
                <button type="button" onClick={() => setShowModal(false)}
                  className="h-11 px-5 inline-flex items-center justify-center rounded-xl text-sm font-medium text-neutral-600 dark:text-gray-400 bg-neutral-100 dark:bg-gray-700 hover:bg-neutral-200 dark:hover:bg-gray-600 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-neutral-300">
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
