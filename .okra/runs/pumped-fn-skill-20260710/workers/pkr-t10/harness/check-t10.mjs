// Deterministic behavioral checker for T-10 (ferry-terminal departure board).
// Run FROM INSIDE an instantiated workspace (so bare imports resolve):
//   cp check-t10.mjs <workspace>/ && cd <workspace> && node --import tsx check-t10.mjs
// Prints a JSON verdict {checks: {id: "pass"|"fail"}, errors, failed} and exits 1 on any fail.

import { createScope, isAtom, isFlow, isResource, preset } from "@pumped-fn/lite"

const mod = await import("./src/board.ts")
const linkMod = await import("./src/board-link.ts")

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

const trackedLink = () => {
  const calls = []
  const link = {
    open: (address) => {
      calls.push(`open:${address}`)
      return {
        address,
        render: (departures) => {
          calls.push(`render:${address}:${departures.length}`)
        },
        close: () => {
          calls.push(`close:${address}`)
        },
      }
    },
  }
  return { calls, link }
}

const board = async (run) => {
  const { calls, link } = trackedLink()
  const scope = createScope({ presets: [preset(linkMod.boardLink, link)] })
  const ctx = scope.createContext()
  let closed = false
  const shutdown = async () => {
    closed = true
    await ctx.close()
  }
  try {
    return await run({ calls, ctx, shutdown })
  } finally {
    if (!closed) await ctx.close()
    await scope.dispose()
  }
}

const render = (ctx, departures) => ctx.exec({ flow: mod.renderDepartures, input: { departures } })
const retarget = (ctx, address) => ctx.exec({ flow: mod.retarget, input: { address } })

const one = [{ vessel: "MV Selkie", at: "08:15" }]
const two = [
  { vessel: "MV Selkie", at: "08:15" },
  { vessel: "MV Kittiwake", at: "09:40" },
]

const check = async (id, fn) => {
  try {
    await fn()
    checks[id] = "pass"
  } catch (error) {
    checks[id] = "fail"
    errors[id] = String(error?.message ?? error)
  }
}

await check("decl-exports", () => {
  assert(isFlow(mod.renderDepartures), "renderDepartures must be a flow")
  assert(isFlow(mod.retarget), "retarget must be a flow")
  assert(isResource(mod.displaySession), "displaySession must be a resource")
  assert(isResource(mod.displayFeed), "displayFeed must be a resource")
  assert(isAtom(mod.displayAddress), "displayAddress must be an atom")
  assert(isAtom(linkMod.boardLink), "boardLink must be an atom")
})

await check("b1-lazy-single-session", () =>
  board(async ({ calls, ctx }) => {
    eq(calls, [], "no session before first render")
    const first = await render(ctx, two)
    const second = await render(ctx, one)
    eq(first, { rendered: 2 }, "renderDepartures return shape")
    eq(second, { rendered: 1 }, "renderDepartures return shape")
    eq(
      calls,
      ["open:harbor-main", "render:harbor-main:2", "render:harbor-main:1"],
      "one session opened lazily, both renders reach it",
    )
  }),
)

await check("b2-retarget-closes-old-first", () =>
  board(async ({ calls, ctx }) => {
    await render(ctx, one)
    const moved = await retarget(ctx, "north-quay")
    eq(moved, { address: "north-quay" }, "retarget return shape")
    eq(
      calls,
      ["open:harbor-main", "render:harbor-main:1", "close:harbor-main"],
      "retarget closes the old session and does NOT eagerly open the new one",
    )
    await render(ctx, one)
    eq(
      calls,
      [
        "open:harbor-main",
        "render:harbor-main:1",
        "close:harbor-main",
        "open:north-quay",
        "render:north-quay:1",
      ],
      "next render opens against the new address, after the old close",
    )
  }),
)

await check("b3-no-eager-reopen", () =>
  board(async ({ calls, ctx, shutdown }) => {
    await render(ctx, one)
    await retarget(ctx, "north-quay")
    assert(!calls.some((c) => c.startsWith("open:north-quay")), "retarget alone must not open a session")
    await shutdown()
    assert(!calls.some((c) => c.startsWith("open:north-quay")), "shutdown after idle retarget must not open a session")
    eq(calls.filter((c) => c.startsWith("close:")), ["close:harbor-main"], "old session closed exactly once")
  }),
)

await check("b4-same-address-retarget-keeps-session", () =>
  board(async ({ calls, ctx }) => {
    await render(ctx, one)
    await retarget(ctx, "harbor-main")
    await render(ctx, one)
    eq(
      calls,
      ["open:harbor-main", "render:harbor-main:1", "render:harbor-main:1"],
      "retarget to the current address must not cycle the session",
    )
  }),
)

await check("b5-shutdown-closes-live-session", () =>
  board(async ({ calls, ctx, shutdown }) => {
    await render(ctx, one)
    await retarget(ctx, "north-quay")
    await render(ctx, one)
    await shutdown()
    eq(
      calls,
      [
        "open:harbor-main",
        "render:harbor-main:1",
        "close:harbor-main",
        "open:north-quay",
        "render:north-quay:1",
        "close:north-quay",
      ],
      "context close closes the live session exactly once",
    )
  }),
)

await check("b6-retarget-before-first-render", () =>
  board(async ({ calls, ctx }) => {
    await retarget(ctx, "south-pier")
    await render(ctx, one)
    eq(
      calls,
      ["open:south-pier", "render:south-pier:1"],
      "a retarget before any render targets the first session",
    )
  }),
)

await check("b7-multi-retarget-order", () =>
  board(async ({ calls, ctx }) => {
    await render(ctx, one)
    await retarget(ctx, "north-quay")
    await render(ctx, one)
    await retarget(ctx, "east-dock")
    await render(ctx, one)
    eq(
      calls,
      [
        "open:harbor-main",
        "render:harbor-main:1",
        "close:harbor-main",
        "open:north-quay",
        "render:north-quay:1",
        "close:north-quay",
        "open:east-dock",
        "render:east-dock:1",
      ],
      "every retarget closes the current session before the next render's open",
    )
  }),
)

await check("n1-fresh-scope-isolation", async () => {
  await board(async ({ ctx }) => {
    await render(ctx, one)
    await retarget(ctx, "north-quay")
    await render(ctx, one)
  })
  await board(async ({ calls, ctx }) => {
    await render(ctx, one)
    eq(
      calls,
      ["open:harbor-main", "render:harbor-main:1"],
      "a fresh scope starts at the initial address with its own session (no module-level session or address bleed)",
    )
  })
})

const failed = Object.values(checks).filter((v) => v === "fail").length
console.log(JSON.stringify({ checks, errors, failed }, null, 2))
process.exit(failed > 0 ? 1 : 0)
