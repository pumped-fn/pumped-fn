// Deterministic behavioral checker for T-8 (severe-weather alert fan-out).
// Run FROM INSIDE an instantiated workspace (so bare imports resolve):
//   cp check-t8.mjs <workspace>/ && cd <workspace> && node --import tsx check-t8.mjs
// Prints a JSON verdict {checks: {id: "pass"|"fail"}, errors, failed} and exits 1 on any fail.

import { createScope, flow, isFlow, isTag, typed } from "@pumped-fn/lite"

const mod = await import("./src/alerts.ts")

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

// Fake channels defined BY THE CHECKER, bound through the solution's exported
// channel tag. Every fake keeps a call log — per-channel side-effect evidence
// (chal-2 H2-T8 amendment): totals alone never prove delivery happened.
const delivering = (log) =>
  flow({
    parse: typed(),
    factory: (ctx) => {
      log.push(ctx.input)
      return { delivered: true }
    },
  })
const declining = (log) =>
  flow({
    parse: typed(),
    factory: (ctx) => {
      log.push(ctx.input)
      return { delivered: false }
    },
  })
const throwing = (log, message) =>
  flow({
    parse: typed(),
    factory: (ctx) => {
      log.push(ctx.input)
      throw new Error(message)
    },
  })

const session = async (options, run) => {
  const scope = createScope(options)
  const ctx = scope.createContext()
  try {
    return await run(ctx, scope)
  } finally {
    await ctx.close()
    await scope.dispose()
  }
}
const issue = (ctx, input) => ctx.exec({ flow: mod.issueAlert, input })

await check("decl-exports", async () => {
  assert(isFlow(mod.issueAlert), "export issueAlert is not an executable flow")
  assert(isTag(mod.channel), "export channel is not a tag (channel registration point)")
  assert(isTag(mod.quietHours), "export quietHours is not a tag (wiring-time setting)")
})

await check("b1-fanout-three-channels-side-effects", async () => {
  const radio = []
  const siren = []
  const sms = []
  const alert = { severity: "warning", text: "b1 storm front", hour: 12 }
  await session(
    { tags: [mod.channel(delivering(radio)), mod.channel(delivering(siren)), mod.channel(delivering(sms))] },
    async (ctx) => {
      eq(await issue(ctx, alert), { attempted: 3, delivered: 3, suppressed: false }, "outcome")
      for (const [name, log] of [["radio", radio], ["siren", siren], ["sms", sms]]) {
        eq(log, [alert], `${name} call log must hold exactly the issued alert`)
      }
    },
  )
})

await check("b2-fanout-two-channels-wiring-only", async () => {
  const radio = []
  const siren = []
  const unregistered = []
  const alert = { severity: "warning", text: "b2 wind shift", hour: 12 }
  await session(
    { tags: [mod.channel(delivering(radio)), mod.channel(delivering(siren))] },
    async (ctx) => {
      eq(await issue(ctx, alert), { attempted: 2, delivered: 2, suppressed: false }, "outcome")
      eq(radio, [alert], "radio call log")
      eq(siren, [alert], "siren call log")
      eq(unregistered, [], "an unregistered channel must never be called")
    },
  )
})

await check("b3-declining-channel-accounting", async () => {
  const ok = []
  const decline = []
  const alert = { severity: "warning", text: "b3 avalanche risk", hour: 12 }
  await session(
    { tags: [mod.channel(delivering(ok)), mod.channel(declining(decline))] },
    async (ctx) => {
      eq(await issue(ctx, alert), { attempted: 2, delivered: 1, suppressed: false }, "outcome")
      eq(ok, [alert], "delivering channel call log")
      eq(decline, [alert], "declining channel was attempted (call log)")
    },
  )
})

await check("b4-throwing-channel-isolation", async () => {
  const before = []
  const broken = []
  const after = []
  const alert = { severity: "warning", text: "b4 whiteout", hour: 12 }
  await session(
    {
      tags: [
        mod.channel(delivering(before)),
        mod.channel(throwing(broken, "B4_ANTENNA_ICED")),
        mod.channel(delivering(after)),
      ],
    },
    async (ctx) => {
      eq(await issue(ctx, alert), { attempted: 3, delivered: 2, suppressed: false }, "outcome")
      eq(before, [alert], "channel before the failure")
      eq(broken, [alert], "the throwing channel was genuinely attempted (call log)")
      eq(after, [alert], "channel after the failure must still receive the alert")
    },
  )
})

