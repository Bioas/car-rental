// Renders a booking's loan-request document as a PDF, reproducing the
// paper form ("แบบขออนุญาตใช้รถวิทยาลัยเทคนิคบุรีรัมย์") field-for-field: the
// same letter-style body, the same "บันทึกความคิดเห็นหัวหน้าหมวดยานยนต์" section,
// and the same two-column signature rows ending in the director's
// อนุญาต/ไม่อนุญาต checkboxes. Built with pdf-lib — chosen over a
// headless-browser renderer (e.g. Puppeteer) because Vercel's serverless
// functions cannot reliably bundle/launch Chromium.
//
// Thai text needs an embedded font: pdf-lib's built-in Helvetica has no Thai
// glyphs. api/assets/fonts/Sarabun-*.ttf (Cadson Demak, SIL Open Font
// License — see the accompanying OFL-Sarabun.txt) is bundled for that
// purpose and registered through @pdf-lib/fontkit, which pdf-lib needs for
// any font that isn't one of its 14 built-in Latin ones. Sarabun specifically
// (not e.g. Noto Sans Thai) because it's the open-source sibling of TH
// Sarabun New, the mandated Thai government document font — fitting for a
// government loan-request form, and its glyph metrics behave correctly with
// pdf-lib's embedding (see the `subset: true` note below).
const fs = require('fs')
const path = require('path')
const { PDFDocument, rgb } = require('pdf-lib')
const fontkit = require('@pdf-lib/fontkit')
const { getDocSettings } = require('./doc-settings.cjs')
const { assignedSignerNames } = require('./paper-signers.cjs')
const { collections, find, str } = require('../db.cjs')

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts')
// Font files (~90 KB each) are read from disk once per process, not per PDF.
let fontBytes = null
function loadFonts() {
  if (!fontBytes) {
    fontBytes = {
      regular: fs.readFileSync(path.join(FONT_DIR, 'Sarabun-Regular.ttf')),
      bold: fs.readFileSync(path.join(FONT_DIR, 'Sarabun-Bold.ttf')),
    }
  }
  return fontBytes
}
const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

// "08:00" → "08.00" for the form's "เวลา …… น." blank; blank for whole-day bookings.
function pdfTime(t) {
  return t ? t.replace(':', '.') : ''
}

function dateParts(value) {
  if (!value) return { day: '', month: '', year: '' }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return { day: '', month: '', year: '' }
  return { day: String(d.getDate()), month: THAI_MONTHS_FULL[d.getMonth()], year: String(d.getFullYear() + 543) }
}

function thaiDateFull(value) {
  const { day, month, year } = dateParts(value)
  return day ? `${day} ${month} ${year}` : '-'
}

/** Embed a `data:image/...;base64,...` signature as a pdf-lib image, or null
 * if it's missing/unparseable (a rejected or not-yet-reached stage). */
async function embedSignatureImage(pdfDoc, dataUri) {
  if (typeof dataUri !== 'string' || !dataUri.startsWith('data:image/')) return null
  const match = dataUri.match(/^data:image\/(png|jpe?g);base64,(.+)$/)
  if (!match) return null
  const bytes = Buffer.from(match[2], 'base64')
  try {
    return match[1] === 'png' ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes)
  } catch {
    return null
  }
}

