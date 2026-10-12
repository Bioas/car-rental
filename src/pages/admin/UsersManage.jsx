import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import { apiGet, invalidateApi } from '../../lib/apiCache'
import { roleLabel, badgeClass, ROLE_LABELS, splitNamePrefix, joinNamePrefix } from '../../lib/constants'
import PrefixSelect from '../../components/PrefixSelect'
import { useNamePrefixes } from '../../lib/docSettings'
import { Pager } from '../../components/ui/pager'
import { SkeletonHeader, SkeletonTable } from '../../components/ui/skeleton'
import { StatTile, StatTileRow, SearchInput } from '../../components/ui/stat-tile'
import { useDialog, dialogProps } from '../../lib/useDialog'

const PAGE_SIZE = 20

// Full, literal Tailwind class strings per role — Tailwind's JIT scanner only
// picks up classes that appear unbroken in source text, so these cannot be
// built with template-literal interpolation (e.g. `border-${color}-400`).
const ROLE_OPTIONS = [
  { value: 'admin', icon: 'bxs-check-shield', active: 'border-purple-400 bg-purple-50 text-purple-700 dark:border-purple-500 dark:bg-purple-900/30 dark:text-purple-300' },
  { value: 'staff', icon: 'bx-id-card', active: 'border-teal-400 bg-teal-50 text-teal-700 dark:border-teal-500 dark:bg-teal-900/30 dark:text-teal-300' },
  { value: 'driver', icon: 'bx-car', active: 'border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-500 dark:bg-sky-900/30 dark:text-sky-300' },
]
// Summary tiles, each also a role filter.
const ROLE_TILES = [
  { key: 'all', label: 'ผู้ใช้ทั้งหมด', icon: 'bx-group', tone: 'bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300', ring: 'ring-brand-400' },
  { key: 'admin', label: 'ผู้ดูแลระบบ', icon: 'bxs-check-shield', tone: 'bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-300', ring: 'ring-purple-400' },
  { key: 'staff', label: 'เจ้าหน้าที่', icon: 'bx-id-card', tone: 'bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-300', ring: 'ring-teal-400' },
  { key: 'driver', label: 'พนักงานขับรถ', icon: 'bx-car', tone: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300', ring: 'ring-sky-400' },
]
const ROLE_AVATAR = {
  admin: 'from-purple-400 to-purple-600',
  staff: 'from-teal-400 to-teal-600',
  driver: 'from-sky-400 to-sky-600',
}

function nameInitial(name) {
  const bare = String(name || '').replace(/^(นาย|นางสาว|นาง|ว่าที่ร้อยตรี|ดร\.)\s*/, '').trim()
  return bare.charAt(0) || '?'
}

const INACTIVE_ROLE_CLASS = 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'

export default function UsersManage() {
  const { authHeaders } = useApp()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const namePrefixes = useNamePrefixes()
  const [form, setForm] = useState({ prefix: '', name: '', email: '', password: '', phone: '', id_card: '', role: 'driver' })
  const [openMenuId, setOpenMenuId] = useState(null)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })

  function handleMenuClick(e, id) {
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setOpenMenuId(openMenuId === id ? null : id)
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  // Every account is loaded once (a college has tens, not thousands) so the
  // role counts, search and role filter work across all of them; the table
  // pages locally.
  const counts = useMemo(() => {
    const c = { all: users.length }
    for (const u of users) c[u.role] = (c[u.role] || 0) + 1
    return c
  }, [users])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (!q) return true
      return [u.name, u.email, u.phone, u.position, u.id_card].some((v) => String(v || '').toLowerCase().includes(q))
    })
  }, [users, query, roleFilter])
  const pages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1)
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  useEffect(() => { setPage(1) }, [query, roleFilter])
  useEffect(() => { if (page > pages) setPage(pages) }, [page, pages])

  function openModal(user) {
    setError('')
    setPasswordConfirm('')
    if (user) {
      setEditing(user)
      const { prefix, name } = splitNamePrefix(user.name, user.prefix, namePrefixes)
      setForm({ prefix, name, email: user.email, password: '', phone: user.phone || '', id_card: user.id_card || '', role: user.role })
    } else {
      setEditing(null)
      setForm({ prefix: '', name: '', email: '', password: '', phone: '', id_card: '', role: 'driver' })
    }
    setShowModal(true)
  }

  function updateForm(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function saveUser(e) {
    e.preventDefault()
    setError('')
    if (form.role !== 'driver' && form.password !== passwordConfirm) {
      setError('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน')
      setSaving(false)
      return
    }
    setSaving(true)
    try {
      const isEdit = !!editing
      const url = isEdit ? `/api/admin/users/${editing.id}` : '/api/admin/users'
      const method = isEdit ? 'PUT' : 'POST'

      // Stored like the booking form: the title is part of the name
      // ("นายสมชาย ใจดี"), and kept separately so editing can split it again.
      const body = { ...form, name: joinNamePrefix(form.prefix, form.name) }
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
      // A new user lands at the top of the list; jump there so it is visible.
      if (!isEdit) setPage(1)
      await fetchUsers(true)
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
      const res = await apiGet('/api/admin/users', { headers: authHeaders(), force })
      if (res.ok) setUsers(res.data.users || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
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
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white font-heading">จัดการผู้ใช้</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">เพิ่ม แก้ไข ลบผู้ใช้งานระบบ</p>
        </div>
        <button onClick={() => openModal()} className="btn-primary shrink-0">
          <i aria-hidden="true" className="bx bx-user-plus text-base"></i>
          เพิ่มผู้ใช้
        </button>
      </div>

      <StatTileRow className="mb-4 sm:mb-5">
        {ROLE_TILES.map((t) => (
          <StatTile key={t.key} icon={t.icon} label={t.label} value={counts[t.key] || 0} tone={t.tone} ring={t.ring}
            active={roleFilter === t.key}
            onClick={() => setRoleFilter(roleFilter === t.key ? 'all' : t.key)} />
        ))}
      </StatTileRow>

      <div className={`card overflow-hidden flex flex-col min-h-0 ${visible.length === 0 ? 'flex-1' : ''}`}>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border-light/60 dark:border-border-dark/60">
          <SearchInput value={query} onChange={setQuery} placeholder="ค้นหาชื่อ อีเมล เบอร์โทร" className="flex-1 min-w-[200px] max-w-md" />
          <span className="text-xs text-gray-400 ml-auto">
            {filtered.length === users.length ? `ทั้งหมด ${users.length} คน` : `พบ ${filtered.length} จาก ${users.length} คน`}
          </span>
          {roleFilter !== 'all' && (
            <button onClick={() => setRoleFilter('all')} className="text-xs text-brand-600 dark:text-brand-400 hover:underline min-h-[36px] px-2 -mx-2">ล้างตัวกรอง</button>
          )}
        </div>

        {visible.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 py-16 text-gray-400 text-sm">
            <i aria-hidden="true" className="bx bx-user text-4xl opacity-50"></i>
            {users.length === 0 ? 'ไม่มีผู้ใช้ในระบบ' : 'ไม่พบผู้ใช้ที่ตรงกับการค้นหา'}
          </div>
        ) : (
          <>
            {/* Mobile list */}
            <div className="sm:hidden divide-y divide-border-light/40 dark:divide-border-dark/40">
              {visible.map(u => (
                <div key={u.id} className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${ROLE_AVATAR[u.role] || 'from-brand-400 to-brand-600'} flex items-center justify-center text-white text-sm font-bold shrink-0`}>{nameInitial(u.name)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{u.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.position || u.email}</div>
                    </div>
                    <span className={badgeClass(u.role === 'admin' ? 'approved' : u.role === 'driver' ? 'returned' : 'pending') + ' shrink-0'}>{roleLabel(u.role)}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center gap-1 min-w-0"><i aria-hidden="true" className="bx bx-envelope text-sm"></i><span className="truncate">{u.email}</span></span>
                    {u.phone && <span className="inline-flex items-center gap-1"><i aria-hidden="true" className="bx bx-phone text-sm"></i>{u.phone}</span>}
                    {u.id_card && <span className="inline-flex items-center gap-1 font-mono"><i aria-hidden="true" className="bx bx-id-card text-sm"></i>{u.id_card}</span>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openModal(u)} className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-all">
                      <i aria-hidden="true" className="bx bx-edit text-sm"></i>แก้ไข
                    </button>
                    <button onClick={() => deleteUser(u.id)} className="flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all">
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
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">ผู้ใช้</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">ติดต่อ</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 hidden lg:table-cell">เลขบัตรประชาชน</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">สิทธิ์</th>
                    <th className="w-14 px-4 py-3"><span className="sr-only">จัดการ</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light/40 dark:divide-border-dark/40">
                  {visible.map(u => (
                    <tr key={u.id} onDoubleClick={() => openModal(u)} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${ROLE_AVATAR[u.role] || 'from-brand-400 to-brand-600'} flex items-center justify-center text-white text-sm font-bold shrink-0`}>{nameInitial(u.name)}</div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{u.name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.position || '-'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-700 dark:text-gray-300 truncate">{u.email}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{u.phone || 'ไม่มีเบอร์โทร'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono hidden lg:table-cell">{u.id_card || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={badgeClass(u.role === 'admin' ? 'approved' : u.role === 'driver' ? 'returned' : 'pending')}>
                          {roleLabel(u.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={(e) => handleMenuClick(e, u.id)} aria-label={`จัดการ ${u.name}`}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 transition-colors">
                          <i aria-hidden="true" className="bx bx-dots-vertical-rounded text-xl"></i>
                        </button>
                        {openMenuId === u.id && (
                          <div style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
                            className="w-36 card p-1 shadow-xl border border-border-light dark:border-border-dark z-50 animate-scale-in text-left">
                            <button onClick={() => { setOpenMenuId(null); openModal(u); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors">
                              <i aria-hidden="true" className="bx bx-edit text-base"></i> แก้ไข
                            </button>
                            <button onClick={() => { setOpenMenuId(null); deleteUser(u.id); }}
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

      <Pager page={page} pages={pages} total={filtered.length} limit={PAGE_SIZE} onChange={setPage} />

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          <div ref={modalRef} {...dialogProps('ข้อมูลผู้ใช้')} className="card p-6 w-full max-w-lg relative animate-scale-in max-h-[70vh] overflow-y-auto scrollbar-none sm:max-h-none sm:overflow-visible" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-border-light dark:border-border-dark">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0 ${
                  editing
                    ? 'bg-gradient-to-br from-amber-400 to-orange-500'
                    : 'bg-gradient-to-br from-brand-500 to-brand-600'
                }`}>
                  {editing
                    ? <i aria-hidden="true" className="bx bx-edit text-xl"></i>
                    : <i aria-hidden="true" className="bx bx-user-plus text-xl"></i>
                  }
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-base text-gray-900 dark:text-white">
                    {editing ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'}
                  </h3>
                  <p className="text-xs text-neutral-500">{editing ? 'แก้ไขข้อมูลผู้ใช้ในระบบ' : 'กรอกข้อมูลสำหรับผู้ใช้ใหม่'}</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} aria-label="ปิด"
                className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-gray-700 text-neutral-400 transition-colors">
                <i aria-hidden="true" className="bx bx-x text-xl"></i>
              </button>
            </div>

            <form onSubmit={saveUser} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">ชื่อผู้ใช้</label>
                <div className="flex gap-2">
                  <PrefixSelect value={form.prefix} onChange={v => updateForm('prefix', v)} allowNone
                    buttonClassName="h-11 w-32 px-3 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all" />
                  <div className="relative flex-1 min-w-0">
                    <i aria-hidden="true" className="bx bx-user absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                    <input value={form.name} onChange={e => updateForm('name', e.target.value)}
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all" required placeholder="ชื่อ-นามสกุล" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">อีเมล</label>
                  <div className="relative">
                    <i aria-hidden="true" className="bx bx-envelope absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                    <input value={form.email} onChange={e => updateForm('email', e.target.value)} type="email"
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all" required placeholder="user@example.com" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">เบอร์โทร</label>
                  <div className="relative">
                    <i aria-hidden="true" className="bx bx-phone absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                    <input value={form.phone} onChange={e => updateForm('phone', e.target.value)} type="tel"
                      className="w-full h-11 pl-10 pr-4 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all" placeholder="เบอร์โทร" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">เลขบัตรประชาชน</label>
                <div className="relative">
                  <i aria-hidden="true" className="bx bx-id-card absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400"></i>
                  <input value={form.id_card} onChange={e => updateForm('id_card', e.target.value)}
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all" placeholder="เลขบัตรประชาชน 13 หลัก" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-gray-400 mb-1.5">สิทธิ์</label>
                <div className="grid grid-cols-3 gap-2">
                  {ROLE_OPTIONS.map(opt => (
                    <button key={opt.value} type="button" onClick={() => updateForm('role', opt.value)}
                      className={`min-h-11 py-2 px-2 flex flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold leading-tight text-center border-2 transition-all ${
                        form.role === opt.value ? opt.active : INACTIVE_ROLE_CLASS
                      }`}>
                      <i aria-hidden="true" className={`bx ${opt.icon} text-base`}></i>
                      <span>{ROLE_LABELS[opt.value]}</span>
                    </button>
                  ))}
                </div>
                {form.role === 'driver' && (
                  <p className="mt-2 text-xs text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                    <i aria-hidden="true" className="bx bx-info-circle text-sm"></i>
                    พนักงานขับรถไม่ต้องใช้รหัสผ่าน และไม่สามารถเข้าสู่ระบบได้
                  </p>
                )}
              </div>

              <div className={`grid transition-[grid-template-rows] motion-safe:duration-300 ${form.role !== 'driver' ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden min-h-0">
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800/50">
                    <div className="mb-3">
                      <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">รหัสผ่าน {editing && <span className="font-normal text-amber-600 dark:text-amber-400">(เว้นว่างไว้ไม่เปลี่ยน)</span>}</span>
                    </div>
                    <div className="space-y-3">
                      <div className="relative max-w-sm">
                        <label className="block text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">รหัสผ่าน</label>
                        <div className="relative">
                          <i aria-hidden="true" className="bx bx-key absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-amber-400"></i>
                          <input value={form.password} onChange={e => updateForm('password', e.target.value)} type="password"
                            className="w-full h-11 pl-10 pr-4 rounded-xl border-2 border-amber-200 dark:border-amber-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-900/50 transition-all" required={form.role !== 'driver' && !editing} placeholder="รหัสผ่าน" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">ยืนยันรหัสผ่าน</label>
                        <div className="flex items-center gap-2">
                          <div className="relative max-w-sm flex-1">
                            <i aria-hidden="true" className="bx bx-key absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-amber-400"></i>
                            <input value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} type="password"
                              className={`w-full h-11 pl-10 pr-4 rounded-xl border-2 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all ${
                                !passwordConfirm
                                  ? 'border-amber-200 dark:border-amber-700 focus:border-amber-400 focus:ring-amber-100 dark:focus:ring-amber-900/50'
                                  : passwordConfirm === form.password
                                    ? 'border-emerald-400 dark:border-emerald-500 focus:border-emerald-400 focus:ring-emerald-100 dark:focus:ring-emerald-900/50'
                                    : 'border-red-400 dark:border-red-500 focus:border-red-400 focus:ring-red-100 dark:focus:ring-red-900/50'
                              }`} required={form.role !== 'driver' && !editing} placeholder="ยืนยันรหัสผ่าน" />
                          </div>
                          {passwordConfirm && (
                            <span className="shrink-0">
                              {passwordConfirm === form.password ? (
                                <i aria-hidden="true" className="bx bxs-check-circle text-xl text-emerald-500"></i>
                              ) : (
                                <i aria-hidden="true" className="bx bxs-x-circle text-xl text-red-500"></i>
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
                  <i aria-hidden="true" className="bx bx-error-circle text-base shrink-0"></i>
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 h-11 inline-flex items-center justify-center gap-2 px-5 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 active:from-brand-600 active:to-brand-700 shadow-md shadow-brand-200/50 hover:shadow-lg hover:shadow-brand-300/40 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  {saving && (
                    <i aria-hidden="true" className="bx bx-loader-alt text-base animate-spin"></i>
                  )}
                  <span>{editing ? 'บันทึกการเปลี่ยนแปลง' : 'เพิ่มผู้ใช้'}</span>
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
