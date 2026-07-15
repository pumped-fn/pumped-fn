#!/usr/bin/env bash
set -u

repo="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$repo"

mechanical_output="$(bash .okra/runs/issue-triage-session-20260715/replay/dkr-0-disposition-v2.sh 2>&1)"
mechanical_exit=$?
dkr1_output="$(bash .okra/runs/issue-triage-session-20260715/workers/dkr-1-cleanup/replay.sh 2>&1)"
dkr1_exit=$?
dkr2_output="$(bash .okra/runs/issue-triage-session-20260715/workers/dkr-2/replay.sh 2>&1)"
dkr2_exit=$?
dkr3_output="$(node .okra/runs/issue-triage-session-20260715/workers/dkr-3/probes/replay-context-observation.mjs .okra/runs/issue-triage-session-20260715/workers/dkr-3/artifacts/context-observation-probe.v1.json 2>&1)"
dkr3_exit=$?
changed_paths="$(git diff --name-only main...HEAD)"

MECHANICAL_OUTPUT="$mechanical_output" \
MECHANICAL_EXIT="$mechanical_exit" \
DKR1_OUTPUT="$dkr1_output" \
DKR1_EXIT="$dkr1_exit" \
DKR2_OUTPUT="$dkr2_output" \
DKR2_EXIT="$dkr2_exit" \
DKR3_OUTPUT="$dkr3_output" \
DKR3_EXIT="$dkr3_exit" \
CHANGED_PATHS="$changed_paths" \
node --input-type=module <<'NODE'
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

const run = ".okra/runs/issue-triage-session-20260715"
const matrixPath = `${run}/artifacts/dkr-0-disposition-matrix.v2.json`
const checkpointPath = `${run}/artifacts/dkr-0-current-pr-checkpoint.v2.json`
const matrix = JSON.parse(readFileSync(matrixPath, "utf8"))
const checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8"))
const frame = JSON.parse(readFileSync(`${run}/frame/frame.v2.json`, "utf8"))
const mechanical = process.env.MECHANICAL_EXIT === "0" ? JSON.parse(process.env.MECHANICAL_OUTPUT) : null

const text = (path) => readFileSync(path, "utf8")
const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")
const includesAll = (path, values) => values.every((value) => text(path).includes(value))
const concepts = matrix.files.flatMap((file) => file.public_concepts.map((concept) => ({ ...concept, path: file.path })))
const concept = (path, id) => concepts.find((value) => value.path === path && value.id === id)
const audit = (claimId, accepted, evidence, failureMode) => ({
  claim_id: claimId,
  decision: accepted ? "accepted" : "rejected",
  ...(failureMode ? { failure_mode: failureMode } : {}),
  evidence,
})

const changedPaths = process.env.CHANGED_PATHS.split("\n").filter(Boolean)
const expectedHashes = new Map([
  [matrixPath, "d63e86eb7d77be995ddd6d1009a67d500df4130ab8015d9570a47bd7e6c9f760"],
  [`${run}/replay/dkr-0-disposition-v2.sh`, "3a13f2757038ffd751e2728e85d58621ba0cddb61805af4e5be4042108efa771"],
  [`${run}/artifacts/dkr-0-disposition-replay.v2.json`, "33cbc43daa0f7502d75c6e6fd2a0478a3ba6548de238530e9c0696594cdd9b77"],
  [`${run}/artifacts/dkr-0-plain-wording.v2.json`, "7d4f5befd7eec585fb113f00441d414654aa6867a9d983b73b60f5f15ec983ec"],
  [`${run}/workers/validator-dkr-0-1/verification.json`, "b0d98497cdf17e6f3b2c6062344fca910aa310f99104c6276159657d2bec5129"],
])
const hashMatches = [...expectedHashes].map(([path, expected]) => ({ path, expected, actual: digest(path) }))

const requiredCheckpointFields = [
  "contract_version",
  "type",
  "unit_id",
  "checkpoint_id",
  "conclusion_id",
  "decision_target",
  "source_of_truth",
  "read_method",
  "observed_at",
  "recorded_at",
  "max_age",
  "freshness_status",
  "confidence",
  "evidence_refs_or_hashes",
  "replay_command_or_checker",
  "questions_answered",
  "questions_unanswered",
  "decision",
  "flag_if_missing_or_stale",
  "reviewer_audit_status",
  "active_anti_goals",
  "active_anti_goal_verification",
  "wall_gate",
]
const missingCheckpointFields = requiredCheckpointFields.filter((field) => checkpoint[field] === undefined)

