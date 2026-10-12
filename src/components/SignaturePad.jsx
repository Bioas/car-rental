import React, { useEffect, useRef, useState } from 'react'

// Signatures travel to the backend as base64 PNG data URIs capped at 500,000
// characters (api/lib/signing.cjs's MAX_SIGNATURE_LENGTH mirrors this), so an
// uploaded photo is downscaled through an offscreen canvas before encoding —
// a phone camera shot easily exceeds that limit straight off disk.
const MAX_DIMENSION = 900
const MAX_DATA_URL_LENGTH = 480_000

function drawToCanvas(img) {
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

function canvasToCappedDataUrl(canvas) {
  let quality = 0.92
  let dataUrl = canvas.toDataURL('image/jpeg', quality)
  while (dataUrl.length > MAX_DATA_URL_LENGTH && quality > 0.3) {
    quality -= 0.12
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }
  return dataUrl
}

// ── Pen feel ──
// Strokes are smoothed (quadratic curves through the midpoints of the sampled
// points) and their width follows speed like ink from a real pen: slow → a
// fuller line, fast → thinner. A stylus's pressure is used when it reports one.
const INK = '#111827'
const MIN_WIDTH = 1.3
const MAX_WIDTH = 3.6
const MIN_POINT_GAP = 1.5 // px — closer samples are jitter, not shape

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** Draws `stroke.points[i - 1] → points[i]` as a smoothed, width-varying segment. */
function drawSegment(ctx, points, i) {
  const p0 = points[i - 2] || points[i - 1]
  const p1 = points[i - 1]
  const p2 = points[i]
  const from = i >= 2 ? mid(p0, p1) : p1
  const to = mid(p1, p2)
  ctx.lineWidth = (p1.w + p2.w) / 2
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.quadraticCurveTo(p1.x, p1.y, to.x, to.y)
  ctx.stroke()
}

/** Closes a stroke: from the last midpoint to the final point (or a dot for a tap). */
function drawStrokeEnd(ctx, points) {
  const last = points[points.length - 1]
  if (points.length === 1) {
    ctx.beginPath()
    ctx.arc(last.x, last.y, last.w / 2 + 0.3, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  const from = mid(points[points.length - 2], last)
  ctx.lineWidth = last.w
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(last.x, last.y)
  ctx.stroke()
}

// Space kept around the ink when the signature is trimmed (CSS px).
const TRIM_PADDING = 6

/**
 * The signature as a PNG cropped to its ink plus a small margin, so the PDF
 * draws the signature itself at full size instead of a mostly-empty box.
 * The bounds come from the recorded stroke points (each widened by its line
 * width), not from scanning pixels. '' when nothing has been drawn.
 */
function trimmedSignature(canvas, strokes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const { points } of strokes) {
    for (const p of points) {
      const r = p.w / 2 + 1
      minX = Math.min(minX, p.x - r); maxX = Math.max(maxX, p.x + r)
      minY = Math.min(minY, p.y - r); maxY = Math.max(maxY, p.y + r)
    }
  }
  if (minX === Infinity) return ''
  const ratio = canvas.width / canvas.getBoundingClientRect().width || 1
  const sx = Math.max(0, Math.floor((minX - TRIM_PADDING) * ratio))
  const sy = Math.max(0, Math.floor((minY - TRIM_PADDING) * ratio))
  const sw = Math.min(canvas.width, Math.ceil((maxX + TRIM_PADDING) * ratio)) - sx
  const sh = Math.min(canvas.height, Math.ceil((maxY + TRIM_PADDING) * ratio)) - sy
  if (sw <= 0 || sh <= 0) return canvas.toDataURL('image/png')
  const out = document.createElement('canvas')
  out.width = sw
  out.height = sh
  const ctx = out.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, sw, sh)
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh)
  return out.toDataURL('image/png')
}

function paintBackground(ctx, w, h) {
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = INK
  ctx.strokeStyle = INK
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}

/**
 * Draw-or-upload signature capture. Reports a base64 PNG/JPEG data URI (or
 * '' when cleared) via onChange — used by both the public booking signature
 * screen and the admin sign-queue page.
 */
