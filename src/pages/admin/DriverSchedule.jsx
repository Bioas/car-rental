import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { Toast } from '../../components/ui/toast'
import { Skeleton } from '../../components/ui/skeleton'
import TripDetailModal from '../../components/TripDetailModal'
import { LineIcon } from '../../components/LineIcon'
import { todayStr, effectiveStatus, formatTime, timeRangeLabel } from '../../lib/constants'
import {
  THAI_MONTHS_SHORT, THAI_DAYS_SHORT, addDays, parseDay, daysBetween,
  tripOn, tripState, destinationText, initials,
} from '../../lib/trips'
import { useDialog, dialogProps } from '../../lib/useDialog'

// ตารางคนขับ — who drives when. Rows are drivers, columns are days; every day
// a driver has no trip reads "ว่าง", and each column header counts the free
// drivers, so finding someone available for a date is a glance. Also where
// driver LINE links are managed (see api/lib/drivers.cjs).

const SPANS = [7, 14]

function mondayOf(s) {
  const d = parseDay(s)
  const back = (d.getDay() + 6) % 7
  return addDays(s, -back)
}

/** Stack overlapping trips of one driver into tracks (greedy, like the calendars). */
function layout(trips, from, span) {
  const to = addDays(from, span - 1)
  const bars = trips.filter((t) => t.start_date <= to && t.end_date >= from).map((t) => {
    const start = Math.max(0, daysBetween(from, t.start_date))
    const end = Math.min(span - 1, daysBetween(from, t.end_date))
    return { trip: t, start, end, track: 0 }
  }).sort((a, b) => a.start - b.start)
  const tracks = []
  for (const bar of bars) {
    let t = tracks.findIndex((last) => last < bar.start)
    if (t === -1) { t = tracks.length; tracks.push(bar.end) } else tracks[t] = bar.end
    bar.track = t
  }
  return { bars, tracks: Math.max(tracks.length, 1) }
}

