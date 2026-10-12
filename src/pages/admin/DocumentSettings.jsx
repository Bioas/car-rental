import React, { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { apiGet, invalidateApi } from '../../lib/apiCache'
import { Spinner } from '../../components/ui/spinner'
import { Toast } from '../../components/ui/toast'
import { Select } from '../../components/ui/select'
import { joinNamePrefix } from '../../lib/constants'

// "ตั้งค่า → เอกสาร": everything that shapes the loan-request document, on one
// page — agency header, document-number format and sequence, who signs each
// stage (and what the stage is called, and whether it signs in the system or
// with a pen on the printed PDF), and the loan rules checked when a request is
// submitted. Backed by:
//   /api/admin/settings/document     (api/lib/doc-settings.cjs)
//   /api/admin/settings/doc-number   (api/lib/doc-number.cjs counter)
//   /api/admin/stage-assignments     (signer per stage)

const HEADER_FIELDS = [
  { key: 'org_name', label: 'ชื่อหน่วยงาน (ส่วนราชการ)', placeholder: 'วิทยาลัยเทคนิคบุรีรัมย์' },
  { key: 'org_phone', label: 'เบอร์โทรศัพท์หน่วยงาน', placeholder: '0 4461 1079' },
  { key: 'form_title', label: 'ชื่อแบบฟอร์ม (หัวกระดาษ)', placeholder: 'แบบขออนุญาตใช้รถ…', wide: true },
  { key: 'subject', label: 'เรื่อง', placeholder: 'ขออนุญาตใช้รถยนต์ของทางราชการ', wide: true },
  { key: 'addressee', label: 'เรียน', placeholder: 'ผู้อำนวยการ…', wide: true },
]

const RULE_FIELDS = [
  { key: 'min_notice_days', label: 'ต้องส่งคำขอล่วงหน้าอย่างน้อย', unit: 'วัน', hint: 'นับจากวันนี้ถึงวันเริ่มใช้รถ' },
  { key: 'max_advance_days', label: 'จองล่วงหน้าได้ไม่เกิน', unit: 'วัน', hint: 'กันการจองไกลเกินไป' },
  { key: 'max_duration_days', label: 'ยืมรถได้ครั้งละไม่เกิน', unit: 'วัน', hint: 'นับรวมวันแรกและวันสุดท้าย' },
]

function Section({ id, icon, title, description, children, footer }) {
  return (
    <section id={id} className="card scroll-mt-24">
      <header className="px-5 sm:px-6 pt-5 pb-4 border-b border-border-light/60 dark:border-border-dark/60 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300 flex items-center justify-center shrink-0">
          <i aria-hidden="true" className={`bx ${icon} text-lg`}></i>
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        </div>
      </header>
      <div className="px-5 sm:px-6 py-5">{children}</div>
      {footer && (
        <footer className="px-5 sm:px-6 py-3.5 border-t border-border-light/60 dark:border-border-dark/60 flex items-center justify-end gap-3 bg-gray-50/60 dark:bg-gray-900/20 rounded-b-2xl">
          {footer}
        </footer>
      )}
    </section>
  )
}

function SaveButton({ dirty, saving, onClick, label = 'บันทึก' }) {
  return (
    <>
      {dirty && !saving && <span className="text-xs text-amber-600 dark:text-amber-400">มีการแก้ไขที่ยังไม่บันทึก</span>}
      <button type="button" onClick={onClick} disabled={!dirty || saving}
        className="h-10 px-5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        {saving ? 'กำลังบันทึก…' : label}
      </button>
    </>
  )
}

function Field({ label, htmlFor, children, hint, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}

const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

function thaiToday() {
  const d = new Date()
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`
}

// Miniature of the PDF's top half (api/lib/pdf.cjs), drawn from the *unsaved*
// form values so edits can be checked before saving.
function DocumentPreview({ header, docNumber, refNo, titles, paper, stages }) {
  const line = 'border-b border-dotted border-gray-400 dark:border-gray-500'
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
          <i aria-hidden="true" className="bx bx-show text-sm"></i> ตัวอย่างหัวเอกสาร
        </span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">อัปเดตตามที่พิมพ์</span>
      </div>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950/40 px-4 py-4 text-[10.5px] leading-relaxed text-gray-800 dark:text-gray-200 shadow-inner">
        <p className="text-right">
          เลขที่ <span className={`${line} px-1 text-blue-700 dark:text-blue-300`}>{docNumber}</span>
        </p>
        <p className="text-center font-bold text-[12px] mt-2 mb-3 break-words">{header.form_title || '—'}</p>
        <p className="break-words">ส่วนราชการ&nbsp; {header.org_name}{header.org_phone ? ` ${header.org_phone}` : ''}</p>
        <p className="flex gap-1">
          <span className="shrink-0">ที่</span>
          <span className={`${line} flex-1 min-w-0 truncate text-blue-700 dark:text-blue-300`}>{refNo || ' '}</span>
          <span className="shrink-0">วันที่</span>
          <span className={`${line} shrink-0 text-blue-700 dark:text-blue-300`}>{thaiToday()}</span>
        </p>
        <p className="break-words">เรื่อง&nbsp; {header.subject}</p>
        <p className="break-words">เรียน&nbsp; {header.addressee}</p>
        <div className="mt-3 pt-3 border-t border-dashed border-gray-200 dark:border-gray-700 space-y-1">
          {Object.entries(titles).map(([key, title], i) => {
            const onPaper = key in paper
            const assignedName = stages.find(s => s.key === key)?.user_name || ''
            const name = onPaper ? (paper[key] || assignedName) : ''
            return (
              <p key={key} className="flex gap-2 text-gray-500 dark:text-gray-400">
                <span className="shrink-0 w-4 text-right tabular-nums">{i + 1}.</span>
                <span className="min-w-0 break-words">
                  ลงชื่อ ........ <span className="text-gray-700 dark:text-gray-300">{title}</span>
                  {!onPaper && assignedName && (
                    <span className="block text-gray-600 dark:text-gray-300">({assignedName})</span>
                  )}
                  {onPaper && (
                    <span className="block text-sky-600 dark:text-sky-400">
                      <i aria-hidden="true" className="bx bx-printer align-[-1px]"></i> เซ็นบนกระดาษ{name ? ` · (${name})` : ''}
                    </span>
                  )}
                </span>
              </p>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj?.[k] ?? '']))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export default function DocumentSettings() {
  const { authHeaders } = useApp()
  const [saved, setSaved] = useState(null)        // last settings from the server
  const [counter, setCounter] = useState(null)    // { last_issued, next, highest_used }
  const [stages, setStages] = useState([])
  const [staff, setStaff] = useState([])
  const [header, setHeader] = useState({})
  const [numbering, setNumbering] = useState({ doc_prefix: '', doc_suffix: '', ref_no: '', next: '' })
  const [titles, setTitles] = useState({})
  const [paper, setPaper] = useState({})          // stage key → printed name, for stages signed on paper
  const [rules, setRules] = useState({})
  const [prefixes, setPrefixes] = useState([])     // name titles for every title dropdown
  const [newPrefix, setNewPrefix] = useState('')
  const [saving, setSaving] = useState('')
  const [savingStage, setSavingStage] = useState(null)
  const [toast, setToast] = useState(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/settings/document', { headers: authHeaders() }).then(r => r.ok ? r.json() : Promise.reject(r)),
      fetch('/api/admin/settings/doc-number', { headers: authHeaders() }).then(r => r.ok ? r.json() : Promise.reject(r)),
      apiGet('/api/admin/stage-assignments', { headers: authHeaders(), force: true }),
    ]).then(([settings, num, assignments]) => {
      applySettings(settings)
      applyCounter(num)
      setStages(assignments.data?.stages || [])
      setStaff(assignments.data?.staff || [])
    }).catch(() => setLoadError(true))
  }, [authHeaders])

  function applySettings(s) {
    setSaved(s)
    setHeader(pick(s, HEADER_FIELDS.map(f => f.key)))
    setNumbering(n => ({ ...n, ...pick(s, ['doc_prefix', 'doc_suffix', 'ref_no']) }))
    setTitles({ ...s.stage_titles })
    setPaper({ ...(s.paper_signers || {}) })
    setRules(Object.fromEntries(RULE_FIELDS.map(f => [f.key, String(s[f.key] ?? 0)])))
    setPrefixes([...(s.name_prefixes || [])])
  }

  function applyCounter(c) {
    setCounter(c)
    setNumbering(n => ({ ...n, next: String(c.next) }))
  }

  async function putSettings(body) {
    const res = await fetch('/api/admin/settings/document', {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ')
    applySettings(data.settings)
    // Stage titles and loan rules are cached for the timelines/booking form.
    invalidateApi()
    return data
  }

  async function run(section, fn, successMessage) {
    setSaving(section)
    try {
      await fn()
      setToast({ type: 'success', message: 'บันทึกแล้ว', submessage: successMessage })
    } catch (e) {
      setToast({ type: 'error', submessage: e.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
    } finally {
      setSaving('')
    }
  }

  // ── Section handlers ──
  const headerDirty = saved && !same(header, pick(saved, HEADER_FIELDS.map(f => f.key)))
  const saveHeader = () => run('header', () => putSettings(header), 'อัปเดตข้อมูลหน่วยงานบนเอกสารแล้ว')

  const nextNum = Number(numbering.next)
  const nextValid = Number.isInteger(nextNum) && nextNum >= 1
  const formatDirty = saved && !same(pick(numbering, ['doc_prefix', 'doc_suffix', 'ref_no']), pick(saved, ['doc_prefix', 'doc_suffix', 'ref_no']))
  const counterDirty = counter && nextValid && nextNum !== counter.next
  const reusesNumbers = counter && nextValid && counterDirty && nextNum <= counter.highest_used
  const saveNumbering = () => run('numbering', async () => {
    if (!nextValid) throw new Error('เลขที่เริ่มต้นต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป')
    if (formatDirty) await putSettings(pick(numbering, ['doc_prefix', 'doc_suffix', 'ref_no']))
    if (counterDirty) {
      const res = await fetch('/api/admin/settings/doc-number', {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ next: nextNum }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      applyCounter(data)
    }
  }, 'อัปเดตรูปแบบเลขที่เอกสารแล้ว')

  const titlesDirty = saved && !same(titles, saved.stage_titles)
  const paperDirty = saved && !same(paper, saved.paper_signers || {})
  const signersDirty = titlesDirty || paperDirty
  const allPaper = stages.length > 0 && stages.every(st => st.key in paper)
  const togglePaper = (key, onPaper) => setPaper(p => {
    const next = { ...p }
    if (onPaper) next[key] = saved.paper_signers?.[key] ?? ''
    else delete next[key]
    return next
  })
  const saveSigners = async () => {
    setSaving('titles')
    try {
      if (allPaper) throw new Error('ต้องมีอย่างน้อย 1 ขั้นที่เซ็นในระบบ')
      const body = {}
      if (titlesDirty) body.stage_titles = titles
      if (paperDirty) body.paper_signers = Object.fromEntries(Object.entries(paper).map(([k, v]) => [k, v.trim()]))
      const data = await putSettings(body)
      setToast({
        type: 'success', message: 'บันทึกแล้ว',
        submessage: data.updated_documents > 0
          ? `อัปเดตผู้เซ็นแล้ว และปรับเอกสารที่กำลังเซ็นอยู่ ${data.updated_documents} ฉบับ`
          : 'อัปเดตผู้เซ็นเอกสารแล้ว',
      })
    } catch (e) {
      setToast({ type: 'error', submessage: e.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
    } finally {
      setSaving('')
    }
  }

  const rulesDirty = saved && RULE_FIELDS.some(f => String(saved[f.key] ?? 0) !== rules[f.key])
  const rulesValid = RULE_FIELDS.every(f => /^\d+$/.test(rules[f.key] ?? ''))
  const saveRules = () => run('rules', async () => {
    if (!rulesValid) throw new Error('จำนวนวันต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป')
    await putSettings(Object.fromEntries(RULE_FIELDS.map(f => [f.key, Number(rules[f.key])])))
  }, 'อัปเดตเงื่อนไขการยืมแล้ว')

  const prefixesDirty = saved && !same(prefixes, saved.name_prefixes || [])
  const trimmedNewPrefix = newPrefix.trim().replace(/\s+/g, ' ')
  const prefixDuplicate = !!trimmedNewPrefix && prefixes.includes(trimmedNewPrefix)
  function addPrefix() {
    if (!trimmedNewPrefix || prefixDuplicate) return
    setPrefixes(list => [...list, trimmedNewPrefix])
    setNewPrefix('')
  }
  const movePrefix = (i, delta) => setPrefixes(list => {
    const j = i + delta
    if (j < 0 || j >= list.length) return list
    const next = [...list]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })
  const savePrefixes = () => run('prefixes', async () => {
    if (!prefixes.length) throw new Error('ต้องมีคำนำหน้าอย่างน้อย 1 รายการ')
    await putSettings({ name_prefixes: prefixes })
  }, 'อัปเดตรายการคำนำหน้าชื่อแล้ว')

  // Assigning a signer saves immediately, as before.
  async function assign(key, userId) {
    setSavingStage(key)
    try {
      const res = await fetch(`/api/admin/stage-assignments/${key}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId || null }),
      })
      const data = await res.json()
      if (!res.ok) { setToast({ type: 'error', submessage: data.error }); return }
      invalidateApi()
      const fresh = await apiGet('/api/admin/stage-assignments', { headers: authHeaders(), force: true })
      if (fresh.ok) { setStages(fresh.data.stages || []); setStaff(fresh.data.staff || []) }
    } catch {
      setToast({ type: 'error', submessage: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
    } finally {
      setSavingStage(null)
    }
  }

  if (loadError) {
    return <p className="text-sm text-red-500">โหลดการตั้งค่าเอกสารไม่สำเร็จ กรุณารีเฟรชหน้า</p>
  }
  if (!saved || !counter) return <Spinner />

  const preview = `${numbering.doc_prefix}${nextValid ? nextNum : counter.next}${numbering.doc_suffix}`
  const navItems = [
    { id: 'doc-header', icon: 'bx-buildings', label: 'ข้อมูลหน่วยงาน', dirty: headerDirty },
    { id: 'doc-numbering', icon: 'bx-hash', label: 'เลขที่เอกสาร', dirty: formatDirty || counterDirty },
    { id: 'doc-signers', icon: 'bx-pen', label: 'ผู้เซ็นเอกสาร', dirty: signersDirty },
    { id: 'doc-rules', icon: 'bx-calendar-check', label: 'เงื่อนไขการยืม', dirty: rulesDirty },
    { id: 'doc-prefixes', icon: 'bx-id-card', label: 'คำนำหน้าชื่อ', dirty: prefixesDirty },
  ]
  const staffOptions = [{ value: '', label: '— ยังไม่กำหนด —' }, ...staff.map(u => ({ value: u.id, label: u.name }))]

  return (
    <div className="animate-fade-in flex flex-col flex-1 min-h-0">
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white font-heading">ตั้งค่าเอกสาร</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          ข้อมูลบนแบบขออนุญาตใช้รถ เลขที่เอกสาร ผู้เซ็นแต่ละขั้น และเงื่อนไขการยืม
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_400px] gap-6 items-start pb-6">
      <div className="space-y-6 min-w-0">
        {/* ── Agency header ── */}
        <Section id="doc-header" icon="bx-buildings" title="ข้อมูลหน่วยงานบนเอกสาร"
          description="ข้อความส่วนหัวของแบบขออนุญาตใช้รถ (PDF) — มีผลกับเอกสารทุกฉบับที่เปิดดูหลังบันทึก"
          footer={<SaveButton dirty={headerDirty} saving={saving === 'header'} onClick={saveHeader} />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {HEADER_FIELDS.map(f => (
              <Field key={f.key} label={f.label} htmlFor={`doc-${f.key}`} className={f.wide ? 'sm:col-span-2' : ''}>
                <input id={`doc-${f.key}`} className="input" value={header[f.key] ?? ''} placeholder={f.placeholder}
                  maxLength={200} onChange={e => setHeader(h => ({ ...h, [f.key]: e.target.value }))} />
              </Field>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3">เว้นว่างไว้เพื่อใช้ค่าเริ่มต้นของระบบ</p>
        </Section>

        {/* ── Document number ── */}
        <Section id="doc-numbering" icon="bx-hash" title="เลขที่เอกสาร"
          description="รูปแบบเลขที่ที่พิมพ์บนเอกสาร และเลขที่ที่คำขอยืมถัดไปจะได้รับ"
          footer={<SaveButton dirty={formatDirty || counterDirty} saving={saving === 'numbering'} onClick={saveNumbering} />}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="คำนำหน้าเลขที่" htmlFor="doc-prefix" hint="เช่น ศธ 0606/">
              <input id="doc-prefix" className="input" value={numbering.doc_prefix} maxLength={200}
                onChange={e => setNumbering(n => ({ ...n, doc_prefix: e.target.value }))} />
            </Field>
            <Field label="เลขที่ถัดไป" htmlFor="doc-next" hint={`ล่าสุดที่ออกไป: ${counter.last_issued > 0 ? counter.last_issued : '—'}`}>
              <input id="doc-next" className="input tabular-nums" type="number" inputMode="numeric" min="1" step="1"
                value={numbering.next} aria-invalid={!nextValid}
                onChange={e => setNumbering(n => ({ ...n, next: e.target.value }))} />
            </Field>
            <Field label="ต่อท้ายเลขที่" htmlFor="doc-suffix" hint="เช่น /2569">
              <input id="doc-suffix" className="input" value={numbering.doc_suffix} maxLength={200}
                onChange={e => setNumbering(n => ({ ...n, doc_suffix: e.target.value }))} />
            </Field>
            <Field label="ที่ (เลขที่หนังสือส่วนราชการ)" htmlFor="doc-ref" className="sm:col-span-3"
              hint="พิมพ์ในช่อง &quot;ที่&quot; ใต้ชื่อส่วนราชการ เว้นว่างได้">
              <input id="doc-ref" className="input" value={numbering.ref_no} maxLength={200}
                onChange={e => setNumbering(n => ({ ...n, ref_no: e.target.value }))} />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-500 dark:text-gray-400">ตัวอย่างคำขอถัดไป:</span>
            <span className="px-2.5 py-1 rounded-lg bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 font-semibold tabular-nums">
              เลขที่ {preview}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
            เลขที่จะถูกบันทึกลงคำขอตอนที่ส่งเข้ามา — การเปลี่ยนรูปแบบไม่กระทบเลขที่ของเอกสารที่ออกไปแล้ว
          </p>
          {!nextValid && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-2">เลขที่ถัดไปต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป</p>
          )}
          {reusesNumbers && (
            <p className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 text-xs text-amber-700 dark:text-amber-300 flex gap-2">
              <i aria-hidden="true" className="bx bx-error text-sm shrink-0"></i>
              <span>มีคำขอที่ใช้เลขที่ถึง {counter.highest_used} แล้ว ถ้าเริ่มที่ {nextNum} เลขที่จะซ้ำกับของเดิม (เหมาะกับการเริ่มนับใหม่ เช่น ขึ้นปีงบประมาณใหม่)</span>
            </p>
          )}
        </Section>

        {/* ── Signers ── */}
        <Section id="doc-signers" icon="bx-pen" title="ผู้เซ็นเอกสาร"
          description="ชื่อตำแหน่ง ผู้เซ็น และวิธีเซ็นของแต่ละขั้น เรียงตามลำดับการเซ็น"
          footer={<SaveButton dirty={signersDirty} saving={saving === 'titles'} onClick={saveSigners} />}>
          {staff.length === 0 && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
              <i aria-hidden="true" className="bx bx-info-circle text-base shrink-0"></i>
              ยังไม่มีบัญชีเจ้าหน้าที่ในระบบ กรุณาเพิ่มในแท็บ "ผู้ใช้" ก่อน
            </div>
          )}
          <ol className="space-y-5">
            {stages.map((stage, i) => {
              const onPaper = stage.key in paper
              return (
                <li key={stage.key}>
                  <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="hidden sm:flex w-8 h-10 items-center justify-center text-sm font-bold text-brand-700 dark:text-brand-300 shrink-0">
                      {i + 1}
                    </div>
                    <Field label={`ขั้นที่ ${i + 1} · ชื่อตำแหน่ง`} htmlFor={`stage-${stage.key}`} className="flex-1 min-w-0">
                      <input id={`stage-${stage.key}`} className="input" maxLength={200}
                        value={titles[stage.key] ?? ''} placeholder={stage.default_title}
                        onChange={e => setTitles(t => ({ ...t, [stage.key]: e.target.value }))} />
                    </Field>
                    {onPaper ? (
                      <Field label="ชื่อที่พิมพ์บน PDF" htmlFor={`paper-${stage.key}`} className="sm:w-60 shrink-0">
                        <input id={`paper-${stage.key}`} className="input" maxLength={200}
                          value={paper[stage.key] ?? ''} placeholder={stage.user_name || 'ชื่อ-นามสกุลผู้เซ็น'}
                          onChange={e => setPaper(p => ({ ...p, [stage.key]: e.target.value }))} />
                      </Field>
                    ) : (
                      <Field label="เจ้าหน้าที่ผู้เซ็น" className="sm:w-60 shrink-0">
                        <Select value={stage.user_id || ''} onChange={v => assign(stage.key, v)}
                          options={staffOptions} icon="bx-user" disabled={savingStage === stage.key} />
                      </Field>
                    )}
                  </div>
                  <div className="mt-2 sm:pl-11 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <div role="radiogroup" aria-label={`วิธีเซ็นขั้นที่ ${i + 1}`}
                      className="inline-flex p-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-medium">
                      {[
                        { value: false, icon: 'bx-pen', label: 'เซ็นในระบบ', on: 'text-brand-700 dark:text-brand-300' },
                        { value: true, icon: 'bx-printer', label: 'เซ็นบนกระดาษ', on: 'text-sky-700 dark:text-sky-300' },
                      ].map(opt => {
                        const active = onPaper === opt.value
                        return (
                          <button key={opt.label} type="button" role="radio" aria-checked={active}
                            onClick={() => togglePaper(stage.key, opt.value)}
                            className={`inline-flex items-center gap-1 h-9 sm:h-7 px-3 sm:px-2.5 rounded-md transition-colors ${active
                              ? `bg-white dark:bg-gray-700 shadow-sm ${opt.on}`
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>
                            <i aria-hidden="true" className={`bx ${opt.icon} text-sm`}></i>{opt.label}
                          </button>
                        )
                      })}
                    </div>
                    {onPaper && (
                      <span className="text-[11px] text-gray-400 dark:text-gray-500">
                        ไม่อยู่ในลำดับการเซ็นในระบบ · พิมพ์ชื่อไว้ใต้ช่องลงชื่อใน PDF ให้เซ็นด้วยปากกา
                        {!paper[stage.key] && stage.user_name ? ` (เว้นว่าง = ใช้ชื่อ ${stage.user_name})` : ''}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
          {allPaper && (
            <p className="mt-4 text-xs text-red-500 dark:text-red-400">ต้องมีอย่างน้อย 1 ขั้นที่เซ็นในระบบ</p>
          )}
          {!allPaper && Object.keys(paper).length > 0 && (
            <p className="mt-4 p-3 rounded-xl bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-800/50 text-xs text-sky-700 dark:text-sky-300 flex gap-2">
              <i aria-hidden="true" className="bx bx-info-circle text-sm shrink-0"></i>
              <span>
                คำขอจะอนุมัติในระบบเมื่อขั้นที่เซ็นในระบบเซ็นครบ จากนั้นพิมพ์ PDF ไปให้ขั้นที่เซ็นบนกระดาษลงนาม
                {'deputy_director' in paper && 'director' in paper && ' · ทั้งสองขั้นที่ "ไม่อนุญาต" ได้เซ็นบนกระดาษ จึงไม่มีใครกดไม่อนุญาตในระบบได้'}
              </span>
            </p>
          )}
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-4">
            การเลือกเจ้าหน้าที่บันทึกทันที · ชื่อตำแหน่งและวิธีเซ็นต้องกด "บันทึก" · วิธีเซ็นที่เปลี่ยนมีผลกับเอกสารที่ยังเซ็นไม่ถึงขั้นนั้นด้วย
          </p>
        </Section>

        {/* ── Loan rules ── */}
        <Section id="doc-rules" icon="bx-calendar-check" title="เงื่อนไขการยืม"
          description="ตรวจสอบตอนส่งคำขอยืม ทั้งจากหน้าสาธารณะและจากหลังบ้าน — ใส่ 0 หากไม่ต้องการจำกัด"
          footer={<SaveButton dirty={rulesDirty} saving={saving === 'rules'} onClick={saveRules} />}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {RULE_FIELDS.map(f => (
              <Field key={f.key} label={f.label} htmlFor={`rule-${f.key}`} hint={f.hint}>
                <div className="relative">
                  <input id={`rule-${f.key}`} className="input pr-12 tabular-nums" type="number" inputMode="numeric" min="0" step="1"
                    value={rules[f.key] ?? ''} onChange={e => setRules(r => ({ ...r, [f.key]: e.target.value }))} />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                    {Number(rules[f.key]) === 0 ? 'ไม่จำกัด' : f.unit}
                  </span>
                </div>
              </Field>
            ))}
          </div>
          {!rulesValid && <p className="text-xs text-red-500 dark:text-red-400 mt-2">จำนวนวันต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป</p>}
        </Section>

        {/* ── Name titles ── */}
        <Section id="doc-prefixes" icon="bx-id-card" title="คำนำหน้าชื่อ"
          description="ตัวเลือกในช่องคำนำหน้าของฟอร์มขอใช้รถและฟอร์มผู้ใช้ เรียงตามลำดับที่แสดง"
          footer={<SaveButton dirty={prefixesDirty} saving={saving === 'prefixes'} onClick={savePrefixes} />}>
          <ul className="flex flex-wrap gap-2">
            {prefixes.map((p, i) => (
              <li key={p} className="group inline-flex items-center gap-1 h-9 pl-3 pr-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100">
                <span className="mr-1">{p}</span>
                <button type="button" onClick={() => movePrefix(i, -1)} disabled={i === 0} aria-label={`เลื่อน ${p} ขึ้น`}
                  className="w-8 h-8 sm:w-6 sm:h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:opacity-30 disabled:pointer-events-none">
                  <i aria-hidden="true" className="bx bx-chevron-left text-base"></i>
                </button>
                <button type="button" onClick={() => movePrefix(i, 1)} disabled={i === prefixes.length - 1} aria-label={`เลื่อน ${p} ลง`}
                  className="w-8 h-8 sm:w-6 sm:h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:opacity-30 disabled:pointer-events-none">
                  <i aria-hidden="true" className="bx bx-chevron-right text-base"></i>
                </button>
                <button type="button" onClick={() => setPrefixes(list => list.filter(x => x !== p))} aria-label={`ลบ ${p}`}
                  className="w-8 h-8 sm:w-6 sm:h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30">
                  <i aria-hidden="true" className="bx bx-x text-base"></i>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex gap-2 max-w-md">
            <input className="input flex-1" value={newPrefix} maxLength={30} placeholder="เช่น ดร., ผศ., ร.ต.ต."
              aria-label="คำนำหน้าใหม่" aria-invalid={prefixDuplicate || undefined}
              onChange={e => setNewPrefix(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPrefix() } }} />
            <button type="button" onClick={addPrefix} disabled={!trimmedNewPrefix || prefixDuplicate}
              className="h-11 px-4 rounded-xl text-sm font-semibold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/30 hover:bg-brand-100 dark:hover:bg-brand-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1">
              <i aria-hidden="true" className="bx bx-plus text-base"></i> เพิ่ม
            </button>
          </div>
          {prefixDuplicate && <p className="text-xs text-red-500 dark:text-red-400 mt-1.5">มีคำนำหน้านี้อยู่แล้ว</p>}
          {trimmedNewPrefix && !prefixDuplicate && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">
              จะแสดงในชื่อเป็น "<span className="font-medium text-gray-700 dark:text-gray-200">{joinNamePrefix(trimmedNewPrefix, 'สมชาย ใจดี')}</span>"
            </p>
          )}
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3">
            คำนำหน้าที่ลงท้ายด้วยจุด (เช่น ดร.) และ นาย/นาง/นางสาว จะเขียนติดกับชื่อ ส่วนคำเต็มอย่าง "ว่าที่ร้อยตรี" จะเว้นวรรคหนึ่งช่อง ·
            การลบออกจากรายการไม่กระทบชื่อที่บันทึกไว้แล้ว
          </p>
        </Section>
      </div>

      {/* Right rail (wide screens): jump links with unsaved markers, a live
          preview of the document header, and the loan rules at a glance. */}
      <aside aria-label="สารบัญและตัวอย่างเอกสาร" className="hidden xl:flex flex-col gap-4 sticky top-24">
        <nav aria-label="ส่วนของการตั้งค่าเอกสาร" className="card p-2">
          {navItems.map(item => (
            <a key={item.id} href={`#${item.id}`}
              onClick={e => { e.preventDefault(); document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors">
              <i aria-hidden="true" className={`bx ${item.icon} text-base text-gray-400`}></i>
              <span className="flex-1 truncate">{item.label}</span>
              {item.dirty && <span className="w-2 h-2 rounded-full bg-amber-400" title="มีการแก้ไขที่ยังไม่บันทึก" />}
            </a>
          ))}
        </nav>

        <DocumentPreview header={header} docNumber={preview} refNo={numbering.ref_no} titles={titles} paper={paper} stages={stages} />

        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1.5">
            <i aria-hidden="true" className="bx bx-calendar-check text-sm"></i> เงื่อนไขการยืมปัจจุบัน
          </p>
          <ul className="space-y-1.5 text-sm">
            {RULE_FIELDS.map(f => (
              <li key={f.key} className="flex items-center justify-between gap-3">
                <span className="text-gray-500 dark:text-gray-400 truncate">{f.label}</span>
                <span className="shrink-0 font-semibold text-gray-800 dark:text-gray-100 tabular-nums">
                  {Number(saved[f.key]) > 0 ? `${saved[f.key]} วัน` : 'ไม่จำกัด'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      </div>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  )
}
