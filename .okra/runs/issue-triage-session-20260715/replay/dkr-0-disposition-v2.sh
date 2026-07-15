#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$repo"

matrix=".okra/runs/issue-triage-session-20260715/artifacts/dkr-0-disposition-matrix.v2.json"
checkpoint=".okra/runs/issue-triage-session-20260715/artifacts/dkr-0-current-pr-checkpoint.v2.json"
universe="$(git diff --name-status main...HEAD)"
actual_head="$(git rev-parse HEAD)"
actual_base_head="$(git rev-parse main)"
tracked_product_worktree_change_count="$(git diff --name-only HEAD -- . ':(exclude).okra/**' | sed '/^$/d' | wc -l | tr -d ' ')"

UNIVERSE="$universe" \
ACTUAL_HEAD="$actual_head" \
ACTUAL_BASE_HEAD="$actual_base_head" \
TRACKED_PRODUCT_WORKTREE_CHANGE_COUNT="$tracked_product_worktree_change_count" \
node --input-type=module - "$matrix" <<'NODE'
import fs from "node:fs"

const path = process.argv[2]
const original = JSON.parse(fs.readFileSync(path, "utf8"))
const checkpoint = JSON.parse(fs.readFileSync(".okra/runs/issue-triage-session-20260715/artifacts/dkr-0-current-pr-checkpoint.v2.json", "utf8"))
const universe = new Map(process.env.UNIVERSE.split("\n").filter(Boolean).map((line) => {
  const [status, changedPath] = line.split("\t")
  return [changedPath, status]
}))
const dispositions = new Set(["keep", "reshape", "remove"])

function invariant(value, message) {
  if (!value) throw new Error(message)
}

function strings(value, message) {
  invariant(Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.length > 0), message)
}

function validateEvidence(refs, changedPath, message) {
  strings(refs, message)
  for (const ref of refs) {
    invariant(
      ref === `git:main...HEAD:${changedPath}` || ref.startsWith(`${changedPath}:`),
      `${message}: evidence ${ref} does not name ${changedPath}`,
    )
  }
}

