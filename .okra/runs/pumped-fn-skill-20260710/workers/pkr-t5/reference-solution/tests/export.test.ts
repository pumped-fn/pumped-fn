import { createScope, preset, type Lite } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { exportCollection, exportRecipe, type CollectionEvent } from "../src/export.ts"
import { archive, shareTarget, type LegacyRecord, type SharedRecipe } from "../src/ports.ts"

const records: Record<string, LegacyRecord> = {
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
    ingredients: [{ name: "basil", quantity: 2, unit: "oz" }],
  },
  mystery: {
    slug: "mystery",
    title: "Mystery Stew",
    ingredients: [{ name: "essence", quantity: 1, unit: "smidgen" }],
  },
}

const kit = () => {
  const fetched: string[] = []
  const written: SharedRecipe[] = []
  const closes: Lite.CloseResult[] = []
  const scope = createScope({
    presets: [
      preset(archive, {
        fetch: (slug: string) => {
          fetched.push(slug)
          const record = records[slug]
          return record === undefined
            ? Promise.reject(new Error(`archive offline for ${slug}`))
            : Promise.resolve(structuredClone(record))
        },
      }),
      preset(shareTarget, {
        write: (recipe: SharedRecipe) => {
          written.push(recipe)
          return Promise.resolve({ id: `shared-${recipe.slug}` })
        },
      }),
    ],
    extensions: [
      {
        name: "close-recorder",
        wrapExec: async (next, target, ctx) => {
          if (target === exportCollection) {
            ctx.onClose((result) => {
              closes.push(result)
            })
          }
          return next()
        },
      },
    ],
  })
  return { fetched, written, closes, scope }
}

const granolaShared: SharedRecipe = {
  slug: "granola",
  title: "Maple Granola",
  ingredients: [
    { name: "rolled oats", quantity: 720, unit: "ml" },
    { name: "maple syrup", quantity: 30, unit: "ml" },
  ],
}

describe("exportRecipe", () => {
  it("await-only and streamed consumption store identical results", async () => {
    const awaitOnly = kit()
    const ctx = awaitOnly.scope.createContext()
    await expect(ctx.exec({ flow: exportRecipe, input: { slug: "granola" } })).resolves.toEqual({
      id: "shared-granola",
    })
    await ctx.close({ ok: true })
    await awaitOnly.scope.dispose()

    const streamed = kit()
    const streamedCtx = streamed.scope.createContext()
    const stream = streamedCtx.execStream({ flow: exportRecipe, input: { slug: "granola" } })
    const events = []
    for await (const event of stream) events.push(event)
    expect(events).toEqual([
      { stage: "fetched" },
      { stage: "converted" },
      { stage: "shared", id: "shared-granola" },
    ])
    await expect(stream.result).resolves.toEqual({ id: "shared-granola" })
    await streamedCtx.close({ ok: true })
    await streamed.scope.dispose()

    expect(awaitOnly.written).toEqual([granolaShared])
    expect(streamed.written).toEqual(awaitOnly.written)
  })
})

describe("exportCollection", () => {
  it("forwards slug-prefixed child events in order and isolates a failing slug", async () => {
    const { fetched, written, scope } = kit()
    const ctx = scope.createContext()
    const stream = ctx.execStream({
      flow: exportCollection,
      input: { slugs: ["granola", "missing", "pesto"] },
    })
    const events: CollectionEvent[] = []
    for await (const event of stream) events.push(event)
    expect(events).toEqual([
      { slug: "granola", stage: "fetched" },
      { slug: "granola", stage: "converted" },
      { slug: "granola", stage: "shared", id: "shared-granola" },
      { slug: "missing", stage: "failed", reason: expect.stringContaining("archive offline") },
      { slug: "pesto", stage: "fetched" },
      { slug: "pesto", stage: "converted" },
      { slug: "pesto", stage: "shared", id: "shared-pesto" },
    ])
    await expect(stream.result).resolves.toEqual({ exported: 2, failedSlugs: ["missing"] })
    expect(fetched).toEqual(["granola", "missing", "pesto"])
    expect(written.map((recipe) => recipe.slug)).toEqual(["granola", "pesto"])
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("surfaces UNIT_UNKNOWN for an unconvertible record and continues", async () => {
    const { scope } = kit()
    const ctx = scope.createContext()
    const stream = ctx.execStream({
      flow: exportCollection,
      input: { slugs: ["mystery", "granola"] },
    })
    const events: CollectionEvent[] = []
    for await (const event of stream) events.push(event)
    expect(events[0]).toEqual({ slug: "mystery", stage: "fetched" })
    expect(events[1]).toMatchObject({ slug: "mystery", stage: "failed" })
    expect((events[1] as { reason: string }).reason).toContain("UNIT_UNKNOWN")
    await expect(stream.result).resolves.toEqual({ exported: 1, failedSlugs: ["mystery"] })
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("abandonment after recipe k leaves the fetch count at k and records aborted", async () => {
    const { fetched, written, closes, scope } = kit()
    const ctx = scope.createContext()
    const stream = ctx.execStream({
      flow: exportCollection,
      input: { slugs: ["granola", "pesto"] },
    })
    for await (const event of stream) {
      if (event.stage === "shared") break
    }
    expect(fetched).toEqual(["granola"])
    await expect(stream.result).rejects.toThrow(/aborted/i)
    expect(fetched).toEqual(["granola"])
    expect(written.map((recipe) => recipe.slug)).toEqual(["granola"])
    expect(closes[0]).toMatchObject({ ok: false, aborted: true })
    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