const samples = [
  ["K-NAMESPACE-SUBPATH", "pkg/sdk/core/package.json", "canonical-sdk-subpaths-and-dependencies", ["\"./agent\"", "\"./session\"", "\"./validation\"", "\"./sandbox\""]],
  ["K-STATIC-DECLARED-GRAPH", "pkg/sdk/core/src/agent.ts", "role-resource-and-eager-capability-tree", ["...toolEntries.map", "...skillEntries.map", "deps,"]],
  ["K-RUNTIME-TAG-BINDING", "pkg/sdk/core/src/validation.ts", "validation-engine-tag", ["export const engine = tag<Engine>"]],
  ["K-DURABLE-SESSION-DATA", "pkg/sdk/core/src/session.ts", "durable-session-record-family", ["export interface SessionRecord", "readonly work:", "readonly attempts:"]],
  ["K-EXPLICIT-EFFECT-PORTS", "pkg/sdk/core/src/sandbox.ts", "sandbox-read-write-exec-ports", ["run: tag<Run>", "run: tags.required(impl.run)"]],
  ["K-VALIDATION-ENGINE", "pkg/sdk/core/tests/validation.test.ts", "zod-valibot-and-digest-contracts", ["infers and validates Zod output", "infers and validates Valibot output"]],
  ["K-PROVIDER-ATTEMPT", "pkg/sdk/pi/src/index.ts", "pi-attempt-and-scalar-provider", ["export const piAttempt", "factory: async function*"]],
  ["K-SCOPE-SEAM-TEST", "pkg/sdk/core/tests/database-analysis.test.ts", "database-analysis-vertical-contract", ["createScope({ tags:", "tags.required(database.ready)"]],
  ["K-PACKAGING", "pkg/sdk/core/tsdown.config.ts", "sdk-subpath-build-entries", ["session: \"src/session.ts\"", "validation: \"src/validation.ts\""]],
  ["R-ACTIVATION-OWNERSHIP", "pkg/sdk/core/src/session.ts", "live-runtime-semantic-registries", ["ownership: \"current\"", "class Runtime implements SessionRuntime"]],
  ["R-STRUCTURED-CANCELLATION", `${run}/workers/dkr-2/cancellation-probe.json`, null, ["\"descendantLeakCountAtClose\": 3", "\"descendantLeakCountAfterClose\": 0"]],
  ["R-SAFE-OBSERVATION", `${run}/workers/dkr-3/artifacts/context-observation-trace-contract.v1.json`, null, ["safe", "sessionId", "activationId"]],
  ["R-QUEUE-COMPOSITION", "pkg/sdk/core/src/index.ts", "channel-schedule-suite-http-adapters", ["export function channel", "export function schedule"]],
  ["R-EVIDENCE-PUBLICATION", "pkg/sdk/core/tests/database-analysis.test.ts", "database-analysis-vertical-contract", ["keeps acceptance outside the model", "evidence"]],
  ["X-PRE-RESOLVE", "pkg/sdk/core/src/session.ts", "session-resource-pre-resolution", ["export const session = resource", "ownership: \"current\""]],
  ["X-CLEANUP-FINISH", "pkg/sdk/core/src/session.ts", "cleanup-begin-finish-transition", ["shutdown(): Promise<void>", "return this.beginFinish()", "runtime.shutdown()"]],
  ["X-ABORT-TAG", "pkg/sdk/core/src/index.ts", "sdk-abort-signal-tag", ["export const abortSignal = tag<AbortSignal>"]],
  ["R-MIGRATION-DOCS", ".changeset/session-kernel-major.md", "release-migration-contract", ["Replace the Agent facade", "resource-backed"]],
]

