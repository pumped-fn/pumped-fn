import { createScope, flow, tag, tags, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { tanstackStart } from "../src/index"

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

describe("TanStack Start helpers", () => {
  it("creates a request execution context through request middleware", async () => {
    const lite = tanstackStart.adapter()
    const scope = createScope({ extensions: [lite] })
    const closed: string[] = []
    const incoming = new Request("https://example.test/users", {
      headers: { "x-request-id": "request-a" },
    })
    const withRequest = lite.request({
      tags: (request) => [requestId(request.headers.get("x-request-id") ?? "missing")],
    })

    const result = await withRequest.options.server!({
      request: incoming,
      pathname: "/users",
      context: {},
      handlerType: "router",
      next: async (options: { context: tanstackStart.Context }) => {
        const { context } = options
        const execution = context.lite
        execution.onClose((result) => {
          closed.push(result.ok ? "ok" : "error")
        })

        return {
          request: incoming,
          pathname: "/users",
          context,
          response: new Response(await execution.exec({ flow: readRequest })),
        }
      },
    } as unknown as Parameters<NonNullable<typeof withRequest.options.server>>[0])

    if (result instanceof Response) throw new Error("expected TanStack request result")

    expect(await result.response.text()).toBe("request-a")
    expect(closed).toEqual(["ok"])
    await scope.dispose()
  })

  it("creates a child execution context through function middleware", async () => {
    const lite = tanstackStart.adapter()
    const scope = createScope({ extensions: [lite] })
    const parent = scope.createContext({ tags: [requestId("parent")] })
    const closed: string[] = []
    let childRequestId = ""
    let parentRequestId: unknown
    const controller = new AbortController()
    const withCall = lite.call({
      tags: () => [requestId("child")],
    })

    await withCall.options.server!({
      data: undefined,
      context: { lite: parent },
      method: "POST",
      serverFnMeta: {
        id: "server-fn",
        name: "serverFn",
        filename: "src/routes/index.tsx",
      },
      signal: controller.signal,
      next: async (options: { context: tanstackStart.Context }) => {
        const { context } = options
        const execution = context.lite
        execution.onClose((result) => {
          closed.push(result.ok ? "ok" : "error")
        })
        childRequestId = await execution.exec({ flow: readRequest })
        parentRequestId = await execution.parent!.exec({ flow: readRequest })

        return {
          "use functions must return the result of next()": true,
          "~types": {
            context,
            sendContext: undefined,
          },
          context,
          sendContext: undefined,
        }
      },
    } as unknown as Parameters<NonNullable<typeof withCall.options.server>>[0])

    expect(childRequestId).toBe("child")
    expect(parentRequestId).toBe("parent")
    expect(closed).toEqual(["ok"])
    await scope.dispose()
  })

  it("runs flows from server-function handlers and escape hatches", async () => {
    const lite = tanstackStart.adapter()
    const scope = createScope({ extensions: [lite] })
    const context = { lite: scope.createContext({ tags: [requestId("handler")] }) }
    const handleEcho = lite.handler(echo)

    expect(await handleEcho({ data: { message: "hello" }, context })).toEqual({
      message: "hello",
      requestId: "handler",
    })
    expect(await context.lite.exec({ flow: readRequest, tags: [requestId("override")] })).toBe("override")
    await scope.dispose()
  })
})
