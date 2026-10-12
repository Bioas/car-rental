import React from 'react'

// LINE's speech-bubble mark (Boxicons 2.1 has no LINE glyph). Inherits the
// text colour; size via className like an icon font (`w-5 h-5`).
export function LineIcon({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={`inline-block shrink-0 ${className}`}>
      <path d="M12 2.5C6.48 2.5 2 6.12 2 10.6c0 4.01 3.56 7.37 8.37 8.01.33.07.77.22.88.5.1.25.07.65.03.9l-.14.86c-.04.25-.2.99.87.54 1.07-.45 5.77-3.4 7.87-5.82C21.32 14 22 12.38 22 10.6 22 6.12 17.52 2.5 12 2.5Z" />
      <path fill="var(--line-ink, #fff)" d="M7.9 12.86H5.92a.52.52 0 0 1-.52-.52V8.4a.52.52 0 1 1 1.04 0v3.42H7.9a.52.52 0 1 1 0 1.04Zm2.04-.52a.52.52 0 1 1-1.04 0V8.4a.52.52 0 1 1 1.04 0v3.94Zm4.76 0a.52.52 0 0 1-.94.31l-2.03-2.76v2.45a.52.52 0 1 1-1.04 0V8.4a.52.52 0 0 1 .94-.31l2.03 2.76V8.4a.52.52 0 1 1 1.04 0v3.94Zm3.2-2.49a.52.52 0 1 1 0 1.04h-1.45v.93h1.45a.52.52 0 1 1 0 1.04h-1.97a.52.52 0 0 1-.52-.52V8.4c0-.29.23-.52.52-.52h1.97a.52.52 0 1 1 0 1.04h-1.45v.93h1.45Z" />
    </svg>
  )
}
