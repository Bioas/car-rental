import React, { useState } from 'react'
import { useApp } from '../context/AppContext'
import SignaturePad from './SignaturePad'
import { useSavedSignature } from '../lib/savedSignature'

function fmtDate(value) {
  return new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * A staff signer's saved signature: view, replace or delete it. Reused with
 * one tap in the sign modal (SignDocumentModal). Lives on the profile page.
 */
export default function SavedSignatureManager() {
  const { authHeaders } = useApp()
  const saved = useSavedSignature(authHeaders)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const showPad = editing || (saved.loaded && !saved.signature)

  async function run(fn, message) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await fn()
      setNotice(message)
      setEditing(false)
      setDraft('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {!saved.loaded ? (
        <div className="h-48 rounded-xl bg-gray-50 dark:bg-gray-800/50 animate-pulse" />
      ) : showPad ? (
        <>
          <SignaturePad value={draft} onChange={setDraft} />
          <div className="flex gap-3 mt-4">
            {saved.signature && (
              <button type="button" disabled={busy} onClick={() => { setEditing(false); setDraft('') }}
                className="h-10 px-5 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50">
                ยกเลิก
              </button>
            )}
            <button type="button" disabled={busy || !draft} onClick={() => run(() => saved.save(draft), 'บันทึกลายเซ็นแล้ว')}
              className="flex-1 h-10 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {busy && <i className="bx bx-loader-alt animate-spin"></i>}
              บันทึกลายเซ็น
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white p-4 flex items-center justify-center h-40">
            <img src={saved.signature} alt="ลายเซ็นที่บันทึกไว้" className="max-h-full max-w-full object-contain" />
          </div>
          {saved.updatedAt && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">บันทึกเมื่อ {fmtDate(saved.updatedAt)}</p>
          )}
          <div className="flex gap-3 mt-4">
            <button type="button" disabled={busy} onClick={() => run(() => saved.remove(), 'ลบลายเซ็นที่บันทึกไว้แล้ว')}
              className="h-10 px-5 rounded-xl text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50">
              ลบ
            </button>
            <button type="button" disabled={busy} onClick={() => { setEditing(true); setNotice('') }}
              className="flex-1 h-10 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors disabled:opacity-50">
              <i className="bx bx-pencil"></i> เปลี่ยนลายเซ็น
            </button>
          </div>
        </>
      )}

      {error && <p className="text-sm text-red-500 dark:text-red-400 mt-3">{error}</p>}
      {notice && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-3 flex items-center gap-1.5">
          <i className="bx bx-check-circle"></i> {notice}
        </p>
      )}
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-4">
        ใช้ได้ทันทีด้วยปุ่ม "ใช้ลายเซ็นที่บันทึกไว้" ในหน้าต่างเซ็นเอกสาร — ระบบไม่เซ็นแทนโดยอัตโนมัติ
      </p>
    </div>
  )
}
