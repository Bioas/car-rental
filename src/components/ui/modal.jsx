import React, { useEffect } from 'react'

export function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="card p-6 w-full max-w-lg relative animate-scale-in" onClick={e => e.stopPropagation()}>
        {title && (
          <h3 className="font-heading font-semibold text-lg text-gray-900 dark:text-white mb-4">{title}</h3>
        )}
        {children}
      </div>
    </div>
  )
}
