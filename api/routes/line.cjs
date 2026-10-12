// LINE webhook (set in LINE Developers → Messaging API → Webhook URL as
// https://<host>/api/line/webhook).
//
//  - A driver sends the 6-digit code from the /driver page → their LINE
//    account is linked and receives trip notifications from then on.
//  - A linked driver sends "คิว" / "งาน" / "ตาราง" → the reply lists their
//    upcoming trips (replies are free; they do not use the push quota).
//  - Blocking the OA (unfollow) unlinks the account.
//
// Every request must carry a valid x-line-signature over the raw body.

const { Router } = require('express')
const { collections, findOne } = require('../db.cjs')
const { verifySignature, replyText, isLineConfigured } = require('../lib/line.cjs')
const { consumeLinkCode, unlinkLine, upcomingTripsText } = require('../lib/drivers.cjs')

const router = Router()

const HELP = 'สวัสดีครับ 👋 นี่คือระบบแจ้งเตือนงานขับรถของวิทยาลัยเทคนิคบุรีรัมย์\n\n'
  + 'เชื่อมบัญชี: เปิดหน้า "ตารางงานพนักงานขับรถ" เลือกชื่อของคุณ กด "เชื่อมต่อ LINE" แล้วส่งรหัส 6 หลักมาที่แชทนี้'
const LINKED_HELP = 'พิมพ์ "คิว" เพื่อดูงานขับรถที่กำลังจะถึง'
const SCHEDULE_WORDS = ['คิว', 'งาน', 'ตาราง', 'วันนี้', 'พรุ่งนี้']

async function handleEvent(event) {
  const lineUserId = event.source && event.source.userId
  if (!lineUserId) return

  if (event.type === 'unfollow') {
    await unlinkLine({ lineUserId })
    return
  }

  if (event.type === 'follow') {
    const linked = await findOne(collections.users, { line_user_id: lineUserId })
    await replyText(event.replyToken, linked ? `ยินดีต้อนรับกลับ ${linked.name}\n${LINKED_HELP}` : HELP)
    return
  }

  if (event.type !== 'message' || event.message?.type !== 'text') return
  const text = String(event.message.text || '').trim()

  const code = /^\d{6}$/.exec(text.replace(/\s/g, ''))
  if (code) {
    const driver = await consumeLinkCode(code[0], lineUserId)
    await replyText(event.replyToken, driver
      ? `✅ เชื่อมต่อสำเร็จ\nคุณ ${driver.name} จะได้รับแจ้งเตือนงานขับรถทาง LINE นี้\n\n${LINKED_HELP}`
      : '❌ รหัสไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอรหัสใหม่จากหน้าตารางงาน')
    return
  }

  const driver = await findOne(collections.users, { role: 'driver', line_user_id: lineUserId })
  if (!driver) {
    await replyText(event.replyToken, HELP)
    return
  }
  if (SCHEDULE_WORDS.some((w) => text.includes(w))) {
    await replyText(event.replyToken, await upcomingTripsText(driver))
    return
  }
  await replyText(event.replyToken, LINKED_HELP)
}

router.post('/webhook', async (req, res) => {
  if (!(await isLineConfigured())) return res.status(503).json({ error: 'LINE is not configured' })
  if (!(await verifySignature(req.rawBody, req.get('x-line-signature')))) {
    return res.status(401).json({ error: 'invalid signature' })
  }
  const events = Array.isArray(req.body && req.body.events) ? req.body.events : []
  // LINE retries on non-2xx, so one bad event must not fail the batch.
  for (const event of events) {
    try {
      await handleEvent(event)
    } catch (err) {
      console.error('[line] webhook event:', err && err.message)
    }
  }
  res.json({ ok: true })
})

module.exports = router
