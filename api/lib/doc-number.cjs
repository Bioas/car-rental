const { collections } = require('../db.cjs')

// Atomically allocate the next printed document number (the "เลขที่" box on
// the paper form). A single counter document is incremented via
// findOneAndUpdate's atomic $inc, so two bookings created at the same instant
// can never be handed the same number — same race-safety concern as the
// booking overlap check, just without needing withLock since Mongo's $inc
// is already atomic server-side.
async function nextDocNumber() {
  const doc = await collections.counters().findOneAndUpdate(
    { _id: 'doc_number' },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: 'after' }
  )
  return doc.value
}

// Where numbering stands: the last number handed out, the number the next
// booking will get, and the highest number any booking actually carries (so
// the settings page can warn before a restart reuses numbers).
async function docNumberState() {
  const [counter, highest] = await Promise.all([
    collections.counters().findOne({ _id: 'doc_number' }),
    collections.bookings().find({ doc_number: { $type: 'number' } }, { projection: { doc_number: 1 } })
      .sort({ doc_number: -1 }).limit(1).next(),
  ])
  const last = counter ? counter.value : 0
  return { last_issued: last, next: last + 1, highest_used: highest ? highest.doc_number : 0 }
}

// Make the next allocated number be `next` — e.g. restart at 1 for a new
// fiscal year. Stored as next-1 because nextDocNumber() increments first.
async function setNextDocNumber(next) {
  await collections.counters().updateOne(
    { _id: 'doc_number' },
    { $set: { value: next - 1 } },
    { upsert: true }
  )
}

module.exports = { nextDocNumber, docNumberState, setNextDocNumber }
