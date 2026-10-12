import { useEffect, useRef } from 'react'

// Keyboard behaviour shared by every modal window:
//  - Escape closes it,
//  - focus moves into the panel when it opens and Tab / Shift+Tab stay inside,
//  - focus returns to whatever opened it once it closes.
// Pass the panel's ref and the props from `dialogProps(label)` to its element.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useDialog(open, onClose, panelRef) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement
    const panel = () => panelRef?.current

    // Let the panel render first, then focus its first control (or itself).
    const t = setTimeout(() => {
      const el = panel()
      if (!el || el.contains(document.activeElement)) return
      const first = el.querySelector('[autofocus]') || el.querySelector(FOCUSABLE)
      ;(first || el).focus({ preventScroll: true })
    }, 30)

    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const el = panel()
      if (!el) return
      const items = [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null)
      if (!items.length) { e.preventDefault(); return }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) {
        e.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [open, panelRef])
}

/** ARIA attributes for a modal panel. */
export function dialogProps(label) {
  return { role: 'dialog', 'aria-modal': 'true', 'aria-label': label, tabIndex: -1 }
}
