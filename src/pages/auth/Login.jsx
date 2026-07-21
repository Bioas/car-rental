import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/app/')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md animate-slide-up">
          <div className="text-center mb-10">
            <div className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-brand-500/30">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
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

              {error && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                )}
                <span>เข้าสู่ระบบ</span>
              </button>
            </form>

            <div className="mt-6 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-border-light dark:border-border-dark">
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                <span className="font-medium">บัญชีทดสอบ:</span><br />
                Admin: admin@carrental.local / admin123
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white blur-3xl"></div>
          <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-white blur-3xl"></div>
        </div>
        <div className="relative text-white text-center max-w-md">
          <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center mx-auto mb-8">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold font-heading mb-4">ยินดีต้อนรับ</h2>
          <p className="text-lg text-white/70">ระบบบริหารจัดการยานพาหนะสำหรับองค์กร จองง่าย จัดการสะดวก</p>
        </div>
      </div>
    </div>
  )
}
