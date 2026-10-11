import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { apiGet } from '../../lib/apiCache'
import { downloadBlob, downloadCsv } from '../../lib/csv'
import { formatThaiDate } from '../../lib/constants'
import { Skeleton, SkeletonStats, SkeletonPanel } from '../../components/ui/skeleton'
import { Empty, Legend, OutcomeBar, MonthlyChart } from '../../components/ReportCharts'
import { OUTCOMES, monthLabel } from '../../lib/reportFormat'

// รายงานสถิติ — everything is scoped to a date range on the date of use
// (GET /api/admin/reports/summary, api/lib/reports.cjs). Every table can be
// exported as CSV, and the full request list is exported server-side
// (GET /api/admin/reports/export). Shared charts: components/ReportCharts.jsx.

function ymd(d) { return d.toLocaleDateString('en-CA') }
function shiftDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d }

// Thai fiscal year runs 1 Oct – 30 Sep.
function fiscalStart(date) {
  const y = date.getMonth() >= 9 ? date.getFullYear() : date.getFullYear() - 1
  return new Date(y, 9, 1)
}

const PRESETS = [
  { key: '30d', label: '30 วัน', range: (t) => [ymd(shiftDays(t, -29)), ymd(t)] },
  { key: '90d', label: '90 วัน', range: (t) => [ymd(shiftDays(t, -89)), ymd(t)] },
  { key: '12m', label: '12 เดือน', range: (t) => { const f = new Date(t); f.setFullYear(f.getFullYear() - 1); return [ymd(shiftDays(f, 1)), ymd(t)] } },
  { key: 'fy', label: 'ปีงบประมาณนี้', range: (t) => [ymd(fiscalStart(t)), ymd(t)] },
  { key: 'prev_fy', label: 'ปีงบประมาณก่อน', range: (t) => { const s = fiscalStart(t); const p = new Date(s.getFullYear() - 1, 9, 1); return [ymd(p), ymd(shiftDays(s, -1))] } },
  { key: 'custom', label: 'กำหนดเอง' },
]

function fmtHours(h) {
  if (h === null || h === undefined) return '—'
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} นาที`
  if (h < 48) return `${Math.round(h * 10) / 10} ชม.`
  return `${Math.round((h / 24) * 10) / 10} วัน`
}

const fmtPct = (v) => (v === null || v === undefined ? '—' : `${v}%`)
const fmtNum = (v) => (v ?? 0).toLocaleString('th-TH')

// Change vs the previous period: arrow + figure + words (never colour alone).
// Green/red follow whether the move is desirable — `invert` for metrics where
// lower is better (approval time). `unit: 'pt'` → percentage points.
function Delta({ now, before, unit = '%', invert = false }) {
  if (now === null || now === undefined || before === null || before === undefined) {
    return <span className="text-gray-400 dark:text-gray-500">ไม่มีข้อมูลช่วงก่อนให้เทียบ</span>
  }
  let diff
  if (unit === 'pt') diff = Math.round((now - before) * 10) / 10
  else if (before === 0) return <span className="text-gray-400 dark:text-gray-500">{now > 0 ? 'ช่วงก่อนไม่มีข้อมูล' : 'เท่าเดิม'}</span>
  else diff = Math.round(((now - before) / before) * 1000) / 10
  if (diff === 0) return <span className="text-gray-500 dark:text-gray-400">เท่ากับช่วงก่อน</span>
  const up = diff > 0
  const good = invert ? !up : up
  return (
    <span className={`inline-flex items-center gap-0.5 ${good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
      <i className={`bx ${up ? 'bx-up-arrow-alt' : 'bx-down-arrow-alt'} text-sm`}></i>
      {Math.abs(diff)}{unit === 'pt' ? ' จุด' : '%'}
      <span className="text-gray-400 dark:text-gray-500 ml-1">จากช่วงก่อน</span>
    </span>
  )
}

function Kpi({ icon, label, value, sub, delta }) {
  return (
    <div className="card p-4 sm:p-5 flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
        <i className={`bx ${icon} text-base text-brand-500`}></i>
        <span className="truncate">{label}</span>
      </div>
      <p className="text-2xl sm:text-3xl font-bold font-heading text-gray-900 dark:text-white tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
      {delta && <p className="text-[11px] mt-0.5">{delta}</p>}
    </div>
  )
}

