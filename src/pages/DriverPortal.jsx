import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { Logo } from '../components/Logo'
import { CalendarMonthGrid } from '../components/CalendarMonthGrid'
import TripDetailModal from '../components/TripDetailModal'
import { LineIcon } from '../components/LineIcon'
import { Skeleton } from '../components/ui/skeleton'
import { todayStr, timeRangeLabel } from '../lib/constants'
import {
  THAI_MONTHS, THAI_DAYS_SHORT, addDays, parseDay, dayStr, daysBetween, thaiLong, thaiRange,
  tripOn, tripDays, tripState, destinationText, carText, initials,
} from '../lib/trips'
import { useDialog, dialogProps } from '../lib/useDialog'

// /driver — the driver's own schedule. Drivers have no password, so like the
// public booking page this needs no sign-in: pick your name once (remembered
// on this device) and see today's job, the upcoming list or a month calendar.
// LINE notifications are linked from here too (needs the driver's phone).

const STORAGE_KEY = 'driverId'
const VIEWS = [
  { key: 'today', label: 'วันนี้', icon: 'bx-sun' },
  { key: 'list', label: 'รายการงาน', icon: 'bx-list-ul' },
  { key: 'calendar', label: 'ปฏิทิน', icon: 'bx-calendar' },
]

async function getJson(url, init) {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'โหลดข้อมูลไม่สำเร็จ')
  return data
}

function Avatar({ name, size = 'w-12 h-12 text-base' }) {
  return (
    <div className={`${size} rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-500 text-white font-bold font-heading flex items-center justify-center shrink-0 shadow-md shadow-brand-500/20`}>
      {initials(name)}
    </div>
  )
}

function StatusChip({ trip, className = '' }) {
  const s = tripState(trip)
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${s.chip} ${className}`}>
      <i aria-hidden="true" className={`bx ${s.icon}`}></i>{s.label}
    </span>
  )
}

// ─── Picker ───

function DriverPicker({ drivers, loading, onPick }) {
  const [q, setQ] = useState('')
  const list = drivers.filter((d) => d.name.includes(q.trim()))
  return (
    <section className="max-w-3xl mx-auto w-full motion-safe:animate-fade-in">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold font-heading text-gray-900 dark:text-white">คุณคือใคร?</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1">เลือกชื่อของคุณเพื่อดูคิวงานขับรถ — ระบบจะจำไว้ในเครื่องนี้</p>
      </div>
      {drivers.length > 6 && (
        <div className="relative mb-4 max-w-md mx-auto">
          <i aria-hidden="true" className="bx bx-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ"
            className="w-full h-11 pl-10 pr-4 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-brand-400" />
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {loading && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        {!loading && list.map((d) => (
          <button key={d.id} onClick={() => onPick(d.id)}
            className="group text-left flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-gray-800/80 border-2 border-gray-100 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
            <Avatar name={d.name} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-gray-900 dark:text-white truncate">{d.name}</div>
              <div className="text-xs text-gray-400 truncate">{d.position || 'พนักงานขับรถ'}</div>
            </div>
            {d.line_linked && <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#06C755]/10 text-[#06C755]">LINE</span>}
            <i aria-hidden="true" className="bx bx-chevron-right text-xl text-gray-300 group-hover:text-brand-500 transition-colors"></i>
          </button>
        ))}
        {!loading && !list.length && (
          <p className="sm:col-span-2 text-center py-10 text-gray-400">{drivers.length ? 'ไม่พบชื่อที่ค้นหา' : 'ยังไม่มีรายชื่อพนักงานขับรถในระบบ'}</p>
        )}
      </div>
    </section>
  )
}

// ─── View 1: today ───

function TripCard({ trip, today, onOpen, big = false }) {
  const s = tripState(trip)
  const dayNo = daysBetween(trip.start_date, today) + 1
  const total = tripDays(trip)
  const dest = destinationText(trip)
  return (
    <button onClick={() => onOpen(trip)}
      className={`w-full text-left rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700 ring-1 ${s.ring} hover:shadow-lg transition-all duration-200 overflow-hidden ${big ? '' : 'hover:-translate-y-0.5'}`}>
      <div className="h-1.5" style={{ background: s.bar }} />
      <div className={big ? 'p-5 sm:p-6' : 'p-4'}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={`font-bold font-heading text-gray-900 dark:text-white ${big ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>{trip.license_plate || 'งานขับรถ'}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{[trip.brand, trip.model].filter(Boolean).join(' ')}</div>
          </div>
          <StatusChip trip={trip} />
        </div>
        <div className={`mt-4 grid gap-2.5 ${big ? 'sm:grid-cols-2' : ''} text-sm`}>
          {dest && (
            <div className="flex gap-2 text-gray-700 dark:text-gray-200"><i aria-hidden="true" className="bx bx-map text-lg text-rose-500 shrink-0"></i><span>{dest}</span></div>
          )}
          <div className="flex gap-2 text-gray-700 dark:text-gray-200"><i aria-hidden="true" className="bx bx-calendar text-lg text-brand-500 shrink-0"></i>
            <span>{thaiRange(trip.start_date, trip.end_date)}{timeRangeLabel(trip) && <span className="font-semibold"> · {timeRangeLabel(trip)}</span>}{total > 1 && today >= trip.start_date && today <= trip.end_date && <span className="text-gray-400"> · วันที่ {dayNo}/{total}</span>}</span>
          </div>
          <div className="flex gap-2 text-gray-700 dark:text-gray-200"><i aria-hidden="true" className="bx bx-user text-lg text-indigo-500 shrink-0"></i>
            <span>{trip.user_name}{trip.user_position && <span className="text-gray-400"> · {trip.user_position}</span>}</span>
          </div>
          {trip.purpose && (
            <div className="flex gap-2 text-gray-700 dark:text-gray-200"><i aria-hidden="true" className="bx bx-target-lock text-lg text-amber-500 shrink-0"></i><span className={big ? '' : 'line-clamp-1'}>{trip.purpose}</span></div>
          )}
        </div>
      </div>
    </button>
  )
}

