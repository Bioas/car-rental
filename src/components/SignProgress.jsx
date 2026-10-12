import React from 'react'
import { chainStepState, docLabel } from '../lib/constants'
import { useChainSteps } from '../lib/docSettings'

const SEGMENT_CLASSES = {
  signed: 'bg-emerald-500 dark:bg-emerald-400',
  rejected: 'bg-rose-500 dark:bg-rose-400',
  current: 'bg-amber-400 dark:bg-amber-400 motion-safe:animate-pulse',
  waiting: 'bg-gray-200 dark:bg-gray-600',
  skipped: 'bg-gray-100 dark:bg-gray-700',
  // Signed with a pen on the printed form — sky blue like the printer step in
  // the document timeline (BookingDetailModal), lightly striped because it
  // happens outside the system.
  paper: 'bg-[repeating-linear-gradient(135deg,#38bdf8_0_3px,#7dd3fc_3px_6px)] dark:bg-[repeating-linear-gradient(135deg,#0ea5e9_0_3px,#0369a1_3px_6px)]',
}

// Compact one-line view of the signature chain for a lookup result card: one
// segment per step (requester + five staff stages) and a sentence saying who
// the document is waiting on. Stages signed on paper are shown but not counted.
// The full timeline lives in BookingDetailModal.
export default function SignProgress({ booking }) {
  const CHAIN_STEPS = useChainSteps()
  const states = CHAIN_STEPS.map((step) => chainStepState(booking, step.key))
  const signedCount = states.filter((s) => s === 'signed').length
  const systemCount = states.filter((s) => s !== 'paper').length
  const paperSteps = CHAIN_STEPS.filter((_, i) => states[i] === 'paper')
  const rejectedAt = CHAIN_STEPS.find((_, i) => states[i] === 'rejected')
  const current = CHAIN_STEPS.filter((_, i) => states[i] === 'current')

  let message
  let tone
  if (rejectedAt) {
    message = `ไม่อนุญาตโดย${rejectedAt.title}`
    tone = 'text-rose-600 dark:text-rose-400'
  } else if (booking.status === 'rejected') {
    message = 'คำขอถูกปฏิเสธ'
    tone = 'text-rose-600 dark:text-rose-400'
  } else if (signedCount === systemCount) {
    message = paperSteps.length
      ? `เซ็นในระบบครบแล้ว · ${paperSteps.map((s) => s.title).join(', ')} เซ็นบนเอกสารจริง`
      : 'เซ็นครบทุกขั้นแล้ว'
    tone = 'text-emerald-600 dark:text-emerald-400'
  } else if (current.length > 0) {
    message = `รอ${current.map((s) => s.title).join(', ')}`
    tone = 'text-amber-600 dark:text-amber-400'
  } else {
    message = 'การเซ็นเอกสารสิ้นสุดแล้ว'
    tone = 'text-gray-500 dark:text-gray-400'
  }

  return (
    <div className="mt-3">
      <div className="flex gap-1" role="img"
        aria-label={`เซ็นแล้ว ${signedCount} จาก ${systemCount} ขั้น${paperSteps.length ? ` (อีก ${paperSteps.length} ขั้นเซ็นบนกระดาษ)` : ''}`}>
        {CHAIN_STEPS.map((step, i) => (
          <span key={step.key} title={states[i] === 'paper' ? `${step.title} (เซ็นบนเอกสารจริง)` : step.title}
            className={`h-1.5 flex-1 rounded-full ${SEGMENT_CLASSES[states[i]]}`} />
        ))}
      </div>
      <div className="mt-1.5 flex items-start justify-between gap-3 text-[11px]">
        <span className={`flex items-start gap-1 min-w-0 ${tone}`}>
          <i aria-hidden="true" className="bx bx-edit-alt text-sm leading-none mt-px shrink-0"></i>
          <span className="line-clamp-2">{message}</span>
        </span>
        <span className="shrink-0 text-gray-400 dark:text-gray-500 tabular-nums">
          {signedCount}/{systemCount}{booking.doc_number ? ` · เลขที่ ${docLabel(booking)}` : ''}
        </span>
      </div>
    </div>
  )
}
