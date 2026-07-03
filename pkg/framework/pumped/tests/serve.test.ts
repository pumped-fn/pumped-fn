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

const echoQuery = flow({
  tags: [route({ method: "GET", path: "/echo" })],
  factory: (ctx) => ({ received: ctx.input }),
})

const echoBody = flow({
  tags: [route({ method: "POST", path: "/echo-body" })],
  factory: (ctx) => ({ received: ctx.input ?? null }),
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

  it("coerces repeated GET query keys into arrays while leaving single keys as strings, without type coercion", async () => {
    const manifest: Manifest = {
      app: undefined,
      entries: [{ kind: "server", name: "echo", file: "virtual", flow: echoQuery }],
    }

    const { app, scope } = createServer(manifest)

    const response = await app.request("/echo?a=1&a=2&b=x")
    expect(await response.json()).toEqual({ received: { a: ["1", "2"], b: "x" } })

    await scope.dispose()
  })

  it("treats an empty non-GET body as undefined input", async () => {
    const manifest: Manifest = {
      app: undefined,
      entries: [{ kind: "server", name: "echo-body", file: "virtual", flow: echoBody }],
    }

    const { app, scope } = createServer(manifest)

    const response = await app.request("/echo-body", { method: "POST" })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ received: null })

    await scope.dispose()
  })

  it("responds 400 with a clear message for an invalid JSON non-GET body instead of a raw 500", async () => {
    const manifest: Manifest = {
      app: undefined,
      entries: [{ kind: "server", name: "echo-body", file: "virtual", flow: echoBody }],
    }

    const { app, scope } = createServer(manifest)

    const response = await app.request("/echo-body", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "invalid JSON body" })

    await scope.dispose()
  })
})
