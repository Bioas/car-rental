import React from 'react'

export function Spinner({ className = '' }) {
  return (
    <div className={`flex items-center justify-center py-20 ${className}`}>
      <i className="bx bx-loader-alt text-3xl animate-spin text-brand-600"></i>
    </div>
  )
}
