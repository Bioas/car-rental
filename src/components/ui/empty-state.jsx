import React from 'react'

export function EmptyState({ icon, message, action }) {
  return (
    <div className="text-center py-16 text-gray-400">
      {icon && (
        <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d={icon} />
        </svg>
      )}
      <p>{message}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
