import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { apiGet, invalidateApi } from '../lib/apiCache'
import { signStatus, formatThaiDate } from '../lib/constants'
import { SkeletonStats, SkeletonPanel } from '../components/ui/skeleton'
import SignProgress from '../components/SignProgress'
import { Legend, MonthlyChart } from '../components/ReportCharts'
import SignDocumentModal from '../components/SignDocumentModal'
import BookingDetailModal from '../components/BookingDetailModal'
import { Toast } from '../components/ui/toast'
import { useStageTitle } from '../lib/docSettings'

// แดชบอร์ด — what needs attention today. Long-range statistics live on the
// รายงานสถิติ page; this page is operational:
//   • คำขอจอง — requests still in progress (admin: all of them, read-only;
//     staff: their signing queue, signed right here via SignDocumentModal)
//   • สถานะรถวันนี้, กำหนดการ 7 วันข้างหน้า, a 6-month trend
// Data: /api/admin/dashboard (compact, no signature images) + the bookings list.

const FLEET_STATE = {
  available: { label: 'ว่าง', icon: 'bx-check-circle', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  in_use: { label: 'กำลังใช้งาน', icon: 'bx-car', className: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  requested: { label: 'มีคำขอรออนุมัติ', icon: 'bx-time-five', className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  maintenance: { label: 'ซ่อมบำรุง', icon: 'bx-wrench', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
  retired: { label: 'ปลดระวาง', icon: 'bx-block', className: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
}

const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']

function longThaiDate(d = new Date()) {
  return `วัน${THAI_DAYS[d.getDay()]}ที่ ${d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}`
}

function relativeDay(ymd, today) {
  const diff = Math.round((new Date(`${ymd}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000)
  if (diff === 1) return 'พรุ่งนี้'
  if (diff === 2) return 'มะรืนนี้'
  return `อีก ${diff} วัน`
}

function ScrollFade({ maxHeight, className, children }) {
  const ref = useRef(null)
  const [maskStyle, setMaskStyle] = useState('')

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function updateMask() {
      const { scrollTop, scrollHeight, clientHeight } = el
      if (scrollHeight <= clientHeight) {
        setMaskStyle('')
        return
      }
      const atTop = scrollTop <= 2
      const atBottom = scrollTop + clientHeight >= scrollHeight - 2
      if (atTop && atBottom) {
        setMaskStyle('')
      } else if (atTop) {
        setMaskStyle('linear-gradient(to bottom, black 88%, transparent 100%)')
      } else if (atBottom) {
        setMaskStyle('linear-gradient(to bottom, transparent 0%, black 12%)')
      } else {
        setMaskStyle('linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)')
      }
    }

    updateMask()
    el.addEventListener('scroll', updateMask)
    const ro = new ResizeObserver(updateMask)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', updateMask)
      ro.disconnect()
    }
  }, [])

  const style = { maxHeight, overflowY: 'auto' }
  if (maskStyle) {
    style.maskImage = maskStyle
    style.WebkitMaskImage = maskStyle
  }

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  )
}

const TILE_TONES = {
  brand: 'bg-brand-100 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400',
  emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
}

function Tile({ icon, tone, label, value, sub, to }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${TILE_TONES[tone]}`}>
          <i className={`bx ${icon} text-xl`}></i>
        </div>
      </div>
      <p className="text-2xl sm:text-3xl font-bold font-heading text-gray-900 dark:text-white tabular-nums mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{sub}</p>}
    </>
  )
  return to
    ? <Link to={to} className="card-hover p-5 block min-w-0">{body}</Link>
    : <div className="card p-5 min-w-0">{body}</div>
}

function CardHeader({ title, badge, link, linkLabel = 'ดูทั้งหมด' }) {
  return (
    <div className="flex items-center justify-between mb-4 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <h3 className="font-heading font-semibold text-gray-900 dark:text-white truncate">{title}</h3>
        {badge > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-500 text-white dark:bg-red-600">{badge}</span>
        )}
      </div>
      {link && <Link to={link} className="text-xs text-brand-600 dark:text-brand-400 hover:underline shrink-0">{linkLabel}</Link>}
    </div>
  )
}

export default function Dashboard() {
  const { user, isAdmin, canManageBookings, authHeaders, fetchNotificationCount, refreshSignal } = useApp()
  const [loading, setLoading] = useState(true)
  const [dash, setDash] = useState(null)
  const [requests, setRequests] = useState([])
  const [requestCount, setRequestCount] = useState(0)
  const [leavingBookings, setLeavingBookings] = useState([])
  const [signTarget, setSignTarget] = useState(null)
  // Clicking a request card (anywhere but its button) opens the full document —
  // PDF preview and signing timeline — like a row on คำขอจอง.
  const [detailTarget, setDetailTarget] = useState(null)
  const [toast, setToast] = useState(null)
  const stageTitle = useStageTitle()

  // Staff see their signing queue (/api/signing/queue — each entry carries the
  // stage *they* sign, which the sign modal needs); an admin never signs, so
  // they see every request still in progress — the same bucket as the admin's
  // "รอดำเนินการ" filter on คำขอจอง.
  const requestFilter = canManageBookings ? 'queue' : 'awaiting_signature'

  const prevRefreshRef = useRef(0)

  useEffect(() => {
    // The first run may reuse a still-fresh cache entry; a realtime event
    // means the data actually changed, so that one must hit the network.
    const force = prevRefreshRef.current !== refreshSignal
    prevRefreshRef.current = refreshSignal
    fetchData(force)
  }, [refreshSignal, requestFilter])

  async function fetchData(force = false) {
    if (!isAdmin) { setLoading(false); return }
    try {
      const headers = authHeaders()
      const [dashRes, reqRes] = await Promise.all([
        apiGet('/api/admin/dashboard', { headers, force }),
        requestFilter === 'queue'
          ? apiGet('/api/signing/queue', { headers, force })
          : apiGet(`/api/admin/bookings?status=${requestFilter}&page=1&limit=6`, { headers, force }),
      ])
      if (dashRes.ok) setDash(dashRes.data)
      if (reqRes.ok) {
        const all = reqRes.data.bookings || []
        const newList = all.slice(0, 6)
        setRequestCount(reqRes.data.counts?.[requestFilter] ?? all.length)
        setRequests(prev => {
          const leaving = prev.filter(b => !newList.some(n => n.id === b.id))
          if (leaving.length > 0) {
            setLeavingBookings(leaving)
            setTimeout(() => setLeavingBookings([]), 300)
          }
          return newList
        })
      }
    } catch (e) {
      console.error('Dashboard fetch error:', e)
    } finally {
      setLoading(false)
    }
  }

  // After signing (or declining) from the dashboard the document leaves this
  // signer's queue — refresh and confirm.
  function handleSigned(message) {
    setSignTarget(null)
    invalidateApi()
    fetchData(true)
    fetchNotificationCount()
    setToast({ type: 'success', message })
  }

  if (loading) {
    return (
      <div className="animate-fade-in flex flex-col flex-1 min-h-0 space-y-6">
        <SkeletonPanel lines={1} />
        <SkeletonStats count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
          <SkeletonPanel lines={4} className="lg:col-span-2" />
          <SkeletonPanel lines={4} className="lg:col-span-3" />
        </div>
      </div>
    )
  }

  const fleet = dash?.fleet || []
  const activeFleet = fleet.filter(c => c.state !== 'retired')
  const freeCount = fleet.filter(c => c.state === 'available').length
  const maintenanceCount = fleet.filter(c => c.state === 'maintenance').length
  const inUse = fleet.filter(c => c.state === 'in_use')
  const latestReturn = inUse.map(c => c.trip.end_date).sort().pop()
  const nr = dash?.new_requests || { this_month: 0, last_month: 0 }
  const monthDiff = nr.this_month - nr.last_month
  const kpis = dash?.trend?.kpis
  const today = dash?.today

  // Upcoming trips grouped by start date for the 7-day agenda.
  const agenda = []
  for (const trip of dash?.upcoming || []) {
    const group = agenda.find(g => g.date === trip.start_date)
    if (group) group.trips.push(trip)
    else agenda.push({ date: trip.start_date, trips: [trip] })
  }

  const renderRequest = (b, i, leaving = false) => {
    const st = signStatus(b)
    return (
      <div key={b.id}
        role="button" tabIndex={leaving ? -1 : 0} aria-label={`ดูเอกสารคำขอของ ${b.user_name}`}
        onClick={() => !leaving && setDetailTarget(b)}
        onKeyDown={e => { if (!leaving && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setDetailTarget(b) } }}
        className={`p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 cursor-pointer hover:border-brand-200 dark:hover:border-brand-800 hover:bg-white dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 transition-colors ${leaving ? 'transition-all duration-300 opacity-0 scale-95 pointer-events-none' : 'motion-safe:animate-slide-up-fade'}`}
        style={leaving ? undefined : { animationDelay: `${i * 50}ms` }}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-brand-50 dark:bg-brand-900/30 border border-brand-100 dark:border-brand-800/60 flex items-center justify-center shrink-0">
              <i className="bx bx-user text-sm text-brand-600 dark:text-brand-300"></i>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{b.user_name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{b.user_position || 'ไม่ระบุตำแหน่ง'}</p>
            </div>
          </div>
          <span className={st.className + ' shrink-0'}>{st.label}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1.5 min-w-0"><i className="bx bx-car text-sm shrink-0 text-brand-500 dark:text-brand-400"></i><span className="truncate">{b.license_plate} · {b.brand} {b.model}</span></span>
          <span className="flex items-center gap-1.5 min-w-0"><i className="bx bx-calendar text-sm shrink-0"></i><span className="truncate">{formatThaiDate(b.start_date)} → {formatThaiDate(b.end_date)}</span></span>
        </div>
        {b.doc_number && <SignProgress booking={b} />}
        {/* Staff sign their stage right here (an admin sees the list read-only).
            The sign modal covers approve and — at the two decision stages —
            "ไม่อนุญาต", so there are no separate approve/reject buttons. */}
        {canManageBookings && !leaving && (
          <div className="mt-3 flex items-center gap-3">
            {b.sign_stage && (
              <span className="flex-1 min-w-0 text-[11px] text-gray-500 dark:text-gray-400 truncate">
                ขั้นของคุณ: <span className="font-semibold text-gray-700 dark:text-gray-200">{stageTitle(b.sign_stage)}</span>
              </span>
            )}
            <button type="button" onClick={e => { e.stopPropagation(); setSignTarget(b) }}
              className={`${b.sign_stage ? 'shrink-0' : 'flex-1'} h-9 px-4 inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 shadow-sm shadow-brand-500/20 transition-colors`}>
              <i className="bx bx-pen text-sm"></i> เซ็นเอกสาร
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="animate-fade-in flex flex-col flex-1 min-h-0 space-y-6 pb-6">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-500 dark:text-gray-400">{longThaiDate()}</p>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white font-heading mt-0.5 truncate">
            สวัสดี{user?.name ? ` ${user.name}` : ''}
          </h2>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link to="/app/bookings" className="h-10 px-4 inline-flex items-center gap-2 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 shadow-md shadow-brand-500/20 transition-colors">
            <i className="bx bxs-check-circle text-base"></i> คำขอจอง
          </Link>
          <Link to="/app/reports" className="h-10 px-4 inline-flex items-center gap-2 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <i className="bx bx-bar-chart-alt-2 text-base"></i> รายงาน
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        <Tile icon="bx-check-circle" tone="emerald" label="รถว่างวันนี้" value={`${freeCount}/${activeFleet.length}`}
          sub={maintenanceCount ? `${maintenanceCount} คันซ่อมบำรุง` : 'ไม่มีรถซ่อมบำรุง'} to="/app/settings/cars" />
        <Tile icon="bx-car" tone="blue" label="กำลังใช้งานวันนี้" value={inUse.length}
          sub={inUse.length ? `คืนช้าสุด ${formatThaiDate(latestReturn)}` : 'ไม่มีรถออกใช้งาน'} />
        <Tile icon="bx-time-five" tone="amber" label={canManageBookings ? 'รอคุณเซ็น' : 'คำขอรอดำเนินการ'} value={requestCount}
          sub={canManageBookings ? 'เอกสารในขั้นของคุณ' : 'ยังเซ็นไม่ครบทุกขั้น'} to="/app/bookings" />
        <Tile icon="bx-file" tone="brand" label="คำขอใหม่เดือนนี้" value={nr.this_month}
          sub={monthDiff === 0 ? `เท่ากับเดือนก่อน (${nr.last_month})` : `${monthDiff > 0 ? '▲' : '▼'} ${Math.abs(monthDiff)} จากเดือนก่อน (${nr.last_month})`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
        {/* คำขอจอง */}
        <section className="card p-6 flex flex-col overflow-hidden lg:col-span-2">
          <CardHeader title="คำขอจอง" badge={requestCount} link="/app/bookings" />
          {requests.length === 0 && leavingBookings.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 py-8">
              <i className="bx bxs-check-circle text-3xl opacity-40 mb-2 block"></i>
              <p className="text-sm">{canManageBookings ? 'ไม่มีเอกสารรอคุณเซ็น' : 'ไม่มีคำขอที่รอดำเนินการ'}</p>
            </div>
          ) : (
            <ScrollFade maxHeight="290px" className="space-y-2.5 scrollbar-none">
              {leavingBookings.map((b, i) => renderRequest(b, i, true))}
              {requests.map((b, i) => renderRequest(b, i))}
            </ScrollFade>
          )}
          {requestCount > requests.length && (
            <Link to="/app/bookings" className="mt-3 text-center text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
              และอีก {requestCount - requests.length} รายการ
            </Link>
          )}
        </section>

        {/* Fleet today */}
        <section className="card p-6 flex flex-col overflow-hidden lg:col-span-3">
          <CardHeader title="สถานะรถวันนี้" link="/app/settings/cars" linkLabel="จัดการรถ" />
          {fleet.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">ยังไม่มีรถในระบบ</div>
          ) : (
            <ScrollFade maxHeight="290px" className="divide-y divide-gray-100 dark:divide-gray-700/50 scrollbar-none">
              {fleet.map(c => {
                const st = FLEET_STATE[c.state]
                return (
                  <div key={c.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                    <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
                      <i className="bx bx-car text-lg text-brand-600 dark:text-brand-300"></i>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.license_plate}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {c.brand} {c.model}
                        {c.trip && <> · {c.trip.user_name}{c.trip.destination ? ` → ${c.trip.destination}` : ''} · ถึง {formatThaiDate(c.trip.end_date)}</>}
                      </p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${st.className}`}>
                      <i className={`bx ${st.icon} text-sm`}></i>{st.label}
                    </span>
                  </div>
                )
              })}
            </ScrollFade>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
        {/* Next 7 days */}
        <section className="card p-6 lg:col-span-3">
          <CardHeader title="กำหนดการ 7 วันข้างหน้า" link="/app/bookings" linkLabel="ดูปฏิทิน" />
          {agenda.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">ไม่มีการเดินทางใน 7 วันข้างหน้า</div>
          ) : (
            <ol className="space-y-4">
              {agenda.map(g => (
                <li key={g.date} className="flex gap-4">
                  <div className="w-16 shrink-0 text-center">
                    <p className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">{relativeDay(g.date, today)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatThaiDate(g.date)}</p>
                  </div>
                  <div className="flex-1 min-w-0 space-y-2 border-l-2 border-brand-100 dark:border-brand-900/50 pl-4">
                    {g.trips.map(t => (
                      <div key={t.id} className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {t.license_plate} <span className="text-gray-400 font-normal">· {t.brand} {t.model}</span>
                          </p>
                          {t.outcome !== 'approved' && (
                            <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">รอดำเนินการ</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {t.user_name}{t.destination ? ` → ${t.destination}` : ''}
                          {t.end_date !== t.start_date ? ` · ถึง ${formatThaiDate(t.end_date)}` : ''}
                          {t.driver ? ` · ผู้ขับ ${t.driver}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* 6-month trend */}
        <section className="card p-6 lg:col-span-2 flex flex-col min-w-0">
          <CardHeader title="แนวโน้ม 6 เดือน" link="/app/reports" linkLabel="ดูรายงานเต็ม" />
          <div className="mb-3"><Legend /></div>
          <MonthlyChart months={dash?.trend?.by_month || []} height={140} />
          {kpis && (
            <dl className="grid grid-cols-2 gap-3 mt-5">
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 px-3 py-2.5">
                <dt className="text-xs text-gray-500 dark:text-gray-400">อัตราการอนุมัติ</dt>
                <dd className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{kpis.approval_rate === null ? '—' : `${kpis.approval_rate}%`}</dd>
              </div>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 px-3 py-2.5">
                <dt className="text-xs text-gray-500 dark:text-gray-400">อัตราการใช้รถ</dt>
                <dd className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{kpis.utilization === null ? '—' : `${kpis.utilization}%`}</dd>
              </div>
            </dl>
          )}
        </section>
      </div>

      <SignDocumentModal booking={signTarget} onClose={() => setSignTarget(null)} onSigned={handleSigned} />
      {detailTarget && (
        <BookingDetailModal
          booking={detailTarget}
          publicMode={false}
          // Staff see their own queue here, so every card is theirs to sign;
          // the popup's "เซ็นเอกสาร" hands over to the sign modal. An admin
          // only views.
          canManageBookings={false}
          canSign={canManageBookings}
          onAdminApprove={() => { setSignTarget(detailTarget); setDetailTarget(null) }}
          onClose={() => setDetailTarget(null)}
          onActionDone={() => { invalidateApi(); fetchData(true) }}
          setToast={(t) => setToast({ type: t.type, message: t.message || t.submessage })}
        />
      )}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}
