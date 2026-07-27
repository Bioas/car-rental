import React, { useState, useEffect, useRef } from 'react'

export function Toast({ type = 'success', message, submessage, onClose, duration = 3000 }) {
  const [closing, setClosing] = useState(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (duration <= 0) return
    const t1 = setTimeout(() => {
      setClosing(true)
      const t2 = setTimeout(() => onCloseRef.current?.(), 250)
      cleanupRef.current = () => clearTimeout(t2)
    }, duration)
    const cleanupRef = { current: () => clearTimeout(t1) }
    return () => cleanupRef.current()
  }, [duration])

  const isSuccess = type === 'success'
  const enterAnim = isSuccess ? 'animate-slide-up-fade' : 'animate-slide-in-right'
  const exitAnim = isSuccess ? 'animate-slide-out-down' : 'animate-slide-out-right'
  const icon = isSuccess ? 'bx-check-circle' : 'bx-error-circle'
  const iconColor = isSuccess
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-red-600 dark:text-red-400'
  const bgColor = isSuccess
    ? 'bg-emerald-100 dark:bg-emerald-900/30'
    : 'bg-red-100 dark:bg-red-900/30'
  const borderColor = isSuccess
    ? 'border-emerald-200 dark:border-emerald-800'
    : 'border-red-200 dark:border-red-800'
  const ringColor = isSuccess ? 'bg-emerald-400/30' : 'bg-red-400/30'
  const iconAnim = isSuccess ? 'animate-success-pop' : 'animate-shake'

  function handleClick() {
    if (closing) return
    setClosing(true)
    setTimeout(() => onClose?.(), 250)
  }

  return (
    <div className="fixed top-6 right-6 z-[100]" onClick={handleClick}>
      <div className={`flex items-center gap-3.5 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border ${borderColor} px-5 py-4 ${enterAnim} cursor-pointer ${closing ? exitAnim : ''}`}>
        <div className="relative w-10 h-10 shrink-0">
          {isSuccess && (
            <div className={`absolute inset-0 rounded-full ${ringColor} animate-success-ring`}></div>
          )}
          <div className={`w-full h-full rounded-full ${bgColor} flex items-center justify-center ${iconAnim}`}>
            <i className={`bx ${icon} text-2xl ${iconColor}`}></i>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {submessage || (isSuccess ? 'ดำเนินการสำเร็จ' : 'เกิดข้อผิดพลาด')}
          </p>
          {message && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{message}</p>
          )}
        </div>
        <i className="bx bx-x text-lg text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors shrink-0"></i>
      </div>
    </div>
  )
}