const ruleFamilyAudits = samples.map(([ruleId, path, conceptId, markers]) => {
  const row = conceptId ? concept(path, conceptId) : undefined
  const markersFound = includesAll(path, markers)
  const rowMatches = !conceptId || Boolean(row?.rule_ids.includes(ruleId))
  const dependentReplay = ruleId === "R-STRUCTURED-CANCELLATION" || ruleId === "X-ABORT-TAG"
    ? process.env.DKR2_EXIT === "0"
    : ruleId === "R-SAFE-OBSERVATION"
      ? process.env.DKR3_EXIT === "0"
      : ruleId === "X-CLEANUP-FINISH"
        ? process.env.DKR1_EXIT === "0"
        : true
  const preResolveScopedCorrectly = ruleId !== "X-PRE-RESOLVE"
  const accepted = markersFound && rowMatches && dependentReplay && preResolveScopedCorrectly
  return {
    rule_id: ruleId,
    sample: conceptId ? `${path}#${conceptId}` : path,
    decision: accepted ? "accepted" : "rejected",
    ...(accepted ? {} : { failure_mode: ruleId === "X-PRE-RESOLVE" ? "incorrectly-scoped-removal" : "non-replayable" }),
    markers_found: markersFound,
    row_matches: rowMatches,
    dependent_replay_exit: dependentReplay ? 0 : Number(process.env.DKR2_EXIT),
  }
})

const removeRows = concepts.filter((value) => value.disposition === "remove")
const removeAudits = removeRows.map((row) => {
  if (row.id === "session-resource-pre-resolution") {
    return {
      row_id: `${row.path}#${row.id}`,
      decision: "rejected",
      failure_mode: "incorrectly-scoped-removal",
      evidence: "The row cites the current-owned session resource declaration, which the verified activation model preserves. Manual pre-resolution behavior is in callers and docs, not this declaration.",
    }
  }
  if (row.id === "cleanup-begin-finish-transition") {
    return {
      row_id: `${row.path}#${row.id}`,
      decision: process.env.DKR1_EXIT === "0" ? "accepted" : "rejected",
      ...(process.env.DKR1_EXIT === "0" ? {} : { failure_mode: "non-replayable" }),
      evidence: "Current shutdown calls beginFinish during resource cleanup; the cleanup replay requires deactivation without finish or commit.",
    }
  }
  return {
    row_id: `${row.path}#${row.id}`,
    decision: process.env.DKR2_EXIT === "0" ? "accepted" : "rejected",
    ...(process.env.DKR2_EXIT === "0" ? {} : { failure_mode: "non-replayable" }),
    evidence: "The generic signal-only replay is the required replacement proof for removing SDK abort-tag bridges.",
  }
})

const workflowRow = concept("pkg/sdk/core/src/index.ts", "workflow-runtime-and-extension")
const cliRow = concept("pkg/sdk/core/src/index.ts", "materials-and-cli-workers")
const hiddenRowAudits = [
  {
    row_id: "pkg/sdk/core/src/index.ts#workflow-runtime-and-extension",
    decision: "rejected",
    failure_mode: "hidden-dynamic-effect-edge",
    evidence: "WorkerRegistry.get chooses a flow by runtime string and Runtime.delegate calls ctx.exec without a declared controller dependency; the row incorrectly marks this keep under static graph and explicit effect rules.",
    matrix_disposition: workflowRow?.disposition,
  },
  {
    row_id: "pkg/sdk/core/src/index.ts#materials-and-cli-workers",
    decision: "rejected",
    failure_mode: "collapsed-mixed-concepts-and-hidden-physical-effect",
    evidence: "The row combines inert material state with cliWorker/runCli, while runCli imports node:child_process directly instead of resolving a scope-substitutable port.",
    matrix_disposition: cliRow?.disposition,
  },
]

const activeWallAudits = checkpoint.active_anti_goal_verification.map((wall) => {
  if (wall.metric_id === "touched_surface_regression_count") {
    return audit(wall.metric_id, false, "tracked_product_worktree_change_count only proves no post-head edits; it does not run tests, typecheck, build, lint, or docs checks for the 58 PR paths", "wrong-source")
  }
  if (wall.metric_id === "slop_violation_count") {
    return audit(wall.metric_id, false, "the plain wording checker covers run JSON and shell text, not AGENTS.md source, API, graph, naming, facade, or README-diagram rules", "wrong-source")
  }
  if (wall.metric_id === "single_llm_truth_acceptance_count") {
    return audit(wall.metric_id, mechanical?.judgement_acceptance_count === 0 && checkpoint.wall_gate.downstream_advance === "blocked", "judgement_acceptance_count=0 and downstream remains blocked")
  }
  if (wall.metric_id === "ungoverned_write_or_read_count") {
    return audit(wall.metric_id, true, "matrix paths and hashes are retained; final store verification is required after governed output")
  }
  return audit(wall.metric_id, checkpoint.reviewer_audit_status.includes("pending") && checkpoint.wall_gate.downstream_advance === "blocked", "v1 rejection remains cited, v2 judgement remains pending, and downstream remains blocked")
})

