import React from 'react'

// Shared skeleton primitives so every page that waits for data shows the same
// kind of placeholder instead of a bare spinner or an empty screen.

const BASE = 'animate-pulse rounded-md bg-gray-100 dark:bg-gray-800'

/** The building block: a pulsing block. Size it with `className`. */
export const Skeleton = React.memo(function Skeleton({ className = '' }) {
  return <div className={`${BASE} ${className}`} aria-hidden="true" />
})

/** Title + subtitle placeholder for a page header. */
export function SkeletonHeader({ className = '' }) {
  return (
    <div className={`mb-6 ${className}`}>
      <Skeleton className="h-7 w-44 rounded-lg" />
      <Skeleton className="h-4 w-28 mt-2.5" />
    </div>
  )
}

/** Row of stat cards (matches the 2/4-column layouts used on dashboard/reports). */
export function SkeletonStats({ count = 4, className = '' }) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card p-4 flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-10 mt-2" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** A single list row: leading block + two text lines. */
export function SkeletonListRow({ className = '' }) {
  return (
    <div className={`card p-4 ${className}`}>
      <div className="flex items-start gap-4">
        <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
        <div className="flex-1 min-w-0">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-3/4 mt-2.5" />
          <Skeleton className="h-3 w-20 mt-2.5" />
        </div>
      </div>
    </div>
  )
}

/** Stack of list rows. */
export function SkeletonList({ rows = 4, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }, (_, i) => <SkeletonListRow key={i} />)}
    </div>
  )
}

/** A card holding table-like rows (used by the admin list pages). */
export function SkeletonTable({ rows = 6, className = '' }) {
  return (
    <div className={`card overflow-hidden ${className}`}>
      <div className="p-4 border-b border-border-light/50 dark:border-border-dark/50 bg-gray-50 dark:bg-gray-800/50">
        <Skeleton className="h-3 w-full max-w-md" />
      </div>
      <div className="divide-y divide-border-light/40 dark:divide-border-dark/40">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="p-4 flex items-center gap-4">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24 hidden sm:block" />
            <Skeleton className="h-4 w-16 hidden sm:block" />
            <Skeleton className="h-6 w-16 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** A card with a heading and a few text lines (used for the report panels). */
export function SkeletonPanel({ lines = 4, className = '' }) {
  return (
    <div className={`card p-6 ${className}`}>
      <Skeleton className="h-4 w-40 mb-5" />
      <div className="space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-2 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
