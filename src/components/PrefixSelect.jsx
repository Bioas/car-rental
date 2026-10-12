import React, { useEffect, useRef, useState } from 'react'
import { useNamePrefixes } from '../lib/docSettings'

// The admin's list of titles (ตั้งค่า → เอกสาร → คำนำหน้าชื่อ; defaults to
// นาย / นาง / นางสาว / ว่าที่ร้อยตรี). Nothing is pre-selected by default:
// while `value` is empty the trigger shows the muted "คำนำหน้า" placeholder and
// the booking is stored without a title.

// A native <select>'s open list is drawn by the OS, so it cannot be themed and
// looks out of place next to the other fields. This is a small hand-rolled
// listbox that mirrors the CarSelect styling used elsewhere in the app.
// `allowNone` adds a "ไม่ระบุ" choice for forms where the title is optional
// (e.g. user accounts — some staff use titles outside this list).
export default function PrefixSelect({ value, onChange, buttonClassName = '', allowNone = false }) {
  const prefixes = useNamePrefixes()
  // A title that was since removed from the list stays selectable on a record
  // that already uses it, so editing doesn't silently drop it.
  const OPTIONS = (value && !prefixes.includes(value) ? [...prefixes, value] : prefixes)
    .map(p => ({ value: p, label: p }))
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handlePointer(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const selected = OPTIONS.find(o => o.value === value) || null

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button type="button" onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox" aria-expanded={open}
        className={`flex items-center justify-between gap-1 ${buttonClassName}`}>
        <span className={`min-w-0 truncate ${selected ? '' : 'text-neutral-400 dark:text-gray-500'}`}>
          {selected ? selected.label : 'คำนำหน้า'}
        </span>
        <i className={`bx bx-chevron-down text-base text-neutral-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true"></i>
      </button>

      {open && (
        <ul role="listbox" aria-label="คำนำหน้าชื่อ"
          className="absolute z-50 top-full mt-1 left-0 min-w-full w-max bg-white dark:bg-gray-800 border border-neutral-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden origin-top animate-scale-in py-1">
          {(allowNone ? [{ value: '', label: 'ไม่ระบุ' }, ...OPTIONS] : OPTIONS).map(o => {
            const active = o.value === value
            return (
              <li key={o.value || 'none'} role="option" aria-selected={active}>
                <button type="button" onClick={() => { onChange(o.value); setOpen(false) }}
                  className={`w-full px-3.5 py-2.5 text-sm flex items-center justify-between gap-3 text-left whitespace-nowrap transition-colors hover:bg-brand-50 dark:hover:bg-brand-950/40 ${
                    active ? 'text-brand-700 dark:text-brand-300 font-medium bg-brand-50/50 dark:bg-brand-950/30' : 'text-neutral-700 dark:text-gray-300'
                  }`}>
                  <span>{o.label}</span>
                  {active && <i className="bx bx-check text-base text-brand-500 shrink-0" aria-hidden="true"></i>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