function Panel({ title, description, onExport, className = '', children }) {
  return (
    <section className={`card p-5 sm:p-6 min-w-0 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="font-heading font-semibold text-gray-900 dark:text-white">{title}</h3>
          {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
        </div>
        {onExport && (
          <button type="button" onClick={onExport} title="ส่งออกตารางนี้เป็น CSV"
            className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <i className="bx bx-download text-sm"></i> CSV
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

// Horizontal bars, one series → one hue (brand). Value text in ink, not colour.
function BarList({ items, valueOf, labelOf, format = fmtNum, sublabelOf, labelWidth = '12rem' }) {
  const max = Math.max(1, ...items.map(valueOf))
  return (
    <ul className="space-y-2.5">
      {items.map((it, i) => (
        <li key={i} className="grid items-center gap-3" style={{ gridTemplateColumns: `minmax(0,${labelWidth}) 1fr auto` }}
          title={`${labelOf(it)}: ${format(valueOf(it))}`}>
          <span className="min-w-0">
            <span className="block text-sm text-gray-700 dark:text-gray-300 truncate">{labelOf(it)}</span>
            {sublabelOf && <span className="block text-[11px] text-gray-400 dark:text-gray-500 truncate">{sublabelOf(it)}</span>}
          </span>
          <span className="h-2.5 rounded-r-[4px] bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <span className="block h-full rounded-r-[4px] bg-brand-500 dark:bg-brand-400" style={{ width: `${(valueOf(it) / max) * 100}%` }} />
          </span>
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 tabular-nums text-right min-w-[3rem]">{format(valueOf(it))}</span>
        </li>
      ))}
    </ul>
  )
}

function UtilMeter({ value }) {
  const v = Math.min(100, value || 0)
  return (
    <div className="flex items-center gap-2 min-w-[8rem]">
      <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className="h-full rounded-full bg-brand-500 dark:bg-brand-400" style={{ width: `${v}%` }} />
      </div>
      <span className="w-12 text-right text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-200">{fmtPct(value)}</span>
    </div>
  )
}

function ExportMenu({ onExportAll, items }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
        className="h-10 px-4 inline-flex items-center gap-2 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 shadow-md shadow-brand-500/20 transition-colors">
        <i className="bx bx-export text-base"></i> ส่งออกข้อมูล
        <i className={`bx bx-chevron-down text-base transition-transform ${open ? 'rotate-180' : ''}`}></i>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-72 z-30 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl p-2 motion-safe:animate-scale-in">
          <button role="menuitem" type="button" onClick={() => { setOpen(false); onExportAll() }}
            className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-brand-50 dark:hover:bg-brand-900/20 flex gap-3">
            <i className="bx bx-spreadsheet text-xl text-brand-600 dark:text-brand-400 mt-0.5"></i>
            <span>
              <span className="block text-sm font-semibold text-gray-900 dark:text-white">รายการคำขอทั้งหมด</span>
              <span className="block text-[11px] text-gray-500 dark:text-gray-400">ทุกคำขอในช่วงเวลานี้ พร้อมรายละเอียด (CSV)</span>
            </span>
          </button>
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">ตารางสรุป (CSV)</p>
          {items.map(it => (
            <button key={it.label} role="menuitem" type="button" onClick={() => { setOpen(false); it.run() }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60 flex items-center gap-2.5">
              <i className={`bx ${it.icon} text-base text-gray-400`}></i>{it.label}
            </button>
          ))}
          <p className="px-3 pt-2 text-[10px] text-gray-400">ไฟล์ CSV เปิดด้วย Excel หรือ Google Sheets ได้ทันที</p>
        </div>
      )}
    </div>
  )
}

export default function Reports() {
  const { authHeaders } = useApp()
  const [preset, setPreset] = useState('12m')
  const [custom, setCustom] = useState(() => PRESETS[2].range(new Date()))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  const [from, to] = useMemo(() => {
    if (preset === 'custom') return custom
    return PRESETS.find(p => p.key === preset).range(new Date())
  }, [preset, custom])
  const customValid = from && to && from <= to

  useEffect(() => {
    if (!customValid) return
    let alive = true
    setLoading(true)
    setError('')
    apiGet(`/api/admin/reports/summary?from=${from}&to=${to}`, { headers: authHeaders() })
      .then(res => {
        if (!alive) return
        if (res.ok) setData(res.data)
        else setError(res.data?.error || 'โหลดรายงานไม่สำเร็จ')
      })
      .catch(() => alive && setError('โหลดรายงานไม่สำเร็จ'))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [from, to, customValid, authHeaders])

  const suffix = `${from}_${to}`
  async function exportAll() {
    setExporting(true)
    try {
      const res = await fetch(`/api/admin/reports/export?from=${from}&to=${to}`, { headers: authHeaders() })
      if (!res.ok) throw new Error()
      downloadBlob(await res.blob(), `รายการคำขอยืม_${suffix}.csv`)
    } catch {
      setError('ส่งออกข้อมูลไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setExporting(false)
    }
  }

  const exports = data ? {
    months: () => downloadCsv(data.by_month.map(m => ({
      'เดือน': monthLabel(m.month), 'คำขอทั้งหมด': m.total,
      ...Object.fromEntries(OUTCOMES.map(o => [o.label, m[o.key]])),
    })), `สรุปรายเดือน_${suffix}.csv`),
    cars: () => downloadCsv(data.by_car.map(c => ({
      'ทะเบียน': c.license_plate, 'ยานพาหนะ': `${c.brand} ${c.model}`, 'ประเภท': c.type,
      'คำขอ': c.requests, 'เที่ยวที่อนุมัติ': c.trips, 'วันที่ใช้งาน': c.car_days, 'อัตราการใช้ (%)': c.utilization ?? '',
    })), `สรุปตามรถ_${suffix}.csv`),
    borrowers: () => downloadCsv(data.top_borrowers.map(b => ({
      'ผู้ยืม': b.name, 'ตำแหน่ง': b.position, 'คำขอ': b.requests, 'อนุมัติ': b.approved, 'วันที่ใช้รถ': b.car_days,
    })), `ผู้ยืม_${suffix}.csv`),
    drivers: () => downloadCsv(data.drivers.map(d => ({ 'ผู้ขับ': d.name, 'จำนวนเที่ยว': d.trips, 'วันที่ขับ': d.car_days })), `ผู้ขับ_${suffix}.csv`),
    destinations: () => downloadCsv(data.destinations.map(d => ({ 'จังหวัด': d.province, 'คำขอ': d.requests })), `ปลายทาง_${suffix}.csv`),
    stages: () => downloadCsv(data.stage_times.map(s => ({ 'ขั้นตอน': s.title, 'จำนวนเอกสาร': s.samples, 'เวลาเฉลี่ย (ชั่วโมง)': s.avg_hours ?? '' })), `เวลาเซ็นแต่ละขั้น_${suffix}.csv`),
  } : {}

  const k = data?.kpis
  // An empty previous period has nothing meaningful to compare against — a
  // 0% utilisation there would turn every figure into a misleading "+N".
  const p = data?.previous?.requests ? data.previous : {}

  return (
    <div className="animate-fade-in flex flex-col flex-1 min-h-0">
      {/* Header + filters */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white font-heading">รายงานสถิติ</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {customValid ? <>ช่วงวันที่ใช้รถ {formatThaiDate(from)} – {formatThaiDate(to)}{data && <> · {data.range.days} วัน</>}</> : 'เลือกช่วงวันที่'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {exporting && <span className="text-xs text-gray-500 dark:text-gray-400">กำลังเตรียมไฟล์…</span>}
          <ExportMenu onExportAll={exportAll} items={data ? [
            { label: 'สรุปรายเดือน', icon: 'bx-bar-chart-alt-2', run: exports.months },
            { label: 'สรุปตามรถ', icon: 'bx-car', run: exports.cars },
            { label: 'ผู้ยืมที่ใช้บ่อย', icon: 'bx-user', run: exports.borrowers },
            { label: 'ผู้ขับ', icon: 'bx-id-card', run: exports.drivers },
            { label: 'ปลายทาง', icon: 'bx-map', run: exports.destinations },
            { label: 'เวลาเซ็นแต่ละขั้น', icon: 'bx-time-five', run: exports.stages },
          ] : []} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6" role="group" aria-label="ช่วงเวลารายงาน">
        {PRESETS.map(pr => (
          <button key={pr.key} type="button" onClick={() => setPreset(pr.key)} aria-pressed={preset === pr.key}
            className={`h-9 px-3.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${preset === pr.key
              ? 'bg-brand-600 text-white shadow-md shadow-brand-500/20'
              : 'bg-white dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:text-gray-700 dark:hover:text-gray-200'}`}>
            {pr.label}
          </button>
        ))}
        {preset === 'custom' && (
          <div className="flex items-center gap-2 ml-1">
            <input type="date" value={custom[0]} max={custom[1]} aria-label="ตั้งแต่วันที่"
              onChange={e => setCustom(c => [e.target.value, c[1]])}
              className="h-9 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100" />
            <span className="text-gray-400">–</span>
            <input type="date" value={custom[1]} min={custom[0]} aria-label="ถึงวันที่"
              onChange={e => setCustom(c => [c[0], e.target.value])}
              className="h-9 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100" />
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-sm text-red-600 dark:text-red-300">{error}</div>
      )}

      {loading && !data ? (
        <>
          <SkeletonStats count={5} className="mb-6" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SkeletonPanel lines={6} className="lg:col-span-2" />
            <SkeletonPanel lines={5} />
            <SkeletonPanel lines={5} />
          </div>
        </>
      ) : data && (
        <div className={`space-y-6 pb-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
            <Kpi icon="bx-file" label="คำขอทั้งหมด" value={fmtNum(k.requests)}
              sub={`ผู้ยืม ${fmtNum(k.borrowers)} คน`} delta={<Delta now={k.requests} before={p.requests} />} />
            <Kpi icon="bx-check-circle" label="อัตราการอนุมัติ" value={fmtPct(k.approval_rate)}
              sub="จากคำขอที่ตัดสินแล้ว" delta={<Delta now={k.approval_rate} before={p.approval_rate} unit="pt" />} />
            <Kpi icon="bx-calendar" label="วันใช้งานรถ" value={fmtNum(k.car_days)}
              sub="รวมทุกคัน (คัน-วัน)" delta={<Delta now={k.car_days} before={p.car_days} />} />
            <Kpi icon="bx-tachometer" label="อัตราการใช้รถ" value={fmtPct(k.utilization)}
              sub="ของวันที่รถพร้อมใช้ทั้งหมด" delta={<Delta now={k.utilization} before={p.utilization} unit="pt" />} />
            <Kpi icon="bx-time-five" label="เวลาอนุมัติเฉลี่ย" value={fmtHours(k.avg_turnaround_hours)}
              sub="ส่งคำขอ → ผู้อำนวยการเซ็น" delta={<Delta now={k.avg_turnaround_hours} before={p.avg_turnaround_hours} invert />} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Panel title="คำขอรายเดือน" description="แยกตามผลการพิจารณา · นับตามเดือนที่เริ่มใช้รถ"
              onExport={exports.months} className="xl:col-span-2">
              <div className="mb-4"><Legend /></div>
              <MonthlyChart months={data.by_month} />
            </Panel>
            <Panel title="ผลการพิจารณา" description="สัดส่วนคำขอทั้งหมดในช่วงนี้">
              <OutcomeBar kpis={k} />
            </Panel>
          </div>

          <Panel title="การใช้งานรถแต่ละคัน" description="อัตราการใช้ = วันที่ถูกใช้ ÷ จำนวนวันในช่วงรายงาน" onExport={exports.cars}>
            {data.by_car.length === 0 ? <Empty text="ยังไม่มีรถในระบบ" /> : (
              <div className="overflow-x-auto -mx-5 sm:-mx-6">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700/60">
                      <th className="font-medium px-5 sm:px-6 py-2">ยานพาหนะ</th>
                      <th className="font-medium px-3 py-2 text-right">คำขอ</th>
                      <th className="font-medium px-3 py-2 text-right">เที่ยวที่อนุมัติ</th>
                      <th className="font-medium px-3 py-2 text-right">วันที่ใช้งาน</th>
                      <th className="font-medium px-5 sm:px-6 py-2">อัตราการใช้</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {data.by_car.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                        <td className="px-5 sm:px-6 py-2.5">
                          <p className="font-medium text-gray-900 dark:text-white">{c.license_plate}</p>
                          <p className="text-xs text-gray-400">{c.brand} {c.model}{c.type ? ` · ${c.type}` : ''}{c.status === 'retired' ? ' · ปลดระวาง' : ''}</p>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{c.requests}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{c.trips}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{c.car_days}</td>
                        <td className="px-5 sm:px-6 py-2.5"><UtilMeter value={c.utilization} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel title="เวลาเซ็นเฉลี่ยแต่ละขั้น" description="3 ขั้นแรกนับจากวันส่งคำขอ · ขั้นถัดไปนับจากขั้นก่อนหน้า" onExport={exports.stages}>
              {data.stage_times.every(s => !s.samples) ? <Empty text="ยังไม่มีเอกสารที่เซ็นในช่วงนี้" /> : (
                <BarList items={data.stage_times} valueOf={s => s.avg_hours || 0} labelOf={s => s.title}
                  sublabelOf={s => `${s.samples} เอกสาร`} format={v => (v ? fmtHours(v) : '—')} />
              )}
            </Panel>
            <Panel title="ปลายทางยอดนิยม" description="จำนวนคำขอตามจังหวัดปลายทาง" onExport={exports.destinations}>
              {data.destinations.length === 0 ? <Empty /> : (
                <BarList items={data.destinations} valueOf={d => d.requests} labelOf={d => d.province} labelWidth="9rem" />
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Panel title="ผู้ยืมที่ใช้บ่อย" description="10 อันดับแรกตามจำนวนคำขอ" onExport={exports.borrowers} className="lg:col-span-2">
              {data.top_borrowers.length === 0 ? <Empty /> : (
                <div className="overflow-x-auto -mx-5 sm:-mx-6">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700/60">
                        <th className="font-medium px-5 sm:px-6 py-2 w-8">#</th>
                        <th className="font-medium px-3 py-2">ผู้ยืม</th>
                        <th className="font-medium px-3 py-2 text-right">คำขอ</th>
                        <th className="font-medium px-3 py-2 text-right">อนุมัติ</th>
                        <th className="font-medium px-5 sm:px-6 py-2 text-right">วันที่ใช้รถ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                      {data.top_borrowers.map((b, i) => (
                        <tr key={`${b.name}-${i}`}>
                          <td className="px-5 sm:px-6 py-2.5 text-gray-400 tabular-nums">{i + 1}</td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-gray-900 dark:text-white">{b.name}</p>
                            {b.position && <p className="text-xs text-gray-400">{b.position}</p>}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{b.requests}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{b.approved}</td>
                          <td className="px-5 sm:px-6 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{b.car_days}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            <div className="space-y-6 min-w-0">
              <Panel title="วันที่เริ่มใช้รถ" description="จำนวนคำขอตามวันในสัปดาห์">
                {data.by_weekday.every(d => !d.requests) ? <Empty /> : (
                  <BarList items={data.by_weekday} valueOf={d => d.requests} labelOf={d => d.label} labelWidth="5rem" />
                )}
              </Panel>
              <Panel title="ผู้ขับ" description="เที่ยวที่อนุมัติแล้วแยกตามผู้ขับ" onExport={exports.drivers}>
                {data.drivers.length === 0 ? <Empty /> : (
                  <BarList items={data.drivers} valueOf={d => d.trips} labelOf={d => d.name}
                    sublabelOf={d => `${d.car_days} วัน`} labelWidth="8rem" />
                )}
              </Panel>
            </div>
          </div>
        </div>
      )}
      {!data && !loading && !error && <Skeleton className="h-40 rounded-2xl" />}
    </div>
  )
}
