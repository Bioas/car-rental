import React from 'react'

// The college emblem (public/logo.webp — circular, transparent corners). One
// component so every place that shows the brand mark uses the same asset.
export function Logo({ size = 40, className = '' }) {
  return (
    <img
      src="/logo.webp"
      alt="ตราวิทยาลัยเทคนิคบุรีรัมย์"
      width={size}
      height={size}
      decoding="async"
      className={`shrink-0 rounded-full select-none ${className}`}
      style={{ width: size, height: size }}
      draggable="false"
    />
  )
}
