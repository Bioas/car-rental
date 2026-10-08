import React, { useState, useEffect, useRef } from 'react'

/**
 * Custom CSS dropdown — replaces the native <select> so the closed control, the
 * popup panel and the option rows all follow the app's design system instead of
 * the operating system's default select styling (which cannot be themed).
 *
 * Matches the look of the existing hand-rolled dropdowns (CarSelect/UserSelect
 * in the booking forms): a bordered trigger with a rotating chevron and a
 * floating panel, plus a check mark on the selected row.
 *
 * Keyboard support mirrors a native select: ArrowUp/ArrowDown move the active
 * option, Enter/Space open and commit, Home/End jump, Escape and Tab close.
 *
 * Props:
 *   value       — current value ('' for none)
 *   onChange    — (value) => void
 *   options     — array of { value, label } or plain strings
 *   placeholder — shown when nothing is selected
 *   icon        — optional Boxicons class for a leading icon, e.g. 'bx-car'
 *   disabled    — disables the trigger
 */
export function Select({
  value = '',
  onChange,
  options = [],
  placeholder = '— เลือก —',
  icon = '',
  disabled = false,
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef(null)

  // Normalize string options to { value, label } once per render.
  const items = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
  const selectedIndex = items.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? items[selectedIndex] : null

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  function openPanel() {
    if (disabled) return
    setOpen(true)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
  }

  function commit(index) {
    const item = items[index]
    if (item) onChange && onChange(item.value)
    setOpen(false)
  }

  function onKeyDown(e) {
    if (disabled) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) return openPanel()
      setActiveIndex((i) => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return openPanel()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Home') {
      if (open) { e.preventDefault(); setActiveIndex(0) }
    } else if (e.key === 'End') {
      if (open) { e.preventDefault(); setActiveIndex(items.length - 1) }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (open && activeIndex >= 0) commit(activeIndex)
      else openPanel()
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); setOpen(false) }
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full h-11 ${icon ? 'pl-10' : 'pl-3.5'} pr-9 flex items-center justify-between rounded-xl border bg-white dark:bg-gray-800 text-sm text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 disabled:opacity-50 disabled:cursor-not-allowed ${
          open
            ? 'border-brand-400 ring-2 ring-brand-100 dark:ring-brand-900/40'
            : 'border-border-light dark:border-border-dark'
        } ${selected ? 'text-gray-900 dark:text-gray-100' : 'text-neutral-400'}`}
      >
        {icon && (
          <i className={`bx ${icon} absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400`}></i>
        )}
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <i
          className={`bx bx-chevron-down absolute right-3.5 top-1/2 -translate-y-1/2 text-base text-neutral-400 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        ></i>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-50 top-full mt-1 left-0 right-0 origin-top overflow-hidden rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 shadow-xl motion-safe:animate-scale-in"
        >
          <div className="max-h-60 overflow-y-auto py-1">
            {items.length === 0 && (
              <div className="px-3.5 py-3 text-xs text-neutral-400 text-center">ไม่มีตัวเลือก</div>
            )}
            {items.map((o, i) => {
              const isSelected = o.value === value
              const isActive = i === activeIndex
              return (
                <button
                  key={o.value === '' ? '__none__' : o.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => commit(i)}
                  className={`w-full px-3.5 py-2.5 text-sm flex items-center gap-2.5 text-left transition-colors ${
                    isSelected
                      ? 'text-brand-700 dark:text-brand-300 font-medium bg-brand-50/60 dark:bg-brand-950/30'
                      : 'text-neutral-700 dark:text-gray-300'
                  } ${isActive && !isSelected ? 'bg-brand-50 dark:bg-brand-950/40' : ''}`}
                >
                  <span className="flex-1 min-w-0 truncate">{o.label}</span>
                  {isSelected && <i className="bx bx-check text-base text-brand-500 shrink-0"></i>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default Select
