import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { Toast } from '../components/ui/toast'
import SavedSignatureManager from '../components/SavedSignatureManager'
import { roleLabel } from '../lib/constants'

// "โปรไฟล์ของฉัน" — the signed-in user's own account: their details, password,
// and (for staff signers) the saved signature used in the sign modal.
// Backed by PUT /api/auth/me, PUT /api/auth/me/password and
// /api/auth/me/signature (api/routes/auth.cjs). Email and role are managed by
// an admin in ตั้งค่า → ผู้ใช้.

function Section({ id, icon, title, description, children, footer }) {
  return (
    <section id={id} className="card scroll-mt-24">
      <header className="px-5 sm:px-6 pt-5 pb-4 border-b border-border-light/60 dark:border-border-dark/60 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300 flex items-center justify-center shrink-0">
          <i className={`bx ${icon} text-lg`}></i>
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        </div>
      </header>
      <div className="px-5 sm:px-6 py-5">{children}</div>
      {footer && (
        <footer className="px-5 sm:px-6 py-3.5 border-t border-border-light/60 dark:border-border-dark/60 flex items-center justify-end gap-3 bg-gray-50/60 dark:bg-gray-900/20 rounded-b-2xl">
          {footer}
        </footer>
      )}
    </section>
  )
}

function Field({ label, htmlFor, hint, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

function PasswordInput({ id, value, onChange, autoComplete, invalid }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input id={id} type={show ? 'text' : 'password'} className="input pr-11" value={value} autoComplete={autoComplete}
        aria-invalid={invalid || undefined} onChange={e => onChange(e.target.value)} />
      <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
        <i className={`bx ${show ? 'bx-hide' : 'bx-show'} text-lg`}></i>
      </button>
    </div>
  )
}

const PROFILE_FIELDS = ['name', 'phone', 'position']
const pick = (u) => Object.fromEntries(PROFILE_FIELDS.map(k => [k, u?.[k] || '']))

export default function Profile() {
  const { user, authHeaders, updateUser, replaceToken } = useApp()
  const location = useLocation()
  const canSign = user?.role === 'staff'
  const [form, setForm] = useState(() => pick(user))
  const [savingProfile, setSavingProfile] = useState(false)
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [savingPw, setSavingPw] = useState(false)
  const [pwError, setPwError] = useState('')
  const [toast, setToast] = useState(null)

  useEffect(() => { setForm(pick(user)) }, [user])

  // Deep links such as /app/profile#signature (navbar → ลายเซ็นของฉัน).
  useEffect(() => {
    if (!location.hash) return
    const el = document.getElementById(location.hash.slice(1))
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }, [location.hash])

  const profileDirty = PROFILE_FIELDS.some(k => (form[k] || '').trim() !== (user?.[k] || ''))
  const nameMissing = !form.name.trim()

  async function saveProfile() {
    if (nameMissing) return
    setSavingProfile(true)
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(PROFILE_FIELDS.map(k => [k, form[k].trim()]))),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ')
      updateUser(data.user)
      setToast({ type: 'success', submessage: 'บันทึกข้อมูลส่วนตัวแล้ว' })
    } catch (e) {
      setToast({ type: 'error', submessage: e.message })
    } finally {
      setSavingProfile(false)
    }
  }

  const pwTooShort = pw.next.length > 0 && pw.next.length < 6
  const pwMismatch = pw.confirm.length > 0 && pw.next !== pw.confirm
  const pwReady = pw.current && pw.next.length >= 6 && pw.next === pw.confirm

  async function changePassword() {
    if (!pwReady) return
    setSavingPw(true)
    setPwError('')
    try {
      const res = await fetch('/api/auth/me/password', {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: pw.current, new_password: pw.next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ')
      replaceToken(data.token)
      setPw({ current: '', next: '', confirm: '' })
      setToast({ type: 'success', submessage: 'เปลี่ยนรหัสผ่านแล้ว', message: 'อุปกรณ์อื่นที่เคยเข้าสู่ระบบไว้ต้องเข้าสู่ระบบใหม่' })
    } catch (e) {
      setPwError(e.message)
    } finally {
      setSavingPw(false)
    }
  }

  const initials = user?.name ? user.name.charAt(0).toUpperCase() : '?'
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  return (
    <div className="animate-fade-in pb-6">
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white font-heading">โปรไฟล์ของฉัน</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">ข้อมูลบัญชี รหัสผ่าน{canSign ? ' และลายเซ็นที่ใช้เซ็นเอกสาร' : ''}</p>
      </div>

      {/* Identity strip */}
      <div className="card p-5 sm:p-6 mb-6 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-brand-100 dark:bg-brand-900/50 flex items-center justify-center ring-4 ring-brand-50 dark:ring-brand-900/30 shrink-0">
          <span className="text-xl font-semibold text-brand-700 dark:text-brand-300 font-heading">{initials}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-gray-900 dark:text-white font-heading truncate">{user?.name}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            {roleLabel(user?.role)}
          </span>
          {memberSince && <span className="text-[11px] text-gray-400 dark:text-gray-500">ใช้งานตั้งแต่ {memberSince}</span>}
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-6 items-start ${canSign ? 'xl:grid-cols-2' : 'max-w-3xl'}`}>
        <div className="space-y-6 min-w-0">
          <Section id="details" icon="bx-user" title="ข้อมูลส่วนตัว"
            description="ชื่อที่แสดงในระบบและใต้ลายเซ็นบนเอกสาร"
            footer={(
              <>
                {profileDirty && !savingProfile && <span className="text-xs text-amber-600 dark:text-amber-400">มีการแก้ไขที่ยังไม่บันทึก</span>}
                <button type="button" onClick={saveProfile} disabled={!profileDirty || nameMissing || savingProfile}
                  className="h-10 px-5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {savingProfile ? 'กำลังบันทึก…' : 'บันทึก'}
                </button>
              </>
            )}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Field label="ชื่อ-นามสกุล" htmlFor="profile-name" hint={nameMissing ? undefined : 'ใช้เป็นชื่อในวงเล็บใต้ลายเซ็นบน PDF'}>
                  <input id="profile-name" className="input" value={form.name} maxLength={200} autoComplete="name"
                    aria-invalid={nameMissing || undefined} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </Field>
                {nameMissing && <p className="text-[11px] text-red-500 mt-1">กรุณากรอกชื่อ</p>}
              </div>
              <Field label="เบอร์โทรศัพท์" htmlFor="profile-phone">
                <input id="profile-phone" className="input" type="tel" inputMode="tel" value={form.phone} maxLength={200} autoComplete="tel"
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </Field>
              <Field label="ตำแหน่ง" htmlFor="profile-position">
                <input id="profile-position" className="input" value={form.position} maxLength={200}
                  onChange={e => setForm(f => ({ ...f, position: e.target.value }))} />
              </Field>
              <Field label="อีเมล (ใช้เข้าสู่ระบบ)" htmlFor="profile-email" hint="ติดต่อผู้ดูแลระบบหากต้องการเปลี่ยนอีเมล">
                <input id="profile-email" className="input bg-gray-50 dark:bg-gray-800/60 text-gray-500 cursor-not-allowed" value={user?.email || ''} readOnly />
              </Field>
              <Field label="สิทธิ์การใช้งาน" htmlFor="profile-role">
                <input id="profile-role" className="input bg-gray-50 dark:bg-gray-800/60 text-gray-500 cursor-not-allowed" value={roleLabel(user?.role)} readOnly />
              </Field>
            </div>
          </Section>

          <Section id="password" icon="bx-lock-alt" title="เปลี่ยนรหัสผ่าน"
            description="เมื่อเปลี่ยนแล้ว อุปกรณ์อื่นที่เข้าสู่ระบบไว้จะต้องเข้าสู่ระบบใหม่"
            footer={(
              <button type="button" onClick={changePassword} disabled={!pwReady || savingPw}
                className="h-10 px-5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {savingPw ? 'กำลังเปลี่ยน…' : 'เปลี่ยนรหัสผ่าน'}
              </button>
            )}>
            <form className="grid grid-cols-1 sm:grid-cols-2 gap-4" onSubmit={e => { e.preventDefault(); changePassword() }}>
              {/* Lets password managers pair the new password with this account. */}
              <input type="text" name="username" autoComplete="username" value={user?.email || ''} readOnly hidden />
              <div className="sm:col-span-2">
                <Field label="รหัสผ่านปัจจุบัน" htmlFor="pw-current">
                  <PasswordInput id="pw-current" value={pw.current} autoComplete="current-password"
                    onChange={v => { setPw(p => ({ ...p, current: v })); setPwError('') }} />
                </Field>
              </div>
              <Field label="รหัสผ่านใหม่" htmlFor="pw-next" hint={pwTooShort ? undefined : 'อย่างน้อย 6 ตัวอักษร'}>
                <PasswordInput id="pw-next" value={pw.next} autoComplete="new-password" invalid={pwTooShort}
                  onChange={v => { setPw(p => ({ ...p, next: v })); setPwError('') }} />
                {pwTooShort && <p className="text-[11px] text-red-500 mt-1">รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร</p>}
              </Field>
              <Field label="ยืนยันรหัสผ่านใหม่" htmlFor="pw-confirm">
                <PasswordInput id="pw-confirm" value={pw.confirm} autoComplete="new-password" invalid={pwMismatch}
                  onChange={v => { setPw(p => ({ ...p, confirm: v })); setPwError('') }} />
                {pwMismatch && <p className="text-[11px] text-red-500 mt-1">รหัสผ่านไม่ตรงกัน</p>}
              </Field>
              <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
            </form>
            {pwError && (
              <p className="mt-3 text-sm text-red-500 dark:text-red-400 flex items-center gap-1.5">
                <i className="bx bx-error-circle"></i> {pwError}
              </p>
            )}
          </Section>
        </div>

        {canSign && (
          <Section id="signature" icon="bx-pen" title="ลายเซ็นของฉัน"
            description="บันทึกไว้ครั้งเดียว แล้วแตะ &quot;ใช้ลายเซ็นที่บันทึกไว้&quot; ตอนเซ็นเอกสารได้ทันที">
            <SavedSignatureManager />
          </Section>
        )}
      </div>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}