function validate(matrix) {
  invariant(matrix.schema_version === "dkr-0.disposition-matrix.v2", "wrong matrix schema")
  invariant(matrix.head === process.env.ACTUAL_HEAD, "stale matrix head")
  invariant(matrix.base_ref === "main", "wrong base ref")
  invariant(matrix.base_head === process.env.ACTUAL_BASE_HEAD, "stale base head")
  invariant(matrix.universe_command === "git diff --name-status main...HEAD", "wrong universe command")
  invariant(matrix.judgement?.status === "pending_independent_review", "architectural judgement must remain pending")
  invariant(matrix.judgement?.mechanical_coverage_is_not_architectural_acceptance === true, "mechanical and judgement evidence are not separated")
  invariant(matrix.rules && typeof matrix.rules === "object", "rules missing")
  invariant(Array.isArray(matrix.files), "files missing")

  const paths = matrix.files.map((entry) => entry.path)
  invariant(new Set(paths).size === paths.length, "duplicate matrix path")
  invariant(paths.length === universe.size, "missing changed path")
  for (const changedPath of universe.keys()) invariant(paths.includes(changedPath), `missing changed path ${changedPath}`)
  for (const changedPath of paths) invariant(universe.has(changedPath), `out-of-universe path ${changedPath}`)

  for (const file of matrix.files) {
    invariant(file.status === universe.get(file.path), `stale status for ${file.path}`)
    invariant(fs.existsSync(file.path), `stale or missing file ${file.path}`)
    invariant(dispositions.has(file.disposition), `invalid disposition for ${file.path}`)
    strings(file.rule_ids, `absent rule id for ${file.path}`)
    for (const ruleId of file.rule_ids) invariant(matrix.rules[ruleId], `unknown rule id ${ruleId} for ${file.path}`)
    validateEvidence(file.evidence_refs, file.path, `absent evidence ref for ${file.path}`)
    strings(file.downstream_owner_dkrs, `absent downstream owner for ${file.path}`)
    invariant(file.downstream_owner_dkrs.every((id) => /^DKR-[0-5]$/.test(id)), `invalid downstream owner for ${file.path}`)
    invariant(Array.isArray(file.public_concepts) && file.public_concepts.length > 0, `absent public concept for ${file.path}`)

    let mixed = false
    const conceptIds = new Set()
    for (const concept of file.public_concepts) {
      invariant(typeof concept.id === "string" && concept.id.length > 0, `absent concept id for ${file.path}`)
      invariant(!conceptIds.has(concept.id), `duplicate concept id ${concept.id} for ${file.path}`)
      conceptIds.add(concept.id)
      invariant(dispositions.has(concept.disposition), `invalid concept disposition ${concept.id}`)
      strings(concept.rule_ids, `absent concept rule id ${concept.id}`)
      for (const ruleId of concept.rule_ids) invariant(matrix.rules[ruleId], `unknown concept rule id ${ruleId}`)
      invariant(concept.rule_ids.some((ruleId) => matrix.rules[ruleId].disposition === concept.disposition), `concept ${concept.id} lacks a matching disposition rule`)
      validateEvidence(concept.evidence_refs, file.path, `absent concept evidence ${concept.id}`)
      strings(concept.downstream_owner_dkrs, `absent concept owner ${concept.id}`)
      invariant(concept.downstream_owner_dkrs.every((id) => /^DKR-[0-5]$/.test(id)), `invalid concept owner ${concept.id}`)
      if (concept.disposition !== "keep") {
        mixed = true
        invariant(concept.downstream_owner_dkrs.some((id) => id !== "DKR-0"), `unassigned reshape/remove owner ${concept.id}`)
        for (const owner of concept.downstream_owner_dkrs.filter((id) => id !== "DKR-0")) {
          invariant(file.downstream_owner_dkrs.includes(owner), `file owner omits ${owner} from ${concept.id}`)
        }
      }
    }
    invariant(file.disposition === (mixed ? "reshape" : "keep"), `top-level disposition hides mixed decisions for ${file.path}`)
    if (file.disposition !== "keep") invariant(file.downstream_owner_dkrs.some((id) => id !== "DKR-0"), `unassigned reshape/remove owner for ${file.path}`)
  }

  strings(matrix.mixed_source_paths, "mixed source path list missing")
  for (const mixedPath of matrix.mixed_source_paths) {
    const file = matrix.files.find((entry) => entry.path === mixedPath)
    invariant(file, `mixed source path absent from matrix ${mixedPath}`)
    invariant(file.public_concepts.length >= 2, `mixed source concepts collapsed for ${mixedPath}`)
  }
}

validate(original)

invariant(checkpoint.contract_version === "okra.executable-dkr-checkpoint.v1", "checkpoint contract_version missing")
invariant(checkpoint.type === "dkr_checkpoint_candidate", "checkpoint type missing")
invariant(checkpoint.unit_id === "DKR-0", "checkpoint unit_id missing")
invariant(typeof checkpoint.checkpoint_id === "string" && checkpoint.checkpoint_id.length > 0, "checkpoint_id missing")
invariant(typeof checkpoint.conclusion_id === "string" && checkpoint.conclusion_id.length > 0, "conclusion_id missing")
invariant(typeof checkpoint.decision_target === "string" && checkpoint.decision_target.length > 0, "decision_target missing")
invariant(Array.isArray(checkpoint.active_anti_goal_verification), "active wall reads missing")
invariant(checkpoint.active_anti_goal_verification.length === checkpoint.active_anti_goals.length, "active wall read count mismatch")
for (const wall of checkpoint.active_anti_goal_verification) {
  invariant(typeof wall.value === "number" && Number.isFinite(wall.value), `non-numeric wall value ${wall.anti_goal_id}`)
  invariant(typeof wall.threshold === "number" && Number.isFinite(wall.threshold), `non-numeric wall threshold ${wall.anti_goal_id}`)
  invariant(wall.freshness_status === "fresh", `stale wall ${wall.anti_goal_id}`)
  invariant(typeof wall.evidence_ref === "string" && wall.evidence_ref.startsWith("sha256:"), `wall evidence missing ${wall.anti_goal_id}`)
  invariant(typeof wall.verification_record_ref === "string" && wall.verification_record_ref.length > 0, `wall verification ref missing ${wall.anti_goal_id}`)
  invariant(wall.evidence_ref !== wall.verification_record_ref, `wall evidence and verification refs overlap ${wall.anti_goal_id}`)
  invariant(typeof wall.replay_command_or_checker === "string" && wall.replay_command_or_checker.length > 0, `wall replay missing ${wall.anti_goal_id}`)
}
invariant(checkpoint.wall_gate?.downstream_advance === "blocked", "candidate checkpoint advanced downstream")
invariant(checkpoint.wall_gate?.verdict === "pending_independent_judgement", "candidate judgement is not pending")
invariant(checkpoint.reviewer_audit_status.includes("pending"), "independent review is not pending")