function TodayView({ trips, today, onOpen }) {
  const [selected, setSelected] = useState(today)
  useEffect(() => { setSelected(today) }, [today])
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today])
  const dayTrips = trips.filter((t) => tripOn(t, selected) && t.status !== 'returned')
  const next = trips.find((t) => t.start_date > selected && t.status !== 'returned')
  const isToday = selected === today

  return (
    <div className="space-y-5 motion-safe:animate-fade-in">
      {/* 7-day strip: a dot under every day with a job */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {week.map((d, i) => {
          const date = parseDay(d)
          const busy = trips.some((t) => tripOn(t, d) && t.status !== 'returned')
          const active = d === selected
          return (
            <button key={d} onClick={() => setSelected(d)}
              className={`flex flex-col items-center py-2.5 sm:py-3 rounded-2xl border transition-all duration-200 ${
                active
                  ? 'bg-brand-600 border-brand-600 text-white shadow-lg shadow-brand-500/30'
                  : 'bg-white dark:bg-gray-800/80 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-brand-200'
              }`}>
              <span className={`text-[11px] ${active ? 'text-white' : date.getDay() === 0 ? 'text-rose-600 dark:text-rose-400' : 'text-gray-400'}`}>{i === 0 ? 'วันนี้' : THAI_DAYS_SHORT[date.getDay()]}</span>
              <span className="text-lg sm:text-xl font-bold font-heading leading-tight">{date.getDate()}</span>
              <span className={`mt-1 w-1.5 h-1.5 rounded-full ${busy ? (active ? 'bg-white' : 'bg-brand-500') : 'bg-transparent'}`} />
            </button>
          )
        })}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">{isToday ? 'งานวันนี้' : thaiLong(selected)}</h2>
        {dayTrips.length ? (
          <div className="space-y-3">
            {dayTrips.map((t) => <TripCard key={t.id} trip={t} today={selected} onOpen={onOpen} big />)}
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-8 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center mb-3">
              <i aria-hidden="true" className="bx bx-coffee text-3xl text-emerald-600 dark:text-emerald-400"></i>
            </div>
            <p className="font-semibold text-emerald-700 dark:text-emerald-300">{isToday ? 'วันนี้ไม่มีคิวขับรถ' : 'วันนี้ว่าง ไม่มีคิวขับรถ'}</p>
            <p className="text-sm text-emerald-600/70 dark:text-emerald-400/70 mt-1">ว่างทั้งวัน</p>
          </div>
        )}
      </div>

      {next && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">
            งานถัดไป <span className="font-normal text-gray-400">· อีก {daysBetween(selected, next.start_date)} วัน</span>
          </h2>
          <TripCard trip={next} today={selected} onOpen={onOpen} />
        </div>
      )}
    </div>
  )
}

