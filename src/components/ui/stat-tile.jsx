import React from 'react'

// Summary tile for list pages (คำขอจอง, ตั้งค่า → รถยนต์ / ผู้ใช้). With
// `onClick` it doubles as a filter: the active tile gets a ring in its own
// colour. On phones a clickable tile shrinks to a small pill (label + count,
// solid blue when active) so a row of them scrolls sideways instead of
// pushing the list down; the full card shows from sm up.
//   tone — classes for the icon chip, e.g. 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40'
//   ring — ring colour shown while active, e.g. 'ring-emerald-400'
export function StatTile({ icon, label, value, tone, ring = 'ring-brand-400', active = false, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  const card = (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} aria-pressed={onClick ? active : undefined}
      className={`card p-4 ${onClick ? 'hidden sm:flex' : 'flex'} items-center gap-3 text-left w-full transition-all duration-200 ${
        onClick ? 'hover:-translate-y-0.5 hover:shadow-md cursor-pointer' : ''
      } ${active ? `ring-2 ${ring}` : ''}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
        <i aria-hidden="true" className={`bx ${icon} text-2xl`}></i>
      </div>
      <div className="min-w-0">
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</div>
        <div className="text-xl font-bold font-heading text-gray-900 dark:text-white">{value}</div>
      </div>
    </Tag>
  )
  if (!onClick) return card
  return (
    <>
      <button type="button" onClick={onClick} aria-pressed={active}
        className={`sm:hidden shrink-0 inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-sm font-semibold whitespace-nowrap transition-all duration-200 ${
          active
            ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
            : 'bg-white dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
        }`}>
        {label}
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
          active ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
        }`}>{value}</span>
      </button>
      {card}
    </>
  )
}

// Wrapper for a row of StatTiles: a sideways-scrolling strip of pills on
// phones, a grid (columns from `grid`) from sm up.
export function StatTileRow({ grid = 'sm:grid-cols-2 lg:grid-cols-4', className = '', children }) {
  return (
    <div className={`flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1 sm:mx-0 sm:px-0 sm:pb-0 sm:overflow-visible sm:grid sm:gap-3 ${grid} ${className}`}>
      {children}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = 'ค้นหา', className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <i aria-hidden="true" className="bx bx-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg pointer-events-none"></i>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type="text" role="searchbox" enterKeyHint="search"
        className="w-full h-10 pl-10 pr-9 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-900/40 transition" />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="ล้างคำค้นหา"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">
          <i aria-hidden="true" className="bx bx-x text-lg"></i>
        </button>
      )}
    </div>
  )
}
