import { createScope, preset, type Lite } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { exportCollection, exportRecipe } from "../src/export.js"
import { archive, shareTarget, type LegacyArchive, type SharedRecipe } from "../src/ports.js"

function recipe(slug: string, unit = "cup") {
  return { slug, title: slug, ingredients: [{ name: "flour", quantity: 2, unit }] }
}

describe("recipe exports", () => {
  it("stores identical recipes when drained or streamed", async () => {
    const stored: SharedRecipe[] = []
    const scope = createScope({
      presets: [
        preset(archive, { fetch: async (slug: string) => recipe(slug) }),
        preset(shareTarget, { write: async (value: SharedRecipe) => { stored.push(value); return { id: `id-${stored.length}` } } }),
      ],
    })
    const first = scope.createContext()
    await expect(first.exec({ flow: exportRecipe, input: { slug: "granola" } })).resolves.toEqual({ id: "id-1" })
    await first.close({ ok: true })
    const second = scope.createContext()
    const stream = second.execStream({ flow: exportRecipe, input: { slug: "granola" } })
    const events: string[] = []
    for await (const event of stream) events.push(event.stage)
    await expect(stream.result).resolves.toEqual({ id: "id-2" })
    expect(events).toEqual(["fetched", "converted", "shared"])
    expect(stored).toEqual([stored[0], stored[0]])
    await second.close({ ok: true })
    await scope.dispose()
  })

  it("forwards ordered progress and continues after a failed recipe", async () => {
    const stored: SharedRecipe[] = []
    const fakeArchive: LegacyArchive = {
      fetch: async (slug: string) => slug === "bad" ? recipe(slug, "pinch") : recipe(slug),
    }
    const scope = createScope({
      presets: [preset(archive, fakeArchive), preset(shareTarget, { write: async (value: SharedRecipe) => { stored.push(value); return { id: value.slug } } })],
    })
    const ctx = scope.createContext()
    const stream = ctx.execStream({ flow: exportCollection, input: { slugs: ["one", "bad", "two"] } })
    const events: unknown[] = []
    for await (const event of stream) events.push(event)
    await expect(stream.result).resolves.toEqual({ exported: 2, failedSlugs: ["bad"] })
    expect(events).toEqual([
      { slug: "one", stage: "fetched" }, { slug: "one", stage: "converted" }, { slug: "one", stage: "shared", id: "one" },
      { slug: "bad", stage: "fetched" }, { slug: "bad", stage: "failed", reason: expect.stringContaining("UNIT_UNKNOWN") },
      { slug: "two", stage: "fetched" }, { slug: "two", stage: "converted" }, { slug: "two", stage: "shared", id: "two" },
    ])
    expect(stored.map(value => value.slug)).toEqual(["one", "two"])
    await ctx.close({ ok: true })
    await scope.dispose()
  })

  it("abandons without fetching ahead and records an aborted outcome", async () => {
    const outcomes: Lite.CloseResult[] = []
    let fetches = 0
    const observer: Lite.Extension = {
      name: "close-observer",
      wrapExec: async (next, _target, ctx) => {
        ctx.onClose(result => { outcomes.push(result) })
        return next()
      },
    }
    const scope = createScope({
      extensions: [observer],
      presets: [
        preset(archive, { fetch: async (slug: string) => { fetches += 1; return recipe(slug) } }),
        preset(shareTarget, { write: async (_value: SharedRecipe) => ({ id: "done" }) }),
      ],
    })
    const ctx = scope.createContext()
    const stream = ctx.execStream({ flow: exportCollection, input: { slugs: ["one", "two"] } })
    for await (const event of stream) {
      if (event.slug === "one" && event.stage === "shared") break
    }
    await expect(stream.result).rejects.toThrow(/aborted/i)
    expect(fetches).toBe(1)
    expect(outcomes).toContainEqual({ ok: false, error: expect.anything(), aborted: true })
    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
