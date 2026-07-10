// Deterministic behavioral checker for T-4 (scooter-fleet telemetry daemon with audit trail).
// Run FROM INSIDE an instantiated workspace (so bare imports resolve):
//   cp check-t4.mjs <workspace>/ && cd <workspace> && node --import tsx check-t4.mjs
// Prints a JSON verdict {checks: {id: "pass"|"fail"}, errors, failed} and exits 1 on any fail.
//
// chal-2 H2-T4 amendments implemented here (kill the detached proof-harness):
//   - the checker imports the SHIPPED composition root (src/wire.ts createApp) — the same
//     module bin/daemon.ts wires — drives the PUBLIC operations through it, then reads the
//     audit trail via createApp's own query surface and asserts those very operations were
//     observed. An extension installed only in the solution's tests can never satisfy this:
//     the checker never runs the solution's tests.
//   - ring eviction proven behaviorally on the shipped root: sentinel entries (a sweep +
//     resolve entries) recorded first, then 105 reports; the trail must hold exactly 100
//     entries ALL of which are report executions — sentinel contents evicted oldest-first.
//   - nested failure outcomes: a scripted client rejects one pickup; the trail must carry
//     BOTH failed entries (fn edge + parent sweep) with child-before-parent completion
//     order and parent attribution (probe-verified: wrapExec sees fn edges under ctx.name
//     with ctx.parent?.name = enclosing flow; child flow/fn entries complete before parent).
//   - wrapResolve coverage: at least one atom/resource resolve entry distinct from execs.

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { isFlow, isTag } from "@pumped-fn/lite"

const load = async (path) => {
  try {
    return await import(path)
  } catch (error) {
    return { __loadError: String(error?.message ?? error) }
  }
}

const telemetry = await load("./src/telemetry.ts")
const audit = await load("./src/audit.ts")
const wire = await load("./src/wire.ts")

const checks = {}
const errors = {}

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}
const eq = (actual, expected, label) => {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  assert(a === b, `${label}: expected ${b}, got ${a}`)
}

const check = async (id, fn) => {
  try {
    await fn()
    checks[id] = "pass"
  } catch (error) {
    checks[id] = "fail"
    errors[id] = String(error?.message ?? error)
  }
}

// Scripted fleet-ops client OWNED BY THE CHECKER: logs every dispatch, rejects listed ids.
const scriptedClient = (rejectIds = []) => {
  const calls = []
  return {
    calls,
    client: {
      dispatchPickup: (scooterId) => {
        calls.push(scooterId)
        if (rejectIds.includes(scooterId)) {
          return Promise.reject(Object.assign(new Error("fleet-ops refused"), { scooterId }))
        }
        return Promise.resolve({ accepted: true })
      },
    },
  }
}

const counterClock = () => {
  let tick = 0
  return () => {
    tick += 1
    return tick
  }
}

const gps = (scooterId, batteryPct) => ({ kind: "gps", scooterId, lat: 48.2, lng: 16.4, batteryPct })
const cell = (scooterId, batteryPct) => ({ kind: "cell", scooterId, cellId: "cell-7", batteryPct })

// One scenario = a FRESH app built through the shipped root, checker-owned client + clock.
const session = async (rejectIds, run) => {
  const { client, calls } = scriptedClient(rejectIds)
  const app = wire.createApp({ fleetOps: client, now: counterClock() })
  assert(app && app.scope && typeof app.trail === "function",
    "createApp must return { scope, trail }")
  const ctx = app.scope.createContext()
  try {
    return await run({ ctx, calls, trail: app.trail })
  } finally {
    await ctx.close()
    await app.scope.dispose()
  }
}

const report = (ctx, rawInput) => ctx.exec({ flow: telemetry.reportPosition, rawInput })
const sweep = (ctx) => ctx.exec({ flow: telemetry.lowBatterySweep })
const execEntries = (entries) => entries.filter((entry) => entry.kind === "exec")

