import { createScope, preset, type Lite } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { exportCollection, exportRecipe } from "../src/export.js"
import { archive, shareTarget, type LegacyArchive, type SharedRecipe } from "../src/ports.js"

function recipe(slug: string): { slug: string; title: string; ingredients: [{ name: string; quantity: number; unit: string }] } {
  return { slug, title: slug, ingredients: [{ name: "flour", quantity: 1, unit: "cup" }] }
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = []
  for await (const item of stream) items.push(item)
  return items
}

describe("recipe archive exports", () => {
  it("stores the same recipe when a single export is awaited or streamed", async () => {
    const written: SharedRecipe[] = []
    const scope = createScope({
      presets: [
        preset(archive, { fetch: async slug => recipe(slug) }),
        preset(shareTarget, { write: async item => { written.push(item); return { id: `id-${written.length}` } } }),
      ],
    })
    const awaited = scope.createContext()
    await expect(awaited.exec({ flow: exportRecipe, input: { slug: "one" } })).resolves.toEqual({ id: "id-1" })
    await awaited.close({ ok: true })
    const streamed = scope.createContext()
    const stream = streamed.execStream({ flow: exportRecipe, input: { slug: "two" } })
    await expect(collect(stream)).resolves.toEqual([{ stage: "fetched" }, { stage: "converted" }, { stage: "shared", id: "id-2" }])
    await expect(stream.result).resolves.toEqual({ id: "id-2" })
    await streamed.close({ ok: true })
    expect(written).toEqual([
      { slug: "one", title: "one", ingredients: [{ name: "flour", quantity: 240, unit: "ml" }] },
      { slug: "two", title: "two", ingredients: [{ name: "flour", quantity: 240, unit: "ml" }] },
    ])
    await scope.dispose()
  })

  it("forwards ordered progress and isolates a failed recipe", async () => {
    const scope = createScope({
      presets: [
        preset(archive, {
          fetch: async slug => slug === "bad" ? { ...recipe(slug), ingredients: [{ name: "odd", quantity: 1, unit: "pinch" }] } : recipe(slug),
        }),
        preset(shareTarget, { write: async item => ({ id: item.slug }) }),
      ],
    })
    const ctx = scope.createContext()
    const stream = ctx.execStream({ flow: exportCollection, input: { slugs: ["one", "bad", "two"] } })
    await expect(collect(stream)).resolves.toEqual([
      { slug: "one", stage: "fetched" }, { slug: "one", stage: "converted" }, { slug: "one", stage: "shared", id: "one" },
      { slug: "bad", stage: "fetched" }, { slug: "bad", stage: "failed", reason: "UNIT_UNKNOWN" },
      { slug: "two", stage: "fetched" }, { slug: "two", stage: "converted" }, { slug: "two", stage: "shared", id: "two" },
    ])
    await expect(stream.result).resolves.toEqual({ exported: 2, failedSlugs: ["bad"] })
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("aborts without fetching beyond the consumed recipe", async () => {
    const outcomes: Lite.CloseResult[] = []
    let fetched = 0
    const scope = createScope({
      presets: [
        preset(archive, { fetch: async slug => { fetched += 1; return recipe(slug) } } satisfies LegacyArchive),
        preset(shareTarget, { write: async () => ({ id: "unused" }) }),
      ],
      extensions: [{ name: "close-observer", wrapExec(next, _target, ctx) { ctx.onClose(result => { outcomes.push(result) }); return next() } }],
    })
    const ctx = scope.createContext()
    const stream = ctx.execStream({ flow: exportCollection, input: { slugs: ["one", "two"] } })
    for await (const event of stream) {
      expect(event).toEqual({ slug: "one", stage: "fetched" })
      break
    }
    await expect(stream.result).rejects.toThrow(/aborted/i)
    expect(fetched).toBe(1)
    expect(outcomes.some(result => !result.ok && result.aborted)).toBe(true)
    await ctx.close({ ok: false, error: new Error("aborted"), aborted: true })
    await scope.dispose()
  })
})
