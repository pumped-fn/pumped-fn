// Deterministic behavioral checker for T-7 (chess-tournament round generation).
// Run FROM INSIDE an instantiated workspace (so bare imports resolve):
//   cp check-t7.mjs <workspace>/ && cd <workspace> && node --import tsx check-t7.mjs
// Prints a JSON verdict {checks: {id: "pass"|"fail"}, errors, failed} and exits 1 on any fail.

import { createScope, isFlow } from "@pumped-fn/lite"

const mod = await import("./src/tournament.ts")

const four = [
  { id: "anna", points: 3 },
  { id: "boris", points: 2 },
  { id: "carl", points: 1 },
  { id: "dina", points: 0 },
]
const five = [...four, { id: "elke", points: -1 }]
const fieldA = [
  { id: "a1", points: 4 },
  { id: "a2", points: 3 },
  { id: "a3", points: 2 },
  { id: "a4", points: 1 },
]
const fieldB = [
  { id: "b1", points: 4 },
  { id: "b2", points: 3 },
  { id: "b3", points: 2 },
  { id: "b4", points: 1 },
]

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

const session = async (run) => {
  const scope = createScope()
  const ctx = scope.createContext()
  try {
    return await run(ctx, scope)
  } finally {
    await ctx.close()
    await scope.dispose()
  }
}
const rounds = (ctx) => ctx.exec({ flow: mod.listRounds })

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
  for (const name of ["generateRound", "pairEntrants", "assignBye", "listRounds"]) {
    assert(isFlow(mod[name]), `export ${name} is not an executable flow`)
  }
})

await check("b1-basic-pairing", () =>
  session(async (ctx) => {
    const result = await ctx.exec({ flow: mod.generateRound, input: { entrants: four } })
    eq(result, { pairingCount: 2, bye: null, staged: 2 }, "generateRound result")
    eq(
      await rounds(ctx),
      [{ round: 1, pairings: [["anna", "boris"], ["carl", "dina"]], bye: null }],
      "published record",
    )
  }))

await check("b2-bye-staged-with-round", () =>
  session(async (ctx) => {
    const result = await ctx.exec({ flow: mod.generateRound, input: { entrants: five } })
    eq(result, { pairingCount: 2, bye: "elke", staged: 3 }, "generateRound result")
    eq(
      await rounds(ctx),
      [{ round: 1, pairings: [["anna", "boris"], ["carl", "dina"]], bye: "elke" }],
      "published record",
    )
  }))

await check("b3-sibling-staging-reset", () =>
  session(async (ctx) => {
    const first = await ctx.exec({ flow: mod.generateRound, input: { entrants: four } })
    const second = await ctx.exec({ flow: mod.generateRound, input: { entrants: four } })
    eq(first.staged, 2, "first sibling staged")
    eq(second.staged, 2, "second sibling staged (must not accumulate)")
    eq((await rounds(ctx)).map((r) => r.round), [1, 2], "round numbers")
  }))

await check("b4-commit-before-session-close", () =>
  session(async (ctx) => {
    await ctx.exec({ flow: mod.generateRound, input: { entrants: four } })
    const visible = await rounds(ctx)
    eq(visible.length, 1, "round visible while session still open")
  }))

await check("b5-standalone-pairing-no-publish", () =>
  session(async (ctx) => {
    const result = await ctx.exec({ flow: mod.pairEntrants, input: { entrants: four } })
    eq(result.pairingCount, 2, "pairingCount")
    assert(result.pairings === undefined, "pairEntrants must not return pairing details")
    eq(Object.keys(result), ["pairingCount"], "pairEntrants return shape")
    eq(await rounds(ctx), [], "standalone sub-operation published nothing")
  }))

await check("b5b-standalone-bye-no-publish", () =>
  session(async (ctx) => {
    const result = await ctx.exec({ flow: mod.assignBye, input: { candidate: "anna" } })
    eq(result.bye, "anna", "assignBye return")
    eq(await rounds(ctx), [], "standalone bye published nothing")
  }))

await check("b6-crash-path-discard", () =>
  session(async (ctx) => {
    await ctx.exec({ flow: mod.generateRound, input: { entrants: five } })
    await rejectionWithCode(
      ctx.exec({ flow: mod.generateRound, input: { entrants: five } }),
      "BYE_EXHAUSTED",
      "repeat bye",
    )
    const after = await rounds(ctx)
    eq(after.length, 1, "failed generation left no partial data")
    eq(after[0].pairings.length, 2, "round 1 intact")
  }))

await check("b6b-no-phantom-state-after-crash", () =>
  session(async (ctx) => {
    await ctx.exec({ flow: mod.generateRound, input: { entrants: five } })
    await rejectionWithCode(
      ctx.exec({ flow: mod.generateRound, input: { entrants: five } }),
      "BYE_EXHAUSTED",
      "repeat bye",
    )
    const recovered = await ctx.exec({ flow: mod.generateRound, input: { entrants: four } })
    eq(recovered.staged, 2, "recovery staged only its own records")
    const after = await rounds(ctx)
    eq(after.map((r) => r.round), [1, 2], "round numbers after crash")
    eq(
      after[1].pairings,
      [["anna", "boris"], ["carl", "dina"]],
      "recovered round has no leaked records from the failed generation",
    )
    eq(after[1].bye, null, "recovered round has no leaked bye")
  }))

await check("b8-concurrent-siblings-distinct", () =>
  session(async (ctx) => {
    const [first, second] = await Promise.all([
      ctx.exec({ flow: mod.generateRound, input: { entrants: fieldA } }),
      ctx.exec({ flow: mod.generateRound, input: { entrants: fieldB } }),
    ])
    eq(first.staged, 2, "concurrent sibling A staged")
    eq(second.staged, 2, "concurrent sibling B staged")
    const after = await rounds(ctx)
    eq(after.map((r) => r.round).sort(), [1, 2], "distinct consecutive round numbers")
    for (const round of after) {
      const ids = round.pairings.flat()
      const prefixes = new Set(ids.map((id) => id[0]))
      eq(prefixes.size, 1, `round ${round.round} mixes records from both concurrent generations`)
      eq(ids.length, 4, `round ${round.round} record count`)
    }
    const allIds = after.flatMap((round) => round.pairings.flat()).sort()
    eq(allIds, ["a1", "a2", "a3", "a4", "b1", "b2", "b3", "b4"].sort(), "both rounds complete")
  }))

await check("n1-invalid-entrants", () =>
  session(async (ctx) => {
    await rejectionWithCode(
      ctx.exec({ flow: mod.generateRound, input: { entrants: [{ id: "solo", points: 1 }] } }),
      "INVALID_ENTRANTS",
      "single entrant",
    )
    await rejectionWithCode(
      ctx.exec({
        flow: mod.generateRound,
        input: { entrants: [{ id: "dup", points: 1 }, { id: "dup", points: 2 }] },
      }),
      "INVALID_ENTRANTS",
      "duplicate ids",
    )
    eq(await rounds(ctx), [], "invalid generations published nothing")
  }))

await check("p1-record-outlives-session-context", async () => {
  const scope = createScope()
  const first = scope.createContext()
  await first.exec({ flow: mod.generateRound, input: { entrants: four } })
  await first.close()
  const second = scope.createContext()
  const visible = await second.exec({ flow: mod.listRounds })
  eq(visible.length, 1, "record visible from a fresh session context")
  await second.close()
  await scope.dispose()
})

const failed = Object.values(checks).filter((v) => v === "fail").length
console.log(JSON.stringify({ checks, errors, failed }, null, 2))
process.exit(failed === 0 ? 0 : 1)
