import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'

export default function UsersManage() {
  const { authHeaders } = useApp()
  const [users, setUsers] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', id_card: '', role: 'user' })

  useEffect(() => {
    fetchUsers()
  }, [])

  function openModal(user) {
    setError('')
    setPasswordConfirm('')
    if (user) {
      setEditing(user)
      setForm({ name: user.name, email: user.email, password: '', phone: user.phone || '', id_card: user.id_card || '', role: user.role })
    } else {
      setEditing(null)
      setForm({ name: '', email: '', password: '', phone: '', id_card: '', role: 'user' })
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
      await fetchUsers()
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
      await fetchUsers()
    } catch (e) { console.error(e) }
  }

  async function fetchUsers() {
    try {
      const res = await fetch('/api/admin/users', { headers: authHeaders() })
      if (res.ok) { const data = await res.json(); setUsers(data.users) }
    } catch (e) { console.error(e) }
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white font-heading">จัดการผู้ใช้</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">เพิ่ม แก้ไข ลบผู้ใช้งานระบบ</p>
        </div>
        <button onClick={() => openModal()} className="btn-primary self-start sm:self-auto">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
          เพิ่มผู้ใช้
        </button>
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {users.length === 0 ? (
          <div className="card py-12 text-center text-gray-400 text-sm">ไม่มีผู้ใช้ในระบบ</div>
        ) : (
          users.map(u => (
            <div key={u.id} className="bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700/50 p-4 space-y-3 shadow-sm">
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
                <span className={u.role === 'admin' ? 'badge-approved shrink-0' : 'badge-pending shrink-0'}>
                  {u.role === 'admin' ? 'ผู้ดูแล' : 'ผู้ใช้'}
                </span>
              </div>

              {/* Details */}
              <div className="bg-gray-50 dark:bg-gray-800/30 rounded-xl p-3 space-y-2">
                {(u.phone || u.id_card) && (
                  <>
                    {u.phone && (
                      <div className="flex items-center gap-2 text-xs">
                        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
                        <span className="text-gray-600 dark:text-gray-400">{u.phone}</span>
                      </div>
                    )}
                    {u.id_card && (
                      <div className="flex items-center gap-2 text-xs">
                        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" /></svg>
                        <span className="text-gray-600 dark:text-gray-400 font-mono">{u.id_card}</span>
                      </div>
                    )}
                  </>
                )}
                {!u.phone && !u.id_card && (
                  <span className="text-xs text-gray-400">ไม่มีข้อมูลเพิ่มเติม</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button onClick={() => openModal(u)} className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-all">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  แก้ไข
                </button>
                <button onClick={() => deleteUser(u.id)} className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all">
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
                <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">ชื่อ</th>
                <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">อีเมล</th>
                <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">เบอร์</th>
                <th className="text-left p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">เลขบัตร ปชช</th>
                <th className="text-center p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">สิทธิ์</th>
                <th className="text-right p-3 sm:p-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light/40 dark:divide-border-dark/40">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="p-3 sm:p-4">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{u.name}</span>
                  </td>
                  <td className="p-3 sm:p-4 text-sm text-gray-500 dark:text-gray-400">{u.email}</td>
                  <td className="p-3 sm:p-4 text-sm text-gray-500 dark:text-gray-400">{u.phone || '-'}</td>
                  <td className="p-3 sm:p-4 text-sm text-gray-500 dark:text-gray-400 font-mono">{u.id_card || '-'}</td>
                  <td className="p-3 sm:p-4 text-center">
                    <span className={u.role === 'admin' ? 'badge-approved' : 'badge-pending'}>
                      {u.role === 'admin' ? 'ผู้ดูแล' : 'ผู้ใช้'}
                    </span>
                  </td>
                  <td className="p-3 sm:p-4 text-right">
                    <button onClick={() => openModal(u)} className="btn-ghost btn-sm">แก้ไข</button>
                    <button onClick={() => deleteUser(u.id)} className="btn-ghost btn-sm text-red-500 hover:text-red-700">ลบ</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
                    ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                    : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" /></svg>
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
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={saveUser} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">ชื่อผู้ใช้</label>
                <div className="relative">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                  <input value={form.name} onChange={e => updateForm('name', e.target.value)}
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all" required placeholder="ชื่อ-นามสกุล" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">อีเมล</label>
                  <div className="relative">
                    <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                    <input value={form.email} onChange={e => updateForm('email', e.target.value)} type="email"
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all" required placeholder="user@example.com" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">เบอร์โทร</label>
                  <div className="relative">
                    <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
                    <input value={form.phone} onChange={e => updateForm('phone', e.target.value)} type="tel"
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all" placeholder="เบอร์โทร" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">เลขบัตรประชาชน</label>
                  <div className="relative">
                    <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" /></svg>
                    <input value={form.id_card} onChange={e => updateForm('id_card', e.target.value)}
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all" placeholder="เลขบัตรประชาชน 13 หลัก" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">สิทธิ์</label>
                  <div className="flex gap-2 h-11">
                    <button type="button" onClick={() => updateForm('role', 'user')}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                        form.role === 'user'
                          ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                      ผู้ใช้
                    </button>
                    <button type="button" onClick={() => updateForm('role', 'admin')}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                        form.role === 'admin'
                          ? 'border-purple-400 bg-purple-50 text-purple-700 dark:border-purple-500 dark:bg-purple-900/30 dark:text-purple-300'
                          : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
                      ผู้ดูแล
                    </button>
                  </div>
                </div>
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
                          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg>
                          <input value={form.password} onChange={e => updateForm('password', e.target.value)} type="password"
                            className="w-full h-11 pl-10 pr-4 rounded-xl border-2 border-amber-200 dark:border-amber-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-900/50 transition-all" required={form.role === 'admin' && !editing} placeholder="รหัสผ่าน" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">ยืนยันรหัสผ่าน</label>
                        <div className="flex items-center gap-2">
                          <div className="relative max-w-sm flex-1">
                            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg>
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
                                <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                              ) : (
                                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
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
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 h-11 inline-flex items-center justify-center gap-2 px-5 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 active:from-brand-600 active:to-brand-700 shadow-md shadow-brand-200/50 hover:shadow-lg hover:shadow-brand-300/40 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  {saving && (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
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
