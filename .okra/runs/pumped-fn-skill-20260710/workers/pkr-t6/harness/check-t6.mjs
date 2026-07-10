// Deterministic behavioral checker for T-6 (museum gallery climate watch).
// Run FROM INSIDE an instantiated workspace (so bare imports resolve):
//   cp check-t6.mjs <workspace>/ && cd <workspace> && node --import tsx check-t6.mjs
// Prints a JSON verdict {checks: {id: "pass"|"fail"}, errors, failed} and exits 1 on any fail.

import { createScope, flow, isAtom, isFlow, isTag, typed } from "@pumped-fn/lite"

const mod = await import("./src/climate.ts")

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
const settle = () => new Promise((resolve) => setTimeout(resolve, 30))
const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}: timed out after ${ms}ms`)), ms)),
  ])

const recorder = () => {
  const alerts = []
  const record = flow({
    name: "check.alertRecorder",
    parse: typed(),
    factory: (ctx) => {
      alerts.push(ctx.input.galleryId)
    },
  })
  return { alerts, record }
}

const session = async (run, scopeOptions = {}) => {
  const { alerts, record } = recorder()
  const scope = createScope({ tags: [mod.alertChannel(record)], ...scopeOptions })
  await scope.resolve(mod.readings)
  const view = scope.select(mod.readings, mod.atRiskOf, { eq: mod.sameRoomSet })
  const ctx = scope.createContext()
  const ingest = (galleryId, rh, extra = {}) =>
    ctx.exec({ flow: mod.ingestReading, input: { galleryId, tempC: 20, rh, ...extra } })
  try {
    return await run({ scope, ctx, view, ingest, alerts })
  } finally {
    await scope.dispose()
  }
}

const monitored = async (run, scopeOptions = {}) =>
  session(async (h) => {
    const monitor = h.ctx.exec({ flow: mod.watchAtRisk, input: { view: h.view } })
    await settle()
    const result = await run({ ...h, monitor })
    await h.scope.dispose()
    await withTimeout(monitor, 3000, "monitor loop did not end on scope dispose")
    return result
  }, scopeOptions)

const check = async (id, fn) => {
  try {
    await withTimeout(fn(), 10000, "scenario")
    checks[id] = "pass"
  } catch (error) {
    checks[id] = "fail"
    errors[id] = String(error?.message ?? error)
  }
}

await check("decl-exports", async () => {
  assert(isAtom(mod.readings), "export readings is not an atom")
  assert(isFlow(mod.ingestReading), "export ingestReading is not an executable flow")
  assert(isFlow(mod.watchAtRisk), "export watchAtRisk is not an executable flow")
  assert(isTag(mod.alertChannel), "export alertChannel is not a tag")
  assert(typeof mod.atRiskOf === "function", "export atRiskOf is not a function")
  assert(typeof mod.sameRoomSet === "function", "export sameRoomSet is not a function")
})

await check("d1-eq-set-semantics", async () => {
  assert(mod.sameRoomSet(["a", "b"], ["b", "a"]) === true, "sameRoomSet must be order-insensitive")
  assert(mod.sameRoomSet([], []) === true, "sameRoomSet on two empty sets")
  assert(mod.sameRoomSet(["a"], ["b"]) === false, "sameRoomSet must compare members, not cardinality")
  assert(mod.sameRoomSet(["a"], ["a", "b"]) === false, "sameRoomSet must detect additions")
  assert(mod.sameRoomSet(["a", "b"], ["a"]) === false, "sameRoomSet must detect removals")
})

await check("b1-derive-sorted", () =>
  session(async ({ view, ingest }) => {
    eq(view.get(), [], "initial at-risk set")
    await ingest("west", 62)
    await ingest("east", 48)
    await ingest("attic", 30)
    eq(view.get(), ["attic", "west"], "derived at-risk ids, sorted ascending")
    await ingest("west", 48)
    eq(view.get(), ["attic"], "recovered gallery leaves the set")
  }))

await check("b2-boundary-values-safe", () =>
  session(async ({ view, ingest }) => {
    await ingest("lo", 40)
    await ingest("hi", 55)
    await ingest("under", 39.9)
    await ingest("over", 55.1)
    eq(view.get(), ["over", "under"], "40 and 55 are safe; strictly outside is at risk")
  }))

await check("b3-notification-suppressed-on-set-preserving-updates", () =>
  session(async ({ view, ingest }) => {
    await ingest("west", 62)
    let notifications = 0
    const unsubscribe = view.subscribe(() => notifications++)
    await ingest("east", 48)
    await ingest("east", 49)
    await ingest("west", 63)
    eq(notifications, 0, "new readings that leave the at-risk set unchanged must not notify")
    await ingest("attic", 20)
    eq(notifications, 1, "a set-changing reading must notify")
    eq(view.get(), ["attic", "west"], "value after notification")
    unsubscribe()
  }))

await check("b4-swap-at-same-cardinality-notifies", () =>
  session(async ({ scope, view, ingest }) => {
    await ingest("a", 62)
    await ingest("b", 48)
    eq(view.get(), ["a"], "before swap")
    let notifications = 0
    const unsubscribe = view.subscribe(() => notifications++)
    scope.controller(mod.readings).set({ a: { tempC: 20, rh: 48 }, b: { tempC: 20, rh: 62 } })
    eq(notifications, 1, "membership swap at unchanged cardinality must notify")
    eq(view.get(), ["b"], "value after swap")
    unsubscribe()
  }))

await check("b5-wholesale-reading-replacement", () =>
  session(async ({ scope, ingest }) => {
    await ingest("west", 48, { note: "calibrated" })
    await ingest("west", 49)
    const state = await scope.resolve(mod.readings)
    eq(state["west"], { tempC: 20, rh: 49 }, "re-ingest replaces the gallery's reading wholesale (no merge)")
  }))

await check("b6-monitor-edge-triggered", () =>
  monitored(async ({ alerts, ingest }) => {
    eq(alerts, [], "no alerts while nothing is at risk")
    await ingest("west", 62)
    await settle()
    eq(alerts, ["west"], "newly at-risk gallery alerts exactly once")
    await ingest("west", 63)
    await ingest("east", 50)
    await ingest("east", 51)
    await settle()
    eq(alerts, ["west"], "churn that keeps the at-risk set unchanged must not re-alert")
    await ingest("attic", 20)
    await settle()
    eq(alerts, ["west", "attic"], "a second gallery entering alerts once, without re-alerting the first")
  }))

await check("b6b-monitor-alerts-preexisting-at-start", () =>
  session(async ({ scope, ctx, view, ingest, alerts }) => {
    await ingest("vault", 70)
    const monitor = ctx.exec({ flow: mod.watchAtRisk, input: { view } })
    await settle()
    eq(alerts, ["vault"], "galleries already at risk when the monitor starts are alerted once")
    await scope.dispose()
    await withTimeout(monitor, 3000, "monitor loop did not end on scope dispose")
  }))

await check("b7-monitor-sees-swap", () =>
  monitored(async ({ scope, alerts, ingest }) => {
    await ingest("a", 62)
    await ingest("b", 48)
    await settle()
    eq(alerts, ["a"], "before swap")
    scope.controller(mod.readings).set({ a: { tempC: 20, rh: 48 }, b: { tempC: 20, rh: 62 } })
    await settle()
    eq(alerts, ["a", "b"], "a swap at unchanged cardinality must alert the entering gallery")
  }))

await check("b8-realert-on-reentry", () =>
  monitored(async ({ alerts, ingest }) => {
    await ingest("west", 62)
    await settle()
    await ingest("west", 48)
    await settle()
    await ingest("west", 61)
    await settle()
    eq(alerts, ["west", "west"], "a gallery that recovers and re-enters is alerted again")
  }))

await check("b9-burst-coalesced-exact-alert-set", () =>
  monitored(async ({ alerts, ingest }) => {
    await Promise.all([
      ingest("a", 62),
      ingest("b", 48),
      ingest("c", 20),
      ingest("d", 50),
      ingest("e", 70),
      ingest("a", 63),
      ingest("b", 49),
    ])
    await settle()
    eq([...alerts].sort(), ["a", "c", "e"], "burst yields exactly the newly at-risk set, no duplicates, no misses")
  }))

await check("p1-state-survives-zero-observers", () =>
  session(async ({ scope, view, ingest }) => {
    await ingest("west", 62)
    const unsubscribe = view.subscribe(() => {})
    unsubscribe()
    await new Promise((resolve) => setTimeout(resolve, 120))
    await scope.flush()
    const state = await scope.resolve(mod.readings)
    eq(state["west"], { tempC: 20, rh: 62 }, "readings state survives a period with zero observers")
  }, { gc: { graceMs: 10 } }))

const failed = Object.values(checks).filter((v) => v === "fail").length
console.log(JSON.stringify({ checks, errors, failed }, null, 2))
process.exit(failed === 0 ? 0 : 1)