const architectureBoundaryAudits = [
  audit("intended-eager-declared-tree", includesAll("pkg/sdk/core/src/agent.ts", ["...toolEntries.map", "...skillEntries.map"]) && matrix.frame_clarifications[0].includes("Eager activation"), "declared role tool and skill resources are static deps; frame says eager full-tree activation is intended"),
  audit("intended-runtime-required-tags", includesAll("pkg/sdk/core/src/validation.ts", ["export const engine = tag<Engine>"]) && matrix.frame_clarifications[1].includes("Required tags"), "required runtime tags and runtime missing-tag failure are frame-confirmed, not defects"),
  audit("hidden-effects-rejected", false, "two keep rows retain Runtime.delegate dynamic dispatch and direct node:child_process execution", "contradicted"),
  audit("cleanup-finish-coupling-rejected", removeAudits.some((value) => value.row_id.endsWith("#cleanup-begin-finish-transition") && value.decision === "accepted"), "X-CLEANUP-FINISH is backed by current source and DKR-1 cleanup replay"),
  audit("speculative-lite-primitives-rejected", process.env.DKR2_EXIT === "0" && text(`${run}/workers/dkr-2/checkpoint.v2.json`).includes("do not add ExecutionContext.cancel, start, spawn, or task handles"), "DKR-2 keeps the primitive generic and rejects cancel, start, spawn, worker pool, and task handles"),
  audit("shared-scope-factory-rejected", text("pkg/sdk/core/README.md").includes("No shared production scope factory") && !text("pkg/sdk/core/src/index.ts").includes("createScope("), "public docs reject shared production scope factories and core source exports none"),
  audit("facade-ceremony-rejected", false, "WorkerRegistry exposes register/get/list and Runtime.delegate as a dynamic facade while its matrix row says keep", "contradicted"),
]

const result = {
  verification: "validator-dkr-0-v2-replay",
  mechanical: {
    command_exit: Number(process.env.MECHANICAL_EXIT),
    result: mechanical,
    changed_path_count: changedPaths.length,
    changed_path_universe_matches: changedPaths.length === 58 && matrix.files.length === 58,
    negative_matrix_mutations_passed: mechanical?.negative_rejection_pass_count === 9,
    hash_matches: hashMatches,
    all_cited_hashes_match: hashMatches.every((value) => value.expected === value.actual),
    missing_checkpoint_fields: missingCheckpointFields,
    checkpoint_fields_complete: missingCheckpointFields.length === 0,
    concept_row_count: concepts.length,
    concept_semantic_coverage: "rejected",
    concept_semantic_coverage_failure: "pkg/sdk/core/src/index.ts#materials-and-cli-workers collapses material state and physical CLI execution into one keep concept",
  },
  dependent_replays: {
    dkr_1_cleanup: { exit_code: Number(process.env.DKR1_EXIT) },
    dkr_2_cancellation: { exit_code: Number(process.env.DKR2_EXIT), output_tail: process.env.DKR2_OUTPUT.split("\n").slice(-12) },
    dkr_3_observation: { exit_code: Number(process.env.DKR3_EXIT) },
  },
  judgement: {
    rule_family_audits: ruleFamilyAudits,
    remove_audits: removeAudits,
    hidden_row_audits: hiddenRowAudits,
    architecture_boundary_audits: architectureBoundaryAudits,
    rejected_row_ids: [...new Set([
      ...removeAudits.filter((value) => value.decision === "rejected").map((value) => value.row_id),
      ...hiddenRowAudits.map((value) => value.row_id),
    ])],
  },
  active_wall_audits: activeWallAudits,
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
NODE
