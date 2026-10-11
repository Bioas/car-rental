// Admin-editable document settings that the UI needs everywhere: the display
// titles of the five signing stages, and the loan rules. Served by the public
// GET /api/public/document-settings (see api/lib/doc-settings.cjs) and cached
// through apiGet, so the many timelines/progress bars on a page share one
// request. invalidateApi() after saving settings makes the next mount refetch.
import { useEffect, useMemo, useState } from 'react'
import { apiGet } from './apiCache'
import { CHAIN_STEPS, NAME_PREFIXES } from './constants'

const URL = '/api/public/document-settings'
let latest = null

export function useDocSettings() {
  const [settings, setSettings] = useState(latest)
  useEffect(() => {
    let alive = true
    apiGet(URL, { ttl: 60000 }).then((res) => {
      if (alive && res.ok && res.data) {
        latest = res.data
        setSettings(res.data)
      }
    }).catch(() => {})
    return () => { alive = false }
  }, [])
  return settings
}

/** The admin's list of name titles for the title dropdowns. */
export function useNamePrefixes() {
  const settings = useDocSettings()
  return settings?.name_prefixes?.length ? settings.name_prefixes : NAME_PREFIXES
}

/** CHAIN_STEPS (requester + five stages) with the admin's stage titles applied. */
export function useChainSteps() {
  const settings = useDocSettings()
  return useMemo(() => CHAIN_STEPS.map((step) => ({
    ...step,
    title: settings?.stage_titles?.[step.key] || step.title,
  })), [settings])
}

/** A `key → title` lookup for the signing stages. */
export function useStageTitle() {
  const steps = useChainSteps()
  return useMemo(() => {
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s.title]))
    return (key) => byKey[key] || key
  }, [steps])
}

/**
 * Stage key → name of the staff member assigned to sign it (signed-in admin /
 * staff only — GET /api/admin/stage-assignments). Lets the signing timeline say
 * who a stage is waiting on. Returns {} until loaded, or when `enabled` is false
 * (public pages never see signer names).
 */
export function useAssignedSigners(headers, enabled = true) {
  const [names, setNames] = useState({})
  useEffect(() => {
    if (!enabled) return
    let alive = true
    apiGet('/api/admin/stage-assignments', { headers, ttl: 60000 }).then((res) => {
      if (alive && res.ok && res.data?.stages) {
        setNames(Object.fromEntries(res.data.stages.filter((s) => s.user_name).map((s) => [s.key, s.user_name])))
      }
    }).catch(() => {})
    return () => { alive = false }
    // headers is a fresh object each render; the cache key is the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
  return names
}
