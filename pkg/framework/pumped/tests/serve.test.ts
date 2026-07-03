import { atom, flow, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { createServer } from "../src/runtime/serve"
import { route } from "../src/tags"
import type { Manifest } from "../src/runtime/manifest"

const counter = atom({ factory: () => ({ value: 0 }) })

const increment = flow({
  parse: typed<{ by: number }>(),
  deps: { counter },
  factory: (ctx, deps) => {
    deps.counter.value += ctx.input.by
    return { value: deps.counter.value }
  },
})

const getLots = flow({
  tags: [route({ method: "GET", path: "/lots" })],
  factory: () => ({ lots: ["a", "b"] }),
})

describe("createServer", () => {
  it("binds server entries with filename defaults and executes flows through the scope", async () => {
    const manifest: Manifest = {
      app: undefined,
      entries: [
        { kind: "server", name: "increment", file: "virtual", flow: increment },
        { kind: "server", name: "lots", file: "virtual", flow: getLots },
      ],
    }

    const { app, scope } = createServer(manifest)

    const first = await app.request("/increment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ by: 3 }),
    })
    const second = await app.request("/increment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ by: 4 }),
    })
    const lots = await app.request("/lots")

    expect(await first.json()).toEqual({ value: 3 })
    expect(await second.json()).toEqual({ value: 7 })
    expect(await lots.json()).toEqual({ lots: ["a", "b"] })

    await scope.dispose()
  })
})