const negativeCases = [
  ["missing", (value) => value.files.pop()],
  ["duplicate", (value) => value.files.push(structuredClone(value.files[0]))],
  ["out-of-universe", (value) => { value.files[0].path = "unknown/outside.ts" }],
  ["stale", (value) => { value.files[0].status = value.files[0].status === "A" ? "M" : "A" }],
  ["absent-rule", (value) => { value.files[0].rule_ids = [] }],
  ["unknown-rule", (value) => { value.files[0].rule_ids = ["UNKNOWN-RULE"] }],
  ["absent-evidence", (value) => { value.files[0].evidence_refs = [] }],
  ["unassigned-owner", (value) => {
    const file = value.files.find((entry) => entry.disposition === "reshape")
    file.downstream_owner_dkrs = ["DKR-0"]
  }],
  ["collapsed-mixed-concepts", (value) => {
    const file = value.files.find((entry) => entry.path === value.mixed_source_paths[0])
    file.public_concepts = [file.public_concepts[0]]
  }],
]

for (const [name, mutate] of negativeCases) {
  const candidate = structuredClone(original)
  mutate(candidate)
  let rejected = false
  try {
    validate(candidate)
  } catch {
    rejected = true
  }
  invariant(rejected, `negative case did not fail: ${name}`)
}

const conceptCount = original.files.reduce((count, file) => count + file.public_concepts.length, 0)
const result = {
  status: "pass",
  head: process.env.ACTUAL_HEAD,
  base_head: process.env.ACTUAL_BASE_HEAD,
  changed_path_count: universe.size,
  matrix_path_count: original.files.length,
  concept_disposition_count: conceptCount,
  coverage_gap_count: 0,
  duplicate_path_count: 0,
  unknown_path_count: 0,
  stale_path_count: 0,
  absent_rule_id_count: 0,
  unknown_rule_id_count: 0,
  absent_evidence_ref_count: 0,
  unassigned_reshape_remove_owner_count: 0,
  mixed_source_concept_gap_count: 0,
  negative_rejection_pass_count: negativeCases.length,
  negative_rejection_total: negativeCases.length,
  tracked_product_worktree_change_count: Number(process.env.TRACKED_PRODUCT_WORKTREE_CHANGE_COUNT),
  judgement_acceptance_count: 0,
  judgement_status: original.judgement.status,
  checkpoint_identity_field_count: 3,
  active_wall_numeric_value_count: checkpoint.active_anti_goal_verification.length,
  active_wall_distinct_reference_count: checkpoint.active_anti_goal_verification.length,
  downstream_advance_blocked: 1,
}

invariant(result.tracked_product_worktree_change_count === 0, "tracked product worktree changed during read-only DKR")
process.stdout.write(`${JSON.stringify(result)}\n`)
NODE
