import { atom, attribute, createScope, isAttributed, preset, tag, type Lite } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { app } from "../src/app"

describe("app", () => {
  it("keeps a single app config intact without sharing the caller reference", () => {
    const config = { tags: [] }
    const single = app(config)

    expect(single).toEqual(config)
    expect(single).not.toBe(config)
    expect(app()).toEqual({})
  })

  it("rejects cyclic tags while composing apps", () => {
    const cyclic: unknown[] = []
    cyclic.push(cyclic)

    expect(() => app({}, { tags: cyclic as Lite.TagInput })).toThrow(
      "tags must not contain cyclic arrays"
    )
  })

  it("composes tags and attributes derived-first and presets and extensions base-first", async () => {
    const region = tag<string>({ label: "region" })
    const capability = attribute<string>({ label: "app.test.capability" })
    const store = atom({ factory: () => "production" })
    const base = app({
      tags: region("base"),
      presets: [preset(store, "base")],
      extensions: [{ name: "base" }],
      attributes: { include: [capability("base")] },
    })
    const composed = app(base, {
      tags: [[region("east")]],
      presets: [preset(store, "east")],
      extensions: [{ name: "east" }],
      attributes: { include: [capability("east")], exclude: [capability("legacy")] },
    })

    expect(region.get(composed.tags ?? [])).toBe("east")
    expect(region.collect(composed.tags ?? [])).toEqual(["east", "base"])
    const values = (rules: readonly unknown[] | undefined) =>
      (rules ?? []).filter(isAttributed).map((rule) => rule.value)
    expect(values(composed.attributes?.include as readonly unknown[])).toEqual(["east", "base"])
    expect(values(composed.attributes?.exclude as readonly unknown[])).toEqual(["legacy"])
    expect(composed.presets?.map((value) => value.value)).toEqual(["base", "east"])
    expect(composed.extensions?.map((extension) => extension.name)).toEqual(["base", "east"])

    const scope = createScope(composed)
    expect(await scope.resolve(store)).toBe("east")
    await scope.dispose()
  })

  it("creates a plain scope from an undefined app", async () => {
    const scope = createScope({})
    const value = atom({ factory: () => 41 })

    expect(await scope.resolve(value)).toBe(41)
    await scope.dispose()
  })
})