const errorMentions = (error, field) => {
  let current = error
  while (current instanceof Error) {
    const fault = current.fault ? JSON.stringify(current.fault) : ""
    const issues = current.issues ? JSON.stringify(current.issues) : ""
    if (current.message.includes(field) || fault.includes(field) || issues.includes(field)) return true
    current = current.cause
  }
  return false
}

await check("decl-exports", async () => {
  assert(!telemetry.__loadError, `src/telemetry.ts failed to load: ${telemetry.__loadError}`)
  assert(!audit.__loadError, `src/audit.ts failed to load: ${audit.__loadError}`)
  assert(!wire.__loadError, `src/wire.ts failed to load: ${wire.__loadError}`)
  assert(isFlow(telemetry.reportPosition), "export reportPosition is not an executable flow")
  assert(isFlow(telemetry.lowBatterySweep), "export lowBatterySweep is not an executable flow")
  assert(isTag(telemetry.fleetOps), "export fleetOps is not a tag (client injection point)")
  assert(typeof audit.auditTrail === "function", "export auditTrail is not a factory function")
  assert(typeof wire.createApp === "function", "export createApp is not a function")
})

await check("b1-shipped-root-observes-public-ops", async () => {
  await session([], async ({ ctx, calls, trail }) => {
    await report(ctx, cell("s-cell", 9))
    await report(ctx, gps("s-gps", 3))
    await report(ctx, gps("s-healthy", 88))
    const result = await sweep(ctx)
    eq(result, { dispatched: ["s-cell", "s-gps"] }, "sweep result (report order, under-15 only)")
    eq(calls, ["s-cell", "s-gps"], "client dispatch log")
    const entries = trail()
    const prescribed = new Set(["report-position", "fleetops.dispatchPickup", "low-battery-sweep"])
    const execs = execEntries(entries)
      .filter((entry) => prescribed.has(entry.name))
      .map(({ name, parent, ok }) => ({ name, parent, ok }))
    eq(execs, [
      { name: "report-position", parent: null, ok: true },
      { name: "report-position", parent: null, ok: true },
      { name: "report-position", parent: null, ok: true },
      { name: "fleetops.dispatchPickup", parent: "low-battery-sweep", ok: true },
      { name: "fleetops.dispatchPickup", parent: "low-battery-sweep", ok: true },
      { name: "low-battery-sweep", parent: null, ok: true },
    ], "trail exec entries must be exactly the operations the checker drove, in completion order")
    assert(entries.every((entry) => Number.isFinite(entry.durationMs) && entry.durationMs >= 0),
      "every entry carries a numeric durationMs from the injected clock")
  })
})

await check("b2-boundary-parse-names-field", async () => {
  await session([], async ({ ctx, calls }) => {
    let rejected = null
    try {
      await report(ctx, { kind: "gps", scooterId: "s-1", lat: "north", lng: 16.4, batteryPct: 2 })
    } catch (error) {
      rejected = error
    }
    assert(rejected, "malformed gps report (lat: string) must reject")
    assert(errorMentions(rejected, "lat"),
      "rejection must name the offending field 'lat' in its message/fault/cause chain")
    let badKind = null
    try {
      await report(ctx, { kind: "teleport", scooterId: "s-1", batteryPct: 2 })
    } catch (error) {
      badKind = error
    }
    assert(badKind && errorMentions(badKind, "kind"), "unknown wire kind must reject naming 'kind'")
    await sweep(ctx)
    eq(calls, [], "malformed reports must store nothing (sweep dispatches no pickups)")
  })
})

