import React from 'react'

const colors = {
  brand: { bg: 'bg-brand-600', icon: 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400' },
  emerald: { bg: 'bg-emerald-600', icon: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
  amber: { bg: 'bg-amber-600', icon: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
  red: { bg: 'bg-red-600', icon: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
}

export const StatCard = React.memo(function StatCard({ title, value, color = 'brand', children }) {
  const c = colors[color] || colors.brand

  return (
    <div className="card-hover p-5 relative overflow-hidden group">
      <div className={`absolute top-0 right-0 w-24 h-24 rounded-full opacity-5 -translate-y-8 translate-x-8 group-hover:scale-150 transition-transform duration-700 ${c.bg}`} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400 font-body">{title}</p>
          <p className="text-3xl font-bold font-heading text-gray-900 dark:text-white mt-1">{value ?? '-'}</p>
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${c.icon}`}>
          {children}
        </div>
      </div>
    </div>
  )
})
