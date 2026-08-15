import { atom, createScope, flow, preset, tag, tags, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { entry } from "../src/entry"
import { httpHost } from "../src/hosts/http"
import { httpError, httpRequest, httpResponse, route } from "../src/tags"
import { manifest, manifestEntry } from "./helpers"

const counter = atom({ factory: () => ({ value: 0 }) })

const increment = flow({
  parse: typed<{ by: number }>(),
  deps: { counter },
  factory: (ctx, deps) => {
    deps.counter.value += ctx.input.by
    return { value: deps.counter.value }
  },
})

const getLots = flow({ factory: () => ({ lots: ["a", "b"] }) })

const echoQuery = flow({ factory: (ctx) => ({ received: ctx.input }) })

const echoBody = flow({ factory: (ctx) => ({ received: ctx.input ?? null }) })

describe("httpHost", () => {
  it("mounts route-tagged entries and executes flows through one scope", async () => {
    const scope = createScope({})
    const runtime = httpHost.start({
      scope,
      manifest: manifest(
        undefined,
        manifestEntry("increment", increment, [route({ method: "POST", path: "/increment" })]),
        manifestEntry("lots", getLots, [route({ method: "GET", path: "/lots" })])
      ),
    })
    await runtime.ready

    const first = await runtime.fetch(
      new Request("http://test/increment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ by: 3 }),
      })
    )
    const second = await runtime.fetch(
      new Request("http://test/increment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ by: 4 }),
      })
    )
    const lots = await runtime.fetch(new Request("http://test/lots"))

    expect(await first.json()).toEqual({ value: 3 })
    expect(await second.json()).toEqual({ value: 7 })
    expect(await lots.json()).toEqual({ lots: ["a", "b"] })

    await scope.dispose()
  })

  it("mounts one entry on several routes when it carries several route tags", async () => {
    const scope = createScope({})
    const runtime = httpHost.start({
      scope,
      manifest: manifest(
        undefined,
        manifestEntry("lots", getLots, [
          route({ method: "GET", path: "/lots" }),
          route({ method: "GET", path: "/parking" }),
        ])
      ),
    })

    expect(await (await runtime.fetch(new Request("http://test/lots"))).json()).toEqual({ lots: ["a", "b"] })
    expect(await (await runtime.fetch(new Request("http://test/parking"))).json()).toEqual({ lots: ["a", "b"] })

    await scope.dispose()
  })

  it("coerces repeated GET query keys into arrays while leaving single keys as strings", async () => {
    const scope = createScope({})
    const runtime = httpHost.start({
      scope,
      manifest: manifest(undefined, manifestEntry("echo", echoQuery, [route({ method: "GET", path: "/echo" })])),
    })

    const response = await runtime.fetch(new Request("http://test/echo?a=1&a=2&b=x"))
    expect(await response.json()).toEqual({ received: { a: ["1", "2"], b: "x" } })

    await scope.dispose()
  })

  it("treats an empty non-GET body as undefined input and rejects invalid JSON with 400", async () => {
    const scope = createScope({})
    const runtime = httpHost.start({
      scope,
      manifest: manifest(undefined, manifestEntry("echo-body", echoBody, [route({ method: "POST", path: "/echo-body" })])),
    })

    const empty = await runtime.fetch(new Request("http://test/echo-body", { method: "POST" }))
    expect(empty.status).toBe(200)
    expect(await empty.json()).toEqual({ received: null })

    const invalid = await runtime.fetch(
      new Request("http://test/echo-body", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      })
    )
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ error: "invalid JSON body" })

    await scope.dispose()
  })

  it("seeds the request and response carrier as ambient tags the flow reads optionally", async () => {
    const describe = flow({
      deps: { req: tags.optional(httpRequest), res: tags.optional(httpResponse) },
      factory: (_ctx, deps) => {
        deps.res?.headers.set("x-from", "flow")
        if (deps.res) deps.res.status = 201
        return { agent: deps.req?.headers.get("user-agent") ?? null }
      },
    })
    const scope = createScope({})
    const runtime = httpHost.start({
      scope,
      manifest: manifest(undefined, manifestEntry("describe", describe, [route({ method: "GET", path: "/describe" })])),
    })

    const response = await runtime.fetch(
      new Request("http://test/describe", { headers: { "user-agent": "vitest" } })
    )

    expect(response.status).toBe(201)
    expect(response.headers.get("x-from")).toBe("flow")
    expect(await response.json()).toEqual({ agent: "vitest" })

    await scope.dispose()
  })

  it("renders a raw body from the carrier without JSON wrapping", async () => {
    const page = flow({
      deps: { res: tags.required(httpResponse) },
      factory: (_ctx, deps) => {
        deps.res.headers.set("content-type", "text/html")
        deps.res.body = "<h1>hi</h1>"
        return undefined
      },
    })
    const scope = createScope({})
    const runtime = httpHost.start({
      scope,
      manifest: manifest(undefined, manifestEntry("page", page, [route({ method: "GET", path: "/page" })])),
    })

    const response = await runtime.fetch(new Request("http://test/page"))

    expect(response.headers.get("content-type")).toBe("text/html")
    expect(await response.text()).toBe("<h1>hi</h1>")

    await scope.dispose()
  })

  it("seeds the entry's own tags into the request context", async () => {
    const tenant = tag<string>({ label: "example.tenant" })
    const whoami = flow({
      deps: { tenant: tags.required(tenant) },
      factory: (_ctx, deps) => ({ tenant: deps.tenant }),
    })
    const scope = createScope({})
    const runtime = httpHost.start({
      scope,
      manifest: manifest(
        undefined,
        manifestEntry("whoami", whoami, [route({ method: "GET", path: "/whoami" }), tenant("acme")])
      ),
    })

    expect(await (await runtime.fetch(new Request("http://test/whoami"))).json()).toEqual({ tenant: "acme" })

    await scope.dispose()
  })

  it("maps ParseError to 400, FlowFault to 422, and rethrows the rest as 500", async () => {
    const parsed = flow({
      parse: (raw) => {
        if (typeof raw !== "object" || raw === null || !("n" in raw)) throw new Error("n is required")
        return raw as { n: number }
      },
      factory: (ctx) => ctx.input,
    })
    const faulty = flow({
      faults: typed<{ kind: "locked" }>(),
      factory: (ctx) => ctx.fail({ kind: "locked" }),
    })
    const broken = flow({
      factory: () => {
        throw new Error("boom")
      },
    })
    const scope = createScope({})
    const runtime = httpHost.start({
      scope,
      manifest: manifest(
        undefined,
        manifestEntry("parsed", parsed, [route({ method: "POST", path: "/parsed" })]),
        manifestEntry("faulty", faulty, [route({ method: "POST", path: "/faulty" })]),
        manifestEntry("broken", broken, [route({ method: "POST", path: "/broken" })])
      ),
    })

    const parseFailure = await runtime.fetch(
      new Request("http://test/parsed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    )
    expect(parseFailure.status).toBe(400)

    const fault = await runtime.fetch(new Request("http://test/faulty", { method: "POST" }))
    expect(fault.status).toBe(422)
    expect(await fault.json()).toEqual({ fault: { kind: "locked" } })

    const broke = await runtime.fetch(new Request("http://test/broken", { method: "POST" }))
    expect(broke.status).toBe(500)

    await scope.dispose()
  })

  it("consults an httpError mapper tag from the app before the default policy", async () => {
    class Forbidden extends Error {}
    const guarded = flow({
      factory: () => {
        throw new Forbidden("nope")
      },
    })
    const app = {
      tags: [httpError((error) => (error instanceof Forbidden ? { status: 403, body: { kind: "forbidden" } } : undefined))],
    }
    const scope = createScope(app)
    const runtime = httpHost.start({
      scope,
      manifest: manifest(app, manifestEntry("guarded", guarded, [route({ method: "POST", path: "/guarded" })])),
    })

    const response = await runtime.fetch(new Request("http://test/guarded", { method: "POST" }))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ kind: "forbidden" })

    await scope.dispose()
  })

  it("executes the resolved bundle so preset(entry, { flow }) substitutes host traffic", async () => {
    const node = entry({ flow: getLots, tags: [route({ method: "GET", path: "/lots" })] })
    const substitute = flow({ factory: () => ({ lots: ["substituted"] }) })
    const scope = createScope({ presets: [preset(node, { flow: substitute })] })
    const runtime = httpHost.start({
      scope,
      manifest: { app: undefined, entries: [{ name: "lots", file: "virtual", entry: node }] },
    })

    expect(await (await runtime.fetch(new Request("http://test/lots"))).json()).toEqual({ lots: ["substituted"] })

    await scope.dispose()
  })

  it("reads the httpError mapper from the scope even when the manifest app lacks it", async () => {
    class Forbidden extends Error {}
    const guarded = flow({
      factory: () => {
        throw new Forbidden("nope")
      },
    })
    const scope = createScope({
      tags: [httpError((error) => (error instanceof Forbidden ? { status: 403, body: { kind: "forbidden" } } : undefined))],
    })
    const runtime = httpHost.start({
      scope,
      manifest: manifest(undefined, manifestEntry("guarded", guarded, [route({ method: "POST", path: "/guarded" })])),
    })

    const response = await runtime.fetch(new Request("http://test/guarded", { method: "POST" }))
    expect(response.status).toBe(403)

    await scope.dispose()
  })

  it("seeds the matched mount tag, not the entry's first one", async () => {
    const which = flow({
      deps: { mounted: tags.required(route) },
      factory: (_ctx, deps) => ({ path: deps.mounted.path }),
    })
    const scope = createScope({})
    const runtime = httpHost.start({
      scope,
      manifest: manifest(
        undefined,
        manifestEntry("which", which, [
          route({ method: "GET", path: "/first" }),
          route({ method: "GET", path: "/second" }),
        ])
      ),
    })

    expect(await (await runtime.fetch(new Request("http://test/second"))).json()).toEqual({ path: "/second" })

    await scope.dispose()
  })

  it("forwards path params into the raw input", async () => {
    const show = flow({ factory: (ctx) => ({ received: ctx.input }) })
    const scope = createScope({})
    const runtime = httpHost.start({
      scope,
      manifest: manifest(
        undefined,
        manifestEntry("show", show, [
          route({ method: "GET", path: "/users/:id" }),
          route({ method: "POST", path: "/users/:id/notes" }),
        ])
      ),
    })

    expect(await (await runtime.fetch(new Request("http://test/users/42?full=yes"))).json()).toEqual({
      received: { full: "yes", id: "42" },
    })
    const posted = await runtime.fetch(
      new Request("http://test/users/42/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "hi" }),
      })
    )
    expect(await posted.json()).toEqual({ received: { text: "hi", id: "42" } })

    await scope.dispose()
  })

  it("returns 204 for undefined output and keeps carrier headers on error responses", async () => {
    const silent = flow({ factory: () => undefined })
    const marked = flow({
      deps: { res: tags.required(httpResponse) },
      faults: typed<{ kind: "boom" }>(),
      factory: (ctx, deps) => {
        deps.res.headers.set("x-marker", "kept")
        return ctx.fail({ kind: "boom" })
      },
    })
    const scope = createScope({})
    const runtime = httpHost.start({
      scope,
      manifest: manifest(
        undefined,
        manifestEntry("silent", silent, [route({ method: "GET", path: "/silent" })]),
        manifestEntry("marked", marked, [route({ method: "POST", path: "/marked" })])
      ),
    })

    const empty = await runtime.fetch(new Request("http://test/silent"))
    expect(empty.status).toBe(204)
    expect(await empty.text()).toBe("")

    const fault = await runtime.fetch(new Request("http://test/marked", { method: "POST" }))
    expect(fault.status).toBe(422)
    expect(fault.headers.get("x-marker")).toBe("kept")

    await scope.dispose()
  })

  it("refuses duplicate method and path pairs at start", async () => {
    const scope = createScope({})

    expect(() =>
      httpHost.start({
        scope,
        manifest: manifest(
          undefined,
          manifestEntry("first", getLots, [route({ method: "GET", path: "/same" })]),
          manifestEntry("second", echoQuery, [route({ method: "GET", path: "/same" })])
        ),
      })
    ).toThrow('duplicate route GET /same: first, second')

    await scope.dispose()
  })
})
