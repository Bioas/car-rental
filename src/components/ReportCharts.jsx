import React, { useState } from 'react'
import { OUTCOMES, monthLabel } from '../lib/reportFormat'

// Charts shared by the รายงานสถิติ page and the dashboard. Outcome colours are
// the app's status colours (STATUS_COLORS) and always ship with a legend and
// numbers — never colour alone.

export function Empty({ text = 'ไม่มีข้อมูลในช่วงเวลานี้' }) {
  return <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">{text}</div>
}

export function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-600 dark:text-gray-300">
      {OUTCOMES.map(o => (
        <span key={o.key} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: o.color }} />
          {o.label}
        </span>
      ))}
    </div>
  )
}

// Part-to-whole of the four outcomes — one bar, 2px surface gaps, counts in
// the legend row underneath.
export function OutcomeBar({ kpis }) {
  const total = OUTCOMES.reduce((s, o) => s + (kpis[o.key] || 0), 0)
  if (!total) return <Empty />
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden gap-[2px] bg-white dark:bg-gray-900">
        {OUTCOMES.filter(o => kpis[o.key] > 0).map(o => (
          <div key={o.key} style={{ width: `${(kpis[o.key] / total) * 100}%`, backgroundColor: o.color }}
            title={`${o.label}: ${kpis[o.key]} คำขอ`} />
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-3 mt-4">
        {OUTCOMES.map(o => (
          <div key={o.key} className="rounded-xl bg-gray-50 dark:bg-gray-800/50 px-3 py-2.5">
            <dt className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: o.color }} />{o.label}
            </dt>
            <dd className="mt-0.5 text-lg font-bold text-gray-900 dark:text-white tabular-nums">
              {kpis[o.key]}
              <span className="ml-1 text-xs font-medium text-gray-400">{Math.round((kpis[o.key] / total) * 100)}%</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// Monthly requests stacked by outcome. One y-axis (count), recessive grid,
// total above each column, tooltip on hover/focus.
export function MonthlyChart({ months, height = 180 }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...months.map(m => m.total))
  const step = max <= 4 ? 1 : Math.ceil(max / 4)
  const top = Math.ceil(max / step) * step
  const ticks = []
  for (let t = 0; t <= top; t += step) ticks.push(t)
  const H = height
  if (!months.some(m => m.total)) return <Empty />

  return (
    <div className="flex gap-2">
      <div className="relative w-6 shrink-0 text-[10px] text-gray-400 dark:text-gray-500 tabular-nums" style={{ height: H }}>
        {ticks.map(t => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: H - (t / top) * H }}>{t}</span>
        ))}
      </div>
      <div className="flex-1 min-w-0 overflow-x-auto scrollbar-thin">
        <div className="relative" style={{ minWidth: months.length * 36 }}>
          <div className="relative" style={{ height: H }}>
            {ticks.map(t => (
              <div key={t} className={`absolute inset-x-0 border-t ${t === 0 ? 'border-gray-300 dark:border-gray-600' : 'border-dashed border-gray-200 dark:border-gray-700/60'}`}
                style={{ top: H - (t / top) * H }} />
            ))}
            <div className="absolute inset-0 flex items-end gap-2 px-1">
              {months.map((m, i) => (
                <div key={m.month} tabIndex={0} role="img"
                  aria-label={`${monthLabel(m.month)}: ทั้งหมด ${m.total} คำขอ, ${OUTCOMES.map(o => `${o.label} ${m[o.key]}`).join(', ')}`}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                  className="relative flex-1 h-full flex flex-col justify-end items-center outline-none group">
                  {m.total > 0 && <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-300 mb-1 tabular-nums">{m.total}</span>}
                  <div className={`w-full max-w-[40px] flex flex-col-reverse gap-[2px] rounded-t-[4px] overflow-hidden transition-opacity ${hover !== null && hover !== i ? 'opacity-50' : ''}`}
                    style={{ height: (m.total / top) * H }}>
                    {OUTCOMES.filter(o => m[o.key] > 0).map(o => (
                      <div key={o.key} style={{ height: `${(m[o.key] / m.total) * 100}%`, backgroundColor: o.color, minHeight: 2 }} />
                    ))}
                  </div>
                  {hover === i && (
                    <div className={`absolute top-0 z-10 w-44 rounded-xl bg-gray-900/95 dark:bg-gray-700/95 text-white text-xs p-3 shadow-xl pointer-events-none ${i > months.length / 2 ? 'right-0' : 'left-0'}`}>
                      <p className="font-semibold mb-1.5">{monthLabel(m.month)} · {m.total} คำขอ</p>
                      {OUTCOMES.map(o => (
                        <p key={o.key} className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: o.color }} />{o.label}</span>
                          <span className="tabular-nums">{m[o.key]}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2 px-1 mt-1.5">
            {months.map(m => (
              <span key={m.month} className="flex-1 text-center text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">{monthLabel(m.month)}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