async function renderBookingPdf(booking, car) {
  // Agency header, stage titles, etc. come from the admin's document settings
  // (api/lib/doc-settings.cjs) — defaults reproduce the original paper form.
  // Every lookup the page needs, fetched together rather than one round trip
  // after another: settings, the fleet and drivers for the checklists, and who
  // is assigned to each signing stage.
  const ended = booking.status === 'rejected' || booking.status === 'cancelled'
  const [settings, fleet, drivers, assigned] = await Promise.all([
    getDocSettings(),
    find(collections.cars, { status: { $ne: 'retired' } }, { projection: { license_plate: 1 }, sort: { license_plate: 1 } }),
    find(collections.users, { role: 'driver' }, { projection: { name: 1, phone: 1 }, sort: { name: 1 } }),
    ended ? new Map() : assignedSignerNames(),
  ])
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)

  const { regular: regularBytes, bold: boldBytes } = loadFonts()
  // subset: true is required, not just an optimization — pdf-lib's non-subset
  // embedder builds the PDF's glyph-width table by walking the font's plain
  // codepoint->glyph map, which never visits glyphs that only exist as GSUB
  // mark-positioning substitutions (e.g. a tone mark stacked over a vowel).
  // Those glyphs then fall back to the font's default width instead of their
  // true (zero) advance, which visibly pushes the next character away from
  // Thai vowel+tone-mark clusters. The subset embedder instead records each
  // glyph actually produced by shaping as text is drawn, so those widths end
  // up correct.
  const font = await pdfDoc.embedFont(regularBytes, { subset: true })
  const bold = await pdfDoc.embedFont(boldBytes, { subset: true })

  const PAGE_W = 595.28 // A4
  const PAGE_H = 841.89
  const MARGIN = 50
  const CONTENT_W = PAGE_W - MARGIN * 2
  const page = pdfDoc.addPage([PAGE_W, PAGE_H])

  const ink = rgb(0.1, 0.1, 0.12)
  const penBlue = rgb(0.1, 0.16, 0.55) // filled-in values read like pen ink on the real form
  const dotColor = rgb(0.55, 0.55, 0.58)

  function text(str, x, yPos, { size = 10.5, f = font, color = ink } = {}) {
    page.drawText(str || '', { x, y: yPos, size, font: f, color })
    return f.widthOfTextAtSize(str || '', size)
  }

  function measure(str, { size = 10.5, f = font } = {}) {
    return f.widthOfTextAtSize(str || '', size)
  }

  function centeredText(str, yPos, { size = 16, f = bold, color = ink } = {}) {
    const w = f.widthOfTextAtSize(str, size)
    text(str, (PAGE_W - w) / 2, yPos, { size, f, color })
  }

  /** Truncates `str` with an ellipsis so it fits within `maxWidth`. */
  function fit(str, f, size, maxWidth) {
    str = String(str || '')
    if (f.widthOfTextAtSize(str, size) <= maxWidth) return str
    let lo = 0, hi = str.length
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (f.widthOfTextAtSize(str.slice(0, mid) + '…', size) <= maxWidth) lo = mid
      else hi = mid - 1
    }
    return str.slice(0, lo) + '…'
  }

  function dottedLine(x1, x2, yPos) {
    page.drawLine({ start: { x: x1, y: yPos }, end: { x: x2, y: yPos }, thickness: 0.75, color: dotColor, dashArray: [1, 1.5] })
  }

  // Renders one letter-body line as a sequence of static labels and
  // fill-in-the-blank segments, left to right — mirrors how the paper form
  // mixes pre-printed text with dotted blanks on the same line.
  function row(y, parts, { size = 10.5 } = {}) {
    let x = MARGIN
    for (const part of parts) {
      if (part.blank === undefined) {
        x += text(part.text, x, y, { size, f: part.bold ? bold : font })
      } else {
        const w = part.blank
        dottedLine(x, x + w, y - 3)
        // Filled-in values sit centred on their dotted blank, like handwriting.
        if (part.value) {
          const value = fit(part.value, font, size, w - 4)
          text(value, x + (w - measure(value, { size })) / 2, y, { size, f: font, color: penBlue })
        }
        x += w
      }
    }
  }

  function underline(str, x, yPos, { size = 11, f = bold, color = ink } = {}) {
    const w = text(str, x, yPos, { size, f, color })
    page.drawLine({ start: { x, y: yPos - 2 }, end: { x: x + w, y: yPos - 2 }, thickness: 0.6, color })
  }

  let y = PAGE_H - MARGIN
  const SIGN_LINE_W = 140 // length of every dotted line that is signed on

  // Signatures are drawn as large as fits over their line (max 30pt tall).
  // Drawn ones arrive trimmed to the ink (SignaturePad), so a small image may
  // be enlarged — up to 2× so a tiny one isn't blown up into a blur.
  function signatureScale(img, maxWidth) {
    return Math.min(maxWidth / img.width, 30 / img.height, 2)
  }

  // ── Header ──
  const docNoLabel = 'เลขที่ '
  const docNoValue = String(booking.doc_label || booking.doc_number || '')
  // The blank grows with the value — a prefixed/suffixed number such as
  // "ศธ 0606/12/2569" is wider than the plain running number.
  const docNoBlank = Math.max(50, font.widthOfTextAtSize(docNoValue, 10.5) + 24)
  const docNoX = PAGE_W - MARGIN - bold.widthOfTextAtSize(docNoLabel, 10.5) - docNoBlank
  text(docNoLabel, docNoX, y, { size: 10.5 })
  dottedLine(docNoX + bold.widthOfTextAtSize(docNoLabel, 10.5), docNoX + bold.widthOfTextAtSize(docNoLabel, 10.5) + docNoBlank, y - 3)
  text(docNoValue, docNoX + bold.widthOfTextAtSize(docNoLabel, 10.5) + (docNoBlank - font.widthOfTextAtSize(docNoValue, 10.5)) / 2, y, { size: 10.5, color: penBlue })
  y -= 26

  centeredText(settings.form_title, y)
  y -= 30

  // ── บันทึกความคิดเห็นหัวหน้าหมวดยานยนต์ data ──
  // Like the paper form: every vehicle (by plate) and every driver is printed
  // with a "( )" box, and the ones chosen for this request are ticked. A
  // self-drive request (or a driver no longer on the roster) ticks "อื่นๆ"
  // with the name written on its line. Laid out up front: a big fleet wraps
  // onto more lines, and the spacing elsewhere tightens to keep one page.
  const CHECK_SIZE = 10
  const CHECK_LINE = 16
  const CHECK_GAP = 12
  const carId = str(booking.car_id)
  if (car && !fleet.some((c) => str(c._id) === carId)) fleet.push(car)
  const driverId = str(booking.driver_id)
  const driverListed = drivers.some((d) => str(d._id) === driverId)
  const otherDriver = booking.self_drive ? 'ผู้ยืมขับเอง' : (!driverListed && booking.driver_name) || ''
  const checklists = [
    {
      heading: '1. เห็นสมควรใช้รถ  ',
      items: fleet.map((c) => ({ label: c.license_plate || '-', checked: str(c._id) === carId })),
    },
    {
      heading: '2. เห็นควรมอบหมาย พขร.  ',
      items: [
        ...drivers.map((d) => ({ label: d.phone ? `${d.name} ${d.phone}` : d.name, checked: str(d._id) === driverId })),
        { label: 'อื่นๆ', checked: !!otherDriver, blank: 110, value: otherDriver },
      ],
    },
  ]
  /** Positions each option ({ item, x, line }), wrapping under the first one. */
  function layoutChecklist({ heading, items }) {
    const startX = MARGIN + measure(heading, { size: CHECK_SIZE })
    let x = startX
    let line = 0
    const placed = items.map((item) => {
      const w = measure('( )', { size: CHECK_SIZE }) + 3 + measure(item.label, { size: CHECK_SIZE }) + (item.blank || 0)
      if (x > startX && x + w > MARGIN + CONTENT_W) { x = startX; line++ }
      const at = { item, x, line }
      x += w + CHECK_GAP
      return at
    })
    return { heading, placed, lines: line + 1 }
  }
  const laidOut = checklists.map(layoutChecklist)
  const checklistHeight = laidOut.reduce((sum, l) => sum + l.lines * CHECK_LINE + 2, 0)

  // The page was designed around two one-line answers (48pt incl. spacing)
  // with ~36pt to spare at the bottom. Anything beyond that comes out of the
  // gap under the requester's signature, then the signature rows, then the
  // letter-body line height.
  let squeeze = Math.max(0, checklistHeight + 12 - 48 - 36)
  const take = (max) => { const t = Math.min(max, squeeze); squeeze -= t; return t }
  const requesterGap = 70 - take(20)
  const signatureGap = 78 - take(20) / 2
  const BODY_ROWS = 10

  // ── Letter body ──
  const LH = 22 - take(4 * BODY_ROWS) / BODY_ROWS // line height between body rows
  // Field labels of the memo header are bold, as on the paper form.
  {
    const w = text('ส่วนราชการ', MARGIN, y, { size: 10.5, f: bold })
    text(`  ${settings.org_name}${settings.org_phone ? ` ${settings.org_phone}` : ''}`, MARGIN + w, y, { size: 10.5 })
  }
  y -= LH

  row(y, [
    { text: 'ที่ ', bold: true },
    { blank: 110, value: settings.ref_no },
    { text: '  วันที่ ' },
    {
      blank: CONTENT_W - 110 - measure('ที่ ', { size: 10.5, f: bold }) - measure('  วันที่ ', { size: 10.5 }),
      value: thaiDateFull(booking.created_at),
    },
  ])
  y -= LH

  {
    const w = text('เรื่อง', MARGIN, y, { size: 10.5, f: bold })
    text(`  ${settings.subject}`, MARGIN + w, y, { size: 10.5 })
  }
  y -= LH
  text(`เรียน  ${settings.addressee}`, MARGIN, y, { size: 10.5 })
  y -= LH

  {
    const l1 = measure('        ด้วยข้าพเจ้า ', { size: 10.5 })
    const l2 = measure('  ตำแหน่ง ', { size: 10.5 })
    const l3 = measure('  เบอร์โทร ', { size: 10.5 })
    const nameW = 150
    const posW = 110
    const phoneW = CONTENT_W - l1 - nameW - l2 - posW - l3
    row(y, [
      { text: '        ด้วยข้าพเจ้า ' },
      { blank: nameW, value: booking.user_name },
      { text: '  ตำแหน่ง ' },
      { blank: posW, value: booking.user_position },
      { text: '  เบอร์โทร ' },
      { blank: phoneW, value: booking.user_phone },
    ])
  }
  y -= LH

  {
    // The purpose follows straight on after "เพื่อ" when it fits there; a
    // longer one carries on to the full-width line below, broken between Thai
    // words (Intl.Segmenter) rather than mid-word.
    const lbl = 'มีความประสงค์จะขออนุญาตใช้รถยนต์ของทางราชการในการเดินทางไปราชการ เพื่อ '
    const lblW = measure(lbl, { size: 10.5 })
    const firstW = CONTENT_W - lblW
    const purpose = String(booking.purpose || '').replace(/\s+/g, ' ').trim()
    let head = purpose
    let rest = ''
    if (measure(purpose) > firstW - 4) {
      head = ''
      const words = [...new Intl.Segmenter('th', { granularity: 'word' }).segment(purpose)].map((s) => s.segment)
      let i = 0
      while (i < words.length && measure(head + words[i]) <= firstW - 4) head += words[i++]
      rest = words.slice(i).join('').trim()
    }
    if (rest) {
      // Wrapped text reads as one sentence, so both lines start at the left.
      row(y, [{ text: lbl }, { blank: firstW }])
      text(head, MARGIN + lblW + 2, y, { size: 10.5, color: penBlue })
      y -= LH
      row(y, [{ blank: CONTENT_W }])
      text(fit(rest, font, 10.5, CONTENT_W - 4), MARGIN + 2, y, { size: 10.5, color: penBlue })
    } else {
      row(y, [{ text: lbl }, { blank: firstW, value: head }])
      y -= LH
      row(y, [{ blank: CONTENT_W }])
    }
  }
  y -= LH

  {
    const l1 = measure('สถานที่ ', { size: 10.5 })
    const l2 = measure('  อำเภอ ', { size: 10.5 })
    const l3 = measure('  จังหวัด ', { size: 10.5 })
    const placeW = 190
    const distW = 110
    const provW = CONTENT_W - l1 - placeW - l2 - distW - l3
    row(y, [
      { text: 'สถานที่ ' },
      { blank: placeW, value: booking.destination_place },
      { text: '  อำเภอ ' },
      { blank: distW, value: booking.destination_district },
      { text: '  จังหวัด ' },
      { blank: provW, value: booking.destination_province },
    ])
  }
  y -= LH

  {
    const start = dateParts(booking.start_date)
    const labels = ['โดยมีผู้ไปราชการ ', ' คน ตั้งแต่วันที่ ', ' เดือน ', ' พ.ศ. ', ' เวลา ', ' น.']
    const size = 9.3
    const lw = labels.map((l) => measure(l, { size }))
    const blanks = { attendees: 26, day: 22, month: 78, year: 36 }
    const lastW = CONTENT_W - lw.reduce((a, b) => a + b, 0) - blanks.attendees - blanks.day - blanks.month - blanks.year
    row(y, [
      { text: labels[0] }, { blank: blanks.attendees, value: booking.attendees ? String(booking.attendees) : '' },
      { text: labels[1] }, { blank: blanks.day, value: start.day },
      { text: labels[2] }, { blank: blanks.month, value: start.month },
      { text: labels[3] }, { blank: blanks.year, value: start.year },
      { text: labels[4] }, { blank: lastW, value: pdfTime(booking.start_time) },
      { text: labels[5] },
    ], { size })
  }
  y -= LH

  {
    const end = dateParts(booking.end_date)
    const labels = ['ถึงวันที่ ', ' เดือน ', ' พ.ศ. ', ' เวลา ', ' น.']
    const size = 9.3
    const lw = labels.map((l) => measure(l, { size }))
    const blanks = { day: 26, month: 90, year: 40 }
    const lastW = CONTENT_W - lw.reduce((a, b) => a + b, 0) - blanks.day - blanks.month - blanks.year
    row(y, [
      { text: labels[0] }, { blank: blanks.day, value: end.day },
      { text: labels[1] }, { blank: blanks.month, value: end.month },
      { text: labels[2] }, { blank: blanks.year, value: end.year },
      { text: labels[3] }, { blank: lastW, value: pdfTime(booking.end_time) },
      { text: labels[4] },
    ], { size })
  }
  y -= LH

  text('        จึงเรียนมาเพื่อโปรดพิจารณาอนุญาต', MARGIN, y, { size: 10.5 })
  y -= 34

  // ── Requester signature (right side) ──
  {
    const labelText = 'ผู้ขออนุญาต'
    const labelW = measure(labelText, { size: 10 })
    const blockW = SIGN_LINE_W
    // Inset from the right margin like the paper form, where "ผู้ขออนุญาต" ends
    // well short of the page edge.
    const rightInset = 70
    const blockX = PAGE_W - MARGIN - rightInset - labelW - 6 - blockW
    const requester = booking.signatures?.requester
    const lineY = y - 6
    const img = await embedSignatureImage(pdfDoc, requester?.image)
    if (img) {
      const scale = signatureScale(img, blockW)
      page.drawImage(img, { x: blockX + (blockW - img.width * scale) / 2, y: lineY + 4, width: img.width * scale, height: img.height * scale })
    }
    dottedLine(blockX, blockX + blockW, lineY)
    text(labelText, blockX + blockW + 6, lineY - 4, { size: 10 })
    const nameLabel = `(${requester?.name || booking.user_name || ''})`
    const nameW = measure(nameLabel, { size: 10 })
    text(fit(nameLabel, font, 10, blockW), blockX + (blockW - Math.min(nameW, blockW)) / 2, lineY - 18, { size: 10 })
  }
  y -= requesterGap

  // ── บันทึกความคิดเห็นหัวหน้าหมวดยานยนต์ ──
  underline('บันทึกความคิดเห็นหัวหน้าหมวดยานยนต์', MARGIN, y, { size: 11 })
  y -= 22

  {
    /** One "( ) label" option. Ticked options get a pen tick over the box. */
    function option(label, x, yPos, checked) {
      const boxW = measure('( )', { size: CHECK_SIZE })
      text('( )', x, yPos, { size: CHECK_SIZE })
      if (checked) {
        const cx = x + boxW / 2
        page.drawLine({ start: { x: cx - 3.2, y: yPos + 3.6 }, end: { x: cx - 0.6, y: yPos + 0.6 }, thickness: 1.3, color: penBlue })
        page.drawLine({ start: { x: cx - 0.6, y: yPos + 0.6 }, end: { x: cx + 5.2, y: yPos + 9.5 }, thickness: 1.3, color: penBlue })
      }
      return boxW + 3 + text(label, x + boxW + 3, yPos, { size: CHECK_SIZE, color: checked ? penBlue : ink })
    }

    for (const { heading, placed, lines } of laidOut) {
      text(heading, MARGIN, y, { size: CHECK_SIZE })
      for (const { item, x, line } of placed) {
        const lineY = y - line * CHECK_LINE
        const end = x + option(item.label, x, lineY, item.checked)
        if (item.blank) {
          dottedLine(end + 2, end + item.blank, lineY - 3)
          if (item.value) text(fit(item.value, font, CHECK_SIZE, item.blank - 6), end + 5, lineY, { size: CHECK_SIZE, color: penBlue })
        }
      }
      y -= lines * CHECK_LINE + 2
    }
  }
  y -= 12

  // ── Signature block helper (centered name/position under a line, with
  //    the signature image drawn just above the line when present). ──
  async function signatureBlock(x, w, yTop, entry, positionLabel) {
    const img = await embedSignatureImage(pdfDoc, entry?.image)
    const lineY = yTop - 34
    if (img) {
      const scale = signatureScale(img, Math.min(w, SIGN_LINE_W))
      page.drawImage(img, { x: x + (w - img.width * scale) / 2, y: lineY + 4, width: img.width * scale, height: img.height * scale })
    }
    // The line to sign on is shorter than the column (the paper form's lines
    // are about this long), centred over the name and position.
    const lineW = Math.min(w, SIGN_LINE_W)
    dottedLine(x + (w - lineW) / 2, x + (w + lineW) / 2, lineY)
    const nameLabel = `(${entry?.name || '..............................'})`
    const nameW = Math.min(measure(nameLabel, { size: 10 }), w)
    text(fit(nameLabel, font, 10, w), x + (w - nameW) / 2, lineY - 14, { size: 10 })
    const posW = bold.widthOfTextAtSize(positionLabel, 10)
    text(positionLabel, x + (w - Math.min(posW, w)) / 2, lineY - 28, { size: 10, f: bold })
    if (entry?.decision === 'reject') {
      text('ไม่อนุญาต', x + (w - bold.widthOfTextAtSize('ไม่อนุญาต', 9)) / 2, lineY - 41, { size: 9, f: bold, color: rgb(0.7, 0.15, 0.15) })
    }
  }

  // A stage signed on paper has no in-system signature: print the signer's
  // name under an empty line so it can be signed with a pen. A stage still
  // waiting to sign in the system shows the staff member assigned to it, so
  // the form reads complete before they sign — unless the document ended
  // (rejected/cancelled) before reaching them.
  const paperSigners = booking.paper_signers || {}
  function entryFor(key) {
    if (booking.signatures?.[key]) return booking.signatures[key]
    if (key in paperSigners) return paperSigners[key] ? { name: paperSigners[key] } : null
    return assigned.get(key) ? { name: assigned.get(key) } : null
  }

  await signatureBlock(PAGE_W / 2 - 110, 220, y, entryFor('vehicle_head'), settings.stage_titles.vehicle_head)
  y -= signatureGap

  // ── เจ้าหน้าที่งานพัสดุ / หัวหน้างานพัสดุ ──
  {
    const colW = CONTENT_W / 2 - 15
    await signatureBlock(MARGIN, colW, y, entryFor('supply_officer'), settings.stage_titles.supply_officer)
    await signatureBlock(MARGIN + CONTENT_W / 2 + 15, colW, y, entryFor('supply_head'), settings.stage_titles.supply_head)
  }
  // The comment row belongs to the signers below it, so it sits nearer them.
  y -= signatureGap + 14

  // ── ความเห็น (deputy director's free-form note) / ความเห็น + checkboxes ──
  {
    const colW = CONTENT_W / 2 - 15
    const rightX = MARGIN + CONTENT_W / 2 + 15
    // Like the paper form, the deputy's comment block sits centred over their
    // column (a little wider than the signature line), with "ความเห็น" at the
    // start of the lines.
    const commentW = Math.min(colW, SIGN_LINE_W * 1.25)
    const commentX = MARGIN + (colW - commentW) / 2
    underline('ความเห็น', commentX, y, { size: 10 })
    dottedLine(commentX, commentX + commentW, y - 16)
    dottedLine(commentX, commentX + commentW, y - 30)

    underline('ความเห็น', rightX, y, { size: 10 })
    const decision = booking.signatures?.director?.decision
    const boxSize = 10
    function checkbox(label, boxY, checked) {
      const boxBottom = boxY - boxSize + 2
      page.drawRectangle({ x: rightX, y: boxBottom, width: boxSize, height: boxSize, borderColor: ink, borderWidth: 0.75 })
      if (checked) {
        // Sarabun has no ✓ glyph (renders as tofu), so the checkmark is two
        // drawn line segments instead of a text character.
        page.drawLine({ start: { x: rightX + 1.8, y: boxBottom + 4.5 }, end: { x: rightX + 4, y: boxBottom + 2 }, thickness: 1.2, color: ink })
        page.drawLine({ start: { x: rightX + 4, y: boxBottom + 2 }, end: { x: rightX + 8.3, y: boxBottom + 8 }, thickness: 1.2, color: ink })
      }
      text(label, rightX + boxSize + 6, boxBottom + 0.5, { size: 10 })
    }
    checkbox('อนุญาต', y - 14, decision === 'approve')
    checkbox('ไม่อนุญาต', y - 30, decision === 'reject')
  }
  y -= 36

  // ── รองผู้อำนวยการฝ่ายบริหารทรัพยากร / ผู้อำนวยการวิทยาลัยเทคนิคบุรีรัมย์ ──
  {
    const colW = CONTENT_W / 2 - 15
    await signatureBlock(MARGIN, colW, y, entryFor('deputy_director'), settings.stage_titles.deputy_director)
    await signatureBlock(MARGIN + CONTENT_W / 2 + 15, colW, y, entryFor('director'), settings.stage_titles.director)
  }

  return pdfDoc.save()
}

module.exports = { renderBookingPdf }