export default function SignaturePad({ value, onChange }) {
  const [mode, setMode] = useState('draw')
  const canvasRef = useRef(null)
  const strokesRef = useRef([])   // [{ points: [{ x, y, t, w }] }] — kept to redraw/undo
  const activeRef = useRef(null)  // the stroke being drawn, plus its smoothed velocity
  const fileInputRef = useRef(null)
  const [uploadError, setUploadError] = useState('')
  const [strokeCount, setStrokeCount] = useState(0)

  /** Sizes the backing store to CSS size × devicePixelRatio (crisp lines) and repaints every stroke. */
  function setupAndRedraw() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    canvas.width = Math.round(rect.width * ratio)
    canvas.height = Math.round(rect.height * ratio)
    const ctx = canvas.getContext('2d')
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    // White, not transparent: a transparent background prints black in some PDF viewers.
    paintBackground(ctx, rect.width, rect.height)
    for (const { points } of strokesRef.current) {
      for (let i = 1; i < points.length; i++) drawSegment(ctx, points, i)
      drawStrokeEnd(ctx, points)
    }
  }

  // Set up on entering draw mode, and redraw when the pad changes size (e.g. a
  // phone rotating) instead of losing what was already signed.
  useEffect(() => {
    if (mode !== 'draw') return
    strokesRef.current = []
    setStrokeCount(0)
    setupAndRedraw()
    const canvas = canvasRef.current
    if (!canvas || typeof ResizeObserver === 'undefined') return
    let lastWidth = canvas.getBoundingClientRect().width
    const observer = new ResizeObserver(() => {
      const width = canvas.getBoundingClientRect().width
      if (Math.abs(width - lastWidth) < 1) return
      // Keep the signature's shape: scale stored points to the new width.
      const k = width / lastWidth
      for (const { points } of strokesRef.current) {
        for (const p of points) { p.x *= k; p.y *= k }
      }
      lastWidth = width
      setupAndRedraw()
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [mode])

  function pointFromEvent(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, t: e.timeStamp, pressure: e.pressure, pointerType: e.pointerType }
  }

  function widthFor(active, raw, prev) {
    // A stylus that reports real pressure drives the width directly.
    if (raw.pointerType === 'pen' && raw.pressure > 0 && raw.pressure !== 0.5) {
      return MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * raw.pressure
    }
    const dt = Math.max(1, raw.t - prev.t)
    const v = Math.hypot(raw.x - prev.x, raw.y - prev.y) / dt // px per ms
    active.velocity = active.velocity * 0.7 + v * 0.3
    const target = MAX_WIDTH - (MAX_WIDTH - MIN_WIDTH) * Math.min(1, active.velocity / 2.5)
    return prev.w * 0.6 + target * 0.4
  }

  function handlePointerDown(e) {
    if (e.button !== undefined && e.button > 0) return
    e.preventDefault()
    const canvas = canvasRef.current
    canvas.setPointerCapture(e.pointerId)
    const raw = pointFromEvent(e)
    const start = { x: raw.x, y: raw.y, t: raw.t, w: (MIN_WIDTH + MAX_WIDTH) / 2 }
    activeRef.current = { pointerId: e.pointerId, velocity: 0, stroke: { points: [start] } }
  }

  function handlePointerMove(e) {
    const active = activeRef.current
    if (!active || active.pointerId !== e.pointerId) return
    const ctx = canvasRef.current.getContext('2d')
    const points = active.stroke.points
    // Coalesced events carry every sample the hardware reported since the last
    // frame — without them fast strokes turn into straight-edged polygons.
    const events = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : []
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const raw = pointFromEvent(ev)
      const prev = points[points.length - 1]
      if (Math.hypot(raw.x - prev.x, raw.y - prev.y) < MIN_POINT_GAP) continue
      points.push({ x: raw.x, y: raw.y, t: raw.t, w: widthFor(active, raw, prev) })
      drawSegment(ctx, points, points.length - 1)
    }
  }

  function handlePointerUp(e) {
    const active = activeRef.current
    if (!active || (e && active.pointerId !== e.pointerId)) return
    activeRef.current = null
    const canvas = canvasRef.current
    drawStrokeEnd(canvas.getContext('2d'), active.stroke.points)
    strokesRef.current.push(active.stroke)
    setStrokeCount(strokesRef.current.length)
    onChange(trimmedSignature(canvas, strokesRef.current))
  }

  function undoStroke() {
    strokesRef.current.pop()
    setStrokeCount(strokesRef.current.length)
    setupAndRedraw()
    onChange(trimmedSignature(canvasRef.current, strokesRef.current))
  }

  function clearCanvas() {
    strokesRef.current = []
    setStrokeCount(0)
    setupAndRedraw()
    onChange('')
  }

  function handleFile(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    setUploadError('')
    if (!file.type.startsWith('image/')) {
      setUploadError('กรุณาเลือกไฟล์รูปภาพ')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = drawToCanvas(img)
        onChange(canvasToCappedDataUrl(canvas))
      }
      img.onerror = () => setUploadError('ไม่สามารถอ่านไฟล์รูปภาพนี้ได้')
      img.src = reader.result
    }
    reader.onerror = () => setUploadError('ไม่สามารถอ่านไฟล์นี้ได้')
    reader.readAsDataURL(file)
  }

  function switchMode(next) {
    setMode(next)
    onChange('')
    setUploadError('')
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <button type="button" onClick={() => switchMode('draw')}
          className={`flex-1 h-10 rounded-xl text-sm font-semibold border-2 transition-all flex items-center justify-center gap-1.5 ${
            mode === 'draw'
              ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-900/30 dark:text-brand-300'
              : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
          }`}>
          <i aria-hidden="true" className="bx bx-pencil text-base"></i>
          วาดลายเซ็น
        </button>
        <button type="button" onClick={() => switchMode('upload')}
          className={`flex-1 h-10 rounded-xl text-sm font-semibold border-2 transition-all flex items-center justify-center gap-1.5 ${
            mode === 'upload'
              ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-900/30 dark:text-brand-300'
              : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
          }`}>
          <i aria-hidden="true" className="bx bx-upload text-base"></i>
          อัปโหลดรูป
        </button>
      </div>

      {mode === 'draw' ? (
        <div>
          <div className="relative">
            <canvas ref={canvasRef}
              className="block w-full h-48 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 bg-white touch-none select-none cursor-crosshair"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onContextMenu={e => e.preventDefault()} />
            {/* Guide line to sign on — drawn over the canvas, never into the image. */}
            <div aria-hidden="true" className="pointer-events-none absolute left-6 right-6 bottom-12 flex items-end gap-1.5">
              <span className="text-gray-300 text-sm leading-none -mb-0.5">×</span>
              <span className="flex-1 border-b border-gray-200" />
            </div>
            {strokeCount === 0 && (
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-gray-300">
                เซ็นชื่อตรงนี้
              </span>
            )}
          </div>
          <div className="flex items-center justify-between mt-2 gap-3">
            <p className="text-xs text-gray-400">ลงลายมือชื่อด้วยนิ้ว ปากกา หรือเมาส์ในกรอบด้านบน</p>
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={undoStroke} disabled={strokeCount === 0}
                className="h-9 px-2 -mx-1 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1">
                <i aria-hidden="true" className="bx bx-undo text-sm"></i> ย้อนกลับ
              </button>
              <button type="button" onClick={clearCanvas} disabled={strokeCount === 0}
                className="h-9 px-2 -mx-1 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1">
                <i aria-hidden="true" className="bx bx-eraser text-sm"></i> ล้าง
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          {value ? (
            <div className="relative">
              <img src={value} alt="ลายเซ็นที่อัปโหลด" className="w-full h-48 object-contain rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white" />
              <button type="button" onClick={() => onChange('')} aria-label="ลบลายเซ็นที่อัปโหลด"
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80">
                <i aria-hidden="true" className="bx bx-x text-base"></i>
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => fileInputRef.current && fileInputRef.current.click()}
              className="w-full h-48 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-brand-400 hover:text-brand-500 transition-colors">
              <i aria-hidden="true" className="bx bx-image-add text-3xl"></i>
              <span className="text-sm">แตะเพื่อเลือกรูปลายเซ็น</span>
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
          {uploadError && <p className="text-xs text-red-500 mt-2">{uploadError}</p>}
        </div>
      )}
    </div>
  )
}