await check("b3-nested-failure-dual-entries", async () => {
  await session(["s-dead"], async ({ ctx, calls, trail }) => {
    await report(ctx, gps("s-ok", 8))
    await report(ctx, gps("s-dead", 6))
    let failure = null
    try {
      await sweep(ctx)
    } catch (error) {
      failure = error
    }
    assert(failure, "a rejected dispatch must fail the sweep at the exec site")
    assert(errorMentions(failure, "s-dead"), "sweep failure must carry the offending scooter id")
    eq(calls, ["s-ok", "s-dead"], "the succeeding dispatch happened before the failing one")
    const entries = trail()
    const dispatches = entries.filter((entry) => entry.name === "fleetops.dispatchPickup")
    eq(dispatches.map((entry) => entry.ok), [true, false],
      "BOTH dispatch entries recorded: the succeeding one ok, the rejected one failed")
    assert(dispatches.every((entry) => entry.parent === "low-battery-sweep"),
      "dispatch entries carry parent attribution to the sweep")
    const sweeps = entries.filter((entry) => entry.name === "low-battery-sweep")
    eq(sweeps.map((entry) => entry.ok), [false], "the sweep itself recorded as failed")
    const failedDispatchAt = entries.findIndex((entry) => entry.name === "fleetops.dispatchPickup" && !entry.ok)
    const sweepAt = entries.findIndex((entry) => entry.name === "low-battery-sweep")
    assert(sweepAt > failedDispatchAt,
      "completion order: the failed inner dispatch entry precedes the parent sweep entry")
  })
})

await check("b4-resolve-entries-distinct", async () => {
  await session([], async ({ ctx, trail }) => {
    await report(ctx, gps("s-low", 5))
    await sweep(ctx)
    const entries = trail()
    const resolves = entries.filter((entry) => entry.kind === "resolve")
    assert(resolves.length > 0,
      "at least one atom/resource resolution must appear in the trail (kind: 'resolve')")
    assert(resolves.every((entry) => typeof entry.name === "string" && entry.name.length > 0 && entry.ok),
      "resolve entries carry a non-empty name and ok: true")
    const firstResolve = entries.findIndex((entry) => entry.kind === "resolve")
    const firstExec = entries.findIndex((entry) => entry.kind === "exec")
    assert(firstResolve !== -1 && firstResolve < firstExec,
      "the state store resolves (completes) before the first operation completes")
  })
})

await check("b5-ring-evicts-oldest", async () => {
  await session([], async ({ ctx, trail }) => {
    await sweep(ctx)
    const sentinel = trail()
    assert(sentinel.some((entry) => entry.name === "low-battery-sweep"),
      "sentinel sweep entry present before overflow")
    assert(sentinel.some((entry) => entry.kind === "resolve"),
      "sentinel resolve entry present before overflow")
    for (let index = 0; index < 105; index += 1) {
      await report(ctx, gps(`s-${index}`, 90))
    }
    const entries = trail()
    eq(entries.length, 100, "ring holds exactly the last 100 entries after 106+ recordings")
    assert(entries.every((entry) => entry.kind === "exec"), "all sentinel resolve entries evicted")
    assert(!entries.some((entry) => entry.name === "low-battery-sweep"),
      "the sentinel sweep entry (oldest) evicted by content, not just count")
    assert(entries.some((entry) => entry.name === "report-position" && entry.ok),
      "the surviving entries are the recent report executions")
  })
})

await check("s1-zod-union-at-boundary", async () => {
  const sources = readdirSync("./src").filter((name) => name.endsWith(".ts"))
  assert(sources.length > 0, "no TypeScript sources under src/")
  const texts = sources.map((name) => readFileSync(join("./src", name), "utf8"))
  assert(texts.some((text) => /from\s+"zod"/.test(text)),
    "wire validation must come from zod (no zod import found in src/)")
  assert(texts.some((text) => /\b(discriminatedUnion|union)\s*\(/.test(text)),
    "the two wire shapes must be a zod union (no union( / discriminatedUnion( site in src/)")
})

const failed = Object.values(checks).filter((v) => v === "fail").length
console.log(JSON.stringify({ checks, errors, failed }, null, 2))
process.exit(failed > 0 ? 1 : 0)
