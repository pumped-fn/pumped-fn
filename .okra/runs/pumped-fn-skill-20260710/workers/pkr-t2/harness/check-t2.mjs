// Deterministic behavioral checker for T-2 (library hold-slip printing).
// Run FROM INSIDE an instantiated workspace (so bare imports resolve):
//   cp check-t2.mjs <workspace>/ && cd <workspace> && node --import tsx check-t2.mjs
// Prints a JSON verdict {checks: {id: "pass"|"fail"}, errors, failed} and exits 1 on any fail.

import { createScope, isFlow } from "@pumped-fn/lite"

const mod = await import("./src/holdshelf.ts")

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
const faultText = (error) => {
  const parts = []
  let cursor = error
  let hops = 0
  while (cursor && hops < 10) {
    parts.push(String(cursor.message ?? ""))
    if (cursor.fault !== undefined) parts.push(JSON.stringify(cursor.fault))
    cursor = cursor.cause
    hops += 1
  }
  return parts.join(" ")
}
const rejectionWithCode = async (promise, code, label) => {
  let error = null
  try {
    await promise
  } catch (caught) {
    error = caught
  }
  assert(error !== null, `${label}: expected rejection with ${code}, but it resolved`)
  assert(
    faultText(error).includes(code),
    `${label}: rejection does not carry ${code}: ${faultText(error)}`,
  )
}
const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label}: still pending after ${ms}ms`)), ms)
      timer.unref?.()
    }),
  ])

const session = async (run) => {
  const scope = createScope()
  const daemon = scope.createContext()
  try {
    return await run(daemon, scope)
  } finally {
    await daemon.close()
    await scope.dispose()
  }
}
const holds = (ctx) => ctx.exec({ flow: mod.listHolds })
const printer = (ctx) => ctx.exec({ flow: mod.printerReport })
const record = (ctx, isbn, copyId) => ctx.exec({ flow: mod.recordReturn, input: { isbn, copyId } })
const allSlips = (report) => report.flatMap((entry) => entry.slips)

const check = async (id, fn) => {
  try {
    await fn()
    checks[id] = "pass"
  } catch (error) {
    checks[id] = "fail"
    errors[id] = String(error?.message ?? error)
  }
}

await check("decl-exports", async () => {
  const names = [
    "recordReturn",
    "recordReturns",
    "drainPass",
    "runDispatcher",
    "requestStop",
    "listHolds",
    "printerReport",
  ]
  for (const name of names) {
    assert(isFlow(mod[name]), `export ${name} is not an executable flow`)
  }
})

await check("b1-record-commits-pending", () =>
  session(async (ctx) => {
    eq(await record(ctx, "111", "c1"), { holdId: 1 }, "recordReturn result")
    const batch = await ctx.exec({
      flow: mod.recordReturns,
      input: { returns: [{ isbn: "222", copyId: "c2" }, { isbn: "333", copyId: "c3" }] },
    })
    eq(batch, { holdIds: [2, 3] }, "recordReturns result")
    eq(
      await holds(ctx),
      [
        { holdId: 1, isbn: "111", copyId: "c1", status: "pending" },
        { holdId: 2, isbn: "222", copyId: "c2", status: "pending" },
        { holdId: 3, isbn: "333", copyId: "c3", status: "pending" },
      ],
      "holds after commits",
    )
    eq(await printer(ctx), [], "no printer session before any drain pass")
  }))

await check("b2-drain-prints-and-flushes-at-close", () =>
  session(async (ctx) => {
    await record(ctx, "111", "c1")
    await record(ctx, "222", "c2")
    const pass = await ctx.exec({ flow: mod.drainPass })
    eq(pass, { session: 1, printed: 2 }, "drainPass result")
    eq(
      (await holds(ctx)).map((hold) => hold.status),
      ["printed", "printed"],
      "holds flushed to printed at pass close",
    )
    eq(
      await printer(ctx),
      [
        {
          session: 1,
          slips: [
            { holdId: 1, copyId: "c1" },
            { holdId: 2, copyId: "c2" },
          ],
          closed: "clean",
        },
      ],
      "session record flushed clean at pass close, while daemon context still open",
    )
  }))

await check("b3-fresh-session-per-sequential-sibling-pass", () =>
  session(async (ctx) => {
    await record(ctx, "111", "c1")
    const first = await ctx.exec({ flow: mod.drainPass })
    await record(ctx, "222", "c2")
    const second = await ctx.exec({ flow: mod.drainPass })
    assert(first.session !== second.session, "sibling passes must not share a printer session")
    eq(first, { session: 1, printed: 1 }, "first pass")
    eq(second, { session: 2, printed: 1 }, "second pass")
    eq(
      (await printer(ctx)).map((entry) => [entry.session, entry.closed]),
      [
        [1, "clean"],
        [2, "clean"],
      ],
      "two session records, both closed clean before daemon context ends",
    )
  }))

await check("b4-concurrent-sibling-passes-exactly-once", () =>
  session(async (ctx) => {
    for (const copyId of ["c1", "c2", "c3", "c4"]) await record(ctx, "111", copyId)
    const [left, right] = await Promise.all([
      ctx.exec({ flow: mod.drainPass }),
      ctx.exec({ flow: mod.drainPass }),
    ])
    assert(
      left.session !== right.session,
      "concurrent same-parent sibling passes must own distinct printer sessions",
    )
    eq(left.printed + right.printed, 4, "each hold printed by exactly one pass")
    const report = await printer(ctx)
    eq(report.length, 2, "each pass closed its own session")
    eq(report.map((entry) => entry.closed), ["clean", "clean"], "both sessions clean")
    eq(
      allSlips(report).map((slip) => slip.holdId).sort((a, b) => a - b),
      [1, 2, 3, 4],
      "slips across both sessions cover every hold exactly once",
    )
    for (const entry of report) {
      assert(
        entry.session === left.session || entry.session === right.session,
        "session records belong to the two sibling passes",
      )
    }
    eq(
      (await holds(ctx)).map((hold) => hold.status),
      ["printed", "printed", "printed", "printed"],
      "all holds fulfilled",
    )
  }))

await check("b5-empty-pass-still-isolated-session", () =>
  session(async (ctx) => {
    const [first, second] = [await ctx.exec({ flow: mod.drainPass }), await ctx.exec({ flow: mod.drainPass })]
    eq(first.printed, 0, "empty pass prints nothing")
    eq(second.printed, 0, "empty pass prints nothing")
    assert(first.session !== second.session, "empty sibling passes still get fresh sessions")
    eq(
      (await printer(ctx)).map((entry) => [entry.slips.length, entry.closed]),
      [
        [0, "clean"],
        [0, "clean"],
      ],
      "both empty sessions recorded clean",
    )
  }))

await check("b6-failing-batch-invisible-to-awake-dispatcher", () =>
  session(async (ctx) => {
    const dispatcher = ctx.exec({ flow: mod.runDispatcher }).then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error }),
    )
    await record(ctx, "111", "c1")
    await rejectionWithCode(
      ctx.exec({
        flow: mod.recordReturns,
        input: {
          returns: [
            { isbn: "222", copyId: "c2" },
            { isbn: "333", copyId: "c3" },
            { isbn: "444", copyId: "c3" },
          ],
        },
      }),
      "HOLD_EXISTS",
      "batch with internal duplicate",
    )
    await ctx.exec({ flow: mod.requestStop })
    const outcome = await withTimeout(dispatcher, 5000, "dispatcher exit after stop")
    assert(outcome.ok, `dispatcher failed: ${outcome.ok ? "" : faultText(outcome.error)}`)
    eq(
      (await holds(ctx)).map((hold) => hold.copyId),
      ["c1"],
      "no hold from the failed batch was ever committed",
    )
    eq(
      allSlips(await printer(ctx)),
      [{ holdId: 1, copyId: "c1" }],
      "the awake dispatcher never printed a slip for the failed batch",
    )
  }))

await check("b7-jam-closes-dirty-and-discards", () =>
  session(async (ctx) => {
    await record(ctx, "111", "c1")
    await record(ctx, "222", "c2")
    await record(ctx, "97801404491366", "c3")
    await rejectionWithCode(ctx.exec({ flow: mod.drainPass }), "PRINTER_JAM", "jammed pass")
    eq(
      await printer(ctx),
      [{ session: 1, slips: [], closed: "dirty" }],
      "jammed session closed dirty with all slips discarded",
    )
    eq(
      (await holds(ctx)).map((hold) => [hold.copyId, hold.status]),
      [
        ["c1", "pending"],
        ["c2", "pending"],
        ["c3", "rejected"],
      ],
      "claimed holds restored to pending, offender rejected",
    )
  }))

await check("b7b-recovery-pass-after-jam", () =>
  session(async (ctx) => {
    await record(ctx, "111", "c1")
    await record(ctx, "97801404491366", "c2")
    await record(ctx, "333", "c3")
    await rejectionWithCode(ctx.exec({ flow: mod.drainPass }), "PRINTER_JAM", "jammed pass")
    const recovery = await ctx.exec({ flow: mod.drainPass })
    eq(recovery.printed, 2, "recovery pass reprints the restored holds")
    assert(recovery.session !== 1, "recovery pass uses a fresh session")
    const report = await printer(ctx)
    eq(report.map((entry) => entry.closed), ["dirty", "clean"], "dirty record then clean record")
    eq(
      allSlips(report).map((slip) => slip.copyId).sort(),
      ["c1", "c3"],
      "recovered slips printed exactly once, none for the rejected hold",
    )
  }))

await check("b8-stop-finishes-current-drain-exactly-once", () =>
  session(async (ctx) => {
    const dispatcher = ctx.exec({ flow: mod.runDispatcher }).then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error }),
    )
    for (const copyId of ["c1", "c2", "c3", "c4", "c5"]) await record(ctx, "111", copyId)
    await ctx.exec({ flow: mod.requestStop })
    const outcome = await withTimeout(dispatcher, 5000, "dispatcher exit after stop")
    assert(outcome.ok, `dispatcher failed: ${outcome.ok ? "" : faultText(outcome.error)}`)
    eq(outcome.value.printed, 5, "dispatcher printed the full burst before exiting")
    eq(
      (await holds(ctx)).map((hold) => hold.status),
      ["printed", "printed", "printed", "printed", "printed"],
      "no hold lost or left pending at shutdown",
    )
    const report = await printer(ctx)
    eq(report.every((entry) => entry.closed === "clean"), true, "all drain sessions clean")
    eq(
      allSlips(report).map((slip) => slip.holdId).sort((a, b) => a - b),
      [1, 2, 3, 4, 5],
      "each hold slip printed exactly once across all passes",
    )
  }))

await check("n1-duplicate-hold-and-refulfil", () =>
  session(async (ctx) => {
    await record(ctx, "111", "c1")
    await rejectionWithCode(record(ctx, "111", "c1"), "HOLD_EXISTS", "duplicate while pending")
    eq((await holds(ctx)).length, 1, "duplicate committed nothing")
    await ctx.exec({ flow: mod.drainPass })
    eq(await record(ctx, "111", "c1"), { holdId: 2 }, "printed hold frees the copy for a new hold")
  }))

await check("n2-racing-duplicates-single-winner", () =>
  session(async (ctx) => {
    const settled = await Promise.allSettled([
      record(ctx, "111", "c1"),
      record(ctx, "111", "c1"),
    ])
    eq(
      settled.filter((entry) => entry.status === "fulfilled").length,
      1,
      "exactly one racing recordReturn wins",
    )
    const losers = settled.filter((entry) => entry.status === "rejected")
    eq(losers.length, 1, "exactly one racing recordReturn loses")
    assert(
      faultText(losers[0].reason).includes("HOLD_EXISTS"),
      "loser fails with HOLD_EXISTS",
    )
    eq((await holds(ctx)).length, 1, "single hold committed under the race")
  }))

await check("p1-shelf-outlives-daemon-context", async () => {
  const scope = createScope()
  const first = scope.createContext()
  await first.exec({ flow: mod.recordReturn, input: { isbn: "111", copyId: "c1" } })
  await first.close()
  const second = scope.createContext()
  eq(
    await second.exec({ flow: mod.listHolds }),
    [{ holdId: 1, isbn: "111", copyId: "c1", status: "pending" }],
    "holds visible from a fresh context on the same scope",
  )
  await second.close()
  await scope.dispose()
})

const failed = Object.values(checks).filter((value) => value === "fail").length
console.log(JSON.stringify({ checks, errors, failed }, null, 2))
process.exit(failed === 0 ? 0 : 1)
