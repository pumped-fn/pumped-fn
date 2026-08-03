import * as lite from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import {
  app,
  atom,
  controller,
  flow,
  preset,
  resource,
  tag,
  tags,
  typed,
} from "../src/app"
import { createAppScope, p, pumped } from "../src/index"
import { route as metaRoute } from "../src/meta"
import { route as rootRoute } from "../src/tags"

describe("app", () => {
  it("keeps a single app config intact", () => {
    const config = { tags: [] }

    expect(app(config)).toBe(config)
    expect(app()).toEqual({})
    expect(pumped.app).toBe(app)
    expect(p.app).toBe(app)
  })

  it("composes tags, presets, extensions, context, and error mapping", async () => {
    const region = tag<string>({ label: "region" })
    const store = atom({ factory: () => "production" })
    const baseContext = tag<string>({ label: "context.base" })
    const addedContext = tag<string>({ label: "context.added" })
    const base = app({
      tags: region("base"),
      presets: [preset(store, "base")],
      extensions: [{ name: "base" }],
      context: () => baseContext("base"),
      mapError: () => ({ status: 500, body: "base" }),
    })
    const composed = app(base, {
      tags: [[region("east")]],
      presets: [preset(store, "east")],
      extensions: [{ name: "east" }],
      context: () => [[addedContext("east")]],
      mapError: (error) => error === "east" ? { status: 409, body: "east" } : undefined,
    })

    expect(region.get(composed.tags ?? [])).toBe("east")
    expect(region.collect(composed.tags ?? [])).toEqual(["east", "base"])
    expect(composed.presets?.map((value) => value.value)).toEqual(["base", "east"])
    expect(composed.extensions?.map((extension) => extension.name)).toEqual(["base", "east"])
    expect(composed.context?.()).toEqual([addedContext("east"), baseContext("base")])
    expect(composed.mapError?.("east")).toEqual({ status: 409, body: "east" })
    expect(composed.mapError?.("other")).toEqual({ status: 500, body: "base" })

    const scope = createAppScope({ app: composed, entries: [] })
    expect(await scope.resolve(store)).toBe("east")
    await scope.dispose()
  })
})

describe("Lite re-exports", () => {
  it("exports the exact Lite authoring handles", () => {
    expect(atom).toBe(lite.atom)
    expect(controller).toBe(lite.controller)
    expect(flow).toBe(lite.flow)
    expect(preset).toBe(lite.preset)
    expect(resource).toBe(lite.resource)
    expect(tag).toBe(lite.tag)
    expect(tags).toBe(lite.tags)
    expect(typed).toBe(lite.typed)
  })

  it("keeps metadata handle identity across the lightweight entry", () => {
    expect(metaRoute).toBe(rootRoute)
  })
})
