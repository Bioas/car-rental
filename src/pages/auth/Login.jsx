import React, { useState } from 'react'
import { Logo } from '../../components/Logo'
import { useNavigate, useLocation } from 'react-router-dom'
import { afterLoginPath } from '../../lib/authRedirect'
import { useApp } from '../../context/AppContext'
import { Toast } from '../../components/ui/toast'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setToast(null)
    setLoading(true)
    try {
      await login(email, password)
      navigate(afterLoginPath(location), { replace: true })
    } catch (e) {
      setToast({ type: 'error', submessage: 'เข้าสู่ระบบไม่สำเร็จ', message: e.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md animate-slide-up">
          <div className="text-center mb-10">
            <Logo size={80} className="mx-auto mb-5 shadow-xl shadow-brand-500/20" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white font-heading">เข้าสู่ระบบ</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">ระบบบริหารจัดการยานพาหนะ</p>
          </div>

          <div className="card p-6 sm:p-8">
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="label">อีเมล</label>
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" className="input" placeholder="คุณ@email.com" autoComplete="email" required />
              </div>
              <div>
                <label className="label">รหัสผ่าน</label>
                <input value={password} onChange={e => setPassword(e.target.value)} type="password" className="input" placeholder="••••••••" autoComplete="current-password" required />
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading && (
                  <i aria-hidden="true" className="bx bx-loader-alt text-base animate-spin"></i>
                )}
                <span>เข้าสู่ระบบ</span>
              </button>
            </form>

          </div>
        </div>
      </div>

      {toast && <Toast type={toast.type} message={toast.message} submessage={toast.submessage} onClose={() => setToast(null)} duration={4000} />}

      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white blur-3xl"></div>
          <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-white blur-3xl"></div>
        </div>
        <div className="relative text-white text-center max-w-md">
          {/* White ring keeps the emblem's dark-red rim legible on the blue panel. */}
          <Logo size={112} className="mx-auto mb-8 ring-4 ring-white/30 shadow-2xl" />
          <h2 className="text-3xl font-bold font-heading mb-4">ยินดีต้อนรับ</h2>
          <p className="text-lg text-white/70">ระบบบริหารจัดการยานพาหนะสำหรับวิทยาลัยเทคนิคบุรีรัมย์</p>
        </div>
      </div>
    </main>
  )
}
