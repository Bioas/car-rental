import React from 'react'

export function EmptyState({ icon, message, action }) {
  return (
    <div className="text-center py-16 text-gray-400">
      {icon && (
        <i className={`bx ${icon} text-6xl mx-auto mb-4 opacity-50 block`}></i>
      )}
      <p>{message}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