// ─── View 2: list ───

function ListView({ trips, today, onOpen }) {
  const [showPast, setShowPast] = useState(false)
  const rows = trips.filter((t) => (showPast ? t.end_date < today : t.end_date >= today && t.status !== 'returned'))
  const ordered = showPast ? [...rows].reverse() : rows
  const groups = []
  for (const t of ordered) {
    const d = parseDay(t.start_date)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    let g = groups.find((x) => x.key === key)
    if (!g) groups.push(g = { key, label: `${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`, trips: [] })
    g.trips.push(t)
  }

  return (
    <div className="motion-safe:animate-fade-in">
      <div className="flex justify-end mb-3">
        <div className="inline-flex p-1 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-medium">
          {[[false, 'งานที่กำลังจะถึง'], [true, 'งานที่ผ่านมา']].map(([v, label]) => (
            <button key={label} onClick={() => setShowPast(v)}
              className={`px-3 h-8 rounded-lg transition-colors ${showPast === v ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-300'}`}>{label}</button>
          ))}
        </div>
      </div>
      {!groups.length && (
        <p className="text-center py-14 text-gray-400"><i aria-hidden="true" className="bx bx-calendar-check text-4xl block mb-2 opacity-60"></i>{showPast ? 'ยังไม่มีงานที่ผ่านมา' : 'ยังไม่มีงานที่กำลังจะถึง'}</p>
      )}
      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.key}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 px-1">{g.label}</h2>
            <div className="rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700/60 overflow-hidden">
              {g.trips.map((t) => {
                const d = parseDay(t.start_date)
                const s = tripState(t)
                const ongoing = tripOn(t, today)
                return (
                  <button key={t.id} onClick={() => onOpen(t)} className="w-full text-left flex items-center gap-4 p-3.5 sm:p-4 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                    <div className={`w-14 shrink-0 text-center rounded-xl py-1.5 ${ongoing ? 'bg-brand-600 text-white' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                      <div className={`text-[10px] ${ongoing ? 'text-white/80' : 'text-gray-400'}`}>{THAI_DAYS_SHORT[d.getDay()]}</div>
                      <div className={`text-xl font-bold font-heading leading-none ${ongoing ? '' : 'text-gray-900 dark:text-white'}`}>{d.getDate()}</div>
                      {tripDays(t) > 1 && <div className={`text-[10px] mt-0.5 ${ongoing ? 'text-white/80' : 'text-gray-400'}`}>{tripDays(t)} วัน</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.bar }} />
                        <span className="font-semibold text-gray-900 dark:text-white truncate">{destinationText(t) || t.purpose || 'งานขับรถ'}</span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{carText(t)} · {t.user_name}</div>
                    </div>
                    <StatusChip trip={t} className="hidden sm:inline-flex" />
                    <i aria-hidden="true" className="bx bx-chevron-right text-xl text-gray-300"></i>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── View 3: calendar ───

function CalendarView({ trips, onOpen, onMonthChange }) {
  const [viewDate, setViewDate] = useState(() => { const d = new Date(); d.setDate(1); return d })
  useEffect(() => { onMonthChange(viewDate) }, [viewDate, onMonthChange])
  const move = (n) => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + n, 1))
  const bars = trips.map((t) => ({ ...t, user_name: destinationText(t) || t.user_name }))

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700 overflow-hidden motion-safe:animate-fade-in">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <button onClick={() => move(-1)} aria-label="เดือนก่อน" className="w-9 h-9 rounded-xl border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"><i aria-hidden="true" className="bx bx-chevron-left text-xl"></i></button>
        <div className="text-center">
          <div className="font-bold font-heading text-gray-900 dark:text-white">{THAI_MONTHS[viewDate.getMonth()]} {viewDate.getFullYear() + 543}</div>
          <button onClick={() => { const d = new Date(); d.setDate(1); setViewDate(d) }} className="text-xs py-1.5 px-2 text-brand-600 dark:text-brand-400 hover:underline">กลับไปเดือนนี้</button>
        </div>
        <button onClick={() => move(1)} aria-label="เดือนถัดไป" className="w-9 h-9 rounded-xl border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"><i aria-hidden="true" className="bx bx-chevron-right text-xl"></i></button>
      </div>
      <CalendarMonthGrid
        viewDate={viewDate}
        rawBookings={bars}
        bookingBarColor={(status) => tripState({ status, remaining_signers: status === 'pending' ? 1 : 0 }).bar}
        onBarClick={(b) => onOpen(trips.find((t) => t.id === b.id) || b)}
      />
      <div className="flex flex-wrap gap-4 px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500">
        {['approved', 'pending', 'returned'].map((k) => {
          const s = tripState({ status: k, remaining_signers: k === 'pending' ? 1 : 0 })
          return <span key={k} className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: s.bar }} />{s.label}</span>
        })}
      </div>
    </div>
  )
}

