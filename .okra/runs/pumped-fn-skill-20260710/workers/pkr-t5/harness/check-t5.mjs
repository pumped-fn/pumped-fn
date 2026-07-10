// Deterministic behavioral checker for T-5 (recipe-archive export with live progress).
// Run FROM INSIDE an instantiated workspace (so bare imports resolve):
//   cp check-t5.mjs <workspace>/ && cd <workspace> && node --import tsx check-t5.mjs
// Prints a JSON verdict {checks: {id: "pass"|"fail"}, errors, failed} and exits 1 on any fail.

import { createScope, isAtom, isFlow, preset } from "@pumped-fn/lite"

const exports_ = await import("./src/export.ts")
const ports = await import("./src/ports.ts")

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
const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label}: still pending after ${ms}ms`)), ms)
      timer.unref?.()
    }),
  ])

const records = {
  granola: {
    slug: "granola",
    title: "Maple Granola",
    ingredients: [
      { name: "rolled oats", quantity: 3, unit: "cup" },
      { name: "maple syrup", quantity: 2, unit: "tbsp" },
    ],
  },
  pesto: {
    slug: "pesto",
    title: "Basil Pesto",
    ingredients: [
      { name: "basil", quantity: 2, unit: "oz" },
      { name: "olive oil", quantity: 120, unit: "ml" },
    ],
  },
  brisket: {
    slug: "brisket",
    title: "Smoked Brisket",
    ingredients: [{ name: "beef brisket", quantity: 5, unit: "lb" }],
  },
  mystery: {
    slug: "mystery",
    title: "Mystery Stew",
    ingredients: [{ name: "essence", quantity: 1, unit: "smidgen" }],
  },
}

const granolaConverted = {
  slug: "granola",
  title: "Maple Granola",
  ingredients: [
    { name: "rolled oats", quantity: 720, unit: "ml" },
    { name: "maple syrup", quantity: 30, unit: "ml" },
  ],
}
const pestoConverted = {
  slug: "pesto",
  title: "Basil Pesto",
  ingredients: [
    { name: "basil", quantity: 56, unit: "g" },
    { name: "olive oil", quantity: 120, unit: "ml" },
  ],
}
const brisketConverted = {
  slug: "brisket",
  title: "Smoked Brisket",
  ingredients: [{ name: "beef brisket", quantity: 2270, unit: "g" }],
}

// The fake archive records each fetch synchronously AT METHOD ENTRY (before any
// promise settles): "fetch issued" is defined at invocation time, so eagerly
// prefetched work is counted even if its promise never resolves for the consumer.
const kit = ({ offlineSlugs = [] } = {}) => {
  const fetched = []
  const written = []
  const closes = []
  const scope = createScope({
    presets: [
      preset(ports.archive, {
        fetch: (slug) => {
          fetched.push(slug)
          if (offlineSlugs.includes(slug)) return Promise.reject(new Error(`archive offline for ${slug}`))
          const record = records[slug]
          return record === undefined
            ? Promise.reject(new Error(`unknown slug: ${slug}`))
            : Promise.resolve(structuredClone(record))
        },
      }),
      preset(ports.shareTarget, {
        write: (recipe) => {
          written.push(structuredClone(recipe))
          return Promise.resolve({ id: `shared-${recipe.slug}` })
        },
      }),
    ],
    extensions: [
      {
        name: "close-recorder",
        wrapExec: async (next, target, ctx) => {
          if (target === exports_.exportCollection) {
            ctx.onClose((result) => {
              closes.push({ ok: result.ok, aborted: result.aborted === true })
            })
          }
          return next()
        },
      },
    ],
  })
  return { fetched, written, closes, scope }
}

const session = async (options, run) => {
  const parts = kit(options)
  const ctx = parts.scope.createContext()
  try {
    return await run(ctx, parts)
  } finally {
    await ctx.close({ ok: true })
    await parts.scope.dispose()
  }
}

const check = async (id, fn) => {
  try {
    await withTimeout(fn(), 10_000, id)
    checks[id] = "pass"
  } catch (error) {
    checks[id] = "fail"
    errors[id] = String(error?.message ?? error)
  }
}

const recipeEvents = (slug, id) => [
  { slug, stage: "fetched" },
  { slug, stage: "converted" },
  { slug, stage: "shared", id },
]

await check("decl-exports", async () => {
  assert(isFlow(exports_.exportRecipe), "export exportRecipe is not an executable flow")
  assert(isFlow(exports_.exportCollection), "export exportCollection is not an executable flow")
  assert(isAtom(ports.archive), "ports.archive is not a substitutable atom handle")
  assert(isAtom(ports.shareTarget), "ports.shareTarget is not a substitutable atom handle")
})

await check("b1-recipe-await-only", () =>
  session({}, async (ctx, { fetched, written }) => {
    const result = await ctx.exec({ flow: exports_.exportRecipe, input: { slug: "granola" } })
    eq(result, { id: "shared-granola" }, "await-only exportRecipe result")
    eq(fetched, ["granola"], "one fetch issued")
    eq(written, [granolaConverted], "converted recipe written to the share target")
  }))

await check("b2-recipe-streamed-identical", () =>
  session({}, async (ctx, { written }) => {
    const stream = ctx.execStream({ flow: exports_.exportRecipe, input: { slug: "granola" } })
    const events = []
    for await (const event of stream) events.push(event)
    eq(
      events,
      [{ stage: "fetched" }, { stage: "converted" }, { stage: "shared", id: "shared-granola" }],
      "streamed exportRecipe events in order",
    )
    eq(await stream.result, { id: "shared-granola" }, "stream.result carries the same final id")
    eq(written, [granolaConverted], "streamed consumption stores the identical result")
  }))

await check("b3-collection-forwards-prefixed-in-order", () =>
  session({}, async (ctx, { written }) => {
    const stream = ctx.execStream({
      flow: exports_.exportCollection,
      input: { slugs: ["granola", "pesto"] },
    })
    const events = []
    for await (const event of stream) events.push(event)
    eq(
      events,
      [...recipeEvents("granola", "shared-granola"), ...recipeEvents("pesto", "shared-pesto")],
      "slug-prefixed child events forwarded in order",
    )
    eq(await stream.result, { exported: 2, failedSlugs: [] }, "collection summary")
    eq(written, [granolaConverted, pestoConverted], "both recipes written converted")
  }))

await check("b4-collection-await-only", () =>
  session({}, async (ctx, { written }) => {
    const result = await ctx.exec({
      flow: exports_.exportCollection,
      input: { slugs: ["granola", "brisket"] },
    })
    eq(result, { exported: 2, failedSlugs: [] }, "await-only collection summary")
    eq(written, [granolaConverted, brisketConverted], "await-only consumption still exports all")
  }))

await check("b5-pull-driven-no-prefetch", () =>
  session({}, async (ctx, { fetched, closes }) => {
    const stream = ctx.execStream({
      flow: exports_.exportCollection,
      input: { slugs: ["granola", "pesto", "brisket"] },
    })
    let sawFinal = false
    for await (const event of stream) {
      if (event.slug === "granola" && event.stage === "shared") {
        eq(
          fetched,
          ["granola"],
          "after consuming recipe 1's final event, fetch count must be exactly 1 (eager prefetch issued recipe 2's fetch)",
        )
        sawFinal = true
        break
      }
    }
    assert(sawFinal, "never saw recipe 1's shared event")
    let aborted = null
    try {
      await stream.result
    } catch (error) {
      aborted = error
    }
    assert(aborted !== null, "abandoned stream.result must reject")
    assert(/abort/i.test(String(aborted.message ?? aborted)), `abandonment rejection must state aborted: ${aborted.message}`)
    eq(fetched, ["granola"], "recipe 2's fetch must never be issued after abandonment")
    eq(closes, [{ ok: false, aborted: true }], "abandoned run's recorded close result states aborted")
  }))

await check("b6-mid-recipe-abandon-prevents-next-side-effect", () =>
  session({}, async (ctx, { fetched, written, closes }) => {
    const stream = ctx.execStream({
      flow: exports_.exportCollection,
      input: { slugs: ["granola", "pesto"] },
    })
    for await (const event of stream) {
      if (event.slug === "granola" && event.stage === "converted") break
    }
    let aborted = null
    try {
      await stream.result
    } catch (error) {
      aborted = error
    }
    assert(aborted !== null, "abandoned stream.result must reject")
    eq(fetched, ["granola"], "no further fetch after mid-recipe abandonment")
    eq(written, [], "the share write (the next side-effect) must never happen after mid-recipe abandonment")
    eq(closes, [{ ok: false, aborted: true }], "mid-recipe abandoned close result states aborted")
  }))

await check("b7-failed-fetch-isolated", () =>
  session({ offlineSlugs: ["pesto"] }, async (ctx, { fetched, written }) => {
    const stream = ctx.execStream({
      flow: exports_.exportCollection,
      input: { slugs: ["granola", "pesto", "brisket"] },
    })
    const events = []
    for await (const event of stream) events.push(event)
    eq(
      events.map((event) => [event.slug, event.stage]),
      [
        ["granola", "fetched"],
        ["granola", "converted"],
        ["granola", "shared"],
        ["pesto", "failed"],
        ["brisket", "fetched"],
        ["brisket", "converted"],
        ["brisket", "shared"],
      ],
      "failing slug surfaces one transformed failure event and the export continues",
    )
    const failure = events[3]
    assert(typeof failure.reason === "string" && failure.reason.includes("archive offline"), `failure event reason must carry the underlying failure: ${JSON.stringify(failure)}`)
    eq(await stream.result, { exported: 2, failedSlugs: ["pesto"] }, "summary isolates the failed slug")
    eq(fetched, ["granola", "pesto", "brisket"], "every slug's fetch was attempted exactly once")
    eq(written, [granolaConverted, brisketConverted], "no write for the failed slug")
  }))

await check("b8-unknown-unit-isolated-with-code", () =>
  session({}, async (ctx) => {
    const stream = ctx.execStream({
      flow: exports_.exportCollection,
      input: { slugs: ["mystery", "granola"] },
    })
    const events = []
    for await (const event of stream) events.push(event)
    eq(
      events.map((event) => [event.slug, event.stage]),
      [
        ["mystery", "fetched"],
        ["mystery", "failed"],
        ["granola", "fetched"],
        ["granola", "converted"],
        ["granola", "shared"],
      ],
      "unconvertible record fails after fetch and the export continues",
    )
    const failure = events[1]
    assert(typeof failure.reason === "string" && failure.reason.includes("UNIT_UNKNOWN"), `UNIT_UNKNOWN must be recoverable from the failure reason: ${JSON.stringify(failure)}`)
    eq(await stream.result, { exported: 1, failedSlugs: ["mystery"] }, "summary isolates the unconvertible slug")
  }))

const failed = Object.values(checks).filter((value) => value === "fail").length
console.log(JSON.stringify({ checks, errors, failed }, null, 2))
process.exit(failed === 0 ? 0 : 1)
