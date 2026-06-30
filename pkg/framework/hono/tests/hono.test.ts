import { createScope, flow, tag, tags, typed } from "@pumped-fn/lite"
import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { hono } from "../src/index"

const requestId = tag<string>({ label: "request.id" })

const readRequest = flow({
  deps: { requestId: tags.required(requestId) },
  factory: (_ctx, deps) => deps.requestId,
})

const echo = flow({
  parse: typed<{ message: string }>(),
  deps: { requestId: tags.required(requestId) },
  factory: (ctx, deps) => ({
    message: ctx.input.message,
    requestId: deps.requestId,
  }),
})

describe("middleware", () => {
  it("creates one execution context per request", async () => {
    type BaseEnv = { Variables: { user: string } }
    type AppEnv = hono.Env<BaseEnv>

    const lite = hono.adapter()
    const scope = createScope({ extensions: [lite] })
    const closed: string[] = []
    const app = new Hono<AppEnv>()

    app.use(
      "*",
      lite.middleware<BaseEnv>({
        tags: (request) => [requestId(request.headers.get("x-request-id") ?? "missing")],
      })
    )
    app.use("*", async (context, next) => {
      context.var.lite.onClose((result) => {
        closed.push(result.ok ? "ok" : "error")
      })
      await next()
    })
    app.get("/id", async (context) =>
      context.json({ id: await context.var.lite.exec({ flow: readRequest }) })
    )
    app.get("/override", async (context) =>
      context.json({
        id: await context.var.lite.exec({ flow: readRequest, tags: [requestId("override")] }),
      })
    )
    app.post("/echo", async (context) => {
      const input = (await context.req.json()) as { message: string }
      return context.json(await context.var.lite.exec({ flow: echo, input }))
    })

    const first = await app.request("/id", {
      headers: { "x-request-id": "first" },
    })
    const second = await app.request("/id", {
      headers: { "x-request-id": "second" },
    })
    const override = await app.request("/override", {
      headers: { "x-request-id": "first" },
    })
    const echoed = await app.request("/echo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "echo",
      },
      body: JSON.stringify({ message: "hello" }),
    })

    expect(await first.json()).toEqual({ id: "first" })
    expect(await second.json()).toEqual({ id: "second" })
    expect(await override.json()).toEqual({ id: "override" })
    expect(await echoed.json()).toEqual({ message: "hello", requestId: "echo" })
    expect(closed).toEqual(["ok", "ok", "ok", "ok"])
    await scope.dispose()
  })
})