// ─── LINE linking ───

function LineLinkModal({ driver, line, onClose, onLinked }) {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const linked = driver.line_linked
  const panelRef = useRef(null)
  useDialog(true, onClose, panelRef)

  // Wait for the webhook to link the account once the code is shown.
  useEffect(() => {
    if (!code || linked) return
    const t = setInterval(onLinked, 4000)
    return () => clearInterval(t)
  }, [code, linked, onLinked])

  async function requestCode(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const data = await getJson(`/api/driver/${driver.id}/line-code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }),
      })
      setCode(data.code)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const botId = line.bot_id ? (line.bot_id.startsWith('@') ? line.bot_id : `@${line.bot_id}`) : ''
  const sendUrl = code && botId ? `https://line.me/R/oaMessage/${encodeURIComponent(botId)}/?${encodeURIComponent(code)}` : ''

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm motion-safe:animate-fade-in" onClick={onClose} />
      <div ref={panelRef} {...dialogProps('รับแจ้งเตือนงานทาง LINE')} className="relative w-full sm:max-w-md bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 motion-safe:animate-scale-in">
        <button onClick={onClose} aria-label="ปิด" className="absolute top-4 right-4 w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><i aria-hidden="true" className="bx bx-x text-2xl"></i></button>
        <div className="w-14 h-14 rounded-2xl bg-[#06C755] flex items-center justify-center mb-4 shadow-lg shadow-[#06C755]/30">
          <span className="text-white" style={{ '--line-ink': '#06C755' }}><LineIcon className="w-9 h-9" /></span>
        </div>
        <h3 className="text-xl font-bold font-heading text-gray-900 dark:text-white">รับแจ้งเตือนงานทาง LINE</h3>

        {linked ? (
          <div className="mt-3 space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <p className="flex items-center gap-2 font-semibold text-[#06C755]"><i aria-hidden="true" className="bx bx-check-circle text-xl"></i>เชื่อมต่อแล้ว</p>
            <p>คุณจะได้รับข้อความเมื่อ:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>ได้รับมอบหมายงานขับรถ (เมื่อคำขออนุมัติแล้ว)</li>
              <li>เย็นวันก่อนเดินทาง 1 วัน</li>
            </ul>
            <p className="text-gray-500">พิมพ์ <b>คิว</b> ในแชท LINE เพื่อดูงานที่กำลังจะถึงได้ทุกเมื่อ</p>
          </div>
        ) : !line.configured ? (
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">ระบบแจ้งเตือนผ่าน LINE ยังไม่เปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ</p>
        ) : (
          <ol className="mt-4 space-y-4">
            <li className="flex gap-3">
              <span className="w-7 h-7 rounded-full bg-[#06C755]/10 text-[#06C755] font-bold text-sm flex items-center justify-center shrink-0">1</span>
              <div className="flex-1 text-sm text-gray-700 dark:text-gray-200">
                เพิ่มเพื่อน LINE ของวิทยาลัย
                {line.add_friend_url && (
                  <a href={line.add_friend_url} target="_blank" rel="noreferrer"
                    className="mt-2 flex items-center justify-center gap-2 h-10 rounded-xl bg-[#00843d] hover:bg-[#006e33] text-white font-semibold transition-colors">
                    <i aria-hidden="true" className="bx bx-user-plus text-lg"></i>เพิ่มเพื่อน {botId}
                  </a>
                )}
              </div>
            </li>
            <li className="flex gap-3">
              <span className="w-7 h-7 rounded-full bg-[#06C755]/10 text-[#06C755] font-bold text-sm flex items-center justify-center shrink-0">2</span>
              <div className="flex-1 text-sm text-gray-700 dark:text-gray-200">
                ยืนยันตัวตนด้วยเบอร์โทรของคุณ
                {!code && (
                  <form onSubmit={requestCode} className="mt-2 flex gap-2">
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="08x-xxx-xxxx"
                      className="flex-1 min-w-0 h-10 px-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-[#06C755]" />
                    <button disabled={busy || !phone} className="h-10 px-4 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold disabled:opacity-40">{busy ? '...' : 'ขอรหัส'}</button>
                  </form>
                )}
                {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
              </div>
            </li>
            <li className="flex gap-3">
              <span className="w-7 h-7 rounded-full bg-[#06C755]/10 text-[#06C755] font-bold text-sm flex items-center justify-center shrink-0">3</span>
              <div className="flex-1 text-sm text-gray-700 dark:text-gray-200">
                ส่งรหัสนี้ในแชท LINE
                {code ? (
                  <div className="mt-2 rounded-2xl bg-gray-50 dark:bg-gray-900 p-4 text-center">
                    <div className="text-3xl font-bold tracking-[0.3em] font-mono text-gray-900 dark:text-white">{code}</div>
                    <div className="mt-3 flex gap-2 justify-center">
                      <button onClick={() => { navigator.clipboard?.writeText(code); setCopied(true) }}
                        className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-600 text-xs font-medium">{copied ? 'คัดลอกแล้ว ✓' : 'คัดลอก'}</button>
                      {sendUrl && <a href={sendUrl} target="_blank" rel="noreferrer" className="h-9 px-3 inline-flex items-center rounded-lg bg-[#06C755] text-white text-xs font-semibold">เปิด LINE และส่งรหัส</a>}
                    </div>
                    <p className="mt-3 text-[11px] text-gray-400 flex items-center justify-center gap-1.5"><i aria-hidden="true" className="bx bx-loader-alt motion-safe:animate-spin"></i>รอการยืนยันจาก LINE... (รหัสหมดอายุใน 30 นาที)</p>
                  </div>
                ) : <p className="text-xs text-gray-400 mt-1">รหัสจะปรากฏหลังยืนยันเบอร์โทร</p>}
              </div>
            </li>
          </ol>
        )}
      </div>
    </div>,
    document.body,
  )
}

// ─── Page ───

export default function DriverPortal() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [drivers, setDrivers] = useState([])
  const [driversLoading, setDriversLoading] = useState(true)
  const [driver, setDriver] = useState(null)
  const [line, setLine] = useState({ configured: false })
  const [tripsById, setTripsById] = useState(() => new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState(() => localStorage.getItem('driverView') || 'today')
  const [openTrip, setOpenTrip] = useState(null)
  const [lineOpen, setLineOpen] = useState(false)
  const [today, setToday] = useState(todayStr())
  const loadedMonths = useRef(new Set())

  useEffect(() => { localStorage.setItem('driverView', view) }, [view])
  useEffect(() => {
    const t = setInterval(() => setToday(todayStr()), 60_000)
    return () => clearInterval(t)
  }, [])

  // /driver with a remembered driver jumps straight to their schedule.
  useEffect(() => {
    if (id) return
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) navigate(`/driver/${saved}`, { replace: true })
  }, [id, navigate])

  useEffect(() => {
    getJson('/api/driver/drivers')
      .then((data) => { setDrivers(data.drivers || []); setLine(data.line || {}) })
      .catch(() => {})
      .finally(() => setDriversLoading(false))
  }, [])

  const merge = useCallback((trips, replaceRange) => {
    setTripsById((prev) => {
      const next = new Map(prev)
      if (replaceRange) {
        // Drop trips in the refreshed window that no longer come back (rejected, reassigned).
        for (const [key, t] of next) if (t.start_date <= replaceRange.to && t.end_date >= replaceRange.from) next.delete(key)
      }
      for (const t of trips) next.set(t.id, t)
      return next
    })
  }, [])

  const load = useCallback(async (range = null, quiet = false) => {
    if (!id) return
    if (!quiet) setLoading(true)
    try {
      const qs = range ? `?from=${range.from}&to=${range.to}` : ''
      const data = await getJson(`/api/driver/${id}/schedule${qs}`)
      setDriver(data.driver)
      setLine(data.line || {})
      merge(data.trips || [], { from: data.from, to: data.to })
      localStorage.setItem(STORAGE_KEY, id)
      setError('')
    } catch (err) {
      setError(err.message)
      if (localStorage.getItem(STORAGE_KEY) === id) localStorage.removeItem(STORAGE_KEY)
    } finally {
      setLoading(false)
    }
  }, [id, merge])

  useEffect(() => {
    setTripsById(new Map())
    setDriver(null)
    loadedMonths.current = new Set()
    load()
    const t = setInterval(() => load(null, true), 60_000)
    return () => clearInterval(t)
  }, [id, load])

  const onMonthChange = useCallback((d) => {
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (loadedMonths.current.has(key)) return
    loadedMonths.current.add(key)
    const from = addDays(dayStr(new Date(d.getFullYear(), d.getMonth(), 1)), -7)
    const to = addDays(dayStr(new Date(d.getFullYear(), d.getMonth() + 1, 0)), 7)
    load({ from, to }, true)
  }, [load])

  const trips = useMemo(() => [...tripsById.values()].sort((a, b) => a.start_date.localeCompare(b.start_date)), [tripsById])
  const todayTrips = trips.filter((t) => tripOn(t, today) && t.status !== 'returned')

  function switchDriver() {
    localStorage.removeItem(STORAGE_KEY)
    navigate('/driver')
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 via-white to-brand-50 dark:from-gray-950 dark:via-gray-900 dark:to-brand-950">
      <header className="relative z-10 flex items-center justify-between px-6 lg:px-12 h-20">
        <Link to="/" className="flex items-center gap-3">
          <Logo size={44} />
          <span className="hidden sm:inline font-heading font-bold text-lg text-gray-900 dark:text-white">วิทยาลัยเทคนิคบุรีรัมย์</span>
        </Link>
        <Link to="/" className="h-10 px-3 -mr-3 rounded-xl text-sm text-gray-500 hover:text-brand-600 dark:text-gray-400 inline-flex items-center gap-1">
          <i aria-hidden="true" className="bx bx-left-arrow-alt text-lg"></i><span>หน้าจองรถ</span>
        </Link>
      </header>

      <main className="relative px-4 sm:px-6 lg:px-12 pb-20 flex-1">
        <div className="max-w-3xl mx-auto w-full">
          <div className="text-center pt-1 pb-6">
            <h1 className="grid justify-items-center font-bold font-heading mb-2 select-none" style={{ paddingBottom: 'clamp(1rem, 2.4vw, 1.6rem)' }}>
              <span className="col-start-1 row-start-1 self-end relative z-10 motion-safe:animate-title-front-in translate-y-[0.85em] sm:translate-y-[0.62em] text-gray-900 dark:text-white leading-tight whitespace-nowrap"
                style={{ fontSize: 'clamp(1.5rem, 4.4vw, 2.75rem)' }}>
                ตารางงานคนขับรถ
              </span>
              <span className="col-start-1 row-start-1 self-start motion-safe:animate-title-back-in bg-gradient-to-b from-brand-500/55 via-indigo-500/25 to-transparent dark:from-brand-400/80 dark:via-indigo-400/35 bg-clip-text text-transparent leading-[1.15] whitespace-nowrap tracking-tight"
                style={{ fontSize: 'clamp(2rem, 8vw, 5rem)' }}>
                {' '}พนักงานขับรถ
              </span>
            </h1>
          </div>

          {!id ? (
            <DriverPicker drivers={drivers} loading={driversLoading} onPick={(driverId) => navigate(`/driver/${driverId}`)} />
          ) : error && !driver ? (
            <div className="text-center py-16">
              <p className="text-gray-500 mb-4">{error}</p>
              <button onClick={switchDriver} className="btn-primary">เลือกชื่อใหม่</button>
            </div>
          ) : (
            <>
              {/* Who + today at a glance */}
              <div className="rounded-3xl bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700 shadow-xl shadow-gray-200/50 dark:shadow-black/30 p-4 sm:p-5 mb-5">
                <div className="flex items-center gap-4">
                  {driver ? <Avatar name={driver.name} size="w-14 h-14 text-lg" /> : <Skeleton className="w-14 h-14 rounded-2xl" />}
                  <div className="min-w-0 flex-1">
                    {driver ? (
                      <>
                        <div className="font-bold font-heading text-lg text-gray-900 dark:text-white truncate">{driver.name}</div>
                        <div className="text-xs text-gray-400">{thaiLong(today)}</div>
                      </>
                    ) : <Skeleton className="h-5 w-40" />}
                  </div>
                  <button onClick={switchDriver} aria-label="เปลี่ยนคน (เลือกคนขับใหม่)" className="h-10 min-w-[40px] px-2 -mr-2 rounded-xl text-xs text-gray-400 hover:text-brand-600 hover:bg-gray-50 dark:hover:bg-gray-700/60 inline-flex items-center justify-center gap-1 shrink-0">
                    <i aria-hidden="true" className="bx bx-transfer-alt text-base"></i><span className="hidden sm:inline">เปลี่ยนคน</span>
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className={`rounded-2xl px-4 py-3 ${todayTrips.length ? 'bg-brand-600 text-white' : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'}`}>
                    <div className={`text-[11px] ${todayTrips.length ? 'text-white' : ''}`}>วันนี้</div>
                    <div className="font-bold font-heading text-lg">{loading && !driver ? '...' : todayTrips.length ? `มีงาน ${todayTrips.length} งาน` : 'ว่าง'}</div>
                  </div>
                  <button onClick={() => setLineOpen(true)}
                    className={`text-left rounded-2xl px-4 py-3 border transition-colors ${driver?.line_linked ? 'border-[#06C755]/30 bg-[#06C755]/5' : 'border-dashed border-gray-300 dark:border-gray-600 hover:border-[#06C755]'}`}>
                    <div className="text-[11px] text-gray-400 flex items-center gap-1"><LineIcon className="w-3.5 h-3.5 text-[#06C755]" />แจ้งเตือน LINE</div>
                    <div className={`font-bold font-heading text-lg ${driver?.line_linked ? 'text-[#06C755]' : 'text-gray-700 dark:text-gray-200'}`}>
                      {driver?.line_linked ? 'เชื่อมต่อแล้ว' : 'เชื่อมต่อ LINE'}
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex justify-center gap-2 mb-5">
                {VIEWS.map((v) => (
                  <button key={v.key} onClick={() => setView(v.key)}
                    className={`h-10 px-4 sm:px-5 inline-flex items-center gap-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                      view === v.key
                        ? 'text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/50 border border-brand-200 dark:border-brand-800'
                        : 'text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'
                    }`}>
                    <i aria-hidden="true" className={`bx ${v.icon} text-base`}></i>{v.label}
                  </button>
                ))}
              </div>

              {loading && !trips.length && !driver ? (
                <div className="space-y-3"><Skeleton className="h-20 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></div>
              ) : view === 'today' ? (
                <TodayView trips={trips} today={today} onOpen={setOpenTrip} />
              ) : view === 'list' ? (
                <ListView trips={trips} today={today} onOpen={setOpenTrip} />
              ) : (
                <CalendarView trips={trips} onOpen={setOpenTrip} onMonthChange={onMonthChange} />
              )}
            </>
          )}
        </div>
      </main>

      <TripDetailModal trip={openTrip} onClose={() => setOpenTrip(null)} />
      {lineOpen && driver && (
        <LineLinkModal driver={driver} line={line} onClose={() => setLineOpen(false)} onLinked={() => load({ from: today, to: today }, true)} />
      )}
    </div>
  )
}
