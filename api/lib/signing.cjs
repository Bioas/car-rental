// The paper form ("แบบขออนุญาตใช้รถวิทยาลัยเทคนิคบุรีรัมย์") is signed by five
// staff positions in a fixed order after the requester submits their own
// signature. These positions are NOT login roles — every signer logs in as
// the single 'staff' role, and an admin assigns which staff account handles
// each stage (api/routes/admin.cjs's stage-assignment endpoints, backed by
// the `settings` collection). Each stage either signs (advancing to the next
// stage) or rejects (ending the chain immediately — the booking becomes
// 'rejected'). The final stage (director) is the one whose "อนุญาต/ไม่อนุญาต"
// checkbox on the paper form is the actual loan decision, so signing at that
// stage also sets booking.status = 'approved'.
const SIGN_STAGES = [
  { key: 'vehicle_head', title: 'พนักงานขับเครื่องจักรกลขนาดกลาง', section: 'หัวหน้าหมวดยานยนต์' },
  { key: 'supply_officer', title: 'เจ้าหน้าที่งานพัสดุ', section: 'เจ้าหน้าที่งานพัสดุ' },
  { key: 'supply_head', title: 'หัวหน้างานพัสดุ', section: 'หัวหน้างานพัสดุ' },
  { key: 'deputy_director', title: 'รองผู้อำนวยการฝ่ายบริหารทรัพยากร', section: 'รองผู้อำนวยการฝ่ายบริหารทรัพยากร' },
  { key: 'director', title: 'ผู้อำนวยการวิทยาลัยเทคนิคบุรีรัมย์', section: 'ผู้อำนวยการ' },
]

const STAGE_KEYS = SIGN_STAGES.map((s) => s.key)

// The first three stages are signed in parallel — งานพัสดุ/หมวดยานยนต์ can sign
// in any order, they do not queue behind one another. The chain only becomes
// strict again once all three have signed: then deputy_director → director.
const PARALLEL_STAGE_KEYS = SIGN_STAGES.slice(0, 3).map((s) => s.key)

// Only the last two stages' paper-form boxes are an "อนุญาต/ไม่อนุญาต" decision
// — everyone earlier just acknowledges and passes the document along.
const DECISION_STAGE_KEYS = ['deputy_director', 'director']

// Projection for any query that lists bookings: everything except the
// base64 signature images (up to ~500 KB each, six per document). Only the PDF
// renderer draws them; lists and timelines need who/when/decision alone.
const WITHOUT_SIGNATURE_IMAGES = Object.fromEntries(
  ['requester', ...STAGE_KEYS].map((key) => [`signatures.${key}.image`, 0]),
)

// ── Paper stages ──
// The admin can mark stages as signed on paper (ตั้งค่า → เอกสาร): the system
// skips them, and the PDF prints the signer's name under an empty line to be
// signed with a pen. The choice is frozen onto each booking as
// `paper_signers: { [stageKey]: printedName }` — a key's presence means
// "paper" — so later settings changes don't silently rewrite finished
// documents (see reconcilePaperSigners for documents still in progress).

/** Stage keys this booking signs on paper. */
function paperKeysOf(booking) {
  return Object.keys(booking?.paper_signers || {}).filter((key) => STAGE_KEYS.includes(key))
}

/** The parallel stages that are signed in the system for this paper set. */
function systemParallelKeys(paperKeys) {
  return PARALLEL_STAGE_KEYS.filter((key) => !paperKeys.includes(key))
}

/**
 * The `approval_stage` the in-system chain stands at, given the signatures so
 * far and the paper stages: the first parallel key while any in-system parallel
 * stage is unsigned (the parallel window keeps approval_stage on its first
 * member), then the next unsigned in-system sequential stage. null once
 * nothing is left to sign in the system.
 */
function currentStage(signatures, paperKeys) {
  const pending = (key) => !paperKeys.includes(key) && !signatures?.[key]
  if (PARALLEL_STAGE_KEYS.some(pending)) return PARALLEL_STAGE_KEYS[0]
  return STAGE_KEYS.filter((key) => !PARALLEL_STAGE_KEYS.includes(key)).find(pending) || null
}

/**
 * The stages that choose who drives while signing: the in-system parallel
 * stages, or — if all three sign on paper — the first in-system stage.
 */
function driverStageKeys(paperKeys) {
  const parallel = systemParallelKeys(paperKeys)
  if (parallel.length) return parallel
  const first = currentStage({}, paperKeys)
  return first ? [first] : []
}

/** The stages to notify when the chain arrives at `stage`. */
function stagesToNotify(stage, paperKeys) {
  if (!stage) return []
  return PARALLEL_STAGE_KEYS.includes(stage) ? systemParallelKeys(paperKeys) : [stage]
}

/**
 * How many of the five staff stages still have to sign in the system (0 once
 * fully signed). Paper stages never count. Counted from the actual signatures
 * so it stays correct while the first three stages sign in parallel.
 */
function remainingStages(signatures, paperSigners) {
  const paper = paperSigners ? Object.keys(paperSigners) : []
  return STAGE_KEYS.filter((key) => !signatures?.[key] && !paper.includes(key)).length
}

/** Every stage is either signed in the system or signed on paper. */
function isChainComplete(booking) {
  return remainingStages(booking?.signatures, booking?.paper_signers) === 0
}

function stageTitle(key) {
  const stage = SIGN_STAGES.find((s) => s.key === key)
  return stage ? stage.title : key
}

function stageCanReject(key) {
  return DECISION_STAGE_KEYS.includes(key)
}

module.exports = {
  SIGN_STAGES, STAGE_KEYS, PARALLEL_STAGE_KEYS, DECISION_STAGE_KEYS,
  WITHOUT_SIGNATURE_IMAGES, remainingStages, stageTitle, stageCanReject,
  paperKeysOf, systemParallelKeys, currentStage, stagesToNotify, isChainComplete, driverStageKeys,
}
