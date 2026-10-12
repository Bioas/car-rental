// LINE Messaging API — the channel drivers get notified on.
//
// Drivers have no account to sign in to, so in-app notifications cannot reach
// them. Instead each driver links their own LINE account to the college's LINE
// Official Account (see api/routes/line.cjs) and the system pushes messages to
// it. SMS was the alternative but costs money per message; a LINE OA's free
// plan covers a monthly quota of push messages, and replies to a driver's own
// message (link confirmation, "คิว" lookups) do not count against it.
//
// Configuration is set by an admin in ตั้งค่า → LINE (stored as the `line`
// settings document) and falls back to environment variables:
//   LINE_CHANNEL_ACCESS_TOKEN  long-lived channel access token
//   LINE_CHANNEL_SECRET        channel secret, verifies webhook signatures
//   LINE_BOT_ID                basic ID such as @123abcde, for the add-friend link
//   APP_URL                    public site URL (links in messages, webhook URL)
//   DRIVER_REMINDER_HOUR       evening-before reminder hour, or "off"
// Without a token + secret the feature is off and nothing is sent.

const crypto = require('crypto')
const { collections, findOne } = require('../db.cjs')

const API = 'https://api.line.me/v2/bot'
// LINE caps a text message at 5,000 characters.
const MAX_TEXT = 5000
const SETTINGS_ID = 'line'
const CACHE_MS = 30_000
const DEFAULT_REMINDER_HOUR = 17

let cache = null
let cacheAt = 0

async function storedSettings() {
  if (cache && Date.now() - cacheAt < CACHE_MS) return cache
  cache = (await findOne(collections.settings, { _id: SETTINGS_ID })) || {}
  cacheAt = Date.now()
  return cache
}

/** Drop the cached settings document (after an admin saves). */
function invalidateLineConfig() {
  cache = null
}

function envReminderHour() {
  const raw = process.env.DRIVER_REMINDER_HOUR
  if (raw === undefined || raw === '') return DEFAULT_REMINDER_HOUR
  if (String(raw).toLowerCase() === 'off') return null
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : DEFAULT_REMINDER_HOUR
}

/** Effective configuration: saved settings first, then environment variables. */
async function lineConfig() {
  const s = await storedSettings()
  const env = process.env
  return {
    token: s.channel_access_token || env.LINE_CHANNEL_ACCESS_TOKEN || '',
    secret: s.channel_secret || env.LINE_CHANNEL_SECRET || '',
    botId: s.bot_id || env.LINE_BOT_ID || '',
    botName: s.bot_name || '',
    botPicture: s.bot_picture || '',
    appUrl: String(s.app_url || env.APP_URL || '').replace(/\/+$/, ''),
    reminderHour: 'reminder_hour' in s ? s.reminder_hour : envReminderHour(),
    source: s.channel_access_token ? 'database' : env.LINE_CHANNEL_ACCESS_TOKEN ? 'env' : 'none',
  }
}

async function isLineConfigured() {
  const { token, secret } = await lineConfig()
  return !!(token && secret)
}

function normalizeBotId(botId) {
  if (!botId) return ''
  return botId.startsWith('@') ? botId : `@${botId}`
}

/** https://line.me/R/ti/p/@xxxx — opens the OA's add-friend screen. */
function addFriendUrl(botId) {
  const id = normalizeBotId(botId)
  return id ? `https://line.me/R/ti/p/${encodeURIComponent(id)}` : ''
}

/** What the browser needs to show the "link LINE" steps. */
async function linePublicInfo() {
  const c = await lineConfig()
  return { configured: !!(c.token && c.secret), add_friend_url: addFriendUrl(c.botId), bot_id: normalizeBotId(c.botId) }
}

/**
 * Webhook requests carry `x-line-signature`: base64 HMAC-SHA256 of the raw
 * body keyed with the channel secret. Anything else is not from LINE.
 */
async function verifySignature(rawBody, signature) {
  const { secret } = await lineConfig()
  if (!secret || !signature || !rawBody) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest()
  const given = Buffer.from(String(signature), 'base64')
  return given.length === expected.length && crypto.timingSafeEqual(given, expected)
}

/** One LINE API call. Throws with LINE's own message on a non-2xx answer. */
async function call(method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text().catch(() => '')
  let data = {}
  try { data = text ? JSON.parse(text) : {} } catch { data = {} }
  if (!res.ok) {
    const err = new Error(data.message || `LINE ${path} ${res.status}`)
    err.status = res.status
    err.details = data.details
    throw err
  }
  return data
}

function textMessage(text) {
  return { type: 'text', text: String(text).slice(0, MAX_TEXT) }
}

/** Push a text message to a LINE user. Resolves false when LINE is not set up. */
async function pushText(to, text) {
  const { token, secret } = await lineConfig()
  if (!token || !secret || !to) return false
  await call('POST', '/message/push', { token, body: { to, messages: [textMessage(text)] } })
  return true
}

/** Answer a webhook event (free — replies do not use the push quota). */
async function replyText(replyToken, text) {
  const { token, secret } = await lineConfig()
  if (!token || !secret || !replyToken) return false
  await call('POST', '/message/reply', { token, body: { replyToken, messages: [textMessage(text)] } })
  return true
}

// ─── Setup helpers (ตั้งค่า → LINE) ───

/** The OA behind a token — validates the token and gives the basic ID. */
async function fetchBotInfo(token) {
  return call('GET', '/info', { token })
}

async function setWebhookEndpoint(token, endpoint) {
  return call('PUT', '/channel/webhook/endpoint', { token, body: { endpoint } })
}

/** { endpoint, active } — `active` is the console's "Use webhook" switch. */
async function getWebhookInfo(token) {
  return call('GET', '/channel/webhook/endpoint', { token })
}

/** LINE sends a test event to the webhook and reports what came back. */
async function testWebhook(token) {
  return call('POST', '/channel/webhook/test', { token, body: {} })
}

/** This month's push quota: { limit: number|null (null = unlimited), used }. */
async function messageQuota(token) {
  const [quota, usage] = await Promise.all([
    call('GET', '/message/quota', { token }),
    call('GET', '/message/quota/consumption', { token }),
  ])
  return { limit: quota.type === 'limited' ? quota.value : null, used: usage.totalUsage ?? 0 }
}

module.exports = {
  SETTINGS_ID, lineConfig, invalidateLineConfig, isLineConfigured, addFriendUrl, normalizeBotId, linePublicInfo,
  verifySignature, pushText, replyText, fetchBotInfo, setWebhookEndpoint, getWebhookInfo, testWebhook, messageQuota,
}
