import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { runProbe } from "./context-observation-probe.mjs"

const requiredContextKeys = Object.freeze([
  "activationId",
  "channel",
  "role",
  "sessionId",
  "tool",
  "workId",
])

function check(value, message) {
  if (!value) throw new Error(message)
}

function terminal(candidate, phase, name) {
  return candidate.events.some((event) => event.phase === phase && event.name === name)
}

export async function replay(artifactPath) {
  const observed = await runProbe()
  if (artifactPath) {
    const saved = JSON.parse(await readFile(artifactPath, "utf8"))
    check(JSON.stringify(saved) === JSON.stringify(observed), "saved probe does not match replay")
  }

  check(observed.baseline.forbiddenValueMatches.length === 0, "baseline exported a forbidden value")
  check(observed.baseline.eventContextFieldCount === 0, "baseline unexpectedly projects context")
  check(observed.baseline.cancellationPhaseCount === 0, "baseline unexpectedly classifies cancellation")
  check(observed.baseline.closePhaseCount === 0, "baseline unexpectedly emits context close")
  check(JSON.stringify(observed.baseline.sinkLifecycle) === JSON.stringify(["flush", "close"]), "baseline sink settlement changed")

  check(observed.candidate.forbiddenValueMatches.length === 0, "candidate exported a forbidden value")
  for (const key of requiredContextKeys) check(observed.candidate.contextKeys.includes(key), `candidate misses ${key}`)
  check(!observed.candidate.contextKeys.some((key) => ![...requiredContextKeys, "parentWorkId"].includes(key)), "candidate exported an undeclared context key")
  check(terminal(observed.candidate, "success", "github.tool.get_issue"), "candidate misses tool success")
  check(terminal(observed.candidate, "error", "github.tool.list_comments"), "candidate misses tool error")
  check(terminal(observed.candidate, "cancelled", "github.tool.wait_for_review"), "candidate misses cancellation")
  check(terminal(observed.candidate, "close", "session.activation"), "candidate misses activation close")
  check(JSON.stringify(observed.candidate.sinkLifecycle) === JSON.stringify(["flush", "close"]), "candidate sink settlement changed")

  const starts = observed.candidate.events.filter((event) => event.phase === "start")
  const root = starts.find((event) => event.name === "github.channel.issue")
  const work = starts.find((event) => event.name === "github.work.issue_42")
  const role = starts.find((event) => event.name === "github.role.issue_triage")
  const tool = starts.find((event) => event.name === "github.tool.get_issue")
  check(root && work?.parentId === root.id && role?.parentId === work.id && tool?.parentId === role.id, "candidate parentage is incomplete")

  return Object.freeze({
    verdict: "replayed",
    baselineEventCount: observed.baseline.events.length,
    candidateEventCount: observed.candidate.events.length,
    requiredContextKeys,
    forbiddenValueMatches: observed.candidate.forbiddenValueMatches,
  })
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(await replay(process.argv[2]), null, 2)}\n`)
}
