import React, { useCallback, useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { Toast } from '../../components/ui/toast'
import { Skeleton } from '../../components/ui/skeleton'
import { Select } from '../../components/ui/select'
import { LineIcon } from '../../components/LineIcon'

// ตั้งค่า → LINE — the LINE Official Account drivers are notified through
// (api/lib/line.cjs). Pasting the channel access token + secret is enough:
// the server checks the token with LINE, fills in the OA's basic ID, and
// registers the webhook URL itself. Admin only — these are secrets.

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00 น.` }))

function Card({ icon, title, description, children, footer }) {
  return (
    <section className="card">
      <header className="px-5 sm:px-6 pt-5 pb-4 border-b border-border-light/60 dark:border-border-dark/60 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300 flex items-center justify-center shrink-0">
          <i aria-hidden="true" className={`bx ${icon} text-lg`}></i>
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
          {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
        </div>
      </header>
      <div className="px-5 sm:px-6 py-5">{children}</div>
      {footer && (
        <footer className="px-5 sm:px-6 py-3.5 border-t border-border-light/60 dark:border-border-dark/60 flex flex-wrap items-center justify-end gap-3 bg-gray-50/60 dark:bg-gray-900/20 rounded-b-2xl">
          {footer}
        </footer>
      )}
    </section>
  )
}

function SecretInput({ id, value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} autoComplete="off" spellCheck={false}
        className={`input pr-11 text-sm ${value ? 'font-mono' : ''}`} />
      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'ซ่อน' : 'แสดง'}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">
        <i aria-hidden="true" className={`bx ${show ? 'bx-hide' : 'bx-show'} text-lg`}></i>
      </button>
    </div>
  )
}

function CopyField({ value }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex gap-2">
      <input readOnly value={value} aria-label="Webhook URL" className="input font-mono text-sm bg-gray-50 dark:bg-gray-900/40" onFocus={(e) => e.target.select()} />
      <button type="button" disabled={!value} onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
        className="btn-secondary shrink-0 whitespace-nowrap">{copied ? 'คัดลอกแล้ว ✓' : 'คัดลอก'}</button>
    </div>
  )
}

function Step({ n, title, children }) {
  return (
    <li className="flex gap-3">
      <span className="w-7 h-7 rounded-full bg-[#06C755]/10 text-[#06C755] font-bold text-sm flex items-center justify-center shrink-0">{n}</span>
      <div className="flex-1 min-w-0 pb-1">
        <div className="text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
        <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 space-y-1">{children}</div>
      </div>
    </li>
  )
}

const ext = (href, label) => <a href={href} target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-400 underline underline-offset-2">{label}</a>

export default function LineSettings() {
  const { authHeaders, user } = useApp()
  const isAdmin = user?.role === 'admin'
  const [settings, setSettings] = useState(null)
  const [status, setStatus] = useState(null)
  const [checking, setChecking] = useState(false)
  const [form, setForm] = useState({ token: '', secret: '', appUrl: '', reminderOn: true, hour: '17' })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [toast, setToast] = useState(null)
  const [guideOpen, setGuideOpen] = useState(false)

  const api = useCallback(async (url, init = {}) => {
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...authHeaders() } })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'ทำรายการไม่สำเร็จ')
    return data
  }, [authHeaders])

  const applySettings = useCallback((s) => {
    setSettings(s)
    setForm({
      token: '', secret: '',
      appUrl: s.app_url || window.location.origin,
      reminderOn: s.reminder_hour !== null && s.reminder_hour !== undefined,
      hour: String(s.reminder_hour ?? 17),
    })
    setGuideOpen(!s.configured || window.matchMedia('(min-width: 1024px)').matches)
  }, [])

  const checkStatus = useCallback(async () => {
    setChecking(true)
    try {
      setStatus(await api('/api/admin/settings/line/status'))
    } catch (err) {
      setStatus({ ok: false, error: err.message })
    } finally {
      setChecking(false)
    }
  }, [api])

  useEffect(() => {
    if (!isAdmin) return
    api('/api/admin/settings/line').then((s) => {
      applySettings(s)
      if (s.configured) checkStatus()
    }).catch((err) => setToast({ type: 'error', submessage: 'โหลดไม่สำเร็จ', message: err.message }))
  }, [isAdmin, api, applySettings, checkStatus])

  if (!isAdmin) {
    return <p className="text-center py-16 text-gray-400">การตั้งค่า LINE แก้ไขได้เฉพาะผู้ดูแลระบบ</p>
  }
  if (!settings) {
    return <div className="space-y-4"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>
  }

  const webhookUrl = form.appUrl ? `${form.appUrl.replace(/\/+$/, '')}/api/line/webhook` : ''
  const savedHour = settings.reminder_hour
  const dirty = !!form.token || !!form.secret
    || form.appUrl.replace(/\/+$/, '') !== (settings.app_url || '')
    || (form.reminderOn ? Number(form.hour) : null) !== savedHour
  const needsBoth = !settings.has_token || !settings.has_secret

  async function save() {
    if (!settings.has_token && !form.token) return setToast({ type: 'error', submessage: 'ยังบันทึกไม่ได้', message: 'กรุณาใส่ Channel access token' })
    if (!settings.has_secret && !form.secret) return setToast({ type: 'error', submessage: 'ยังบันทึกไม่ได้', message: 'กรุณาใส่ Channel secret' })
    setSaving(true)
    try {
      const body = { app_url: form.appUrl, reminder_hour: form.reminderOn ? Number(form.hour) : null }
      if (form.token) body.channel_access_token = form.token
      if (form.secret) body.channel_secret = form.secret
      const data = await api('/api/admin/settings/line', { method: 'PUT', body: JSON.stringify(body) })
      applySettings(data.settings)
      const hookNote = data.webhook ? (data.webhook.ok ? 'ลงทะเบียน Webhook URL กับ LINE แล้ว' : data.webhook.error) : ''
      setToast({ type: data.webhook && !data.webhook.ok ? 'error' : 'success', submessage: data.message, message: hookNote || data.settings.bot_name || '' })
      checkStatus()
    } catch (err) {
      setToast({ type: 'error', submessage: 'บันทึกไม่สำเร็จ', message: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    setTesting(true)
    try {
      const r = await api('/api/admin/settings/line/test-webhook', { method: 'POST' })
      setToast(r.ok
        ? { type: 'success', submessage: 'Webhook ใช้งานได้', message: 'LINE ส่งข้อความทดสอบมาถึงระบบแล้ว' }
        : { type: 'error', submessage: 'Webhook ยังใช้ไม่ได้', message: `${r.reason || ''} ${r.detail || ''}`.trim() || `HTTP ${r.status_code}` })
    } catch (err) {
      setToast({ type: 'error', submessage: 'ทดสอบไม่สำเร็จ', message: err.message })
    } finally {
      setTesting(false)
    }
  }

  async function remove() {
    if (!window.confirm('ลบ token และ secret ที่บันทึกไว้? คนขับจะไม่ได้รับแจ้งเตือนทาง LINE จนกว่าจะตั้งค่าใหม่')) return
    try {
      const data = await api('/api/admin/settings/line', { method: 'DELETE' })
      applySettings(data.settings)
      setStatus(null)
      setToast({ type: 'success', submessage: data.message, message: '' })
    } catch (err) {
      setToast({ type: 'error', submessage: 'ลบไม่สำเร็จ', message: err.message })
    }
  }

  const bot = status?.bot
  const quota = status?.quota
  const webhookOk = status?.webhook && status.webhook.active && status.webhook.endpoint === status.expected_webhook

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold font-heading text-gray-900 dark:text-white">แจ้งเตือนผ่าน LINE</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">ส่งงานขับรถถึงพนักงานขับรถผ่าน LINE Official Account ของวิทยาลัย — ใช้แพ็กเกจฟรีได้ ไม่มีค่า SMS</p>
      </div>

      {/* Connection status */}
      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          {bot?.picture
            ? <img src={bot.picture} alt="" className="w-14 h-14 rounded-2xl object-cover" />
            : <div className="w-14 h-14 rounded-2xl bg-[#06C755] flex items-center justify-center text-white" style={{ '--line-ink': '#06C755' }}><LineIcon className="w-9 h-9" /></div>}
          <div className="min-w-0 flex-1">
            <div className="font-bold font-heading text-lg text-gray-900 dark:text-white truncate">
              {bot?.name || settings.bot_name || (settings.configured ? 'LINE Official Account' : 'ยังไม่ได้เชื่อมต่อ LINE')}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-3 gap-y-1">
              {(bot?.id || settings.bot_id) && <span className="font-mono">{bot?.id || settings.bot_id}</span>}
              {settings.source === 'env' && <span className="text-xs px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700">ใช้ค่าจากไฟล์ .env</span>}
              {!settings.configured && <span>ใส่ข้อมูล Channel ด้านล่างเพื่อเริ่มส่งงานถึงคนขับทาง LINE</span>}
            </div>
          </div>
          {!settings.configured && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              <span className="w-2 h-2 rounded-full bg-amber-500" />ยังไม่ได้ตั้งค่า
            </span>
          )}
          {settings.configured && (
            <button onClick={checkStatus} disabled={checking} className="btn-secondary inline-flex items-center gap-2">
              <i aria-hidden="true" className={`bx bx-refresh text-lg ${checking ? 'motion-safe:animate-spin' : ''}`}></i>ตรวจสอบ
            </button>
          )}
        </div>

        {settings.configured && (
          <div className="mt-5 grid sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
              <div className="text-[11px] text-gray-400">การเชื่อมต่อ</div>
              {checking && !status ? <Skeleton className="h-5 w-24 mt-1" /> : status?.ok
                ? <div className="font-semibold text-emerald-600 flex items-center gap-1"><i aria-hidden="true" className="bx bx-check-circle"></i>ใช้งานได้</div>
                : <div className="font-semibold text-red-600 text-sm">{status?.error || '—'}</div>}
            </div>
            <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
              <div className="text-[11px] text-gray-400">Webhook</div>
              {!status?.webhook ? <div className="text-sm text-gray-400">—</div> : webhookOk
                ? <div className="font-semibold text-emerald-600 flex items-center gap-1"><i aria-hidden="true" className="bx bx-check-circle"></i>เปิดใช้งาน</div>
                : <div className="font-semibold text-amber-600 text-sm">{!status.webhook.active ? 'ยังไม่ได้เปิด "Use webhook"' : 'URL ไม่ตรงกับเว็บนี้'}</div>}
            </div>
            <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
              <div className="text-[11px] text-gray-400">ข้อความเดือนนี้</div>
              {!quota ? <div className="text-sm text-gray-400">—</div> : (
                <>
                  <div className="font-semibold text-gray-900 dark:text-white">{quota.used.toLocaleString()}{quota.limit !== null && <span className="text-gray-400 font-normal"> / {quota.limit.toLocaleString()}</span>}</div>
                  {quota.limit !== null && (
                    <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                      <div className={`h-full rounded-full ${quota.used / quota.limit > 0.8 ? 'bg-amber-500' : 'bg-[#06C755]'}`} style={{ width: `${Math.min(100, (quota.used / Math.max(quota.limit, 1)) * 100)}%` }} />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
        {status?.webhook && !status.webhook.active && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
            เปิดสวิตช์ <b>Use webhook</b> ใน {ext('https://developers.line.biz/console/', 'LINE Developers Console')} → Messaging API (ระบบเปิดสวิตช์นี้ให้เองไม่ได้)
          </p>
        )}
      </section>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-5 gap-6 items-start">
        <div className="space-y-6 min-w-0 xl:col-span-3">
          {/* Credentials */}
          <Card icon="bx-key" title="ข้อมูล Channel" description="ข้อมูลลับ — เก็บในฐานข้อมูลและไม่แสดงกลับมาทั้งหมด"
            footer={(
              <>
                {settings.source === 'database' && (
                  <button type="button" onClick={remove} className="mr-auto text-sm text-red-600 hover:underline">ลบการตั้งค่า</button>
                )}
                {dirty && !saving && <span className="text-xs text-amber-600 dark:text-amber-400">มีการแก้ไขที่ยังไม่บันทึก</span>}
                <button type="button" onClick={save} disabled={saving || (!dirty && !needsBoth)}
                  className="h-10 px-5 rounded-xl text-sm font-semibold text-white bg-[#00843d] hover:bg-[#006e33] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {saving ? 'กำลังตรวจสอบและบันทึก…' : 'บันทึกและเชื่อมต่อ'}
                </button>
              </>
            )}>
            <div className="space-y-4">
              <div>
                <label htmlFor="line-token" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Channel access token (long-lived)</label>
                <SecretInput id="line-token" value={form.token} onChange={(v) => setForm((f) => ({ ...f, token: v }))}
                  placeholder={settings.has_token ? `บันทึกไว้แล้ว (ลงท้าย …${settings.token_hint}) — ใส่ใหม่เพื่อเปลี่ยน` : 'วาง token ที่นี่'} />
              </div>
              <div>
                <label htmlFor="line-secret" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Channel secret</label>
                <SecretInput id="line-secret" value={form.secret} onChange={(v) => setForm((f) => ({ ...f, secret: v }))}
                  placeholder={settings.has_secret ? 'บันทึกไว้แล้ว — ใส่ใหม่เพื่อเปลี่ยน' : 'ตัวอักษร 32 ตัว'} />
              </div>
              <div>
                <label htmlFor="line-url" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">ที่อยู่เว็บไซต์ของระบบ</label>
                <input id="line-url" value={form.appUrl} onChange={(e) => setForm((f) => ({ ...f, appUrl: e.target.value }))}
                  placeholder="https://cars.example.ac.th" className="input" />
                <p className="text-[11px] text-gray-400 mt-1">ใช้ทำลิงก์ในข้อความ LINE และ Webhook URL — LINE รับเฉพาะ https:// (ทดสอบบนเครื่องตัวเองไม่ได้)</p>
              </div>
              <div>
                <span className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Webhook URL</span>
                <CopyField value={webhookUrl} />
              </div>
              {settings.configured && (
                <button type="button" onClick={test} disabled={testing} className="btn-secondary inline-flex items-center gap-2">
                  <i aria-hidden="true" className="bx bx-pulse text-lg"></i>{testing ? 'กำลังทดสอบ…' : 'ทดสอบ Webhook'}
                </button>
              )}
            </div>
          </Card>

          {/* What gets sent */}
          <Card icon="bx-bell" title="การแจ้งเตือนคนขับ" description="ข้อความที่ระบบส่งถึงพนักงานขับรถที่เชื่อม LINE แล้ว"
            footer={(
              <button type="button" onClick={save} disabled={saving || !dirty || needsBoth}
                className="h-10 px-5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                {saving ? 'กำลังบันทึก…' : 'บันทึก'}
              </button>
            )}>
            <ul className="space-y-3 text-sm">
              <li className="flex gap-3">
                <i aria-hidden="true" className="bx bx-check-circle text-xl text-emerald-500 shrink-0"></i>
                <div><b className="text-gray-900 dark:text-white">เมื่อคำขอได้รับอนุมัติ</b><p className="text-gray-500 dark:text-gray-400">วันที่ รถ สถานที่ วัตถุประสงค์ ผู้ขอพร้อมเบอร์โทร และลิงก์ตารางงาน</p></div>
              </li>
              <li className="flex gap-3">
                <i aria-hidden="true" className="bx bx-alarm text-xl text-amber-500 shrink-0"></i>
                <div className="flex-1">
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <b className="text-gray-900 dark:text-white">เตือนเย็นวันก่อนเดินทาง</b>
                    <input type="checkbox" checked={form.reminderOn} onChange={(e) => setForm((f) => ({ ...f, reminderOn: e.target.checked }))}
                      className="w-10 h-6 appearance-none rounded-full bg-gray-300 dark:bg-gray-600 checked:bg-[#06C755] relative cursor-pointer transition-colors before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:w-5 before:h-5 before:rounded-full before:bg-white before:shadow before:transition-transform checked:before:translate-x-4" />
                  </label>
                  {form.reminderOn && (
                    <div className="mt-2 flex items-center gap-2 text-gray-500 dark:text-gray-400">
                      <span>เริ่มส่งตั้งแต่</span>
                      <div className="w-36"><Select value={form.hour} onChange={(v) => setForm((f) => ({ ...f, hour: v }))} options={HOURS} /></div>
                    </div>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">ทำงานเมื่อรันเป็นเซิร์ฟเวอร์ปกติ (npm start) — ไม่ทำงานบน Vercel</p>
                </div>
              </li>
              <li className="flex gap-3">
                <i aria-hidden="true" className="bx bx-message-rounded-dots text-xl text-brand-500 shrink-0"></i>
                <div><b className="text-gray-900 dark:text-white">คนขับพิมพ์ "คิว" ในแชท</b><p className="text-gray-500 dark:text-gray-400">ระบบตอบงานที่กำลังจะถึง (ข้อความตอบกลับไม่นับโควตา)</p></div>
              </li>
            </ul>
          </Card>

        </div>

        {/* Before setup, phones show the guide first; beside the form on desktop. */}
        <aside aria-label="วิธีตั้งค่าครั้งแรก" className={`min-w-0 xl:col-span-2 ${settings.configured ? '' : 'order-first lg:order-none'}`}>
        {/* Setup guide */}
        <section className="card lg:sticky lg:top-24">
          <button onClick={() => setGuideOpen((v) => !v)} className="w-full px-5 sm:px-6 py-4 flex items-center justify-between text-left">
            <span className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white"><i aria-hidden="true" className="bx bx-book-open text-lg text-brand-500"></i>วิธีตั้งค่าครั้งแรก</span>
            <i aria-hidden="true" className={`bx bx-chevron-down text-xl text-gray-400 transition-transform ${guideOpen ? 'rotate-180' : ''}`}></i>
          </button>
          {guideOpen && (
            <ol className="px-5 sm:px-6 pb-6 space-y-4">
              <Step n="1" title="สร้าง LINE Official Account">
                <p>เข้า {ext('https://manager.line.biz/', 'LINE Official Account Manager')} ด้วยบัญชี LINE ของหน่วยงาน แล้วสร้างบัญชีใหม่ (เลือกแพ็กเกจฟรีได้)</p>
              </Step>
              <Step n="2" title="เปิด Messaging API">
                <p>ในบัญชีที่สร้าง ไปที่ <b>ตั้งค่า → Messaging API → ใช้ Messaging API</b> แล้วเลือก/สร้าง Provider</p>
              </Step>
              <Step n="3" title="คัดลอก Channel secret และ Channel access token">
                <p>เปิด {ext('https://developers.line.biz/console/', 'LINE Developers Console')} → เลือก channel</p>
                <p>• แท็บ <b>Basic settings</b> → <b>Channel secret</b></p>
                <p>• แท็บ <b>Messaging API</b> → <b>Channel access token (long-lived)</b> → กด Issue</p>
              </Step>
              <Step n="4" title="วางในฟอร์ม ข้อมูล Channel แล้วกดบันทึก">
                <p>ระบบจะตรวจ token ดึงชื่อ/ID ของบัญชี และลงทะเบียน Webhook URL ให้อัตโนมัติ</p>
              </Step>
              <Step n="5" title="เปิด Use webhook และปิดข้อความตอบกลับอัตโนมัติ">
                <p>Developers Console → Messaging API → เปิด <b>Use webhook</b></p>
                <p>LINE OA Manager → ตั้งค่าการตอบกลับ → ปิด <b>ข้อความตอบกลับอัตโนมัติ</b> (ไม่ให้ตอบซ้ำกับระบบ)</p>
              </Step>
            </ol>
          )}
        </section>
        </aside>
      </div>

      {toast && <Toast {...toast} onClose={() => setToast(null)} duration={4500} />}
    </div>
  )
}