function LineCodeModal({ driver, code, onClose }) {
  const panelRef = useRef(null)
  useDialog(!!code, onClose, panelRef)
  if (!code) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div ref={panelRef} {...dialogProps('รหัสเชื่อม LINE')} className="relative w-full max-w-sm bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-6 text-center motion-safe:animate-scale-in">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-[#06C755] flex items-center justify-center mb-3"><span className="text-white" style={{ '--line-ink': '#06C755' }}><LineIcon className="w-8 h-8" /></span></div>
        <h3 className="font-bold font-heading text-lg text-gray-900 dark:text-white">รหัสเชื่อม LINE ของ {driver?.name}</h3>
        <div className="my-4 text-4xl font-bold font-mono tracking-[0.3em] text-gray-900 dark:text-white">{code.code}</div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          ให้คนขับเพิ่มเพื่อน LINE {code.line?.bot_id || 'ของวิทยาลัย'} แล้วส่งรหัสนี้ในแชท<br />รหัสหมดอายุใน 30 นาที
        </p>
        {code.line?.add_friend_url && (
          <a href={code.line.add_friend_url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-[#06C755] hover:underline">{code.line.add_friend_url}</a>
        )}
        <button onClick={onClose} className="btn-secondary w-full mt-5">ปิด</button>
      </div>
    </div>,
    document.body,
  )
}

function DriverMenu({ driver, line, onAction }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const item = 'w-full text-left px-3.5 py-2 text-sm flex items-center gap-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/60 text-gray-700 dark:text-gray-200 disabled:opacity-40 disabled:pointer-events-none'
  const act = (a) => { setOpen(false); onAction(a, driver) }
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-label={`จัดการ ${driver.name}`}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600">
        <i aria-hidden="true" className="bx bx-dots-vertical-rounded text-lg"></i>
      </button>
      {open && (
        <div className="absolute z-30 left-0 top-full mt-1 w-60 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl">
          <a href={`/driver/${driver.id}`} target="_blank" rel="noreferrer" className={item} onClick={() => setOpen(false)}>
            <i aria-hidden="true" className="bx bx-link-external text-base"></i>เปิดหน้าตารางของคนนี้
          </a>
          <button className={item} disabled={!line.configured} onClick={() => act('code')}>
            <LineIcon className="w-4 h-4 text-[#06C755]" />{driver.line_linked ? 'สร้างรหัสเชื่อม LINE ใหม่' : 'สร้างรหัสเชื่อม LINE'}
          </button>
          <button className={item} disabled={!line.configured || !driver.line_linked} onClick={() => act('test')}>
            <i aria-hidden="true" className="bx bx-send text-base"></i>ส่งข้อความทดสอบ
          </button>
          <button className={`${item} !text-red-600`} disabled={!driver.line_linked} onClick={() => act('unlink')}>
            <i aria-hidden="true" className="bx bx-unlink text-base"></i>ยกเลิกการเชื่อมต่อ LINE
          </button>
        </div>
      )}
    </div>
  )
}

export default function DriverSchedule() {
  const { authHeaders, refreshSignal, user } = useApp()
  const isAdmin = user?.role === 'admin'
  const today = todayStr()
  const [span, setSpan] = useState(7)
  const [from, setFrom] = useState(() => mondayOf(today))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [openTrip, setOpenTrip] = useState(null)
  const [codeFor, setCodeFor] = useState(null)
  const [toast, setToast] = useState(null)
  const [busy, setBusy] = useState(false)

  const to = addDays(from, span - 1)
  const days = useMemo(() => Array.from({ length: span }, (_, i) => addDays(from, i)), [from, span])

  const load = useCallback(async () => {
    try {
      // Always include today so the "ว่างวันนี้" counts stay right on other weeks.
      const end = addDays(from, span - 1)
      const qFrom = today < from ? today : from
      const qTo = today > end ? today : end
      const res = await fetch(`/api/admin/driver-schedule?from=${qFrom}&to=${qTo}`, { headers: authHeaders() })
      const json = await res.json()
      if (res.ok) setData(json)
    } finally {
      setLoading(false)
    }
  }, [from, span, today, authHeaders])

  useEffect(() => { load() }, [load, refreshSignal])

  const drivers = useMemo(() => data?.drivers || [], [data])
  const line = data?.line || { configured: false }
  const tripsByDriver = useMemo(() => {
    const map = new Map(drivers.map((d) => [d.id, []]))
    for (const t of data?.trips || []) map.get(t.driver_id)?.push(t)
    return map
  }, [drivers, data])
  const busyOn = (driverId, day) => (tripsByDriver.get(driverId) || []).some((t) => tripOn(t, day))
  const freeCount = (day) => drivers.filter((d) => !busyOn(d.id, day)).length
  const busyToday = drivers.filter((d) => busyOn(d.id, today)).length
  const linkedCount = drivers.filter((d) => d.line_linked).length

  async function post(url, method = 'POST') {
    const res = await fetch(url, { method, headers: authHeaders() })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || 'ทำรายการไม่สำเร็จ')
    return json
  }

  async function onAction(action, driver) {
    try {
      if (action === 'code') {
        const json = await post(`/api/admin/drivers/${driver.id}/line-code`)
        setCodeFor({ driver, code: json })
      } else if (action === 'test') {
        const json = await post(`/api/admin/drivers/${driver.id}/line-test`)
        setToast({ type: 'success', submessage: json.message, message: driver.name })
      } else if (action === 'unlink') {
        if (!window.confirm(`ยกเลิกการเชื่อมต่อ LINE ของ ${driver.name}?`)) return
        await post(`/api/admin/drivers/${driver.id}/line`, 'DELETE')
        setToast({ type: 'success', submessage: 'ยกเลิกการเชื่อมต่อแล้ว', message: driver.name })
        load()
      }
    } catch (err) {
      setToast({ type: 'error', submessage: 'ไม่สำเร็จ', message: err.message })
    }
  }

  async function resend(trip) {
    setBusy(true)
    try {
      const json = await post(`/api/admin/bookings/${trip.id}/notify-driver`)
      setToast({ type: 'success', submessage: 'ส่งแจ้งเตือนแล้ว', message: json.message })
    } catch (err) {
      setToast({ type: 'error', submessage: 'ส่งไม่สำเร็จ', message: err.message })
    } finally {
      setBusy(false)
    }
  }

  const openDriver = openTrip ? drivers.find((d) => d.id === openTrip.driver_id) : null
  const rangeLabel = (() => {
    const a = parseDay(from)
    const b = parseDay(to)
    const year = b.getFullYear() + 543
    return a.getMonth() === b.getMonth()
      ? `${a.getDate()} – ${b.getDate()} ${THAI_MONTHS_SHORT[b.getMonth()]} ${year}`
      : `${a.getDate()} ${THAI_MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${THAI_MONTHS_SHORT[b.getMonth()]} ${year}`
  })()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white font-heading">ตารางพนักงานขับรถ</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">ดูว่าคนขับว่างวันไหน และจัดการการแจ้งเตือนทาง LINE</p>
        </div>
        <a href="/driver" target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center gap-2">
          <i aria-hidden="true" className="bx bx-link-external"></i>หน้าสำหรับคนขับ
        </a>
      </div>

      {data && !line.configured && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4 flex flex-wrap items-center gap-3">
          <LineIcon className="w-7 h-7 text-[#06C755]" />
          <div className="flex-1 min-w-[200px] text-sm text-amber-800 dark:text-amber-200">
            <p className="font-semibold">ยังไม่ได้เปิดการแจ้งเตือนคนขับทาง LINE</p>
            <p className="text-amber-800 dark:text-amber-200">เชื่อมต่อ LINE Official Account ของวิทยาลัยเพื่อส่งงานถึงคนขับอัตโนมัติ</p>
          </div>
          {isAdmin && (
            <Link to="/app/settings/line" className="h-10 px-4 inline-flex items-center gap-2 rounded-xl bg-[#00843d] hover:bg-[#006e33] text-white text-sm font-semibold">
              <i aria-hidden="true" className="bx bx-cog text-lg"></i>ตั้งค่า LINE
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'คนขับทั้งหมด', value: drivers.length, icon: 'bx-id-card', tone: 'text-brand-600 bg-brand-50 dark:bg-brand-950/40' },
          { label: 'ว่างวันนี้', value: drivers.length - busyToday, icon: 'bx-check-circle', tone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40' },
          { label: 'มีงานวันนี้', value: busyToday, icon: 'bx-car', tone: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' },
          { label: 'เชื่อม LINE แล้ว', value: `${linkedCount}/${drivers.length}`, icon: 'line', tone: 'text-[#06C755] bg-[#06C755]/10' },
        ].map((c) => (
          <div key={c.label} className="card p-4 flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${c.tone}`}>
              {c.icon === 'line' ? <LineIcon className="w-6 h-6" /> : <i aria-hidden="true" className={`bx ${c.icon} text-2xl`}></i>}
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{c.label}</div>
              <div className="text-xl font-bold font-heading text-gray-900 dark:text-white">{loading ? '–' : c.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <button onClick={() => setFrom(addDays(from, -span))} aria-label="ก่อนหน้า" className="w-9 h-9 rounded-xl border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"><i aria-hidden="true" className="bx bx-chevron-left text-xl"></i></button>
            <button onClick={() => setFrom(addDays(from, span))} aria-label="ถัดไป" className="w-9 h-9 rounded-xl border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"><i aria-hidden="true" className="bx bx-chevron-right text-xl"></i></button>
            <span className="font-bold font-heading text-gray-900 dark:text-white ml-1">{rangeLabel}</span>
            <button onClick={() => setFrom(mondayOf(today))} className="ml-1 text-xs text-brand-600 dark:text-brand-400 hover:underline min-h-[36px] px-1">สัปดาห์นี้</button>
          </div>
          <div className="inline-flex p-1 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-medium">
            {SPANS.map((n) => (
              <button key={n} onClick={() => setSpan(n)}
                className={`px-3 h-8 rounded-lg transition-colors ${span === n ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-300'}`}>{n === 7 ? '1 สัปดาห์' : '2 สัปดาห์'}</button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div style={{ minWidth: 240 + span * (span === 7 ? 110 : 72) }}>
            {/* Day header + free-driver count */}
            <div className="flex border-b border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40">
              <div className="w-[150px] sm:w-[240px] shrink-0 px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 sticky left-0 bg-gray-50 dark:bg-gray-800 z-10">พนักงานขับรถ</div>
              <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${span}, minmax(0, 1fr))` }}>
                {days.map((d) => {
                  const date = parseDay(d)
                  const free = freeCount(d)
                  const weekend = date.getDay() === 0 || date.getDay() === 6
                  return (
                    <div key={d} className={`px-1 py-2 text-center border-l border-gray-100 dark:border-gray-700 ${d === today ? 'bg-brand-50 dark:bg-brand-950/40' : ''}`}>
                      <div className={`text-[11px] ${weekend ? 'text-rose-600 dark:text-rose-400' : 'text-gray-600 dark:text-gray-400'}`}>{THAI_DAYS_SHORT[date.getDay()]}</div>
                      <div className={`text-sm font-bold font-heading ${d === today ? 'text-brand-600 dark:text-brand-400' : 'text-gray-900 dark:text-white'}`}>{date.getDate()}</div>
                      {!loading && drivers.length > 0 && (
                        <div className={`mt-1 inline-block text-[10px] font-semibold px-1.5 rounded-md ${free ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300'}`}>
                          ว่าง {free}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {loading && Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-4 border-b border-gray-50 dark:border-gray-700/60">
                <Skeleton className="w-9 h-9 rounded-xl" /><Skeleton className="h-4 w-32" /><Skeleton className="h-7 flex-1 rounded-lg" />
              </div>
            ))}
            {!loading && !drivers.length && (
              <p className="text-center py-12 text-gray-400">ยังไม่มีพนักงานขับรถ — เพิ่มได้ที่ ตั้งค่า → ผู้ใช้ (บทบาท "พนักงานขับรถ")</p>
            )}

            {!loading && drivers.map((driver) => {
              const { bars, tracks } = layout(tripsByDriver.get(driver.id) || [], from, span)
              const rowH = Math.max(56, 12 + tracks * 34)
              const todayBusy = busyOn(driver.id, today)
              return (
                <div key={driver.id} className="flex border-b border-gray-50 dark:border-gray-700/60 last:border-b-0 group">
                  <div className="w-[150px] sm:w-[240px] shrink-0 pl-3 pr-1 sm:px-4 py-2 flex items-center gap-2 sm:gap-3 sticky left-0 bg-white dark:bg-gray-900 z-10" style={{ minHeight: rowH }}>
                    <div className="relative">
                      <div className="hidden sm:flex w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-indigo-500 text-white text-sm font-bold items-center justify-center">{initials(driver.name)}</div>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900 ${todayBusy ? 'bg-amber-400' : 'bg-emerald-400'}`} title={todayBusy ? 'มีงานวันนี้' : 'ว่างวันนี้'} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white leading-tight line-clamp-2">{driver.name}</div>
                      <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
                        <span className="hidden sm:inline">{driver.phone || 'ไม่มีเบอร์'}</span>
                        {driver.line_linked && <span title="เชื่อม LINE แล้ว"><LineIcon className="w-3.5 h-3.5 text-[#06C755]" /></span>}
                      </div>
                    </div>
                    <DriverMenu driver={driver} line={line} onAction={onAction} />
                  </div>
                  <div className="flex-1 relative" style={{ minHeight: rowH }}>
                    {/* Day cells: free days say so */}
                    <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${span}, minmax(0, 1fr))` }}>
                      {days.map((d) => (
                        <div key={d} className={`border-l border-gray-50 dark:border-gray-700/60 flex items-center justify-center ${d === today ? 'bg-brand-50/50 dark:bg-brand-950/20' : ''}`}>
                          {!busyOn(driver.id, d) && <span className="text-[11px] text-emerald-700 dark:text-emerald-400">ว่าง</span>}
                        </div>
                      ))}
                    </div>
                    {/* Trip bars */}
                    <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: `repeat(${span}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${tracks}, 30px)`, rowGap: 4, padding: '6px 0', alignContent: 'center' }}>
                      {bars.map(({ trip, start, end, track }) => {
                        const s = tripState(trip)
                        const pending = effectiveStatus(trip) === 'pending'
                        return (
                          <button key={trip.id} onClick={() => setOpenTrip(trip)}
                            title={`${trip.license_plate} · ${destinationText(trip)}${timeRangeLabel(trip) ? ` · ${timeRangeLabel(trip)}` : ''} · ${s.label}`}
                            style={{ gridColumn: `${start + 1} / ${end + 2}`, gridRow: track + 1, background: s.bar }}
                            className={`pointer-events-auto mx-1 px-2 rounded-lg text-left text-[11px] font-semibold text-gray-900/80 truncate shadow-sm hover:brightness-105 hover:shadow-md transition ${pending ? 'bg-[length:12px_12px] bg-[linear-gradient(135deg,rgba(255,255,255,.35)_25%,transparent_25%,transparent_50%,rgba(255,255,255,.35)_50%,rgba(255,255,255,.35)_75%,transparent_75%)]' : ''}`}>
                            {trip.start_time && trip.start_date >= from ? `${formatTime(trip.start_time)} ` : ''}{trip.license_plate} · {trip.destination_province || trip.destination_place || trip.user_name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500">
          {['approved', 'pending', 'returned'].map((k) => {
            const s = tripState({ status: k, remaining_signers: k === 'pending' ? 1 : 0 })
            return <span key={k} className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: s.bar }} />{s.label}</span>
          })}
          <span className="inline-flex items-center gap-1.5"><span className="text-emerald-700 dark:text-emerald-400">ว่าง</span>= ไม่มีงานในวันนั้น</span>
        </div>
      </div>

      <TripDetailModal
        trip={openTrip}
        driverName={openDriver?.name}
        onClose={() => setOpenTrip(null)}
        actions={openTrip && line.configured && openDriver?.line_linked && openTrip.status === 'approved' ? (
          <button disabled={busy} onClick={() => resend(openTrip)}
            className="h-11 rounded-xl bg-[#00843d] hover:bg-[#006e33] text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
            <span style={{ '--line-ink': '#06C755' }}><LineIcon className="w-5 h-5" /></span>{busy ? 'กำลังส่ง...' : 'ส่งแจ้งเตือนคนขับทาง LINE อีกครั้ง'}
          </button>
        ) : null}
      />
      <LineCodeModal driver={codeFor?.driver} code={codeFor?.code} onClose={() => setCodeFor(null)} />
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}