await check("b5-failure-observable-in-traces", async () => {
  const broken = []
  const ok = []
  const failedExecs = []
  const brokenFlow = throwing(broken, "B5_RELAY_DOWN")
  const observer = {
    name: "trace-recorder",
    wrapExec: async (next, target) => {
      try {
        return await next()
      } catch (error) {
        failedExecs.push({ target, message: String(error?.message ?? error) })
        throw error
      }
    },
  }
  const alert = { severity: "warning", text: "b5 rockfall", hour: 12 }
  await session(
    { tags: [mod.channel(brokenFlow), mod.channel(delivering(ok))], extensions: [observer] },
    async (ctx) => {
      eq(await issue(ctx, alert), { attempted: 2, delivered: 1, suppressed: false }, "outcome")
      eq(broken, [alert], "failing channel call log (attempt evidence)")
      const seen = failedExecs.filter(
        (entry) => entry.target === brokenFlow && entry.message.includes("B5_RELAY_DOWN"),
      )
      assert(
        seen.length === 1,
        `the failing channel's exec must surface through the pipeline exactly once as a failed execution of that channel flow; saw ${JSON.stringify(failedExecs.map((entry) => entry.message))}`,
      )
    },
  )
})

await check("b6-quiet-hours-suppresses-watch", async () => {
  const radio = []
  const siren = []
  await session(
    {
      tags: [
        mod.channel(delivering(radio)),
        mod.channel(delivering(siren)),
        mod.quietHours({ startHour: 1, endHour: 5 }),
      ],
    },
    async (ctx) => {
      const outcome = await issue(ctx, { severity: "watch", text: "b6 light snow", hour: 3 })
      eq(outcome, { attempted: 0, delivered: 0, suppressed: true }, "outcome")
      eq(radio, [], "no channel side effect during suppression")
      eq(siren, [], "no channel side effect during suppression")
    },
  )
})

await check("b7-quiet-hours-warning-still-delivers", async () => {
  const radio = []
  const siren = []
  const alert = { severity: "warning", text: "b7 flash flood", hour: 3 }
  await session(
    {
      tags: [
        mod.channel(delivering(radio)),
        mod.channel(delivering(siren)),
        mod.quietHours({ startHour: 1, endHour: 5 }),
      ],
    },
    async (ctx) => {
      eq(await issue(ctx, alert), { attempted: 2, delivered: 2, suppressed: false }, "outcome")
      eq(radio, [alert], "radio call log")
      eq(siren, [alert], "siren call log")
    },
  )
})

await check("b8-quiet-hours-watch-outside-window", async () => {
  const radio = []
  const alert = { severity: "watch", text: "b8 fog bank", hour: 7 }
  await session(
    { tags: [mod.channel(delivering(radio)), mod.quietHours({ startHour: 1, endHour: 5 })] },
    async (ctx) => {
      eq(await issue(ctx, alert), { attempted: 1, delivered: 1, suppressed: false }, "outcome")
      eq(radio, [alert], "radio call log")
    },
  )
})

await check("b9-optional-absent-delivers-always", async () => {
  const radio = []
  const siren = []
  const alert = { severity: "watch", text: "b9 light snow", hour: 3 }
  await session(
    { tags: [mod.channel(delivering(radio)), mod.channel(delivering(siren))] },
    async (ctx) => {
      eq(await issue(ctx, alert), { attempted: 2, delivered: 2, suppressed: false }, "outcome")
      eq(radio, [alert], "radio delivered despite quiet-hours-shaped hour (no setting bound)")
      eq(siren, [alert], "siren delivered despite quiet-hours-shaped hour (no setting bound)")
    },
  )
})

await check("b10-zero-channels-registered", async () => {
  await session({}, async (ctx) => {
    const outcome = await issue(ctx, { severity: "warning", text: "b10 into the void", hour: 12 })
    eq(outcome, { attempted: 0, delivered: 0, suppressed: false }, "outcome with no channels wired")
  })
})

await check("b11-repeat-alerts-ordered-per-channel", async () => {
  const radio = []
  const first = { severity: "warning", text: "b11 first", hour: 10 }
  const second = { severity: "watch", text: "b11 second", hour: 11 }
  await session({ tags: [mod.channel(delivering(radio))] }, async (ctx) => {
    await issue(ctx, first)
    await issue(ctx, second)
    eq(radio, [first, second], "each issue reaches the channel once, in order, with identity")
  })
})

const failed = Object.values(checks).filter((v) => v === "fail").length
console.log(JSON.stringify({ checks, errors, failed }, null, 2))
process.exit(failed === 0 ? 0 : 1)
