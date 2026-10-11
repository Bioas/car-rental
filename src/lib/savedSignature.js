// The signed-in staff member's saved signature (GET/PUT/DELETE
// /api/auth/me/signature, api/routes/auth.cjs). One module-level copy is shared
// by every component that uses the hook, so saving it on the profile page
// (src/pages/Profile.jsx) shows up immediately in an open sign modal.
import { useCallback, useEffect, useState } from 'react'

const URL = '/api/auth/me/signature'
let current = null      // { signature, updated_at } once loaded
let pending = null
const listeners = new Set()

function publish(value) {
  current = value
  for (const fn of listeners) fn(value)
}

async function request(method, headers, body) {
  const res = await fetch(URL, {
    method,
    headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่')
  return { signature: data.signature || '', updated_at: data.updated_at || null }
}

/** Forget the cached copy (e.g. on logout). */
export function resetSavedSignature() {
  current = null
  pending = null
}

/**
 * `{ signature, updatedAt, loaded, save(dataUrl), remove() }` for the current
 * staff user. Pass `enabled = false` for accounts that never sign (admins).
 */
export function useSavedSignature(authHeaders, enabled = true) {
  const [value, setValue] = useState(current)

  useEffect(() => {
    if (!enabled) return
    listeners.add(setValue)
    if (!current) {
      pending = pending || request('GET', authHeaders()).catch(() => ({ signature: '', updated_at: null }))
      pending.then((v) => { pending = null; publish(v) })
    }
    return () => { listeners.delete(setValue) }
    // authHeaders is recreated per render; the token behind it is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  const save = useCallback(async (signature) => {
    publish(await request('PUT', authHeaders(), { signature }))
  }, [authHeaders])

  const remove = useCallback(async () => {
    publish(await request('DELETE', authHeaders()))
  }, [authHeaders])

  return {
    signature: value?.signature || '',
    updatedAt: value?.updated_at || null,
    loaded: !!value,
    save,
    remove,
  }
}
